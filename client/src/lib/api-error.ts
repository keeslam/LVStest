/**
 * One place that turns a failed API call into a sentence a user can read
 * (A-19-5, A-17-3; audit 2026-10-09 module 19). `throwIfResNotOk` throws an
 * Error whose `message` is the server's English text or, when the body had no
 * string `message`, the raw "500: {...}". Screens used to put that straight in
 * a toast. The server's text stays English by rule; the client speaks by the
 * stable `code`, then by HTTP status, and never shows the wire text.
 */
import i18n from "@/i18n";
import { RequestTimeoutError } from "./request-policy";

/**
 * An error thrown by the client itself whose message is already a sentence for
 * the user in the current language (a missing field, a refused step). It is
 * the one kind of error whose text may be shown as it is.
 */
export class UserFacingError extends Error {
  readonly userFacing = true;
  constructor(message: string) {
    super(message);
    this.name = "UserFacingError";
  }
}

export interface ParsedApiError {
  /** HTTP status when the error came from a response, else null. */
  status: number | null;
  /** The server's stable `code`, when it sent one. */
  code: string | null;
  /** The server's own text. Only for logging or diagnostics: never shown to a user. */
  message: string | null;
  /** The request hit the client-side deadline. */
  timedOut: boolean;
}

type Translate = (key: string, options?: Record<string, unknown>) => string;

const STATUS_PREFIX = /^(\d{3}):\s*/;

function tryJson(text: string): Record<string, unknown> | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith("{")) return null;
  try {
    const value = JSON.parse(trimmed);
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function parseApiError(error: unknown): ParsedApiError {
  if (error instanceof RequestTimeoutError) {
    return { status: null, code: "REQUEST_TIMEOUT", message: error.message, timedOut: true };
  }
  if (!error || typeof error !== "object") {
    return { status: null, code: null, message: typeof error === "string" ? error : null, timedOut: false };
  }
  const e = error as { message?: unknown; code?: unknown; httpStatus?: unknown };
  let text = typeof e.message === "string" ? e.message : "";
  let status = typeof e.httpStatus === "number" ? e.httpStatus : null;
  const prefixed = text.match(STATUS_PREFIX);
  if (prefixed) {
    if (status === null) status = Number(prefixed[1]);
    text = text.slice(prefixed[0].length);
  }
  // A body without a string `message` leaves the raw JSON in the text: dig the
  // fields out of it so a `code` or `message` inside is still found.
  const body = tryJson(text);
  let code = typeof e.code === "string" ? e.code : null;
  let message: string | null = text || null;
  if (body) {
    if (!code && typeof body.code === "string") code = body.code;
    message = typeof body.message === "string" ? body.message : typeof body.error === "string" ? body.error : null;
  }
  return { status, code, message, timedOut: false };
}

function lookup(t: Translate, key: string): string | null {
  const text = t(`common:${key}`, { defaultValue: "" });
  return text && text !== key ? text : null;
}

// Statuses whose generic sentence says more than any caller's "could not save".
const REFUSAL_STATUSES = new Set([401, 403, 413, 429]);

/**
 * The sentence for a failed call, in the current language.
 *
 * Order: a known `code` (common.json `errors.codes.<CODE>`), a timeout or a
 * dropped connection, a status that is a refusal (401/403/413/429), the
 * caller's own `fallback` (the screen knows what it was doing), then the
 * generic sentence for the status.
 */
export function describeApiError(error: unknown, t?: Translate, fallback?: string): string {
  const translate: Translate = t ?? ((key, options) => String(i18n.t(key, options as never)));
  if (error instanceof UserFacingError) return error.message;
  const { status, code, timedOut } = parseApiError(error);

  if (code) {
    const known = lookup(translate, `errors.codes.${code}`);
    if (known) return known;
  }
  if (timedOut) return lookup(translate, "errors.timeout") ?? "";
  if (status === null) {
    // fetch() rejects with a TypeError when the server cannot be reached.
    if (error instanceof TypeError) return lookup(translate, "errors.network") ?? "";
    return fallback ?? lookup(translate, "errors.status.default") ?? "";
  }
  if (!REFUSAL_STATUSES.has(status) && fallback) return fallback;
  return lookup(translate, `errors.status.${status}`) ?? fallback ?? lookup(translate, "errors.status.default") ?? "";
}
