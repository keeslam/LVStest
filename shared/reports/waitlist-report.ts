/**
 * Rapporten fase 4, onderdeel 11: the waitlist report on Rapporten > Portaal.
 * What the server (server/services/reports/waitlist-report.ts) and the card agree on.
 */
import type { ReportTileTotal } from "../report-kit";

/** All tiles: office day of created_at inside the period. open = active or contacted. */
export const WAITLIST_REPORT_TILES = ["all", "open", "fulfilled", "cancelled"] as const;
export type WaitlistReportTile = (typeof WAITLIST_REPORT_TILES)[number];

export const WAITLIST_REPORT_SORTS = ["createdAt", "preferredStartDate", "status", "customer", "vehicleType"] as const;
export type WaitlistReportSort = (typeof WAITLIST_REPORT_SORTS)[number];

export interface WaitlistReportRow {
  id: number;
  createdAt: string;
  customerId: number;
  customerName: string | null;
  /** Wanted type: the entry's own type, else the type of the chosen vehicle, else null. */
  vehicleType: string | null;
  vehicleId: number | null;
  licensePlate: string | null;
  preferredStartDate: string;
  preferredEndDate: string | null;
  duration: number | null;
  priority: string;
  status: string;
  contactedAt: string | null;
  fulfilledAt: string | null;
  /** Office days from created to fulfilled; null without fulfilled_at. */
  daysToFulfil: number | null;
  /** Always 0: this report has no money. */
  amount: number;
}

export interface WaitlistMonth {
  month: string;
  open: number;
  fulfilled: number;
  cancelled: number;
}

export interface WaitlistTypeCount {
  vehicleType: string | null;
  total: number;
  fulfilled: number;
  notFulfilled: number;
  avgDaysToFulfil: number | null;
}

export interface WaitlistReportSummary {
  tiles: Record<WaitlistReportTile, ReportTileTotal>;
  byMonth: WaitlistMonth[];
  /** Every type, no limit: notFulfilled desc, total desc, type asc (unknown last). */
  byType: WaitlistTypeCount[];
  /** Average office days to fulfil over the "all" tile, 1 decimal; null without fulfilled entries. */
  avgDaysToFulfil: number | null;
}
