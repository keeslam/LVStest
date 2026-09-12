/**
 * FIX-Q (BUG-201) — formatting a date must never take a page down.
 *
 * `date-fns`' `format()` throws `RangeError: Invalid time value` when it is
 * handed an unparseable date, and `parseISO('undefined')` produces exactly
 * that. One reservation row with a broken `startDate` therefore threw during
 * render, and with no error boundary anywhere in the tree React unmounted the
 * whole reservations page — a white screen, every time that row was in range.
 *
 * `safeFormatDate` is the one call that cannot throw: bad input renders as an
 * en dash. It keeps the caller's pattern as-is; *which* pattern and which
 * language a screen should use is BUG-223 (see `format-date-nl.ts`), a
 * separate change.
 *
 * Dependency-free apart from date-fns, so it is unit-testable without a DOM.
 */
import { format, parseISO, isValid } from "date-fns";

/** What a date that cannot be read renders as. Never "Invalid date". */
export const EMPTY_DATE = "–";

export function toSafeDate(value: string | number | Date | null | undefined): Date | null {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) return isValid(value) ? value : null;
  if (typeof value === "number") {
    const fromNumber = new Date(value);
    return isValid(fromNumber) ? fromNumber : null;
  }
  // Anything that is not a string reaches `parseISO` as a non-string and makes
  // it throw (`dateString.split is not a function`), which is the same crash
  // by another route — so only strings go through it.
  if (typeof value !== "string") {
    const loose = new Date(value as any);
    return isValid(loose) ? loose : null;
  }
  const parsed = parseISO(value);
  if (isValid(parsed)) return parsed;
  const loose = new Date(value);
  return isValid(loose) ? loose : null;
}

/**
 * Formats `value` with `pattern`, or returns `fallback` when the value cannot
 * be read. Never throws, for any input.
 */
export function safeFormatDate(
  value: string | number | Date | null | undefined,
  pattern = "PP",
  fallback: string = EMPTY_DATE,
): string {
  const date = toSafeDate(value);
  if (!date) return fallback;
  try {
    return format(date, pattern);
  } catch {
    return fallback;
  }
}
