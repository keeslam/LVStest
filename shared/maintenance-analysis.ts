/**
 * Onderhoudsanalyse (Kees, 2026-10-26) — what the server analysis and the window share:
 * the km bands, the brand-free model name, the supplier grouping key, the rating and
 * signal thresholds and the response shapes of GET /api/reports/maintenance-analysis/*.
 *
 * Km data (cost per km, km bands, km readings, the forecast) is for admins only; the
 * server leaves those fields out for everyone else and refuses a km-band filter or drill.
 */
import type { ExpenseCategory } from "./expense-categories";
import { REPORT_DRILL_NULL_KEY } from "./report-kit";

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
/** Signal "boven groep": the car must have been owned at least this many months inside the period (no tiny-ownership rates). */
export const SIGNAL_MIN_OWNED_MONTHS = 2;
/** Signal "stijgend": each of the last this many full months higher than the month before. */
export const SIGNAL_RISING_MONTHS = 3;
/** Signal "herhaald": the same category again within this many days. */
export const SIGNAL_REPEAT_DAYS = 90;
/** The forecast looks this many days ahead (3 months). */
export const FORECAST_DAYS = 90;
export const FORECAST_MONTHS = 3;

/** Advies vervangen: at least this factor of the type (1.5 = 50 % above), over both windows below. */
export const REPLACE_HINT_FACTOR = 1.5;
/** ... with at least this many comparable other cars of the type (admin: with km in the same band). */
export const REPLACE_HINT_MIN_COMPARABLES = 3;
/** The two windows (months, ending at the period end or today) the hint looks at: a year, and the last half year. */
export const REPLACE_HINT_MONTHS = [12, 6] as const;
/** An admin is compared per km only with at least this many own km in the band; below it the per-month rule is used. */
export const REPLACE_HINT_MIN_KM = 5000;
/** Onderhoudsinterval: the visits of the last this many months (ending at the period end or today) are used, not only the period. */
export const INTERVAL_LOOKBACK_MONTHS = 24;
/** Onderhoudsinterval: a car stands out when its interval is at most this factor of the type average (≥ 50 % shorter). */
export const INTERVAL_OUTLIER_FACTOR = 0.5;
/** How many best and worst cars the profile shows. */
export const PROFILE_BEST_WORST = 3;
/** How many repairs the profile lists. */
export const PROFILE_TOP_REPAIRS = 10;

/**
 * The drill key of a repair group: "<category>|<description key>", the description lower-cased with
 * the spaces collapsed, MAINTENANCE_NULL_KEY when the line has no description.
 */
export function repairKey(category: string, description: string | null | undefined): string {
  const text = (description ?? "").trim().replace(/\s+/g, " ").toLowerCase();
  return `${category}|${text || REPORT_DRILL_NULL_KEY}`;
}

/** The breakdowns /rows accepts as `drill`. */
export const MAINTENANCE_ANALYSIS_DRILLS = ["category", "brand", "model", "supplier", "vehicle", "month", "kmBand", "repair"] as const;
export type MaintenanceAnalysisDrill = (typeof MAINTENANCE_ANALYSIS_DRILLS)[number];

/** The filter and drill value of an unknown brand, model, supplier or km band. */
export const MAINTENANCE_NULL_KEY = REPORT_DRILL_NULL_KEY;

/**
 * The key of a model line and of `drill=model`: brand and brand-free model, joined by " | ".
 * An empty or null brand or model is MAINTENANCE_NULL_KEY (shown as "Onbekend").
 */
export function modelGroupKey(brand: string | null, model: string | null): string {
  return `${brand || MAINTENANCE_NULL_KEY} | ${model || MAINTENANCE_NULL_KEY}`;
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
  topVehicles: Array<{ vehicleId: number; licensePlate: string; brand: string | null; model: string | null; total: number; count: number }>;
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
  /** "brand" = the brand as a whole (model null), "model" = one type of it. */
  level: "brand" | "model";
  /** null = no brand ("Onbekend"). */
  brand: string | null;
  /** null on a brand line, or a type without a name ("Onbekend"). */
  model: string | null;
  /** null = "Onbekende km": costs without a km reading on their day (km 0, perKm null). */
  band: KmBand | null;
  amount: number;
  km: number;
  perKm: number | null;
  vehicles: number;
  count: number;
}

export interface MaintenanceBrands {
  from: string;
  to: string;
  /** brand null = no brand ("Onbekend"; filter and drill with MAINTENANCE_NULL_KEY). */
  brands: Array<MaintenanceGroupLine & { brand: string | null }>;
  /** model null = a type without a name ("Onbekend"). */
  models: Array<MaintenanceGroupLine & { brand: string | null; model: string | null; key: string }>;
  /** Admin only. */
  kmBands?: MaintenanceKmBandLine[];
  /**
   * The yardstick of the rating: per car per month of the whole fleet (the period, category, build year
   * and km band count; brand, type, supplier and car do not), so filtering never changes a rating.
   */
  fleetPerVehicleMonth: number | null;
}

/** One car in the profile's best and worst lists (per car per month over the period). */
export interface MaintenanceProfileCar {
  vehicleId: number;
  plate: string;
  perMonth: number | null;
  total: number;
  count: number;
}

/** Profile of one brand + type (GET /profile?brand=&model=). Km fields are admin only. */
export interface MaintenanceProfile {
  from: string;
  to: string;
  brand: string | null;
  model: string | null;
  /** Cars of the type owned in the period. */
  vehicles: number;
  /** Average age in years on the period end (cars without a build date left out); null when none. */
  avgAgeYears: number | null;
  /** Admin only: average km reading on the period end (cars without a reading left out). */
  avgKm?: number | null;
  perVehicleMonth: number | null;
  /** The whole fleet, as MaintenanceBrands.fleetPerVehicleMonth. */
  fleetPerVehicleMonth: number | null;
  byCategory: Array<{ key: ExpenseCategory; label: string; amount: number; count: number }>;
  /**
   * The most frequent repairs: same category + description (case and spaces ignored). `label` is the
   * most used spelling, or the category name when there is no description. `key` is the drill key.
   */
  topRepairs: Array<{ key: string; label: string; category: string; description: string | null; count: number; amount: number }>;
  /** Per build year, oldest first; year null (unknown) last. */
  byYear: Array<{ year: number | null; perVehicleMonth: number | null; vehicles: number }>;
  /** Admin only: the km-band lines of the type (as MaintenanceBrands.kmBands, level "model"). */
  kmBands?: MaintenanceKmBandLine[];
  best: MaintenanceProfileCar[];
  worst: MaintenanceProfileCar[];
  suppliers: MaintenanceSuppliers["suppliers"];
  /**
   * Months (and, admin, km) between two Onderhoud visits (category maintenance, one visit per day) in the
   * period: the mean of each car's average. `vehicles` = cars with at least two visits. A car stands out
   * with an interval of at most INTERVAL_OUTLIER_FACTOR × the type average.
   */
  interval: {
    months: number | null;
    km?: number | null;
    vehicles: number;
    outliers: Array<{ vehicleId: number; plate: string; months: number; km?: number | null }>;
  };
  /**
   * Advies vervangen (a hint, no decision): the car costs at least REPLACE_HINT_FACTOR × its type, per
   * month (admin: per km in the same km band), over the last 12 and over the last 6 months.
   */
  replaceHints: Array<{ vehicleId: number; plate: string; ratio12: number; ratio6: number }>;
}

export interface MaintenanceVehicleLine {
  vehicleId: number;
  licensePlate: string;
  brand: string | null;
  model: string | null;
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
  downtime: Array<{ vehicleId: number; plate: string; brand: string | null; model: string | null; visits: number; days: number }>;
  topRepairs: MaintenanceCostRow[];
}

export interface MaintenanceTrends {
  from: string;
  to: string;
  months: Array<{ month: string; amount: number; previous?: number }>;
  /** Admin only: the next FORECAST_MONTHS months. */
  forecast?: Array<{ month: string; amount: number }>;
  /** Admin only: the forecast per vehicle (FORECAST_DAYS × km per day × cost per km of model + band). */
  forecastVehicles?: Array<{ vehicleId: number; licensePlate: string; brand: string | null; model: string | null; band: KmBand; kmPerDay: number; perKm: number; amount: number }>;
}

export type MaintenanceSignal =
  | { kind: "aboveGroup"; vehicleId: number; licensePlate: string; brand: string | null; model: string | null;
      basis: "month" | "km"; band?: KmBand; value: number; average: number; percent: number; comparables: number }
  /** drillFrom/drillTo: the months the signal looked at (they may lie partly before the period). */
  | { kind: "rising"; vehicleId: number; licensePlate: string; brand: string | null; model: string | null;
      months: Array<{ month: string; amount: number }>; drillFrom: string; drillTo: string }
  /** drillFrom/drillTo: the day of the first and of the second line. */
  | { kind: "repeated"; vehicleId: number; licensePlate: string; brand: string | null; model: string | null;
      category: string; categoryLabel: string; firstDate: string; secondDate: string; days: number; expenseIds: number[];
      drillFrom: string; drillTo: string };

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
  brand: string | null;
  model: string | null;
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
