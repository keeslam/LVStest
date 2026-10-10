import { officeToday } from "@/lib/office-date";

/**
 * A-3-14 - whether a vehicle's APK (roadworthiness inspection) has run out.
 *
 * Compared as calendar days on the office clock: the APK date is a plain day
 * ("2026-02-27"), valid through that day, so it is expired from the next day.
 * Parsing it as an instant and comparing with "now" (what the reservation form
 * did) calls it expired during the afternoon of its own last valid day.
 */
export function isApkExpired(
  apkDate: string | null | undefined,
  today: string = officeToday(),
): boolean {
  if (!apkDate) return false;
  const day = String(apkDate).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  return day < today;
}
