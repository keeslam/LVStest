/**
 * OPT-010 — the server half of the micro edits.
 *
 * The three dialogs deliberately have no endpoint of their own: each sends only
 * the fields it owns to `PATCH /api/reservations/:id`. The risk the report
 * names is "een zesde schrijfpad zonder controle", so what has to be true is
 * that a payload of exactly two dates, or exactly one customer id, or exactly
 * one vehicle id, still runs the whole shared handler — the conflict check
 * inside the write transaction (FIX-F), the blacklist check, and partial-update
 * semantics (FIX-D): the fields that were not sent are not rewritten.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { reservations, vehicleCustomerBlacklist } from "../../shared/schema";
import { agentFor, cleanupFixtureUsers, type TestAgent } from "./helpers/app";
import {
  createFixtureCustomer, createFixtureVehicle, createFixtureReservation, cleanupFixtures,
} from "./helpers/fixtures";

let admin: TestAgent;
let customerId: number;
let otherCustomerId: number;
const blacklistedCustomerIds: number[] = [];

beforeAll(async () => {
  admin = await agentFor("admin");
  customerId = (await createFixtureCustomer("Opt010")).id;
  otherCustomerId = (await createFixtureCustomer("Opt010B")).id;
});

afterAll(async () => {
  for (const id of blacklistedCustomerIds) {
    await db.delete(vehicleCustomerBlacklist).where(eq(vehicleCustomerBlacklist.customerId, id));
  }
  await cleanupFixtures();
  await cleanupFixtureUsers();
});

async function row(id: number) {
  const [found] = await db.select().from(reservations).where(eq(reservations.id, id));
  return found;
}

describe("OPT-010 — de microdialogen lopen door dezelfde handler", () => {
  it("a dates-only payload rewrites nothing it did not send", async () => {
    const vehicle = await createFixtureVehicle();
    const rental = await createFixtureReservation({
      customerId, vehicleId: vehicle.id, startDate: "2026-10-01", endDate: "2026-10-05",
    });
    await db.update(reservations)
      .set({ notes: "niet aanpassen", contractNumber: "860101" })
      .where(eq(reservations.id, rental.id));

    const res = await admin.patch(`/api/reservations/${rental.id}`)
      .send({ startDate: "2026-10-01", endDate: "2026-10-07" });

    expect(res.status).toBe(200);
    const after = await row(rental.id);
    expect(after.endDate).toBe("2026-10-07");
    // FIX-D: a PATCH holds only what it was given.
    expect(after.notes).toBe("niet aanpassen");
    expect(after.contractNumber).toBe("860101");
    expect(after.customerId).toBe(customerId);
    expect(after.vehicleId).toBe(vehicle.id);
  });

  it("a dates-only payload still runs the conflict check", async () => {
    const vehicle = await createFixtureVehicle();
    await createFixtureReservation({
      customerId, vehicleId: vehicle.id, startDate: "2026-10-20", endDate: "2026-10-25",
    });
    const movable = await createFixtureReservation({
      customerId, vehicleId: vehicle.id, startDate: "2026-10-01", endDate: "2026-10-05",
    });

    // Two dates and nothing else — the same payload the dialog sends.
    const res = await admin.patch(`/api/reservations/${movable.id}`)
      .send({ startDate: "2026-10-01", endDate: "2026-10-22" });

    expect(res.status).toBe(409);
    // Nothing moved.
    expect((await row(movable.id)).endDate).toBe("2026-10-05");
  });

  it("a vehicle-only payload runs the conflict check on the new vehicle", async () => {
    const busy = await createFixtureVehicle();
    const free = await createFixtureVehicle();
    await createFixtureReservation({
      customerId, vehicleId: busy.id, startDate: "2026-09-01", endDate: "2026-09-30",
    });
    const moving = await createFixtureReservation({
      customerId, vehicleId: free.id, startDate: "2026-09-10", endDate: "2026-09-12",
    });

    const conflicting = await admin.patch(`/api/reservations/${moving.id}`).send({ vehicleId: busy.id });
    expect(conflicting.status).toBe(409);
    expect((await row(moving.id)).vehicleId).toBe(free.id);

    // ...and a free one is simply accepted.
    const another = await createFixtureVehicle();
    const ok = await admin.patch(`/api/reservations/${moving.id}`).send({ vehicleId: another.id });
    expect(ok.status).toBe(200);
    expect((await row(moving.id)).vehicleId).toBe(another.id);
  });

  it("a customer-only payload changes the customer and nothing else", async () => {
    const vehicle = await createFixtureVehicle();
    const rental = await createFixtureReservation({
      customerId, vehicleId: vehicle.id, startDate: "2026-08-01", endDate: "2026-08-05",
    });

    const res = await admin.patch(`/api/reservations/${rental.id}`).send({ customerId: otherCustomerId });
    expect(res.status).toBe(200);

    const after = await row(rental.id);
    expect(after.customerId).toBe(otherCustomerId);
    expect(after.startDate).toBe("2026-08-01");
    expect(after.endDate).toBe("2026-08-05");
    expect(after.vehicleId).toBe(vehicle.id);
  });

  it("a customer-only payload still runs the blacklist check (BUG-017)", async () => {
    const vehicle = await createFixtureVehicle();
    const blockedCustomer = await createFixtureCustomer("Opt010Blocked");
    blacklistedCustomerIds.push(blockedCustomer.id);
    await db.insert(vehicleCustomerBlacklist)
      .values({ vehicleId: vehicle.id, customerId: blockedCustomer.id });

    const rental = await createFixtureReservation({
      customerId, vehicleId: vehicle.id, startDate: "2026-07-01", endDate: "2026-07-05",
    });

    // One field, and the guard the full form runs still fires.
    const res = await admin.patch(`/api/reservations/${rental.id}`).send({ customerId: blockedCustomer.id });
    expect(res.status).toBe(409);
    expect((await row(rental.id)).customerId).toBe(customerId);
  });
});
