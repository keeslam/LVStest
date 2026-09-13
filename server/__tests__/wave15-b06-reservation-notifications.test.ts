/**
 * WAVE 15 item 1 — besluit **B-06** (BUG-134): the customer hears it from us.
 *
 * B-06 names four events; only the maintenance one was built. Phase 10 moved a
 * portal customer's reservation (+1 day), swapped its vehicle, cancelled it and
 * deleted it, and after every step the number of `portal_notifications` rows for
 * that customer was **unchanged**. The customer found out by opening the portal.
 *
 * This file covers the three that were missing, at the level of the hook the
 * write paths call:
 *   a. the dates or the vehicle changed by staff  -> `reservation_changed`
 *   b. the reservation cancelled (or deleted) by staff -> `reservation_cancelled`
 *   c. a new document available for the customer  -> `document_available`
 *
 * The dedupe tag is the maintenance hook's (`maint:<id>:…`) idea applied to a
 * reservation: the same change saved twice notifies once, and a cancel followed
 * by a delete is one cancellation, not two.
 *
 * The mail is asserted here through the mocked transport; what actually goes
 * over the wire is asserted against the raw-TCP SMTP stub in
 * `wave15-b06-portal-mail.test.ts`.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
const { sendEmail } = vi.hoisted(() => ({ sendEmail: vi.fn(async () => true) }));
vi.mock("../utils/email-service", () => ({ sendEmail }));

import { eq } from "drizzle-orm";
import { db } from "../db";
import { reservations, portalCustomerSettings, type Reservation } from "../../shared/schema";
import { storage } from "../storage";
import { customerNotifications } from "../services/portal-customer-notifications";
import { portalStorage } from "../services/portal-storage";
import { onReservationChangedByStaff, onDocumentAvailable } from "../services/portal-reservation-events";
import {
  createTestCustomer, createTestVehicle, createTestReservation, createTestDocument,
  cleanupPortalTestData, TEST_EMAIL_DOMAIN,
} from "./portal-helpers";

describe("B-06 — kantoorwijzigingen bereiken de portaalklant", () => {
  let customerId: number, userId: number, vehicleId: number, otherVehicleId: number;
  /** A customer without a portal account: nothing may be written for them. */
  let offlineCustomerId: number;

  beforeAll(async () => {
    await cleanupPortalTestData();
    customerId = (await createTestCustomer("B06")).id;
    userId = (await portalStorage.createPortalUser(
      { customerId, email: `b06@${TEST_EMAIL_DOMAIN}`, fullName: "Klant B06", role: "admin" }, "t",
    )).id;
    offlineCustomerId = (await createTestCustomer("B06Offline")).id;
    vehicleId = (await createTestVehicle()).id;
    otherVehicleId = (await createTestVehicle()).id;
  });
  afterAll(cleanupPortalTestData);

  const rental = async (patch: Partial<Reservation> = {}, owner = customerId): Promise<Reservation> => {
    const row = await createTestReservation({
      customerId: owner, vehicleId, startDate: "2026-10-10", endDate: "2026-10-15", status: "booked",
    });
    if (Object.keys(patch).length) await db.update(reservations).set(patch).where(eq(reservations.id, row.id));
    return (await storage.getReservation(row.id))!;
  };
  const mine = async (type: string) =>
    (await customerNotifications.listForUser(customerId, userId)).filter((n) => n.type === type);

  it("a — moved dates give one notification that names the new period, once", async () => {
    const before = await rental();
    const after = { ...before, startDate: "2026-10-12", endDate: "2026-10-17" };
    expect(await onReservationChangedByStaff(before, after)).toBe("reservation_changed");
    // The same save again is the same change: no second notification.
    expect(await onReservationChangedByStaff(before, after)).toBeNull();

    const rows = (await mine("reservation_changed")).filter((n) => n.link === `/reserveringen/${before.id}`);
    expect(rows).toHaveLength(1);
    expect(rows[0].description).toContain("12-10-2026");
    expect(rows[0].description).toContain("17-10-2026");
    // B-18: Dutch notation, never the stored ISO form.
    expect(rows[0].description).not.toContain("2026-10-12");
    expect(sendEmail).toHaveBeenCalled();
  });

  it("a — a swapped vehicle names both cars", async () => {
    const before = await rental();
    const after = { ...before, vehicleId: otherVehicleId };
    expect(await onReservationChangedByStaff(before, after)).toBe("reservation_changed");

    const plateOld = (await storage.getVehicle(vehicleId))!.licensePlate;
    const plateNew = (await storage.getVehicle(otherVehicleId))!.licensePlate;
    const row = (await mine("reservation_changed")).find((n) => n.link === `/reserveringen/${before.id}`)!;
    expect(row.description).toContain(plateNew);
    expect(row.description).toContain(plateOld);
    expect(row.title).toContain(plateNew);
  });

  it("a — a save that changes neither dates nor vehicle says nothing", async () => {
    const before = await rental();
    expect(await onReservationChangedByStaff(before, { ...before, notes: "interne notitie" })).toBeNull();
  });

  it("a — handing the car over is not an office change (B-16 moves the start date)", async () => {
    const before = await rental();
    const after = { ...before, status: "picked_up", startDate: "2026-10-11" };
    expect(await onReservationChangedByStaff(before, after)).toBeNull();
  });

  it("b — cancelling notifies once, and a delete afterwards does not notify again", async () => {
    const before = await rental();
    const cancelled = { ...before, status: "cancelled" };
    expect(await onReservationChangedByStaff(before, cancelled)).toBe("reservation_cancelled");
    // The same reservation deleted right after: one cancellation, not two.
    expect(await onReservationChangedByStaff(cancelled, { ...cancelled, deletedAt: new Date() })).toBeNull();

    const rows = (await mine("reservation_cancelled")).filter((n) => n.link === `/reserveringen/${before.id}`);
    expect(rows).toHaveLength(1);
    expect(rows[0].description).toContain("geannuleerd");
    expect(rows[0].description).toContain("10-10-2026");
  });

  it("b — deleting a live reservation is a cancellation for the customer", async () => {
    const before = await rental();
    expect(await onReservationChangedByStaff(before, { ...before, deletedAt: new Date() })).toBe("reservation_cancelled");
    expect((await mine("reservation_cancelled")).filter((n) => n.link === `/reserveringen/${before.id}`)).toHaveLength(1);
  });

  it("c — a new contract tells the customer, once", async () => {
    const row = await rental();
    const doc = await createTestDocument({
      reservationId: row.id, vehicleId, documentType: "Contract (Unsigned)", fileName: "contract.pdf",
    });
    expect(await onDocumentAvailable(doc)).toBe(true);
    expect(await onDocumentAvailable(doc)).toBe(false);

    const rows = (await mine("document_available")).filter((n) => n.description.includes("contract.pdf"));
    expect(rows).toHaveLength(1);
    expect(rows[0].link).toBe("/documenten");
    expect(rows[0].title).toContain("Huurcontract");
  });

  it("c — a document the portal never shows says nothing", async () => {
    const row = await rental();
    const doc = await createTestDocument({
      reservationId: row.id, vehicleId, documentType: "APK Inspection", fileName: "apk.pdf",
    });
    expect(await onDocumentAvailable(doc)).toBe(false);
  });

  it("c — a document is silent while the customer may not see documents at all", async () => {
    const row = await rental();
    await db.update(portalCustomerSettings).set({ canViewContracts: false })
      .where(eq(portalCustomerSettings.customerId, customerId));
    try {
      const doc = await createTestDocument({
        reservationId: row.id, vehicleId, documentType: "Damage Check (Pickup)", fileName: "schade.pdf",
      });
      expect(await onDocumentAvailable(doc)).toBe(false);
    } finally {
      await db.update(portalCustomerSettings).set({ canViewContracts: true })
        .where(eq(portalCustomerSettings.customerId, customerId));
    }
  });

  it("only a customer with a portal account is notified", async () => {
    const before = await rental({}, offlineCustomerId);
    expect(await onReservationChangedByStaff(before, { ...before, status: "cancelled" })).toBeNull();
    const doc = await createTestDocument({
      reservationId: before.id, vehicleId, documentType: "Contract (Unsigned)", fileName: "geen-portaal.pdf",
    });
    expect(await onDocumentAvailable(doc)).toBe(false);
  });

  it("a maintenance block is not a customer reservation", async () => {
    const before = await rental({ type: "maintenance_block", customerId: null });
    expect(await onReservationChangedByStaff(before, { ...before, status: "cancelled" })).toBeNull();
  });

  it("never throws into the staff request", async () => {
    await expect(onReservationChangedByStaff(null, null)).resolves.toBeNull();
    await expect(onReservationChangedByStaff({} as any, {} as any)).resolves.toBeNull();
    await expect(onDocumentAvailable(null as any)).resolves.toBe(false);
    await expect(onDocumentAvailable({ id: -1, reservationId: -1, documentType: "Contract" } as any)).resolves.toBe(false);
  });
});
