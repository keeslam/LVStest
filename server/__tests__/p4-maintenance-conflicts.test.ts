/**
 * Audit 2026-10-09, module 7, finding A-7-1 (package P4).
 *
 * Planning a maintenance block runs two overlap checks: the strict bookability
 * predicate and a "broad overlap" fallback that deliberately ignores the status
 * (so a rental whose status drifted still prompts for a spare). The fallback
 * also swept in cancelled, completed and returned rentals, so a cancelled
 * reservation produced the "assign spare vehicles" dialog (and, with nothing
 * real to assign, an empty shadow dialog). Closed rentals no longer hold the
 * vehicle; only open ones may ask for a spare.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { agentFor, cleanupFixtureUsers, type TestAgent } from "./helpers/app";
import {
  createFixtureCustomer, createFixtureVehicle, createFixtureReservation, cleanupFixtures,
} from "./helpers/fixtures";

let admin: TestAgent;
let customerId: number;

beforeAll(async () => {
  admin = await agentFor("admin");
  customerId = (await createFixtureCustomer("P4")).id;
});

afterAll(async () => {
  await cleanupFixtures();
  await cleanupFixtureUsers();
});

// Fixed far-future dates: nothing here may depend on today or the weekday.
const START = "2029-06-10";
const END = "2029-06-12";

/** The create payload of schedule-maintenance-dialog.tsx for a planned block. */
function blockPayload(vehicleId: number) {
  return {
    vehicleId, customerId: null, startDate: START, endDate: END,
    status: "scheduled", type: "maintenance_block", notes: "breakdown: FIXT p4",
    totalPrice: 0, maintenanceDuration: 3, maintenanceStatus: "scheduled",
  };
}

describe("A-7-1: a closed reservation is not a conflict when planning a block", () => {
  for (const status of ["cancelled", "completed", "returned"]) {
    it(`a ${status} rental in the period: plain 201, no spare prompt`, async () => {
      const vehicle = await createFixtureVehicle();
      await createFixtureReservation({ customerId, vehicleId: vehicle.id, startDate: START, endDate: END, status });

      const res = await admin.post("/api/reservations").send(blockPayload(vehicle.id));

      expect(res.status).toBe(201);
      expect(res.body.needsSpareVehicle).toBeUndefined();
      expect(res.body.type).toBe("maintenance_block");
    });
  }

  it("a booked rental in the period still asks for a spare vehicle", async () => {
    const vehicle = await createFixtureVehicle();
    const rental = await createFixtureReservation({ customerId, vehicleId: vehicle.id, startDate: START, endDate: END, status: "booked" });

    const res = await admin.post("/api/reservations").send(blockPayload(vehicle.id));

    expect(res.status).toBe(200);
    expect(res.body.needsSpareVehicle).toBe(true);
    expect(res.body.conflictingReservations.map((r: any) => r.id)).toEqual([rental.id]);
  });

  it("a cancelled and a booked rental together: only the booked one is offered", async () => {
    const vehicle = await createFixtureVehicle();
    await createFixtureReservation({ customerId, vehicleId: vehicle.id, startDate: START, endDate: END, status: "cancelled" });
    const rental = await createFixtureReservation({ customerId, vehicleId: vehicle.id, startDate: START, endDate: END, status: "booked" });

    const res = await admin.post("/api/reservations").send(blockPayload(vehicle.id));

    expect(res.status).toBe(200);
    expect(res.body.conflictingReservations.map((r: any) => r.id)).toEqual([rental.id]);
  });

  it("the edit route (PATCH /:id/basic) ignores a cancelled rental too", async () => {
    const vehicle = await createFixtureVehicle();
    await createFixtureReservation({ customerId, vehicleId: vehicle.id, startDate: START, endDate: END, status: "cancelled" });
    const created = await admin.post("/api/reservations").send({ ...blockPayload(vehicle.id), startDate: "2029-07-01", endDate: "2029-07-01", maintenanceDuration: 1 });
    expect(created.status).toBe(201);

    const res = await admin.patch(`/api/reservations/${created.body.id}/basic`).send(blockPayload(vehicle.id));

    expect(res.status).toBe(200);
    expect(res.body.needsSpareVehicle).toBeUndefined();
  });
});
