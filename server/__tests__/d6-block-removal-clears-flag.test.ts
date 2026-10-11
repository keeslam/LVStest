/**
 * Sub-project D, D6 (besluiten B-41/B-42) - deleting or cancelling a maintenance
 * block clears "Reparatie nodig" when that state came only from that block.
 *
 * `vehicles.maintenance_status_block_id` names the block that put the car in the
 * workshop. On DELETE of a block, `PATCH .../status {cancelled}`, `PATCH /:id`
 * and `/basic` with `cancelled`, and `/abort-planning`: when the column equals
 * the block id and no other block the car is "Binnen" for covers today, the
 * workshop job is closed (`markVehicleForService('ok')` + recompute with
 * `clearWorkshopFlag`). A flag set by hand (column null) is never touched.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { reservations, vehicles } from "../../shared/schema";
import { isoToday } from "../services/lifecycle";
import { storage } from "../storage";
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
async function vehicleRow(id: number) {
  const [row] = await db.select().from(vehicles).where(eq(vehicles.id, id));
  return row;
}
async function blockRow(id: number) {
  const [row] = await db.select().from(reservations).where(eq(reservations.id, id));
  return row;
}

async function planBlock(vehicleId: number, startDate = today, days = 1): Promise<number> {
  const res = await admin.post("/api/reservations").send({
    vehicleId, customerId: null, startDate, endDate: addDays(startDate, days - 1),
    status: "scheduled", type: "maintenance_block", notes: "breakdown: FIXT D6", totalPrice: 0,
    maintenanceDuration: days, maintenanceStatus: "scheduled",
  });
  expect([200, 201]).toContain(res.status);
  return (res.body.id ?? res.body.maintenanceReservationId) as number;
}

/** "Binnen melden" as the maintenance list does it: names the block. */
async function checkIn(vehicleId: number, blockId: number) {
  const res = await admin.patch(`/api/vehicles/${vehicleId}/maintenance-status`).send({ status: "in_service", blockId });
  expect(res.status).toBe(200);
}

describe("the column names the block that checked the car in", () => {
  it("check-in with a blockId stores that block; a second status write without a block clears it", async () => {
    const vehicle = await createFixtureVehicle();
    const id = await planBlock(vehicle.id);

    await checkIn(vehicle.id, id);

    const car = await vehicleRow(vehicle.id);
    expect(car.maintenanceStatus).toBe("in_service");
    expect(car.maintenanceStatusBlockId).toBe(id);
    expect(car.availabilityStatus).toBe("needs_fixing");

    // Any other writer of the workshop flag (a transport, a manual flag...) takes the car over.
    await storage.markVehicleForService(vehicle.id, "needs_service", "by hand");
    expect((await vehicleRow(vehicle.id)).maintenanceStatusBlockId).toBeNull();
  });

  it("check-in without a blockId (the scan route) leaves the column empty", async () => {
    const vehicle = await createFixtureVehicle();
    await planBlock(vehicle.id);
    const res = await admin.patch(`/api/vehicles/${vehicle.id}/maintenance-status`).send({ status: "in_service" });
    expect(res.status).toBe(200);
    expect((await vehicleRow(vehicle.id)).maintenanceStatusBlockId).toBeNull();
  });

  it("a manual needs_fixing takes ownership: the column is emptied", async () => {
    const vehicle = await createFixtureVehicle();
    const id = await planBlock(vehicle.id);
    // A stale pointer from an earlier check-in.
    await db.update(vehicles).set({ maintenanceStatusBlockId: id }).where(eq(vehicles.id, vehicle.id));

    const res = await admin.patch(`/api/vehicles/${vehicle.id}`).send({ availabilityStatus: "needs_fixing" });
    expect(res.status).toBe(200);

    const car = await vehicleRow(vehicle.id);
    expect(car.availabilityStatus).toBe("needs_fixing");
    expect(car.maintenanceStatusBlockId).toBeNull();
  });

  it("an explicit maintenanceStatus in a vehicle PATCH body is a hand write: the column is emptied", async () => {
    const vehicle = await createFixtureVehicle();
    const id = await planBlock(vehicle.id);
    await checkIn(vehicle.id, id);
    expect((await vehicleRow(vehicle.id)).maintenanceStatusBlockId).toBe(id);

    const res = await admin.patch(`/api/vehicles/${vehicle.id}`).send({ maintenanceStatus: "needs_service" });
    expect(res.status).toBe(200);
    expect((await vehicleRow(vehicle.id)).maintenanceStatusBlockId).toBeNull();
  });

  it("the column is server-owned: a vehicle PATCH body cannot set it", async () => {
    const vehicle = await createFixtureVehicle();
    const id = await planBlock(vehicle.id);
    const res = await admin.patch(`/api/vehicles/${vehicle.id}`).send({ maintenanceStatusBlockId: id, remarks: "x" });
    expect(res.status).toBe(200);
    expect((await vehicleRow(vehicle.id)).maintenanceStatusBlockId).toBeNull();
  });

  it("the edit dialog's Binnen (PATCH /:id and /basic) records the block when the car carried no flag", async () => {
    for (const suffix of ["", "/basic"]) {
      const vehicle = await createFixtureVehicle();
      const id = await planBlock(vehicle.id);
      const block = await blockRow(id);
      const res = await admin.patch(`/api/reservations/${id}${suffix}`).send({
        vehicleId: vehicle.id, customerId: null, startDate: block.startDate, endDate: block.endDate,
        status: "in", type: "maintenance_block", notes: block.notes, totalPrice: 0,
        maintenanceDuration: block.maintenanceDuration, maintenanceStatus: "in",
      });
      expect(res.status, suffix).toBe(200);
      expect((await vehicleRow(vehicle.id)).maintenanceStatusBlockId, suffix).toBe(id);
      expect((await vehicleRow(vehicle.id)).availabilityStatus, suffix).toBe("needs_fixing");
    }
  });

  it("the edit dialog's Binnen does not take over a flag somebody set by hand", async () => {
    const vehicle = await createFixtureVehicle();
    await admin.patch(`/api/vehicles/${vehicle.id}`).send({ availabilityStatus: "needs_fixing" });
    const id = await planBlock(vehicle.id);
    const block = await blockRow(id);
    const res = await admin.patch(`/api/reservations/${id}`).send({
      vehicleId: vehicle.id, customerId: null, startDate: block.startDate, endDate: block.endDate,
      status: "in", type: "maintenance_block", notes: block.notes, totalPrice: 0,
      maintenanceDuration: block.maintenanceDuration, maintenanceStatus: "in",
    });
    expect(res.status).toBe(200);
    expect((await vehicleRow(vehicle.id)).maintenanceStatusBlockId).toBeNull();
  });

  it("mark-needs-service with service dates stores the block it creates; without dates, no block", async () => {
    const customer = await createFixtureCustomer("D6");
    const vehicle = await createFixtureVehicle();
    const rental = await createFixtureReservation({ customerId: customer.id, vehicleId: vehicle.id, startDate: addDays(today, -1), endDate: addDays(today, 3) });

    const without = await admin.post(`/api/reservations/${rental.id}/mark-needs-service`).send({ maintenanceStatus: "needs_service", maintenanceNote: "FIXT" });
    expect(without.status).toBe(200);
    expect((await vehicleRow(vehicle.id)).maintenanceStatusBlockId).toBeNull();

    const withBlock = await admin.post(`/api/reservations/${rental.id}/mark-needs-service`).send({
      maintenanceStatus: "in_service", maintenanceNote: "FIXT", serviceStartDate: today, serviceEndDate: addDays(today, 1),
    });
    expect(withBlock.status).toBe(200);
    const blocks = (await db.select().from(reservations).where(eq(reservations.vehicleId, vehicle.id))).filter((r) => r.type === "maintenance_block");
    expect(blocks).toHaveLength(1);
    expect((await vehicleRow(vehicle.id)).maintenanceStatusBlockId).toBe(blocks[0].id);
  });
});

describe("removing the block that checked the car in", () => {
  it("DELETE of the block: the car is ok and available again, the column empty", async () => {
    const vehicle = await createFixtureVehicle();
    const id = await planBlock(vehicle.id);
    await checkIn(vehicle.id, id);
    expect((await vehicleRow(vehicle.id)).availabilityStatus).toBe("needs_fixing");

    const res = await admin.delete(`/api/reservations/${id}`);
    expect([200, 204]).toContain(res.status);

    const car = await vehicleRow(vehicle.id);
    expect(car.maintenanceStatus).toBe("ok");
    expect(car.availabilityStatus).toBe("available");
    expect(car.maintenanceStatusBlockId).toBeNull();
  });

  it("cancelling the block (PATCH /:id/status, /:id and /basic) does the same", async () => {
    for (const via of ["status", "full", "basic"] as const) {
      const vehicle = await createFixtureVehicle();
      const id = await planBlock(vehicle.id);
      await checkIn(vehicle.id, id);
      expect((await vehicleRow(vehicle.id)).availabilityStatus, via).toBe("needs_fixing");

      const res = via === "status"
        ? await admin.patch(`/api/reservations/${id}/status`).send({ status: "cancelled" })
        : await admin.patch(via === "full" ? `/api/reservations/${id}` : `/api/reservations/${id}/basic`).send({ status: "cancelled" });
      expect(res.status, `${via} -> ${JSON.stringify(res.body).slice(0, 200)}`).toBe(200);

      const car = await vehicleRow(vehicle.id);
      expect(car.maintenanceStatus, via).toBe("ok");
      expect(car.availabilityStatus, via).toBe("available");
      expect(car.maintenanceStatusBlockId, via).toBeNull();
    }
  });

  it("a block checked in through the edit dialog is released on DELETE too", async () => {
    const vehicle = await createFixtureVehicle();
    const id = await planBlock(vehicle.id);
    const block = await blockRow(id);
    const edit = await admin.patch(`/api/reservations/${id}`).send({
      vehicleId: vehicle.id, customerId: null, startDate: block.startDate, endDate: block.endDate,
      status: "in", type: "maintenance_block", notes: block.notes, totalPrice: 0,
      maintenanceDuration: block.maintenanceDuration, maintenanceStatus: "in",
    });
    expect(edit.status).toBe(200);
    expect((await vehicleRow(vehicle.id)).availabilityStatus).toBe("needs_fixing");

    expect([200, 204]).toContain((await admin.delete(`/api/reservations/${id}`)).status);

    expect((await vehicleRow(vehicle.id)).availabilityStatus).toBe("available");
  });

  it("another block the car is 'Binnen' for today: the car stays needs_fixing", async () => {
    const vehicle = await createFixtureVehicle();
    const first = await planBlock(vehicle.id);
    const second = await planBlock(vehicle.id);
    await checkIn(vehicle.id, first);
    await db.update(reservations).set({ maintenanceStatus: "in" }).where(eq(reservations.id, second));

    expect([200, 204]).toContain((await admin.delete(`/api/reservations/${first}`)).status);

    const car = await vehicleRow(vehicle.id);
    expect(car.availabilityStatus).toBe("needs_fixing");
    expect(car.maintenanceStatus).toBe("in_service");
  });

  it("another block that is only planned does not keep the car in the workshop", async () => {
    const vehicle = await createFixtureVehicle();
    const first = await planBlock(vehicle.id);
    await planBlock(vehicle.id);
    await checkIn(vehicle.id, first);

    expect([200, 204]).toContain((await admin.delete(`/api/reservations/${first}`)).status);

    const car = await vehicleRow(vehicle.id);
    expect(car.maintenanceStatus).toBe("ok");
    // The second block is still planned today: not available (B-01), not Reparatie nodig (D5).
    expect(car.availabilityStatus).toBe("scheduled");
  });

  it("a flag set by hand stays: deleting a block never clears it", async () => {
    const vehicle = await createFixtureVehicle();
    const id = await planBlock(vehicle.id);
    await admin.patch(`/api/vehicles/${vehicle.id}`).send({ availabilityStatus: "needs_fixing" });
    expect((await vehicleRow(vehicle.id)).maintenanceStatusBlockId).toBeNull();

    expect([200, 204]).toContain((await admin.delete(`/api/reservations/${id}`)).status);

    expect((await vehicleRow(vehicle.id)).availabilityStatus).toBe("needs_fixing");
  });

  it("a flag from a different block stays: removing an unrelated block never clears it", async () => {
    const vehicle = await createFixtureVehicle();
    const checkedIn = await planBlock(vehicle.id);
    const other = await planBlock(vehicle.id, addDays(today, 20));
    await checkIn(vehicle.id, checkedIn);

    expect([200, 204]).toContain((await admin.delete(`/api/reservations/${other}`)).status);

    const car = await vehicleRow(vehicle.id);
    expect(car.availabilityStatus).toBe("needs_fixing");
    expect(car.maintenanceStatusBlockId).toBe(checkedIn);
  });

  it("completing the block (Afronden) empties the column", async () => {
    const vehicle = await createFixtureVehicle();
    const id = await planBlock(vehicle.id);
    await checkIn(vehicle.id, id);

    const res = await admin.post(`/api/reservations/${id}/complete-maintenance`).send({ completionDate: today });
    expect(res.status).toBe(200);

    const car = await vehicleRow(vehicle.id);
    expect(car.maintenanceStatus).toBe("ok");
    expect(car.maintenanceStatusBlockId).toBeNull();
  });
});
