/**
 * Sub-project C, task 3 (besluiten B-30, B-39) - the reversal engine, through
 * the routes:
 *
 *   GET  /api/reservations/:id/revert-preview
 *   POST /api/reservations/:id/revert        { confirmMileageDecrease?, planHash? }
 *
 * One test per row of the rules table (spec section 2.3) plus the rules around
 * it: the vehicle is only restored when this handover is its latest, a missing
 * reading leaves the vehicle alone, a lower odometer needs a confirmation, a
 * changed plan is refused, documents are marked stale (never deleted), the audit
 * row carries the plan, and `PATCH /:id/status` no longer accepts reversions.
 * The pure plan is covered by c-03-revert-plan.test.ts.
 *
 * Spec: docs/superpowers/specs/2026-10-09-terugdraaien-prullenbak-design.md 2.2, 2.3.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { isoDay } from "./helpers/dates";
import { and, eq, sql } from "drizzle-orm";
import { db } from "../db";
import {
  auditLogs, documents, reservations, vehicles as vehiclesTable, UserPermission,
} from "../../shared/schema";
import { realtimeEvents } from "../realtime-events";
import { storage } from "../storage";
import { agentFor, anonAgent, cleanupFixtureUsers, type TestAgent } from "./helpers/app";
import {
  createFixtureCustomer, createFixtureVehicle, createFixtureReservation, cleanupFixtures,
} from "./helpers/fixtures";

let admin: TestAgent;
let reverter: TestAgent;
let customerId: number;

beforeAll(async () => {
  admin = await agentFor("admin");
  reverter = await agentFor([UserPermission.REVERT_HANDOVER]);
  customerId = (await createFixtureCustomer("C03")).id;
}, 60_000);

afterAll(async () => {
  await cleanupFixtures();
  await cleanupFixtureUsers();
});

/** Days relative to today - never a weekday dependency. */
function day(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return isoDay(d);
}

let contractCounter = 0;
const nextContract = () => `FIXT-C03-${Date.now().toString(36)}-${++contractCounter}`;

async function rowOf(id: number) {
  const [row] = await db.select().from(reservations).where(eq(reservations.id, id));
  return row;
}
async function vehicleRow(id: number) {
  const [row] = await db.select().from(vehiclesTable).where(eq(vehiclesTable.id, id));
  return row;
}
async function docsOf(reservationId: number) {
  return db.select().from(documents).where(eq(documents.reservationId, reservationId));
}
async function addDocument(vehicleId: number, reservationId: number, documentType: string) {
  const [row] = await db.insert(documents).values({
    vehicleId, reservationId, documentType,
    fileName: `FIXT-${documentType}.pdf`, filePath: `FIXT/${documentType}.pdf`,
    fileSize: 1, contentType: "application/pdf",
  }).returning();
  return row;
}

/** A booked rental (period running today) that really goes through the pickup route. */
async function pickedUpRental(opts: { mileage?: number; fuel?: string; pickupMileage?: number; pickupDate?: string; startOffset?: number; endOffset?: number } = {}) {
  const vehicle = await createFixtureVehicle({
    currentMileage: opts.mileage ?? 5000, currentFuelLevel: opts.fuel ?? "1/2",
  });
  const rental = await createFixtureReservation({
    customerId, vehicleId: vehicle.id, startDate: day(opts.startOffset ?? -1), endDate: day(opts.endOffset ?? 3),
  });
  const res = await admin.post(`/api/reservations/${rental.id}/pickup`).send({
    contractNumber: nextContract(), pickupMileage: opts.pickupMileage ?? 5100, fuelLevelPickup: "full",
    pickupDate: opts.pickupDate ?? day(opts.startOffset ?? -1),
  });
  expect(res.status).toBe(200);
  return { vehicle, rental };
}

/** Pickup, then return, both through the routes. */
async function returnedRental() {
  const { vehicle, rental } = await pickedUpRental({
    mileage: 7000, fuel: "3/4", pickupMileage: 7010, pickupDate: day(-3), startOffset: -3, endOffset: -1,
  });
  const ret = await admin.post(`/api/reservations/${rental.id}/return`).send({
    returnMileage: 7300, fuelLevelReturn: "1/4", returnDate: day(-1),
  });
  expect(ret.status).toBe(200);
  return { vehicle, rental };
}

const revert = (agent: TestAgent, id: number, body: Record<string, unknown> = { confirmMileageDecrease: true }) =>
  agent.post(`/api/reservations/${id}/revert`).send(body);

describe("C-03 - who may revert", () => {
  it("answers 401 to an anonymous caller", async () => {
    const anon = await anonAgent();
    const { rental } = await pickedUpRental();
    expect((await anon.get(`/api/reservations/${rental.id}/revert-preview`)).status).toBe(401);
    expect((await anon.post(`/api/reservations/${rental.id}/revert`).send({})).status).toBe(401);
  });

  it("manage_reservations alone is 403 on both routes and changes nothing", async () => {
    const manager = await agentFor([UserPermission.MANAGE_RESERVATIONS]);
    const { rental } = await pickedUpRental();

    const preview = await manager.get(`/api/reservations/${rental.id}/revert-preview`);
    expect(preview.status).toBe(403);
    expect(preview.body.message).toContain("revert_handover");
    const post = await revert(manager, rental.id);
    expect(post.status).toBe(403);
    expect((await rowOf(rental.id)).status).toBe("picked_up");
  });

  it("revert_handover alone is enough (no manage_reservations needed), and so is role admin", async () => {
    const a = await pickedUpRental();
    expect((await reverter.get(`/api/reservations/${a.rental.id}/revert-preview`)).status).toBe(200);
    expect((await revert(reverter, a.rental.id)).status).toBe(200);

    const b = await pickedUpRental();
    expect((await revert(admin, b.rental.id)).status).toBe(200);
  });

  it("an unknown or malformed id", async () => {
    expect((await admin.get("/api/reservations/999999999/revert-preview")).status).toBe(404);
    expect((await revert(admin, 999999999)).status).toBe(404);
    expect((await admin.get("/api/reservations/abc/revert-preview")).status).toBe(400);
    expect((await revert(admin, "abc" as unknown as number)).status).toBe(400);
  });
});

describe("C-03 - picked_up to booked", () => {
  it("clears the pickup data, restores the vehicle, marks the unsigned contract stale, appends the note line", async () => {
    const { vehicle, rental } = await pickedUpRental({ mileage: 5000, fuel: "1/2", pickupMileage: 5100 });
    const unsigned = await addDocument(vehicle.id, rental.id, "Contract (Unsigned)");
    const signed = await addDocument(vehicle.id, rental.id, "Contract (Signed)");
    const before = await rowOf(rental.id);
    expect(before.vehicleMileageBeforePickup).toBe(5000);
    expect(before.notes ?? "").not.toContain("TERUGGEDRAAID");

    const res = await revert(admin, rental.id);
    expect(res.status).toBe(200);
    expect(res.body.plan.fromStatus).toBe("picked_up");
    expect(res.body.plan.toStatus).toBe("booked");
    expect(res.body.reservation.status).toBe("booked");

    const row = await rowOf(rental.id);
    expect(row.status).toBe("booked");
    expect(row.actualPickupDate).toBeNull();
    expect(row.pickupMileage).toBeNull();
    expect(row.fuelLevelPickup).toBeNull();
    expect(row.contractNumber).toBeNull();
    expect(row.vehicleMileageBeforePickup).toBeNull();
    expect(row.vehicleFuelBeforePickup).toBeNull();
    // The agreed period stays (spec: B-16 shifted dates are not undone).
    expect(row.startDate).toBe(before.startDate);
    expect(row.endDate).toBe(before.endDate);
    expect(row.totalPrice).toBe(before.totalPrice);
    expect(row.updatedBy).toBe(admin.username);

    const v = await vehicleRow(vehicle.id);
    expect(v.currentMileage).toBe(5000);
    expect(v.currentFuelLevel).toBe("1/2");

    // Documents are marked, never deleted.
    const docs = await docsOf(rental.id);
    expect(docs.some((d) => d.id === unsigned.id)).toBe(true);
    for (const d of docs.filter((x) => x.documentType === "Contract (Unsigned)")) {
      expect(d.isStale).toBe(true);
      expect(d.staleReason).toBe("handover reverted");
      expect(d.staleSince).not.toBeNull();
    }
    expect(docs.find((d) => d.id === signed.id)?.isStale).toBeFalsy();
    expect(res.body.plan.documentsToMarkStale.map((d: { id: number }) => d.id)).toContain(unsigned.id);

    // The note trail: the old lines stay, a [TERUGGEDRAAID ...] line is added.
    expect(row.notes).toMatch(
      new RegExp(`\\[TERUGGEDRAAID ${day(0)} ${admin.username}\\] picked_up → booked`),
    );
  });

  it("can be picked up again afterwards", async () => {
    const { rental } = await pickedUpRental({ mileage: 100, fuel: "full", pickupMileage: 120 });
    expect((await revert(admin, rental.id)).status).toBe(200);
    const again = await admin.post(`/api/reservations/${rental.id}/pickup`).send({
      contractNumber: nextContract(), pickupMileage: 130, fuelLevelPickup: "full", pickupDate: day(-1),
    });
    expect(again.status).toBe(200);
    const row = await rowOf(rental.id);
    expect(row.status).toBe("picked_up");
    expect(row.vehicleMileageBeforePickup).toBe(100);
  });

  it("a replacement row's spare status goes back to assigned", async () => {
    const { rental } = await pickedUpRental();
    await db.update(reservations).set({ type: "replacement", spareVehicleStatus: "picked_up" })
      .where(eq(reservations.id, rental.id));
    expect((await revert(admin, rental.id)).status).toBe(200);
    expect((await rowOf(rental.id)).spareVehicleStatus).toBe("assigned");
  });

  it("a legacy 'active' row (raw string) is cleared too", async () => {
    const { rental } = await pickedUpRental();
    await db.update(reservations).set({ status: "active" }).where(eq(reservations.id, rental.id));
    const res = await revert(admin, rental.id);
    expect(res.status).toBe(200);
    const row = await rowOf(rental.id);
    expect(row.status).toBe("booked");
    expect(row.actualPickupDate).toBeNull();
    expect(row.contractNumber).toBeNull();
  });
});

describe("C-03 - returned / completed to picked_up", () => {
  it("clears the return data, restores the before-return readings, marks the return damage check stale", async () => {
    const { vehicle, rental } = await returnedRental();
    const damage = await addDocument(vehicle.id, rental.id, "Damage Check");
    const contract = await addDocument(vehicle.id, rental.id, "Contract (Unsigned)");
    await db.update(reservations)
      .set({ fuelCost: "42.50", fuelCardNumber: "FC-9", fuelNotes: "vol getankt" })
      .where(eq(reservations.id, rental.id));
    const before = await rowOf(rental.id);
    expect(before.status).toBe("completed");
    expect(before.vehicleMileageBeforeReturn).toBe(7010);

    const res = await revert(admin, rental.id);
    expect(res.status).toBe(200);
    expect(res.body.plan.fromStatus).toBe("completed");
    expect(res.body.plan.toStatus).toBe("picked_up");

    const row = await rowOf(rental.id);
    expect(row.status).toBe("picked_up");
    for (const key of ["actualReturnDate", "returnMileage", "fuelLevelReturn", "fuelCost", "fuelCardNumber",
      "fuelNotes", "completionDate", "vehicleMileageBeforeReturn", "vehicleFuelBeforeReturn"] as const) {
      expect(row[key], key).toBeNull();
    }
    // The pickup is still a fact.
    expect(row.actualPickupDate).toBe(before.actualPickupDate);
    expect(row.pickupMileage).toBe(7010);
    expect(row.contractNumber).toBe(before.contractNumber);
    expect(row.vehicleMileageBeforePickup).toBe(7000);
    expect(row.endDate).toBe(before.endDate);

    // The vehicle stands where it stood before the return: the pickup reading.
    const v = await vehicleRow(vehicle.id);
    expect(v.currentMileage).toBe(7010);
    expect(v.currentFuelLevel).toBe("full");

    const docs = await docsOf(rental.id);
    expect(docs.find((d) => d.id === damage.id)).toMatchObject({ isStale: true, staleReason: "handover reverted" });
    expect(docs.find((d) => d.id === contract.id)?.isStale).toBeFalsy();
    expect(row.notes).toMatch(/\[TERUGGEDRAAID \d{4}-\d{2}-\d{2} .+\] completed → picked_up/);
  });

  it("works while the car is flagged for the workshop (an undo gives nothing out)", async () => {
    const { vehicle, rental } = await returnedRental();
    await db.update(vehiclesTable).set({ availabilityStatus: "needs_fixing" }).where(eq(vehiclesTable.id, vehicle.id));
    expect((await revert(admin, rental.id)).status).toBe(200);
    expect((await vehicleRow(vehicle.id)).availabilityStatus).toBe("needs_fixing");
  });

  it("the legacy 'returned' status is reverted the same way", async () => {
    const { rental } = await returnedRental();
    await db.update(reservations).set({ status: "returned" }).where(eq(reservations.id, rental.id));
    const res = await revert(admin, rental.id);
    expect(res.status).toBe(200);
    expect(res.body.plan.fromStatus).toBe("returned");
    expect((await rowOf(rental.id)).status).toBe("picked_up");
  });

  it("a replacement row's spare status goes back to picked_up", async () => {
    const { rental } = await returnedRental();
    await db.update(reservations).set({ type: "replacement", spareVehicleStatus: "returned" })
      .where(eq(reservations.id, rental.id));
    expect((await revert(admin, rental.id)).status).toBe(200);
    expect((await rowOf(rental.id)).spareVehicleStatus).toBe("picked_up");
  });
});

describe("C-03 - completed by hand (no return data)", () => {
  it("never picked up: back to booked, only completionDate cleared, vehicle untouched", async () => {
    const vehicle = await createFixtureVehicle({ currentMileage: 900, currentFuelLevel: "1/2" });
    const r = await createFixtureReservation({ customerId, vehicleId: vehicle.id, startDate: day(20), endDate: day(25) });
    await db.update(reservations).set({ status: "completed", completionDate: day(0) }).where(eq(reservations.id, r.id));

    const preview = await admin.get(`/api/reservations/${r.id}/revert-preview`);
    expect(preview.status).toBe(200);
    expect(preview.body.toStatus).toBe("booked");
    expect(preview.body.clears).toEqual(["completionDate"]);
    expect(preview.body.vehicle.restoreTo).toBeNull();
    expect(preview.body.vehicle.reason).toBeUndefined();

    const res = await revert(admin, r.id, {});
    expect(res.status).toBe(200);
    const row = await rowOf(r.id);
    expect(row.status).toBe("booked");
    expect(row.completionDate).toBeNull();
    // Undoing is not a hand-over: the period does not move (B-16 is about pickups).
    expect(row.startDate).toBe(day(20));
    const v = await vehicleRow(vehicle.id);
    expect(v.currentMileage).toBe(900);
  });

  it("picked up earlier: back to picked_up, pickup data kept", async () => {
    const { rental } = await pickedUpRental();
    await db.update(reservations).set({ status: "completed", completionDate: day(0) }).where(eq(reservations.id, rental.id));
    const res = await revert(admin, rental.id, {});
    expect(res.status).toBe(200);
    const row = await rowOf(rental.id);
    expect(row.status).toBe("picked_up");
    expect(row.completionDate).toBeNull();
    expect(row.actualPickupDate).not.toBeNull();
    expect(row.pickupMileage).toBe(5100);
  });
});

describe("C-03 - cancelled", () => {
  it("back to picked_up when the rental had been picked up; nothing else changes", async () => {
    const { vehicle, rental } = await pickedUpRental({ mileage: 3000, pickupMileage: 3100 });
    const contract = await addDocument(vehicle.id, rental.id, "Contract (Unsigned)");
    await db.update(reservations).set({ status: "cancelled" }).where(eq(reservations.id, rental.id));
    const before = await rowOf(rental.id);

    const preview = await admin.get(`/api/reservations/${rental.id}/revert-preview`);
    expect(preview.body.toStatus).toBe("picked_up");
    expect(preview.body.warnings).toEqual(["cascade_not_reopened"]);

    const res = await revert(admin, rental.id, {});
    expect(res.status).toBe(200);
    const row = await rowOf(rental.id);
    expect(row.status).toBe("picked_up");
    expect(row.actualPickupDate).toBe(before.actualPickupDate);
    expect(row.pickupMileage).toBe(before.pickupMileage);
    expect(row.contractNumber).toBe(before.contractNumber);
    expect((await vehicleRow(vehicle.id)).currentMileage).toBe(3100);
    expect((await docsOf(rental.id)).find((d) => d.id === contract.id)?.isStale).toBeFalsy();
  });

  it("back to booked when it had not, and the vehicle availability is recomputed", async () => {
    const vehicle = await createFixtureVehicle();
    const r = await createFixtureReservation({ customerId, vehicleId: vehicle.id, startDate: day(10), endDate: day(12) });
    await db.update(reservations).set({ status: "cancelled" }).where(eq(reservations.id, r.id));
    await db.update(vehiclesTable).set({ availabilityStatus: "available" }).where(eq(vehiclesTable.id, vehicle.id));

    const res = await revert(admin, r.id, {});
    expect(res.status).toBe(200);
    expect((await rowOf(r.id)).status).toBe("booked");
    // A booking 10 days out makes the car 'scheduled' again (FIX-H's one rule).
    expect((await vehicleRow(vehicle.id)).availabilityStatus).toBe("scheduled");
  });

  it("VEHICLE_NOT_FREE when another booking took the period meanwhile (409; the preview says so)", async () => {
    const vehicle = await createFixtureVehicle();
    const r = await createFixtureReservation({ customerId, vehicleId: vehicle.id, startDate: day(5), endDate: day(8) });
    await db.update(reservations).set({ status: "cancelled" }).where(eq(reservations.id, r.id));
    await createFixtureReservation({ customerId, vehicleId: vehicle.id, startDate: day(6), endDate: day(7) });

    const preview = await admin.get(`/api/reservations/${r.id}/revert-preview`);
    expect(preview.status).toBe(200);
    expect(preview.body.blocked.code).toBe("VEHICLE_NOT_FREE");

    const res = await revert(admin, r.id, {});
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("VEHICLE_NOT_FREE");
    expect((await rowOf(r.id)).status).toBe("cancelled");
  });

  it("the cancelled row itself does not count as a conflict", async () => {
    const vehicle = await createFixtureVehicle();
    const r = await createFixtureReservation({ customerId, vehicleId: vehicle.id, startDate: day(5), endDate: day(8) });
    await db.update(reservations).set({ status: "cancelled" }).where(eq(reservations.id, r.id));
    // A non-overlapping booking before it is no obstacle.
    await createFixtureReservation({ customerId, vehicleId: vehicle.id, startDate: day(1), endDate: day(3) });
    expect((await revert(admin, r.id, {})).status).toBe(200);
  });
});

describe("C-03 - the vehicle is only restored when this handover is its latest", () => {
  it("a later handover on the same vehicle: vehicle untouched, reason later_handover, reservation still goes back", async () => {
    const vehicle = await createFixtureVehicle({ currentMileage: 5000, currentFuelLevel: "1/2" });
    const a = await createFixtureReservation({ customerId, vehicleId: vehicle.id, startDate: day(-6), endDate: day(-4) });
    expect((await admin.post(`/api/reservations/${a.id}/pickup`).send({
      contractNumber: nextContract(), pickupMileage: 5100, fuelLevelPickup: "full", pickupDate: day(-5),
    })).status).toBe(200);
    const b = await createFixtureReservation({ customerId, vehicleId: vehicle.id, startDate: day(-2), endDate: day(3) });
    expect((await admin.post(`/api/reservations/${b.id}/pickup`).send({
      contractNumber: nextContract(), pickupMileage: 5200, fuelLevelPickup: "3/4", pickupDate: day(-1),
    })).status).toBe(200);

    const preview = await admin.get(`/api/reservations/${a.id}/revert-preview`);
    expect(preview.body.vehicle.restoreTo).toBeNull();
    expect(preview.body.vehicle.reason).toBe("later_handover");
    expect(preview.body.warnings).toContain("later_handover");
    expect(preview.body.requiresMileageConfirmation).toBe(false);

    // No confirmation is needed: nothing on the vehicle goes down.
    const res = await revert(admin, a.id, {});
    expect(res.status).toBe(200);
    expect((await rowOf(a.id)).status).toBe("booked");
    const v = await vehicleRow(vehicle.id);
    expect(v.currentMileage).toBe(5200);
    expect(v.currentFuelLevel).toBe("3/4");
  });

  it("an earlier handover (or a later one on another vehicle) does not block the restore", async () => {
    const vehicle = await createFixtureVehicle({ currentMileage: 100, currentFuelLevel: "full" });
    const earlier = await createFixtureReservation({ customerId, vehicleId: vehicle.id, startDate: day(-20), endDate: day(-15) });
    await db.update(reservations).set({
      status: "completed", actualPickupDate: day(-20), actualReturnDate: day(-15),
    }).where(eq(reservations.id, earlier.id));
    const other = await createFixtureVehicle();
    const elsewhere = await createFixtureReservation({ customerId, vehicleId: other.id, startDate: day(0), endDate: day(2) });
    await db.update(reservations).set({ status: "picked_up", actualPickupDate: day(0) }).where(eq(reservations.id, elsewhere.id));

    const rental = await createFixtureReservation({ customerId, vehicleId: vehicle.id, startDate: day(-3), endDate: day(2) });
    expect((await admin.post(`/api/reservations/${rental.id}/pickup`).send({
      contractNumber: nextContract(), pickupMileage: 150, fuelLevelPickup: "1/4", pickupDate: day(-3),
    })).status).toBe(200);

    const res = await revert(admin, rental.id);
    expect(res.status).toBe(200);
    expect((await vehicleRow(vehicle.id)).currentMileage).toBe(100);
  });

  it("a turnover day: undoing A's RETURN is blocked by B's pickup the same day (the car came back first)", async () => {
    const vehicle = await createFixtureVehicle({ currentMileage: 1000, currentFuelLevel: "full" });
    const a = await createFixtureReservation({ customerId, vehicleId: vehicle.id, startDate: day(-5), endDate: day(-2) });
    expect((await admin.post(`/api/reservations/${a.id}/pickup`).send({
      contractNumber: nextContract(), pickupMileage: 1010, fuelLevelPickup: "full", pickupDate: day(-5),
    })).status).toBe(200);
    expect((await admin.post(`/api/reservations/${a.id}/return`).send({
      returnMileage: 1400, fuelLevelReturn: "1/2", returnDate: day(-2),
    })).status).toBe(200);
    const b = await createFixtureReservation({ customerId, vehicleId: vehicle.id, startDate: day(-2), endDate: day(2) });
    expect((await admin.post(`/api/reservations/${b.id}/pickup`).send({
      contractNumber: nextContract(), pickupMileage: 1405, fuelLevelPickup: "3/4", pickupDate: day(-2),
    })).status).toBe(200);

    const preview = await admin.get(`/api/reservations/${a.id}/revert-preview`);
    expect(preview.body.vehicle.reason).toBe("later_handover");
    expect((await revert(admin, a.id, {})).status).toBe(200);
    expect((await vehicleRow(vehicle.id)).currentMileage).toBe(1405);
  });

  it("a turnover day: undoing B's PICKUP is not blocked by A's return the same day (it was earlier)", async () => {
    const vehicle = await createFixtureVehicle({ currentMileage: 1000, currentFuelLevel: "full" });
    const a = await createFixtureReservation({ customerId, vehicleId: vehicle.id, startDate: day(-5), endDate: day(-2) });
    expect((await admin.post(`/api/reservations/${a.id}/pickup`).send({
      contractNumber: nextContract(), pickupMileage: 1010, fuelLevelPickup: "full", pickupDate: day(-5),
    })).status).toBe(200);
    expect((await admin.post(`/api/reservations/${a.id}/return`).send({
      returnMileage: 1400, fuelLevelReturn: "1/2", returnDate: day(-2),
    })).status).toBe(200);
    const b = await createFixtureReservation({ customerId, vehicleId: vehicle.id, startDate: day(-2), endDate: day(2) });
    expect((await admin.post(`/api/reservations/${b.id}/pickup`).send({
      contractNumber: nextContract(), pickupMileage: 1405, fuelLevelPickup: "3/4", pickupDate: day(-2),
    })).status).toBe(200);

    const res = await revert(admin, b.id);
    expect(res.status).toBe(200);
    expect(res.body.plan.vehicle.reason).toBeUndefined();
    // B's pickup is undone: the car stands where A left it.
    const v = await vehicleRow(vehicle.id);
    expect(v.currentMileage).toBe(1400);
    expect(v.currentFuelLevel).toBe("1/2");
  });

  it("no stored before-reading (a row from before the columns): vehicle untouched, reason no_reading_stored, no confirmation", async () => {
    const vehicle = await createFixtureVehicle({ currentMileage: 5100, currentFuelLevel: "full" });
    const r = await createFixtureReservation({ customerId, vehicleId: vehicle.id, startDate: day(-1), endDate: day(3) });
    await db.update(reservations).set({
      status: "picked_up", actualPickupDate: day(-1), pickupMileage: 5100, fuelLevelPickup: "full",
      contractNumber: nextContract(),
    }).where(eq(reservations.id, r.id));

    const preview = await admin.get(`/api/reservations/${r.id}/revert-preview`);
    expect(preview.body.vehicle.restoreTo).toBeNull();
    expect(preview.body.vehicle.reason).toBe("no_reading_stored");
    expect(preview.body.warnings).toContain("no_reading_stored");
    expect(preview.body.requiresMileageConfirmation).toBe(false);

    const res = await revert(admin, r.id, {});
    expect(res.status).toBe(200);
    const row = await rowOf(r.id);
    expect(row.status).toBe("booked");
    expect(row.pickupMileage).toBeNull();
    const v = await vehicleRow(vehicle.id);
    expect(v.currentMileage).toBe(5100);
    expect(v.currentFuelLevel).toBe("full");
  });
});

describe("C-03 - the mileage confirmation (a flag, not the password flow)", () => {
  it("409 MILEAGE_DECREASE_CONFIRMATION_REQUIRED with both numbers; nothing changes; 200 with the flag", async () => {
    const { vehicle, rental } = await pickedUpRental({ mileage: 5000, pickupMileage: 5100 });

    const preview = await admin.get(`/api/reservations/${rental.id}/revert-preview`);
    expect(preview.body.requiresMileageConfirmation).toBe(true);
    expect(preview.body.vehicle.current.mileage).toBe(5100);
    expect(preview.body.vehicle.restoreTo.mileage).toBe(5000);

    const without = await revert(admin, rental.id, {});
    expect(without.status).toBe(409);
    expect(without.body.code).toBe("MILEAGE_DECREASE_CONFIRMATION_REQUIRED");
    expect(without.body.currentMileage).toBe(5100);
    expect(without.body.restoreToMileage).toBe(5000);
    expect((await rowOf(rental.id)).status).toBe("picked_up");
    expect((await vehicleRow(vehicle.id)).currentMileage).toBe(5100);

    // Only a real boolean true counts.
    expect((await revert(admin, rental.id, { confirmMileageDecrease: false })).status).toBe(409);
    expect((await revert(admin, rental.id, { confirmMileageDecrease: "true" })).status).toBe(400);
    expect((await rowOf(rental.id)).status).toBe("picked_up");

    const withFlag = await revert(admin, rental.id, { confirmMileageDecrease: true });
    expect(withFlag.status).toBe(200);
    expect((await vehicleRow(vehicle.id)).currentMileage).toBe(5000);
  });

  it("does not use the authorize_mileage_decrease right or a password", async () => {
    const { rental } = await pickedUpRental({ mileage: 5000, pickupMileage: 5100 });
    // `reverter` holds revert_handover only - no authorize_mileage_decrease, no password.
    const res = await revert(reverter, rental.id, { confirmMileageDecrease: true });
    expect(res.status).toBe(200);
  });
});

describe("C-03 - the plan the client confirmed", () => {
  it("the preview carries a planHash; a POST with the same hash goes through", async () => {
    const { rental } = await pickedUpRental();
    const preview = await admin.get(`/api/reservations/${rental.id}/revert-preview`);
    expect(preview.body.planHash).toMatch(/^[0-9a-f]{64}$/);
    const res = await revert(admin, rental.id, { confirmMileageDecrease: true, planHash: preview.body.planHash });
    expect(res.status).toBe(200);
    expect(res.body.plan.planHash).toBe(preview.body.planHash);
  });

  it("409 REVERT_PLAN_CHANGED when the vehicle's odometer moved after the preview; the body carries the new plan", async () => {
    const { vehicle, rental } = await pickedUpRental({ mileage: 5000, pickupMileage: 5100 });
    const preview = await admin.get(`/api/reservations/${rental.id}/revert-preview`);

    await db.update(vehiclesTable).set({ currentMileage: 5150 }).where(eq(vehiclesTable.id, vehicle.id));

    const stale = await revert(admin, rental.id, { confirmMileageDecrease: true, planHash: preview.body.planHash });
    expect(stale.status).toBe(409);
    expect(stale.body.code).toBe("REVERT_PLAN_CHANGED");
    expect(stale.body.plan.vehicle.current.mileage).toBe(5150);
    expect(stale.body.plan.planHash).not.toBe(preview.body.planHash);
    expect((await rowOf(rental.id)).status).toBe("picked_up");
    expect((await vehicleRow(vehicle.id)).currentMileage).toBe(5150);

    // Confirmed against the new plan, it goes through.
    const fresh = await revert(admin, rental.id, { confirmMileageDecrease: true, planHash: stale.body.plan.planHash });
    expect(fresh.status).toBe(200);
  });

  it("409 REVERT_PLAN_CHANGED when somebody else already reverted it", async () => {
    const { rental } = await pickedUpRental();
    const preview = await admin.get(`/api/reservations/${rental.id}/revert-preview`);
    expect((await revert(admin, rental.id)).status).toBe(200);

    const second = await revert(admin, rental.id, { confirmMileageDecrease: true, planHash: preview.body.planHash });
    expect(second.status).toBe(409);
    expect(second.body.code).toBe("REVERT_PLAN_CHANGED");
  });

  it("a row with nothing to undo: preview says blocked INVALID_STATUS_TRANSITION, POST is 400", async () => {
    const vehicle = await createFixtureVehicle();
    const r = await createFixtureReservation({ customerId, vehicleId: vehicle.id, startDate: day(10), endDate: day(12) });
    const preview = await admin.get(`/api/reservations/${r.id}/revert-preview`);
    expect(preview.status).toBe(200);
    expect(preview.body.toStatus).toBeNull();
    expect(preview.body.blocked.code).toBe("INVALID_STATUS_TRANSITION");

    const res = await revert(admin, r.id, {});
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("INVALID_STATUS_TRANSITION");
  });

  it("a soft-deleted reservation is not found", async () => {
    const { rental } = await pickedUpRental();
    await db.update(reservations).set({ deletedAt: new Date() }).where(eq(reservations.id, rental.id));
    expect((await admin.get(`/api/reservations/${rental.id}/revert-preview`)).status).toBe(404);
    expect((await revert(admin, rental.id)).status).toBe(404);
  });
});

describe("C-03 - what happens after the transaction", () => {
  it("recomputes the vehicle availability", async () => {
    // A rental that starts in 8 days but was (wrongly) picked up today: picked_up
    // makes the car 'rented'. The pickup route would ask the early-pickup question,
    // so the row is put in that state directly.
    const vehicle = await createFixtureVehicle({ currentMileage: 5000, currentFuelLevel: "1/2" });
    const rental = await createFixtureReservation({ customerId, vehicleId: vehicle.id, startDate: day(8), endDate: day(12) });
    await db.update(reservations).set({
      status: "picked_up", actualPickupDate: day(0), pickupMileage: 5100, fuelLevelPickup: "full",
      vehicleMileageBeforePickup: 5000, vehicleFuelBeforePickup: "1/2",
    }).where(eq(reservations.id, rental.id));
    await db.update(vehiclesTable).set({ availabilityStatus: "rented", currentMileage: 5100, currentFuelLevel: "full" })
      .where(eq(vehiclesTable.id, vehicle.id));
    expect((await revert(admin, rental.id)).status).toBe(200);
    // Booked again, 8 days out: 'scheduled', not 'rented'.
    expect((await vehicleRow(vehicle.id)).availabilityStatus).toBe("scheduled");
  });

  it("writes exactly one reservation.revert audit row that carries the plan", async () => {
    const { rental } = await pickedUpRental();
    const res = await revert(admin, rental.id);
    expect(res.status).toBe(200);
    // The generic mutation middleware logs from the response's finish event; give
    // it the time it would need, then count - a double log would show by now.
    await new Promise((r) => setTimeout(r, 400));
    const rows = await db.select().from(auditLogs).where(and(
      eq(auditLogs.resourceType, "reservation"),
      eq(auditLogs.resourceId, String(rental.id)),
      eq(auditLogs.action, "reservation.revert"),
    ));
    expect(rows).toHaveLength(1);
    expect(rows[0].username).toBe(admin.username);
    const details = rows[0].details as { plan: { fromStatus: string; toStatus: string; clears: string[] } };
    expect(details.plan.fromStatus).toBe("picked_up");
    expect(details.plan.toStatus).toBe("booked");
    expect(details.plan.clears).toContain("pickupMileage");
  });

  it("sends a realtime update for the reservation (and the vehicle when it was restored)", async () => {
    const { rental } = await pickedUpRental();
    const reservationUpdated = vi.spyOn(realtimeEvents.reservations, "updated");
    const vehicleUpdated = vi.spyOn(realtimeEvents.vehicles, "updated");
    try {
      expect((await revert(admin, rental.id)).status).toBe(200);
      expect(reservationUpdated).toHaveBeenCalledWith(expect.objectContaining({ id: rental.id }));
      expect(vehicleUpdated).toHaveBeenCalled();
    } finally {
      reservationUpdated.mockRestore();
      vehicleUpdated.mockRestore();
    }
  });

  it("one transaction: a failure after the writes rolls everything back", async () => {
    const { vehicle, rental } = await pickedUpRental({ mileage: 5000, pickupMileage: 5100 });
    const doc = await addDocument(vehicle.id, rental.id, "Contract (Unsigned)");
    const before = await rowOf(rental.id);
    // The availability recompute is the last write inside the transaction.
    const recompute = vi.spyOn(storage, "recomputeVehicleAvailability").mockRejectedValueOnce(new Error("boom"));
    try {
      const res = await revert(admin, rental.id);
      expect(res.status).toBe(500);
    } finally {
      recompute.mockRestore();
    }
    const after = await rowOf(rental.id);
    expect(after.status).toBe("picked_up");
    expect(after.pickupMileage).toBe(before.pickupMileage);
    expect(after.contractNumber).toBe(before.contractNumber);
    expect(after.notes).toBe(before.notes);
    expect((await vehicleRow(vehicle.id)).currentMileage).toBe(5100);
    expect((await docsOf(rental.id)).find((d) => d.id === doc.id)?.isStale).toBeFalsy();
    // And the same revert works once the failure is gone.
    expect((await revert(admin, rental.id)).status).toBe(200);
  });

  it("two simultaneous reverts of one rental: one wins, the other finds nothing left to undo", async () => {
    const { vehicle, rental } = await pickedUpRental({ mileage: 5000, pickupMileage: 5100 });
    const [first, second] = await Promise.all([revert(admin, rental.id), revert(reverter, rental.id)]);
    expect([first.status, second.status].sort()).toEqual([200, 400]);
    const loser = first.status === 400 ? first : second;
    expect(loser.body.code).toBe("INVALID_STATUS_TRANSITION");
    expect((await rowOf(rental.id)).status).toBe("booked");
    expect((await vehicleRow(vehicle.id)).currentMileage).toBe(5000);
    const notes = (await rowOf(rental.id)).notes ?? "";
    expect(notes.match(/TERUGGEDRAAID/g)).toHaveLength(1);
  });

  it("a refused revert writes no audit row and sends no event", async () => {
    const { rental } = await pickedUpRental({ mileage: 5000, pickupMileage: 5100 });
    const reservationUpdated = vi.spyOn(realtimeEvents.reservations, "updated");
    try {
      expect((await revert(admin, rental.id, {})).status).toBe(409);
      expect(reservationUpdated).not.toHaveBeenCalled();
    } finally {
      reservationUpdated.mockRestore();
    }
    await new Promise((r) => setTimeout(r, 200));
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(auditLogs).where(and(
      eq(auditLogs.resourceId, String(rental.id)),
      eq(auditLogs.action, "reservation.revert"),
    ));
    expect(n).toBe(0);
  });
});

describe("C-03 - PATCH /:id/status no longer accepts reversions", () => {
  async function rowWith(status: string, extra: Partial<typeof reservations.$inferInsert> = {}) {
    const vehicle = await createFixtureVehicle();
    const r = await createFixtureReservation({ customerId, vehicleId: vehicle.id, startDate: day(-2), endDate: day(3) });
    await db.update(reservations).set({ status, ...extra }).where(eq(reservations.id, r.id));
    return r.id;
  }

  const cases: Array<[string, string, Partial<typeof reservations.$inferInsert>]> = [
    ["picked_up", "booked", { actualPickupDate: day(-2), pickupMileage: 10 }],
    ["returned", "picked_up", {}],
    ["completed", "picked_up", { completionDate: day(0) }],
    ["completed", "booked", { completionDate: day(0) }],
    ["cancelled", "booked", {}],
    ["cancelled", "picked_up", {}],
  ];

  it.each(cases)("%s -> %s answers 400 USE_REVERT_ROUTE and writes nothing", async (from, to, extra) => {
    const id = await rowWith(from, extra);
    const before = await rowOf(id);
    const res = await admin.patch(`/api/reservations/${id}/status`).send({ status: to });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("USE_REVERT_ROUTE");
    const after = await rowOf(id);
    expect(after.status).toBe(from);
    expect(after.actualPickupDate).toBe(before.actualPickupDate);
    expect(after.pickupMileage).toBe(before.pickupMileage);
    expect(after.completionDate).toBe(before.completionDate);
  });

  it("an illegal jump that is not a reversion keeps its own code", async () => {
    const id = await rowWith("cancelled");
    const res = await admin.patch(`/api/reservations/${id}/status`).send({ status: "completed" });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("INVALID_STATUS_TRANSITION");
  });

  it("the same status again is still an idempotent no-op, and forward moves still work", async () => {
    const id = await rowWith("booked");
    expect((await admin.patch(`/api/reservations/${id}/status`).send({ status: "booked" })).status).toBe(200);
    expect((await admin.patch(`/api/reservations/${id}/status`).send({ status: "picked_up" })).status).toBe(200);
    expect((await admin.patch(`/api/reservations/${id}/status`).send({ status: "completed" })).status).toBe(200);
  });
});

describe("C-03 - the before-handover readings are server-owned", () => {
  it("POST /api/reservations ignores them", async () => {
    const vehicle = await createFixtureVehicle();
    const res = await admin.post("/api/reservations").send({
      customerId, vehicleId: vehicle.id, startDate: day(30), endDate: day(32), type: "standard",
      vehicleMileageBeforePickup: 1, vehicleFuelBeforePickup: "empty",
      vehicleMileageBeforeReturn: 2, vehicleFuelBeforeReturn: "empty",
    });
    expect(res.status).toBe(201);
    const row = await rowOf(res.body.id);
    expect(row.vehicleMileageBeforePickup).toBeNull();
    expect(row.vehicleFuelBeforePickup).toBeNull();
    expect(row.vehicleMileageBeforeReturn).toBeNull();
    expect(row.vehicleFuelBeforeReturn).toBeNull();
  });

  it("PATCH /:id and PATCH /:id/basic can neither set nor null them (a stale edit form echoes them)", async () => {
    const { rental } = await returnedRental();
    const before = await rowOf(rental.id);
    expect(before.vehicleMileageBeforePickup).toBe(7000);
    expect(before.vehicleMileageBeforeReturn).toBe(7010);

    const nulling = {
      notes: "bewerkt", vehicleMileageBeforePickup: null, vehicleFuelBeforePickup: null,
      vehicleMileageBeforeReturn: null, vehicleFuelBeforeReturn: null,
    };
    const patched = await admin.patch(`/api/reservations/${rental.id}`).send(nulling);
    expect(patched.status).toBe(200);
    const basic = await admin.patch(`/api/reservations/${rental.id}/basic`).send(nulling);
    expect(basic.status).toBe(200);

    const setting = {
      vehicleMileageBeforePickup: 1, vehicleFuelBeforePickup: "empty",
      vehicleMileageBeforeReturn: 2, vehicleFuelBeforeReturn: "empty",
    };
    expect((await admin.patch(`/api/reservations/${rental.id}`).send(setting)).status).toBe(200);
    expect((await admin.patch(`/api/reservations/${rental.id}/basic`).send(setting)).status).toBe(200);

    const after = await rowOf(rental.id);
    expect(after.notes).toBe("bewerkt");
    expect(after.vehicleMileageBeforePickup).toBe(7000);
    expect(after.vehicleFuelBeforePickup).toBe("3/4");
    expect(after.vehicleMileageBeforeReturn).toBe(7010);
    expect(after.vehicleFuelBeforeReturn).toBe("full");
  });
});
