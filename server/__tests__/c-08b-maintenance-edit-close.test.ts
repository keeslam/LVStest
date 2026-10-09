/**
 * Sub-project C, Task 8 (controller's ruling) - the maintenance edit dialog's
 * "Uit" has to free the car (audit module 7, finding 3).
 *
 * `PATCH /api/reservations/:id` and `PATCH /:id/basic` close a block when the
 * edit dialogs save `maintenanceStatus: 'out'`, but they never cleared the
 * workshop flag: the closing sweep cannot pass `clearWorkshopFlag`, so the
 * `needs_fixing` an earlier sweep derived from the then-open block was kept as
 * a "sticky manual flag" and the car stayed unavailable until somebody edited
 * the vehicle by hand. `completeMaintenance`, `returnVehicleFromService` and
 * the scan route all end in `markVehicleForService(id, 'ok')`; these two
 * PATCH routes were the only block-closing writers that did not.
 *
 * Also asserted here, because without them "Uit" is not reachable in one save:
 *   - a still planned block (`booked`) may go straight to `completed`
 *     (`booked -> completed` is not a rental transition, but a block is not a
 *     rental), and a block arriving early is not asked B-16's pickup question;
 *   - deleting or cancelling a block does NOT clear the flag (owner question
 *     still open; asserted so nobody "fixes" it here by accident).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { reservations, vehicles } from "../../shared/schema";
import { isoToday } from "../services/lifecycle";
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

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

async function blockRow(id: number) {
  const [row] = await db.select().from(reservations).where(eq(reservations.id, id));
  return row;
}
async function vehicleRow(id: number) {
  const [row] = await db.select().from(vehicles).where(eq(vehicles.id, id));
  return row;
}

/** The create payload of schedule-maintenance-dialog.tsx for a planned block. */
async function planBlock(vehicleId: number, startDate: string, days = 1): Promise<number> {
  const res = await admin.post("/api/reservations").send({
    vehicleId, customerId: null, startDate, endDate: addDays(startDate, days - 1),
    status: "scheduled", type: "maintenance_block", notes: "breakdown: FIXT onderhoud test",
    totalPrice: 0, maintenanceDuration: days, maintenanceStatus: "scheduled",
  });
  expect([200, 201]).toContain(res.status);
  return res.body.id as number;
}

/** The PATCH body of maintenance-edit-dialog.tsx: `status` AND `maintenanceStatus` carry the choice. */
function editBody(block: any, maintenanceStatus: "scheduled" | "in" | "out") {
  return {
    vehicleId: block.vehicleId, customerId: null, startDate: block.startDate, endDate: block.endDate,
    status: maintenanceStatus, type: "maintenance_block", notes: block.notes, totalPrice: 0,
    maintenanceDuration: block.maintenanceDuration, maintenanceStatus,
  };
}

async function patchEdit(route: "full" | "basic", id: number, to: "scheduled" | "in" | "out") {
  const block = await blockRow(id);
  const url = route === "full" ? `/api/reservations/${id}` : `/api/reservations/${id}/basic`;
  return admin.patch(url).send(editBody(block, to));
}

describe.each([
  ["PATCH /api/reservations/:id", "full"],
  ["PATCH /api/reservations/:id/basic", "basic"],
] as const)("%s - closing a block frees the car", (_label, route) => {
  it("Binnen then Uit (the audit sequence): block closed AND the car available again", async () => {
    const vehicle = await createFixtureVehicle();
    const id = await planBlock(vehicle.id, today);

    expect((await patchEdit(route, id, "in")).status).toBe(200);
    // The sweep after the first save derives needs_fixing from the open block covering today.
    expect((await vehicleRow(vehicle.id)).availabilityStatus).toBe("needs_fixing");

    const out = await patchEdit(route, id, "out");
    expect(out.status).toBe(200);

    const closed = await blockRow(id);
    expect(closed.maintenanceStatus).toBe("out");
    expect(closed.status).toBe("completed");
    const car = await vehicleRow(vehicle.id);
    expect(car.availabilityStatus).toBe("available");
    expect(car.maintenanceStatus).toBe("ok");
  });

  it("a car that the scan screen put in the workshop (in_service) ends ok and available", async () => {
    const vehicle = await createFixtureVehicle();
    const id = await planBlock(vehicle.id, today);
    expect((await patchEdit(route, id, "in")).status).toBe(200);
    await db.update(vehicles).set({ maintenanceStatus: "in_service" }).where(eq(vehicles.id, vehicle.id));

    expect((await patchEdit(route, id, "out")).status).toBe(200);

    const car = await vehicleRow(vehicle.id);
    expect(car.maintenanceStatus).toBe("ok");
    expect(car.availabilityStatus).toBe("available");
  });

  it("closing one of two open blocks covering today leaves the car in the workshop", async () => {
    const vehicle = await createFixtureVehicle();
    const first = await planBlock(vehicle.id, today);
    const second = await planBlock(vehicle.id, today);
    expect((await patchEdit(route, first, "in")).status).toBe(200);

    expect((await patchEdit(route, first, "out")).status).toBe(200);

    expect((await blockRow(first)).maintenanceStatus).toBe("out");
    expect((await blockRow(second)).maintenanceStatus).toBe("scheduled");
    expect((await vehicleRow(vehicle.id)).availabilityStatus).toBe("needs_fixing");
  });

  it("Uit straight from Gepland is accepted (booked -> completed for a block)", async () => {
    const vehicle = await createFixtureVehicle();
    const id = await planBlock(vehicle.id, today);

    const res = await patchEdit(route, id, "out");

    expect(res.status).toBe(200);
    const closed = await blockRow(id);
    expect(closed.status).toBe("completed");
    expect(closed.maintenanceStatus).toBe("out");
    expect((await vehicleRow(vehicle.id)).availabilityStatus).toBe("available");
  });

  it("saving a still planned future block unchanged keeps it booked/scheduled and the car available", async () => {
    const vehicle = await createFixtureVehicle();
    const start = addDays(today, 10);
    const id = await planBlock(vehicle.id, start);

    const res = await patchEdit(route, id, "scheduled");

    expect(res.status).toBe(200);
    const block = await blockRow(id);
    expect(block.status).toBe("booked");
    expect(block.maintenanceStatus).toBe("scheduled");
    expect(block.startDate).toBe(start);
    expect((await vehicleRow(vehicle.id)).availabilityStatus).toBe("available");
  });

  it("a block that arrives early (Binnen on a future block) is not asked the rental pickup question", async () => {
    const vehicle = await createFixtureVehicle();
    const start = addDays(today, 10);
    const id = await planBlock(vehicle.id, start);

    const res = await patchEdit(route, id, "in");

    // B-16's 409 PICKUP_BEFORE_START_DATE is for rentals; a block's period is not shifted.
    expect(res.status).toBe(200);
    const block = await blockRow(id);
    expect(block.maintenanceStatus).toBe("in");
    expect(block.startDate).toBe(start);
  });
});

describe("rules that must stay as they are", () => {
  it("a rental still cannot jump from booked to completed through PATCH /:id or /basic", async () => {
    const vehicle = await createFixtureVehicle();
    const customer = await createFixtureCustomer("C08b");
    const rental = await createFixtureReservation({
      customerId: customer.id, vehicleId: vehicle.id, startDate: addDays(today, 30), endDate: addDays(today, 31), status: "booked",
    });
    for (const url of [`/api/reservations/${rental.id}`, `/api/reservations/${rental.id}/basic`]) {
      const jump = await admin.patch(url).send({ status: "completed" });
      expect(jump.status).toBe(400);
      expect(jump.body.code).toBe("INVALID_STATUS_TRANSITION");
    }
    expect((await blockRow(rental.id)).status).toBe("booked");
  });

  it("deleting a block does not clear the car's flag (owner question still open)", async () => {
    const vehicle = await createFixtureVehicle();
    const id = await planBlock(vehicle.id, today);
    // A sweep turns the open block into needs_fixing.
    expect((await patchEdit("full", id, "scheduled")).status).toBe(200);
    expect((await vehicleRow(vehicle.id)).availabilityStatus).toBe("needs_fixing");

    const res = await admin.delete(`/api/reservations/${id}`);
    expect([200, 204]).toContain(res.status);

    expect((await vehicleRow(vehicle.id)).availabilityStatus).toBe("needs_fixing");
  });
});
