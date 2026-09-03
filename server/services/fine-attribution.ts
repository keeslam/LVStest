import { db } from "../db";
import { reservations, customers, drivers, vehicles, reservationDriverAssignments, type Fine } from "../../shared/schema";
import { and, asc, desc, eq, gte, inArray, isNull, lte, ne, or, sql } from "drizzle-orm";
import { finesStorage } from "./fines-storage";
import { portalStorage } from "./portal-storage";
import { normalizeLicensePlate } from "../../shared/fines";

export interface CandidateReservation {
  id: number; customerId: number | null; customerName: string | null;
  startDate: string; endDate: string | null; actualPickupDate: string | null; actualReturnDate: string | null;
  driverId: number | null; driverName: string | null;
}

const NEAR_DAYS = 3;
const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const shift = (d: Date, days: number) => new Date(d.getTime() + days * 86_400_000);

/** Effective period: actual dates win over planned ones; open end = still running. */
function covers(c: CandidateReservation, day: string): boolean {
  const start = c.actualPickupDate || c.startDate;
  const end = c.actualReturnDate || c.endDate;
  return start <= day && (!end || day <= end);
}

/**
 * Reservations on this plate around the offence moment: `covering` ones hold
 * the vehicle at that moment, `near` ones are within a few days (shown to
 * staff when nothing covers it, e.g. a late return that was never recorded).
 */
export async function findCandidates(licensePlate: string, offenceAt: Date): Promise<{ covering: CandidateReservation[]; near: CandidateReservation[] }> {
  const plate = normalizeLicensePlate(licensePlate);
  const day = isoDay(offenceAt);
  const rows = await db.select({
    id: reservations.id, customerId: reservations.customerId,
    customerName: sql<string | null>`coalesce(${customers.companyName}, ${customers.name})`,
    startDate: reservations.startDate, endDate: reservations.endDate,
    actualPickupDate: reservations.actualPickupDate, actualReturnDate: reservations.actualReturnDate,
    driverId: reservations.driverId, driverName: drivers.displayName,
  }).from(reservations)
    .innerJoin(vehicles, eq(reservations.vehicleId, vehicles.id))
    .leftJoin(customers, eq(reservations.customerId, customers.id))
    .leftJoin(drivers, eq(reservations.driverId, drivers.id))
    .where(and(
      eq(vehicles.licensePlate, plate),
      isNull(reservations.deletedAt),
      inArray(reservations.type, ["standard", "replacement"]),
      ne(reservations.status, "cancelled"),
      lte(reservations.startDate, isoDay(shift(offenceAt, NEAR_DAYS))),
      or(isNull(reservations.endDate), gte(reservations.endDate, isoDay(shift(offenceAt, -NEAR_DAYS)))),
    ))
    .orderBy(desc(reservations.startDate));
  const covering = rows.filter((r) => covers(r, day));
  const near = rows.filter((r) => !covers(r, day));
  return { covering, near };
}

/** Driver of a reservation at a moment, from the assignment history (fallback: reservations.driver_id). */
export async function driverAt(reservationId: number, at: Date): Promise<number | null> {
  const [row] = await db.select({ driverId: reservationDriverAssignments.driverId })
    .from(reservationDriverAssignments)
    .where(and(
      eq(reservationDriverAssignments.reservationId, reservationId),
      lte(reservationDriverAssignments.assignedFrom, at),
      or(isNull(reservationDriverAssignments.assignedUntil), sql`${reservationDriverAssignments.assignedUntil} > ${at}`),
    ))
    .orderBy(asc(reservationDriverAssignments.assignedFrom))
    .limit(1);
  if (row) return row.driverId;
  const [res] = await db.select({ driverId: reservations.driverId }).from(reservations).where(eq(reservations.id, reservationId));
  return res?.driverId ?? null;
}

/** Links automatically when exactly one reservation covers the moment; otherwise leaves the fine `new`. */
export async function attributeFine(fineId: number): Promise<{ fine: Fine; candidates: { covering: CandidateReservation[]; near: CandidateReservation[] } }> {
  const fine = await finesStorage.getFine(fineId);
  if (!fine) throw new Error("Fine not found");
  const candidates = await findCandidates(fine.licensePlate, fine.offenceAt);
  if (fine.status !== "new" || candidates.covering.length !== 1) return { fine, candidates };
  const [match] = candidates.covering;
  const driverId = await driverAt(match.id, fine.offenceAt);
  const updated = await finesStorage.updateFine(fineId, {
    customerId: match.customerId, reservationId: match.id, driverId,
    status: "linked", linkedAt: new Date(), linkedBy: "system",
  });
  return { fine: updated!, candidates };
}

export async function linkFineManually(fineId: number, input: { customerId: number; reservationId?: number | null; driverId?: number | null }, by: string): Promise<Fine> {
  const fine = await finesStorage.getFine(fineId);
  if (!fine) throw new Error("Fine not found");
  if (input.reservationId) {
    const [r] = await db.select({ customerId: reservations.customerId }).from(reservations).where(eq(reservations.id, input.reservationId));
    if (!r || r.customerId !== input.customerId) throw new Error("Reservation does not belong to customer");
  }
  if (input.driverId) {
    const d = await portalStorage.getDriverForCustomer(input.driverId, input.customerId);
    if (!d) throw new Error("Driver does not belong to customer");
  }
  const updated = await finesStorage.updateFine(fineId, {
    customerId: input.customerId, reservationId: input.reservationId ?? null, driverId: input.driverId ?? null,
    status: "linked", linkedAt: new Date(), linkedBy: by, updatedBy: by,
  });
  return updated!;
}

export async function unlinkFine(fineId: number, by: string): Promise<Fine> {
  const updated = await finesStorage.updateFine(fineId, {
    customerId: null, reservationId: null, driverId: null, status: "new", linkedAt: null, linkedBy: null, updatedBy: by,
  });
  if (!updated) throw new Error("Fine not found");
  return updated;
}
