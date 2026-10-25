/**
 * Rapporten fase 2, onderdeel 2: the extra km and fuel report on Rapporten >
 * Financieel. What the server (server/services/reports/extra-costs-report.ts)
 * and the card (client/src/pages/reports/extra-costs-report-card.tsx) agree on.
 */
import type { ReportBreakdownRow, ReportTileTotal } from "../report-kit";

/**
 * extraKm = rentals with extra km cost, fuel = rentals with fuel cost, withExtraKm = rentals that drove extra km.
 * withCosts = extra km cost or fuel cost: what the customer and vehicle breakdowns count. It is not shown as a
 * card; a breakdown line opens it narrowed to that line (EXTRA_COSTS_CARD_TILES are the cards).
 */
export const EXTRA_COSTS_TILES = ["extraKm", "fuel", "withExtraKm", "withCosts"] as const;
export const EXTRA_COSTS_CARD_TILES = ["extraKm", "fuel", "withExtraKm"] as const;
/** Breakdown names that /rows and /export accept as `drill`. */
export const EXTRA_COSTS_DRILLS = ["customer", "vehicle"] as const;
export type ExtraCostsTile = (typeof EXTRA_COSTS_TILES)[number];

export const EXTRA_COSTS_SORTS = ["startDate", "amount", "extraKm", "fuelCost", "licensePlate", "customer"] as const;
export type ExtraCostsSort = (typeof EXTRA_COSTS_SORTS)[number];

export interface ExtraCostsRow {
  reservationId: number;
  startDate: string;
  returnDate: string | null;
  vehicleId: number;
  licensePlate: string;
  brand: string;
  model: string;
  customerId: number | null;
  customerName: string | null;
  extraKm: number | null;
  extraKmCost: number | null;
  fuelCost: number | null;
  /** The amount of the opened tile: extraKmCost for extraKm / withExtraKm, fuelCost for fuel, both for withCosts. */
  amount: number;
}

export interface ExtraCostsSummary {
  tiles: Record<ExtraCostsTile, ReportTileTotal>;
  totalExtraKm: number;
  byMonth: Array<{ month: string; extraKmCost: number; fuelCost: number }>;
  byCustomer: ReportBreakdownRow[];
  byVehicle: ReportBreakdownRow[];
}
