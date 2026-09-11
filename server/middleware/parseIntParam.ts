/**
 * FIX-E — `:id` parameter validation (BUG-103, BUG-088, BUG-089).
 *
 * The audit counted ~143 bare `parseInt(req.params.id)` calls against three
 * duplicated, slightly different id helpers. Where a helper was missing, `NaN`
 * travelled all the way into a `WHERE id = $1` and Postgres answered
 * `invalid input syntax for type integer`, which the route's catch-all turned
 * into a **500**. BUG-103 reproduced that on 19 GET endpoints with `abc`,
 * `%00` and a 5 000-digit id.
 *
 * One parser, one answer: anything that is not a plain positive integer that
 * fits a Postgres `integer` is a **400** before the handler (and before multer)
 * ever runs.
 *
 * Mounted through Express' `param()` hook rather than by editing 143 call
 * sites: `router.param(name, cb)` fires for every route on that router that
 * carries the parameter, *before* the route's own middleware stack, so a bad id
 * can never reach a body parser, a file upload or the storage layer. The
 * existing per-route `isNaN` checks stay where they are — they are now dead
 * code on the happy path, and removing 143 of them would make this wave's diff
 * unreviewable (plan §1.3).
 */
import type { NextFunction, Request, RequestHandler, Response } from "express";

/**
 * Route parameters that are always a database id. Everything else a route may
 * carry in its path — `:key`, `:filename`, `:token`, `:licensePlate`,
 * `:contractNumber`, `:category`, `:type`, `:startDate`, `:endDate`, `:code`,
 * `:proposedNumber` — is deliberately *not* here: those are legitimately
 * non-numeric (plan §3 FIX-E, "the only trap is a route whose `:id` is
 * legitimately non-numeric").
 */
export const NUMERIC_ID_PARAMS = [
  "id",
  "vehicleId",
  "customerId",
  "reservationId",
  "backgroundId",
  "attachmentId",
] as const;

/** Largest value a Postgres `integer` column holds. */
export const MAX_INT4 = 2147483647;

/**
 * Parses one path parameter as a positive `integer` id.
 *
 * Returns `null` — never `NaN` — for: the empty string, a sign, whitespace,
 * decimals, exponent notation, a null byte (`1%00` decodes to `"1\0"`),
 * anything with a non-digit in it, `0`, and anything above `MAX_INT4`
 * (including the 21-digit id from the fuzz list, which `parseInt` happily
 * turns into `1e21`).
 */
export function parseIdValue(raw: unknown): number | null {
  if (typeof raw !== "string") return null;
  // 10 digits is the widest an int4 can be; the length check also keeps the
  // regex away from a 5 000-character input.
  if (raw.length === 0 || raw.length > 10) return null;
  if (!/^[0-9]+$/.test(raw)) return null;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1 || value > MAX_INT4) return null;
  return value;
}

/** The 400 every rejected id gets. No stack, no database text. */
export function invalidIdBody(name: string): Record<string, unknown> {
  return { message: `Invalid ${name}`, field: name };
}

/**
 * Explicit middleware form, for a route that wants to be obviously guarded at
 * the call site (and for parameters outside `NUMERIC_ID_PARAMS`).
 */
export function parseIntParam(name = "id"): RequestHandler {
  return function parseIntParamMiddleware(req: Request, res: Response, next: NextFunction) {
    if (parseIdValue(req.params[name]) === null) {
      res.status(400).json(invalidIdBody(name));
      return;
    }
    next();
  };
}

/**
 * BUG-103's second payload. A `%00` anywhere in the path decodes to a real NUL,
 * which Postgres refuses for *any* column type — so it turned the string-keyed
 * lookups (`:category`, `:key`, `:code`, `:type`, `:contractNumber`) into 500s
 * exactly like the numeric ones. A NUL in a URL path is never legitimate;
 * refusing it once, early, covers every route at the same time.
 *
 * Deliberately scoped to the path: the query string is left to the handlers.
 */
export function rejectNullBytesInPath(req: Request, res: Response, next: NextFunction): void {
  const path = req.url.split("?", 1)[0];
  if (/%00/i.test(path) || path.includes("\0")) {
    res.status(400).json({ message: "Invalid characters in URL" });
    return;
  }
  next();
}

interface ParamHost {
  param(name: string, handler: (req: Request, res: Response, next: NextFunction, value: string) => void): unknown;
}

/**
 * Installs the check for every name in `NUMERIC_ID_PARAMS` on one app or
 * router. Express param callbacks do not inherit across a `app.use(path,
 * router)` mount, so every router that owns `:id` routes calls this itself.
 */
export function installIdParamValidation(target: ParamHost): void {
  for (const name of NUMERIC_ID_PARAMS) {
    target.param(name, function validateIdParam(req, res, next, value) {
      if (parseIdValue(value) === null) {
        res.status(400).json(invalidIdBody(name));
        return;
      }
      next();
    });
  }
}
