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

  it("enforces transitions and records charge/paid timestamps", async () => {
    const bad = await request(manager).post(`/api/fines/${fineId}/status`).send({ status: "paid" });
    expect(bad.status).toBe(400);
    expect(bad.body.allowed).toEqual(["charged", "disputed", "cancelled", "new"]);
    const charged = await request(manager).post(`/api/fines/${fineId}/status`).send({ status: "charged", invoiceReference: "F-2026-001" });
    expect(charged.body.status).toBe("charged");
    expect(charged.body.invoiceReference).toBe("F-2026-001");
    expect(charged.body.chargedAt).toBeTruthy();
    const paid = await request(manager).post(`/api/fines/${fineId}/status`).send({ status: "paid" });
    expect(paid.body.paidAt).toBeTruthy();
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

  it("recomputes the total on patch", async () => {
    const list = await request(manager).get(`/api/fines?licensePlate=${plate}&status=new`);
    const id = list.body[0].id;
    const res = await request(manager).patch(`/api/fines/${id}`).send({ amount: 70, adminFee: 5 });
    expect(res.body.totalAmount).toBe("75.00");
  });
});
