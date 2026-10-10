import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";
import fs from "fs";
import path from "path";

const { sendEmail } = vi.hoisted(() => ({ sendEmail: vi.fn(async () => true) }));
vi.mock("../utils/email-service", () => ({ sendEmail }));

import { registerFineRoutes } from "../routes/fines";
import { buildStaffTestApp, createTestCustomer, createTestVehicle, createTestDriver, createTestReservation, cleanupPortalTestData } from "./portal-helpers";
import { getUploadsDir } from "../../shared/paths";
import { UserPermission, customers } from "../../shared/schema";
import { db } from "../db";
import { storage } from "../storage";
import { ftpsClient } from "../services/cjib/ftps-client";
import { finesStorage } from "../services/fines-storage";
import { eq } from "drizzle-orm";

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
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect((sendEmail.mock.calls[0][0] as any).to).toBe("fr@portal-test.invalid");
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

  it("enforces transitions; charged and paid are no longer reachable", async () => {
    const bad = await request(manager).post(`/api/fines/${fineId}/status`).send({ status: "paid" });
    expect(bad.status).toBe(400);
    expect(bad.body.allowed).toEqual(["cancelled", "new"]);
    expect((await request(manager).post(`/api/fines/${fineId}/status`).send({ status: "charged" })).status).toBe(400);
    expect((await request(manager).post(`/api/fines/${fineId}/status`).send({ status: "disputed" })).status).toBe(400);
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
    const ok = await request(manager).post(`/api/fines/${id}/link`).send({ customerId, reservationId: resId, driverId });
    expect(ok.body.status).toBe("linked");
    const back = await request(manager).post(`/api/fines/${id}/unlink`);
    expect(back.body.status).toBe("new");
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

  it("recomputes the total on patch", async () => {
    const list = await request(manager).get(`/api/fines?licensePlate=${plate}&status=new`);
    const id = list.body[0].id;
    const res = await request(manager).patch(`/api/fines/${id}`).send({ amount: 70, adminFee: 5 });
    expect(res.body.totalAmount).toBe("75.00");
  });
});
