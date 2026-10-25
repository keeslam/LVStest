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
