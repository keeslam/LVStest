/**
 * Rapporten fase 5, onderdeel 14: damage checks. What the server
 * (server/services/reports/damage-checks-report.ts) and the card agree on.
 */
import type { ReportBreakdownRow, ReportTileTotal } from "../report-kit";

/** pickup + return = all; withDamage = return checks with at least one damage marker. */
export const DAMAGE_CHECK_REPORT_TILES = ["all", "pickup", "return", "withDamage"] as const;
export type DamageCheckReportTile = (typeof DAMAGE_CHECK_REPORT_TILES)[number];

export const DAMAGE_CHECK_REPORT_SORTS = ["checkDate", "checkType", "licensePlate", "customer"] as const;
export type DamageCheckReportSort = (typeof DAMAGE_CHECK_REPORT_SORTS)[number];

export interface DamageCheckReportRow {
  id: number;
  /** ISO timestamp */
  checkDate: string;
  checkType: string;
  vehicleId: number;
  licensePlate: string | null;
  reservationId: number | null;
  customerId: number | null;
  customerName: string | null;
  completedBy: string | null;
  hasDamage: boolean;
  /** Always 0 (no money in this report). */
  amount: number;
}

export interface DamageCheckMonth {
  month: string;
  pickup: number;
  return: number;
  withDamage: number;
}

export interface DamageCheckReportSummary {
  tiles: Record<DamageCheckReportTile, ReportTileTotal>;
  byMonth: DamageCheckMonth[];
  /** Most damage first (tile withDamage); label = license plate. */
  byVehicle: ReportBreakdownRow[];
  /** Most damage first; key and label null = checks without a reservation. */
  byCustomer: ReportBreakdownRow[];
}
