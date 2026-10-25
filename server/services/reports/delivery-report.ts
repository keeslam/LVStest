/**
 * Rapporten fase 5, onderdeel 13: deliveries and collections. Source: vehicle_transports of type
 * delivery and repossession that are not cancelled (swaps and tows are in the transport billing
 * report). Period day = planned day. Every trip is exactly one of onTime / late / open / undated:
 * done on or before the planned day = on time; done after it, or not done while the planned day
 * is before today (office day) = late; not done and not yet due = open; done without a completion
 * date = undated. Money (amount) is the km of the trip. External vehicles have no vehicle id and
 * drop out when a vehicle is chosen.
 */
import { sql, type SQL } from "drizzle-orm";
import { customers, vehicles, vehicleTransports } from "../../../shared/schema";
import {
  DELIVERY_REPORT_DRILLS,
  DELIVERY_REPORT_SORTS,
  DELIVERY_REPORT_TILES,
  DELIVERY_REPORT_TYPES,
  type DeliveryPunctuality,
  type DeliveryReportRow,
  type DeliveryReportSort,
  type DeliveryReportSummary,
  type DeliveryReportTile,
} from "../../../shared/reports/delivery-report";
import { fillMonths } from "../../../shared/report-kit";
import { inPeriodSql, keyIs, money, officeDaySql, textDaySql, type ReportDrill, type ReportFilter } from "./report-kit";
import { rowsOf, sqlReport } from "./sql-report";

const t = vehicleTransports;
const plan = textDaySql(t.scheduledDate);
const done = textDaySql(sql`nullif(${t.completedDate}, '')`);
const today = officeDaySql(sql`now()`);
const licensePlate = sql`(CASE WHEN ${t.isExternalVehicle} THEN ${t.externalLicensePlate} ELSE ${vehicles.licensePlate} END)`;
const driver = sql`nullif(btrim(${t.driverName}), '')`;
const km = sql`coalesce(${t.distanceKm}::numeric, 0)`;

/** The one place that decides on time / late / open / undated (tiles, rows and charts all read it). */
const punctualitySql = sql`(CASE
  WHEN ${t.status} = 'completed' AND ${done} IS NOT NULL AND ${done} <= ${plan} THEN 'onTime'
  WHEN ${t.status} = 'completed' AND ${done} > ${plan} THEN 'late'
  WHEN ${t.status} = 'completed' THEN 'undated'
  WHEN ${plan} < ${today} THEN 'late'
  ELSE 'open' END)`;

const daysLateSql = sql`(CASE
  WHEN ${punctualitySql} <> 'late' THEN NULL
  WHEN ${t.status} = 'completed' THEN (${done} - ${plan})
  ELSE (${today} - ${plan}) END)`;

const typeList = sql.join(DELIVERY_REPORT_TYPES.map((x) => sql`${x}`), sql`, `);

/** Delivery or collection, not cancelled, planned inside the period, optionally one vehicle. */
function baseWhere(filter: ReportFilter): SQL {
  const vehicle = filter.vehicleId === null ? sql`` : sql` AND ${t.vehicleId} = ${filter.vehicleId}`;
  return sql`${t.transportType} IN (${typeList}) AND ${t.status} <> 'cancelled' AND ${inPeriodSql(plan, filter)}${vehicle}`;
}

function tileWhere(tile: DeliveryReportTile, filter: ReportFilter): SQL {
  return tile === "all" ? baseWhere(filter) : sql`${baseWhere(filter)} AND ${punctualitySql} = ${tile}`;
}

const tileAmount = (_tile: DeliveryReportTile): SQL => km;

/** The group expressions of the type and driver breakdowns are the drill keys. */
function drillWhere(drill: ReportDrill): SQL {
  switch (drill.name as (typeof DELIVERY_REPORT_DRILLS)[number]) {
    case "type": return keyIs(t.transportType, drill.key);
    case "driver": return keyIs(driver, drill.key);
  }
}

const FROM = sql`${t}
  LEFT JOIN ${vehicles} ON ${vehicles.id} = ${t.vehicleId}
  LEFT JOIN ${customers} ON ${customers.id} = ${t.customerId}`;

const countOf = (p: DeliveryPunctuality) => sql`count(*) FILTER (WHERE ${punctualitySql} = ${p})::int`;
const round1 = (n: number) => Math.round(n * 10) / 10;

async function extras(filter: ReportFilter): Promise<Omit<DeliveryReportSummary, "tiles">> {
  const where = baseWhere(filter);

  const monthRows = await rowsOf<Record<string, number | string>>(sql`
    SELECT to_char(${plan}, 'YYYY-MM') AS month, ${countOf("onTime")} AS "onTime", ${countOf("late")} AS late,
      ${countOf("open")} AS open, ${countOf("undated")} AS undated
    FROM ${FROM} WHERE ${where} GROUP BY 1`);
  const months = monthRows.map((r) => ({
    month: String(r.month), onTime: Number(r.onTime), late: Number(r.late), open: Number(r.open), undated: Number(r.undated),
  }));

  const typeRows = await rowsOf<Record<string, number | string>>(sql`
    SELECT ${t.transportType} AS type, count(*)::int AS total, ${countOf("onTime")} AS "onTime", ${countOf("late")} AS late,
      ${countOf("open")} AS open, ${countOf("undated")} AS undated, ${money(sql`sum(${km})`)} AS km
    FROM ${FROM} WHERE ${where} GROUP BY ${t.transportType}`);
  const byType = DELIVERY_REPORT_TYPES.flatMap((type) => {
    const r = typeRows.find((x) => x.type === type);
    return r
      ? [{ type, total: Number(r.total), onTime: Number(r.onTime), late: Number(r.late), open: Number(r.open), undated: Number(r.undated), km: Number(r.km) }]
      : [];
  });

  const driverRows = await rowsOf<Record<string, number | string | null>>(sql`
    SELECT ${driver} AS driver, count(*)::int AS trips, ${countOf("onTime")} AS "onTime", ${countOf("late")} AS late,
      ${money(sql`sum(${km})`)} AS km
    FROM ${FROM} WHERE ${where} GROUP BY 1
    ORDER BY trips DESC, driver ASC NULLS LAST`);

  const [sums] = await rowsOf<Record<string, number>>(sql`
    SELECT ${countOf("onTime")} AS "onTime", ${countOf("late")} AS late,
      count(*) FILTER (WHERE ${t.distanceKm} IS NOT NULL)::int AS "withDistance",
      ${money(sql`sum(${km})`)} AS km
    FROM ${FROM} WHERE ${where}`);
  const onTime = Number(sums?.onTime ?? 0);
  const late = Number(sums?.late ?? 0);
  const withDistance = Number(sums?.withDistance ?? 0);

  return {
    byMonth: fillMonths(months, (month) => ({ month, onTime: 0, late: 0, open: 0, undated: 0 })),
    byType,
    byDriver: driverRows.map((r) => ({
      driver: r.driver === null ? null : String(r.driver),
      trips: Number(r.trips), onTime: Number(r.onTime), late: Number(r.late), km: Number(r.km),
    })),
    onTimePct: onTime + late === 0 ? null : round1((onTime / (onTime + late)) * 100),
    avgKmPerTrip: withDistance === 0 ? null : round1(Number(sums?.km ?? 0) / withDistance),
    tripsWithDistance: withDistance,
  };
}

function orderBy(sort: DeliveryReportSort, dir: "asc" | "desc"): SQL {
  const d = dir === "asc" ? sql.raw("ASC") : sql.raw("DESC");
  const id = sql`${t.id} ${d}`;
  switch (sort) {
    case "scheduledDate": return sql`${plan} ${d} NULLS LAST, ${id}`;
    case "completedDate": return sql`${done} ${d} NULLS LAST, ${id}`;
    case "transportType": return sql`${t.transportType} ${d}, ${id}`;
    case "driver": return sql`${driver} ${d} NULLS LAST, ${id}`;
    case "distanceKm": return sql`${t.distanceKm}::numeric ${d} NULLS LAST, ${id}`;
    case "daysLate": return sql`${daysLateSql} ${d} NULLS LAST, ${id}`;
  }
}

const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

const select = (tile: DeliveryReportTile): SQL => sql`${t.id} AS id, ${t.transportType} AS "transportType", ${t.status} AS status,
  to_char(${plan}, 'YYYY-MM-DD') AS "scheduledDate", to_char(${done}, 'YYYY-MM-DD') AS "completedDate",
  ${punctualitySql} AS punctuality, ${daysLateSql} AS "daysLate",
  ${t.vehicleId} AS "vehicleId", ${licensePlate} AS "licensePlate", ${t.isExternalVehicle} AS "isExternalVehicle",
  ${t.customerId} AS "customerId", ${customers.name} AS "customerName", ${t.reservationId} AS "reservationId",
  ${driver} AS "driverName", ${t.distanceKm}::float8 AS "distanceKm",
  round(${tileAmount(tile)}, 2)::float8 AS amount`;

const mapRow = (r: Record<string, any>): DeliveryReportRow => ({
  id: Number(r.id),
  transportType: r.transportType,
  status: r.status,
  scheduledDate: r.scheduledDate ?? "",
  completedDate: r.completedDate ?? null,
  punctuality: r.punctuality,
  daysLate: num(r.daysLate),
  vehicleId: num(r.vehicleId),
  licensePlate: r.licensePlate ?? null,
  isExternalVehicle: Boolean(r.isExternalVehicle),
  customerId: num(r.customerId),
  customerName: r.customerName ?? null,
  reservationId: num(r.reservationId),
  driverName: r.driverName ?? null,
  distanceKm: num(r.distanceKm),
  amount: Number(r.amount),
});

export const deliveryReport = sqlReport<DeliveryReportTile, DeliveryReportSort, DeliveryReportRow, Omit<DeliveryReportSummary, "tiles">>({
  key: "deliveries",
  tiles: DELIVERY_REPORT_TILES,
  sorts: DELIVERY_REPORT_SORTS,
  defaultSort: "scheduledDate",
  defaultDir: "desc",
  from: FROM,
  drills: DELIVERY_REPORT_DRILLS,
  drillWhere,
  tileWhere,
  tileAmount,
  select,
  orderBy,
  mapRow,
  extras,
});
