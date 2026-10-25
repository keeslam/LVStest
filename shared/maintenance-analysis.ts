/**
 * Onderhoudsanalyse (Kees, 2026-10-26) — what the server analysis and the window share:
 * the km bands, the brand-free model name, the supplier grouping key, the rating and
 * signal thresholds and the response shapes of GET /api/reports/maintenance-analysis/*.
 *
 * Km data (cost per km, km bands, km readings, the forecast) is for admins only; the
 * server leaves those fields out for everyone else and refuses a km-band filter or drill.
 */
import type { ExpenseCategory } from "./expense-categories";

/** The km bands, exactly these labels. A boundary belongs to the higher band: 50.000 is `50–100.000`. */
export const KM_BANDS = [
  { key: "0–50.000", min: 0, max: 50_000 },
  { key: "50–100.000", min: 50_000, max: 100_000 },
  { key: "100–150.000", min: 100_000, max: 150_000 },
  { key: "150–200.000", min: 150_000, max: 200_000 },
  { key: "200.000+", min: 200_000, max: Number.POSITIVE_INFINITY },
] as const;

export type KmBand = (typeof KM_BANDS)[number]["key"];

export const KM_BAND_KEYS: readonly KmBand[] = KM_BANDS.map((b) => b.key);

/** The band a km reading falls in (negative or not a number counts as 0). */
export function kmBandOf(km: number): KmBand {
  const value = Number.isFinite(km) && km > 0 ? km : 0;
  for (const band of KM_BANDS) {
    if (value >= band.min && value < band.max) return band.key;
  }
  return KM_BANDS[KM_BANDS.length - 1].key;
}

/** The model without the brand in front of it: ("FIAT", "FIAT DUCATO") ⇒ "DUCATO". A model that is only the brand stays. */
export function modelWithoutBrand(brand: string | null | undefined, model: string | null | undefined): string {
  const m = (model ?? "").trim().replace(/\s+/g, " ");
  const b = (brand ?? "").trim().replace(/\s+/g, " ");
  if (!b) return m;
  if (m.toUpperCase().startsWith(`${b.toUpperCase()} `)) {
    const rest = m.slice(b.length).trim();
    if (rest) return rest;
  }
  return m;
}

/**
 * The grouping key of a supplier, the same as SQL `lower(regexp_replace(btrim(supplier), '\s+', ' ', 'g'))`:
 * "Garage  Jansen" and "garage jansen " are one supplier. Null or empty ⇒ null (the "Onbekend" group).
 */
export function supplierKey(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  const key = raw.replace(/^ +| +$/g, "").replace(/\s+/g, " ").toLowerCase();
  return key === "" ? null : key;
}

/** What a cost without a supplier is called. */
export const UNKNOWN_SUPPLIER_LABEL = "Onbekend";

/** The Dutch name of each maintenance category (the client translates by key; this is the fallback). */
export const MAINTENANCE_CATEGORY_LABELS: Record<string, string> = {
  maintenance: "Onderhoud",
  tires: "Banden",
  brakes: "Remmen",
};

/**
 * A brand or model is rated only when this many cost lines and at least MIN_VEHICLES_FOR_RATING
 * vehicles with costs stand behind it (A-14-2): one line of EUR 25.50 is no "Uitstekend".
 */
export const MIN_EXPENSES_FOR_RATING = 3;
/** One vehicle with three oil changes says nothing about a brand. */
export const MIN_VEHICLES_FOR_RATING = 2;
/** Below the average is "Uitstekend", below average × this is "Goed", above it "Gemiddeld". */
export const RATING_GOOD_FACTOR = 1.2;

/** Signal "boven de groep": at least this factor of the group average (1.5 = 50 % above). */
export const SIGNAL_ABOVE_GROUP_FACTOR = 1.5;
/** ... and only with at least this many comparable other vehicles (same brand and model; admin: same km band). */
export const SIGNAL_MIN_COMPARABLES = 3;
/** Signal "stijgend": each of the last this many full months higher than the month before. */
export const SIGNAL_RISING_MONTHS = 3;
/** Signal "herhaald": the same category again within this many days. */
export const SIGNAL_REPEAT_DAYS = 90;
/** The forecast looks this many days ahead (3 months). */
export const FORECAST_DAYS = 90;
export const FORECAST_MONTHS = 3;

/** The breakdowns /rows accepts as `drill`. */
export const MAINTENANCE_ANALYSIS_DRILLS = ["category", "brand", "model", "supplier", "vehicle", "month", "kmBand"] as const;
export type MaintenanceAnalysisDrill = (typeof MAINTENANCE_ANALYSIS_DRILLS)[number];

/** The key of a model line and of `drill=model`: brand and brand-free model, joined by " | ". */
export function modelGroupKey(brand: string, model: string): string {
  return `${brand} | ${model}`;
}

export interface MaintenanceTiles {
  total: number;
  perVehicleMonth: number | null;
  count: number;
  /** Admin only. */
  perKm?: number | null;
}

export interface MaintenanceOverview {
  from: string;
  to: string;
  tiles: MaintenanceTiles;
  previous?: MaintenanceTiles & { from: string; to: string };
  byCategory: Array<{ key: ExpenseCategory; label: string; amount: number; count: number }>;
  topVehicles: Array<{ vehicleId: number; licensePlate: string; brand: string; model: string; total: number; count: number }>;
}

export interface MaintenanceGroupLine {
  total: number;
  perVehicleMonth: number | null;
  /** Admin only. */
  perKm?: number | null;
  /** Vehicles of the group owned during the period. */
  vehicles: number;
  /** Vehicles of the group with at least one cost line in the period. */
  vehiclesWithCosts: number;
  count: number;
  /** Enough lines and vehicles for a rating (MIN_EXPENSES_FOR_RATING, MIN_VEHICLES_FOR_RATING). */
  rated: boolean;
}

export interface MaintenanceKmBandLine {
  brand: string;
  /** null = the brand as a whole. */
  model: string | null;
  band: KmBand;
  amount: number;
  km: number;
  perKm: number | null;
  vehicles: number;
  count: number;
}

export interface MaintenanceBrands {
  from: string;
  to: string;
  brands: Array<MaintenanceGroupLine & { brand: string }>;
  models: Array<MaintenanceGroupLine & { brand: string; model: string; key: string }>;
  /** Admin only. */
  kmBands?: MaintenanceKmBandLine[];
}

export interface MaintenanceVehicleLine {
  vehicleId: number;
  licensePlate: string;
  brand: string;
  model: string;
  year: number | null;
  /** Admin only: the band of the last valid reading on or before the end of the period. */
  kmBand?: KmBand | null;
  total: number;
  perMonth: number | null;
  /** Admin only. */
  perKm?: number | null;
  count: number;
  lastDate: string | null;
}

export interface MaintenanceSuppliers {
  from: string;
  to: string;
  /** `key` null = "Onbekend"; send REPORT_DRILL_NULL_KEY as filter or drill key for it. */
  suppliers: Array<{ key: string | null; supplier: string; total: number; count: number; avg: number }>;
  downtime: Array<{ vehicleId: number; plate: string; brand: string; model: string; visits: number; days: number }>;
  topRepairs: MaintenanceCostRow[];
}

export interface MaintenanceTrends {
  from: string;
  to: string;
  months: Array<{ month: string; amount: number; previous?: number }>;
  /** Admin only: the next FORECAST_MONTHS months. */
  forecast?: Array<{ month: string; amount: number }>;
  /** Admin only: the forecast per vehicle (FORECAST_DAYS × km per day × cost per km of model + band). */
  forecastVehicles?: Array<{ vehicleId: number; licensePlate: string; brand: string; model: string; band: KmBand; kmPerDay: number; perKm: number; amount: number }>;
}

export type MaintenanceSignal =
  | { kind: "aboveGroup"; vehicleId: number; licensePlate: string; brand: string; model: string;
      basis: "month" | "km"; band?: KmBand; value: number; average: number; percent: number; comparables: number }
  | { kind: "rising"; vehicleId: number; licensePlate: string; brand: string; model: string;
      months: Array<{ month: string; amount: number }> }
  | { kind: "repeated"; vehicleId: number; licensePlate: string; brand: string; model: string;
      category: string; categoryLabel: string; firstDate: string; secondDate: string; days: number; expenseIds: number[] };

export interface MaintenanceSignals {
  from: string;
  to: string;
  signals: MaintenanceSignal[];
}

export interface MaintenanceCostRow {
  id: number;
  date: string;
  vehicleId: number;
  licensePlate: string;
  brand: string;
  model: string;
  category: string;
  categoryLabel: string;
  supplier: string;
  supplierKey: string | null;
  amount: number;
  description: string | null;
  /** Admin only: the km reading the vehicle had on that day. */
  km?: number | null;
}

export interface MaintenanceRows {
  from: string;
  to: string;
  rows: MaintenanceCostRow[];
  total: number;
  amount: number;
}
