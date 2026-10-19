import { and, asc, desc, eq, gte, inArray, isNull, ne, sql, type SQL } from "drizzle-orm";
import { db } from "../db";
import { customers, reservations, vehicles } from "../../shared/schema";
import type { ReservationListPage, ReservationListRow, ReservationListSort, ReservationListView } from "../../shared/reservation-list";

/**
 * BUG-205 (Kees, 2026-10-19): the reservations list was one 7.7 MB answer, every reservation with its
 * full vehicle (81 fields) and customer (52 fields). This answers one page, filtered, searched and
 * sorted in the database, with only the vehicle and customer fields the list shows.
 */
const STATUSES: Record<ReservationListView, string[]> = {
  current: ["booked", "picked_up"],
  history: ["completed", "returned", "cancelled"],
  completed: ["completed", "returned"],
};

const viewCondition = (view: ReservationListView): SQL =>
  and(isNull(reservations.deletedAt), ne(reservations.type, "maintenance_block"), inArray(reservations.status, STATUSES[view]))!;

/** The same rule as the client's reservationMatchesSearch: plate (with or without dashes), brand, model, both, customer or company, contract number, id. */
function searchCondition(search: string): SQL | undefined {
  const q = search.trim().toLowerCase();
  if (!q) return undefined;
  const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const plate = q.replace(/[^a-z0-9]/g, "");
  return sql`(
    ${plate ? sql`lower(regexp_replace(coalesce(${vehicles.licensePlate}, ''), '[^A-Za-z0-9]', '', 'g')) like ${`%${plate}%`} or` : sql``}
    lower(coalesce(${vehicles.brand}, '')) like ${like}
    or lower(coalesce(${vehicles.model}, '')) like ${like}
    or lower(coalesce(${vehicles.brand}, '') || ' ' || coalesce(${vehicles.model}, '')) like ${like}
    or lower(coalesce(${customers.name}, '')) like ${like}
    or lower(coalesce(${customers.companyName}, '')) like ${like}
    or lower(coalesce(${reservations.contractNumber}, '')) like ${like}
    or cast(${reservations.id} as text) like ${like}
  )`;
}

function orderBy(sort: ReservationListSort, dir: "asc" | "desc") {
  const by = dir === "asc" ? asc : desc;
  const nullsLast = (col: SQL) => sql`${col} ${sql.raw(dir === "asc" ? "asc" : "desc")} nulls last`;
  switch (sort) {
    case "return": return [nullsLast(sql`${reservations.endDate}`), by(reservations.id)];
    case "customer": return [nullsLast(sql`lower(coalesce(${customers.companyName}, ${customers.name}))`), by(reservations.id)];
    case "plate": return [nullsLast(sql`${vehicles.licensePlate}`), by(reservations.id)];
    default: return [nullsLast(sql`${reservations.startDate}`), by(reservations.id)];
  }
}

const listSelect = {
  r: reservations,
  vehicle: { id: vehicles.id, licensePlate: vehicles.licensePlate, brand: vehicles.brand, model: vehicles.model, returnMileage: vehicles.returnMileage },
  customer: { id: customers.id, name: customers.name, companyName: customers.companyName },
};
type ListSelected = { r: typeof reservations.$inferSelect; vehicle: ReservationListRow["vehicle"] | { id: null } | null; customer: ReservationListRow["customer"] | { id: null } | null };
const toRow = (x: ListSelected): ReservationListRow => ({
  ...x.r,
  vehicle: x.vehicle && x.vehicle.id != null ? (x.vehicle as ReservationListRow["vehicle"]) : null,
  customer: x.customer && x.customer.id != null ? (x.customer as ReservationListRow["customer"]) : null,
});

export async function getReservationListPage(opts: {
  view: ReservationListView; search?: string; sort?: ReservationListSort; dir?: "asc" | "desc";
  page: number; pageSize: number; startFrom?: string;
}): Promise<ReservationListPage> {
  const where = and(viewCondition(opts.view), searchCondition(opts.search ?? ""), opts.startFrom ? gte(reservations.startDate, opts.startFrom) : undefined);
  const sort = opts.sort ?? (opts.view === "current" ? "pickup" : "return");
  const dir = opts.dir ?? (opts.view === "current" ? "asc" : "desc");
  const base = () => db.select(listSelect).from(reservations)
    .leftJoin(vehicles, eq(reservations.vehicleId, vehicles.id))
    .leftJoin(customers, eq(reservations.customerId, customers.id));
  const [rows, [{ total }], counts] = await Promise.all([
    base().where(where).orderBy(...orderBy(sort, dir)).limit(opts.pageSize).offset((opts.page - 1) * opts.pageSize),
    db.select({ total: sql<number>`count(*)::int` }).from(reservations)
      .leftJoin(vehicles, eq(reservations.vehicleId, vehicles.id))
      .leftJoin(customers, eq(reservations.customerId, customers.id))
      .where(where),
    db.select({
      current: sql<number>`count(*) filter (where ${reservations.status} in ('booked', 'picked_up'))::int`,
      history: sql<number>`count(*) filter (where ${reservations.status} in ('completed', 'returned', 'cancelled'))::int`,
      completed: sql<number>`count(*) filter (where ${reservations.status} in ('completed', 'returned'))::int`,
    }).from(reservations).where(and(isNull(reservations.deletedAt), ne(reservations.type, "maintenance_block"))),
  ]);
  return { rows: (rows as ListSelected[]).map(toRow), total, page: opts.page, pageSize: opts.pageSize, counts: counts[0] };
}

/** A few reservations by id, slim: for a lookup such as "which car does this spare stand in for". */
export async function getReservationListRowsByIds(ids: number[]): Promise<ReservationListRow[]> {
  if (ids.length === 0) return [];
  const rows = await db.select(listSelect).from(reservations)
    .leftJoin(vehicles, eq(reservations.vehicleId, vehicles.id))
    .leftJoin(customers, eq(reservations.customerId, customers.id))
    .where(and(inArray(reservations.id, ids), isNull(reservations.deletedAt)));
  return (rows as ListSelected[]).map(toRow);
}
