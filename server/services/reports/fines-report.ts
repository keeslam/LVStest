/**
 * Rapporten fase 2, onderdeel 1: the fines report. Period day = the office day
 * of the offence; the amount is the fine's total (fine + admin fee). Tiles:
 * new / linked / cancelled by status, legacy = the old statuses (charged, paid,
 * disputed), total = everything but cancelled.
 */
import { sql, type SQL } from "drizzle-orm";
import { customers, drivers, fines } from "../../../shared/schema";
import { LEGACY_FINE_STATUSES } from "../../../shared/fines";
import {
  FINE_REPORT_DRILLS,
  FINE_REPORT_SORTS,
  FINE_REPORT_TILES,
  type FineReportRow,
  type FineReportSort,
  type FineReportSummary,
  type FineReportTile,
} from "../../../shared/reports/fines-report";
import { fillMonths } from "../../../shared/report-kit";
import { inPeriodSql, keyIs, money, officeDaySql, textDaySql, type ReportDrill, type ReportFilter } from "./report-kit";
import { reportBreakdown, rowsOf, sqlReport } from "./sql-report";

const offenceDay = officeDaySql(fines.offenceAt);
const linkedDay = officeDaySql(fines.linkedAt);

function periodWhere(filter: ReportFilter): SQL {
  const vehicle = filter.vehicleId === null ? sql`` : sql` AND ${fines.vehicleId} = ${filter.vehicleId}`;
  return sql`${inPeriodSql(offenceDay, filter)}${vehicle}`;
}

const legacyList = sql.join(LEGACY_FINE_STATUSES.map((s) => sql`${s}`), sql`, `);

function statusWhere(tile: FineReportTile): SQL {
  switch (tile) {
    case "new": return sql`${fines.status} = 'new'`;
    case "linked": return sql`${fines.status} = 'linked'`;
    case "cancelled": return sql`${fines.status} = 'cancelled'`;
    case "legacy": return sql`${fines.status} IN (${legacyList})`;
    case "total": return sql`${fines.status} <> 'cancelled'`;
  }
}

/** A fine belongs to a tile: offence day in the period, the vehicle filter, the tile's status. */
function tileWhere(tile: FineReportTile, filter: ReportFilter): SQL {
  return sql`${periodWhere(filter)} AND ${statusWhere(tile)}`;
}

const tileAmount = (_tile: FineReportTile): SQL => sql`${fines.totalAmount}`;

const FROM = sql`${fines}
  LEFT JOIN ${customers} ON ${customers.id} = ${fines.customerId}
  LEFT JOIN ${drivers} ON ${drivers.id} = ${fines.driverId}`;

/** The key expression of each breakdown, shared by the summary and the drill so the counts agree. */
const CUSTOMER_KEY = sql`${customers.id}`;
const VEHICLE_KEY = sql`${fines.licensePlate}`;
const DRIVER_KEY = sql`${drivers.id}`;

function drillWhere(drill: ReportDrill): SQL {
  switch (drill.name as (typeof FINE_REPORT_DRILLS)[number]) {
    case "customer": return keyIs(CUSTOMER_KEY, drill.key);
    case "vehicle": return keyIs(VEHICLE_KEY, drill.key);
    case "driver": return keyIs(DRIVER_KEY, drill.key);
  }
}

const breakdown = (filter: ReportFilter, key: SQL, label: SQL) =>
  reportBreakdown({ from: FROM, where: tileWhere("total", filter), key, label, amount: tileAmount("total") });

async function extras(filter: ReportFilter): Promise<Omit<FineReportSummary, "tiles">> {
  const monthSum = (tile: FineReportTile) => money(sql`sum(${tileAmount(tile)}) FILTER (WHERE ${tileWhere(tile, filter)})`);
  const monthRows = await rowsOf<Record<string, number | string>>(sql`
    SELECT to_char(${offenceDay}, 'YYYY-MM') AS month,
      ${monthSum("new")} AS "new", ${monthSum("linked")} AS "linked", ${monthSum("cancelled")} AS "cancelled", ${monthSum("legacy")} AS "legacy"
    FROM ${fines} WHERE ${periodWhere(filter)} GROUP BY 1`);
  const months = monthRows.map((r) => ({
    month: String(r.month),
    new: Number(r.new), linked: Number(r.linked), cancelled: Number(r.cancelled), legacy: Number(r.legacy),
  }));

  const [avg] = await rowsOf<{ avg: number | null }>(sql`
    SELECT round(avg(greatest(0, ${linkedDay} - ${textDaySql(fines.receivedAt)}))::numeric, 1)::float8 AS avg
    FROM ${fines}
    WHERE ${periodWhere(filter)} AND ${fines.linkedAt} IS NOT NULL AND ${textDaySql(fines.receivedAt)} IS NOT NULL`);

  return {
    avgDaysToLink: avg?.avg === null || avg?.avg === undefined ? null : Number(avg.avg),
    byMonth: fillMonths(months, (month) => ({ month, new: 0, linked: 0, cancelled: 0, legacy: 0 })),
    byCustomer: await breakdown(filter, CUSTOMER_KEY, sql`${customers.name}`),
    byVehicle: await breakdown(filter, VEHICLE_KEY, sql`${fines.licensePlate}`),
    byDriver: await breakdown(filter, DRIVER_KEY, sql`${drivers.displayName}`),
  };
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

const select = (): SQL => sql`${fines.id} AS id, ${fines.offenceAt} AS "offenceAt", ${fines.receivedAt} AS "receivedAt",
  ${fines.licensePlate} AS "licensePlate", ${fines.vehicleId} AS "vehicleId", ${fines.description} AS description,
  ${fines.reference} AS reference, ${fines.status} AS status, ${fines.totalAmount}::float8 AS amount,
  ${fines.customerId} AS "customerId", ${customers.name} AS "customerName",
  ${fines.driverId} AS "driverId", ${drivers.displayName} AS "driverName", ${fines.linkedAt} AS "linkedAt"`;

const mapRow = (r: Record<string, any>): FineReportRow => ({
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
  driverId: r.driverId === null ? null : Number(r.driverId),
  driverName: r.driverName ?? null,
  linkedAt: iso(r.linkedAt),
});

export const finesReport = sqlReport<FineReportTile, FineReportSort, FineReportRow, Omit<FineReportSummary, "tiles">>({
  key: "fines",
  tiles: FINE_REPORT_TILES,
  sorts: FINE_REPORT_SORTS,
  defaultSort: "offenceAt",
  defaultDir: "desc",
  from: FROM,
  drills: FINE_REPORT_DRILLS,
  drillWhere,
  tileWhere,
  tileAmount,
  select,
  orderBy,
  mapRow,
  extras,
});
