import { db } from "../db";
import { reservations, reservationDriverAssignments, drivers, type ReservationDriverAssignment } from "../../shared/schema";
import { and, asc, eq, isNull } from "drizzle-orm";

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
 * Records who drives a reservation from when. Closes the currently open
 * assignment, opens the new one and mirrors driver_id onto the reservation so
 * every existing staff screen keeps showing the current driver. Runs in one
 * transaction; assigning the driver that is already current changes nothing.
 */
export async function assignDriverToReservation(input: AssignDriverInput): Promise<ReservationDriverAssignment> {
  const at = input.at ?? new Date();
  return db.transaction(async (tx) => {
    const [current] = await tx.select().from(reservationDriverAssignments)
      .where(and(eq(reservationDriverAssignments.reservationId, input.reservationId), isNull(reservationDriverAssignments.assignedUntil)));

    if (current && current.driverId === input.driverId) return current;

    if (current) {
      await tx.update(reservationDriverAssignments)
        .set({ assignedUntil: at })
        .where(eq(reservationDriverAssignments.id, current.id));
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

export async function getDriverAssignments(reservationId: number): Promise<Array<ReservationDriverAssignment & { driverName: string | null }>> {
  const rows = await db.select({ a: reservationDriverAssignments, driverName: drivers.displayName })
    .from(reservationDriverAssignments)
    .leftJoin(drivers, eq(reservationDriverAssignments.driverId, drivers.id))
    .where(eq(reservationDriverAssignments.reservationId, reservationId))
    .orderBy(asc(reservationDriverAssignments.assignedFrom), asc(reservationDriverAssignments.id));
  return rows.map((r) => ({ ...r.a, driverName: r.driverName }));
}
