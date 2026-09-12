/**
 * besluiten.md **B-13** — "Huur verhuist naar een andere auto: het
 * onderhoudsblok blijft bij de fysieke auto. De gekoppelde vervanger en de
 * bijbehorende klantmelding vervallen; de klant krijgt bericht dat het
 * onderhoud niet meer bij zijn huur hoort (conform B-06)." (BUG-139)
 *
 * What the audit found (p11-portal3 Q7): `PATCH /api/reservations/:id
 * {vehicleId}` answered 200 and left the block, its spare and the customer's
 * "Onderhoud gepland" notification behind on the old car. The customer kept a
 * notice for a vehicle they no longer drove, could not change it any more
 * (`maintenance_change` → 404) and nobody was told anything.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
const { sendEmail } = vi.hoisted(() => ({ sendEmail: vi.fn(async () => true) }));
vi.mock("../utils/email-service", () => ({ sendEmail }));

import { and, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { reservations, portalNotifications } from "../../shared/schema";
import { portalStorage } from "../services/portal-storage";
import { agentFor, cleanupFixtureUsers, type TestAgent } from "./helpers/app";
import {
  cleanupPortalTestData, createTestCustomer, createTestVehicle, createTestReservation,
  TEST_EMAIL_DOMAIN,
} from "./portal-helpers";

let admin: TestAgent;
let customerId: number;

beforeAll(async () => {
  await cleanupPortalTestData();
  admin = await agentFor("admin");
  customerId = (await createTestCustomer("B13")).id;
  await portalStorage.createPortalUser(
    { customerId, email: `b13@${TEST_EMAIL_DOMAIN}`, fullName: "Portaalklant", role: "admin" },
    "t",
  );
});

afterAll(async () => {
  await db.delete(portalNotifications).where(eq(portalNotifications.customerId, customerId));
  await cleanupPortalTestData();
  await cleanupFixtureUsers();
});

/** Fixed far-future days: no dependency on today or on the weekday. */
const RENTAL_START = "2030-06-01";
const BLOCK_START = "2030-06-10";
const BLOCK_END = "2030-06-12";

async function notificationsFor(): Promise<Array<{ type: string; description: string; dedupeTag: string | null }>> {
  return db.select({
    type: portalNotifications.type,
    description: portalNotifications.description,
    dedupeTag: portalNotifications.dedupeTag,
  }).from(portalNotifications).where(eq(portalNotifications.customerId, customerId));
}

describe("B-13 — a rental moves to another vehicle (BUG-139)", () => {
  it("leaves the block on the old car, cancels the spare and tells the customer", async () => {
    const oldCar = await createTestVehicle();
    const newCar = await createTestVehicle();
    const spareCar = await createTestVehicle();

    const rental = await createTestReservation({
      customerId, vehicleId: oldCar.id, startDate: RENTAL_START, endDate: null, status: "picked_up",
    });

    // The block the portal planned for this rental, with its replacement.
    const [block] = await db.insert(reservations).values({
      vehicleId: oldCar.id, customerId: null, startDate: BLOCK_START, endDate: BLOCK_END,
      type: "maintenance_block", status: "booked", maintenanceStatus: "scheduled",
      affectedRentalId: rental.id,
    } as any).returning();
    const [spare] = await db.insert(reservations).values({
      vehicleId: spareCar.id, customerId, startDate: BLOCK_START, endDate: BLOCK_END,
      type: "replacement", status: "booked",
      replacementForReservationId: rental.id, maintenanceBlockId: block.id,
    } as any).returning();

    // The "Onderhoud gepland" the customer already has.
    await db.insert(portalNotifications).values({
      customerId, type: "maintenance_planned", title: "Onderhoud gepland",
      description: "Onderhoud op 10-06-2030", dedupeTag: `maint:${block.id}:planned:${BLOCK_START}`,
    } as any);

    const res = await admin.patch(`/api/reservations/${rental.id}`).send({ vehicleId: newCar.id });
    expect(res.status).toBe(200);

    // The rental is on the new car …
    const [movedRental] = await db.select().from(reservations).where(eq(reservations.id, rental.id));
    expect(movedRental.vehicleId).toBe(newCar.id);

    // … and the block stayed on the physical car it belongs to, no longer
    // bound to a rental that has moved away.
    const [blockAfter] = await db.select().from(reservations).where(eq(reservations.id, block.id));
    expect(blockAfter.vehicleId).toBe(oldCar.id);
    expect(blockAfter.affectedRentalId).toBeNull();
    expect(blockAfter.deletedAt).toBeNull();

    // The linked replacement is cancelled — the customer is not getting a spare
    // for maintenance that is no longer theirs.
    const [spareAfter] = await db.select().from(reservations).where(eq(reservations.id, spare.id));
    expect(spareAfter.status).toBe("cancelled");

    const notifications = await notificationsFor();
    // The old "Onderhoud gepland" for this block is gone …
    expect(notifications.some((n) => n.dedupeTag?.startsWith(`maint:${block.id}:planned`))).toBe(false);
    // … and the customer was told why (B-06: datums of voertuig gewijzigd).
    const unlinked = notifications.find((n) => n.type === "maintenance_unlinked");
    expect(unlinked).toBeDefined();
    expect(unlinked!.description).toContain(oldCar.licensePlate);
  });

  it("a spare the customer already drives is left alone", async () => {
    const oldCar = await createTestVehicle();
    const newCar = await createTestVehicle();
    const spareCar = await createTestVehicle();

    const rental = await createTestReservation({
      customerId, vehicleId: oldCar.id, startDate: "2030-08-01", endDate: null, status: "picked_up",
    });
    const [block] = await db.insert(reservations).values({
      vehicleId: oldCar.id, customerId: null, startDate: "2030-08-10", endDate: "2030-08-12",
      type: "maintenance_block", status: "booked", maintenanceStatus: "scheduled",
      affectedRentalId: rental.id,
    } as any).returning();
    const [spare] = await db.insert(reservations).values({
      vehicleId: spareCar.id, customerId, startDate: "2030-08-10", endDate: "2030-08-12",
      type: "replacement", status: "picked_up",
      replacementForReservationId: rental.id, maintenanceBlockId: block.id,
    } as any).returning();

    expect((await admin.patch(`/api/reservations/${rental.id}`).send({ vehicleId: newCar.id })).status).toBe(200);

    // BUG-004's rule, here too: a spare that is really at the customer is not
    // swept away by an administrative change.
    const [spareAfter] = await db.select().from(reservations).where(eq(reservations.id, spare.id));
    expect(spareAfter.status).toBe("picked_up");
  });

  it("an ordinary date change touches none of it", async () => {
    const car = await createTestVehicle();
    const rental = await createTestReservation({
      customerId, vehicleId: car.id, startDate: "2030-09-01", endDate: "2030-09-20", status: "booked",
    });
    const [block] = await db.insert(reservations).values({
      vehicleId: car.id, customerId: null, startDate: "2030-09-10", endDate: "2030-09-12",
      type: "maintenance_block", status: "booked", maintenanceStatus: "scheduled",
      affectedRentalId: rental.id,
    } as any).returning();

    expect((await admin.patch(`/api/reservations/${rental.id}`).send({ notes: "iets" })).status).toBe(200);

    const [blockAfter] = await db.select().from(reservations).where(eq(reservations.id, block.id));
    expect(blockAfter.affectedRentalId).toBe(rental.id);
  });
});
