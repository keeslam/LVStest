/**
 * Kees, 2026-10-21 — the deductible (eigen risico) per customer, domestic and abroad.
 *
 * Kees, 2026-10-28 — there are only two kinds of deductible: car ("auto") and bus. Each
 * vehicle says which one it is on its card (`vehicles.deductible_group`, "car" / "bus");
 * left empty, the group follows from the vehicle type (autoDeductibleGroup). The general
 * amounts live in Bedrijfsregels: car `eigenrisicoBinnenland` / `eigenrisicoBuitenland`
 * (default 750 / 1500), bus `eigenrisicoBusBinnenland` / `eigenrisicoBusBuitenland`
 * (default 1500 / 2500).
 *
 * A customer's own amounts are stored as `{ byGroup: { car, bus } }`. Customers saved
 * before 2026-10-28 have `{ byType: { <type key>: { domestic, abroad } } }`; those are read
 * as groups (the highest amount of the types in a group) until the card is saved again.
 * An amount left empty falls back to the general amount for the group.
 */
import { vehicleTypeKey } from "./km-allowance";

export interface DeductiblePair {
  domestic?: number | null;
  abroad?: number | null;
}

export const DEDUCTIBLE_GROUPS = ["car", "bus"] as const;
export type DeductibleGroup = (typeof DEDUCTIBLE_GROUPS)[number];

export interface CustomerDeductibles {
  byGroup?: Partial<Record<DeductibleGroup, DeductiblePair>>;
  /** Before 2026-10-28: per vehicle type. Read only. */
  byType?: Record<string, DeductiblePair>;
}

/** What the contract needs of the vehicle: its type, and the group set on its card. */
export interface DeductibleVehicle {
  vehicleType?: string | null;
  deductibleGroup?: string | null;
}

/** The general amounts per group when Bedrijfsregels were never saved. */
export const DEFAULT_GROUP_DEDUCTIBLES: Record<DeductibleGroup, { domestic: string; abroad: string }> = {
  car: { domestic: "750", abroad: "1500" },
  bus: { domestic: "1500", abroad: "2500" },
};

const amountOk = (v: unknown) => v === null || v === undefined || (typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1_000_000);
const pairOk = (pair: unknown) =>
  !!pair && typeof pair === "object" && !Array.isArray(pair)
  && amountOk((pair as DeductiblePair).domestic) && amountOk((pair as DeductiblePair).abroad);
const isPlainObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

export function isValidCustomerDeductibles(value: unknown): value is CustomerDeductibles | null {
  if (value === null) return true;
  if (!isPlainObject(value)) return false;
  const { byGroup, byType } = value as { byGroup?: unknown; byType?: unknown };
  if (byGroup === undefined && byType === undefined) return false;
  if (byGroup !== undefined) {
    if (!isPlainObject(byGroup)) return false;
    if (!Object.entries(byGroup).every(([key, pair]) => isDeductibleGroup(key) && pairOk(pair))) return false;
  }
  if (byType !== undefined) {
    if (!isPlainObject(byType)) return false;
    const entries = Object.entries(byType);
    if (entries.length > 100) return false;
    if (!entries.every(([key, pair]) => key.length > 0 && key.length <= 50 && pairOk(pair))) return false;
  }
  return true;
}

export function isDeductibleGroup(value: unknown): value is DeductibleGroup {
  return typeof value === "string" && (DEDUCTIBLE_GROUPS as readonly string[]).includes(value);
}

/**
 * The group a vehicle type falls in when its card does not say: a bus for a van, truck,
 * bus or delivery vehicle ("Van", "bestelauto", "bestelbus", "be truck", "Transporter") and
 * for a people carrier with eight or more seats ("8 sitter", "9 zitter"); a car otherwise.
 */
export function autoDeductibleGroup(vehicleType: string | null | undefined): DeductibleGroup {
  const key = vehicleTypeKey(vehicleType);
  if (/\b(van|truck|transporter)\b|bus\b|bestel/.test(key)) return "bus";
  const seats = key.match(/(\d+)\s*-?\s*(zit|sit)/);
  if (seats && Number(seats[1]) >= 8) return "bus";
  return "car";
}

/** The vehicle's group: the one set on its card, else the one its type gives. */
export function deductibleGroupFor(vehicle: DeductibleVehicle | string | null | undefined): DeductibleGroup {
  const v = typeof vehicle === "string" || vehicle == null ? { vehicleType: vehicle ?? null } : vehicle;
  return isDeductibleGroup(v.deductibleGroup) ? v.deductibleGroup : autoDeductibleGroup(v.vehicleType);
}

const num = (v: unknown) => (typeof v === "number" ? v : null);
const higher = (a: number | null, b: number | null) => (a === null ? b : b === null ? a : Math.max(a, b));

/** The customer's amounts per group, each null when not set; old per-type values folded in. */
export function customerGroupDeductibles(
  deductibles: unknown,
): Record<DeductibleGroup, { domestic: number | null; abroad: number | null }> {
  const result = { car: { domestic: null, abroad: null }, bus: { domestic: null, abroad: null } } as
    Record<DeductibleGroup, { domestic: number | null; abroad: number | null }>;
  if (!isValidCustomerDeductibles(deductibles) || !deductibles) return result;
  if (deductibles.byGroup) {
    for (const group of DEDUCTIBLE_GROUPS) {
      const pair = deductibles.byGroup[group] ?? {};
      result[group] = { domestic: num(pair.domestic), abroad: num(pair.abroad) };
    }
    return result;
  }
  for (const [typeKey, pair] of Object.entries(deductibles.byType ?? {})) {
    const group = autoDeductibleGroup(typeKey);
    result[group] = {
      domestic: higher(result[group].domestic, num(pair.domestic)),
      abroad: higher(result[group].abroad, num(pair.abroad)),
    };
  }
  return result;
}

const generalAmount = (value: unknown, fallback: string): number => {
  const text = value === null || value === undefined || String(value).trim() === "" ? fallback : String(value).trim();
  const n = Number(text.replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : Number(fallback);
};

/**
 * The eigen risico for a rental: the customer's own amount for the vehicle's group, else
 * the general amount for the group from Bedrijfsregels, else the defaults.
 */
export function resolveDeductibles(
  businessRules: unknown,
  customerDeductibles: unknown,
  vehicle: DeductibleVehicle | string | null | undefined,
): { group: DeductibleGroup; domestic: number; abroad: number } {
  const rules = isPlainObject(businessRules) ? businessRules : {};
  const group = deductibleGroupFor(vehicle);
  const own = customerGroupDeductibles(customerDeductibles)[group];
  const general = group === "bus"
    ? { domestic: rules.eigenrisicoBusBinnenland, abroad: rules.eigenrisicoBusBuitenland }
    : { domestic: rules.eigenrisicoBinnenland, abroad: rules.eigenrisicoBuitenland };
  return {
    group,
    domestic: own.domestic ?? generalAmount(general.domestic, DEFAULT_GROUP_DEDUCTIBLES[group].domestic),
    abroad: own.abroad ?? generalAmount(general.abroad, DEFAULT_GROUP_DEDUCTIBLES[group].abroad),
  };
}

/** Kees 2026-10-28: the amounts confirmed in the pickup dialog; null when absent or not valid. */
export function pickupDeductibleFrom(value: unknown): { domestic: number; abroad: number } | null {
  if (!isPlainObject(value)) return null;
  const { domestic, abroad } = value as { domestic?: unknown; abroad?: unknown };
  if (typeof domestic !== "number" || typeof abroad !== "number") return null;
  if (!amountOk(domestic) || !amountOk(abroad)) return null;
  return { domestic, abroad };
}
