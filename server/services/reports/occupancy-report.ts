/**
 * Rapporten fase 3, onderdeel 6: the occupancy heatmap. One SQL fragment
 * (`vehicleDaysSql`) gives every vehicle-day of the period exactly one state;
 * the tiles, the day series, the count and the list all read that fragment, so
 * a tile and the list it opens can never disagree.
 *
 * - Active fleet on day d: (out_of_fleet_date IS NULL AND availability_status <> 'not_for_rental')
 *   OR out_of_fleet_date > d, plus every vehicle that is busy (rental, replacement, workshop)
 *   on d, so rented can never exceed the fleet. created_at / date_in do not count.
 * - One state per vehicle-day: workshop > rented > replacement > available.
 * - Days of a reservation: rental and replacement start_date up to
 *   coalesce(actual_return_date, end_date, greatest(today, start_date)) (as rentalDays in
 *   buildVehicleFinancials); workshop start_date up to coalesce(end_date, today) (as
 *   visitDaysInPeriod). Not deleted, not cancelled, vehicle filled in. Today = office date.
 * - A rental still 'booked' (never picked up: no actual_pickup_date) counts only from today on:
 *   a past day of a no-show is not rented (final review ruling 2026-10-25). Picked up,
 *   returned and completed rentals count every day; today and the future keep booked.
 *
 * Not built on `sqlReport`: its FROM is a fixed table expression, while here the rows
 * (vehicle-days) only exist for a given period - the FROM itself depends on the filter -
 * and a tile counts distinct vehicles rather than rows. So it mounts a ReportDefinition
 * directly with the same discipline: one `stateIs(tile)` for tiles, count and list.
 */
import { sql, type SQL } from "drizzle-orm";
import { reservations, vehicles } from "../../../shared/schema";
import {
  OCCUPANCY_MAX_DAYS,
  OCCUPANCY_SORTS,
  OCCUPANCY_TILES,
  occupancyPct,
  type OccupancyDay,
  type OccupancyRow,
  type OccupancySort,
  type OccupancySummary,
  type OccupancyTile,
} from "../../../shared/reports/occupancy-report";
import type { ReportTileTotal } from "../../../shared/report-kit";
import { isoToday } from "../lifecycle";
import { periodDays, textDaySql, type ReportDefinition, type ReportFilter } from "./report-kit";
import { rowsOf } from "./sql-report";

const r = reservations;
const v = vehicles;

/** (vehicle_id, day, state) for every vehicle-day of the active fleet in the period. */
export function vehicleDaysSql(filter: ReportFilter, today: string): SQL {
  const from = sql`${filter.from}::date`;
  const to = sql`${filter.to}::date`;
  const now = sql`${today}::date`;
  const start = textDaySql(r.startDate);
  const end = sql`(CASE ${r.type} WHEN 'maintenance_block' THEN coalesce(${textDaySql(r.endDate)}, ${now})
    ELSE coalesce(${textDaySql(r.actualReturnDate)}, ${textDaySql(r.endDate)}, greatest(${now}, ${start})) END)`;
  const reservationVehicle = filter.vehicleId === null ? sql`` : sql` AND ${r.vehicleId} = ${filter.vehicleId}`;
  const fleetVehicle = filter.vehicleId === null ? sql`` : sql` WHERE fv.id = ${filter.vehicleId}`;
  return sql`
    WITH days AS (SELECT g::date AS day FROM generate_series(${from}, ${to}, interval '1 day') g),
    all_spans AS MATERIALIZED (
      SELECT ${r.vehicleId} AS vehicle_id,
        (CASE ${r.type} WHEN 'maintenance_block' THEN 1 WHEN 'standard' THEN 2 ELSE 3 END) AS rank,
        (CASE WHEN ${r.type} = 'standard' AND ${r.status} = 'booked' AND ${r.actualPickupDate} IS NULL
          THEN greatest(${start}, ${now}) ELSE ${start} END) AS s,
        ${end} AS e
      FROM ${r}
      WHERE ${r.deletedAt} IS NULL AND ${r.status} <> 'cancelled' AND ${r.vehicleId} IS NOT NULL
        AND ${r.type} IN ('standard', 'replacement', 'maintenance_block')${reservationVehicle}
    ),
    -- MATERIALIZED: the text-date parsing runs once per reservation, then only spans that touch the period join the days
    spans AS (SELECT * FROM all_spans WHERE s <= ${to} AND e >= ${from}),
    busy AS (
      SELECT sp.vehicle_id, d.day, min(sp.rank) AS rank
      FROM spans sp JOIN days d ON d.day BETWEEN sp.s AND sp.e
      GROUP BY 1, 2
    ),
    fleet AS (
      SELECT fv.id AS vehicle_id, d.day
      FROM ${v} fv JOIN days d
        ON (fv.out_of_fleet_date IS NULL AND fv.availability_status <> 'not_for_rental')
          OR ${textDaySql(sql`fv.out_of_fleet_date`)} > d.day${fleetVehicle}
    )
    SELECT coalesce(f.vehicle_id, b.vehicle_id) AS vehicle_id, coalesce(f.day, b.day) AS day,
      (CASE b.rank WHEN 1 THEN 'workshop' WHEN 2 THEN 'rented' WHEN 3 THEN 'replacement' ELSE 'available' END) AS state
    FROM fleet f FULL JOIN busy b ON b.vehicle_id = f.vehicle_id AND b.day = f.day`;
}

/** The one condition a vehicle-day must meet to count for a tile. */
const stateIs = (tile: OccupancyTile): SQL => sql`vd.state = ${tile}`;

const vehicleDays = (filter: ReportFilter, today: string = isoToday()): SQL => sql`(${vehicleDaysSql(filter, today)}) vd`;

const daysIn = (tile: OccupancyTile): SQL => sql`count(*) FILTER (WHERE ${stateIs(tile)})::int`;

async function summary(filter: ReportFilter): Promise<OccupancySummary> {
  const tileColumns = sql.join(
    OCCUPANCY_TILES.map((tile) => sql`count(DISTINCT vd.vehicle_id) FILTER (WHERE ${stateIs(tile)})::int AS ${sql.raw(`"c_${tile}"`)},
      ${daysIn(tile)} AS ${sql.raw(`"a_${tile}"`)}`),
    sql`, `,
  );
  // One "today" for both statements, so tiles and day series cannot straddle midnight.
  const today = isoToday();
  const [totals, dayRows] = await Promise.all([
    rowsOf<Record<string, number>>(sql`SELECT ${tileColumns}, count(*)::int AS "fleetDays" FROM ${vehicleDays(filter, today)}`),
    rowsOf<Record<string, number | string>>(sql`
      SELECT to_char(vd.day, 'YYYY-MM-DD') AS date, count(*)::int AS fleet,
        ${daysIn("rented")} AS rented, ${daysIn("replacement")} AS replacement,
        ${daysIn("workshop")} AS workshop, ${daysIn("available")} AS available
      FROM ${vehicleDays(filter, today)}
      GROUP BY vd.day`),
  ]);
  const t = totals[0] ?? {};
  const tiles = Object.fromEntries(
    OCCUPANCY_TILES.map((tile) => [tile, { count: Number(t[`c_${tile}`] ?? 0), amount: Number(t[`a_${tile}`] ?? 0) }]),
  ) as Record<OccupancyTile, ReportTileTotal>;

  // Every day of the period, also the ones without any fleet (no row from SQL).
  const byDate = new Map(dayRows.map((d) => [String(d.date), d]));
  const days: OccupancyDay[] = [];
  const first = Date.parse(`${filter.from}T00:00:00Z`);
  for (let i = 0; i < periodDays(filter); i++) {
    const date = new Date(first + i * 86_400_000).toISOString().slice(0, 10);
    const d = byDate.get(date);
    const fleet = Number(d?.fleet ?? 0);
    const rented = Number(d?.rented ?? 0);
    days.push({
      date,
      fleet,
      rented,
      replacement: Number(d?.replacement ?? 0),
      workshop: Number(d?.workshop ?? 0),
      available: Number(d?.available ?? 0),
      pct: occupancyPct(rented, fleet),
    });
  }
  return { tiles, days, avgPct: occupancyPct(tiles.rented.amount, Number(t.fleetDays ?? 0)) };
}

async function count(filter: ReportFilter, tile: OccupancyTile): Promise<number> {
  const [row] = await rowsOf<{ n: number }>(sql`
    SELECT count(DISTINCT vd.vehicle_id)::int AS n FROM ${vehicleDays(filter)} WHERE ${stateIs(tile)}`);
  return Number(row?.n ?? 0);
}

function orderBy(sort: OccupancySort, dir: "asc" | "desc", tile: OccupancyTile): SQL {
  const d = dir === "asc" ? sql.raw("ASC") : sql.raw("DESC");
  const id = sql`vd.vehicle_id ${d}`;
  switch (sort) {
    case "licensePlate": return sql`${v.licensePlate} ${d}, ${id}`;
    case "amount": return sql`${daysIn(tile)} ${d}, ${v.licensePlate} ASC, vd.vehicle_id ASC`;
    case "pct": return sql`(${daysIn("rented")}::float8 / count(*)) ${d}, ${v.licensePlate} ASC, vd.vehicle_id ASC`;
  }
}

async function list(
  filter: ReportFilter,
  tile: OccupancyTile,
  order: { sort: OccupancySort; dir: "asc" | "desc" },
  limit: number,
  offset: number,
): Promise<OccupancyRow[]> {
  const rows = await rowsOf<Record<string, any>>(sql`
    SELECT vd.vehicle_id AS "vehicleId", ${v.licensePlate} AS "licensePlate", ${v.brand} AS brand, ${v.model} AS model,
      count(*)::int AS "fleetDays",
      ${daysIn("rented")} AS "rentedDays", ${daysIn("replacement")} AS "replacementDays",
      ${daysIn("workshop")} AS "workshopDays", ${daysIn("available")} AS "availableDays",
      ${daysIn(tile)} AS amount
    FROM ${vehicleDays(filter)}
    LEFT JOIN ${v} ON ${v.id} = vd.vehicle_id
    GROUP BY vd.vehicle_id, ${v.id}
    HAVING count(*) FILTER (WHERE ${stateIs(tile)}) > 0
    ORDER BY ${orderBy(order.sort, order.dir, tile)}
    LIMIT ${limit} OFFSET ${offset}`);
  return rows.map((row) => ({
    vehicleId: Number(row.vehicleId),
    licensePlate: row.licensePlate ?? "",
    brand: row.brand ?? "",
    model: row.model ?? "",
    fleetDays: Number(row.fleetDays),
    rentedDays: Number(row.rentedDays),
    replacementDays: Number(row.replacementDays),
    workshopDays: Number(row.workshopDays),
    availableDays: Number(row.availableDays),
    pct: occupancyPct(Number(row.rentedDays), Number(row.fleetDays)),
    amount: Number(row.amount),
  }));
}

export const occupancyReport: ReportDefinition<OccupancyTile, OccupancySort, OccupancyRow, OccupancySummary> = {
  key: "occupancy",
  tiles: OCCUPANCY_TILES,
  sorts: OCCUPANCY_SORTS,
  defaultSort: "licensePlate",
  defaultDir: "asc",
  maxDays: OCCUPANCY_MAX_DAYS,
  summary,
  count,
  list,
};
