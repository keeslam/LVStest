/**
 * FIX-W — transport record consistency.
 *
 * `applyTransportUpdate` spread `...changes` into the `vehicle_transports`
 * update and had a branch for almost nothing else: none for `scheduledDate`,
 * none for `vehicleId`, nothing that touched `spareReservationId` on
 * cancellation, and a same-vehicle check that compared the incoming replacement
 * against the *current* original.
 *
 *   BUG-114 — moving a transport leaves the spare booked on the old day.
 *   BUG-115 — cancelling a transport leaves the spare booked.
 *   BUG-116 — the original vehicle may be set equal to the replacement.
 *   BUG-135 — changing the original leaves the workshop flag and the spare's
 *             notes on the old car.
 *   BUG-136 — transport status is free text; `completedDate` stays empty.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "../db";
import { reservations, vehicles as vehiclesTable, vehicleTransports } from "../../shared/schema";
import { agentFor, cleanupFixtureUsers, type TestAgent } from "./helpers/app";
import { createFixtureVehicle, cleanupFixtures } from "./helpers/fixtures";

let admin: TestAgent;

beforeAll(async () => {
  admin = await agentFor("admin");
});

afterAll(async () => {
  const fixtureVehicles = await db.select({ id: vehiclesTable.id }).from(vehiclesTable)
    .where(sql`${vehiclesTable.licensePlate} LIKE 'FIXT%'`);
  for (const v of fixtureVehicles) {
    await db.delete(vehicleTransports).where(eq(vehicleTransports.vehicleId, v.id));
    await db.delete(vehicleTransports).where(eq(vehicleTransports.relatedVehicleId, v.id));
  }
  await cleanupFixtures();
  await cleanupFixtureUsers();
});

function day(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().split("T")[0];
}

async function makeTransport(body: Record<string, unknown>) {
  const res = await admin.post("/api/transports").send({
    transportType: "swap",
    status: "scheduled",
    ...body,
  });
  expect(res.status).toBeLessThan(400);
  return res.body;
}

async function spareOf(transportId: number) {
  const [t] = await db.select().from(vehicleTransports).where(eq(vehicleTransports.id, transportId));
  if (!t?.spareReservationId) return undefined;
  const [row] = await db.select().from(reservations).where(eq(reservations.id, t.spareReservationId));
  return row;
}

describe("FIX-W — the replacement follows the transport", () => {
  it("moving the date moves the spare booking (BUG-114)", async () => {
    const original = await createFixtureVehicle();
    const spare = await createFixtureVehicle();
    const transport = await makeTransport({
      vehicleId: original.id, relatedVehicleId: spare.id, spareRequired: true, scheduledDate: day(10),
    });

    expect((await spareOf(transport.id))!.startDate).toBe(day(10));

    const moved = await admin.patch(`/api/transports/${transport.id}`).send({ scheduledDate: day(12) });
    expect(moved.status).toBe(200);

    const after = (await spareOf(transport.id))!;
    expect(after.startDate).toBe(day(12));
    expect(after.endDate).toBe(day(12));

    // …and the same spare can no longer be claimed by another transport that day.
    const other = await createFixtureVehicle();
    const clash = await admin.post("/api/transports").send({
      transportType: "swap", status: "scheduled",
      vehicleId: other.id, relatedVehicleId: spare.id, spareRequired: true, scheduledDate: day(12),
    });
    expect(clash.status).toBe(409);
  });

  it("cancelling frees the spare and the spare vehicle (BUG-115)", async () => {
    const original = await createFixtureVehicle();
    const spare = await createFixtureVehicle();
    const transport = await makeTransport({
      vehicleId: original.id, relatedVehicleId: spare.id, spareRequired: true, scheduledDate: day(20),
    });
    const spareReservationId = (await spareOf(transport.id))!.id;

    expect((await admin.patch(`/api/transports/${transport.id}`).send({ status: "cancelled" })).status).toBe(200);

    const [row] = await db.select().from(reservations).where(eq(reservations.id, spareReservationId));
    expect(row.status).toBe("cancelled");

    const [spareVehicle] = await db.select().from(vehiclesTable).where(eq(vehiclesTable.id, spare.id));
    expect(spareVehicle.availabilityStatus).not.toBe("scheduled");

    // A different transport may now use that car on that day.
    const other = await createFixtureVehicle();
    const reuse = await admin.post("/api/transports").send({
      transportType: "swap", status: "scheduled",
      vehicleId: other.id, relatedVehicleId: spare.id, spareRequired: true, scheduledDate: day(20),
    });
    expect(reuse.status).toBeLessThan(400);
  });
});

describe("FIX-W — the two vehicles of a transport", () => {
  it("refuses making the original equal to the replacement (BUG-116)", async () => {
    const original = await createFixtureVehicle();
    const spare = await createFixtureVehicle();
    const transport = await makeTransport({
      vehicleId: original.id, relatedVehicleId: spare.id, spareRequired: true, scheduledDate: day(30),
    });

    const res = await admin.patch(`/api/transports/${transport.id}`).send({ vehicleId: spare.id });
    expect(res.status).toBe(400);

    const [row] = await db.select().from(vehicleTransports).where(eq(vehicleTransports.id, transport.id));
    expect(row.vehicleId).toBe(original.id);

    // …and a normal vehicle change still works afterwards.
    const third = await createFixtureVehicle();
    expect((await admin.patch(`/api/transports/${transport.id}`).send({ vehicleId: third.id })).status).toBe(200);
  });

  it("moves the workshop flag and the spare's notes to the new vehicle (BUG-135)", async () => {
    const original = await createFixtureVehicle();
    const replacement = await createFixtureVehicle();
    const newOriginal = await createFixtureVehicle();

    const transport = await makeTransport({
      vehicleId: original.id,
      relatedVehicleId: replacement.id,
      spareRequired: true,
      isBreakdownOrMaintenance: true,
      scheduledDate: day(40),
    });

    const [flagged] = await db.select().from(vehiclesTable).where(eq(vehiclesTable.id, original.id));
    expect(flagged.maintenanceStatus).toBe("needs_service");

    expect((await admin.patch(`/api/transports/${transport.id}`).send({ vehicleId: newOriginal.id })).status).toBe(200);

    const [oldOne] = await db.select().from(vehiclesTable).where(eq(vehiclesTable.id, original.id));
    const [newOne] = await db.select().from(vehiclesTable).where(eq(vehiclesTable.id, newOriginal.id));
    expect(oldOne.maintenanceStatus).toBe("ok");
    expect(newOne.maintenanceStatus).toBe("needs_service");

    const spare = (await spareOf(transport.id))!;
    expect(spare.notes).toContain(newOriginal.licensePlate);
    expect(spare.notes).not.toContain(original.licensePlate);
  });
});

describe("FIX-W — transport status (BUG-136)", () => {
  it("refuses a status outside the enum and a reopening", async () => {
    const vehicle = await createFixtureVehicle();
    const transport = await makeTransport({ vehicleId: vehicle.id, scheduledDate: day(50) });

    expect((await admin.patch(`/api/transports/${transport.id}`).send({ status: "garbage_status" })).status).toBe(400);

    expect((await admin.patch(`/api/transports/${transport.id}`).send({ status: "completed" })).status).toBe(200);
    expect((await admin.patch(`/api/transports/${transport.id}`).send({ status: "in_progress" })).status).toBe(400);

    const [row] = await db.select().from(vehicleTransports).where(eq(vehicleTransports.id, transport.id));
    expect(row.status).toBe("completed");
    // …and completing fills in the date even when the caller forgets it.
    expect(row.completedDate).toBeTruthy();
  });
});
