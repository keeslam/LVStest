/**
 * The rental day count and the total that follows from it.
 *
 * **Deliberately not a new rule.** This is the count the app has always used
 * when it fills in a price: `reservation-form.tsx` computes
 * `differenceInDays(end, start) + 1` — the start day counts — and multiplies it
 * by the vehicle's daily rate. The server needs the same arithmetic whenever it
 * moves a period itself (besluiten **B-16**: an early pickup shifts the start
 * date, and **B-07** says the total then follows from the period), and two
 * copies of a formula are how the audit's price disagreements started.
 *
 * **BUG-153 is still open**: whether invoicing counts days inclusively (the
 * report) or exclusively (the contract) is a business decision nobody has taken.
 * This module keeps the *existing* inclusive behaviour and decides nothing; when
 * BUG-153 is answered, this is the one place that changes.
 */

const MS_PER_DAY = 86_400_000;

/**
 * Whole rental days between two ISO days, the start day included.
 * `null` for an open-ended rental or an impossible range.
 */
export function rentalDays(startDate: string, endDate: string | null | undefined): number | null {
  if (!startDate || !endDate || endDate === "undefined") return null;
  const start = Date.parse(`${startDate}T00:00:00Z`);
  const end = Date.parse(`${endDate}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(end)) return null;
  const days = Math.round((end - start) / MS_PER_DAY) + 1;
  return days > 0 ? days : null;
}

/**
 * The total for a period at a daily rate, rounded to cents. `null` when there
 * is nothing to compute from — an open-ended rental, or a vehicle with no daily
 * rate on file — and the caller then leaves the stored total alone rather than
 * inventing one.
 */
export function recalculateTotalPrice(
  dailyPrice: string | number | null | undefined,
  startDate: string,
  endDate: string | null | undefined,
): number | null {
  const rate = typeof dailyPrice === "string" ? Number(dailyPrice) : dailyPrice;
  if (rate == null || !Number.isFinite(rate) || rate <= 0) return null;
  const days = rentalDays(startDate, endDate);
  if (days == null) return null;
  return Math.round(rate * days * 100) / 100;
}
