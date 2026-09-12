/**
 * OPT-011 — "Opmerkingenbevestiging per opmerking in plaats van per ophaling".
 *
 * The report: the confirmation dialog fires on every pickup of every vehicle
 * that has any text in `remarks`, which is ~50 clicks a day for notes that have
 * been there for months — confirmation fatigue, and therefore missed real
 * warnings. The rule is: ask again only when the text changed since the last
 * confirmed pickup of that vehicle.
 *
 * The server half is the record of *what* was confirmed. It is written by the
 * pickup route and by nothing else, so a PATCH cannot silence a warning for a
 * remark nobody has read.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { useTempUploadsDir, removeTempUploadsDir } from "./helpers/uploads";

const uploadsDir = useTempUploadsDir("lvs-opt-011-");

import { db } from "../db";
import { vehicles, documents } from "../../shared/schema";
import { needsRemarkConfirmation } from "../../shared/remark-confirmation";
import { agentFor, cleanupFixtureUsers, type TestAgent } from "./helpers/app";
import {
  createFixtureCustomer, createFixtureVehicle, createFixtureReservation, cleanupFixtures,
} from "./helpers/fixtures";

let admin: TestAgent;
let customerId: number;
let contractCounter = 0;

function nextContract(): string {
  contractCounter += 1;
  return String(890000 + contractCounter);
}

beforeAll(async () => {
  admin = await agentFor("admin");
  customerId = (await createFixtureCustomer("Opt011")).id;
});

afterAll(async () => {
  await cleanupFixtures();
  await cleanupFixtureUsers();
  removeTempUploadsDir(uploadsDir);
});

async function vehicleRow(id: number) {
  const [row] = await db.select().from(vehicles).where(eq(vehicles.id, id));
  return row;
}

async function pickUp(vehicleId: number) {
  const rental = await createFixtureReservation({
    customerId,
    vehicleId,
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    status: "booked",
  });
  const res = await admin.post(`/api/reservations/${rental.id}/pickup`).send({
    contractNumber: nextContract(),
    pickupMileage: 1000 + contractCounter,
    fuelLevelPickup: "full",
    pickupDate: "2026-01-02",
  });
  expect(res.status).toBe(200);
  return rental;
}

describe("OPT-011 — bevestigen per opmerking", () => {
  it("records the remark that was in force when the vehicle left", async () => {
    const vehicle = await createFixtureVehicle({ remarks: "Deuk linksachter" });
    expect(needsRemarkConfirmation(await vehicleRow(vehicle.id))).toBe(true);

    await pickUp(vehicle.id);

    const after = await vehicleRow(vehicle.id);
    expect(after.remarksConfirmedText).toBe("Deuk linksachter");
    expect(after.remarksConfirmedAt).toBeInstanceOf(Date);
    expect(after.remarksConfirmedBy).toBe(admin.username);
    // The next pickup of the same car with the same note asks nothing.
    expect(needsRemarkConfirmation(after)).toBe(false);
  });

  it("asks again once the remark is edited", async () => {
    const vehicle = await createFixtureVehicle({ remarks: "Deuk linksachter" });
    await pickUp(vehicle.id);
    expect(needsRemarkConfirmation(await vehicleRow(vehicle.id))).toBe(false);

    await admin.patch(`/api/vehicles/${vehicle.id}`).send({ remarks: "Deuk linksachter EN ruit gebarsten" });

    const edited = await vehicleRow(vehicle.id);
    expect(edited.remarks).toBe("Deuk linksachter EN ruit gebarsten");
    // The confirmation is stale now, so the warning comes back.
    expect(needsRemarkConfirmation(edited)).toBe(true);
  });

  it("a vehicle without a remark is never asked and records nothing", async () => {
    const vehicle = await createFixtureVehicle({ remarks: null });
    await pickUp(vehicle.id);
    const after = await vehicleRow(vehicle.id);
    expect(after.remarksConfirmedText).toBeNull();
    expect(needsRemarkConfirmation(after)).toBe(false);
  });

  it("the confirmation cannot be set from a request body", async () => {
    const vehicle = await createFixtureVehicle({ remarks: "Sleutel bij balie" });

    const res = await admin.patch(`/api/vehicles/${vehicle.id}`).send({
      remarksConfirmedText: "Sleutel bij balie",
      remarksConfirmedBy: "iemand",
    });
    expect([200, 400]).toContain(res.status);

    const after = await vehicleRow(vehicle.id);
    // Whatever the route answered, the bookkeeping column is untouched, so the
    // warning still fires for a remark nobody has read.
    expect(after.remarksConfirmedText).toBeNull();
    expect(needsRemarkConfirmation(after)).toBe(true);
  });
});
