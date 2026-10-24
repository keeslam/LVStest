/**
 * Rapporten fase 2, onderdeel 3: the transport billing report. Transports that
 * are not cancelled; period day = completed day, else scheduled day. Money is
 * net. notInvoiced / invoiced add up billable_amount (empty counts 0), toll adds
 * up toll_cost. notInvoiced counts completed transports only; openAllTime =
 * notInvoiced over every period.
 */
import { sql, type SQL } from "drizzle-orm";
import { customers, vehicles, vehicleTransports } from "../../../shared/schema";
import {
  TRANSPORT_BILLING_SORTS,
  TRANSPORT_BILLING_TILES,
  type TransportBillingRow,
  type TransportBillingSort,
  type TransportBillingSummary,
  type TransportBillingTile,
} from "../../../shared/reports/transport-billing-report";
import { fillMonths } from "../../../shared/report-kit";
import { inPeriodSql, money, textDaySql, type ReportFilter } from "./report-kit";
import { rowsOf, sqlReport } from "./sql-report";

const t = vehicleTransports;
const day = textDaySql(sql`coalesce(nullif(${t.completedDate}, ''), ${t.scheduledDate})`);
const billableAmount = sql`coalesce(${t.billableAmount}::numeric, 0)`;
const tollCost = sql`coalesce(${t.tollCost}::numeric, 0)`;
const licensePlate = sql`(CASE WHEN ${t.isExternalVehicle} THEN ${t.externalLicensePlate} ELSE ${vehicles.licensePlate} END)`;

/** Not cancelled, optionally one vehicle (external vehicles have none, so they drop out). */
function baseWhere(filter: ReportFilter): SQL {
  const vehicle = filter.vehicleId === null ? sql`` : sql` AND ${t.vehicleId} = ${filter.vehicleId}`;
  return sql`${t.status} <> 'cancelled'${vehicle}`;
}

function ruleWhere(tile: TransportBillingTile): SQL {
  switch (tile) {
    // only a completed transport can be invoiced; scheduled or in-progress work is not "nog te factureren" yet
    case "notInvoiced":
    case "openAllTime": return sql`${t.billable} AND NOT ${t.invoiced} AND ${t.status} = 'completed'`;
    case "invoiced": return sql`${t.billable} AND ${t.invoiced}`;
    case "toll": return sql`${tollCost} > 0`;
  }
}

/** A transport belongs to a tile: not cancelled, inside the period (except openAllTime), and the tile's own rule. */
function tileWhere(tile: TransportBillingTile, filter: ReportFilter): SQL {
  const period = tile === "openAllTime" ? sql`` : sql` AND ${inPeriodSql(day, filter)}`;
  return sql`${baseWhere(filter)}${period} AND ${ruleWhere(tile)}`;
}

/** The money a tile adds up. */
function tileAmount(tile: TransportBillingTile): SQL {
  return tile === "toll" ? tollCost : billableAmount;
}

const FROM = sql`${t}
  LEFT JOIN ${vehicles} ON ${vehicles.id} = ${t.vehicleId}
  LEFT JOIN ${customers} ON ${customers.id} = ${t.customerId}`;

const TYPE_ORDER = sql`(CASE ${t.transportType} WHEN 'swap' THEN 1 WHEN 'tow' THEN 2 WHEN 'repossession' THEN 3 WHEN 'delivery' THEN 4 WHEN 'other' THEN 5 ELSE 6 END)`;

async function extras(filter: ReportFilter): Promise<Omit<TransportBillingSummary, "tiles">> {
  const [missing] = await rowsOf<{ n: number }>(sql`
    SELECT count(*)::int AS n FROM ${FROM} WHERE ${tileWhere("notInvoiced", filter)} AND ${t.billableAmount} IS NULL`);

  const inPeriod = sql`${baseWhere(filter)} AND ${inPeriodSql(day, filter)}`;
  const sumOf = (tile: TransportBillingTile) => money(sql`sum(${tileAmount(tile)}) FILTER (WHERE ${tileWhere(tile, filter)})`);
  const monthRows = await rowsOf<Record<string, number | string>>(sql`
    SELECT to_char(${day}, 'YYYY-MM') AS month,
      ${sumOf("invoiced")} AS invoiced, ${sumOf("notInvoiced")} AS "notInvoiced", ${sumOf("toll")} AS toll
    FROM ${FROM} WHERE ${inPeriod}
      AND (${ruleWhere("invoiced")} OR ${ruleWhere("notInvoiced")} OR ${ruleWhere("toll")}) GROUP BY 1`);
  const months = monthRows.map((r) => ({
    month: String(r.month), invoiced: Number(r.invoiced), notInvoiced: Number(r.notInvoiced), toll: Number(r.toll),
  }));

  const typeRows = await rowsOf<Record<string, number | string>>(sql`
    SELECT ${t.transportType} AS type, count(*)::int AS count,
      ${money(sql`sum(${billableAmount}) FILTER (WHERE ${t.billable})`)} AS billable,
      ${sumOf("notInvoiced")} AS "notInvoiced",
      ${sumOf("toll")} AS toll
    FROM ${FROM} WHERE ${inPeriod}
    GROUP BY ${t.transportType}
    ORDER BY ${TYPE_ORDER}, ${t.transportType}`);

  return {
    missingAmount: Number(missing?.n ?? 0),
    byMonth: fillMonths(months, (month) => ({ month, invoiced: 0, notInvoiced: 0, toll: 0 })),
    byType: typeRows.map((r) => ({
      type: String(r.type), count: Number(r.count), billable: Number(r.billable), notInvoiced: Number(r.notInvoiced), toll: Number(r.toll),
    })),
  };
}

function orderBy(sort: TransportBillingSort, dir: "asc" | "desc", tile: TransportBillingTile): SQL {
  const d = dir === "asc" ? sql.raw("ASC") : sql.raw("DESC");
  const id = sql`${t.id} ${d}`;
  switch (sort) {
    case "date": return sql`${day} ${d} NULLS LAST, ${id}`;
    case "amount": return sql`${tileAmount(tile)} ${d}, ${id}`;
    case "tollCost": return sql`${tollCost} ${d}, ${id}`;
    case "transportType": return sql`${t.transportType} ${d}, ${id}`;
    case "status": return sql`${t.status} ${d}, ${id}`;
  }
}

const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

const select = (tile: TransportBillingTile): SQL => sql`${t.id} AS id, to_char(${day}, 'YYYY-MM-DD') AS date, ${t.transportType} AS "transportType", ${t.status} AS status,
  ${t.vehicleId} AS "vehicleId", ${licensePlate} AS "licensePlate", ${t.isExternalVehicle} AS "isExternalVehicle",
  ${t.customerId} AS "customerId", ${customers.name} AS "customerName",
  ${t.billable} AS billable, ${t.billableAmount}::float8 AS "billableAmount", ${t.tollCost}::float8 AS "tollCost",
  ${t.invoiced} AS invoiced, ${t.invoicedDate} AS "invoicedDate", ${t.distanceKm}::float8 AS "distanceKm",
  round(${tileAmount(tile)}, 2)::float8 AS amount`;

const mapRow = (r: Record<string, any>): TransportBillingRow => ({
  id: Number(r.id),
  date: r.date ?? "",
  transportType: r.transportType,
  status: r.status,
  vehicleId: r.vehicleId === null ? null : Number(r.vehicleId),
  licensePlate: r.licensePlate ?? null,
  isExternalVehicle: Boolean(r.isExternalVehicle),
  customerId: r.customerId === null ? null : Number(r.customerId),
  customerName: r.customerName ?? null,
  billable: Boolean(r.billable),
  billableAmount: num(r.billableAmount),
  tollCost: num(r.tollCost),
  invoiced: Boolean(r.invoiced),
  invoicedDate: r.invoicedDate ?? null,
  distanceKm: num(r.distanceKm),
  amount: Number(r.amount),
});

export const transportBillingReport = sqlReport<TransportBillingTile, TransportBillingSort, TransportBillingRow, Omit<TransportBillingSummary, "tiles">>({
  key: "transport-billing",
  tiles: TRANSPORT_BILLING_TILES,
  sorts: TRANSPORT_BILLING_SORTS,
  defaultSort: "date",
  defaultDir: "desc",
  from: FROM,
  tileWhere,
  tileAmount,
  select,
  orderBy,
  mapRow,
  extras,
});
