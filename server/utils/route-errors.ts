/**
 * FIX-D / FIX-AA — one error envelope for every route (BUG-148 and the
 * `error: error.message` echoes the audit counted across routes.ts).
 *
 * Three shapes used to leave this server:
 *
 *   `{ message, error: err.message }`      — the Postgres message verbatim
 *                                            ("invalid input syntax for type
 *                                            integer", constraint names, the
 *                                            row id from `detail`)
 *   `{ message, error: err }`              — the whole pg error object, with
 *                                            `schema`, `table`, `constraint`,
 *                                            `file` and `line`
 *   `{ message, error: zodError.errors }`  — zod internals rather than fields
 *
 * What goes out now is always one of:
 *
 *   400 `{ message, errors: [{ field, message }] }`   — the body did not fit
 *   404/409 `{ message, field? }`                     — a recognised constraint
 *   500 `{ message }`                                 — anything else, logged
 *
 * Never a stack, never a constraint name, never driver text.
 */
import type { Response } from "express";
import { z } from "zod";
import { BodyValidationError } from "../middleware/validateBody";
import { BookingConflictError } from "../services/bookability";
import { StateTransitionError, WorkshopBlockedError } from "../services/lifecycle";
import { describeDbError, dbErrorBody } from "./db-errors";

/** A route-thrown error that already knows its status and safe message. */
export class HttpError extends Error {
  readonly status: number;
  readonly field?: string;
  readonly code?: string;

  constructor(status: number, message: string, options: { field?: string; code?: string } = {}) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.field = options.field;
    this.code = options.code;
  }
}

function zodBody(error: z.ZodError, message: string): Record<string, unknown> {
  return {
    message,
    errors: error.errors.map((e) => ({ field: e.path.join(".") || "(body)", message: e.message })),
  };
}

/**
 * Answers `res` for `error`. Returns the status it sent, so a caller can log.
 * `fallbackMessage` is used only for the unrecognised 500 case.
 */
export function sendRouteError(res: Response, error: unknown, fallbackMessage: string): number {
  if (error instanceof BodyValidationError) {
    res.status(error.status).json(error.toBody());
    return error.status;
  }
  if (error instanceof z.ZodError) {
    res.status(400).json(zodBody(error, fallbackMessage));
    return 400;
  }
  // FIX-F — a write the bookability predicate refused. 409 (or 404 when the
  // vehicle itself is gone), with the conflicting rows the booking screens
  // already know how to show, and never a 500.
  if (error instanceof BookingConflictError) {
    res.status(error.status).json(error.toBody());
    return error.status;
  }
  // FIX-H — a write the state machine refused: an unknown enum value or an
  // illegal jump (400), or a handover blocked by the workshop (409, besluiten
  // B-03). Both used to surface as a 200 that persisted nonsense, or a 500.
  if (error instanceof StateTransitionError) {
    res.status(error.status).json(error.toBody());
    return error.status;
  }
  if (error instanceof WorkshopBlockedError) {
    res.status(error.status).json(error.toBody());
    return error.status;
  }
  if (error instanceof HttpError) {
    const body: Record<string, unknown> = { message: error.message };
    if (error.field) body.field = error.field;
    if (error.code) body.code = error.code;
    res.status(error.status).json(body);
    return error.status;
  }
  const described = describeDbError(error, fallbackMessage);
  if (!described.recognised) {
    // Only the generic message reaches the client; the detail stays in the log.
    console.error(`[route-error] ${fallbackMessage}:`, error);
  }
  res.status(described.status).json(dbErrorBody(described));
  return described.status;
}
