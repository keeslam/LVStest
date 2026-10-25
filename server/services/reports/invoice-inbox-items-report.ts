/**
 * Rapporten fase 5, onderdeel 13: the invoices the mailbox brought in (invoice_inbox_items). Only
 * mail counts: a row with message id, sender, subject and mail date all empty is a manual scan.
 * Period day = office day of received_at. The four outcomes add up to tile `all`. The vehicle
 * filter is ignored (many invoices have no vehicle).
 */
import { sql, type SQL } from "drizzle-orm";
import { auditLogs, invoiceInboxItems, vehicles } from "../../../shared/schema";
import {
  INBOX_ITEM_REPORT_SORTS,
  INBOX_ITEM_REPORT_TILES,
  type InboxItemOutcome,
  type InboxItemReportRow,
  type InboxItemReportSort,
  type InboxItemReportSummary,
  type InboxItemReportTile,
} from "../../../shared/reports/invoice-inbox-report";
import { fillMonths } from "../../../shared/report-kit";
import { inPeriodSql, officeDaySql, type ReportFilter } from "./report-kit";
import { rowsOf, sqlReport } from "./sql-report";

const i = invoiceInboxItems;
const receivedDay = officeDaySql(i.receivedAt);

/** The booking route sets updated_by to the member of staff and always writes one of these audit lines. */
const staffBookedSql = sql`(${i.status} = 'booked' AND (${i.updatedBy} IS DISTINCT FROM ${i.createdBy} OR EXISTS (
  SELECT 1 FROM ${auditLogs} a WHERE a.action IN ('expense.inbox.book', 'expense.inbox.book.healed')
    AND a.resource_type = 'invoice_inbox_item' AND a.resource_id = ${i.id}::text)))`;

const outcomeSql = sql`(CASE WHEN ${staffBookedSql} THEN 'staffBooked' WHEN ${i.status} = 'booked' THEN 'autoBooked'
  WHEN ${i.status} = 'review' THEN 'waiting' WHEN ${i.status} = 'dismissed' THEN 'dismissed' END)`;

const mailOnly = sql`(${i.messageId} IS NOT NULL OR ${i.fromAddress} IS NOT NULL OR ${i.subject} IS NOT NULL OR ${i.mailDate} IS NOT NULL)`;

function tileWhere(tile: InboxItemReportTile, filter: ReportFilter): SQL {
  const base = sql`${mailOnly} AND ${inPeriodSql(receivedDay, filter)}`;
  if (tile === "all") return base;
  if (tile === "flagged") return sql`${base} AND ${i.reviewReason} IS NOT NULL`;
  return sql`${base} AND ${outcomeSql} = ${tile}`;
}

const tileAmount = (_tile: InboxItemReportTile): SQL => sql`0`;

const FROM = sql`${i} LEFT JOIN ${vehicles} ON ${vehicles.id} = ${i.vehicleId}`;

const OUTCOMES: InboxItemOutcome[] = ["autoBooked", "staffBooked", "waiting", "dismissed"];

async function extras(filter: ReportFilter): Promise<Omit<InboxItemReportSummary, "tiles">> {
  const columns = sql.join(
    OUTCOMES.map((o) => sql`count(*) FILTER (WHERE ${outcomeSql} = ${o})::int AS ${sql.raw(`"${o}"`)}`),
    sql`, `,
  );
  const monthRows = await rowsOf<Record<string, number | string>>(sql`
    SELECT to_char(${receivedDay}, 'YYYY-MM') AS month, ${columns}
    FROM ${FROM} WHERE ${tileWhere("all", filter)} GROUP BY 1`);
  const months = monthRows.map((m) => ({
    month: String(m.month),
    autoBooked: Number(m.autoBooked), staffBooked: Number(m.staffBooked), waiting: Number(m.waiting), dismissed: Number(m.dismissed),
  }));
  const reasonRows = await rowsOf<{ reason: string; n: number }>(sql`
    SELECT ${i.reviewReason} AS reason, count(*)::int AS n
    FROM ${FROM} WHERE ${tileWhere("flagged", filter)} GROUP BY 1 ORDER BY 2 DESC, 1 ASC`);
  return {
    byMonth: fillMonths(months, (month) => ({ month, autoBooked: 0, staffBooked: 0, waiting: 0, dismissed: 0 })),
    byReason: reasonRows.map((r) => ({ reason: String(r.reason), count: Number(r.n) })),
  };
}

function orderBy(sort: InboxItemReportSort, dir: "asc" | "desc"): SQL {
  const d = dir === "asc" ? sql.raw("ASC") : sql.raw("DESC");
  const id = sql`${i.id} ${d}`;
  if (sort === "receivedAt") return sql`${i.receivedAt} ${d}, ${id}`;
  if (sort === "fromAddress") return sql`${i.fromAddress} ${d} NULLS LAST, ${id}`;
  if (sort === "outcome") return sql`${outcomeSql} ${d}, ${i.receivedAt} DESC, ${id}`;
  return sql`${i.reviewReason} ${d} NULLS LAST, ${id}`;
}

const select = (_tile: InboxItemReportTile): SQL => sql`${i.id} AS id, ${i.receivedAt} AS "receivedAt", ${i.mailDate} AS "mailDate",
  ${i.fromAddress} AS "fromAddress", ${i.subject} AS subject, ${i.attachmentName} AS "attachmentName", ${i.status} AS status,
  ${outcomeSql} AS outcome, ${i.reviewReason} AS "reviewReason", ${i.vehicleId} AS "vehicleId", ${vehicles.licensePlate} AS "licensePlate",
  ${i.processedAt} AS "processedAt",
  (CASE WHEN ${outcomeSql} IN ('staffBooked', 'dismissed') THEN ${i.updatedBy} END) AS "handledBy",
  (${tileAmount(_tile)})::float8 AS amount`;

const iso = (v: unknown): string => (v instanceof Date ? v.toISOString() : new Date(String(v)).toISOString());
const isoOrNull = (v: unknown): string | null => (v == null ? null : iso(v));

const mapRow = (row: Record<string, any>): InboxItemReportRow => ({
  id: Number(row.id),
  receivedAt: iso(row.receivedAt),
  mailDate: isoOrNull(row.mailDate),
  fromAddress: row.fromAddress ?? null,
  subject: row.subject ?? null,
  attachmentName: row.attachmentName ?? null,
  status: String(row.status),
  outcome: row.outcome as InboxItemOutcome,
  reviewReason: row.reviewReason ?? null,
  vehicleId: row.vehicleId == null ? null : Number(row.vehicleId),
  licensePlate: row.licensePlate ?? null,
  processedAt: isoOrNull(row.processedAt),
  handledBy: row.handledBy ?? null,
  amount: Number(row.amount),
});

export const invoiceInboxItemsReport = sqlReport<InboxItemReportTile, InboxItemReportSort, InboxItemReportRow, Omit<InboxItemReportSummary, "tiles">>({
  key: "invoice-inbox-items",
  tiles: INBOX_ITEM_REPORT_TILES,
  sorts: INBOX_ITEM_REPORT_SORTS,
  defaultSort: "receivedAt",
  defaultDir: "desc",
  from: FROM,
  tileWhere,
  tileAmount,
  select,
  orderBy,
  mapRow,
  extras,
});
