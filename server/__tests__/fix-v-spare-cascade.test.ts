/**
 * FIX-V — maintenance and spare-vehicle cascades.
 *
 * Replacement reservations were attached to their parent *rental* only, with no
 * link to the block that caused them, so every cascade had to guess by date
 * overlap. This is the densest tangle in the codebase and the one behind the
 * 2026-08-25 incident where a vehicle and its reservation vanished.
 *
 *   BUG-004 (CRITICAL) — resubmitting `maintenance-with-spare` hard-deletes a
 *                        spare that has already been picked up.
 *   BUG-014 — deleting a block leaves its spare, and the spare vehicle, stuck.
 *   BUG-032 — `assign-spare` twice gives two live replacements at once.
 *   BUG-033 — `maintenance-with-spare` creates a block without a vehicle.
 *   BUG-035 — a placeholder accepts a customer that is not the renter.
 *   BUG-117 — approving a portal maintenance change leaves the assigned spare
 *             on the old days and creates a second placeholder.
 *   BUG-118 — deleting block A wipes block B's spares.
 *   BUG-137 — placeholders of closed transports stay assignable.
 *   BUG-138 — portal maintenance can be approved into the past, or onto a
 *             cancelled rental.
 *   BUG-154 — `maintenance-status` does not touch the linked block.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { isoDay } from "./helpers/dates";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "../db";
import { reservations, vehicles as vehiclesTable, vehicleTransports } from "../../shared/schema";
import { agentFor, cleanupFixtureUsers, type TestAgent } from "./helpers/app";
import {
  createFixtureCustomer, createFixtureVehicle, createFixtureReservation, cleanupFixtures,
} from "./helpers/fixtures";

let admin: TestAgent;
let customerId: number;
let otherCustomerId: number;

beforeAll(async () => {
  admin = await agentFor("admin");
  customerId = (await createFixtureCustomer("Spare")).id;
  otherCustomerId = (await createFixtureCustomer("Andere")).id;
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
  return isoDay(d);
}

async function rowOf(id: number) {
  const [row] = await db.select().from(reservations).where(eq(reservations.id, id));
  return row;
}

async function liveReplacementsFor(originalId: number) {
  return db.select().from(reservations).where(and(
    eq(reservations.type, "replacement"),
    eq(reservations.replacementForReservationId, originalId),
    isNull(reservations.deletedAt),
    sql`${reservations.status} NOT IN ('cancelled','completed','returned')`,
  ));
}

/** A maintenance block + one spare for a rental, through the real endpoint. */
async function planMaintenanceWithSpare(input: {
  blockVehicleId: number;
  rentalId: number;
  spareVehicleId: number;
  startDate: string;
  endDate: string;
  maintenanceId?: number;
}) {
  return admin.post("/api/reservations/maintenance-with-spare").send({
    maintenanceId: input.maintenanceId,
    maintenanceData: {
      vehicleId: input.blockVehicleId,
      startDate: input.startDate,
      endDate: input.endDate,
      type: "maintenance_block",
      status: "booked",
    },
    conflictingReservations: [input.rentalId],
    spareVehicleAssignments: [{
      reservationId: input.rentalId,
      spareVehicleId: input.spareVehicleId,
      startDate: input.startDate,
      endDate: input.endDate,
    }],
  });
}

describe("FIX-V — the maintenance-with-spare resubmission", () => {
  it("never deletes a spare that has already been handed over (BUG-004)", async () => {
    const blockVehicle = await createFixtureVehicle();
    const spareA = await createFixtureVehicle();
    const spareB = await createFixtureVehicle();
    const rental = await createFixtureReservation({
      customerId, vehicleId: blockVehicle.id, startDate: day(5), endDate: day(12),
    });

    const first = await planMaintenanceWithSpare({
      blockVehicleId: blockVehicle.id, rentalId: rental.id, spareVehicleId: spareA.id,
      startDate: day(6), endDate: day(8),
    });
    expect(first.status).toBe(201);
    const blockId = first.body.maintenanceReservation.id;
    const spareReservationId = first.body.updatedReservations[0].id;

    // The spare is physically handed to the customer.
    expect((await admin.post(`/api/reservations/${spareReservationId}/pickup`).send({
      contractNumber: `FIXT-V-${Date.now()}`, pickupMileage: 900, fuelLevelPickup: "full", pickupDate: day(6),
      // besluiten B-16 (BUG-211): the spare's period starts in a few days, so
      // the early handover carries the employee's confirmation.
      shiftStartDate: true,
    })).status).toBe(200);

    const second = await planMaintenanceWithSpare({
      maintenanceId: blockId, blockVehicleId: blockVehicle.id, rentalId: rental.id,
      spareVehicleId: spareB.id, startDate: day(6), endDate: day(8),
    });
    expect(second.status).toBe(409);

    // The row is still there, and still records the real handover.
    const survivor = await rowOf(spareReservationId);
    expect(survivor).toBeDefined();
    expect(survivor.status).toBe("picked_up");
  });

  it("refuses a block without a vehicle and inserts nothing (BUG-033)", async () => {
    const before = (await db.select({ n: sql<number>`count(*)::int` }).from(reservations))[0].n;

    const res = await admin.post("/api/reservations/maintenance-with-spare").send({
      maintenanceData: { startDate: day(40), endDate: day(42), type: "maintenance_block" },
      conflictingReservations: [],
      spareVehicleAssignments: [],
    });
    expect(res.status).toBe(400);

    const after = (await db.select({ n: sql<number>`count(*)::int` }).from(reservations))[0].n;
    expect(after).toBe(before);
  });
});

describe("FIX-V — the block-delete cascade", () => {
  it("deleting block A leaves block B's spares alone (BUG-118)", async () => {
    const vehicle = await createFixtureVehicle();
    const spareA = await createFixtureVehicle();
    const spareB = await createFixtureVehicle();
    const rental = await createFixtureReservation({
      customerId, vehicleId: vehicle.id, startDate: day(60), endDate: day(80),
    });

    const a = await planMaintenanceWithSpare({
      blockVehicleId: vehicle.id, rentalId: rental.id, spareVehicleId: spareA.id,
      startDate: day(61), endDate: day(63),
    });
    expect(a.status).toBe(201);
    const blockA = a.body.maintenanceReservation.id;
    const spareOfA = a.body.updatedReservations[0].id;

    const b = await planMaintenanceWithSpare({
      blockVehicleId: vehicle.id, rentalId: rental.id, spareVehicleId: spareB.id,
      startDate: day(70), endDate: day(72),
    });
    expect(b.status).toBe(201);
    const spareOfB = b.body.updatedReservations[0].id;

    expect((await admin.delete(`/api/reservations/${blockA}`)).status).toBe(200);

    // A's spare is closed, B's is untouched — the whole point of the new link.
    expect((await rowOf(spareOfA)).deletedAt).not.toBeNull();
    expect((await rowOf(spareOfB)).deletedAt).toBeNull();
  });

  it("deleting a block releases its own spare and its spare vehicle (BUG-014)", async () => {
    const vehicle = await createFixtureVehicle();
    const spare = await createFixtureVehicle();
    const rental = await createFixtureReservation({
      customerId, vehicleId: vehicle.id, startDate: day(100), endDate: day(110),
    });

    const planned = await planMaintenanceWithSpare({
      blockVehicleId: vehicle.id, rentalId: rental.id, spareVehicleId: spare.id,
      startDate: day(101), endDate: day(103),
    });
    expect(planned.status).toBe(201);
    const blockId = planned.body.maintenanceReservation.id;
    const spareReservationId = planned.body.updatedReservations[0].id;

    expect((await admin.delete(`/api/reservations/${blockId}`)).status).toBe(200);

    expect((await rowOf(spareReservationId)).deletedAt).not.toBeNull();
    const [spareVehicle] = await db.select().from(vehiclesTable).where(eq(vehiclesTable.id, spare.id));
    expect(spareVehicle.availabilityStatus).not.toBe("scheduled");
  });
});

describe("FIX-V — assign-spare", () => {
  it("twice with two different spares leaves exactly one live replacement (BUG-032)", async () => {
    const vehicle = await createFixtureVehicle();
    const spare1 = await createFixtureVehicle();
    const spare2 = await createFixtureVehicle();
    const block = await createFixtureReservation({
      customerId: null, vehicleId: vehicle.id, type: "maintenance_block",
      startDate: day(200), endDate: day(202),
    });

    const first = await admin.post(`/api/reservations/${block.id}/assign-spare`)
      .send({ spareVehicleId: spare1.id, startDate: day(200), endDate: day(202) });
    expect(first.status).toBe(200);

    const second = await admin.post(`/api/reservations/${block.id}/assign-spare`)
      .send({ spareVehicleId: spare2.id, startDate: day(200), endDate: day(202) });
    expect(second.status).toBe(200);

    const live = await liveReplacementsFor(block.id);
    expect(live).toHaveLength(1);
    expect(live[0].vehicleId).toBe(spare2.id);
  });
});

describe("FIX-V — placeholders", () => {
  it("takes the customer from the rental, not from the body (BUG-035)", async () => {
    const vehicle = await createFixtureVehicle();
    const rental = await createFixtureReservation({
      customerId, vehicleId: vehicle.id, startDate: day(300), endDate: day(310),
    });

    const res = await admin.post("/api/placeholder-reservations").send({
      originalReservationId: rental.id,
      customerId: otherCustomerId,
      startDate: day(301),
      endDate: day(303),
    });
    expect(res.status).toBeLessThan(400);

    const [placeholder] = await liveReplacementsFor(rental.id);
    expect(placeholder).toBeDefined();
    expect(placeholder.customerId).toBe(customerId);
  });

  it("a completed transport closes its TBD placeholder and refuses assignment (BUG-137)", async () => {
    const vehicle = await createFixtureVehicle();
    const spare = await createFixtureVehicle();

    const created = await admin.post("/api/transports").send({
      vehicleId: vehicle.id,
      scheduledDate: day(2),
      transportType: "delivery",
      status: "scheduled",
      spareRequired: true,
    });
    expect(created.status).toBeLessThan(400);
    const transportId = created.body.id;

    const [placeholderBefore] = await db.select().from(reservations)
      .where(and(eq(reservations.replacementForTransportId, transportId), isNull(reservations.deletedAt)));
    expect(placeholderBefore).toBeDefined();

    const needingBefore = await admin.get("/api/placeholder-reservations/needing-assignment?daysAhead=30");
    expect(needingBefore.body.some((r: any) => r.id === placeholderBefore.id)).toBe(true);

    expect((await admin.patch(`/api/transports/${transportId}`)
      .send({ status: "completed", completedDate: day(2) })).status).toBe(200);

    const needingAfter = await admin.get("/api/placeholder-reservations/needing-assignment?daysAhead=30");
    expect(needingAfter.body.some((r: any) => r.id === placeholderBefore.id)).toBe(false);

    const assign = await admin.post(`/api/placeholder-reservations/${placeholderBefore.id}/assign-vehicle`)
      .send({ vehicleId: spare.id, endDate: day(2) });
    expect(assign.status).toBeGreaterThanOrEqual(400);
    expect(assign.status).toBeLessThan(500);
  });
});

describe("FIX-V — the workshop toggle and its block", () => {
  it("moves the linked block's maintenance status with it (BUG-154)", async () => {
    const vehicle = await createFixtureVehicle();
    const block = await createFixtureReservation({
      customerId: null, vehicleId: vehicle.id, type: "maintenance_block",
      startDate: day(-1), endDate: day(3),
    });
    await db.update(reservations).set({ maintenanceStatus: "scheduled" }).where(eq(reservations.id, block.id));

    expect((await admin.patch(`/api/vehicles/${vehicle.id}/maintenance-status`)
      .send({ status: "in_service", note: "binnen" })).status).toBe(200);
    expect((await rowOf(block.id)).maintenanceStatus).toBe("in");

    expect((await admin.patch(`/api/vehicles/${vehicle.id}/maintenance-status`)
      .send({ status: "ok" })).status).toBe(200);
    expect((await rowOf(block.id)).maintenanceStatus).toBe("out");
  });
});
