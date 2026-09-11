/**
 * FIX-S (BUG-223) — one place that knows how a date is written on screen.
 *
 * The Dutch UI was showing American dates: "Sep 11, 2026", "Aug 11, 2026 -
 * Sep 10, 2026", "Uploaded: Sep 11, 2026, 12:54 AM". In a rental
 * administration that is not cosmetic — month-before-day genuinely misreads a
 * pickup date, and "01 Oct 26" versus "1 okt 2026" is the difference between
 * confident and hesitant staff. Every `date-fns` `format()` call in the app was
 * made without a locale, so it fell back to `en-US`.
 *
 * This module is the shared wrapper: it applies the Dutch locale, and it never
 * throws on bad input — an unparseable date renders as an en dash instead of
 * `Invalid date` or a white screen.
 *
 * **Scope note.** BUG-223 covers the *screen*. What language and format a
 * generated document uses is BUG-192, a business decision the owner has not
 * made yet, so nothing here is wired into the PDF generators.
 */
import { format, parseISO, isValid } from "date-fns";
import { nl } from "date-fns/locale";

/** What a date that cannot be read renders as. Never "Invalid date". */
export const EMPTY_DATE = "–";

/** The house patterns, so a screen does not invent its own. */
export const DATE_PATTERNS = {
  /** 9 maart 2026 */
  long: "d MMMM yyyy",
  /** 9 mrt 2026 */
  medium: "d MMM yyyy",
  /** 09-03-2026 */
  short: "dd-MM-yyyy",
  /** 9 maart 2026 om 14:05 */
  dateTime: "d MMMM yyyy 'om' HH:mm",
} as const;

export type DatePatternKey = keyof typeof DATE_PATTERNS;

function toDate(value: string | Date | number | null | undefined): Date | null {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) return isValid(value) ? value : null;
  if (typeof value === "number") {
    const d = new Date(value);
    return isValid(d) ? d : null;
  }
  // `parseISO` handles the yyyy-MM-dd the API returns; fall back to Date for
  // the timestamps that carry a time zone suffix.
  const parsed = parseISO(value);
  if (isValid(parsed)) return parsed;
  const loose = new Date(value);
  return isValid(loose) ? loose : null;
}

/**
 * Formats a date in Dutch. `pattern` is one of the house patterns, or a raw
 * `date-fns` pattern for the rare screen that needs its own.
 */
export function formatDateNl(
  value: string | Date | number | null | undefined,
  pattern: DatePatternKey | string = "long",
): string {
  const date = toDate(value);
  if (!date) return EMPTY_DATE;
  const resolved = (DATE_PATTERNS as Record<string, string>)[pattern] ?? pattern;
  try {
    return format(date, resolved, { locale: nl });
  } catch {
    return EMPTY_DATE;
  }
}

/** "9 maart 2026 om 14:05" — for upload times and audit lines. */
export function formatDateTimeNl(value: string | Date | number | null | undefined): string {
  return formatDateNl(value, "dateTime");
}

/** "9 mrt 2026 – 10 apr 2026", with the same empty-value behaviour. */
export function formatDateRangeNl(
  from: string | Date | number | null | undefined,
  to: string | Date | number | null | undefined,
  pattern: DatePatternKey | string = "medium",
): string {
  return `${formatDateNl(from, pattern)} – ${formatDateNl(to, pattern)}`;
}
