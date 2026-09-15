/**
 * Calendar dates for tests, in the same calendar the application uses.
 *
 * Twelve test files built their dates with `new Date(); d.setDate(...);
 * d.toISOString().split("T")[0]`. `toISOString()` converts to UTC, and the
 * office is at UTC+1 or UTC+2, so every date produced after 22:00 or 23:00
 * local time lands one day earlier than intended. A suite that is green during
 * the day then fails in the evening — which is exactly what happened: a Monday
 * start slid back to Sunday and the workshop's weekend guard refused it.
 *
 * These helpers read the local calendar day, which is the day the application,
 * the employee and the database all mean.
 */

/** `yyyy-MM-dd` for a Date, read from its local parts — never through UTC. */
export function isoDay(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** `offset` days from today, as a local calendar date. */
export function day(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return isoDay(d);
}

const isWeekendDay = (d: Date) => d.getDay() === 0 || d.getDay() === 6;

/** The first weekday at or after `offset` days from today. */
export function weekday(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  while (isWeekendDay(d)) d.setDate(d.getDate() + 1);
  return isoDay(d);
}

/** The nearest weekday at or before `offset` days from today. */
export function pastWeekday(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  while (isWeekendDay(d)) d.setDate(d.getDate() - 1);
  return isoDay(d);
}

/**
 * A start date at or after `offset` days from today for a block of `days`
 * working days that contains no weekend at all.
 *
 * The workshop is shut at weekends, so a test that books two days from a Friday
 * is testing the weekend guard, not the thing it set out to test.
 */
export function weekdayRun(offset: number, days: number): string {
  const start = new Date();
  start.setDate(start.getDate() + offset);
  for (let attempt = 0; attempt < 14; attempt += 1) {
    let clean = true;
    for (let i = 0; i < days; i += 1) {
      const probe = new Date(start);
      probe.setDate(probe.getDate() + i);
      if (isWeekendDay(probe)) { clean = false; break; }
    }
    if (clean) return isoDay(start);
    start.setDate(start.getDate() + 1);
  }
  throw new Error(`no run of ${days} weekdays found near offset ${offset}`);
}
