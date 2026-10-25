/**
 * Rapporten fase 4, onderdeel 10: the portal requests report on Rapporten > Portaal.
 * What the server (server/services/reports/portal-requests-report.ts) and the card agree on.
 */
import type { ReportBreakdownRow, ReportTileTotal } from "../report-kit";

/** An open request (new / in progress) older than this many days counts as "te oud". */
export const PORTAL_STALE_DAYS = 2;

/**
 * all / open / done / rejected: office day of created_at inside the period.
 * stale: open and older than PORTAL_STALE_DAYS, over ALL periods (a work list).
 */
export const PORTAL_REQUEST_REPORT_TILES = ["all", "open", "done", "rejected", "stale"] as const;
export type PortalRequestReportTile = (typeof PORTAL_REQUEST_REPORT_TILES)[number];

export const PORTAL_REQUEST_REPORT_SORTS = ["createdAt", "type", "status", "customer", "replyHours"] as const;
export type PortalRequestReportSort = (typeof PORTAL_REQUEST_REPORT_SORTS)[number];

export interface PortalRequestReportRow {
  id: number;
  createdAt: string;
  type: string;
  status: string;
  customerId: number;
  customerName: string | null;
  handledBy: string | null;
  repliedAt: string | null;
  /** Hours between created and replied (1 decimal), null without a reply. */
  replyHours: number | null;
  /** Office days since it was created, only while new / in progress. */
  openDays: number | null;
  /** Always 0: this report has no money. */
  amount: number;
}

export interface PortalRequestMonth {
  month: string;
  new: number;
  inProgress: number;
  done: number;
  rejected: number;
}

export interface PortalRequestTypeCount {
  type: string;
  total: number;
  open: number;
  done: number;
  rejected: number;
}

export interface PortalRequestReportSummary {
  tiles: Record<PortalRequestReportTile, ReportTileTotal>;
  byMonth: PortalRequestMonth[];
  /** Every type, total descending then type ascending. */
  byType: PortalRequestTypeCount[];
  /** Done or rejected requests per staff member (top 10). */
  byHandler: ReportBreakdownRow[];
  /** Median hours from created to replied over the "all" tile, 1 decimal; null without replies. */
  medianReplyHours: number | null;
  repliedCount: number;
}
