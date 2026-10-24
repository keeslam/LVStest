/**
 * Rapporten fase 2, onderdeel 3: the transport billing report. Transports that
 * are not cancelled; period day = completed day, else scheduled day. Money is
 * net. notInvoiced / invoiced add up billable_amount (empty counts 0), toll adds
 * up toll_cost. openAllTime = notInvoiced over every period.
 */
import { sql, type SQL } from "drizzle-orm";
import { db } from "../../db";
import { customers, vehicles, vehicleTransports } from "../../../shared/schema";
import {
  TRANSPORT_BILLING_SORTS,
  TRANSPORT_BILLING_TILES,
  type TransportBillingRow,
  type TransportBillingSort,
  type TransportBillingSummary,
  type TransportBillingTile,
} from "../../../shared/reports/transport-billing-report";
import { fillMonths, type ReportTileTotal } from "../../../shared/report-kit";
import { inPeriodSql, money, textDaySql, type ReportDefinition, type ReportFilter } from "./report-kit";

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

function tileWhere(tile: TransportBillingTile): SQL {
  switch (tile) {
    case "notInvoiced":
    case "openAllTime": return sql`${t.billable} AND NOT ${t.invoiced}`;
    case "invoiced": return sql`${t.billable} AND ${t.invoiced}`;
    case "toll": return sql`${tollCost} > 0`;
  }
}

/** What a tile counts: its own rule, inside the period (except openAllTime). The summary and the lists both use this. */
function tileCondition(tile: TransportBillingTile, filter: ReportFilter): SQL {
  return tile === "openAllTime" ? tileWhere(tile) : sql`${inPeriodSql(day, filter)} AND ${tileWhere(tile)}`;
}

/** The money a tile adds up. */
function tileAmount(tile: TransportBillingTile): SQL {
  return tile === "toll" ? tollCost : billableAmount;
}

const FROM = sql`FROM ${t}
  LEFT JOIN ${vehicles} ON ${vehicles.id} = ${t.vehicleId}
  LEFT JOIN ${customers} ON ${customers.id} = ${t.customerId}`;

async function rowsOf<R>(query: SQL): Promise<R[]> {
  const result = await db.execute(query);
  return result.rows as R[];
}

/** count and amount per tile straight from tileCondition, the same condition the lists use. */
function tileColumns(filter: ReportFilter): SQL {
  return sql.join(
    TRANSPORT_BILLING_TILES.map((tile) => sql`count(*) FILTER (WHERE ${tileCondition(tile, filter)})::int AS ${sql.raw(`"c_${tile}"`)},
      ${money(sql`sum(${tileAmount(tile)}) FILTER (WHERE ${tileCondition(tile, filter)})`)} AS ${sql.raw(`"a_${tile}"`)}`),
    sql`, `,
  );
}

const TYPE_ORDER = sql`(CASE ${t.transportType} WHEN 'swap' THEN 1 WHEN 'tow' THEN 2 WHEN 'repossession' THEN 3 WHEN 'delivery' THEN 4 WHEN 'other' THEN 5 ELSE 6 END)`;

async function summary(filter: ReportFilter): Promise<TransportBillingSummary> {
  const [totals] = await rowsOf<Record<string, number>>(sql`
    SELECT ${tileColumns(filter)},
      count(*) FILTER (WHERE ${tileCondition("notInvoiced", filter)} AND ${t.billableAmount} IS NULL)::int AS missing
    ${FROM} WHERE ${baseWhere(filter)}`);
  const tiles = Object.fromEntries(
    TRANSPORT_BILLING_TILES.map((tile) => [tile, { count: Number(totals?.[`c_${tile}`] ?? 0), amount: Number(totals?.[`a_${tile}`] ?? 0) }]),
  ) as Record<TransportBillingTile, ReportTileTotal>;

  const inPeriod = inPeriodSql(day, filter);
  const monthRows = await rowsOf<Record<string, number | string>>(sql`
    SELECT to_char(${day}, 'YYYY-MM') AS month,
      ${money(sql`sum(${tileAmount("invoiced")}) FILTER (WHERE ${tileWhere("invoiced")})`)} AS invoiced,
      ${money(sql`sum(${tileAmount("notInvoiced")}) FILTER (WHERE ${tileWhere("notInvoiced")})`)} AS "notInvoiced",
      ${money(sql`sum(${tileAmount("toll")}) FILTER (WHERE ${tileWhere("toll")})`)} AS toll
    ${FROM} WHERE ${baseWhere(filter)} AND ${inPeriod}
      AND (${tileWhere("invoiced")} OR ${tileWhere("notInvoiced")} OR ${tileWhere("toll")}) GROUP BY 1`);
  const months = monthRows.map((r) => ({
    month: String(r.month), invoiced: Number(r.invoiced), notInvoiced: Number(r.notInvoiced), toll: Number(r.toll),
  }));

  const typeRows = await rowsOf<Record<string, number | string>>(sql`
    SELECT ${t.transportType} AS type, count(*)::int AS count,
      ${money(sql`sum(${billableAmount}) FILTER (WHERE ${t.billable})`)} AS billable,
      ${money(sql`sum(${billableAmount}) FILTER (WHERE ${tileWhere("notInvoiced")})`)} AS "notInvoiced",
      ${money(sql`sum(${tollCost}) FILTER (WHERE ${tileWhere("toll")})`)} AS toll
    ${FROM} WHERE ${baseWhere(filter)} AND ${inPeriod}
    GROUP BY ${t.transportType}
    ORDER BY ${TYPE_ORDER}, ${t.transportType}`);

  return {
    tiles,
    missingAmount: Number(totals?.missing ?? 0),
    byMonth: fillMonths(months, (month) => ({ month, invoiced: 0, notInvoiced: 0, toll: 0 })),
    byType: typeRows.map((r) => ({
      type: String(r.type), count: Number(r.count), billable: Number(r.billable), notInvoiced: Number(r.notInvoiced), toll: Number(r.toll),
    })),
  };
}

async function count(filter: ReportFilter, tile: TransportBillingTile): Promise<number> {
  const [row] = await rowsOf<{ n: number }>(sql`SELECT count(*)::int AS n ${FROM} WHERE ${baseWhere(filter)} AND ${tileCondition(tile, filter)}`);
  return Number(row?.n ?? 0);
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

async function list(
  filter: ReportFilter,
  tile: TransportBillingTile,
  order: { sort: TransportBillingSort; dir: "asc" | "desc" },
  limit: number,
  offset: number,
): Promise<TransportBillingRow[]> {
  const rows = await rowsOf<Record<string, any>>(sql`
    SELECT ${t.id} AS id, to_char(${day}, 'YYYY-MM-DD') AS date, ${t.transportType} AS "transportType", ${t.status} AS status,
      ${t.vehicleId} AS "vehicleId", ${licensePlate} AS "licensePlate", ${t.isExternalVehicle} AS "isExternalVehicle",
      ${t.customerId} AS "customerId", ${customers.name} AS "customerName",
      ${t.billable} AS billable, ${t.billableAmount}::float8 AS "billableAmount", ${t.tollCost}::float8 AS "tollCost",
      ${t.invoiced} AS invoiced, ${t.invoicedDate} AS "invoicedDate", ${t.distanceKm}::float8 AS "distanceKm",
      round(${tileAmount(tile)}, 2)::float8 AS amount
    ${FROM}
    WHERE ${baseWhere(filter)} AND ${tileCondition(tile, filter)}
    ORDER BY ${orderBy(order.sort, order.dir, tile)}
    LIMIT ${limit} OFFSET ${offset}`);
  return rows.map((r) => ({
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
  }));
}

export const transportBillingReport: ReportDefinition<TransportBillingTile, TransportBillingSort, TransportBillingRow, TransportBillingSummary> = {
  key: "transport-billing",
  tiles: TRANSPORT_BILLING_TILES,
  sorts: TRANSPORT_BILLING_SORTS,
  defaultSort: "date",
  defaultDir: "desc",
  summary,
  count,
  list,
};
