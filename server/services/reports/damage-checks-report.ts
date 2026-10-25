/**
 * Rapporten fase 5, onderdeel 14: damage checks. Source: interactive_damage_checks, day = office
 * day of check_date. A check on a reservation in the recycle bin does not count; a check without
 * a reservation does (customer null). "With damage" = a return check with at least one marker, read
 * with the same regex as the customer value report (NON_EMPTY_JSON_ARRAY), so bad JSON never throws.
 */
import { sql, type SQL } from "drizzle-orm";
import { customers, interactiveDamageChecks, reservations, vehicles } from "../../../shared/schema";
import {
  DAMAGE_CHECK_REPORT_SORTS,
  DAMAGE_CHECK_REPORT_TILES,
  type DamageCheckReportRow,
  type DamageCheckReportSort,
  type DamageCheckReportSummary,
  type DamageCheckReportTile,
} from "../../../shared/reports/damage-checks-report";
import { fillMonths } from "../../../shared/report-kit";
import { inPeriodSql, instantSql, NON_EMPTY_JSON_ARRAY, officeDaySql, type ReportFilter } from "./report-kit";
import { reportBreakdown, rowsOf, sqlReport } from "./sql-report";

const d = interactiveDamageChecks;
const r = reservations;
const day = officeDaySql(d.checkDate);

/** The one place that decides "with damage" (tile, rows and charts read it). */
const hasDamageSql = sql`(${d.checkType} = 'return' AND coalesce(${d.damageMarkers}, '') ~ ${NON_EMPTY_JSON_ARRAY})`;

function baseWhere(filter: ReportFilter): SQL {
  const vehicle = filter.vehicleId === null ? sql`` : sql` AND ${d.vehicleId} = ${filter.vehicleId}`;
  return sql`(${d.reservationId} IS NULL OR ${r.deletedAt} IS NULL) AND ${inPeriodSql(day, filter)}${vehicle}`;
}

function tileWhere(tile: DamageCheckReportTile, filter: ReportFilter): SQL {
  const base = baseWhere(filter);
  switch (tile) {
    case "all": return base;
    case "pickup": return sql`${base} AND ${d.checkType} = 'pickup'`;
    case "return": return sql`${base} AND ${d.checkType} = 'return'`;
    case "withDamage": return sql`${base} AND ${hasDamageSql}`;
  }
}

const tileAmount = (_tile: DamageCheckReportTile): SQL => sql`0`;

const FROM = sql`${d}
  INNER JOIN ${vehicles} ON ${vehicles.id} = ${d.vehicleId}
  LEFT JOIN ${r} ON ${r.id} = ${d.reservationId}
  LEFT JOIN ${customers} ON ${customers.id} = ${r.customerId}`;

async function extras(filter: ReportFilter): Promise<Omit<DamageCheckReportSummary, "tiles">> {
  const monthRows = await rowsOf<Record<string, number | string>>(sql`
    SELECT to_char(${day}, 'YYYY-MM') AS month,
      count(*) FILTER (WHERE ${d.checkType} = 'pickup')::int AS pickup,
      count(*) FILTER (WHERE ${d.checkType} = 'return')::int AS "return",
      count(*) FILTER (WHERE ${hasDamageSql})::int AS "withDamage"
    FROM ${FROM} WHERE ${baseWhere(filter)} GROUP BY 1`);
  const months = monthRows.map((m) => ({
    month: String(m.month), pickup: Number(m.pickup), return: Number(m.return), withDamage: Number(m.withDamage),
  }));

  const where = tileWhere("withDamage", filter);
  const amount = tileAmount("withDamage");
  const [byVehicle, byCustomer] = await Promise.all([
    reportBreakdown({ from: FROM, where, key: sql`${d.vehicleId}`, label: sql`${vehicles.licensePlate}`, amount }),
    reportBreakdown({ from: FROM, where, key: sql`${r.customerId}`, label: sql`${customers.name}`, amount }),
  ]);

  return {
    byMonth: fillMonths(months, (month) => ({ month, pickup: 0, return: 0, withDamage: 0 })),
    byVehicle,
    byCustomer,
  };
}

function orderBy(sort: DamageCheckReportSort, dir: "asc" | "desc"): SQL {
  const o = dir === "asc" ? sql.raw("ASC") : sql.raw("DESC");
  const id = sql`${d.id} ${o}`;
  switch (sort) {
    case "checkDate": return sql`${d.checkDate} ${o}, ${id}`;
    case "checkType": return sql`${d.checkType} ${o}, ${id}`;
    case "licensePlate": return sql`${vehicles.licensePlate} ${o} NULLS LAST, ${id}`;
    case "customer": return sql`${customers.name} ${o} NULLS LAST, ${id}`;
  }
}

const select = (tile: DamageCheckReportTile): SQL => sql`${d.id} AS id, to_char(${instantSql(d.checkDate)} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "checkDate", ${d.checkType} AS "checkType",
  ${d.vehicleId} AS "vehicleId", ${vehicles.licensePlate} AS "licensePlate", ${d.reservationId} AS "reservationId",
  ${r.customerId} AS "customerId", ${customers.name} AS "customerName", ${d.completedBy} AS "completedBy",
  ${hasDamageSql} AS "hasDamage", (${tileAmount(tile)})::float8 AS amount`;

const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

const mapRow = (row: Record<string, any>): DamageCheckReportRow => ({
  id: Number(row.id),
  checkDate: String(row.checkDate),
  checkType: row.checkType,
  vehicleId: Number(row.vehicleId),
  licensePlate: row.licensePlate ?? null,
  reservationId: num(row.reservationId),
  customerId: num(row.customerId),
  customerName: row.customerName ?? null,
  completedBy: row.completedBy ?? null,
  hasDamage: Boolean(row.hasDamage),
  amount: Number(row.amount),
});

export const damageChecksReport = sqlReport<DamageCheckReportTile, DamageCheckReportSort, DamageCheckReportRow, Omit<DamageCheckReportSummary, "tiles">>({
  key: "damage-checks",
  tiles: DAMAGE_CHECK_REPORT_TILES,
  sorts: DAMAGE_CHECK_REPORT_SORTS,
  defaultSort: "checkDate",
  defaultDir: "desc",
  from: FROM,
  tileWhere,
  tileAmount,
  select,
  orderBy,
  mapRow,
  extras,
});
