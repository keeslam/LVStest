/**
 * Rapporten fase 2, onderdeel 2: the extra km and fuel report. Same set of
 * rentals as buildVehicleFinancials ("waarvan extra kosten"): standard,
 * not cancelled, not deleted, with an existing vehicle; period day = start day.
 * Money is NET, like Financieel: extraKm (extra km cost <> 0), fuel (fuel cost <> 0), withExtraKm (extra km > 0).
 */
import { sql, type SQL } from "drizzle-orm";
import { customers, reservations, vehicles } from "../../../shared/schema";
import {
  EXTRA_COSTS_SORTS,
  EXTRA_COSTS_TILES,
  type ExtraCostsRow,
  type ExtraCostsSort,
  type ExtraCostsSummary,
  type ExtraCostsTile,
} from "../../../shared/reports/extra-costs-report";
import { fillMonths } from "../../../shared/report-kit";
import { inPeriodSql, money, textDaySql, type ReportFilter } from "./report-kit";
import { reportBreakdown, rowsOf, sqlReport } from "./sql-report";

const startDay = textDaySql(reservations.startDate);
const extraKmCost = sql`coalesce(${reservations.extraKmCost}::numeric, 0)`;
const fuelCost = sql`coalesce(${reservations.fuelCost}::numeric, 0)`;

function periodWhere(filter: ReportFilter): SQL {
  const vehicle = filter.vehicleId === null ? sql`` : sql` AND ${reservations.vehicleId} = ${filter.vehicleId}`;
  return sql`${reservations.type} = 'standard' AND ${reservations.status} <> 'cancelled' AND ${reservations.deletedAt} IS NULL
    AND ${inPeriodSql(startDay, filter)}${vehicle}`;
}

function ruleWhere(tile: ExtraCostsTile): SQL {
  switch (tile) {
    case "extraKm": return sql`${extraKmCost} <> 0`;
    case "fuel": return sql`${fuelCost} <> 0`;
    case "withExtraKm": return sql`coalesce(${reservations.extraKm}, 0) > 0`;
  }
}

/** A rental belongs to a tile: in the report's set and period, and the tile's own rule. */
function tileWhere(tile: ExtraCostsTile, filter: ReportFilter): SQL {
  return sql`${periodWhere(filter)} AND ${ruleWhere(tile)}`;
}

/** The money a tile adds up. */
function tileAmount(tile: ExtraCostsTile): SQL {
  return tile === "fuel" ? fuelCost : extraKmCost;
}

const FROM = sql`${reservations}
  INNER JOIN ${vehicles} ON ${vehicles.id} = ${reservations.vehicleId}
  LEFT JOIN ${customers} ON ${customers.id} = ${reservations.customerId}`;

/** Rentals with extra km cost or fuel cost: what the breakdowns and the month chart add up. */
const withCosts = (filter: ReportFilter): SQL => sql`(${tileWhere("extraKm", filter)} OR ${tileWhere("fuel", filter)})`;

const breakdown = (filter: ReportFilter, key: SQL, label: SQL) =>
  reportBreakdown({ from: FROM, where: withCosts(filter), key, label, amount: sql`${extraKmCost} + ${fuelCost}` });

async function extras(filter: ReportFilter): Promise<Omit<ExtraCostsSummary, "tiles">> {
  const [km] = await rowsOf<{ total_km: number }>(sql`
    SELECT coalesce(sum(${reservations.extraKm}), 0)::int AS total_km
    FROM ${FROM} WHERE ${tileWhere("withExtraKm", filter)}`);

  const monthRows = await rowsOf<Record<string, number | string>>(sql`
    SELECT to_char(${startDay}, 'YYYY-MM') AS month,
      ${money(sql`sum(${tileAmount("extraKm")}) FILTER (WHERE ${tileWhere("extraKm", filter)})`)} AS km,
      ${money(sql`sum(${tileAmount("fuel")}) FILTER (WHERE ${tileWhere("fuel", filter)})`)} AS fuel
    FROM ${FROM} WHERE ${withCosts(filter)} GROUP BY 1`);
  const months = monthRows.map((r) => ({ month: String(r.month), extraKmCost: Number(r.km), fuelCost: Number(r.fuel) }));

  return {
    totalExtraKm: Number(km?.total_km ?? 0),
    byMonth: fillMonths(months, (month) => ({ month, extraKmCost: 0, fuelCost: 0 })),
    byCustomer: await breakdown(filter, sql`${customers.id}`, sql`${customers.name}`),
    byVehicle: await breakdown(filter, sql`${vehicles.id}`, sql`${vehicles.licensePlate}`),
  };
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

const select = (tile: ExtraCostsTile): SQL => sql`${reservations.id} AS "reservationId", ${reservations.startDate} AS "startDate",
  coalesce(${reservations.actualReturnDate}, ${reservations.endDate}) AS "returnDate",
  ${vehicles.id} AS "vehicleId", ${vehicles.licensePlate} AS "licensePlate", ${vehicles.brand} AS brand, ${vehicles.model} AS model,
  ${reservations.customerId} AS "customerId", ${customers.name} AS "customerName",
  ${reservations.extraKm} AS "extraKm", ${reservations.extraKmCost}::float8 AS "extraKmCost", ${reservations.fuelCost}::float8 AS "fuelCost",
  round(${tileAmount(tile)}, 2)::float8 AS amount`;

const mapRow = (r: Record<string, any>): ExtraCostsRow => ({
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
});

export const extraCostsReport = sqlReport<ExtraCostsTile, ExtraCostsSort, ExtraCostsRow, Omit<ExtraCostsSummary, "tiles">>({
  key: "extra-costs",
  tiles: EXTRA_COSTS_TILES,
  sorts: EXTRA_COSTS_SORTS,
  defaultSort: "startDate",
  defaultDir: "desc",
  from: FROM,
  tileWhere,
  tileAmount,
  select,
  orderBy,
  mapRow,
  extras,
});
