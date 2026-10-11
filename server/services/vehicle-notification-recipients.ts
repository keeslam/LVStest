/**
 * besluiten.md **B-24** (BUG-170) — who gets a reminder about a vehicle.
 *
 * "Alleen de huidige huurder, dat wil zeggen de klant van de lopende of
 * eerstvolgende reservering op dat voertuig. Staat de auto leeg, dan gaat er
 * alleen een melding naar kantoor. Nooit meer naar iedereen die ooit op dat
 * kenteken heeft gehuurd."
 *
 * Phase 36 sent one APK reminder for one vehicle and the SMTP stub caught
 * three messages: the current holder, somebody who rented the car in 2021, and
 * somebody whose rental starts in July 2027. The route joined vehicle →
 * reservation → customer with no filter on status or date and no
 * de-duplication, so every renter the plate ever had got the mail — and with
 * it the reminder that this customer is driving that car.
 */
import { and, asc, eq, inArray, isNotNull, ne, or, gte, isNull, sql } from "drizzle-orm";
import { db } from "../db";
import { customers, reservations, vehicles } from "../../shared/schema";
import { isoToday } from "./lifecycle";

export interface VehicleRenter {
  vehicleId: number;
  reservationId: number;
  customerId: number;
  startDate: string;
  endDate: string | null;
  status: string;
}

/** Statuses that mean "this rental is real and not over". */
const LIVE_STATUSES = ["booked", "picked_up", "confirmed", "active", "pending", "scheduled"] as const;

/**
 * The reservation whose customer counts as "the current renter" of a vehicle:
 * the running one first, then the next one that has not started yet. A closed,
 * cancelled or finished rental never qualifies, and neither does a maintenance
 * block (it has no customer).
 *
 * Returns null when the car is not rented out — B-24's "staat de auto leeg".
 */
export async function currentRenterReservation(
  vehicleId: number,
  today: string = isoToday(),
): Promise<VehicleRenter | null> {
  const rows = await db
    .select({
      reservationId: reservations.id,
      customerId: reservations.customerId,
      startDate: reservations.startDate,
      endDate: reservations.endDate,
      status: reservations.status,
    })
    .from(reservations)
    .where(
      and(
        eq(reservations.vehicleId, vehicleId),
        isNotNull(reservations.customerId),
        isNull(reservations.deletedAt),
        ne(reservations.type, "maintenance_block"),
        inArray(sql`lower(${reservations.status})`, [...LIVE_STATUSES]),
        // Running (it started and has not ended) or still to come.
        or(
          gte(reservations.startDate, today),
          or(isNull(reservations.endDate), gte(reservations.endDate, today)),
        ),
      ),
    )
    .orderBy(asc(reservations.startDate), asc(reservations.id));

  if (rows.length === 0) return null;

  // Running first — the customer who physically has the car — then the
  // earliest future one.
  const running = rows.find((r) => r.startDate <= today && (!r.endDate || r.endDate >= today));
  const chosen = running ?? rows.find((r) => r.startDate > today) ?? null;
  if (!chosen || chosen.customerId === null) return null;
  return {
    vehicleId,
    reservationId: chosen.reservationId,
    customerId: chosen.customerId,
    startDate: chosen.startDate as string,
    endDate: (chosen.endDate as string | null) ?? null,
    status: chosen.status as string,
  };
}

export interface VehicleNotificationTarget {
  vehicle: typeof vehicles.$inferSelect;
  /** The current renter, or null when the vehicle is not rented out. */
  customer: typeof customers.$inferSelect | null;
  /** D15: the reservation that makes that customer the renter (its dates fill the placeholders); null with no renter. */
  reservation: VehicleRenter | null;
}

/**
 * One entry per vehicle: the vehicle and, when it is rented out now or next,
 * that one customer. Never a historical renter, never the same customer twice
 * for the same vehicle.
 */
export async function vehicleNotificationTargets(
  vehicleIds: number[],
  today: string = isoToday(),
): Promise<VehicleNotificationTarget[]> {
  const targets: VehicleNotificationTarget[] = [];
  for (const vehicleId of vehicleIds) {
    const [vehicle] = await db.select().from(vehicles).where(eq(vehicles.id, vehicleId));
    if (!vehicle) continue;
    const renter = await currentRenterReservation(vehicleId, today);
    if (!renter) {
      targets.push({ vehicle, customer: null, reservation: null });
      continue;
    }
    const [customer] = await db.select().from(customers).where(eq(customers.id, renter.customerId));
    targets.push({ vehicle, customer: customer ?? null, reservation: renter });
  }
  return targets;
}

/**
 * D15: the date a maintenance template means by `{maintenanceDate}`: the vehicle's last service date,
 * else the date of the maintenance block that covers today, else of the next one still to come.
 * Null when the vehicle has neither (the placeholder is then sent empty).
 */
export async function maintenanceDateForVehicle(
  vehicle: { id: number; lastServiceDate?: string | null },
  today: string = isoToday(),
): Promise<string | null> {
  if (vehicle.lastServiceDate) return vehicle.lastServiceDate;
  const blocks = await db
    .select({ startDate: reservations.startDate, endDate: reservations.endDate })
    .from(reservations)
    .where(
      and(
        eq(reservations.vehicleId, vehicle.id),
        eq(reservations.type, "maintenance_block"),
        isNull(reservations.deletedAt),
        ne(sql`lower(${reservations.status})`, "cancelled"),
        or(isNull(reservations.endDate), gte(reservations.endDate, today)),
      ),
    )
    .orderBy(asc(reservations.startDate), asc(reservations.id));
  const covering = blocks.find((b) => b.startDate <= today);
  return (covering ?? blocks[0])?.startDate ?? null;
}
