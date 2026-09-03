import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";
const { sendEmail } = vi.hoisted(() => ({ sendEmail: vi.fn(async () => true) }));
vi.mock("../utils/email-service", () => ({ sendEmail }));
vi.mock("../services/reservation-pdf-regeneration", () => ({ scheduleContractRegeneration: vi.fn() }));

import { registerPortalRequestRoutes } from "../routes/portal-requests";
import { requestsStorage } from "../services/portal-requests-storage";
import { portalStorage } from "../services/portal-storage";
import { buildStaffTestApp, createTestCustomer, createTestVehicle, createTestReservation, cleanupPortalTestData, TEST_EMAIL_DOMAIN } from "./portal-helpers";
import { UserPermission, reservations } from "../../shared/schema";
import { getUploadsDir } from "../../shared/paths";
import { db } from "../db";
import { eq } from "drizzle-orm";

const deps = { uploadsDir: getUploadsDir(), requireAuth: (_r: any, _s: any, n: any) => n() } as any;
const manager = buildStaffTestApp([UserPermission.MANAGE_PORTAL], (app) => registerPortalRequestRoutes(app, deps));

describe("staff portal requests", () => {
  let customerId: number, vehicleId: number, resId: number, userId: number, extId: number, otherId: number;
  beforeAll(async () => {
    await cleanupPortalTestData();
    customerId = (await createTestCustomer("RQ")).id;
    vehicleId = (await createTestVehicle()).id;
    resId = (await createTestReservation({ customerId, vehicleId, startDate: "2026-09-01", endDate: "2026-09-10", status: "picked_up" })).id;
    await createTestReservation({ customerId, vehicleId, startDate: "2026-09-20", endDate: "2026-09-25" });
    userId = (await portalStorage.createPortalUser({ customerId, email: `rq@${TEST_EMAIL_DOMAIN}`, fullName: "Aanvrager", role: "admin" }, "t")).id;
    extId = (await requestsStorage.createRequest({ customerId, portalUserId: userId, type: "extension", reservationId: resId, payload: { newEndDate: "2026-09-15" }, message: "Graag verlengen" })).id;
    otherId = (await requestsStorage.createRequest({ customerId, portalUserId: userId, type: "other", payload: { subject: "Vraag" }, message: "Hallo" })).id;
  });
  afterAll(cleanupPortalTestData);

  it("lists, counts new and takes a request", async () => {
    const list = await request(manager).get("/api/portal-requests?status=new");
    expect(list.body.map((r: any) => r.id).sort()).toEqual([extId, otherId].sort());
    expect(list.body[0].customerName).toContain("RQ");
    expect((await request(manager).get("/api/portal-requests/count-new")).body.count).toBeGreaterThanOrEqual(2);
    const taken = await request(manager).post(`/api/portal-requests/${otherId}/take`);
    expect(taken.body.status).toBe("in_progress");
    expect(taken.body.handledBy).toBe("staff-test");
  });

  it("replies, mails the submitter and enforces transitions", async () => {
    sendEmail.mockClear();
    const res = await request(manager).post(`/api/portal-requests/${otherId}/reply`).send({ reply: "Geregeld", status: "done" });
    expect(res.body.status).toBe("done");
    expect(res.body.staffReply).toBe("Geregeld");
    expect((sendEmail.mock.calls[0][0] as any).to).toBe(`rq@${TEST_EMAIL_DOMAIN}`);
    expect((await request(manager).post(`/api/portal-requests/${otherId}/reply`).send({ reply: "x", status: "in_progress" })).status).toBe(400);
    expect((await request(manager).post(`/api/portal-requests/${extId}/reply`).send({ status: "rejected" })).status).toBe(400);
  });

  it("approves an extension that fits and refuses one that conflicts", async () => {
    const ok = await request(manager).post(`/api/portal-requests/${extId}/approve`);
    expect(ok.status).toBe(200);
    expect(ok.body.status).toBe("done");
    const [r] = await db.select().from(reservations).where(eq(reservations.id, resId));
    expect(r.endDate).toBe("2026-09-15");

    const clash = await requestsStorage.createRequest({ customerId, portalUserId: userId, type: "extension", reservationId: resId, payload: { newEndDate: "2026-09-22" }, message: "Nog langer" });
    const res = await request(manager).post(`/api/portal-requests/${clash.id}/approve`);
    expect(res.status).toBe(409);
    expect(res.body.conflicts.length).toBe(1);
    expect((await requestsStorage.getRequest(clash.id))!.status).toBe("new");
  });
});
