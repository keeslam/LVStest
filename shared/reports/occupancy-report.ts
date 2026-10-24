/**
 * Rapporten fase 3, onderdeel 6: the occupancy heatmap on Rapporten > Voertuigen.
 * What the server (server/services/reports/occupancy-report.ts) and the card agree on.
 *
 * Every vehicle-day of the active fleet has exactly one state, by precedence
 * workshop > rented > replacement > available. Rented = rentals only (type standard).
 */
import type { ReportTileTotal } from "../report-kit";

/** Longest period the heatmap accepts (days); a longer one gives 400 PERIOD_TOO_LONG. */
export const OCCUPANCY_MAX_DAYS = 366;

/** count = vehicles with at least one day in that state, amount = vehicle-days in that state. */
export const OCCUPANCY_TILES = ["rented", "replacement", "workshop", "available"] as const;
export type OccupancyTile = (typeof OCCUPANCY_TILES)[number];

export const OCCUPANCY_SORTS = ["licensePlate", "amount", "pct"] as const;
export type OccupancySort = (typeof OCCUPANCY_SORTS)[number];

export interface OccupancyDay {
  /** yyyy-mm-dd */
  date: string;
  /** Vehicles in the active fleet that day; always rented + replacement + workshop + available. */
  fleet: number;
  rented: number;
  replacement: number;
  workshop: number;
  available: number;
  /** rented / fleet x 100, one decimal; null when the fleet is 0. */
  pct: number | null;
}

/** One vehicle over the period. */
export interface OccupancyRow {
  vehicleId: number;
  licensePlate: string;
  brand: string;
  model: string;
  /** Days the vehicle was in the active fleet in the period. */
  fleetDays: number;
  rentedDays: number;
  replacementDays: number;
  workshopDays: number;
  availableDays: number;
  /** rentedDays / fleetDays x 100, one decimal. */
  pct: number | null;
  /** Days in the state of the opened tile. */
  amount: number;
}

export interface OccupancySummary {
  tiles: Record<OccupancyTile, ReportTileTotal>;
  /** Every day of the period (also days with fleet 0), ascending. */
  days: OccupancyDay[];
  /** Rented vehicle-days / fleet vehicle-days x 100, one decimal; null without fleet days. */
  avgPct: number | null;
}

/** x / y x 100 on one decimal, null when y is 0. */
export function occupancyPct(part: number, whole: number): number | null {
  return whole > 0 ? Math.round((part / whole) * 1000) / 10 : null;
}
