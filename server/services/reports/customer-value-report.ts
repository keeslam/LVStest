/**
 * Rapporten fase 4, onderdeel 9: customer value. One row per customer (and one row for
 * everything without a customer, customer_id NULL) built from five grouped CTEs:
 *
 * - res:    the Financieel set (buildVehicleFinancials): standard, not cancelled, not deleted,
 *           existing vehicle, start day in the period. Revenue = total_price + fuel_cost +
 *           extra_km_cost; days = max(1, end - start + 1), end = coalesce(actual_return_date,
 *           end_date, greatest(today, start)). Late = actual return day after the end day.
 * - cancel: standard, cancelled, not deleted, start day in the period (no vehicle needed).
 * - fin:    fines not cancelled, office day of offence_at in the period (= fines tile total).
 * - dmg:    return checks with at least one damage marker (a non-empty JSON array, checked
 *           with a regex so bad JSON never breaks the query), office day of check_date in the
 *           period, customer via a reservation that is not deleted.
 * - req:    portal requests, office day of created_at in the period; with a vehicle filter
 *           only the ones whose reservation is on that vehicle.
 *
 * Costs = fines + extra km + fuel (damage has no amount, it only counts). Mounted directly
 * (like occupancy): the rows are groups, so the FROM is a subquery over the filter. One
 * `tileIs(tile)` / `tileAmount(tile)` on alias cv feeds the tiles, count, list and both top 10s.
 */
import { sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { customers, fines, interactiveDamageChecks, portalRequests, reservations, vehicles } from "../../../shared/schema";
import {
  CUSTOMER_VALUE_SORTS,
  CUSTOMER_VALUE_TILES,
  type CustomerValueRow,
  type CustomerValueSort,
  type CustomerValueSummary,
  type CustomerValueTile,
} from "../../../shared/reports/customer-value-report";
import { REPORT_BREAKDOWN_LIMIT, type ReportBreakdownRow, type ReportTileTotal } from "../../../shared/report-kit";
import { isoToday } from "../lifecycle";
import { inPeriodSql, money, NON_EMPTY_JSON_ARRAY, officeDaySql, textDaySql, type ReportDefinition, type ReportFilter } from "./report-kit";
import { rowsOf } from "./sql-report";

const r = reservations;

const num = (column: SQL | AnyPgColumn): SQL => sql`coalesce((${column})::numeric, 0)`;

/** One row per customer (or NULL) with the CustomerValueRow columns in snake_case. */
export function customerValueSql(filter: ReportFilter, today: string): SQL {
  const vehicleOf = (column: SQL | AnyPgColumn) =>
    filter.vehicleId === null ? sql`` : sql` AND ${column} = ${filter.vehicleId}`;
  const start = textDaySql(r.startDate);
  const end = sql`coalesce(${textDaySql(r.actualReturnDate)}, ${textDaySql(r.endDate)}, greatest(${today}::date, ${start}))`;
  const checkDay = officeDaySql(interactiveDamageChecks.checkDate);
  const fineDay = officeDaySql(fines.offenceAt);
  const requestDay = officeDaySql(portalRequests.createdAt);
  const requestVehicle = filter.vehicleId === null
    ? sql``
    : sql` AND ${portalRequests.reservationId} IN (SELECT rv.id FROM ${r} rv WHERE rv.vehicle_id = ${filter.vehicleId} AND rv.deleted_at IS NULL)`;
  return sql`
    WITH res AS (
      SELECT ${r.customerId} AS customer_id, count(*)::int AS rentals,
        sum(greatest(1, ${end} - ${start} + 1))::int AS rental_days,
        sum(${num(r.totalPrice)} + ${num(r.fuelCost)} + ${num(r.extraKmCost)}) AS revenue,
        sum(${num(r.extraKmCost)}) AS extra_km_cost, sum(${num(r.fuelCost)}) AS fuel_cost,
        count(*) FILTER (WHERE ${textDaySql(r.actualReturnDate)} > ${textDaySql(r.endDate)})::int AS late_returns
      FROM ${r} INNER JOIN ${vehicles} ON ${vehicles.id} = ${r.vehicleId}
      WHERE ${r.type} = 'standard' AND ${r.status} <> 'cancelled' AND ${r.deletedAt} IS NULL
        AND ${inPeriodSql(start, filter)}${vehicleOf(r.vehicleId)}
      GROUP BY 1
    ),
    cancel AS (
      SELECT ${r.customerId} AS customer_id, count(*)::int AS cancellations
      FROM ${r}
      WHERE ${r.type} = 'standard' AND ${r.status} = 'cancelled' AND ${r.deletedAt} IS NULL
        AND ${inPeriodSql(start, filter)}${vehicleOf(r.vehicleId)}
      GROUP BY 1
    ),
    fin AS (
      SELECT ${fines.customerId} AS customer_id, count(*)::int AS fines_count, sum(${fines.totalAmount}) AS fines_amount
      FROM ${fines}
      WHERE ${fines.status} <> 'cancelled' AND ${inPeriodSql(fineDay, filter)}${vehicleOf(fines.vehicleId)}
      GROUP BY 1
    ),
    dmg AS (
      SELECT ${r.customerId} AS customer_id, count(*)::int AS damage_checks
      FROM ${interactiveDamageChecks}
        INNER JOIN ${r} ON ${r.id} = ${interactiveDamageChecks.reservationId} AND ${r.deletedAt} IS NULL
      WHERE ${interactiveDamageChecks.checkType} = 'return' AND ${interactiveDamageChecks.damageMarkers} ~ ${NON_EMPTY_JSON_ARRAY}
        AND ${inPeriodSql(checkDay, filter)}${vehicleOf(interactiveDamageChecks.vehicleId)}
      GROUP BY 1
    ),
    req AS (
      SELECT ${portalRequests.customerId} AS customer_id, count(*)::int AS portal_requests
      FROM ${portalRequests}
      WHERE ${inPeriodSql(requestDay, filter)}${requestVehicle}
      GROUP BY 1
    ),
    keys AS (
      SELECT customer_id FROM res UNION SELECT customer_id FROM cancel UNION SELECT customer_id FROM fin
      UNION SELECT customer_id FROM dmg UNION SELECT customer_id FROM req
    )
    SELECT k.customer_id, ${customers.name} AS customer_name,
      coalesce(res.rentals, 0) AS rentals, coalesce(res.rental_days, 0) AS rental_days,
      round(coalesce(res.revenue, 0), 2) AS revenue,
      round(coalesce(res.extra_km_cost, 0), 2) AS extra_km_cost, round(coalesce(res.fuel_cost, 0), 2) AS fuel_cost,
      coalesce(fin.fines_count, 0) AS fines_count, round(coalesce(fin.fines_amount, 0), 2) AS fines_amount,
      coalesce(dmg.damage_checks, 0) AS damage_checks, coalesce(res.late_returns, 0) AS late_returns,
      coalesce(cancel.cancellations, 0) AS cancellations, coalesce(req.portal_requests, 0) AS portal_requests,
      round(coalesce(fin.fines_amount, 0) + coalesce(res.extra_km_cost, 0) + coalesce(res.fuel_cost, 0), 2) AS costs
    FROM keys k
      LEFT JOIN res ON res.customer_id IS NOT DISTINCT FROM k.customer_id
      LEFT JOIN cancel ON cancel.customer_id IS NOT DISTINCT FROM k.customer_id
      LEFT JOIN fin ON fin.customer_id IS NOT DISTINCT FROM k.customer_id
      LEFT JOIN dmg ON dmg.customer_id IS NOT DISTINCT FROM k.customer_id
      LEFT JOIN req ON req.customer_id IS NOT DISTINCT FROM k.customer_id
      LEFT JOIN ${customers} ON ${customers.id} = k.customer_id`;
}

/** The one condition a customer row must meet to count for a tile. */
function tileIs(tile: CustomerValueTile): SQL {
  switch (tile) {
    case "revenue": return sql`cv.rentals >= 1`;
    case "costs": return sql`(cv.costs <> 0 OR cv.fines_count >= 1 OR cv.damage_checks >= 1)`;
    case "late": return sql`cv.late_returns >= 1`;
    case "cancelled": return sql`cv.cancellations >= 1`;
    case "requests": return sql`cv.portal_requests >= 1`;
  }
}

/** What a customer row adds to a tile. */
function tileAmount(tile: CustomerValueTile): SQL {
  switch (tile) {
    case "revenue": return sql`cv.revenue`;
    case "costs": return sql`cv.costs`;
    case "late": return sql`cv.late_returns`;
    case "cancelled": return sql`cv.cancellations`;
    case "requests": return sql`cv.portal_requests`;
  }
}

const customerRows = (filter: ReportFilter, today: string = isoToday()): SQL => sql`(${customerValueSql(filter, today)}) cv`;

/** Top 10 of a tile on its amount; count = rentals. */
async function top(filter: ReportFilter, today: string, tile: "revenue" | "costs"): Promise<ReportBreakdownRow[]> {
  const rows = await rowsOf<{ key: number | null; label: string | null; count: number; amount: number }>(sql`
    SELECT cv.customer_id AS key, cv.customer_name AS label, cv.rentals AS count, ${money(tileAmount(tile))} AS amount
    FROM ${customerRows(filter, today)}
    WHERE ${tileIs(tile)}
    ORDER BY ${tileAmount(tile)} DESC, cv.rentals DESC, cv.customer_name ASC NULLS LAST, cv.customer_id ASC NULLS LAST
    LIMIT ${REPORT_BREAKDOWN_LIMIT}`);
  return rows.map((row) => ({
    key: row.key === null ? null : Number(row.key),
    label: row.label ?? null,
    count: Number(row.count),
    amount: Number(row.amount),
  }));
}

async function summary(filter: ReportFilter): Promise<CustomerValueSummary> {
  // One "today" for every statement, so tiles and top 10s cannot straddle midnight.
  const today = isoToday();
  const columns = sql.join(
    CUSTOMER_VALUE_TILES.map((tile) => sql`count(*) FILTER (WHERE ${tileIs(tile)})::int AS ${sql.raw(`"c_${tile}"`)},
      ${money(sql`sum(${tileAmount(tile)}) FILTER (WHERE ${tileIs(tile)})`)} AS ${sql.raw(`"a_${tile}"`)}`),
    sql`, `,
  );
  const [totals, topRevenue, topCosts] = await Promise.all([
    rowsOf<Record<string, number>>(sql`SELECT ${columns} FROM ${customerRows(filter, today)}`),
    top(filter, today, "revenue"),
    top(filter, today, "costs"),
  ]);
  const t = totals[0] ?? {};
  const tiles = Object.fromEntries(
    CUSTOMER_VALUE_TILES.map((tile) => [tile, { count: Number(t[`c_${tile}`] ?? 0), amount: Number(t[`a_${tile}`] ?? 0) }]),
  ) as Record<CustomerValueTile, ReportTileTotal>;
  return { tiles, topRevenue, topCosts };
}

async function count(filter: ReportFilter, tile: CustomerValueTile): Promise<number> {
  const [row] = await rowsOf<{ n: number }>(sql`SELECT count(*)::int AS n FROM ${customerRows(filter)} WHERE ${tileIs(tile)}`);
  return Number(row?.n ?? 0);
}

const SORT_COLUMNS: Record<Exclude<CustomerValueSort, "amount" | "customer">, string> = {
  revenue: "cv.revenue",
  costs: "cv.costs",
  rentals: "cv.rentals",
  rentalDays: "cv.rental_days",
  lateReturns: "cv.late_returns",
  cancellations: "cv.cancellations",
  portalRequests: "cv.portal_requests",
};

function orderBy(sort: CustomerValueSort, dir: "asc" | "desc", tile: CustomerValueTile): SQL {
  const d = dir === "asc" ? sql.raw("ASC") : sql.raw("DESC");
  const tie = sql`lower(cv.customer_name) ASC NULLS LAST, cv.customer_id ASC NULLS LAST`;
  switch (sort) {
    case "amount": return sql`${tileAmount(tile)} ${d}, ${tie}`;
    case "customer": return sql`lower(cv.customer_name) ${d} NULLS LAST, cv.customer_id ${d} NULLS LAST`;
    default: return sql`${sql.raw(SORT_COLUMNS[sort])} ${d}, ${tie}`;
  }
}

async function list(
  filter: ReportFilter,
  tile: CustomerValueTile,
  order: { sort: CustomerValueSort; dir: "asc" | "desc" },
  limit: number,
  offset: number,
): Promise<CustomerValueRow[]> {
  const rows = await rowsOf<Record<string, any>>(sql`
    SELECT cv.*, ${tileAmount(tile)} AS amount
    FROM ${customerRows(filter)}
    WHERE ${tileIs(tile)}
    ORDER BY ${orderBy(order.sort, order.dir, tile)}
    LIMIT ${limit} OFFSET ${offset}`);
  return rows.map((row) => ({
    customerId: row.customer_id === null ? null : Number(row.customer_id),
    customerName: row.customer_name ?? null,
    rentals: Number(row.rentals),
    rentalDays: Number(row.rental_days),
    revenue: Number(row.revenue),
    extraKmCost: Number(row.extra_km_cost),
    fuelCost: Number(row.fuel_cost),
    finesCount: Number(row.fines_count),
    finesAmount: Number(row.fines_amount),
    damageChecks: Number(row.damage_checks),
    lateReturns: Number(row.late_returns),
    cancellations: Number(row.cancellations),
    portalRequests: Number(row.portal_requests),
    costs: Number(row.costs),
    amount: Number(row.amount),
  }));
}

export const customerValueReport: ReportDefinition<CustomerValueTile, CustomerValueSort, CustomerValueRow, CustomerValueSummary> = {
  key: "customer-value",
  tiles: CUSTOMER_VALUE_TILES,
  sorts: CUSTOMER_VALUE_SORTS,
  defaultSort: "amount",
  defaultDir: "desc",
  summary,
  count,
  list,
};
