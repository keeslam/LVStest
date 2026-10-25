/**
 * Rapporten fase 5, onderdeel 12: the invoice inbox pickup rounds. Period day = office day of
 * started_at. Tile `runs` is every round; the other tiles are the rounds with that column above
 * 0 and add up that column. The vehicle filter is ignored (a round has no vehicle).
 */
import { sql, type SQL } from "drizzle-orm";
import { invoiceInboxRuns } from "../../../shared/schema";
import {
  INBOX_RUN_REPORT_SORTS,
  INBOX_RUN_REPORT_TILES,
  type InboxRunReportRow,
  type InboxRunReportSort,
  type InboxRunReportSummary,
  type InboxRunReportTile,
} from "../../../shared/reports/invoice-inbox-report";
import { fillMonths } from "../../../shared/report-kit";
import { dateInZone } from "../../../shared/office-timezone";
import { officeTimeZone } from "../office-time";
import { RUN_LOG_RETENTION_DAYS } from "../invoice-inbox/run-log";
import { inPeriodSql, instantIsoSql, officeDaySql, type ReportFilter } from "./report-kit";
import { rowsOf, sqlReport } from "./sql-report";

const r = invoiceInboxRuns;
const startedDay = officeDaySql(r.startedAt);

const COLUMN: Record<Exclude<InboxRunReportTile, "runs">, SQL> = {
  mails: sql`${r.mails}`,
  attachments: sql`${r.attachments}`,
  booked: sql`${r.booked}`,
  review: sql`${r.review}`,
  skipped: sql`${r.skipped}`,
  failed: sql`${r.failed}`,
};

function tileWhere(tile: InboxRunReportTile, filter: ReportFilter): SQL {
  const period = inPeriodSql(startedDay, filter);
  return tile === "runs" ? period : sql`${period} AND ${COLUMN[tile]} > 0`;
}

const tileAmount = (tile: InboxRunReportTile): SQL => (tile === "runs" ? sql`1` : COLUMN[tile]);

const FROM = sql`${r}`;

async function extras(filter: ReportFilter): Promise<Omit<InboxRunReportSummary, "tiles">> {
  const columns = sql.join(
    INBOX_RUN_REPORT_TILES.map((tile) =>
      sql`coalesce(sum(${tileAmount(tile)}) FILTER (WHERE ${tileWhere(tile, filter)}), 0)::int AS ${sql.raw(`"${tile}"`)}`),
    sql`, `,
  );
  const monthRows = await rowsOf<Record<string, number | string>>(sql`
    SELECT to_char(${startedDay}, 'YYYY-MM') AS month, ${columns}
    FROM ${FROM} WHERE ${tileWhere("runs", filter)} GROUP BY 1`);
  const months = monthRows.map((m) => ({
    month: String(m.month),
    runs: Number(m.runs), mails: Number(m.mails), attachments: Number(m.attachments), booked: Number(m.booked),
    review: Number(m.review), skipped: Number(m.skipped), failed: Number(m.failed),
  }));
  const today = dateInZone(new Date(), officeTimeZone());
  const retentionCutoff = new Date(Date.parse(`${today}T00:00:00Z`) - RUN_LOG_RETENTION_DAYS * 86_400_000).toISOString().slice(0, 10);
  return {
    byMonth: fillMonths(months, (month) => ({ month, runs: 0, mails: 0, attachments: 0, booked: 0, review: 0, skipped: 0, failed: 0 })),
    retentionDays: RUN_LOG_RETENTION_DAYS,
    retentionCutoff,
  };
}

function orderBy(sort: InboxRunReportSort, dir: "asc" | "desc"): SQL {
  const d = dir === "asc" ? sql.raw("ASC") : sql.raw("DESC");
  const id = sql`${r.id} ${d}`;
  if (sort === "startedAt") return sql`${r.startedAt} ${d}, ${id}`;
  return sql`${COLUMN[sort]} ${d}, ${id}`;
}

const select = (tile: InboxRunReportTile): SQL => sql`${r.id} AS id, ${instantIsoSql(r.startedAt)} AS "startedAt", ${instantIsoSql(r.finishedAt)} AS "finishedAt",
  ${r.trigger} AS trigger, ${r.triggeredBy} AS "triggeredBy", ${r.mails} AS mails, ${r.attachments} AS attachments,
  ${r.booked} AS booked, ${r.review} AS review, ${r.skipped} AS skipped, ${r.failed} AS failed, ${r.errors} AS errors,
  (${tileAmount(tile)})::float8 AS amount`;

const iso = (v: unknown): string => (v instanceof Date ? v.toISOString() : new Date(String(v)).toISOString());

const mapRow = (row: Record<string, any>): InboxRunReportRow => ({
  id: Number(row.id),
  startedAt: iso(row.startedAt),
  finishedAt: iso(row.finishedAt),
  trigger: String(row.trigger),
  triggeredBy: row.triggeredBy ?? null,
  mails: Number(row.mails),
  attachments: Number(row.attachments),
  booked: Number(row.booked),
  review: Number(row.review),
  skipped: Number(row.skipped),
  failed: Number(row.failed),
  errors: Array.isArray(row.errors) ? row.errors.map(String) : [],
  amount: Number(row.amount),
});

export const invoiceInboxRunsReport = sqlReport<InboxRunReportTile, InboxRunReportSort, InboxRunReportRow, Omit<InboxRunReportSummary, "tiles">>({
  key: "invoice-inbox-runs",
  tiles: INBOX_RUN_REPORT_TILES,
  sorts: INBOX_RUN_REPORT_SORTS,
  defaultSort: "startedAt",
  defaultDir: "desc",
  from: FROM,
  tileWhere,
  tileAmount,
  select,
  orderBy,
  mapRow,
  extras,
});
