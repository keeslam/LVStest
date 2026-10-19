import { db } from "../db";
import { reservations, reservationDriverAssignments, drivers, vehicles, type ReservationDriverAssignment } from "../../shared/schema";
import { and, asc, eq, inArray, isNull, ne, or } from "drizzle-orm";
import { syncUsagePeriodSafely } from "./fiscal/usage-periods";

export interface AssignDriverInput {
  reservationId: number;
  driverId: number | null;
  byPortalUserId?: number;
  byUserId?: number;
  note?: string;
  /** Moment the new driver takes over; defaults to now. */
  at?: Date;
}

/**
 * Records who drives a reservation from when. Closes the currently open main
 * assignment, opens the new one and mirrors driver_id onto the reservation so
 * every existing staff screen keeps showing the current driver. Runs in one
 * transaction; assigning the driver that is already current changes nothing.
 * Extra drivers stay; one who becomes the main driver stops being an extra.
 */
export async function assignDriverToReservation(input: AssignDriverInput): Promise<ReservationDriverAssignment> {
  const at = input.at ?? new Date();
  const assignment = await assignInTransaction(input, at);
  // Fiscal mobility check: the driver count of the usage period follows every change (docs/fiscaal §4.3).
  await syncUsagePeriodSafely(input.reservationId);
  return assignment;
}

async function assignInTransaction(input: AssignDriverInput, at: Date): Promise<ReservationDriverAssignment> {
  return db.transaction(async (tx) => {
    const open = await tx.select().from(reservationDriverAssignments)
      .where(and(eq(reservationDriverAssignments.reservationId, input.reservationId), isNull(reservationDriverAssignments.assignedUntil)));
    const current = open.find((a) => !a.isExtra);

    if (current && current.driverId === input.driverId) return current;

    // The old main driver steps down; the new one, if they were an extra driver here, is one no longer.
    const closing = open.filter((a) => !a.isExtra || (input.driverId != null && a.driverId === input.driverId));
    if (closing.length > 0) {
      await tx.update(reservationDriverAssignments)
        .set({ assignedUntil: at })
        .where(inArray(reservationDriverAssignments.id, closing.map((a) => a.id)));
    }

    const [created] = await tx.insert(reservationDriverAssignments).values({
      reservationId: input.reservationId,
      driverId: input.driverId,
      assignedFrom: at,
      assignedUntil: null,
      assignedByPortalUserId: input.byPortalUserId ?? null,
      assignedByUserId: input.byUserId ?? null,
      note: input.note ?? null,
    }).returning();

    await tx.update(reservations).set({ driverId: input.driverId }).where(eq(reservations.id, input.reservationId));
    return created;
  });
}

/**
 * Puts an extra driver on a reservation (Kees, 2026-10-18): the car is shared. The main driver and the
 * contract stay as they are. Returns null when this driver is already on this car.
 */
export async function addExtraDriver(input: { reservationId: number; driverId: number; byPortalUserId?: number; byUserId?: number; at?: Date }): Promise<ReservationDriverAssignment | null> {
  const at = input.at ?? new Date();
  const created = await db.transaction(async (tx) => {
    const [res] = await tx.select({ driverId: reservations.driverId }).from(reservations).where(eq(reservations.id, input.reservationId));
    if (res?.driverId === input.driverId) return null;
    const [already] = await tx.select({ id: reservationDriverAssignments.id }).from(reservationDriverAssignments).where(and(
      eq(reservationDriverAssignments.reservationId, input.reservationId), eq(reservationDriverAssignments.driverId, input.driverId), isNull(reservationDriverAssignments.assignedUntil),
    ));
    if (already) return null;
    const [row] = await tx.insert(reservationDriverAssignments).values({
      reservationId: input.reservationId, driverId: input.driverId, assignedFrom: at, assignedUntil: null, isExtra: true,
      assignedByPortalUserId: input.byPortalUserId ?? null, assignedByUserId: input.byUserId ?? null, note: null,
    }).returning();
    return row;
  });
  if (created) await syncUsagePeriodSafely(input.reservationId);
  return created;
}

/** Takes an extra driver off a reservation; history is kept (the row is closed, not deleted). */
export async function removeExtraDriver(reservationId: number, driverId: number, at = new Date()): Promise<boolean> {
  const closed = await db.update(reservationDriverAssignments).set({ assignedUntil: at }).where(and(
    eq(reservationDriverAssignments.reservationId, reservationId), eq(reservationDriverAssignments.driverId, driverId),
    eq(reservationDriverAssignments.isExtra, true), isNull(reservationDriverAssignments.assignedUntil),
  )).returning({ id: reservationDriverAssignments.id });
  if (closed.length > 0) await syncUsagePeriodSafely(reservationId);
  return closed.length > 0;
}

/** The extra drivers on each of these reservations right now, by reservation id. */
export async function listExtraDrivers(reservationIds: number[]): Promise<Map<number, Array<{ id: number; displayName: string }>>> {
  const out = new Map<number, Array<{ id: number; displayName: string }>>();
  if (reservationIds.length === 0) return out;
  const rows = await db.select({ reservationId: reservationDriverAssignments.reservationId, id: drivers.id, displayName: drivers.displayName })
    .from(reservationDriverAssignments)
    .innerJoin(drivers, eq(reservationDriverAssignments.driverId, drivers.id))
    .where(and(inArray(reservationDriverAssignments.reservationId, reservationIds), eq(reservationDriverAssignments.isExtra, true), isNull(reservationDriverAssignments.assignedUntil)))
    .orderBy(asc(reservationDriverAssignments.assignedFrom));
  for (const r of rows) out.set(r.reservationId, [...(out.get(r.reservationId) ?? []), { id: r.id, displayName: r.displayName }]);
  return out;
}

/**
 * One car per driver: another booked or running reservation this driver is on, as main or extra
 * driver, or undefined. `exceptReservationId` is the car being changed.
 */
export async function driverBusyElsewhere(driverId: number, exceptReservationId: number): Promise<{ id: number; licensePlate: string | null } | undefined> {
  const [row] = await db.selectDistinct({ id: reservations.id, licensePlate: vehicles.licensePlate })
    .from(reservations)
    .leftJoin(vehicles, eq(reservations.vehicleId, vehicles.id))
    .leftJoin(reservationDriverAssignments, and(
      eq(reservationDriverAssignments.reservationId, reservations.id), eq(reservationDriverAssignments.driverId, driverId), isNull(reservationDriverAssignments.assignedUntil),
    ))
    .where(and(
      ne(reservations.id, exceptReservationId), isNull(reservations.deletedAt), inArray(reservations.status, ["booked", "picked_up"]),
      or(eq(reservations.driverId, driverId), eq(reservationDriverAssignments.driverId, driverId)),
    ))
    .limit(1);
  return row;
}

export async function getDriverAssignments(reservationId: number): Promise<Array<ReservationDriverAssignment & { driverName: string | null }>> {
  const rows = await db.select({ a: reservationDriverAssignments, driverName: drivers.displayName })
    .from(reservationDriverAssignments)
    .leftJoin(drivers, eq(reservationDriverAssignments.driverId, drivers.id))
    .where(eq(reservationDriverAssignments.reservationId, reservationId))
    .orderBy(asc(reservationDriverAssignments.assignedFrom), asc(reservationDriverAssignments.id));
  return rows.map((r) => ({ ...r.a, driverName: r.driverName }));
}
