/**
 * Sub-project D, D4 (besluiten B-41/B-42) - "Annuleren" in "Vervangende voertuigen
 * toewijzen" undoes the whole planning.
 *
 * `POST /api/reservations/:id/abort-planning` (MANAGE_RESERVATIONS or
 * MANAGE_MAINTENANCE) hard-deletes a maintenance block when it (a) is a
 * maintenance block, (b) is still planned (booked, maintenance status
 * scheduled), (c) has no spare or placeholder hanging on it and (d) was created
 * less than an hour ago by the same user. Anything else is 409
 * PLANNING_NOT_ABORTABLE and the client falls back to the normal delete.
 * The portal customer hears "cancelled" only when a "planned" notice went out.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
const { sendEmail } = vi.hoisted(() => ({ sendEmail: vi.fn(async () => true) }));
vi.mock("../utils/email-service", () => ({ sendEmail }));

import { and, eq, like } from "drizzle-orm";
import { db } from "../db";
import { auditLogs, deletedRecords, portalNotifications, reservations, vehicles } from "../../shared/schema";
import { isoToday } from "../services/lifecycle";
import { portalStorage } from "../services/portal-storage";
import { storage } from "../storage";
import { agentFor, cleanupFixtureUsers, type TestAgent } from "./helpers/app";
import { createFixtureReservation, createFixtureVehicle, cleanupFixtures } from "./helpers/fixtures";
import { createTestCustomer, createTestVehicle, createTestReservation, cleanupPortalTestData, TEST_EMAIL_DOMAIN } from "./portal-helpers";

let admin: TestAgent;
let colleague: TestAgent;
let viewer: TestAgent;

beforeAll(async () => {
  await cleanupPortalTestData();
  admin = await agentFor("admin");
  colleague = await agentFor(["manage_maintenance"]);
  viewer = await agentFor(["view_reservations"]);
}, 60_000);

afterAll(async () => {
  await cleanupFixtures();
  await cleanupFixtureUsers();
  await cleanupPortalTestData();
});

const today = isoToday();

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
async function rowOf(id: number) {
  const [row] = await db.select().from(reservations).where(eq(reservations.id, id));
  return row;
}
async function vehicleRow(id: number) {
  const [row] = await db.select().from(vehicles).where(eq(vehicles.id, id));
  return row;
}

async function planBlock(agent: TestAgent, vehicleId: number, startDate = today): Promise<number> {
  const res = await agent.post("/api/reservations").send({
    vehicleId, customerId: null, startDate, endDate: addDays(startDate, 1),
    status: "scheduled", type: "maintenance_block", notes: "FIXT D4", totalPrice: 0,
    maintenanceDuration: 2, maintenanceStatus: "scheduled",
  });
  expect([200, 201]).toContain(res.status);
  return (res.body.id ?? res.body.maintenanceReservationId) as number;
}

describe("POST /api/reservations/:id/abort-planning", () => {
  it("removes a block that was just planned for good: no row, no bin record, the car is free, one audit line", async () => {
    const vehicle = await createFixtureVehicle();
    const id = await planBlock(admin, vehicle.id);
    await storage.recomputeVehicleAvailability(vehicle.id); // the planned block makes the car 'scheduled'
    expect((await vehicleRow(vehicle.id)).availabilityStatus).toBe("scheduled");

    const res = await admin.post(`/api/reservations/${id}/abort-planning`).send({});

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ aborted: true, id });
    expect(await rowOf(id)).toBeUndefined();
    const bin = await db.select().from(deletedRecords).where(and(eq(deletedRecords.entityType, "maintenance_block"), eq(deletedRecords.entityId, id)));
    expect(bin).toHaveLength(0);
    expect((await vehicleRow(vehicle.id)).availabilityStatus).toBe("available");

    // The audit middleware writes after the response has finished.
    await vi.waitFor(async () => {
      const audit = await db.select().from(auditLogs).where(and(eq(auditLogs.action, "reservation.abort-planning"), eq(auditLogs.resourceId, String(id))));
      expect(audit.length).toBeGreaterThanOrEqual(1);
    });
  });

  it("refuses a block with a spare vehicle hanging on it (409 PLANNING_NOT_ABORTABLE) and changes nothing", async () => {
    const vehicle = await createFixtureVehicle();
    const spare = await createFixtureVehicle();
    const id = await planBlock(admin, vehicle.id);
    const replacement = await createFixtureReservation({ vehicleId: spare.id, startDate: today, endDate: addDays(today, 1), type: "replacement" });
    await db.update(reservations).set({ maintenanceBlockId: id }).where(eq(reservations.id, replacement.id));

    const res = await admin.post(`/api/reservations/${id}/abort-planning`).send({});

    expect(res.status).toBe(409);
    expect(res.body.code).toBe("PLANNING_NOT_ABORTABLE");
    expect(res.body.reason).toBe("HAS_REPLACEMENTS");
    expect(await rowOf(id)).toBeTruthy();
    expect(await rowOf(replacement.id)).toBeTruthy();
  });

  it("refuses a placeholder created for a rental that the block overlaps (no link yet)", async () => {
    const vehicle = await createFixtureVehicle();
    const id = await planBlock(admin, vehicle.id);
    const rental = await createFixtureReservation({ vehicleId: vehicle.id, startDate: today, endDate: addDays(today, 3), customerId: null });
    await db.update(reservations).set({ customerId: null }).where(eq(reservations.id, rental.id));
    const placeholder = await createFixtureReservation({ vehicleId: vehicle.id, startDate: today, endDate: addDays(today, 1), type: "replacement" });
    await db.update(reservations).set({ replacementForReservationId: rental.id, placeholderSpare: true, vehicleId: null }).where(eq(reservations.id, placeholder.id));

    const res = await admin.post(`/api/reservations/${id}/abort-planning`).send({});

    expect(res.status).toBe(409);
    expect(res.body.reason).toBe("HAS_REPLACEMENTS");
    expect(await rowOf(id)).toBeTruthy();
    await db.delete(reservations).where(eq(reservations.id, placeholder.id));
  });

  it("refuses a block that is more than an hour old", async () => {
    const vehicle = await createFixtureVehicle();
    const id = await planBlock(admin, vehicle.id);
    await db.update(reservations).set({ createdAt: new Date(Date.now() - 61 * 60 * 1000) }).where(eq(reservations.id, id));

    const res = await admin.post(`/api/reservations/${id}/abort-planning`).send({});

    expect(res.status).toBe(409);
    expect(res.body.code).toBe("PLANNING_NOT_ABORTABLE");
    expect(res.body.reason).toBe("TOO_OLD");
    expect(await rowOf(id)).toBeTruthy();
  });

  it("refuses a block somebody else created, and a viewer is 403", async () => {
    const vehicle = await createFixtureVehicle();
    const id = await planBlock(admin, vehicle.id);

    const other = await colleague.post(`/api/reservations/${id}/abort-planning`).send({});
    expect(other.status).toBe(409);
    expect(other.body.reason).toBe("OTHER_USER");

    const denied = await viewer.post(`/api/reservations/${id}/abort-planning`).send({});
    expect(denied.status).toBe(403);
    expect(await rowOf(id)).toBeTruthy();
  });

  it("a user with manage_maintenance only may abort their own planning", async () => {
    const vehicle = await createFixtureVehicle();
    const id = await planBlock(admin, vehicle.id);
    await db.update(reservations).set({ createdBy: colleague.username }).where(eq(reservations.id, id));

    const res = await colleague.post(`/api/reservations/${id}/abort-planning`).send({});

    expect(res.status).toBe(200);
    expect(await rowOf(id)).toBeUndefined();
  });

  it("refuses a rental, a block the car is in, an unknown id", async () => {
    const vehicle = await createFixtureVehicle();
    const rental = await createFixtureReservation({ vehicleId: vehicle.id, startDate: addDays(today, 5), endDate: addDays(today, 6) });
    const rentalRes = await admin.post(`/api/reservations/${rental.id}/abort-planning`).send({});
    expect(rentalRes.status).toBe(409);
    expect(rentalRes.body.reason).toBe("NOT_A_MAINTENANCE_BLOCK");

    const id = await planBlock(admin, vehicle.id);
    await db.update(reservations).set({ maintenanceStatus: "in", status: "picked_up" }).where(eq(reservations.id, id));
    const inRes = await admin.post(`/api/reservations/${id}/abort-planning`).send({});
    expect(inRes.status).toBe(409);
    expect(inRes.body.reason).toBe("NOT_PLANNED");

    const missing = await admin.post("/api/reservations/987654321/abort-planning").send({});
    expect(missing.status).toBe(404);
  });
});

describe("the portal customer", () => {
  async function setup() {
    const customer = await createTestCustomer("D4");
    const user = await portalStorage.createPortalUser({ customerId: customer.id, email: `d4-${Date.now()}@${TEST_EMAIL_DOMAIN}`, fullName: "D4", role: "admin" }, "t");
    const vehicle = await createTestVehicle();
    await createTestReservation({ customerId: customer.id, vehicleId: vehicle.id, startDate: addDays(today, -3), endDate: null, status: "picked_up" });
    return { customer, user, vehicle };
  }
  const notices = async (customerId: number, type: string) =>
    (await db.select().from(portalNotifications).where(eq(portalNotifications.customerId, customerId))).filter((n) => n.type === type);

  it("hears 'cancelled' when the 'planned' notice had gone out", async () => {
    const { customer, vehicle } = await setup();
    const id = await planBlock(admin, vehicle.id, addDays(today, 5));
    await vi.waitFor(async () => expect(await notices(customer.id, "maintenance_planned")).toHaveLength(1));

    const res = await admin.post(`/api/reservations/${id}/abort-planning`).send({});

    expect(res.status).toBe(200);
    await vi.waitFor(async () => expect(await notices(customer.id, "maintenance_cancelled")).toHaveLength(1));
  });

  it("hears nothing when no 'planned' notice had gone out", async () => {
    const { customer, vehicle } = await setup();
    const id = await planBlock(admin, vehicle.id, addDays(today, 5));
    await vi.waitFor(async () => expect(await notices(customer.id, "maintenance_planned")).toHaveLength(1));
    // The notice never went out (or was removed): the customer has nothing to be told is off.
    await db.delete(portalNotifications).where(and(eq(portalNotifications.customerId, customer.id), like(portalNotifications.dedupeTag, `maint:${id}:planned%`)));

    const res = await admin.post(`/api/reservations/${id}/abort-planning`).send({});

    expect(res.status).toBe(200);
    await new Promise((r) => setTimeout(r, 300));
    expect(await notices(customer.id, "maintenance_cancelled")).toHaveLength(0);
  });
});
