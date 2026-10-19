/**
 * Punt 1 (Kees, 2026-10-19) — a vehicle's own free km per day and price per
 * extra km, as the vehicle form sends them. Empty means "use the vehicle type
 * default" (null). A value that is not a non-negative number is also stored
 * as null rather than refused: the fields are optional and the type default
 * then applies, which the vehicle form shows.
 */
export function normalizeKmOverrides(data: Record<string, any>): void {
  if ("freeKmPerDay" in data) {
    const raw = data.freeKmPerDay;
    const n = raw === "" || raw === null || raw === undefined ? NaN : Number(String(raw).replace(",", "."));
    data.freeKmPerDay = Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
  }
  if ("extraKmPrice" in data) {
    const raw = data.extraKmPrice;
    const n = raw === "" || raw === null || raw === undefined ? NaN : Number(String(raw).replace(",", "."));
    data.extraKmPrice = Number.isFinite(n) && n >= 0 ? String(Math.round(n * 1000) / 1000) : null;
  }
}
