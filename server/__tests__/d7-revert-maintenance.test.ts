/**
 * Sub-project D, final wave (D7 follow-up) - a block reverted from the
 * maintenance history ("Terugdraaien") stays usable.
 *
 * The revert used to send `PATCH { maintenanceStatus: 'in' }` and left
 * `status = completed`: the edit dialog could not save such a block (its
 * `status: 'in'` is picked_up, and completed -> picked_up is refused: 400
 * INVALID_STATUS_TRANSITION), the list hid it (it keys on status) while the
 * calendar showed it (it keys on maintenance status). The revert now sends
 * `{ status: 'picked_up', maintenanceStatus: 'in' }` and the server allows
 * completed -> picked_up for a MAINTENANCE BLOCK when - and only when - the
 * same save puts the car back "Binnen". A customer rental never comes back.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { reservations, vehicles } from "../../shared/schema";
import { isReservationTransitionAllowed, isoToday } from "../services/lifecycle";
import { agentFor, cleanupFixtureUsers, type TestAgent } from "./helpers/app";
import { createFixtureCustomer, createFixtureReservation, createFixtureVehicle, cleanupFixtures } from "./helpers/fixtures";

let admin: TestAgent;

beforeAll(async () => {
  admin = await agentFor("admin");
});

afterAll(async () => {
  await cleanupFixtures();
  await cleanupFixtureUsers();
});

const today = isoToday();

async function blockRow(id: number) {
  const [row] = await db.select().from(reservations).where(eq(reservations.id, id));
  return row;
}
async function vehicleRow(id: number) {
  const [row] = await db.select().from(vehicles).where(eq(vehicles.id, id));
  return row;
}

/** A block the car is "Binnen" for today, then finished with Afronden. */
async function finishedBlock() {
  const vehicle = await createFixtureVehicle();
  const created = await admin.post("/api/reservations").send({
    vehicleId: vehicle.id, customerId: null, startDate: today, endDate: today,
    status: "scheduled", type: "maintenance_block", notes: "breakdown: FIXT revert test",
    totalPrice: 0, maintenanceDuration: 1, maintenanceStatus: "scheduled",
  });
  expect([200, 201]).toContain(created.status);
  const id = created.body.id as number;
  expect((await admin.patch(`/api/reservations/${id}`).send({ status: "in", maintenanceStatus: "in" })).status).toBe(200);
  expect((await admin.post(`/api/reservations/${id}/complete-maintenance`).send({ completionDate: today })).status).toBe(200);
  expect((await blockRow(id)).status).toBe("completed");
  expect((await vehicleRow(vehicle.id)).availabilityStatus).toBe("available");
  return { vehicle, id };
}

describe("the state machine: completed -> picked_up", () => {
  it("is allowed for a maintenance block that is reopened, and for nothing else", () => {
    expect(isReservationTransitionAllowed("completed", "picked_up", { maintenanceBlock: true, reopenBlock: true })).toBe(true);
    // not without the reopen signal, not for a rental, not for a reopen flag on a rental
    expect(isReservationTransitionAllowed("completed", "picked_up", { maintenanceBlock: true })).toBe(false);
    expect(isReservationTransitionAllowed("completed", "picked_up", {})).toBe(false);
    expect(isReservationTransitionAllowed("completed", "picked_up", { reopenBlock: true })).toBe(false);
    // the exemption is only for picked_up
    expect(isReservationTransitionAllowed("completed", "booked", { maintenanceBlock: true, reopenBlock: true })).toBe(false);
  });
});

describe.each([
  ["PATCH /api/reservations/:id", (id: number) => `/api/reservations/${id}`],
  ["PATCH /api/reservations/:id/basic", (id: number) => `/api/reservations/${id}/basic`],
] as const)("%s - Terugdraaien from the maintenance history", (_label, urlFor) => {
  it("status picked_up + maintenance in: the block is open again, the car is back in the workshop, Afronden works again", async () => {
    const { vehicle, id } = await finishedBlock();

    const revert = await admin.patch(urlFor(id)).send({ status: "picked_up", maintenanceStatus: "in" });

    expect(revert.status).toBe(200);
    const reverted = await blockRow(id);
    expect(reverted.status).toBe("picked_up");
    expect(reverted.maintenanceStatus).toBe("in");
    // "Binnen" again: the car carries the workshop flag.
    const car = await vehicleRow(vehicle.id);
    expect(car.availabilityStatus).toBe("needs_fixing");

    const again = await admin.post(`/api/reservations/${id}/complete-maintenance`).send({ completionDate: today });
    expect(again.status).toBe(200);
    expect((await blockRow(id)).maintenanceStatus).toBe("out");
    expect((await vehicleRow(vehicle.id)).availabilityStatus).toBe("available");
  });

  it("the edit dialog saves a reverted block (its body carries status 'in' + maintenance 'in')", async () => {
    const { id } = await finishedBlock();
    expect((await admin.patch(urlFor(id)).send({ status: "picked_up", maintenanceStatus: "in" })).status).toBe(200);
    const block = await blockRow(id);

    const save = await admin.patch(urlFor(id)).send({
      vehicleId: block.vehicleId, customerId: null, startDate: block.startDate, endDate: block.endDate,
      status: "in", type: "maintenance_block", notes: "FIXT na terugdraaien bewaard", totalPrice: 0,
      maintenanceDuration: block.maintenanceDuration, maintenanceStatus: "in",
    });

    expect(save.status).toBe(200);
    const saved = await blockRow(id);
    expect(saved.notes).toBe("FIXT na terugdraaien bewaard");
    expect(saved.status).toBe("picked_up");
    expect(saved.maintenanceStatus).toBe("in");
  });

  it("a block that is still finished (status completed, maintenance out) cannot go back to picked_up without 'Binnen'", async () => {
    const { id } = await finishedBlock();

    for (const body of [{ status: "picked_up" }, { status: "picked_up", maintenanceStatus: "scheduled" }]) {
      const res = await admin.patch(urlFor(id)).send(body);
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect(res.body.code, JSON.stringify(body)).toBe("INVALID_STATUS_TRANSITION");
    }
    const block = await blockRow(id);
    expect(block.status).toBe("completed");
    expect(block.maintenanceStatus).toBe("out");
  });
});

describe("a customer rental is never reopened by this exemption", () => {
  it("a completed rental stays completed whatever the edit routes are sent", async () => {
    const vehicle = await createFixtureVehicle();
    const customer = await createFixtureCustomer("D7revert");
    const rental = await createFixtureReservation({
      customerId: customer.id, vehicleId: vehicle.id, startDate: "2026-01-05", endDate: "2026-01-06", status: "completed",
    });
    for (const url of [`/api/reservations/${rental.id}`, `/api/reservations/${rental.id}/basic`]) {
      const res = await admin.patch(url).send({ status: "picked_up", maintenanceStatus: "in" });
      expect(res.status).toBe(400);
    }
    expect((await blockRow(rental.id)).status).toBe("completed");
  });
});
