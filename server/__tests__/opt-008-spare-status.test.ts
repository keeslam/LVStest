/**
 * OPT-008 — "Vervanger krijgt de status die hij fysiek heeft".
 *
 * The spare-vehicle widget's buttons wrote only `spare_vehicle_status`. The
 * underlying replacement reservation stayed on `pending`, so the vehicle stayed
 * `available` while it was physically with the customer — a direct
 * double-booking path (phase 20, chain 3 step 5).
 *
 * The acceptance test from the plan: "a spare that is `picked_up` is not
 * offered as available for the same period".
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { reservations, type Vehicle } from "../../shared/schema";
import { storage } from "../storage";
import { normalizeReservationStatus } from "../services/lifecycle";
import { agentFor, cleanupFixtureUsers, type TestAgent } from "./helpers/app";
import {
  createFixtureCustomer, createFixtureVehicle, createFixtureReservation, cleanupFixtures,
} from "./helpers/fixtures";

let admin: TestAgent;
let customerId: number;

const PERIOD = { startDate: "2026-11-02", endDate: "2026-11-20" };

beforeAll(async () => {
  admin = await agentFor("admin");
  customerId = (await createFixtureCustomer("Opt008")).id;
});

afterAll(async () => {
  await cleanupFixtures();
  await cleanupFixtureUsers();
});

/** A replacement reservation on a spare vehicle, as the widget creates one. */
async function spareOn(vehicle: Vehicle) {
  return createFixtureReservation({
    customerId,
    vehicleId: vehicle.id,
    startDate: PERIOD.startDate,
    endDate: PERIOD.endDate,
    status: "booked",
    type: "replacement",
  });
}

async function statusOf(id: number) {
  const [row] = await db.select().from(reservations).where(eq(reservations.id, id));
  return row;
}

describe("OPT-008 — de vervanger krijgt de status die hij fysiek heeft", () => {
  it('"Markeer als opgehaald" puts the reservation on picked_up too', async () => {
    const vehicle = await createFixtureVehicle();
    const spare = await spareOn(vehicle);

    const ready = await admin.patch(`/api/reservations/${spare.id}/spare-status`)
      .send({ spareVehicleStatus: "ready" });
    expect(ready.status).toBe(200);
    // Prepared, but still on the yard.
    expect(normalizeReservationStatus((await statusOf(spare.id)).status)).toBe("booked");

    const out = await admin.patch(`/api/reservations/${spare.id}/spare-status`)
      .send({ spareVehicleStatus: "picked_up" });
    expect(out.status).toBe(200);

    const row = await statusOf(spare.id);
    expect(row.spareVehicleStatus).toBe("picked_up");
    expect(normalizeReservationStatus(row.status)).toBe("picked_up");
  });

  it("a spare that is out is no longer bookable for the same period", async () => {
    const vehicle = await createFixtureVehicle();
    const spare = await spareOn(vehicle);

    await admin.patch(`/api/reservations/${spare.id}/spare-status`).send({ spareVehicleStatus: "ready" });
    await admin.patch(`/api/reservations/${spare.id}/spare-status`).send({ spareVehicleStatus: "picked_up" });

    // The one bookability predicate (FIX-F) is what every writer delegates to.
    const verdict = await storage.isVehicleBookable({
      vehicleId: vehicle.id,
      startDate: PERIOD.startDate,
      endDate: PERIOD.endDate,
    } as any);
    expect(verdict.bookable).toBe(false);
    expect(verdict.reason).toBe("CONFLICT");
  });

  it("returning the spare closes the rental, so the car is free again", async () => {
    const vehicle = await createFixtureVehicle();
    const spare = await spareOn(vehicle);

    for (const spareVehicleStatus of ["ready", "picked_up", "returned"]) {
      const res = await admin.patch(`/api/reservations/${spare.id}/spare-status`).send({ spareVehicleStatus });
      expect(res.status).toBe(200);
    }

    const row = await statusOf(spare.id);
    expect(row.spareVehicleStatus).toBe("returned");
    // besluiten B-02: a return closes the rental, here as everywhere else.
    expect(normalizeReservationStatus(row.status)).toBe("completed");

    const verdict = await storage.isVehicleBookable({
      vehicleId: vehicle.id,
      startDate: PERIOD.startDate,
      endDate: PERIOD.endDate,
    } as any);
    expect(verdict.bookable).toBe(true);
  });

  it("still refuses the column on an ordinary rental (BUG-036 stays fixed)", async () => {
    const vehicle = await createFixtureVehicle();
    const rental = await createFixtureReservation({
      customerId, vehicleId: vehicle.id, startDate: PERIOD.startDate, endDate: PERIOD.endDate,
      status: "booked", type: "standard",
    });

    const res = await admin.patch(`/api/reservations/${rental.id}/spare-status`)
      .send({ spareVehicleStatus: "picked_up" });
    expect(res.status).toBe(400);
    expect(normalizeReservationStatus((await statusOf(rental.id)).status)).toBe("booked");
  });

  it("still refuses an illegal spare transition, and changes nothing", async () => {
    const vehicle = await createFixtureVehicle();
    const spare = await spareOn(vehicle);

    // assigned -> returned skips the handover.
    const res = await admin.patch(`/api/reservations/${spare.id}/spare-status`)
      .send({ spareVehicleStatus: "returned" });
    expect(res.status).toBe(400);
    expect(normalizeReservationStatus((await statusOf(spare.id)).status)).toBe("booked");
  });
});
