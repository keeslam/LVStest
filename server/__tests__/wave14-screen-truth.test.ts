/**
 * PHASE 57 / WAVE 14 — the two defects a human only sees by operating a screen.
 *
 * **Item 1 — the APK reminder window lies about who gets the mail.**
 * Wave 11 made `POST /api/notifications/send` obey besluiten **B-24**: the
 * recipient is the customer of the running or next reservation, and when the
 * car is not rented out only the office is notified. The window in front of it
 * was never changed. It still asked
 * `GET /api/vehicles/:id/customers-with-reservations`, which walked *every*
 * reservation the plate ever had, and printed that list under the sentence
 * "Verstuur een APK-keuringsherinnering naar klanten die dit voertuig hebben
 * gehuurd". On vehicle 21 in the regression clone that was five customers —
 * two of them rentals closed in March and May — while the server was only ever
 * going to mail one of them. The screen has to answer the question it is
 * really asking: *who will receive it?*
 *
 * **Item 2 — "Terugzetten" in "Geschiedenis voltooide verhuur" is dead.**
 * The button PATCHed `/api/reservations/:id`, which calls
 * `assertReservationTransition` **without** `allowReversion`, so
 * `completed -> picked_up` was refused every time and the employee only ever
 * saw "Verhuur terugzetten mislukt". `completed -> picked_up` is in
 * `RESERVATION_REVERSIONS` and `/api/reservations/:id/status` has always
 * allowed it; the dialog's own subtitle ("Bekijk, herstel of verwijder") says
 * restoring is meant to work. So the button was pointed at the endpoint that
 * owns reversions — and that endpoint now clears the return data on the way
 * back, which previously only happened for the legacy `returned` status.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";

import { db } from "../db";
import { customers, reservations, vehicles as vehiclesTable } from "../../shared/schema";
import { agentFor, cleanupFixtureUsers, type TestAgent } from "./helpers/app";
import {
  createFixtureCustomer, createFixtureVehicle, createFixtureReservation, cleanupFixtures,
} from "./helpers/fixtures";

let admin: TestAgent;

beforeAll(async () => {
  admin = await agentFor("admin");
}, 60_000);

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

async function customerWithEmail(label: string): Promise<number> {
  const row = await createFixtureCustomer(label);
  await db.update(customers)
    .set({ email: `w14-${row.id}@fixture-test.invalid` })
    .where(eq(customers.id, row.id));
  return row.id;
}

/* ================================================================== *
 * Item 1 — the window shows the recipient, not the plate's history
 * ================================================================== */

describe("WAVE 14 item 1 — het APK-herinneringsvenster noemt de echte ontvanger", () => {
  it("lists the current renter only, not everyone who ever had the plate", async () => {
    const vehicle = await createFixtureVehicle({ availabilityStatus: "available" });

    const longAgo = await customerWithEmail("ApkOud");
    const now = await customerWithEmail("ApkNu");
    const nextYear = await customerWithEmail("ApkStraks");

    // The three rentals PHASE 57 saw side by side in the window.
    await createFixtureReservation({
      customerId: longAgo, vehicleId: vehicle.id,
      startDate: day(-900), endDate: day(-890), status: "completed",
    });
    const running = await createFixtureReservation({
      customerId: now, vehicleId: vehicle.id,
      startDate: day(-2), endDate: day(5), status: "picked_up",
    });
    await createFixtureReservation({
      customerId: nextYear, vehicleId: vehicle.id,
      startDate: day(400), endDate: day(410), status: "booked",
    });

    const res = await admin.get(`/api/vehicles/${vehicle.id}/customers-with-reservations`);
    expect(res.status).toBe(200);

    const body = res.body as Array<{ customer: { id: number }; reservation: { id: number } }>;
    expect(body).toHaveLength(1);
    expect(body[0].customer.id).toBe(now);
    expect(body[0].reservation.id).toBe(running.id);

    const listed = body.map((row) => row.customer.id);
    expect(listed).not.toContain(longAgo);
    expect(listed).not.toContain(nextYear);
  });

  it("falls back to the next rental when the car is between customers", async () => {
    const vehicle = await createFixtureVehicle({ availabilityStatus: "available" });
    const past = await customerWithEmail("ApkVerleden");
    const soon = await customerWithEmail("ApkBinnenkort");

    await createFixtureReservation({
      customerId: past, vehicleId: vehicle.id,
      startDate: day(-40), endDate: day(-30), status: "completed",
    });
    await createFixtureReservation({
      customerId: soon, vehicleId: vehicle.id,
      startDate: day(9), endDate: day(14), status: "booked",
    });

    const res = await admin.get(`/api/vehicles/${vehicle.id}/customers-with-reservations`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].customer.id).toBe(soon);
  });

  it("says nobody at all when the car is not rented out (B-24: only the office)", async () => {
    const vehicle = await createFixtureVehicle({ availabilityStatus: "available" });
    const past = await customerWithEmail("ApkLeeg");
    await createFixtureReservation({
      customerId: past, vehicleId: vehicle.id,
      startDate: day(-60), endDate: day(-50), status: "completed",
    });

    const res = await admin.get(`/api/vehicles/${vehicle.id}/customers-with-reservations`);
    expect(res.status).toBe(200);
    // An empty list is what the window renders its "alleen naar kantoor" notice
    // from, so it must mean exactly that — never "we have no history".
    expect(res.body).toEqual([]);
  });

  it("does not offer a renter the mail cannot reach — that one is the office's problem", async () => {
    const vehicle = await createFixtureVehicle({ availabilityStatus: "available" });
    const unreachable = await createFixtureCustomer("ApkGeenMail");
    await db.update(customers)
      .set({ email: null, emailGeneral: null, emailForMOT: null, emailForInvoices: null })
      .where(eq(customers.id, unreachable.id));

    await createFixtureReservation({
      customerId: unreachable.id, vehicleId: vehicle.id,
      startDate: day(-1), endDate: day(4), status: "picked_up",
    });

    const res = await admin.get(`/api/vehicles/${vehicle.id}/customers-with-reservations`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("never counts a maintenance block as a renter", async () => {
    const vehicle = await createFixtureVehicle({ availabilityStatus: "available" });
    await createFixtureReservation({
      vehicleId: vehicle.id, customerId: null,
      startDate: day(-1), endDate: day(3), status: "booked", type: "maintenance_block",
    });

    const res = await admin.get(`/api/vehicles/${vehicle.id}/customers-with-reservations`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

/* ================================================================== *
 * Item 2 — "Terugzetten" actually puts the rental back
 * ================================================================== */

describe("WAVE 14 item 2 — Terugzetten zet een voltooide verhuur terug", () => {
  async function completedRental(vehicleId: number, customerId: number) {
    const r = await createFixtureReservation({
      customerId, vehicleId, startDate: day(-10), endDate: day(-3), status: "picked_up",
    });
    await db.update(reservations).set({
      status: "completed",
      actualReturnDate: day(-3),
      returnMileage: 41000,
      fuelLevelReturn: "Full",
      fuelCost: "42.50",
      fuelNotes: "vol getankt",
      completionDate: day(-3),
    }).where(eq(reservations.id, r.id));
    return r.id;
  }

  it("the endpoint the button used refuses the reversion — that is the bug", async () => {
    const vehicle = await createFixtureVehicle({ availabilityStatus: "available" });
    const customerId = (await createFixtureCustomer("Terug1")).id;
    const id = await completedRental(vehicle.id, customerId);

    // `PATCH /api/reservations/:id` runs the transition table without
    // `allowReversion`; `completed` has no forward moves at all.
    const res = await admin.patch(`/api/reservations/${id}`).send({ status: "picked_up" });
    expect(res.status).toBe(400);
    expect((await rowOf(id)).status).toBe("completed");
  });

  it("the status endpoint puts it back and wipes the return that never happened", async () => {
    const vehicle = await createFixtureVehicle({ availabilityStatus: "available" });
    const customerId = (await createFixtureCustomer("Terug2")).id;
    const id = await completedRental(vehicle.id, customerId);

    const res = await admin.patch(`/api/reservations/${id}/status`).send({ status: "picked_up" });
    expect(res.status).toBe(200);

    const row = await rowOf(id);
    expect(row.status).toBe("picked_up");
    // The return data belongs to the return that is being undone.
    expect(row.actualReturnDate).toBeNull();
    expect(row.returnMileage).toBeNull();
    expect(row.fuelLevelReturn).toBeNull();
    expect(row.fuelCost).toBeNull();
    expect(row.fuelNotes).toBeNull();
    expect(row.completionDate).toBeNull();
    // BUG-128b: the planned period is not return data and must survive.
    expect(row.startDate).toBe(day(-10));
    expect(row.endDate).toBe(day(-3));
  });

  it("still works when the car was flagged for the workshop after the wrong return", async () => {
    // The realistic sequence behind handleiding §11.13: the employee returns the
    // wrong rental, somebody marks the car `needs_fixing`, and only then is the
    // mistake noticed. B-03's hand-over gate is about giving a car out; undoing
    // a return gives nothing out, so it must not block the correction.
    const vehicle = await createFixtureVehicle({ availabilityStatus: "needs_fixing" });
    const customerId = (await createFixtureCustomer("Terug3")).id;
    const id = await completedRental(vehicle.id, customerId);

    const res = await admin.patch(`/api/reservations/${id}/status`).send({ status: "picked_up" });
    expect(res.status).toBe(200);
    expect((await rowOf(id)).status).toBe("picked_up");
    // And the workshop flag itself is nobody's to clear here (besluiten B-03).
    const [v] = await db.select().from(vehiclesTable).where(eq(vehiclesTable.id, vehicle.id));
    expect(v.availabilityStatus).toBe("needs_fixing");
  });

  it("does not ask the early-pickup question while undoing (besluiten B-16 is about pickups)", async () => {
    // A rental that was closed before it started: undoing it must not move the
    // period to today, and must not answer 409 PICKUP_BEFORE_START_DATE.
    const vehicle = await createFixtureVehicle({ availabilityStatus: "available" });
    const customerId = (await createFixtureCustomer("Terug4")).id;
    const r = await createFixtureReservation({
      customerId, vehicleId: vehicle.id, startDate: day(20), endDate: day(25), status: "booked",
    });
    await db.update(reservations).set({ status: "completed", completionDate: day(0) })
      .where(eq(reservations.id, r.id));

    const res = await admin.patch(`/api/reservations/${r.id}/status`).send({ status: "picked_up" });
    expect(res.status).toBe(200);

    const row = await rowOf(r.id);
    expect(row.status).toBe("picked_up");
    expect(row.startDate).toBe(day(20));
  });

  it("a forward pickup still meets the workshop gate — the reversion carve-out is narrow", async () => {
    const vehicle = await createFixtureVehicle({ availabilityStatus: "needs_fixing" });
    const customerId = (await createFixtureCustomer("Terug5")).id;
    const r = await createFixtureReservation({
      customerId, vehicleId: vehicle.id, startDate: day(-1), endDate: day(3), status: "booked",
    });

    const res = await admin.patch(`/api/reservations/${r.id}/status`).send({ status: "picked_up" });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect((await rowOf(r.id)).status).toBe("booked");
  });
});
