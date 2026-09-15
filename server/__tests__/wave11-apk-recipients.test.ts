/**
 * WAVE 11 — besluit **B-24** (BUG-170): an APK reminder goes to the customer
 * who has the car now.
 *
 * Phase 36 sent one APK reminder for one vehicle and the SMTP stub caught
 * **three** messages: the current holder, somebody who rented the car in 2021,
 * and somebody whose rental starts in July 2027.
 * `server/routes/notifications.ts` joined vehicle → reservation → customer
 * with no filter on status or date and no de-duplication.
 *
 * B-24: "alleen de huidige huurder, dat wil zeggen de klant van de lopende of
 * eerstvolgende reservering op dat voertuig. Staat de auto leeg, dan gaat er
 * alleen een melding naar kantoor. Nooit meer naar iedereen die ooit op dat
 * kenteken heeft gehuurd."
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { isoDay } from "./helpers/dates";
import { eq, like } from "drizzle-orm";

import { db } from "../db";
import { customers, emailLogs } from "../../shared/schema";
import { agentFor, cleanupFixtureUsers, type TestAgent } from "./helpers/app";
import {
  createFixtureCustomer, createFixtureVehicle, createFixtureReservation, cleanupFixtures,
} from "./helpers/fixtures";
import { withSmtpStub } from "./helpers/smtpStub";
import { currentRenterReservation } from "../services/vehicle-notification-recipients";

let admin: TestAgent;

beforeAll(async () => {
  admin = await agentFor("admin");
}, 60_000);

afterAll(async () => {
  await db.delete(emailLogs).where(like(emailLogs.subject, "APK%"));
  await cleanupFixtures();
  await cleanupFixtureUsers();
});

/** The stub records the raw `RCPT TO:<addr>` line; this is the address in it. */
function addressOf(rcpt: string): string {
  const m = /<([^>]+)>/.exec(rcpt);
  return (m ? m[1] : rcpt).trim().toLowerCase();
}

function day(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return isoDay(d);
}

async function customerWithEmail(label: string): Promise<{ id: number; email: string }> {
  const row = await createFixtureCustomer(label);
  const email = `${label.toLowerCase()}-${row.id}@fixture-test.invalid`;
  await db.update(customers).set({ email, emailForMOT: email }).where(eq(customers.id, row.id));
  return { id: row.id, email };
}

describe("B-24 — who gets a vehicle reminder", () => {
  it("only the current renter, never the one from years ago or the one from next year", async () => {
    const vehicle = await createFixtureVehicle({ apkDate: day(20) });
    const past = await customerWithEmail("B24past");
    const now = await customerWithEmail("B24now");
    const later = await customerWithEmail("B24later");

    await createFixtureReservation({
      customerId: past.id, vehicleId: vehicle.id,
      startDate: day(-400), endDate: day(-380), status: "completed",
    });
    await createFixtureReservation({
      customerId: now.id, vehicleId: vehicle.id,
      startDate: day(-3), endDate: day(10), status: "picked_up",
    });
    await createFixtureReservation({
      customerId: later.id, vehicleId: vehicle.id,
      startDate: day(300), endDate: day(310), status: "booked",
    });

    const picked = await currentRenterReservation(vehicle.id);
    expect(picked?.customerId).toBe(now.id);

    const recipients = await withSmtpStub("ok", async (stub) => {
      const res = await admin
        .post("/api/notifications/send")
        .send({ vehicleIds: [vehicle.id], template: "apk" });
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      return stub.state.messages.flatMap((m) => m.rcptTo.map(addressOf)).sort();
    });

    expect(recipients).toEqual([now.email]);
    expect(recipients.join(" ")).not.toContain(past.email);
    expect(recipients.join(" ")).not.toContain(later.email);
  }, 60_000);

  it("falls back to the next reservation when the car is between rentals", async () => {
    const vehicle = await createFixtureVehicle({ apkDate: day(20) });
    const past = await customerWithEmail("B24gone");
    const next = await customerWithEmail("B24next");

    await createFixtureReservation({
      customerId: past.id, vehicleId: vehicle.id,
      startDate: day(-40), endDate: day(-30), status: "completed",
    });
    await createFixtureReservation({
      customerId: next.id, vehicleId: vehicle.id,
      startDate: day(7), endDate: day(14), status: "booked",
    });

    const recipients = await withSmtpStub("ok", async (stub) => {
      const res = await admin
        .post("/api/notifications/send")
        .send({ vehicleIds: [vehicle.id], template: "apk" });
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      return stub.state.messages.flatMap((m) => m.rcptTo.map(addressOf));
    });

    expect(recipients).toEqual([next.email]);
  }, 60_000);

  it("an unrented car is reported to the office only", async () => {
    const vehicle = await createFixtureVehicle({ apkDate: day(20) });
    const past = await customerWithEmail("B24empty");
    await createFixtureReservation({
      customerId: past.id, vehicleId: vehicle.id,
      startDate: day(-400), endDate: day(-380), status: "completed",
    });

    const captured = await withSmtpStub("ok", async (stub) => {
      const res = await admin
        .post("/api/notifications/send")
        .send({ vehicleIds: [vehicle.id], template: "apk" });
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      return stub.state.messages.map((m) => ({ to: m.rcptTo.map(addressOf).join(","), subject: m.subject ?? "" }));
    });

    expect(captured.length).toBe(1);
    expect(captured[0].to).toBe("noreply@fixture-test.invalid");
    expect(captured[0].to).not.toBe(past.email);
  }, 60_000);
});
