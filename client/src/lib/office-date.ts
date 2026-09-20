/**
 * "Today" on the office calendar (Europe/Amsterdam), as `yyyy-MM-dd`.
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

/** The Europe/Amsterdam calendar date of an instant, as `yyyy-MM-dd`. */
export function officeDate(instant: Date): string {
  // `en-CA` renders as yyyy-MM-dd, which is exactly the shape the API stores.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Amsterdam",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}
