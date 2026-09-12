/**
 * OPT-006 — "`availability_status`: één eigenaar, geen bijwerkingen".
 *
 * Unblocked by besluiten **B-01**: "vrij in de gevraagde periode én status ok",
 * one definition for the dashboard, the booking form and the availability
 * screen.
 *
 * FIX-H already gave the column a single owner — `deriveVehicleAvailability()`,
 * written only through `recomputeVehicleAvailability()` — and removed the three
 * competing writers (the maintenance-status route, the return route's
 * unconditional `availabilityStatus: 'available'`, and the read-path sync).
 * What was not pinned anywhere is the proposal's own acceptance test:
 *
 *   "a `not_for_rental` vehicle that goes through a full maintenance cycle is
 *    still `not_for_rental` at the end"
 *
 * That is what this file asserts, end to end through the routes — and it now
 * also covers the path OPT-015 added, which closes a job in one transaction.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { vehicles } from "../../shared/schema";
import { agentFor, cleanupFixtureUsers, type TestAgent } from "./helpers/app";
import {
  createFixtureCustomer, createFixtureVehicle, createFixtureReservation, cleanupFixtures,
} from "./helpers/fixtures";

let admin: TestAgent;
let customerId: number;

const BLOCK_START = "2026-11-02";
const COMPLETION = "2026-11-09";

beforeAll(async () => {
  admin = await agentFor("admin");
  customerId = (await createFixtureCustomer("Opt006")).id;
});

afterAll(async () => {
  await cleanupFixtures();
  await cleanupFixtureUsers();
});

async function vehicleRow(id: number) {
  const [row] = await db.select().from(vehicles).where(eq(vehicles.id, id));
  return row;
}

describe("OPT-006 — één eigenaar van availability_status", () => {
  it("a not_for_rental vehicle survives a full maintenance cycle", async () => {
    const vehicle = await createFixtureVehicle({ availabilityStatus: "not_for_rental" });

    // Into the workshop...
    const intoService = await admin.patch(`/api/vehicles/${vehicle.id}/maintenance-status`)
      .send({ status: "in_service" });
    expect(intoService.status).toBe(200);

    const block = await createFixtureReservation({
      customerId: null, vehicleId: vehicle.id, startDate: BLOCK_START, endDate: null,
      status: "booked", type: "maintenance_block",
    });

    // ...and out again, through the one action OPT-015 added.
    const done = await admin.post(`/api/reservations/${block.id}/complete-maintenance`)
      .send({ completionDate: COMPLETION });
    expect(done.status).toBe(200);

    const after = await vehicleRow(vehicle.id);
    // The workshop flag is cleared — that is what finishing a repair means...
    expect(after.maintenanceStatus).toBe("ok");
    // ...and the deliberate decision "this car is not for rental" is still
    // there. It used to be washed away by whichever writer ran last (BUG-109).
    expect(after.availabilityStatus).toBe("not_for_rental");
  });

  it("an ordinary vehicle does come back to available after the same cycle", async () => {
    const vehicle = await createFixtureVehicle({ availabilityStatus: "available" });
    await admin.patch(`/api/vehicles/${vehicle.id}/maintenance-status`).send({ status: "in_service" });
    const block = await createFixtureReservation({
      customerId: null, vehicleId: vehicle.id, startDate: BLOCK_START, endDate: null,
      status: "booked", type: "maintenance_block",
    });
    await admin.post(`/api/reservations/${block.id}/complete-maintenance`).send({ completionDate: COMPLETION });

    const after = await vehicleRow(vehicle.id);
    expect(after.maintenanceStatus).toBe("ok");
    expect(after.availabilityStatus).toBe("available");
  });

  it("a return does not wash away a deliberate not_for_rental either", async () => {
    const vehicle = await createFixtureVehicle({ availabilityStatus: "available" });
    const rental = await createFixtureReservation({
      customerId, vehicleId: vehicle.id, startDate: "2026-06-01", endDate: "2026-06-30", status: "booked",
    });

    const pickup = await admin.post(`/api/reservations/${rental.id}/pickup`).send({
      contractNumber: String(895000 + (rental.id % 1000)),
      pickupMileage: 1000,
      fuelLevelPickup: "full",
      pickupDate: "2026-06-02",
    });
    expect(pickup.status).toBe(200);

    // The counter marks the car as not for rental while it is out.
    await db.update(vehicles).set({ availabilityStatus: "not_for_rental" }).where(eq(vehicles.id, vehicle.id));

    const ret = await admin.post(`/api/reservations/${rental.id}/return`).send({
      returnMileage: 1500,
      fuelLevelReturn: "full",
      returnDate: "2026-06-20",
    });
    expect(ret.status).toBe(200);

    // The unconditional `availabilityStatus: 'available'` on the return path is
    // gone; the decision stands.
    expect((await vehicleRow(vehicle.id)).availabilityStatus).toBe("not_for_rental");
  });
});
