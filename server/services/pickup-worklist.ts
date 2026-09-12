/**
 * B-21 — the worklist behind the screen "Nog buiten".
 *
 * The decision splits the 790 old, unclosed reservations in two. The `booked`
 * rows that were never collected and the rows with a legacy status are closed
 * by `scripts/close-returned-reservations.ts`. The 363 rows on `picked_up` are
 * **not**: they claim the car is still with the customer, and no script can
 * know whether that is true. "Die komen op een werklijst die iemand echt
 * naloopt" — this is that list.
 *
 * Built like the "Vandaag" board and for the same reason: one flat SELECT with
 * the four columns the employee needs (vehicle, customer, period, how long it
 * has been open), never `storage.getAllReservations()` — that returns nested
 * vehicle/customer objects and is what made the morning cost 20 MB
 * (BUG-203/BUG-204).
 *
 * `today` is a parameter rather than `new Date()` inside the query so the
 * screen can ask for *its own* today (a browser in Amsterdam is already on
 * tomorrow when a UTC server is not) and so the tests never depend on the day
 * they run. Same rule as server/services/today-board.ts.
 */
import { and, asc, isNotNull, isNull, eq, lt, sql } from "drizzle-orm";
import { db } from "../db";
import { customers, reservations, vehicles } from "../../shared/schema";
import {
  STILL_OUT_LIMIT,
  type StillOutRow,
  type StillOutWorklist,
} from "../../shared/still-out";

export { STILL_OUT_LIMIT } from "../../shared/still-out";
export type { StillOutRow, StillOutWorklist } from "../../shared/still-out";

function vehicleLabel(brand: string | null, model: string | null): string | null {
  const label = [brand, model].filter(Boolean).join(" ").trim();
  return label.length > 0 ? label : null;
}

function customerLabel(name: string | null, companyName: string | null): string | null {
  return companyName?.trim() || name?.trim() || null;
}

export async function buildPickupWorklist(today: string): Promise<StillOutWorklist> {
  // The exact set scripts/close-returned-reservations.ts refuses to touch.
  const where = and(
    isNull(reservations.deletedAt),
    eq(reservations.status, "picked_up"),
    isNotNull(reservations.endDate),
    lt(reservations.endDate, today),
  );

  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(reservations)
    .where(where);

  const rows = await db
    .select({
      reservationId: reservations.id,
      vehicleId: reservations.vehicleId,
      licensePlate: vehicles.licensePlate,
      brand: vehicles.brand,
      model: vehicles.model,
      customerId: reservations.customerId,
      customerName: customers.name,
      customerCompany: customers.companyName,
      startDate: reservations.startDate,
      endDate: reservations.endDate,
      actualPickupDate: reservations.actualPickupDate,
      contractNumber: reservations.contractNumber,
      daysOpen: sql<number>`GREATEST(0, (${today}::date - ${reservations.endDate}::date))::int`,
    })
    .from(reservations)
    .leftJoin(vehicles, eq(vehicles.id, reservations.vehicleId))
    .leftJoin(customers, eq(customers.id, reservations.customerId))
    .where(where)
    // Longest open first: that is the order an employee works them in.
    .orderBy(asc(reservations.endDate), asc(reservations.id))
    .limit(STILL_OUT_LIMIT);

  return {
    today,
    total: n,
    rows: rows.map((r) => ({
      reservationId: r.reservationId,
      vehicleId: r.vehicleId,
      licensePlate: r.licensePlate,
      vehicleLabel: vehicleLabel(r.brand, r.model),
      customerId: r.customerId,
      customerLabel: customerLabel(r.customerName, r.customerCompany),
      startDate: r.startDate,
      endDate: r.endDate,
      actualPickupDate: r.actualPickupDate,
      contractNumber: r.contractNumber,
      daysOpen: r.daysOpen,
    })),
  };
}
