/**
 * Punt 9 (Kees, 2026-10-19) — is the driver's licence still valid?
 *
 * One rule for the booking form, the pickup, the portal and the dashboard tile:
 *  - the licence is measured on ONE day: the start of the rental when booking,
 *    the pickup day when the car leaves. A licence that runs out during the
 *    rental is deliberately not warned about ("Nee", 2026-10-19);
 *  - the expiry day itself still counts as valid;
 *  - no readable date is "unknown": a quiet note, never a refusal.
 *
 * `drivers.license_expiry` is free text (the staff form and the portal both use
 * a date picker, but older rows and imports may hold `1-3-2027`), so the day is
 * read leniently and anything that is not a real calendar day is "unknown".
 */

export type LicenseState = "valid" | "expired" | "unknown";

/** The 409 the pickup answers when an expired licence was not confirmed as checked. */
export const DRIVER_LICENSE_EXPIRED_CODE = "DRIVER_LICENSE_EXPIRED" as const;

/** Days ahead the dashboard tile looks. */
export const LICENSE_TILE_DAYS = 30;

function isRealDay(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1) return false;
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return d <= last;
}

function iso(y: number, m: number, d: number): string {
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** `2027-03-01`, `1-3-2027` or `01/03/2027` → `2027-03-01`; anything else → null. */
export function licenseExpiryDay(raw: string | null | undefined): string | null {
  const text = (raw ?? "").trim();
  if (!text) return null;
  let match = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (match) {
    const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
    return isRealDay(y, m, d) ? iso(y, m, d) : null;
  }
  match = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(text);
  if (match) {
    const [d, m, y] = [Number(match[1]), Number(match[2]), Number(match[3])];
    return isRealDay(y, m, d) ? iso(y, m, d) : null;
  }
  return null;
}

/** The licence on `day` (yyyy-MM-dd). */
export function licenseStateOn(raw: string | null | undefined, day: string | null | undefined): LicenseState {
  const expiry = licenseExpiryDay(raw);
  if (!expiry || !day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return "unknown";
  return expiry < day ? "expired" : "valid";
}

function plusDays(day: string, days: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** For the dashboard tile: already expired, or expiring within `days` of `today`. */
export function licenseExpiresWithin(raw: string | null | undefined, today: string, days: number): boolean {
  const expiry = licenseExpiryDay(raw);
  if (!expiry) return false;
  return expiry <= plusDays(today, days);
}
