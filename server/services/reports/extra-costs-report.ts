/**
 * Rapporten fase 2, onderdeel 2: the extra km and fuel report. Same set of
 * rentals as buildVehicleFinancials ("waarvan extra kosten"): standard,
 * not cancelled, not deleted, with an existing vehicle; period day = start day.
 * Tiles: extraKm (extra km cost > 0), fuel (fuel cost > 0), withExtraKm (extra km > 0).
 */
import { sql, type SQL } from "drizzle-orm";
import { db } from "../../db";
import { customers, reservations, vehicles } from "../../../shared/schema";
import {
  EXTRA_COSTS_SORTS,
  EXTRA_COSTS_TILES,
  type ExtraCostsRow,
  type ExtraCostsSort,
  type ExtraCostsSummary,
  type ExtraCostsTile,
} from "../../../shared/reports/extra-costs-report";
import { REPORT_BREAKDOWN_LIMIT, fillMonths, type ReportBreakdownRow, type ReportTileTotal } from "../../../shared/report-kit";
import { inPeriodSql, money, textDaySql, type ReportDefinition, type ReportFilter } from "./report-kit";

const startDay = textDaySql(reservations.startDate);
const extraKmCost = sql`coalesce(${reservations.extraKmCost}::numeric, 0)`;
const fuelCost = sql`coalesce(${reservations.fuelCost}::numeric, 0)`;

function periodWhere(filter: ReportFilter): SQL {
  const vehicle = filter.vehicleId === null ? sql`` : sql` AND ${reservations.vehicleId} = ${filter.vehicleId}`;
  return sql`${reservations.type} = 'standard' AND ${reservations.status} <> 'cancelled' AND ${reservations.deletedAt} IS NULL
    AND ${inPeriodSql(startDay, filter)}${vehicle}`;
}

function tileWhere(tile: ExtraCostsTile): SQL {
  switch (tile) {
    case "extraKm": return sql`${extraKmCost} > 0`;
    case "fuel": return sql`${fuelCost} > 0`;
    case "withExtraKm": return sql`coalesce(${reservations.extraKm}, 0) > 0`;
  }
}

/** The money a tile adds up. */
function tileAmount(tile: ExtraCostsTile): SQL {
  return tile === "fuel" ? fuelCost : extraKmCost;
}

const FROM = sql`FROM ${reservations}
  INNER JOIN ${vehicles} ON ${vehicles.id} = ${reservations.vehicleId}
  LEFT JOIN ${customers} ON ${customers.id} = ${reservations.customerId}`;

async function rowsOf<T>(query: SQL): Promise<T[]> {
  const result = await db.execute(query);
  return result.rows as T[];
}

async function breakdown(filter: ReportFilter, key: SQL, label: SQL): Promise<ReportBreakdownRow[]> {
  const rows = await rowsOf<{ key: number | string | null; label: string | null; count: number; amount: number }>(sql`
    SELECT ${key} AS key, ${label} AS label, count(*)::int AS count, ${money(sql`sum(${extraKmCost} + ${fuelCost})`)} AS amount
    ${FROM}
    WHERE ${periodWhere(filter)} AND (${extraKmCost} > 0 OR ${fuelCost} > 0)
    GROUP BY 1, 2
    ORDER BY amount DESC, count DESC, 2 ASC NULLS LAST
    LIMIT ${REPORT_BREAKDOWN_LIMIT}`);
  return rows.map((r) => ({ key: r.key, label: r.label, count: Number(r.count), amount: Number(r.amount) }));
}

/** count and amount per tile straight from tileWhere, the same condition the lists use. */
function tileColumns(): SQL {
  return sql.join(
    EXTRA_COSTS_TILES.map((t) => sql`count(*) FILTER (WHERE ${tileWhere(t)})::int AS ${sql.raw(`"c_${t}"`)},
      ${money(sql`sum(${tileAmount(t)}) FILTER (WHERE ${tileWhere(t)})`)} AS ${sql.raw(`"a_${t}"`)}`),
    sql`, `,
  );
}

async function summary(filter: ReportFilter): Promise<ExtraCostsSummary> {
  const [totals] = await rowsOf<Record<string, number>>(sql`
    SELECT ${tileColumns()}, coalesce(sum(${reservations.extraKm}) FILTER (WHERE ${tileWhere("withExtraKm")}), 0)::int AS total_km
    ${FROM} WHERE ${periodWhere(filter)}`);
  const tiles = Object.fromEntries(
    EXTRA_COSTS_TILES.map((t) => [t, { count: Number(totals?.[`c_${t}`] ?? 0), amount: Number(totals?.[`a_${t}`] ?? 0) }]),
  ) as Record<ExtraCostsTile, ReportTileTotal>;

  const monthRows = await rowsOf<Record<string, number | string>>(sql`
    SELECT to_char(${startDay}, 'YYYY-MM') AS month,
      ${money(sql`sum(${tileAmount("extraKm")}) FILTER (WHERE ${tileWhere("extraKm")})`)} AS km,
      ${money(sql`sum(${tileAmount("fuel")}) FILTER (WHERE ${tileWhere("fuel")})`)} AS fuel
    ${FROM} WHERE ${periodWhere(filter)} AND (${tileWhere("extraKm")} OR ${tileWhere("fuel")}) GROUP BY 1`);
  const months = monthRows.map((r) => ({ month: String(r.month), extraKmCost: Number(r.km), fuelCost: Number(r.fuel) }));

  return {
    tiles,
    totalExtraKm: Number(totals?.total_km ?? 0),
    byMonth: fillMonths(months, (month) => ({ month, extraKmCost: 0, fuelCost: 0 })),
    byCustomer: await breakdown(filter, sql`${customers.id}`, sql`${customers.name}`),
    byVehicle: await breakdown(filter, sql`${vehicles.id}`, sql`${vehicles.licensePlate}`),
  };
}

async function count(filter: ReportFilter, tile: ExtraCostsTile): Promise<number> {
  const [row] = await rowsOf<{ n: number }>(sql`SELECT count(*)::int AS n ${FROM} WHERE ${periodWhere(filter)} AND ${tileWhere(tile)}`);
  return Number(row?.n ?? 0);
}

function orderBy(sort: ExtraCostsSort, dir: "asc" | "desc", tile: ExtraCostsTile): SQL {
  const d = dir === "asc" ? sql.raw("ASC") : sql.raw("DESC");
  const id = sql`${reservations.id} ${d}`;
  switch (sort) {
    case "startDate": return sql`${startDay} ${d} NULLS LAST, ${id}`;
    case "amount": return sql`${tileAmount(tile)} ${d}, ${id}`;
    case "extraKm": return sql`${reservations.extraKm} ${d} NULLS LAST, ${id}`;
    case "fuelCost": return sql`${fuelCost} ${d}, ${id}`;
    case "licensePlate": return sql`lower(${vehicles.licensePlate}) ${d}, ${id}`;
    case "customer": return sql`lower(${customers.name}) ${d} NULLS LAST, ${id}`;
  }
}

const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

async function list(
  filter: ReportFilter,
  tile: ExtraCostsTile,
  order: { sort: ExtraCostsSort; dir: "asc" | "desc" },
  limit: number,
  offset: number,
): Promise<ExtraCostsRow[]> {
  const rows = await rowsOf<Record<string, any>>(sql`
    SELECT ${reservations.id} AS "reservationId", ${reservations.startDate} AS "startDate",
      coalesce(${reservations.actualReturnDate}, ${reservations.endDate}) AS "returnDate",
      ${vehicles.id} AS "vehicleId", ${vehicles.licensePlate} AS "licensePlate", ${vehicles.brand} AS brand, ${vehicles.model} AS model,
      ${reservations.customerId} AS "customerId", ${customers.name} AS "customerName",
      ${reservations.extraKm} AS "extraKm", ${reservations.extraKmCost}::float8 AS "extraKmCost", ${reservations.fuelCost}::float8 AS "fuelCost",
      round(${tileAmount(tile)}, 2)::float8 AS amount
    ${FROM}
    WHERE ${periodWhere(filter)} AND ${tileWhere(tile)}
    ORDER BY ${orderBy(order.sort, order.dir, tile)}
    LIMIT ${limit} OFFSET ${offset}`);
  return rows.map((r) => ({
    reservationId: Number(r.reservationId),
    startDate: r.startDate,
    returnDate: r.returnDate ?? null,
    vehicleId: Number(r.vehicleId),
    licensePlate: r.licensePlate,
    brand: r.brand,
    model: r.model,
    customerId: r.customerId === null ? null : Number(r.customerId),
    customerName: r.customerName ?? null,
    extraKm: num(r.extraKm),
    extraKmCost: num(r.extraKmCost),
    fuelCost: num(r.fuelCost),
    amount: Number(r.amount),
  }));
}

export const extraCostsReport: ReportDefinition<ExtraCostsTile, ExtraCostsSort, ExtraCostsRow, ExtraCostsSummary> = {
  key: "extra-costs",
  tiles: EXTRA_COSTS_TILES,
  sorts: EXTRA_COSTS_SORTS,
  defaultSort: "startDate",
  defaultDir: "desc",
  summary,
  count,
  list,
};
