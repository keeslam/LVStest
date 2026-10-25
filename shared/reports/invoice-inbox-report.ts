/**
 * Rapporten fase 5, onderdeel 12 and 13: the invoice inbox reports on Rapporten > Kantoor.
 * Part 12 (this block): the pickup rounds (invoice_inbox_runs). What the server
 * (server/services/reports/invoice-inbox-runs-report.ts) and the card agree on.
 */
import type { ReportTileTotal } from "../report-kit";

/** Tile `runs` = every round in the period; the others = rounds with that column > 0, amount = the column. */
export const INBOX_RUN_REPORT_TILES = ["runs", "mails", "attachments", "booked", "review", "skipped", "failed"] as const;
export type InboxRunReportTile = (typeof INBOX_RUN_REPORT_TILES)[number];

export const INBOX_RUN_REPORT_SORTS = ["startedAt", "mails", "attachments", "booked", "review", "skipped", "failed"] as const;
export type InboxRunReportSort = (typeof INBOX_RUN_REPORT_SORTS)[number];

export interface InboxRunReportRow {
  id: number;
  startedAt: string;
  finishedAt: string;
  trigger: string;
  triggeredBy: string | null;
  mails: number;
  attachments: number;
  booked: number;
  review: number;
  skipped: number;
  failed: number;
  errors: string[];
  /** What this round adds to the opened tile (1 for runs, else that column). */
  amount: number;
}

export interface InboxRunMonth {
  month: string;
  runs: number;
  mails: number;
  attachments: number;
  booked: number;
  review: number;
  skipped: number;
  failed: number;
}

export interface InboxRunReportSummary {
  tiles: Record<InboxRunReportTile, ReportTileTotal>;
  byMonth: InboxRunMonth[];
  /** The run log is kept this many days. */
  retentionDays: number;
  /** Office day today minus retentionDays (yyyy-mm-dd): rounds before it are gone. */
  retentionCutoff: string;
}

/**
 * Part 13: the invoices the mailbox brought in (invoice_inbox_items, mail only). Server:
 * server/services/reports/invoice-inbox-items-report.ts. The four outcomes add up to tile `all`;
 * `flagged` (a review reason is set) is the source of the reasons list.
 */
export const INBOX_ITEM_REPORT_TILES = ["all", "autoBooked", "staffBooked", "waiting", "dismissed", "flagged"] as const;
/** Breakdown names that /rows and /export accept as `drill`. */
export const INBOX_ITEM_REPORT_DRILLS = ["reason"] as const;
export type InboxItemReportTile = (typeof INBOX_ITEM_REPORT_TILES)[number];

export const INBOX_ITEM_REPORT_SORTS = ["receivedAt", "fromAddress", "outcome", "reviewReason"] as const;
export type InboxItemReportSort = (typeof INBOX_ITEM_REPORT_SORTS)[number];

export type InboxItemOutcome = "autoBooked" | "staffBooked" | "waiting" | "dismissed";

export interface InboxItemReportRow {
  id: number;
  receivedAt: string;
  mailDate: string | null;
  fromAddress: string | null;
  subject: string | null;
  attachmentName: string | null;
  status: string;
  outcome: InboxItemOutcome;
  reviewReason: string | null;
  vehicleId: number | null;
  licensePlate: string | null;
  processedAt: string | null;
  /** updated_by for staffBooked and dismissed, else null. */
  handledBy: string | null;
  amount: number;
}

export interface InboxItemMonth {
  month: string;
  autoBooked: number;
  staffBooked: number;
  waiting: number;
  dismissed: number;
}

export interface InboxReasonCount {
  reason: string;
  count: number;
}

export interface InboxItemReportSummary {
  tiles: Record<InboxItemReportTile, ReportTileTotal>;
  byMonth: InboxItemMonth[];
  byReason: InboxReasonCount[];
}
