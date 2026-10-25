/**
 * Rapporten fase 4, onderdeel 11: waitlist. Period day = office day of created_at for every tile.
 * Wanted type = the entry's own type, else the type of the chosen vehicle. Not fulfilled = anything
 * but 'fulfilled'. Waiting time = office day of fulfilled_at minus office day of created_at.
 * The vehicle filter is ignored. No money: amount is always 0.
 */
import { sql, type SQL } from "drizzle-orm";
import { customers, vehicles, vehicleWaitlist } from "../../../shared/schema";
import {
  WAITLIST_REPORT_SORTS,
  WAITLIST_REPORT_TILES,
  type WaitlistReportRow,
  type WaitlistReportSort,
  type WaitlistReportSummary,
  type WaitlistReportTile,
} from "../../../shared/reports/waitlist-report";
import { fillMonths } from "../../../shared/report-kit";
import { inPeriodSql, officeDaySql, type ReportFilter } from "./report-kit";
import { rowsOf, sqlReport } from "./sql-report";

const w = vehicleWaitlist;
const createdDay = officeDaySql(w.createdAt);
const fulfilledDay = officeDaySql(w.fulfilledAt);
const isOpen = sql`${w.status} IN ('active', 'contacted')`;
const wantedType = sql`coalesce(nullif(btrim(${w.vehicleType}), ''), nullif(btrim(${vehicles.vehicleType}), ''))`;
const daysToFulfil = sql`(CASE WHEN ${w.fulfilledAt} IS NOT NULL THEN ${fulfilledDay} - ${createdDay} END)`;

function tileWhere(tile: WaitlistReportTile, filter: ReportFilter): SQL {
  const period = inPeriodSql(createdDay, filter);
  switch (tile) {
    case "all": return period;
    case "open": return sql`${period} AND ${isOpen}`;
    case "fulfilled": return sql`${period} AND ${w.status} = 'fulfilled'`;
    case "cancelled": return sql`${period} AND ${w.status} = 'cancelled'`;
  }
}

const tileAmount = (_tile: WaitlistReportTile): SQL => sql`0`;

const FROM = sql`${w} JOIN ${customers} ON ${customers.id} = ${w.customerId} LEFT JOIN ${vehicles} ON ${vehicles.id} = ${w.vehicleId}`;

async function extras(filter: ReportFilter): Promise<Omit<WaitlistReportSummary, "tiles">> {
  const inAll = tileWhere("all", filter);

  const monthRows = await rowsOf<Record<string, number | string>>(sql`
    SELECT to_char(${createdDay}, 'YYYY-MM') AS month,
      count(*) FILTER (WHERE ${isOpen})::int AS open,
      count(*) FILTER (WHERE ${w.status} = 'fulfilled')::int AS fulfilled,
      count(*) FILTER (WHERE ${w.status} = 'cancelled')::int AS cancelled
    FROM ${FROM} WHERE ${inAll} GROUP BY 1`);
  const months = monthRows.map((m) => ({
    month: String(m.month), open: Number(m.open), fulfilled: Number(m.fulfilled), cancelled: Number(m.cancelled),
  }));

  const typeRows = await rowsOf<Record<string, number | string | null>>(sql`
    SELECT ${wantedType} AS "vehicleType", count(*)::int AS total,
      count(*) FILTER (WHERE ${w.status} = 'fulfilled')::int AS fulfilled,
      count(*) FILTER (WHERE ${w.status} <> 'fulfilled')::int AS "notFulfilled",
      round(avg(${daysToFulfil})::numeric, 1)::float8 AS "avgDaysToFulfil"
    FROM ${FROM} WHERE ${inAll}
    GROUP BY ${wantedType}
    ORDER BY "notFulfilled" DESC, total DESC, ${wantedType} ASC NULLS LAST`);

  const [avg] = await rowsOf<{ avg: number | null }>(sql`
    SELECT round(avg(${daysToFulfil})::numeric, 1)::float8 AS avg FROM ${FROM} WHERE ${inAll}`);

  return {
    byMonth: fillMonths(months, (month) => ({ month, open: 0, fulfilled: 0, cancelled: 0 })),
    byType: typeRows.map((t) => ({
      vehicleType: t.vehicleType === null || t.vehicleType === undefined ? null : String(t.vehicleType),
      total: Number(t.total),
      fulfilled: Number(t.fulfilled),
      notFulfilled: Number(t.notFulfilled),
      avgDaysToFulfil: t.avgDaysToFulfil === null || t.avgDaysToFulfil === undefined ? null : Number(t.avgDaysToFulfil),
    })),
    avgDaysToFulfil: avg?.avg === null || avg?.avg === undefined ? null : Number(avg.avg),
  };
}

function orderBy(sort: WaitlistReportSort, dir: "asc" | "desc"): SQL {
  const d = dir === "asc" ? sql.raw("ASC") : sql.raw("DESC");
  const id = sql`${w.id} ${d}`;
  switch (sort) {
    case "createdAt": return sql`${w.createdAt} ${d}, ${id}`;
    case "preferredStartDate": return sql`${w.preferredStartDate} ${d}, ${id}`;
    case "status": return sql`${w.status} ${d}, ${id}`;
    case "customer": return sql`${customers.name} ${d}, ${id}`;
    case "vehicleType": return sql`${wantedType} ${d} NULLS LAST, ${id}`;
  }
}

const select = (_tile: WaitlistReportTile): SQL => sql`${w.id} AS id, ${w.createdAt} AS "createdAt",
  ${w.customerId} AS "customerId", ${customers.name} AS "customerName",
  ${wantedType} AS "vehicleType", ${w.vehicleId} AS "vehicleId", ${vehicles.licensePlate} AS "licensePlate",
  ${w.preferredStartDate} AS "preferredStartDate", ${w.preferredEndDate} AS "preferredEndDate",
  ${w.duration} AS duration, ${w.priority} AS priority, ${w.status} AS status,
  ${w.contactedAt} AS "contactedAt", ${w.fulfilledAt} AS "fulfilledAt",
  (${daysToFulfil})::int AS "daysToFulfil", 0::float8 AS amount`;

const iso = (v: unknown): string | null => (v === null || v === undefined ? null : v instanceof Date ? v.toISOString() : new Date(String(v)).toISOString());
const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

const mapRow = (row: Record<string, any>): WaitlistReportRow => ({
  id: Number(row.id),
  createdAt: iso(row.createdAt) ?? "",
  customerId: Number(row.customerId),
  customerName: row.customerName ?? null,
  vehicleType: row.vehicleType ?? null,
  vehicleId: num(row.vehicleId),
  licensePlate: row.licensePlate ?? null,
  preferredStartDate: row.preferredStartDate,
  preferredEndDate: row.preferredEndDate ?? null,
  duration: num(row.duration),
  priority: row.priority,
  status: row.status,
  contactedAt: iso(row.contactedAt),
  fulfilledAt: iso(row.fulfilledAt),
  daysToFulfil: num(row.daysToFulfil),
  amount: Number(row.amount),
});

export const waitlistReport = sqlReport<WaitlistReportTile, WaitlistReportSort, WaitlistReportRow, Omit<WaitlistReportSummary, "tiles">>({
  key: "waitlist",
  tiles: WAITLIST_REPORT_TILES,
  sorts: WAITLIST_REPORT_SORTS,
  defaultSort: "createdAt",
  defaultDir: "desc",
  from: FROM,
  tileWhere,
  tileAmount,
  select,
  orderBy,
  mapRow,
  extras,
});
