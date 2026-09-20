import { addDays, format, isValid, parseISO } from "date-fns";

/**
 * The end date a reservation form proposes: the start date plus `days`, as
 * `yyyy-MM-dd`. Returns "" when the start date cannot be read.
 *
 * A native date input hands over "" the moment someone empties it (Chrome's
 * "Wissen" button, Backspace on a segment) and accepts years of five digits
 * and more. The reservation form used to compute
 * `format(addDays(parseISO(startDate), 3))` during render; date-fns' `format`
 * throws `RangeError: Invalid time value` on an unreadable date, which took
 * the whole reservations page down to its error boundary. Nothing to suggest
 * is the honest answer for a start date that is not there yet.
 *
 * Strict on purpose: only the `yyyy-MM-dd` a date input produces counts.
 */
export function suggestEndDate(startDate: string | null | undefined, days = 3): string {
  if (typeof startDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return "";
  const start = parseISO(startDate);
  if (!isValid(start)) return "";
  return format(addDays(start, days), "yyyy-MM-dd");
}
