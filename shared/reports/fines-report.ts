/**
 * Rapporten fase 2, onderdeel 1: the fines report on Rapporten > Financieel.
 * What the server (server/services/reports/fines-report.ts) and the card
 * (client/src/pages/reports/fines-report-card.tsx) agree on.
 */
import type { ReportBreakdownRow, ReportTileTotal } from "../report-kit";

/** new / linked / cancelled by status, legacy = the old statuses, total = everything but cancelled. */
export const FINE_REPORT_TILES = ["new", "linked", "cancelled", "legacy", "total"] as const;
/** Breakdown names that /rows and /export accept as `drill`. */
export const FINE_REPORT_DRILLS = ["customer", "vehicle", "driver"] as const;
export type FineReportTile = (typeof FINE_REPORT_TILES)[number];

export const FINE_REPORT_SORTS = ["offenceAt", "amount", "status", "licensePlate", "customer"] as const;
export type FineReportSort = (typeof FINE_REPORT_SORTS)[number];

export interface FineReportRow {
  id: number;
  offenceAt: string;
  receivedAt: string | null;
  licensePlate: string;
  vehicleId: number | null;
  description: string;
  reference: string | null;
  status: string;
  amount: number;
  customerId: number | null;
  customerName: string | null;
  /** Opens the driver from the report (Rapporten deel 1b); null when no driver is linked. */
  driverId: number | null;
  driverName: string | null;
  linkedAt: string | null;
}

export interface FineReportSummary {
  tiles: Record<FineReportTile, ReportTileTotal>;
  /** Average days from receipt to linking, one decimal; null when no fine has both. */
  avgDaysToLink: number | null;
  byMonth: Array<{ month: string; new: number; linked: number; cancelled: number; legacy: number }>;
  byCustomer: ReportBreakdownRow[];
  byVehicle: ReportBreakdownRow[];
  byDriver: ReportBreakdownRow[];
}
