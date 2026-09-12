/**
 * besluiten.md **B-18** (BUG-192) — "altijd Nederlands met Nederlandse
 * notatie (dd-mm-jjjj, bedragen met een komma), ongeacht wie het document
 * genereert of welke taal de klant in het portaal gebruikt."
 *
 * Phase 36 found the decision taken and not implemented: one contract printed
 * `September 13, 2026`, `September 20, 2026` and `7 days` right next to
 * `12 september 2026` and `€ 1.234,50`. The transport report said "Vehicle
 * Swap" and "Tow" and printed `€0.00` with a point; the damage check mixed
 * `12-09-2026` (Dutch) with `12/09/2026` (en-GB).
 *
 * Every generated document formats through this module. There is deliberately
 * no locale parameter: the decision says the document is Dutch whoever asks
 * for it.
 */

const DUTCH_MONTHS = [
  'januari', 'februari', 'maart', 'april', 'mei', 'juni',
  'juli', 'augustus', 'september', 'oktober', 'november', 'december',
] as const;

export type DateLike = Date | string | number | null | undefined;

/**
 * A `Date` for anything the database or a request hands us, or null.
 *
 * A bare `YYYY-MM-DD` is read as a local date, not as UTC midnight: `new
 * Date("2026-09-13")` is midnight UTC, which is the previous day in every
 * timezone west of Greenwich and would print 12-09-2026 on a contract.
 */
export function toDate(value: DateLike): Date | null {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'number') {
    const fromNumber = new Date(value);
    return Number.isNaN(fromNumber.getTime()) ? null : fromNumber;
  }
  const text = String(value).trim();
  if (text === '') return null;
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (dateOnly) {
    return new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]));
  }
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** `dd-mm-jjjj`, the notation B-18 names. Empty string for a missing date. */
export function formatDateNL(value: DateLike): string {
  const date = toDate(value);
  if (!date) return '';
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  return `${dd}-${mm}-${date.getFullYear()}`;
}

/** `13 september 2026` — for the one-off "opgemaakt op" line on a document. */
export function formatLongDateNL(value: DateLike): string {
  const date = toDate(value);
  if (!date) return '';
  return `${date.getDate()} ${DUTCH_MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

/** `dd-mm-jjjj uu:mm`, 24-hour — never AM/PM. */
export function formatDateTimeNL(value: DateLike): string {
  const date = toDate(value);
  if (!date) return '';
  const hh = String(date.getHours()).padStart(2, '0');
  const mi = String(date.getMinutes()).padStart(2, '0');
  return `${formatDateNL(date)} ${hh}:${mi}`;
}

/** `13 september 2026 14:05` — the long form with a time. */
export function formatLongDateTimeNL(value: DateLike): string {
  const date = toDate(value);
  if (!date) return '';
  const hh = String(date.getHours()).padStart(2, '0');
  const mi = String(date.getMinutes()).padStart(2, '0');
  return `${formatLongDateNL(date)} ${hh}:${mi}`;
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const cleaned = String(value).replace(/[^\d.,-]/g, '').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.');
  const parsed = Number.parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

/** `1.234,5` — comma for the decimal, point for the thousands. */
export function formatNumberNL(value: unknown, decimals?: number): string {
  const numeric = toNumber(value);
  if (numeric === null) return '';
  return new Intl.NumberFormat('nl-NL', {
    minimumFractionDigits: decimals ?? 0,
    maximumFractionDigits: decimals ?? 20,
  }).format(numeric);
}

/**
 * `€ 1.234,50`. Note the space: that is what `nl-NL` produces (a non-breaking
 * space), and it is what the Dutch documents that were already right show.
 * An absent amount is an empty string, not `€ 0,00` — a document must not
 * claim a price that was never agreed.
 */
export function formatCurrencyNL(value: unknown): string {
  const numeric = toNumber(value);
  if (numeric === null) return '';
  return new Intl.NumberFormat('nl-NL', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(numeric);
}

/** `7 dagen` / `1 dag` — never "7 days". */
export function formatDaysNL(days: number): string {
  const whole = Math.max(0, Math.round(days));
  return `${whole} ${whole === 1 ? 'dag' : 'dagen'}`;
}

/** `120 km`, with Dutch number notation. */
export function formatKilometresNL(value: unknown): string {
  const numeric = toNumber(value);
  if (numeric === null) return '';
  return `${formatNumberNL(numeric)} km`;
}
