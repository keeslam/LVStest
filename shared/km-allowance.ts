/**
 * Punt 1 (Kees, 2026-10-19) — extra kilometres at return.
 *
 * Free km per day and a price per extra km. The default is set per vehicle
 * type in Instellingen (app setting `km_allowance`); a single vehicle can
 * override either value (`vehicles.free_km_per_day`, `vehicles.extra_km_price`),
 * empty meaning "the type default". The row "other" covers vehicles without a
 * type or with a type that has no row of its own.
 *
 * The app only proposes the amount; the employee can change it, and the
 * invoice stays in the accounting package (D9). Fuel is entered by hand and a
 * late return is not charged (Kees, 2026-10-19).
 */
import { rentalDays } from "./rental-pricing";

export const KM_ALLOWANCE_KEY = "km_allowance";
export const INVALID_KM_ALLOWANCE_CODE = "INVALID_KM_ALLOWANCE";
export const KM_ALLOWANCE_OTHER = "other";

export interface KmRate {
  freeKmPerDay: number | null;
  pricePerKm: number | null;
}

export interface KmAllowanceSetting {
  byType: Record<string, KmRate>;
}

/** `SUV` → `suv`; empty → `other`. The stored types keep their capitals. */
export function vehicleTypeKey(type: string | null | undefined): string {
  const key = (type ?? "").trim().toLowerCase();
  return key || KM_ALLOWANCE_OTHER;
}

function num(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** Forgiving read of the stored setting; anything unreadable is left out. */
export function kmAllowanceFromSetting(value: unknown): KmAllowanceSetting {
  const byType: Record<string, KmRate> = {};
  const raw = value && typeof value === "object" ? (value as { byType?: unknown }).byType : null;
  if (raw && typeof raw === "object") {
    for (const [type, rate] of Object.entries(raw as Record<string, unknown>)) {
      if (!rate || typeof rate !== "object") continue;
      const r = rate as { freeKmPerDay?: unknown; pricePerKm?: unknown };
      byType[vehicleTypeKey(type)] = { freeKmPerDay: num(r.freeKmPerDay), pricePerKm: num(r.pricePerKm) };
    }
  }
  return { byType };
}

/** The server stores only `{ byType: { <type>: { freeKmPerDay, pricePerKm } } }` with non-negative numbers or null. */
export function isValidKmAllowance(value: unknown): value is KmAllowanceSetting {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const byType = (value as { byType?: unknown }).byType;
  if (!byType || typeof byType !== "object" || Array.isArray(byType)) return false;
  const ok = (v: unknown) => v === null || (typeof v === "number" && Number.isFinite(v) && v >= 0 && v < 1_000_000);
  return Object.entries(byType as Record<string, unknown>).every(([type, rate]) =>
    type.length > 0 && type.length <= 50 && !!rate && typeof rate === "object" && !Array.isArray(rate)
    && ok((rate as KmRate).freeKmPerDay ?? null) && ok((rate as KmRate).pricePerKm ?? null));
}

type VehicleLike = { vehicleType?: string | null; freeKmPerDay?: number | null; extraKmPrice?: string | number | null };

/** Each value on its own: the vehicle's, else its type's, else the "other" row, else none. */
export function kmRateForVehicle(vehicle: VehicleLike | null | undefined, setting: KmAllowanceSetting): KmRate {
  const typeRate = setting.byType[vehicleTypeKey(vehicle?.vehicleType)];
  const otherRate = setting.byType[KM_ALLOWANCE_OTHER];
  const pick = (own: unknown, field: keyof KmRate) => num(own) ?? typeRate?.[field] ?? otherRate?.[field] ?? null;
  return {
    freeKmPerDay: pick(vehicle?.freeKmPerDay, "freeKmPerDay"),
    pricePerKm: pick(vehicle?.extraKmPrice, "pricePerKm"),
  };
}

export interface ExtraKmSettlement {
  days: number;
  driven: number;
  freeKm: number;
  extraKm: number;
  /** Rounded to cents. */
  cost: number;
}

/**
 * Driven km above `days × freeKmPerDay`, times the price. `days` counts from
 * the pickup day up to and including the return day, the way the rental
 * price counts days (shared/rental-pricing.ts). Null when something is
 * missing: no free km or price set, no readings, or no period.
 */
export function extraKmSettlement(input: {
  pickupDate: string | null | undefined;
  returnDate: string | null | undefined;
  pickupMileage: number | null | undefined;
  returnMileage: number | null | undefined;
  rate: KmRate;
}): ExtraKmSettlement | null {
  const { rate } = input;
  if (rate.freeKmPerDay == null || rate.pricePerKm == null) return null;
  if (input.pickupMileage == null || input.returnMileage == null) return null;
  if (!input.pickupDate) return null;
  const days = rentalDays(input.pickupDate, input.returnDate);
  if (days == null) return null;
  const driven = Math.max(0, input.returnMileage - input.pickupMileage);
  const freeKm = days * rate.freeKmPerDay;
  const extraKm = Math.max(0, driven - freeKm);
  return { days, driven, freeKm, extraKm, cost: Math.round(extraKm * rate.pricePerKm * 100) / 100 };
}

export interface ReturnExtraCosts {
  fuelCost: number | null;
  extraKm: number | null;
  extraKmCost: number | null;
}

/**
 * The extra costs the return dialog sends: empty means "nothing", a value must
 * be a non-negative number (amounts in euros, km whole). Returns the field
 * that is wrong instead of throwing, so the route can answer 400 with it.
 */
export function parseReturnExtraCosts(body: Record<string, unknown> | null | undefined):
  { ok: true; value: ReturnExtraCosts } | { ok: false; field: keyof ReturnExtraCosts } {
  const read = (v: unknown, whole: boolean): number | null | undefined => {
    if (v === null || v === undefined || v === "") return null;
    const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.replace(",", ".")) : NaN;
    if (!Number.isFinite(n) || n < 0 || n >= 1_000_000 || (whole && !Number.isInteger(n))) return undefined;
    return whole ? n : Math.round(n * 100) / 100;
  };
  const fuelCost = read(body?.fuelCost, false);
  if (fuelCost === undefined) return { ok: false, field: "fuelCost" };
  const extraKm = read(body?.extraKm, true);
  if (extraKm === undefined) return { ok: false, field: "extraKm" };
  const extraKmCost = read(body?.extraKmCost, false);
  if (extraKmCost === undefined) return { ok: false, field: "extraKmCost" };
  return { ok: true, value: { fuelCost, extraKm, extraKmCost } };
}
