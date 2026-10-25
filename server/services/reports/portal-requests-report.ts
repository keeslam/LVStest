/**
 * Rapporten fase 4, onderdeel 10: portal requests. Period day = office day of created_at.
 * Tiles all / open / done / rejected sit in the period; stale (open, older than
 * PORTAL_STALE_DAYS) ignores the period: it is a work list. The vehicle filter is ignored
 * (requests rarely concern one car). No money: amount is always 0.
 */
import { sql, type SQL } from "drizzle-orm";
import { customers, portalRequestMessages, portalRequests } from "../../../shared/schema";
import {
  PORTAL_REQUEST_REPORT_DRILLS,
  PORTAL_REQUEST_REPORT_SORTS,
  PORTAL_REQUEST_REPORT_TILES,
  PORTAL_STALE_DAYS,
  type PortalRequestReportRow,
  type PortalRequestReportSort,
  type PortalRequestReportSummary,
  type PortalRequestReportTile,
} from "../../../shared/reports/portal-requests-report";
import { fillMonths } from "../../../shared/report-kit";
import { inPeriodSql, instantSql, keyIs, officeDaySql, type ReportDrill, type ReportFilter } from "./report-kit";
import { reportBreakdown, rowsOf, sqlReport } from "./sql-report";

const r = portalRequests;
const createdDay = officeDaySql(r.createdAt);
const isOpen = sql`${r.status} IN ('new', 'in_progress')`;
/**
 * Reaction time runs to the FIRST staff reply: the earliest staff message on the request, else
 * replied_at (older requests without messages). replied_at alone is overwritten on every reply.
 */
const m = portalRequestMessages;
const firstReplyAt = sql`coalesce(
  (SELECT min(${instantSql(sql`m.created_at`)}) FROM ${m} m WHERE m.request_id = ${r.id} AND m.author = 'staff'),
  ${instantSql(r.repliedAt)})`;
const replySeconds = sql`extract(epoch FROM ${firstReplyAt} - ${instantSql(r.createdAt)})`;

function tileWhere(tile: PortalRequestReportTile, filter: ReportFilter): SQL {
  const period = inPeriodSql(createdDay, filter);
  switch (tile) {
    case "all": return period;
    case "open": return sql`${period} AND ${isOpen}`;
    case "done": return sql`${period} AND ${r.status} = 'done'`;
    case "rejected": return sql`${period} AND ${r.status} = 'rejected'`;
    case "stale": return sql`${isOpen} AND ${instantSql(r.createdAt)} < now() - make_interval(days => ${PORTAL_STALE_DAYS})`;
  }
}

const tileAmount = (_tile: PortalRequestReportTile): SQL => sql`0`;

/** Breakdown keys and the handler line's own rule (done or rejected, with a handler), shared by the summary and the drill. */
const TYPE_KEY = sql`${r.type}`;
const HANDLER_KEY = sql`${r.handledBy}`;
const HANDLED = sql`${r.status} IN ('done', 'rejected') AND ${r.handledBy} IS NOT NULL`;

function drillWhere(drill: ReportDrill): SQL {
  switch (drill.name as (typeof PORTAL_REQUEST_REPORT_DRILLS)[number]) {
    case "type": return keyIs(TYPE_KEY, drill.key);
    case "handler": return sql`${HANDLED} AND ${keyIs(HANDLER_KEY, drill.key)}`;
  }
}

const FROM = sql`${r} JOIN ${customers} ON ${customers.id} = ${r.customerId}`;

async function extras(filter: ReportFilter): Promise<Omit<PortalRequestReportSummary, "tiles">> {
  const inAll = tileWhere("all", filter);

  const monthRows = await rowsOf<Record<string, number | string>>(sql`
    SELECT to_char(${createdDay}, 'YYYY-MM') AS month,
      count(*) FILTER (WHERE ${r.status} = 'new')::int AS new,
      count(*) FILTER (WHERE ${r.status} = 'in_progress')::int AS "inProgress",
      count(*) FILTER (WHERE ${r.status} = 'done')::int AS done,
      count(*) FILTER (WHERE ${r.status} = 'rejected')::int AS rejected
    FROM ${FROM} WHERE ${inAll} GROUP BY 1`);
  const months = monthRows.map((m) => ({
    month: String(m.month), new: Number(m.new), inProgress: Number(m.inProgress), done: Number(m.done), rejected: Number(m.rejected),
  }));

  const typeRows = await rowsOf<Record<string, number | string>>(sql`
    SELECT ${r.type} AS type, count(*)::int AS total,
      count(*) FILTER (WHERE ${isOpen})::int AS open,
      count(*) FILTER (WHERE ${r.status} = 'done')::int AS done,
      count(*) FILTER (WHERE ${r.status} = 'rejected')::int AS rejected
    FROM ${FROM} WHERE ${inAll}
    GROUP BY ${r.type}
    ORDER BY total DESC, ${r.type} ASC`);

  const byHandler = await reportBreakdown({
    from: FROM,
    where: sql`${inAll} AND ${HANDLED}`,
    key: HANDLER_KEY,
    label: sql`${r.handledBy}`,
    amount: sql`0`,
  });

  const [reply] = await rowsOf<{ median: number | null; n: number }>(sql`
    SELECT round((percentile_cont(0.5) WITHIN GROUP (ORDER BY ${replySeconds}) / 3600)::numeric, 1)::float8 AS median,
      count(*)::int AS n
    FROM ${FROM} WHERE ${inAll} AND ${firstReplyAt} IS NOT NULL`);

  return {
    byMonth: fillMonths(months, (month) => ({ month, new: 0, inProgress: 0, done: 0, rejected: 0 })),
    byType: typeRows.map((t) => ({
      type: String(t.type), total: Number(t.total), open: Number(t.open), done: Number(t.done), rejected: Number(t.rejected),
    })),
    byHandler,
    medianReplyHours: reply?.median === null || reply?.median === undefined ? null : Number(reply.median),
    repliedCount: Number(reply?.n ?? 0),
  };
}

function orderBy(sort: PortalRequestReportSort, dir: "asc" | "desc"): SQL {
  const d = dir === "asc" ? sql.raw("ASC") : sql.raw("DESC");
  const id = sql`${r.id} ${d}`;
  switch (sort) {
    case "createdAt": return sql`${r.createdAt} ${d}, ${id}`;
    case "type": return sql`${r.type} ${d}, ${id}`;
    case "status": return sql`${r.status} ${d}, ${id}`;
    case "customer": return sql`${customers.name} ${d}, ${id}`;
    case "replyHours": return sql`${replySeconds} ${d} NULLS LAST, ${id}`;
  }
}

const select = (_tile: PortalRequestReportTile): SQL => sql`${r.id} AS id, ${r.createdAt} AS "createdAt", ${r.type} AS type, ${r.status} AS status,
  ${r.customerId} AS "customerId", ${customers.name} AS "customerName", ${r.handledBy} AS "handledBy", ${r.repliedAt} AS "repliedAt",
  round((${replySeconds} / 3600)::numeric, 1)::float8 AS "replyHours",
  (CASE WHEN ${isOpen} THEN (${officeDaySql(sql`now()`)} - ${createdDay}) END)::int AS "openDays",
  0::float8 AS amount`;

const iso = (v: unknown): string | null => (v === null || v === undefined ? null : v instanceof Date ? v.toISOString() : new Date(String(v)).toISOString());
const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

const mapRow = (row: Record<string, any>): PortalRequestReportRow => ({
  id: Number(row.id),
  createdAt: iso(row.createdAt) ?? "",
  type: row.type,
  status: row.status,
  customerId: Number(row.customerId),
  customerName: row.customerName ?? null,
  handledBy: row.handledBy ?? null,
  repliedAt: iso(row.repliedAt),
  replyHours: num(row.replyHours),
  openDays: num(row.openDays),
  amount: Number(row.amount),
});

export const portalRequestsReport = sqlReport<PortalRequestReportTile, PortalRequestReportSort, PortalRequestReportRow, Omit<PortalRequestReportSummary, "tiles">>({
  key: "portal-requests",
  tiles: PORTAL_REQUEST_REPORT_TILES,
  sorts: PORTAL_REQUEST_REPORT_SORTS,
  defaultSort: "createdAt",
  defaultDir: "desc",
  from: FROM,
  drills: PORTAL_REQUEST_REPORT_DRILLS,
  drillWhere,
  tileWhere,
  tileAmount,
  select,
  orderBy,
  mapRow,
  extras,
});
