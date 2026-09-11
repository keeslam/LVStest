/**
 * AUDIT-style fixtures for the remediation tests (plan §8.1).
 *
 * Every row carries the `FIXT-` prefix so a leak is greppable, and
 * `cleanupFixtures()` deletes **by vehicle id and by customer id**, in FK
 * order — the omission that made BUG-145 (258 orphan maintenance blocks) is
 * exactly "cleaned by customer id only".
 */
import { db } from "../../db";
import {
  customers, vehicles, reservations, expenses, documents,
  type Customer, type Vehicle, type Reservation,
} from "../../../shared/schema";
import { like, inArray, or, eq } from "drizzle-orm";

export const FIXTURE_PREFIX = "FIXT-";
/** License plates are matched on this prefix; keep it distinct from `PT%`. */
export const FIXTURE_PLATE_PREFIX = "FIXT";

let counter = 0;
function nextId(): string {
  counter += 1;
  return `${Date.now().toString(36)}${counter}`;
}

export async function createFixtureCustomer(name = "Klant"): Promise<Customer> {
  const [row] = await db.insert(customers).values({
    name: `${FIXTURE_PREFIX}${name}-${nextId()}`,
    companyName: `${FIXTURE_PREFIX}${name} BV`,
    email: `${nextId()}@fixture-test.invalid`,
    customerType: "business",
  }).returning();
  return row;
}

export async function createFixtureVehicle(overrides: Partial<typeof vehicles.$inferInsert> = {}): Promise<Vehicle> {
  const [row] = await db.insert(vehicles).values({
    licensePlate: `${FIXTURE_PLATE_PREFIX}-${nextId()}`.slice(0, 20),
    brand: `${FIXTURE_PREFIX}Brand`,
    model: "Model",
    ...overrides,
  }).returning();
  return row;
}

export async function createFixtureReservation(input: {
  customerId?: number | null;
  vehicleId: number;
  startDate?: string;
  endDate?: string | null;
  status?: string;
  type?: string;
}): Promise<Reservation> {
  const [row] = await db.insert(reservations).values({
    customerId: input.customerId ?? null,
    vehicleId: input.vehicleId,
    startDate: input.startDate ?? "2026-10-01",
    endDate: input.endDate === undefined ? "2026-10-05" : input.endDate,
    status: input.status ?? "booked",
    type: input.type ?? "standard",
  } as any).returning();
  return row;
}

/**
 * Deletes every fixture row. Reservations are removed both by customer id
 * **and** by vehicle id, so a maintenance block (customer_id NULL) on a
 * fixture vehicle cannot survive its vehicle — that is BUG-145.
 */
export async function cleanupFixtures(): Promise<void> {
  const fixtureCustomers = await db.select({ id: customers.id }).from(customers)
    .where(like(customers.name, `${FIXTURE_PREFIX}%`));
  const fixtureVehicles = await db.select({ id: vehicles.id }).from(vehicles)
    .where(like(vehicles.licensePlate, `${FIXTURE_PLATE_PREFIX}%`));
  const customerIds = fixtureCustomers.map((c) => c.id);
  const vehicleIds = fixtureVehicles.map((v) => v.id);

  const conditions = [
    customerIds.length ? inArray(reservations.customerId, customerIds) : undefined,
    vehicleIds.length ? inArray(reservations.vehicleId, vehicleIds) : undefined,
  ].filter(Boolean) as any[];

  if (conditions.length) {
    const rows = await db.select({ id: reservations.id }).from(reservations)
      .where(conditions.length === 1 ? conditions[0] : or(...conditions));
    const reservationIds = rows.map((r) => r.id);
    if (reservationIds.length) {
      await db.delete(documents).where(inArray(documents.reservationId, reservationIds));
      await db.delete(reservations).where(inArray(reservations.id, reservationIds));
    }
  }
  if (vehicleIds.length) {
    await db.delete(documents).where(inArray(documents.vehicleId, vehicleIds));
    await db.delete(expenses).where(inArray(expenses.vehicleId, vehicleIds));
    await db.delete(vehicles).where(inArray(vehicles.id, vehicleIds));
  }
  if (customerIds.length) {
    await db.delete(customers).where(inArray(customers.id, customerIds));
  }
}

/** Convenience for asserting a row really is gone. */
export async function vehicleExists(id: number): Promise<boolean> {
  const rows = await db.select({ id: vehicles.id }).from(vehicles).where(eq(vehicles.id, id));
  return rows.length > 0;
}
