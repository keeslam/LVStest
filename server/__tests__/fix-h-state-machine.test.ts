/**
 * FIX-H — one owner for the reservation and vehicle state machines.
 *
 * The transition table existed and was enforced by 1 of 5 writers;
 * `availability_status` had three unrelated writers. This file is the cluster's
 * acceptance criterion: a table-driven matrix over every write path, plus the
 * four behavioural corrections that ride along.
 *
 *   BUG-016 — `PATCH /:id` and `/basic` persist `status:"garbage"` and jump
 *             `booked → completed` in one step.
 *   BUG-019 — completing/returning overwrites `endDate` with today, so
 *             `end < start`.
 *   BUG-021 — `availabilityStatus:"banana_not_real"` is accepted and stored.
 *   BUG-036 — `spare-status` does not check the reservation type.
 *   BUG-109 — a vehicle in the workshop goes out to a customer; the manual
 *             `needs_fixing` does not survive the rental cycle (besluiten B-03).
 *   BUG-113 — a normally returned rental blocks the vehicle after three days
 *             (besluiten B-02).
 *   BUG-120 — pickup writes the reservation before the vehicle check, so a
 *             refusal leaves `picked_up` and a burnt contract number.
 *   BUG-128 — reverting a status wipes the planned `endDate`.
 *   BUG-129 — legacy statuses (`active`, `pending`) cannot be closed.
 *   BUG-130 — after "mark completed" the vehicle stays `rented`.
 *   BUG-146 — the manual-status warning never reaches the client.
 *   BUG-211 — a rental picked up before its start date leaves the vehicle
 *             `available` (the T-half; the block/shift choice stays open).
 *   BUG-217 — `GET /api/vehicles` runs the status sync (up to 3 UPDATEs).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "../db";
import { reservations, vehicles as vehiclesTable } from "../../shared/schema";
import { agentFor, cleanupFixtureUsers, type TestAgent } from "./helpers/app";
import {
  createFixtureCustomer, createFixtureVehicle, createFixtureReservation, cleanupFixtures,
} from "./helpers/fixtures";
import {
  deriveVehicleAvailability, assertReservationTransition, assertReservationStatusValue,
  normalizeReservationStatus, StateTransitionError, decideHandover, WorkshopBlockedError,
} from "../services/lifecycle";

let admin: TestAgent;
let customerId: number;

beforeAll(async () => {
  admin = await agentFor("admin");
  customerId = (await createFixtureCustomer("Lifecycle")).id;
});

afterAll(async () => {
  await cleanupFixtures();
  await cleanupFixtureUsers();
});

function day(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().split("T")[0];
}

async function rowOf(id: number) {
  const [row] = await db.select().from(reservations).where(eq(reservations.id, id));
  return row;
}

async function vehicleRow(id: number) {
  const [row] = await db.select().from(vehiclesTable).where(eq(vehiclesTable.id, id));
  return row;
}

/* ================================================================== *
 * 1. The pure state machine
 * ================================================================== */

describe("FIX-H — the transition table itself", () => {
  it("rejects every value outside the enum (BUG-016)", () => {
    for (const bogus of ["garbage", "", "BOOKED!", "picked-up", null, 7, undefined]) {
      expect(() => assertReservationStatusValue(bogus as unknown)).toThrow(StateTransitionError);
    }
  });

  it("maps the legacy statuses onto the machine instead of stranding them (BUG-129)", () => {
    expect(normalizeReservationStatus("active")).toBe("picked_up");
    expect(normalizeReservationStatus("pending")).toBe("booked");
    expect(normalizeReservationStatus("confirmed")).toBe("booked");
    // …so an `active` maintenance block can be completed, which it could not before.
    expect(() => assertReservationTransition("active", "completed")).not.toThrow();
  });

  it("refuses the illegal jumps and allows the legal ones", () => {
    const illegal: Array<[string, string]> = [
      ["booked", "completed"],
      ["booked", "returned"],
      ["completed", "picked_up"],
      ["completed", "cancelled"],
      ["cancelled", "booked"],
    ];
    for (const [from, to] of illegal) {
      expect(() => assertReservationTransition(from, to)).toThrow(StateTransitionError);
    }
    const legal: Array<[string, string]> = [
      ["booked", "picked_up"],
      ["booked", "cancelled"],
      ["picked_up", "completed"],
      ["picked_up", "cancelled"],
      ["returned", "completed"],
    ];
    for (const [from, to] of legal) {
      expect(() => assertReservationTransition(from, to)).not.toThrow();
    }
  });

  it("still allows the documented undo steps, but only when asked", () => {
    expect(() => assertReservationTransition("completed", "picked_up")).toThrow();
    expect(() => assertReservationTransition("completed", "picked_up", { allowReversion: true })).not.toThrow();
  });
});

describe("FIX-H — derived vehicle availability (one writer)", () => {
  const today = "2026-06-15";

  it("keeps a deliberate not_for_rental whatever the reservations say (BUG-109)", () => {
    expect(deriveVehicleAvailability({
      currentStatus: "not_for_rental",
      maintenanceStatus: "ok",
      today,
      reservations: [{ status: "picked_up", type: "standard", startDate: today, endDate: today }],
    })).toBe("not_for_rental");
  });

  it("keeps the workshop flag through a rental cycle (besluiten B-03)", () => {
    expect(deriveVehicleAvailability({
      currentStatus: "rented",
      maintenanceStatus: "in_service",
      today,
      reservations: [{ status: "completed", type: "standard", startDate: today, endDate: today }],
    })).toBe("needs_fixing");
  });

  it("counts a picked_up rental whatever its dates say (BUG-211)", () => {
    expect(deriveVehicleAvailability({
      currentStatus: "available",
      maintenanceStatus: "ok",
      today,
      reservations: [{ status: "picked_up", type: "standard", startDate: "2026-10-20", endDate: "2026-10-25" }],
    })).toBe("rented");
  });

  it("releases a vehicle whose rental is completed, down to scheduled (BUG-130)", () => {
    expect(deriveVehicleAvailability({
      currentStatus: "rented",
      maintenanceStatus: "ok",
      today,
      reservations: [
        { status: "completed", type: "standard", startDate: "2026-06-13", endDate: "2026-06-16" },
        { status: "booked", type: "standard", startDate: "2026-06-25", endDate: "2026-06-27" },
      ],
    })).toBe("scheduled");
    expect(deriveVehicleAvailability({
      currentStatus: "rented",
      maintenanceStatus: "ok",
      today,
      reservations: [{ status: "completed", type: "standard", startDate: "2026-06-13", endDate: "2026-06-16" }],
    })).toBe("available");
  });

  it("treats a normally returned rental as closed (besluiten B-02)", () => {
    expect(deriveVehicleAvailability({
      currentStatus: "rented",
      maintenanceStatus: "ok",
      today,
      reservations: [{ status: "returned", type: "standard", startDate: "2026-06-01", endDate: "2026-06-10" }],
    })).toBe("available");
  });
});

describe("FIX-H — the handover gate (besluiten B-03)", () => {
  it("refuses a vehicle in the workshop", () => {
    expect(() => decideHandover({ availabilityStatus: "available", maintenanceStatus: "in_service" }))
      .toThrow(WorkshopBlockedError);
    expect(() => decideHandover({ availabilityStatus: "needs_fixing", maintenanceStatus: "ok" }))
      .toThrow(WorkshopBlockedError);
    expect(() => decideHandover({ availabilityStatus: "not_for_rental", maintenanceStatus: "ok" }))
      .toThrow(WorkshopBlockedError);
  });

  it("lets an administrator force it with a reason, and nobody else", () => {
    const blocked = { availabilityStatus: "available", maintenanceStatus: "in_service" };
    expect(() => decideHandover(blocked, { force: true, isAdmin: false, reason: "klant wacht" }))
      .toThrow(StateTransitionError);
    expect(() => decideHandover(blocked, { force: true, isAdmin: true, reason: "" }))
      .toThrow(StateTransitionError);
    const ok = decideHandover(blocked, { force: true, isAdmin: true, reason: "klant wacht, APK morgen", username: "chef" });
    expect(ok.allowed).toBe(true);
    expect(ok.overrideNote).toContain("klant wacht");
  });

  it("lets a healthy vehicle through", () => {
    expect(decideHandover({ availabilityStatus: "available", maintenanceStatus: "ok" }).allowed).toBe(true);
  });
});

/* ================================================================== *
 * 2. Every write path
 * ================================================================== */

describe("FIX-H — every status write path is gated", () => {
  it("PATCH /:id refuses a value outside the enum and changes nothing (BUG-016)", async () => {
    const vehicle = await createFixtureVehicle();
    const r = await createFixtureReservation({ customerId, vehicleId: vehicle.id });

    const res = await admin.patch(`/api/reservations/${r.id}`).send({ status: "garbage" });
    expect(res.status).toBe(400);
    expect((await rowOf(r.id)).status).toBe("booked");
  });

  it("PATCH /:id refuses an illegal jump (BUG-016)", async () => {
    const vehicle = await createFixtureVehicle();
    const r = await createFixtureReservation({ customerId, vehicleId: vehicle.id });

    const res = await admin.patch(`/api/reservations/${r.id}`).send({ status: "completed" });
    expect(res.status).toBe(400);
    expect((await rowOf(r.id)).status).toBe("booked");
  });

  it("PATCH /:id/basic refuses both, and changes nothing (BUG-016)", async () => {
    const vehicle = await createFixtureVehicle();
    const r = await createFixtureReservation({ customerId, vehicleId: vehicle.id });

    expect((await admin.patch(`/api/reservations/${r.id}/basic`).send({ status: "garbage" })).status).toBe(400);
    expect((await admin.patch(`/api/reservations/${r.id}/basic`).send({ status: "completed" })).status).toBe(400);
    expect((await rowOf(r.id)).status).toBe("booked");
  });

  it("PATCH /:id/status still accepts a legal transition", async () => {
    const vehicle = await createFixtureVehicle();
    // A rental whose period has started: BUG-144 refuses `picked_up` on one
    // that has not, so the dates are what make this a *legal* transition.
    const r = await createFixtureReservation({
      customerId, vehicleId: vehicle.id, startDate: day(-1), endDate: day(3),
    });

    const res = await admin.patch(`/api/reservations/${r.id}/status`).send({ status: "picked_up" });
    expect(res.status).toBe(200);
    expect((await rowOf(r.id)).status).toBe("picked_up");
  });

  it("a legacy `active` block can finally be closed (BUG-129)", async () => {
    const vehicle = await createFixtureVehicle();
    const block = await createFixtureReservation({
      customerId: null, vehicleId: vehicle.id, type: "maintenance_block", status: "active",
    });

    const res = await admin.patch(`/api/reservations/${block.id}/status`).send({ status: "completed" });
    expect(res.status).toBe(200);
    expect((await rowOf(block.id)).status).toBe("completed");
  });
});

describe("FIX-H — the four behavioural corrections", () => {
  it("completing a reservation never rewrites endDate (BUG-019, BUG-128)", async () => {
    const vehicle = await createFixtureVehicle();
    // Running, not future: BUG-144 refuses a pickup before the period starts.
    const r = await createFixtureReservation({
      customerId, vehicleId: vehicle.id, startDate: day(-2), endDate: day(5),
    });

    expect((await admin.patch(`/api/reservations/${r.id}/status`).send({ status: "picked_up" })).status).toBe(200);
    expect((await admin.patch(`/api/reservations/${r.id}/status`).send({ status: "completed" })).status).toBe(200);

    const row = await rowOf(r.id);
    expect(row.endDate).toBe(day(5));
    expect(row.endDate! >= row.startDate).toBe(true);
  });

  it("a return closes the rental and frees the vehicle immediately (besluiten B-02, BUG-113)", async () => {
    const vehicle = await createFixtureVehicle();
    const r = await createFixtureReservation({
      customerId, vehicleId: vehicle.id, startDate: day(-10), endDate: day(-6),
    });

    expect((await admin.post(`/api/reservations/${r.id}/pickup`).send({
      contractNumber: `FIXT-H-${Date.now()}`, pickupMileage: 1000, fuelLevelPickup: "full", pickupDate: day(-10),
    })).status).toBe(200);

    const ret = await admin.post(`/api/reservations/${r.id}/return`).send({
      returnMileage: 1200, fuelLevelReturn: "full", returnDate: day(-5),
    });
    expect(ret.status).toBe(200);

    const row = await rowOf(r.id);
    // B-02: the return closes the rental outright.
    expect(row.status).toBe("completed");
    // BUG-019: the planned end is not rewritten to the return day.
    expect(row.endDate).toBe(day(-6));
    expect(row.actualReturnDate).toBe(day(-5));

    // BUG-113: the vehicle is bookable again, with no overdue 409 in the way.
    const book = await admin.post("/api/reservations").send({
      customerId, vehicleId: vehicle.id, startDate: day(30), endDate: day(32), type: "standard",
    });
    expect(book.status).toBe(201);
  });

  it("a failed pickup leaves the reservation untouched (BUG-120)", async () => {
    const vehicle = await createFixtureVehicle({ availabilityStatus: "not_for_rental" });
    const r = await createFixtureReservation({ customerId, vehicleId: vehicle.id, startDate: day(0), endDate: day(2) });
    const contract = `FIXT-H-FAIL-${Date.now()}`;

    const res = await admin.post(`/api/reservations/${r.id}/pickup`).send({
      contractNumber: contract, pickupMileage: 5000, fuelLevelPickup: "full",
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);

    const row = await rowOf(r.id);
    expect(row.status).toBe("booked");
    expect(row.contractNumber).toBeNull();
    expect(row.pickupMileage).toBeNull();
  });

  it("GET /api/vehicles executes no UPDATE on vehicles (BUG-217)", async () => {
    const vehicle = await createFixtureVehicle({ availabilityStatus: "available" });
    await createFixtureReservation({ customerId, vehicleId: vehicle.id, startDate: day(1), endDate: day(3) });

    const before = await vehicleRow(vehicle.id);
    const res = await admin.get("/api/vehicles?search=FIXT");
    expect(res.status).toBe(200);
    const after = await vehicleRow(vehicle.id);

    // The read path no longer rewrites the column, so the row is byte-identical.
    expect(after.availabilityStatus).toBe(before.availabilityStatus);
    expect(after.updatedAt?.getTime()).toBe(before.updatedAt?.getTime());
  });
});

describe("FIX-H — the vehicle status machine", () => {
  it("refuses an availabilityStatus outside the enum (BUG-021)", async () => {
    const vehicle = await createFixtureVehicle();
    const res = await admin.patch(`/api/vehicles/${vehicle.id}`).send({ availabilityStatus: "banana_not_real" });
    expect(res.status).toBe(400);
    expect((await vehicleRow(vehicle.id)).availabilityStatus).not.toBe("banana_not_real");
  });

  it("refuses a maintenanceStatus outside the enum", async () => {
    const vehicle = await createFixtureVehicle();
    const res = await admin.patch(`/api/vehicles/${vehicle.id}/maintenance-status`).send({ status: "nonsense" });
    expect(res.status).toBe(400);
  });

  it("returns the manual-status warning to the client (BUG-146)", async () => {
    const vehicle = await createFixtureVehicle();
    await createFixtureReservation({ customerId, vehicleId: vehicle.id, startDate: day(1), endDate: day(3) });

    const res = await admin.patch(`/api/vehicles/${vehicle.id}`).send({ availabilityStatus: "needs_fixing" });
    expect(res.status).toBe(200);
    expect(typeof res.body.warning).toBe("string");
    expect(res.body.warning.length).toBeGreaterThan(0);
  });

  it("blocks the handover of a workshop vehicle on BOTH write paths (BUG-109, besluiten B-03)", async () => {
    const vehicle = await createFixtureVehicle();
    const r = await createFixtureReservation({ customerId, vehicleId: vehicle.id, startDate: day(0), endDate: day(3) });

    expect((await admin.patch(`/api/vehicles/${vehicle.id}/maintenance-status`)
      .send({ status: "in_service", note: "in de werkplaats" })).status).toBe(200);

    const viaPickup = await admin.post(`/api/reservations/${r.id}/pickup`).send({
      contractNumber: `FIXT-H-WS-${Date.now()}`, pickupMileage: 100, fuelLevelPickup: "full",
    });
    expect(viaPickup.status).toBe(409);
    expect(viaPickup.body.code).toBe("VEHICLE_IN_WORKSHOP");

    const viaStatus = await admin.patch(`/api/reservations/${r.id}/status`).send({ status: "picked_up" });
    expect(viaStatus.status).toBe(409);
    expect((await rowOf(r.id)).status).toBe("booked");
  });

  it("an administrator can force it with a reason, and the flag survives the return (besluiten B-03)", async () => {
    const vehicle = await createFixtureVehicle();
    const r = await createFixtureReservation({ customerId, vehicleId: vehicle.id, startDate: day(0), endDate: day(3) });
    await admin.patch(`/api/vehicles/${vehicle.id}/maintenance-status`).send({ status: "in_service", note: "werkplaats" });

    const forced = await admin.post(`/api/reservations/${r.id}/pickup`).send({
      contractNumber: `FIXT-H-FORCE-${Date.now()}`,
      pickupMileage: 100,
      fuelLevelPickup: "full",
      forceWorkshopOverride: true,
      forceWorkshopReason: "klant staat aan de balie, APK is morgen",
    });
    expect(forced.status).toBe(200);

    const ret = await admin.post(`/api/reservations/${r.id}/return`).send({
      returnMileage: 300, fuelLevelReturn: "full",
    });
    expect(ret.status).toBe(200);

    const v = await vehicleRow(vehicle.id);
    expect(v.maintenanceStatus).toBe("in_service");
    expect(v.availabilityStatus).toBe("needs_fixing");
  });

  it("spare-status refuses a reservation that is not a replacement (BUG-036)", async () => {
    const vehicle = await createFixtureVehicle();
    const r = await createFixtureReservation({ customerId, vehicleId: vehicle.id });

    const res = await admin.patch(`/api/reservations/${r.id}/spare-status`).send({ spareVehicleStatus: "ready" });
    expect(res.status).toBe(400);
    const [row] = await db.select({ s: reservations.spareVehicleStatus })
      .from(reservations).where(eq(reservations.id, r.id));
    expect(row.s).not.toBe("ready");
  });
});

describe("FIX-H — the historical `returned` rows", () => {
  it("the bulk-close maintenance script closes them and nothing else", async () => {
    const { closeReturnedReservations } = await import("../../scripts/close-returned-reservations");
    const vehicle = await createFixtureVehicle();
    const stale = await createFixtureReservation({
      customerId, vehicleId: vehicle.id, startDate: day(-20), endDate: day(-15), status: "returned",
    });
    const live = await createFixtureReservation({
      customerId, vehicleId: vehicle.id, startDate: day(40), endDate: day(45), status: "booked",
    });

    const result = await closeReturnedReservations({ dryRun: false });
    expect(result.closed).toBeGreaterThanOrEqual(1);

    expect((await rowOf(stale.id)).status).toBe("completed");
    expect((await rowOf(live.id)).status).toBe("booked");

    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` })
      .from(reservations)
      .where(and(eq(reservations.status, "returned"), isNull(reservations.deletedAt)));
    expect(n).toBe(0);
  });
});
