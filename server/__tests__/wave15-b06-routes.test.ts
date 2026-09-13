/**
 * WAVE 15 item 1 — besluit **B-06** (BUG-134), the wiring.
 *
 * BUG-134 was never a missing function: `portal-maintenance-events.ts` already
 * proved the notification machinery worked. What was missing is that **no
 * reservation route called anything**. A unit test of the hook would have
 * passed for the whole time the defect existed, so this file drives the real
 * staff routes — `/basic`, `/:id`, `/:id/status`, `DELETE /:id` and the
 * document write — and looks for the row in `portal_notifications` afterwards.
 *
 * The hooks are fire-and-forget on purpose (a notification may not hold up a
 * staff response), so the assertion polls rather than reads once.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { and, eq, inArray } from "drizzle-orm";

import { db } from "../db";
import {
  customers, portalNotifications, portalUsers, portalCustomerSettings, reservations,
} from "../../shared/schema";
import { storage } from "../storage";
import { portalStorage } from "../services/portal-storage";
import { agentFor, cleanupFixtureUsers, type TestAgent } from "./helpers/app";
import { createFixtureCustomer, createFixtureVehicle, createFixtureReservation, cleanupFixtures } from "./helpers/fixtures";
import { withSmtpStub } from "./helpers/smtpStub";

let admin: TestAgent;
let customerId: number;
let vehicleId: number;
let otherVehicleId: number;

beforeAll(async () => {
  admin = await agentFor("admin");
  const customer = await createFixtureCustomer("W15routes");
  customerId = customer.id;
  await db.update(customers).set({ email: `w15routes-${customerId}@fixture-test.invalid` })
    .where(eq(customers.id, customerId));
  await portalStorage.createPortalUser(
    { customerId, email: `w15routes-login-${customerId}@fixture-test.invalid`, fullName: "Klant", role: "admin" }, "t",
  );
  vehicleId = (await createFixtureVehicle()).id;
  otherVehicleId = (await createFixtureVehicle()).id;
}, 60_000);

afterAll(async () => {
  await db.delete(portalNotifications).where(eq(portalNotifications.customerId, customerId));
  await db.delete(portalUsers).where(eq(portalUsers.customerId, customerId));
  await db.delete(portalCustomerSettings).where(eq(portalCustomerSettings.customerId, customerId));
  await cleanupFixtures();
  await cleanupFixtureUsers();
});

/** The hooks do not block the response, so give the write a moment to land. */
async function waitForNotification(type: string, link: string, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const rows = await db.select().from(portalNotifications).where(and(
      eq(portalNotifications.customerId, customerId),
      eq(portalNotifications.type, type),
      eq(portalNotifications.link, link),
    ));
    if (rows.length > 0 || Date.now() > deadline) return rows;
    await new Promise((r) => setTimeout(r, 100));
  }
}

const rental = async (startDate = "2027-03-10", endDate = "2027-03-15") =>
  createFixtureReservation({ customerId, vehicleId, startDate, endDate, status: "booked" });

describe("B-06 — de reserveringsroutes roepen de melding ook echt aan", () => {
  it("PATCH /api/reservations/:id/basic met andere datums meldt het de klant", async () => {
    const row = await rental("2027-03-10", "2027-03-15");

    await withSmtpStub("ok", async () => {
      const res = await admin.patch(`/api/reservations/${row.id}/basic`)
        .send({ startDate: "2027-03-12", endDate: "2027-03-18" });
      expect(res.status, JSON.stringify(res.body)).toBe(200);
    });

    const rows = await waitForNotification("reservation_changed", `/reserveringen/${row.id}`);
    expect(rows).toHaveLength(1);
    expect(rows[0].description).toContain("12-03-2027");
  }, 60_000);

  it("PATCH /api/reservations/:id met een andere auto meldt het de klant", async () => {
    const row = await rental("2027-04-10", "2027-04-15");

    await withSmtpStub("ok", async () => {
      const res = await admin.patch(`/api/reservations/${row.id}`).send({ vehicleId: otherVehicleId });
      expect(res.status, JSON.stringify(res.body)).toBe(200);
    });

    const rows = await waitForNotification("reservation_changed", `/reserveringen/${row.id}`);
    expect(rows).toHaveLength(1);
  }, 60_000);

  it("PATCH /api/reservations/:id/status naar cancelled meldt het de klant", async () => {
    const row = await rental("2027-05-10", "2027-05-15");

    await withSmtpStub("ok", async () => {
      const res = await admin.patch(`/api/reservations/${row.id}/status`).send({ status: "cancelled" });
      expect(res.status, JSON.stringify(res.body)).toBe(200);
    });

    const rows = await waitForNotification("reservation_cancelled", `/reserveringen/${row.id}`);
    expect(rows).toHaveLength(1);
    expect(rows[0].description).toContain("geannuleerd");
  }, 60_000);

  it("DELETE /api/reservations/:id meldt het de klant als een annulering", async () => {
    const row = await rental("2027-06-10", "2027-06-15");

    await withSmtpStub("ok", async () => {
      const res = await admin.delete(`/api/reservations/${row.id}`);
      expect(res.status, JSON.stringify(res.body)).toBe(200);
    });

    const rows = await waitForNotification("reservation_cancelled", `/reserveringen/${row.id}`);
    expect(rows).toHaveLength(1);
  }, 60_000);

  it("een document dat via de opslaglaag wordt weggeschreven meldt het de klant", async () => {
    const row = await rental("2027-07-10", "2027-07-15");

    await withSmtpStub("ok", async () => {
      await storage.createDocument({
        vehicleId, reservationId: row.id, documentType: "Contract (Unsigned)",
        fileName: `w15-contract-${row.id}.pdf`, filePath: `uploads/FIXT/w15-${row.id}.pdf`,
        fileSize: 3, contentType: "application/pdf",
      } as any);
      // The hook runs off the write; wait inside the stub so the mail lands here.
      await waitForNotification("document_available", "/documenten");
    });

    const rows = await db.select().from(portalNotifications).where(and(
      eq(portalNotifications.customerId, customerId),
      eq(portalNotifications.type, "document_available"),
    ));
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows.some((r) => r.description.includes(`w15-contract-${row.id}.pdf`))).toBe(true);
  }, 60_000);

  it("een medewerkersnotitie is geen kantoorwijziging", async () => {
    const row = await rental("2027-08-10", "2027-08-15");

    await withSmtpStub("ok", async () => {
      const res = await admin.patch(`/api/reservations/${row.id}/basic`).send({ notes: "interne notitie" });
      expect(res.status, JSON.stringify(res.body)).toBe(200);
    });

    // Nothing to wait for: give the (absent) hook the same chance as the others.
    await new Promise((r) => setTimeout(r, 500));
    const rows = await db.select().from(portalNotifications).where(and(
      eq(portalNotifications.customerId, customerId),
      eq(portalNotifications.link, `/reserveringen/${row.id}`),
    ));
    expect(rows).toHaveLength(0);
  }, 60_000);
});

describe("B-06 — een klant zonder portaalaccount krijgt niets", () => {
  it("annuleren van de reservering van zo'n klant schrijft geen melding", async () => {
    const offline = await createFixtureCustomer("W15offline");
    const vehicle = await createFixtureVehicle();
    const row = await createFixtureReservation({
      customerId: offline.id, vehicleId: vehicle.id,
      startDate: "2027-09-10", endDate: "2027-09-15", status: "booked",
    });

    await withSmtpStub("ok", async () => {
      const res = await admin.patch(`/api/reservations/${row.id}/status`).send({ status: "cancelled" });
      expect(res.status, JSON.stringify(res.body)).toBe(200);
    });
    await new Promise((r) => setTimeout(r, 500));

    const rows = await db.select().from(portalNotifications)
      .where(eq(portalNotifications.customerId, offline.id));
    expect(rows).toHaveLength(0);

    await db.delete(reservations).where(inArray(reservations.id, [row.id]));
  }, 60_000);
});
