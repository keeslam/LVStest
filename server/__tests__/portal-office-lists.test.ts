/**
 * Kees, 2026-10-19: three tiles on the staff Klantenportaal dashboard. New customer uploads (marked
 * "gezien" by viewing), open cancellation requests, and fines on a shared car that wait for the
 * customer to say who drove.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import express from "express";
import request from "supertest";

const { sendEmail } = vi.hoisted(() => ({ sendEmail: vi.fn(async () => true) }));
vi.mock("../utils/email-service", () => ({ sendEmail }));

import { registerPortalAdminRoutes } from "../routes/portal-admin";
import { createTestCustomer, createTestVehicle, createTestDriver, createTestReservation, createTestFine, cleanupPortalTestData, TEST_EMAIL_DOMAIN } from "./portal-helpers";
import { portalStorage } from "../services/portal-storage";
import { requestsStorage } from "../services/portal-requests-storage";
import { finesStorage } from "../services/fines-storage";
import { addExtraDriver, assignDriverToReservation } from "../services/driver-assignments";
import { storage } from "../storage";
import { UserPermission } from "../../shared/schema";
import { getPortalDashboard } from "../services/portal-dashboard";

function staffApp(permissions: string[]) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).user = { id: 1, username: "kantoor-test", role: "manager", permissions };
    (req as any).isAuthenticated = () => true;
    next();
  });
  registerPortalAdminRoutes(app, { requireAuth: (_r: any, _s: any, n: any) => n() } as any);
  return app;
}

describe("Klantenportaal: uploads, annuleringen, wie reed", () => {
  const app = staffApp([UserPermission.VIEW_PORTAL, UserPermission.VIEW_FINES]);
  const portalOnly = staffApp([UserPermission.VIEW_PORTAL]);
  let customerId: number, reservationId: number, uploadId: number, fineId: number;

  beforeAll(async () => {
    await cleanupPortalTestData();
    customerId = (await createTestCustomer("Tegels")).id;
    const vehicle = await createTestVehicle();
    const jan = await createTestDriver(customerId, "Jan");
    const piet = await createTestDriver(customerId, "Piet");
    reservationId = (await createTestReservation({ customerId, vehicleId: vehicle.id, driverId: jan.id, status: "picked_up", startDate: "2026-09-01", endDate: null })).id;
    await assignDriverToReservation({ reservationId, driverId: jan.id, at: new Date("2026-09-01T08:00:00Z") });
    await addExtraDriver({ reservationId, driverId: piet.id, at: new Date("2026-09-02T08:00:00Z") });
    const user = await portalStorage.createPortalUser({ customerId, email: `tegels@${TEST_EMAIL_DOMAIN}`, fullName: "Tegels", role: "admin" }, "t");
    await requestsStorage.createRequest({ customerId, portalUserId: user.id, type: "cancellation", reservationId, payload: {}, message: "Niet meer nodig" });
    uploadId = (await storage.createDocument({
      vehicleId: vehicle.id, reservationId, documentType: "Customer Upload", fileName: "bon.pdf", filePath: "nowhere/bon.pdf",
      fileSize: 10, contentType: "application/pdf", notes: "Tankbon", createdBy: `portaal:tegels@${TEST_EMAIL_DOMAIN}`,
    } as any)).id;
    fineId = (await createTestFine({ licensePlate: vehicle.licensePlate, offenceAt: new Date("2026-09-10T10:00:00Z") })).id;
    await finesStorage.updateFine(fineId, { customerId, reservationId, driverId: null, status: "linked", linkedAt: new Date(), linkedBy: "system" });
  });
  afterAll(cleanupPortalTestData);

  it("counts all three on the dashboard", async () => {
    const d = await getPortalDashboard();
    expect(d.counts.uploadsNew).toBeGreaterThanOrEqual(1);
    expect(d.counts.cancellations).toBeGreaterThanOrEqual(1);
    expect(d.counts.finesAwaitingDriver).toBeGreaterThanOrEqual(1);
  });

  it("lists uploads; marking one as seen takes it off the count", async () => {
    const before = (await getPortalDashboard()).counts.uploadsNew;
    const list = (await request(app).get("/api/portal-admin/uploads")).body as Array<{ id: number; description: string; uploadedBy: string; seenAt: string | null }>;
    expect(list.find((u) => u.id === uploadId)).toMatchObject({ description: "Tankbon", uploadedBy: `tegels@${TEST_EMAIL_DOMAIN}`, seenAt: null });
    expect((await request(app).post(`/api/portal-admin/uploads/${uploadId}/seen`)).status).toBe(200);
    expect((await getPortalDashboard()).counts.uploadsNew).toBe(before - 1);
    const after = (await request(app).get("/api/portal-admin/uploads")).body.find((u: { id: number }) => u.id === uploadId);
    expect(after.seenBy).toBe("kantoor-test");
    // Only customer uploads can be marked.
    expect((await request(app).post("/api/portal-admin/uploads/999999999/seen")).status).toBe(404);
  });

  it("lists the fines waiting for 'who drove' with the drivers of that moment; needs a fines right", async () => {
    const res = await request(app).get("/api/portal-admin/fines-awaiting-driver");
    expect(res.status).toBe(200);
    const row = res.body.find((f: { id: number }) => f.id === fineId);
    expect(row.drivers.sort()).toEqual(["Jan", "Piet"]);
    expect((await request(portalOnly).get("/api/portal-admin/fines-awaiting-driver")).status).toBe(403);
    // Once a driver is set it leaves the list.
    await finesStorage.updateFine(fineId, { driverId: (await portalStorage.listDriversForCustomer(customerId))[0].id });
    expect((await request(app).get("/api/portal-admin/fines-awaiting-driver")).body.some((f: { id: number }) => f.id === fineId)).toBe(false);
  });
});
