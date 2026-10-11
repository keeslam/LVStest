import { dateInZone } from "@shared/office-timezone";
import { getOfficeTimeZone } from "./office-timezone";

/**
 * "Today" on the office calendar (the `office_timezone` setting, Europe/Amsterdam unless
 * changed in App-instellingen), as `yyyy-MM-dd`.
 *
 * `new Date().toISOString().split("T")[0]` is the date in UTC: between midnight
 * and 01:00 (winter) or 02:00 (summer) it still says yesterday. The server asks
 * the same question through `isoToday()` in server/services/lifecycle.ts; a form
 * that pre-fills "today" has to agree with it, or a handover just after midnight
 * is sent with yesterday's date.
 */
export function officeToday(): string {
  return officeDate(new Date());
}

/**
 * The day after the office's today, as `yyyy-MM-dd`.
 *
 * Counted on the calendar, from the office date string: adding a day to a
 * `Date` and reading it back in UTC makes "tomorrow" today just after midnight.
 */
export function officeTomorrow(): string {
  const [year, month, day] = officeToday().split("-").map(Number);
  // Noon UTC is the same calendar day in Amsterdam, whatever the clocks do.
  return officeDate(new Date(Date.UTC(year, month - 1, day + 1, 12)));
}

/** The office-zone calendar date of an instant, as `yyyy-MM-dd`. */
export function officeDate(instant: Date): string {
  return dateInZone(instant, getOfficeTimeZone());
}
