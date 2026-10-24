/**
 * Rapporten fase 3, onderdeel 8: the fleet mileage report on Rapporten > Voertuigen (admin only).
 * What the server (server/services/reports/fleet-mileage-report.ts) and the card agree on.
 *
 * The km come from `analyseMileage`, the same function as the km panel of a vehicle, so the km of
 * a car here equal the summary in Km-historie for the same period. Rows are a union: a vehicle row
 * (tiles driven and sparse) or a warning row, one reading that is a decrease or a jump (tile warnings).
 */
import type { MileageSource } from "../mileage-history";
import type { ReportTileTotal } from "../report-kit";

/** driven = cars with km > 0 (amount = km); warnings = the warning readings (amount 0); sparse = cars in the fleet with fewer than 2 valid readings (amount 0). */
export const FLEET_MILEAGE_TILES = ["driven", "warnings", "sparse"] as const;
export type FleetMileageTile = (typeof FLEET_MILEAGE_TILES)[number];

export const FLEET_MILEAGE_SORTS = ["licensePlate", "km", "warnings", "date"] as const;
export type FleetMileageSort = (typeof FLEET_MILEAGE_SORTS)[number];

export interface FleetMileageVehicleRow {
  kind: "vehicle";
  /** `v-${vehicleId}` */
  id: string;
  vehicleId: number;
  licensePlate: string;
  brand: string;
  model: string;
  drivenKm: number;
  avgPerMonth: number | null;
  freeKm: number | null;
  overFreeKm: number | null;
  readings: number;
  warnings: number;
  /** ISO instants of the first and last valid reading in the period. */
  firstReading: string | null;
  lastReading: string | null;
  /** yyyy-MM to km; only months with km > 0. */
  kmByMonth: Record<string, number>;
  /** drivenKm in the driven tile, 0 in the sparse tile. */
  amount: number;
}

export interface FleetMileageWarningRow {
  kind: "warning";
  /** `r-${readingId}` */
  id: string;
  readingId: number;
  vehicleId: number;
  licensePlate: string;
  recordedAt: string;
  mileage: number;
  drivenSincePrevious: number | null;
  warning: "decrease" | "jump";
  source: MileageSource;
  actorName: string | null;
  amount: 0;
}

export type FleetMileageRow = FleetMileageVehicleRow | FleetMileageWarningRow;

export interface FleetMileageSummary {
  tiles: Record<FleetMileageTile, ReportTileTotal>;
  /** Ascending, months in between filled; vehicles = cars with km > 0 that month. */
  byMonth: Array<{ month: string; km: number; vehicles: number }>;
}
