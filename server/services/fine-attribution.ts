import { db } from "../db";
import { reservations, customers, drivers, vehicles, reservationDriverAssignments, type Fine } from "../../shared/schema";
import { and, asc, desc, eq, gte, inArray, isNull, lte, ne, or, sql } from "drizzle-orm";
import { finesStorage, normalizedVehiclePlate } from "./fines-storage";
import { portalStorage } from "./portal-storage";
import { normalizeLicensePlate } from "../../shared/fines";
import { customerDisplayName } from "./customer-display-name";

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
    customerName: customerDisplayName(),
    startDate: reservations.startDate, endDate: reservations.endDate,
    actualPickupDate: reservations.actualPickupDate, actualReturnDate: reservations.actualReturnDate,
    driverId: reservations.driverId, driverName: drivers.displayName,
  }).from(reservations)
    .innerJoin(vehicles, eq(reservations.vehicleId, vehicles.id))
    .leftJoin(customers, eq(reservations.customerId, customers.id))
    .leftJoin(drivers, eq(reservations.driverId, drivers.id))
    .where(and(
      eq(normalizedVehiclePlate, plate),
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

/**
 * Everyone assigned to the reservation at that moment, main and extra drivers. A reservation from
 * before the history was kept has no main row; its reservations.driver_id stands in for the main driver.
 */
export async function driversAt(reservationId: number, at: Date): Promise<number[]> {
  const rows = await db.select({ driverId: reservationDriverAssignments.driverId, isExtra: reservationDriverAssignments.isExtra })
    .from(reservationDriverAssignments)
    .where(and(
      eq(reservationDriverAssignments.reservationId, reservationId),
      lte(reservationDriverAssignments.assignedFrom, at),
      or(isNull(reservationDriverAssignments.assignedUntil), sql`${reservationDriverAssignments.assignedUntil} > ${at}`),
    ))
    .orderBy(asc(reservationDriverAssignments.assignedFrom));
  const ids = rows.map((r) => r.driverId);
  if (!rows.some((r) => !r.isExtra)) {
    const [res] = await db.select({ driverId: reservations.driverId }).from(reservations).where(eq(reservations.id, reservationId));
    ids.unshift(res?.driverId ?? null);
  }
  return Array.from(new Set(ids.filter((id): id is number => id != null)));
}

/**
 * Driver of a reservation at a moment, from the assignment history (fallback: reservations.driver_id).
 * Kees, 2026-10-18: when several drivers shared the car at that moment there is no one to name, so
 * the fine stays without a driver and the customer says who drove.
 */
export async function driverAt(reservationId: number, at: Date): Promise<number | null> {
  const ids = await driversAt(reservationId, at);
  return ids.length === 1 ? ids[0] : null;
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
    // A new attribution: whoever it points at has not been told yet (B-41 D10).
    customerNotifiedAt: null,
  });
  return updated!;
}

export async function unlinkFine(fineId: number, by: string): Promise<Fine> {
  const updated = await finesStorage.updateFine(fineId, {
    customerId: null, reservationId: null, driverId: null, status: "new", linkedAt: null, linkedBy: null, updatedBy: by,
    customerNotifiedAt: null,
  });
  if (!updated) throw new Error("Fine not found");
  return updated;
}

/**
 * B-64: whether a fine's reservation still holds the car at the offence moment.
 * Plate or moment may have been corrected after linking; a fine without a
 * reservation (linked to a customer only) has nothing to compare and fits.
 */
export async function linkStillFits(fine: Pick<Fine, "licensePlate" | "offenceAt" | "reservationId">): Promise<boolean> {
  if (!fine.reservationId) return true;
  const { covering } = await findCandidates(fine.licensePlate, fine.offenceAt);
  return covering.some((c) => c.id === fine.reservationId);
}

/** B-64: drop the current link and try the automatic one again. Staff ask for it; it is never done on its own. */
export async function reattributeFine(fineId: number, by: string): Promise<{ fine: Fine; linked: boolean }> {
  await unlinkFine(fineId, by);
  const { fine } = await attributeFine(fineId);
  return { fine, linked: fine.status === "linked" };
}
