/**
 * Kees, 2026-10-21 — a staff member's own signature, set in Profiel (drawn or uploaded,
 * always stored as a PNG data URL) and printed in the "Handtekening verhuurder" box of
 * the contracts they generate. Kept in user_settings under STAFF_SIGNATURE_KEY.
 */
export const STAFF_SIGNATURE_KEY = "signature";
export const MAX_STAFF_SIGNATURE_BYTES = 300 * 1024;

const PNG_DATA_URL = /^data:image\/png;base64,[A-Za-z0-9+/=]+$/;

export function isValidStaffSignature(value: unknown): value is { png: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const png = (value as { png?: unknown }).png;
  return typeof png === "string" && PNG_DATA_URL.test(png) && png.length <= Math.ceil((MAX_STAFF_SIGNATURE_BYTES * 4) / 3) + 32 && png.length > 300;
}
