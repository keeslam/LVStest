/**
 * The one place that counts days and months for the fiscal check.
 *
 * Dates are `yyyy-MM-dd` strings, as everywhere else in the API. Arithmetic is
 * done in UTC on the calendar date alone, so the machine's time zone never
 * moves a boundary. Calendar days are inclusive of both the first and the
 * last day; a month is a calendar month.
 */

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;

export interface MonthSpan {
  /** `yyyy-MM` */
  month: string;
  firstDay: string;
  lastDay: string;
  /** Days of the period that fall in this month. */
  days: number;
  daysInMonth: number;
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function parts(iso: string): [number, number, number] {
  const m = ISO_DATE.exec(iso);
  if (!m) throw new Error(`Geen geldige datum: ${iso}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function toUtc(iso: string): number {
  const [y, m, d] = parts(iso);
  return Date.UTC(y, m - 1, d);
}

function fromUtc(ms: number): string {
  const dt = new Date(ms);
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function isValidIsoDate(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const m = ISO_DATE.exec(value);
  if (!m) return false;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12) return false;
  return day >= 1 && day <= daysInMonth(year, month);
}

export function addDays(iso: string, days: number): string {
  return fromUtc(toUtc(iso) + days * DAY_MS);
}

/** Both ends count: the same day twice is one day. */
export function calendarDaysInclusive(start: string, end: string): number {
  return Math.round((toUtc(end) - toUtc(start)) / DAY_MS) + 1;
}

export function compareIso(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function yearOf(iso: string): number {
  return parts(iso)[0];
}

export function monthKey(iso: string): string {
  const [y, m] = parts(iso);
  return `${y}-${pad(m)}`;
}

export function monthStart(iso: string): string {
  return `${monthKey(iso)}-01`;
}

/** The last day of the month the date falls in. */
export function monthEnd(iso: string): string {
  const [y, m] = parts(iso);
  return `${monthKey(iso)}-${pad(daysInMonth(y, m))}`;
}

export function yearStart(iso: string): string {
  return `${yearOf(iso)}-01-01`;
}

/** The calendar months a period touches, in order, with the period's days in each. */
export function monthsTouched(start: string, end: string): MonthSpan[] {
  const spans: MonthSpan[] = [];
  let cursor = start;
  while (compareIso(cursor, end) <= 0) {
    const [y, m] = parts(cursor);
    const dim = daysInMonth(y, m);
    const monthEnd = `${y}-${pad(m)}-${pad(dim)}`;
    const last = compareIso(monthEnd, end) <= 0 ? monthEnd : end;
    spans.push({
      month: `${y}-${pad(m)}`,
      firstDay: cursor,
      lastDay: last,
      days: calendarDaysInclusive(cursor, last),
      daysInMonth: dim,
    });
    cursor = addDays(last, 1);
  }
  return spans;
}

/** Every day of a period, first to last. */
export function eachDay(start: string, end: string): string[] {
  const days: string[] = [];
  let cursor = start;
  while (compareIso(cursor, end) <= 0) {
    days.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return days;
}

/** Full years between two dates; the anniversary itself counts as a year older. */
export function ageInFullYears(from: string, at: string): number {
  const [fy, fm, fd] = parts(from);
  const [ay, am, ad] = parts(at);
  let age = ay - fy;
  if (am < fm || (am === fm && ad < fd)) age -= 1;
  return age;
}

export function daysInYear(year: number): number {
  return daysInMonth(year, 2) === 29 ? 366 : 365;
}
