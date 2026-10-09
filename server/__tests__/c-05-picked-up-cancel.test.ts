/**
 * Sub-project C, task 5 (besluiten B-33, B-39) - cancelling or deleting a rental
 * that has been PICKED UP.
 *
 * Three writers, one rule (spec 2026-10-09 section 3). When the row's existing
 * status normalises to `picked_up` (legacy spellings included):
 *
 *   PATCH  /api/reservations/:id/status   { status: "cancelled", confirmPickedUp }
 *   PATCH  /api/reservations/:id          { status: "cancelled", confirmPickedUp }   (the edit form)
 *   DELETE /api/reservations/:id?confirmPickedUp=true
 *
 * need the right `cancel_picked_up_rental` (403 naming it, role admin passes) AND
 * the confirmation flag (409 PICKED_UP_CONFIRMATION_REQUIRED with the pickup
 * date and the contract number, so the dialog can show them). Rows in any other
 * status behave as before. The right is checked first: someone who may not do it
 * is not asked to confirm.
 *
 * `PATCH /:id/basic` (a fourth writer that can write `cancelled`) follows the same
 * rule, and a maintenance block is not a rental, so it is exempt even when a
 * legacy `active` status normalises to picked_up.
 *
 * Spec: docs/superpowers/specs/2026-10-09-terugdraaien-prullenbak-design.md section 3.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { and, eq, getTableColumns, inArray, like } from "drizzle-orm";
import { day } from "./helpers/dates";
import { db } from "../db";
import { deletedRecords, reservations, vehicles as vehiclesTable, UserPermission } from "../../shared/schema";
import { PICKED_UP_CODES, isPickedUpRental } from "../../shared/picked-up-cancellation";
import { LEGACY_RESERVATION_STATUS_ALIASES, RESERVATION_STATUSES, normalizeReservationStatus } from "../services/lifecycle";
import { requiresPickedUpConfirmation } from "../services/picked-up-cancellation";
import { agentFor, cleanupFixtureUsers, type TestAgent } from "./helpers/app";
import {
  createFixtureCustomer, createFixtureVehicle, createFixtureReservation, cleanupFixtures, FIXTURE_PLATE_PREFIX,
} from "./helpers/fixtures";

let admin: TestAgent;
/** manage_reservations only: today's "desk" account, which must no longer cancel a picked-up rental. */
let desk: TestAgent;
/** manage_reservations + cancel_picked_up_rental: the account the owner ticks the new box for. */
let cancelRight: TestAgent;
let customerId: number;

beforeAll(async () => {
  admin = await agentFor("admin");
  desk = await agentFor([UserPermission.MANAGE_RESERVATIONS]);
  cancelRight = await agentFor([UserPermission.MANAGE_RESERVATIONS, UserPermission.CANCEL_PICKED_UP_RENTAL]);
  customerId = (await createFixtureCustomer("C05")).id;
}, 60_000);

afterAll(async () => {
  // Only the bin rows of this file's fixtures: a bin label carries the plate of the vehicle
  // ("Reservering #12 — FIXT-5 2026-10-09"), and every fixture plate starts with FIXT-.
  await db.delete(deletedRecords).where(and(
    inArray(deletedRecords.entityType, ["reservation", "maintenance_block"]),
    like(deletedRecords.label, `% ${FIXTURE_PLATE_PREFIX}-%`),
  ));
  await cleanupFixtures();
  await cleanupFixtureUsers();
});

let contractCounter = 0;
const nextContract = () => `FIXT-C05-${Date.now().toString(36)}-${++contractCounter}`;

async function rowOf(id: number) {
  const [row] = await db.select().from(reservations).where(eq(reservations.id, id));
  return row;
}
async function vehicleRow(id: number) {
  const [row] = await db.select().from(vehiclesTable).where(eq(vehiclesTable.id, id));
  return row;
}

/** A booked rental whose period is running today. */
async function bookedRental() {
  const vehicle = await createFixtureVehicle({ currentMileage: 5000, currentFuelLevel: "1/2" });
  const rental = await createFixtureReservation({
    customerId, vehicleId: vehicle.id, startDate: day(-1), endDate: day(3),
  });
  return { vehicle, rental };
}

/** A rental that really went through the pickup route, so it carries a date and a contract number. */
async function pickedUpRental() {
  const { vehicle, rental } = await bookedRental();
  const res = await admin.post(`/api/reservations/${rental.id}/pickup`).send({
    contractNumber: nextContract(), pickupMileage: 5100, fuelLevelPickup: "full", pickupDate: day(-1),
  });
  expect(res.status).toBe(200);
  const row = await rowOf(rental.id);
  expect(row.status).toBe("picked_up");
  expect(row.actualPickupDate).toBeTruthy();
  expect(row.contractNumber).toBeTruthy();
  return { vehicle, rental: row };
}

const cancelViaStatus = (agent: TestAgent, id: number, extra: Record<string, unknown> = {}) =>
  agent.patch(`/api/reservations/${id}/status`).send({ status: "cancelled", ...extra });
const cancelViaForm = (agent: TestAgent, id: number, extra: Record<string, unknown> = {}) =>
  agent.patch(`/api/reservations/${id}`).send({ status: "cancelled", ...extra });
const deleteIt = (agent: TestAgent, id: number, query = "") =>
  agent.delete(`/api/reservations/${id}${query}`);

/** Everything that must be untouched after a refusal. */
async function expectUntouched(id: number, before: Awaited<ReturnType<typeof rowOf>>) {
  const after = await rowOf(id);
  expect(after.status).toBe(before.status);
  expect(after.deletedAt).toBeNull();
  expect(after.actualPickupDate).toBe(before.actualPickupDate);
  expect(after.contractNumber).toBe(before.contractNumber);
}

describe("C-05 - the shared rule", () => {
  it("names the picked-up spellings exactly as the server's normaliser does", () => {
    // The client cannot import server/services/lifecycle.ts, so it decides with
    // shared/picked-up-cancellation.ts. This test is the only thing that keeps
    // the two lists from drifting apart.
    const spellings = [
      ...RESERVATION_STATUSES,
      ...Object.keys(LEGACY_RESERVATION_STATUS_ALIASES),
      "PICKED_UP", " picked_up ", "Active", "garbage", "", null, undefined,
    ];
    for (const status of spellings) {
      const server = normalizeReservationStatus(status) === "picked_up";
      expect(isPickedUpRental({ status: status as any, type: "standard" }), `status ${JSON.stringify(status)}`).toBe(server);
      expect(requiresPickedUpConfirmation({ status, type: "standard" }), `server, status ${JSON.stringify(status)}`).toBe(server);
    }
  });

  it("never treats a maintenance block as a picked-up rental", () => {
    expect(isPickedUpRental({ status: "active", type: "maintenance_block" })).toBe(false);
    expect(requiresPickedUpConfirmation({ status: "active", type: "maintenance_block" })).toBe(false);
    expect(requiresPickedUpConfirmation({ status: "picked_up", type: "replacement" })).toBe(true);
    expect(isPickedUpRental({ status: "picked_up", type: "replacement" })).toBe(true);
  });
});

describe("C-05 - PATCH /api/reservations/:id/status {status:'cancelled'}", () => {
  it("a booked rental cancels as today: manage_reservations alone, no flag", async () => {
    const { rental } = await bookedRental();
    const res = await cancelViaStatus(desk, rental.id);
    expect(res.status).toBe(200);
    expect((await rowOf(rental.id)).status).toBe("cancelled");
  });

  it("a picked-up rental without the right is a 403 naming cancel_picked_up_rental, and nothing changes", async () => {
    const { rental } = await pickedUpRental();
    const res = await cancelViaStatus(desk, rental.id, { confirmPickedUp: true });
    expect(res.status).toBe(403);
    expect(res.body.message).toContain("cancel_picked_up_rental");
    expect(res.body.code).toBe(PICKED_UP_CODES.RIGHT_REQUIRED);
    await expectUntouched(rental.id, rental);
  });

  it("checks the right before the confirmation: no right and no flag is still a 403", async () => {
    const { rental } = await pickedUpRental();
    const res = await cancelViaStatus(desk, rental.id);
    expect(res.status).toBe(403);
    await expectUntouched(rental.id, rental);
  });

  it("with the right but without the flag it is a 409 carrying the pickup date and the contract number", async () => {
    const { rental } = await pickedUpRental();
    const res = await cancelViaStatus(cancelRight, rental.id);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("PICKED_UP_CONFIRMATION_REQUIRED");
    expect(res.body.actualPickupDate).toBe(rental.actualPickupDate);
    expect(res.body.contractNumber).toBe(rental.contractNumber);
    await expectUntouched(rental.id, rental);
  });

  it("only the boolean true (or the string 'true' of a multipart form) counts as the flag", async () => {
    const { rental } = await pickedUpRental();
    for (const flag of [false, "yes", 1, "false", null]) {
      const res = await cancelViaStatus(cancelRight, rental.id, { confirmPickedUp: flag });
      expect(res.status, `flag ${JSON.stringify(flag)}`).toBe(409);
    }
    await expectUntouched(rental.id, rental);
  });

  it("with the right and the flag it cancels; the pickup data and the vehicle's odometer stay as they were", async () => {
    const { rental, vehicle } = await pickedUpRental();
    const vehicleBefore = await vehicleRow(vehicle.id);

    const res = await cancelViaStatus(cancelRight, rental.id, { confirmPickedUp: true });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("cancelled");
    // The cascade answer is still part of the response (B-04).
    expect(res.body.cancelCascade).toBeDefined();

    const after = await rowOf(rental.id);
    expect(after.status).toBe("cancelled");
    expect(after.actualPickupDate).toBe(rental.actualPickupDate);
    expect(after.contractNumber).toBe(rental.contractNumber);
    expect(after.pickupMileage).toBe(rental.pickupMileage);
    // Spec section 3: cancelling does not revert the vehicle.
    const vehicleAfter = await vehicleRow(vehicle.id);
    expect(vehicleAfter.currentMileage).toBe(vehicleBefore.currentMileage);
    expect(vehicleAfter.currentMileage).toBe(5100);
  });

  it("role admin passes the right check but still needs the flag", async () => {
    const a = await pickedUpRental();
    const refused = await cancelViaStatus(admin, a.rental.id);
    expect(refused.status).toBe(409);
    expect(refused.body.code).toBe("PICKED_UP_CONFIRMATION_REQUIRED");
    expect((await cancelViaStatus(admin, a.rental.id, { confirmPickedUp: true })).status).toBe(200);
  });

  it.each(["active", "in", "ACTIVE"])("the legacy spelling %s counts as picked up", async (legacy) => {
    const { rental } = await pickedUpRental();
    await db.update(reservations).set({ status: legacy }).where(eq(reservations.id, rental.id));
    const noRight = await cancelViaStatus(desk, rental.id, { confirmPickedUp: true });
    expect(noRight.status).toBe(403);
    const noFlag = await cancelViaStatus(cancelRight, rental.id);
    expect(noFlag.status).toBe(409);
    expect((await cancelViaStatus(cancelRight, rental.id, { confirmPickedUp: true })).status).toBe(200);
  });

  it("other statuses keep today's behaviour: a returned rental cancels without the right or the flag", async () => {
    const { rental } = await bookedRental();
    await db.update(reservations).set({ status: "returned" }).where(eq(reservations.id, rental.id));
    expect((await cancelViaStatus(desk, rental.id)).status).toBe(200);
  });

  it("a completed rental is still refused by the state machine, not by this rule", async () => {
    const { rental } = await bookedRental();
    await db.update(reservations).set({ status: "completed" }).where(eq(reservations.id, rental.id));
    const res = await cancelViaStatus(desk, rental.id);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("INVALID_STATUS_TRANSITION");
  });
});

describe("C-05 - PATCH /api/reservations/:id {status:'cancelled'} (the edit form)", () => {
  it("a booked rental cancels as today", async () => {
    const { rental } = await bookedRental();
    expect((await cancelViaForm(desk, rental.id)).status).toBe(200);
    expect((await rowOf(rental.id)).status).toBe("cancelled");
  });

  it("a picked-up rental: 403 without the right, 409 without the flag, 200 with both", async () => {
    const { rental } = await pickedUpRental();

    const noRight = await cancelViaForm(desk, rental.id, { confirmPickedUp: true });
    expect(noRight.status).toBe(403);
    expect(noRight.body.message).toContain("cancel_picked_up_rental");

    const noFlag = await cancelViaForm(cancelRight, rental.id);
    expect(noFlag.status).toBe(409);
    expect(noFlag.body.code).toBe("PICKED_UP_CONFIRMATION_REQUIRED");
    expect(noFlag.body.actualPickupDate).toBe(rental.actualPickupDate);
    expect(noFlag.body.contractNumber).toBe(rental.contractNumber);
    await expectUntouched(rental.id, rental);

    const done = await cancelViaForm(cancelRight, rental.id, { confirmPickedUp: true });
    expect(done.status).toBe(200);
    expect((await rowOf(rental.id)).status).toBe("cancelled");
  });

  it("the multipart form (damage check upload) sends the flag as the string 'true'", async () => {
    const { rental } = await pickedUpRental();
    const res = await cancelRight.patch(`/api/reservations/${rental.id}`)
      .field("status", "cancelled").field("confirmPickedUp", "true");
    expect(res.status).toBe(200);
    expect((await rowOf(rental.id)).status).toBe("cancelled");
  });

  it("an edit that does not cancel needs neither the right nor the flag", async () => {
    const { rental } = await pickedUpRental();
    const res = await desk.patch(`/api/reservations/${rental.id}`).send({ notes: "FIXT-C05 edit" });
    expect(res.status).toBe(200);
    const same = await desk.patch(`/api/reservations/${rental.id}`).send({ status: "picked_up", notes: "FIXT-C05 again" });
    expect(same.status).toBe(200);
    expect((await rowOf(rental.id)).status).toBe("picked_up");
  });

  it("the confirmation flag is a request field only: no column stores it, and the cancellation keeps the pickup data", async () => {
    // A `select *` row can only hold what the table has, so the schema is the real check.
    const flagColumns = Object.values(getTableColumns(reservations)).filter((column) => /confirm.*picked/i.test(column.name));
    expect(flagColumns).toEqual([]);

    const { rental } = await pickedUpRental();
    expect((await cancelViaForm(cancelRight, rental.id, { confirmPickedUp: true })).status).toBe(200);
    const after = await rowOf(rental.id);
    expect(after.status).toBe("cancelled");
    expect(after.actualPickupDate).toBe(rental.actualPickupDate);
    expect(after.contractNumber).toBe(rental.contractNumber);
  });
});

describe("C-05 - PATCH /api/reservations/:id/basic {status:'cancelled'}", () => {
  it("is held to the same rule: 403 without the right, 409 without the flag, 200 with both", async () => {
    const { rental } = await pickedUpRental();
    const basic = (agent: TestAgent, extra: Record<string, unknown> = {}) =>
      agent.patch(`/api/reservations/${rental.id}/basic`).send({ status: "cancelled", ...extra });

    expect((await basic(desk, { confirmPickedUp: true })).status).toBe(403);
    expect((await basic(cancelRight)).status).toBe(409);
    await expectUntouched(rental.id, rental);
    expect((await basic(cancelRight, { confirmPickedUp: true })).status).toBe(200);
    expect((await rowOf(rental.id)).status).toBe("cancelled");
  });

  it("a booked rental still cancels through it without the right", async () => {
    const { rental } = await bookedRental();
    const res = await desk.patch(`/api/reservations/${rental.id}/basic`).send({ status: "cancelled" });
    expect(res.status).toBe(200);
  });
});

describe("C-05 - DELETE /api/reservations/:id", () => {
  it("a booked rental deletes as today and is in the recycle bin", async () => {
    const { rental } = await bookedRental();
    expect((await deleteIt(desk, rental.id)).status).toBe(200);
    expect((await rowOf(rental.id)).deletedAt).not.toBeNull();
  });

  it("a picked-up rental without the right is a 403 naming cancel_picked_up_rental, and stays", async () => {
    const { rental } = await pickedUpRental();
    const res = await deleteIt(desk, rental.id, "?confirmPickedUp=true");
    expect(res.status).toBe(403);
    expect(res.body.message).toContain("cancel_picked_up_rental");
    await expectUntouched(rental.id, rental);
  });

  it("with the right but without the query flag it is a 409 carrying the pickup date and the contract number", async () => {
    const { rental } = await pickedUpRental();
    const res = await deleteIt(cancelRight, rental.id);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("PICKED_UP_CONFIRMATION_REQUIRED");
    expect(res.body.actualPickupDate).toBe(rental.actualPickupDate);
    expect(res.body.contractNumber).toBe(rental.contractNumber);
    await expectUntouched(rental.id, rental);

    for (const query of ["?confirmPickedUp=false", "?confirmPickedUp=1", "?confirmPickedUp="]) {
      expect((await deleteIt(cancelRight, rental.id, query)).status, query).toBe(409);
    }
    await expectUntouched(rental.id, rental);
  });

  it("with the right and ?confirmPickedUp=true it deletes, and the row is in the recycle bin", async () => {
    const { rental } = await pickedUpRental();
    const res = await deleteIt(cancelRight, rental.id, "?confirmPickedUp=true");
    expect(res.status).toBe(200);

    const after = await rowOf(rental.id);
    expect(after.deletedAt).not.toBeNull();
    const [binRow] = await db.select().from(deletedRecords)
      .where(and(eq(deletedRecords.entityType, "reservation"), eq(deletedRecords.entityId, rental.id)));
    expect(binRow).toBeDefined();

    // Restorable, and it comes back as the picked-up rental it was.
    const restored = await admin.post(`/api/deleted-records/${binRow.id}/restore`).send({});
    expect(restored.status).toBe(200);
    const back = await rowOf(rental.id);
    expect(back.deletedAt).toBeNull();
    expect(back.status).toBe("picked_up");
  });

  it("role admin needs the flag too, and the legacy spelling counts", async () => {
    const { rental } = await pickedUpRental();
    await db.update(reservations).set({ status: "active" }).where(eq(reservations.id, rental.id));
    const refused = await deleteIt(admin, rental.id);
    expect(refused.status).toBe(409);
    expect((await deleteIt(admin, rental.id, "?confirmPickedUp=true")).status).toBe(200);
  });

  it("a picked-up spare (replacement reservation) is held to the same rule", async () => {
    const { rental } = await pickedUpRental();
    await db.update(reservations).set({ type: "replacement" }).where(eq(reservations.id, rental.id));
    expect((await deleteIt(desk, rental.id, "?confirmPickedUp=true")).status).toBe(403);
    expect((await deleteIt(cancelRight, rental.id)).status).toBe(409);
  });

  it("a returned (closed) rental still deletes without the right or the flag", async () => {
    const { rental } = await bookedRental();
    await db.update(reservations).set({ status: "returned" }).where(eq(reservations.id, rental.id));
    expect((await deleteIt(desk, rental.id)).status).toBe(200);
  });
});

describe("C-05 - a maintenance block is not a rental", () => {
  it("a legacy 'active' block deletes and cancels with manage_reservations alone", async () => {
    const vehicle = await createFixtureVehicle();
    const [block] = await db.insert(reservations).values({
      customerId: null, vehicleId: vehicle.id, startDate: day(5), endDate: day(6),
      type: "maintenance_block", status: "active",
    } as any).returning();
    expect(normalizeReservationStatus(block.status)).toBe("picked_up");

    expect((await deleteIt(desk, block.id)).status).toBe(200);

    const [other] = await db.insert(reservations).values({
      customerId: null, vehicleId: vehicle.id, startDate: day(10), endDate: day(11),
      type: "maintenance_block", status: "active",
    } as any).returning();
    expect((await cancelViaStatus(desk, other.id)).status).toBe(200);
  });
});
