/**
 * Rapporten fase 2, onderdeel 1: the fines report. Period day = the office day
 * of the offence; the amount is the fine's total (fine + admin fee). Tiles:
 * new / linked / cancelled by status, legacy = the old statuses (charged, paid,
 * disputed), total = everything but cancelled.
 */
import { sql, type SQL } from "drizzle-orm";
import { db } from "../../db";
import { customers, drivers, fines } from "../../../shared/schema";
import { LEGACY_FINE_STATUSES } from "../../../shared/fines";
import {
  FINE_REPORT_SORTS,
  FINE_REPORT_TILES,
  type FineReportRow,
  type FineReportSort,
  type FineReportSummary,
  type FineReportTile,
} from "../../../shared/reports/fines-report";
import { REPORT_BREAKDOWN_LIMIT, fillMonths, type ReportBreakdownRow, type ReportTileTotal } from "../../../shared/report-kit";
import { inPeriodSql, money, officeDaySql, textDaySql, type ReportDefinition, type ReportFilter } from "./report-kit";

const offenceDay = officeDaySql(fines.offenceAt);
const linkedDay = officeDaySql(fines.linkedAt);

function periodWhere(filter: ReportFilter): SQL {
  const vehicle = filter.vehicleId === null ? sql`` : sql` AND ${fines.vehicleId} = ${filter.vehicleId}`;
  return sql`${inPeriodSql(offenceDay, filter)}${vehicle}`;
}

const legacyList = sql.join(LEGACY_FINE_STATUSES.map((s) => sql`${s}`), sql`, `);

function tileWhere(tile: FineReportTile): SQL {
  switch (tile) {
    case "new": return sql`${fines.status} = 'new'`;
    case "linked": return sql`${fines.status} = 'linked'`;
    case "cancelled": return sql`${fines.status} = 'cancelled'`;
    case "legacy": return sql`${fines.status} IN (${legacyList})`;
    case "total": return sql`${fines.status} <> 'cancelled'`;
  }
}

const FROM = sql`FROM ${fines}
  LEFT JOIN ${customers} ON ${customers.id} = ${fines.customerId}
  LEFT JOIN ${drivers} ON ${drivers.id} = ${fines.driverId}`;

async function rowsOf<T>(query: SQL): Promise<T[]> {
  const result = await db.execute(query);
  return result.rows as T[];
}

async function breakdown(filter: ReportFilter, key: SQL, label: SQL): Promise<ReportBreakdownRow[]> {
  const rows = await rowsOf<{ key: number | string | null; label: string | null; count: number; amount: number }>(sql`
    SELECT ${key} AS key, ${label} AS label, count(*)::int AS count, ${money(sql`sum(${fines.totalAmount})`)} AS amount
    ${FROM}
    WHERE ${periodWhere(filter)} AND ${tileWhere("total")}
    GROUP BY 1, 2
    ORDER BY amount DESC, count DESC, 2 ASC NULLS LAST
    LIMIT ${REPORT_BREAKDOWN_LIMIT}`);
  return rows.map((r) => ({ key: r.key, label: r.label, count: Number(r.count), amount: Number(r.amount) }));
}

/** count and amount per tile (and per month) straight from tileWhere, the same condition the lists use. */
function tileColumns(): SQL {
  return sql.join(
    FINE_REPORT_TILES.map((t) => sql`count(*) FILTER (WHERE ${tileWhere(t)})::int AS ${sql.raw(`c_${t}`)},
      ${money(sql`sum(${fines.totalAmount}) FILTER (WHERE ${tileWhere(t)})`)} AS ${sql.raw(`a_${t}`)}`),
    sql`, `,
  );
}

async function summary(filter: ReportFilter): Promise<FineReportSummary> {
  const [totals] = await rowsOf<Record<string, number>>(sql`
    SELECT ${tileColumns()} FROM ${fines} WHERE ${periodWhere(filter)}`);
  const tiles = Object.fromEntries(
    FINE_REPORT_TILES.map((t) => [t, { count: Number(totals?.[`c_${t}`] ?? 0), amount: Number(totals?.[`a_${t}`] ?? 0) }]),
  ) as Record<FineReportTile, ReportTileTotal>;

  const monthRows = await rowsOf<Record<string, number | string>>(sql`
    SELECT to_char(${offenceDay}, 'YYYY-MM') AS month, ${tileColumns()}
    FROM ${fines} WHERE ${periodWhere(filter)} GROUP BY 1`);
  const months = monthRows.map((r) => ({
    month: String(r.month),
    new: Number(r.a_new), linked: Number(r.a_linked), cancelled: Number(r.a_cancelled), legacy: Number(r.a_legacy),
  }));

  const [avg] = await rowsOf<{ avg: number | null }>(sql`
    SELECT round(avg(greatest(0, ${linkedDay} - ${textDaySql(fines.receivedAt)}))::numeric, 1)::float8 AS avg
    FROM ${fines}
    WHERE ${periodWhere(filter)} AND ${fines.linkedAt} IS NOT NULL AND ${textDaySql(fines.receivedAt)} IS NOT NULL`);

  return {
    tiles,
    avgDaysToLink: avg?.avg === null || avg?.avg === undefined ? null : Number(avg.avg),
    byMonth: fillMonths(months, (month) => ({ month, new: 0, linked: 0, cancelled: 0, legacy: 0 })),
    byCustomer: await breakdown(filter, sql`${customers.id}`, sql`${customers.name}`),
    byVehicle: await breakdown(filter, sql`${fines.licensePlate}`, sql`${fines.licensePlate}`),
    byDriver: await breakdown(filter, sql`${drivers.id}`, sql`${drivers.displayName}`),
  };
}

async function count(filter: ReportFilter, tile: FineReportTile): Promise<number> {
  const [row] = await rowsOf<{ n: number }>(sql`SELECT count(*)::int AS n FROM ${fines} WHERE ${periodWhere(filter)} AND ${tileWhere(tile)}`);
  return Number(row?.n ?? 0);
}

function orderBy(sort: FineReportSort, dir: "asc" | "desc"): SQL {
  const d = dir === "asc" ? sql.raw("ASC") : sql.raw("DESC");
  switch (sort) {
    case "offenceAt": return sql`${fines.offenceAt} ${d}, ${fines.id} ${d}`;
    case "amount": return sql`${fines.totalAmount} ${d}, ${fines.id} ${d}`;
    case "status": return sql`${fines.status} ${d}, ${fines.id} ${d}`;
    case "licensePlate": return sql`lower(${fines.licensePlate}) ${d}, ${fines.id} ${d}`;
    case "customer": return sql`lower(${customers.name}) ${d} NULLS LAST, ${fines.id} ${d}`;
  }
}

const iso = (value: unknown): string | null => (value === null || value === undefined ? null : new Date(value as string | Date).toISOString());

async function list(
  filter: ReportFilter,
  tile: FineReportTile,
  order: { sort: FineReportSort; dir: "asc" | "desc" },
  limit: number,
  offset: number,
): Promise<FineReportRow[]> {
  const rows = await rowsOf<Record<string, any>>(sql`
    SELECT ${fines.id} AS id, ${fines.offenceAt} AS "offenceAt", ${fines.receivedAt} AS "receivedAt",
      ${fines.licensePlate} AS "licensePlate", ${fines.vehicleId} AS "vehicleId", ${fines.description} AS description,
      ${fines.reference} AS reference, ${fines.status} AS status, ${fines.totalAmount}::float8 AS amount,
      ${fines.customerId} AS "customerId", ${customers.name} AS "customerName",
      ${drivers.displayName} AS "driverName", ${fines.linkedAt} AS "linkedAt"
    ${FROM}
    WHERE ${periodWhere(filter)} AND ${tileWhere(tile)}
    ORDER BY ${orderBy(order.sort, order.dir)}
    LIMIT ${limit} OFFSET ${offset}`);
  return rows.map((r) => ({
    id: Number(r.id),
    offenceAt: iso(r.offenceAt) as string,
    receivedAt: r.receivedAt ?? null,
    licensePlate: r.licensePlate,
    vehicleId: r.vehicleId === null ? null : Number(r.vehicleId),
    description: r.description,
    reference: r.reference ?? null,
    status: r.status,
    amount: Number(r.amount),
    customerId: r.customerId === null ? null : Number(r.customerId),
    customerName: r.customerName ?? null,
    driverName: r.driverName ?? null,
    linkedAt: iso(r.linkedAt),
  }));
}

export const finesReport: ReportDefinition<FineReportTile, FineReportSort, FineReportRow, FineReportSummary> = {
  key: "fines",
  tiles: FINE_REPORT_TILES,
  sorts: FINE_REPORT_SORTS,
  defaultSort: "offenceAt",
  defaultDir: "desc",
  summary,
  count,
  list,
};
