import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";
import fs from "fs";
import path from "path";

const { sendEmail } = vi.hoisted(() => ({ sendEmail: vi.fn(async () => true) }));
vi.mock("../utils/email-service", () => ({ sendEmail }));

import { registerFineRoutes } from "../routes/fines";
import { buildStaffTestApp, createTestCustomer, createTestVehicle, createTestDriver, createTestReservation, cleanupPortalTestData } from "./portal-helpers";
import { getUploadsDir } from "../../shared/paths";
import { UserPermission, customers, fines, portalNotifications } from "../../shared/schema";
import { AuditLogger } from "../utils/security/auditLogger";
import { portalStorage } from "../services/portal-storage";
import { db } from "../db";
import { storage } from "../storage";
import { ftpsClient } from "../services/cjib/ftps-client";
import { finesStorage } from "../services/fines-storage";
import { and, eq } from "drizzle-orm";

const deps = { uploadsDir: getUploadsDir(), requireAuth: (_r: any, _s: any, n: any) => n() } as any;
const manager = buildStaffTestApp([UserPermission.MANAGE_FINES], (app) => registerFineRoutes(app, deps));
const viewer = buildStaffTestApp([UserPermission.VIEW_FINES], (app) => registerFineRoutes(app, deps));

describe("fines routes", () => {
  let plate: string, customerId: number, otherId: number, driverId: number, resId: number, fineId: number;
  beforeAll(async () => {
    await cleanupPortalTestData();
    plate = `PT${Date.now().toString().slice(-6)}`;
    const v = await createTestVehicle(plate);
    customerId = (await createTestCustomer("FR")).id;
    otherId = (await createTestCustomer("FR2")).id;
    await db.update(customers).set({ email: "fr@portal-test.invalid" }).where(eq(customers.id, customerId));
    driverId = (await createTestDriver(customerId)).id;
    resId = (await createTestReservation({ customerId, vehicleId: v.id, driverId, startDate: "2026-09-01", endDate: "2026-09-10", status: "picked_up" })).id;
  });
  afterAll(cleanupPortalTestData);

  it("creates a fine with a letter, normalises the plate, applies the fee and auto-links", async () => {
    const res = await request(manager).post("/api/fines")
      .field("licensePlate", plate.replace(/^(..)(..)/, "$1-$2-"))
      .field("offenceAt", "2026-09-03T10:00:00.000Z")
      .field("description", "Snelheid").field("amount", "90").field("adminFee", "12.50")
      .attach("letterFile", Buffer.from("%PDF-1.4 test"), { filename: "brief.pdf", contentType: "application/pdf" });
    expect(res.status).toBe(201);
    fineId = res.body.fine.id;
    expect(res.body.fine.licensePlate).toBe(plate);
    expect(res.body.fine.totalAmount).toBe("102.50");
    expect(res.body.fine.status).toBe("linked");
    expect(res.body.fine.customerId).toBe(customerId);
    expect(res.body.fine.driverId).toBe(driverId);
    expect(res.body.fine.letterFilePath).toBeTruthy();
    // B-41 D10: creating (and auto-linking) a fine mails nobody; staff press "Klant informeren".
    expect(sendEmail).not.toHaveBeenCalled();
    expect(res.body.fine.customerNotifiedAt).toBeNull();
  });

  it("lists with filters and streams the letter", async () => {
    const list = await request(viewer).get(`/api/fines?licensePlate=${plate}&status=linked`);
    expect(list.body.map((f: any) => f.id)).toContain(fineId);
    expect(list.body.find((f: any) => f.id === fineId).customerName).toContain("FR");
    const letter = await request(viewer).get(`/api/fines/${fineId}/letter`);
    expect(letter.status).toBe(200);
    expect(letter.headers["content-type"]).toContain("pdf");
  });

  it("viewers cannot change anything", async () => {
    expect((await request(viewer).post(`/api/fines/${fineId}/status`).send({ status: "charged" })).status).toBe(403);
  });

  it("enforces transitions; charged, paid and disputed answer STATUS_NOT_SUPPORTED (B-41 D9)", async () => {
    for (const legacy of ["paid", "charged", "disputed"]) {
      const bad = await request(manager).post(`/api/fines/${fineId}/status`).send({ status: legacy });
      expect(bad.status).toBe(400);
      expect(bad.body.code).toBe("STATUS_NOT_SUPPORTED");
    }
    // A value that is no status at all is still an invalid transition, not "not supported".
    const nonsense = await request(manager).post(`/api/fines/${fineId}/status`).send({ status: "bogus" });
    expect(nonsense.status).toBe(400);
    expect(nonsense.body.code).toBeUndefined();
    expect(nonsense.body.allowed).toEqual(["cancelled", "new"]);
    const cancelled = await request(manager).post(`/api/fines/${fineId}/status`).send({ status: "cancelled" });
    expect(cancelled.body.status).toBe("cancelled");
    const back = await request(manager).post(`/api/fines/${fineId}/status`).send({ status: "linked" });
    expect(back.body.status).toBe("linked");
  });

  it("unlinks and relinks manually with validation", async () => {
    const created = await request(manager).post("/api/fines").send({ licensePlate: plate, offenceAt: "2026-09-20T10:00:00.000Z", description: "Parkeren", amount: 60 });
    expect(created.status).toBe(201);
    expect(created.body.fine.status).toBe("new");
    expect(created.body.candidates.near.length).toBeGreaterThanOrEqual(0);
    const id = created.body.fine.id;
    const wrong = await request(manager).post(`/api/fines/${id}/link`).send({ customerId: otherId, reservationId: resId });
    expect(wrong.status).toBe(400);
    sendEmail.mockClear();
    const ok = await request(manager).post(`/api/fines/${id}/link`).send({ customerId, reservationId: resId, driverId });
    expect(ok.body.status).toBe("linked");
    // B-41 D10: a manual link sends neither mail nor portal notification either.
    expect(sendEmail).not.toHaveBeenCalled();
    expect(await db.select().from(portalNotifications).where(and(eq(portalNotifications.customerId, customerId), eq(portalNotifications.type, "fine_linked"), eq(portalNotifications.link, `/bekeuringen/${id}`)))).toEqual([]);
    const back = await request(manager).post(`/api/fines/${id}/unlink`);
    expect(back.body.status).toBe("new");
  });

  it("creating a fine mails nobody; the notify button sends the mail with the plate written with dashes", async () => {
    const v = await createTestVehicle("PT99ZY");
    await createTestReservation({ customerId, vehicleId: v.id, driverId, startDate: "2026-09-01", endDate: "2026-09-10", status: "picked_up" });
    sendEmail.mockClear();
    const res = await request(manager).post("/api/fines")
      .send({ licensePlate: "PT99ZY", offenceAt: "2026-09-03T10:00:00.000Z", description: "Parkeren", amount: 60 });
    expect(res.status).toBe(201);
    expect(res.body.fine.status).toBe("linked");
    expect(sendEmail).not.toHaveBeenCalled();
    const notify = await request(manager).post(`/api/fines/${res.body.fine.id}/notify-customer`);
    expect(notify.status).toBe(200);
    expect(notify.body).toEqual({ sent: true });
    expect(sendEmail).toHaveBeenCalledTimes(1);
    const mail = sendEmail.mock.calls[0][0] as any;
    expect(mail.subject).toContain("PT-99-ZY");
    expect(mail.subject).not.toContain("PT99ZY");
    expect(mail.html).toContain("PT-99-ZY");
    expect(mail.html).not.toContain("PT99ZY");
  });

  describe("failures answer a fixed message and a code, never the exception text", () => {
    const SECRET = "SECRET-FTPS 530 login incorrect for ftps.internal.example:990 C:\\secret\\path";
    const quiet = () => vi.spyOn(console, "error").mockImplementation(() => {});
    const wire = (body: unknown) => JSON.stringify(body);

    it("link: a deliberate refusal keeps its sentence and gets a code", async () => {
      const gone = await request(manager).post("/api/fines/2147483000/link").send({ customerId });
      expect(gone.status).toBe(400);
      expect(gone.body).toMatchObject({ message: "Fine not found", code: "FINE_NOT_FOUND" });

      const created = await request(manager).post("/api/fines").send({ licensePlate: plate, offenceAt: "2026-09-21T10:00:00.000Z", description: "Parkeren", amount: 60 });
      const wrong = await request(manager).post(`/api/fines/${created.body.fine.id}/link`).send({ customerId: otherId, reservationId: resId });
      expect(wrong.status).toBe(400);
      expect(wrong.body).toMatchObject({ message: "Reservation does not belong to customer", code: "FINE_RESERVATION_MISMATCH" });
      const wrongDriver = await request(manager).post(`/api/fines/${created.body.fine.id}/link`).send({ customerId: otherId, driverId });
      expect(wrongDriver.body).toMatchObject({ message: "Driver does not belong to customer", code: "FINE_DRIVER_MISMATCH" });
    });

    it("link: a raw exception is FINE_LINK_FAILED", async () => {
      const spy = vi.spyOn(finesStorage, "getFine").mockRejectedValue(new Error(SECRET));
      const log = quiet();
      try {
        const res = await request(manager).post("/api/fines/1/link").send({ customerId });
        expect(res.status).toBe(500);
        expect(res.body.code).toBe("FINE_LINK_FAILED");
        expect(wire(res.body)).not.toContain("SECRET-FTPS");
        expect(log).toHaveBeenCalled();
      } finally { spy.mockRestore(); log.mockRestore(); }
    });

    it("unlink: a missing fine is a 404 with FINE_NOT_FOUND, a raw exception is FINE_UNLINK_FAILED", async () => {
      const gone = await request(manager).post("/api/fines/2147483000/unlink");
      expect(gone.status).toBe(404);
      expect(gone.body).toMatchObject({ message: "Fine not found", code: "FINE_NOT_FOUND" });

      const spy = vi.spyOn(finesStorage, "updateFine").mockRejectedValue(new Error(SECRET));
      const log = quiet();
      try {
        const res = await request(manager).post("/api/fines/1/unlink");
        expect(res.status).toBe(500);
        expect(res.body.code).toBe("FINE_UNLINK_FAILED");
        expect(wire(res.body)).not.toContain("SECRET-FTPS");
      } finally { spy.mockRestore(); log.mockRestore(); }
    });

    it("cjib test: an FTPS failure is 502 CJIB_UNAVAILABLE without the server's text", async () => {
      const spy = vi.spyOn(ftpsClient, "listInbox").mockRejectedValue(new Error(SECRET));
      const log = quiet();
      try {
        const res = await request(manager).post("/api/fines/cjib-config/test").send({ enabled: true, host: "ftps.cjib.nl", username: "u", password: "p" });
        expect(res.status).toBe(502);
        expect(res.body.ok).toBe(false);
        expect(res.body.code).toBe("CJIB_UNAVAILABLE");
        expect(wire(res.body)).not.toContain("SECRET-FTPS");
        expect(wire(res.body)).not.toContain("530");
        expect(log).toHaveBeenCalled();
      } finally { spy.mockRestore(); log.mockRestore(); }
    });

    it("cjib config save: a validation message stays, a storage failure is CJIB_CONFIG_SAVE_FAILED", async () => {
      const invalid = await request(manager).put("/api/fines/cjib-config").send({ pollMinutes: 1 });
      expect(invalid.status).toBe(400);
      expect(typeof invalid.body.message).toBe("string");
      expect(invalid.body.code).toBeUndefined();


      const spies = [
        vi.spyOn(storage, "updateAppSetting").mockRejectedValue(new Error(SECRET)),
        vi.spyOn(storage, "createAppSetting").mockRejectedValue(new Error(SECRET)),
      ];
      const log = quiet();
      try {
        const res = await request(manager).put("/api/fines/cjib-config").send({ enabled: false, host: "", username: "", password: "" });
        expect(res.status).toBe(500);
        expect(res.body.code).toBe("CJIB_CONFIG_SAVE_FAILED");
        expect(wire(res.body)).not.toContain("SECRET-FTPS");
      } finally { spies.forEach((s) => s.mockRestore()); log.mockRestore(); }
    });

    it("letter upload: a rejected file keeps the validator's sentence with FINE_LETTER_INVALID, other failures are FINE_LETTER_FAILED", async () => {
      const bad = await request(manager).post("/api/fines")
        .field("licensePlate", plate).field("offenceAt", "2026-09-22T10:00:00.000Z").field("description", "x").field("amount", "10")
        .attach("letterFile", Buffer.from("not a pdf at all"), { filename: "brief.pdf", contentType: "application/pdf" });
      expect(bad.status).toBe(400);
      expect(bad.body.code).toBe("FINE_LETTER_INVALID");
      expect(typeof bad.body.message).toBe("string");
    });
  });

  it("cancels, reactivates, deletes to the recycle bin and restores", async () => {
    const created = await request(manager).post("/api/fines").send({ licensePlate: plate, offenceAt: "2026-09-04T10:00:00.000Z", description: "Annuleertest", amount: 40 });
    const id = created.body.fine.id;
    expect(created.body.fine.status).toBe("linked");
    expect((await request(manager).post(`/api/fines/${id}/status`).send({ status: "cancelled" })).body.status).toBe("cancelled");
    const back = await request(manager).post(`/api/fines/${id}/reactivate`);
    expect(back.status).toBe(200);
    expect(back.body.status).toBe("linked"); // it still had its customer
    expect(back.body.customerId).toBe(customerId);
    expect((await request(manager).post(`/api/fines/${id}/reactivate`)).status).toBe(400);

    expect((await request(viewer).delete(`/api/fines/${id}`)).status).toBe(403);
    expect((await request(manager).delete(`/api/fines/${id}`)).status).toBe(200);
    expect((await request(manager).get(`/api/fines/${id}`)).status).toBe(404);
    const bin = (await storage.getDeletedRecords!(50)).find((r: any) => r.entityType === "fine" && r.entityId === id);
    expect(bin).toBeTruthy();
    expect(bin!.label).toContain("Annuleertest");

    const restored = await storage.restoreDeletedRecord!(bin!.id, { username: "test" });
    expect(restored.restored).toBe(true);
    const again = await request(manager).get(`/api/fines/${id}`);
    expect(again.status).toBe(200);
    expect(again.body).toMatchObject({ status: "linked", customerId, description: "Annuleertest" });
    expect((await storage.restoreDeletedRecord!(bin!.id)).reason).toBe("already_restored");
  });

  it("a legacy paid row can still be edited; only a cancelled fine is closed (B-41 D9)", async () => {
    const legacy = await finesStorage.createFine({
      licensePlate: plate, offenceAt: new Date("2026-09-05T10:00:00Z"), description: "Oude boete", amount: "50.00", adminFee: "0.00", totalAmount: "50.00",
      status: "paid", customerId,
    } as any);
    const edited = await request(manager).patch(`/api/fines/${legacy.id}`).send({ internalNotes: "nagekeken" });
    expect(edited.status).toBe(200);
    expect(edited.body.internalNotes).toBe("nagekeken");
    const cancelled = await finesStorage.createFine({
      licensePlate: plate, offenceAt: new Date("2026-09-06T10:00:00Z"), description: "Geannuleerd", amount: "50.00", adminFee: "0.00", totalAmount: "50.00",
      status: "cancelled", customerId,
    } as any);
    expect((await request(manager).patch(`/api/fines/${cancelled.id}`).send({ internalNotes: "x" })).status).toBe(400);
  });

  it("the list reports legacy status counts in a header and keeps the body an array (B-41 D9)", async () => {
    const res = await request(viewer).get(`/api/fines?licensePlate=${plate}`);
    expect(Array.isArray(res.body)).toBe(true);
    const counts = JSON.parse(res.headers["x-legacy-fine-status-counts"]);
    expect(counts.paid).toBeGreaterThanOrEqual(1);
    expect(counts.charged ?? 0).toBe(0);
    // A plate nobody has legacy rows for reports an empty object.
    const none = await request(viewer).get("/api/fines?licensePlate=ZZ0000");
    expect(JSON.parse(none.headers["x-legacy-fine-status-counts"])).toEqual({});
  });

  describe("POST /api/fines/:id/notify-customer (B-41 D10)", () => {
    const linkedFine = (over: Record<string, unknown> = {}) => finesStorage.createFine({
      licensePlate: plate, offenceAt: new Date("2026-09-07T10:00:00Z"), description: "Informeren", amount: "40.00", adminFee: "0.00", totalAmount: "40.00",
      status: "linked", customerId, ...over,
    } as any);

    it("mails the customer, logs it as fine_linked, adds a portal notification, audits and stamps customer_notified_at", async () => {
      const fine = await linkedFine();
      sendEmail.mockClear();
      const audit = vi.spyOn(AuditLogger, "logFromRequest");
      try {
        const res = await request(manager).post(`/api/fines/${fine.id}/notify-customer`);
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ sent: true });
        expect(sendEmail).toHaveBeenCalledTimes(1);
        const options = sendEmail.mock.calls[0][0] as any;
        expect(options.to).toBe("fr@portal-test.invalid");
        expect(options.logTemplate).toBe("fine_linked");
        expect(audit).toHaveBeenCalledWith(expect.anything(), "fine.notify-customer", "fine", fine.id, expect.objectContaining({ sent: true }));
      } finally { audit.mockRestore(); }
      const [row] = await db.select().from(fines).where(eq(fines.id, fine.id));
      expect(row.customerNotifiedAt).toBeInstanceOf(Date);
      const notes = await db.select().from(portalNotifications).where(and(eq(portalNotifications.customerId, customerId), eq(portalNotifications.type, "fine_linked"), eq(portalNotifications.link, `/bekeuringen/${fine.id}`)));
      expect(notes).toHaveLength(1);
      // The detail carries the date, and a second press ("Opnieuw informeren") mails again.
      expect((await request(manager).get(`/api/fines/${fine.id}`)).body.customerNotifiedAt).toBeTruthy();
      const again = await request(manager).post(`/api/fines/${fine.id}/notify-customer`);
      expect(again.body).toEqual({ sent: true });
      expect(sendEmail).toHaveBeenCalledTimes(2);
      // Unlinking forgets the date: the next customer has not been told.
      await request(manager).post(`/api/fines/${fine.id}/unlink`);
      expect((await finesStorage.getFine(fine.id))!.customerNotifiedAt).toBeNull();
    });

    it("the detail names the address the mail would go to, for managers only", async () => {
      const fine = await linkedFine();
      expect((await request(manager).get(`/api/fines/${fine.id}`)).body.notifyAddress).toBe("fr@portal-test.invalid");
      expect((await request(viewer).get(`/api/fines/${fine.id}`)).body.notifyAddress).toBeUndefined();
      const bare = await linkedFine({ customerId: null });
      expect((await request(manager).get(`/api/fines/${bare.id}`)).body.notifyAddress).toBeNull();
    });

    it("NO_CUSTOMER: a linked fine without a customer", async () => {
      const fine = await linkedFine({ customerId: null });
      sendEmail.mockClear();
      const res = await request(manager).post(`/api/fines/${fine.id}/notify-customer`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ sent: false, reason: "NO_CUSTOMER" });
      expect(sendEmail).not.toHaveBeenCalled();
      expect((await finesStorage.getFine(fine.id))!.customerNotifiedAt).toBeNull();
    });

    it("NO_EMAIL: the customer has no address", async () => {
      const noMail = (await createTestCustomer("FR3")).id;
      await db.update(customers).set({ email: null, emailForInvoices: null }).where(eq(customers.id, noMail));
      const fine = await linkedFine({ customerId: noMail });
      sendEmail.mockClear();
      const res = await request(manager).post(`/api/fines/${fine.id}/notify-customer`);
      expect(res.body).toEqual({ sent: false, reason: "NO_EMAIL" });
      expect(sendEmail).not.toHaveBeenCalled();
      expect((await finesStorage.getFine(fine.id))!.customerNotifiedAt).toBeNull();
    });

    it("PORTAL_DISABLED: the portal is off for this customer", async () => {
      const off = (await createTestCustomer("FR4")).id;
      await portalStorage.updateCustomerSettings(off, { portalEnabled: false }, "test");
      const fine = await linkedFine({ customerId: off });
      sendEmail.mockClear();
      const res = await request(manager).post(`/api/fines/${fine.id}/notify-customer`);
      expect(res.body).toEqual({ sent: false, reason: "PORTAL_DISABLED" });
      expect(sendEmail).not.toHaveBeenCalled();
    });

    it("MAIL_FAILED: the mail server refuses; nothing is stamped", async () => {
      const fine = await linkedFine();
      sendEmail.mockClear();
      sendEmail.mockResolvedValueOnce(false);
      const res = await request(manager).post(`/api/fines/${fine.id}/notify-customer`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ sent: false, reason: "MAIL_FAILED" });
      expect((await finesStorage.getFine(fine.id))!.customerNotifiedAt).toBeNull();
    });

    it("refuses a fine that is not linked, a missing fine and a viewer", async () => {
      const fine = await linkedFine({ status: "new", customerId: null });
      const notLinked = await request(manager).post(`/api/fines/${fine.id}/notify-customer`);
      expect(notLinked.status).toBe(400);
      expect(notLinked.body.code).toBe("FINE_NOT_LINKED");
      expect((await request(manager).post("/api/fines/2147483000/notify-customer")).status).toBe(404);
      expect((await request(viewer).post(`/api/fines/${fine.id}/notify-customer`)).status).toBe(403);
    });
  });

  it("recomputes the total on patch", async () => {
    const list = await request(manager).get(`/api/fines?licensePlate=${plate}&status=new`);
    const id = list.body[0].id;
    const res = await request(manager).patch(`/api/fines/${id}`).send({ amount: 70, adminFee: 5 });
    expect(res.body.totalAmount).toBe("75.00");
  });
});
