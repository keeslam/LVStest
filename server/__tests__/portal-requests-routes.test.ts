import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";
const { sendEmail } = vi.hoisted(() => ({ sendEmail: vi.fn(async () => true) }));
vi.mock("../utils/email-service", () => ({ sendEmail }));
vi.mock("../services/reservation-pdf-regeneration", () => ({ scheduleContractRegeneration: vi.fn() }));

import { registerPortalRequestRoutes } from "../routes/portal-requests";
import { requestsStorage } from "../services/portal-requests-storage";
import { portalStorage } from "../services/portal-storage";
import { buildStaffTestApp, createTestCustomer, createTestVehicle, createTestReservation, createTestDriver, cleanupPortalTestData, TEST_EMAIL_DOMAIN } from "./portal-helpers";
import { storage } from "../storage";
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

  it("approves a rental request into a booked reservation, with vehicle, period and driver adjustable", async () => {
    const wanted = await createTestVehicle();
    const sameType = await createTestVehicle();
    const otherType = await createTestVehicle();
    await storage.updateVehicle(wanted.id, { offeredOnline: true, vehicleType: "Bestelwagen" });
    await storage.updateVehicle(sameType.id, { vehicleType: "Bestelwagen" });
    await storage.updateVehicle(otherType.id, { vehicleType: "SUV" });
    const driver = await createTestDriver(customerId, "Chauffeur");
    const busyDriver = await createTestDriver(customerId, "Bezet");
    await createTestReservation({ customerId, vehicleId: otherType.id, driverId: busyDriver.id, startDate: "2026-11-01", endDate: "2026-11-05" });
    // The wanted vehicle is taken in the requested week.
    await createTestReservation({ customerId, vehicleId: wanted.id, startDate: "2026-10-12", endDate: "2026-10-14" });
    const reqId = (await requestsStorage.createRequest({ customerId, portalUserId: userId, type: "booking", payload: { vehicleId: wanted.id, startDate: "2026-10-10", endDate: "2026-10-15", driverId: String(driver.id), driverLabel: "Chauffeur" }, message: "Graag een bus" })).id;

    const alts = await request(manager).get(`/api/portal-requests/${reqId}/alternatives`);
    expect(alts.status).toBe(200);
    const byId = (id: number) => alts.body.vehicles.find((v: any) => v.id === id);
    expect(byId(wanted.id)).toMatchObject({ requested: true, free: false });
    expect(byId(sameType.id)).toMatchObject({ sameType: true, free: true });
    expect(byId(otherType.id)).toMatchObject({ sameType: false, free: true });
    // Order: the requested vehicle, then free vehicles of the same type, then the rest.
    const order = alts.body.vehicles as Array<{ id: number; sameType: boolean; free: boolean }>;
    expect(order[0].id).toBe(wanted.id);
    const iSame = order.findIndex((v) => v.id === sameType.id);
    const iOther = order.findIndex((v) => v.id === otherType.id);
    expect(iSame).toBeGreaterThan(0);
    expect(iSame).toBeLessThan(iOther);
    expect(order.slice(1, iSame + 1).every((v) => v.sameType && v.free)).toBe(true);

    // "Done" without a reservation is refused: the customer would be told it is arranged.
    const closeEarly = await request(manager).post(`/api/portal-requests/${reqId}/reply`).send({ reply: "Geregeld", status: "done" });
    expect(closeEarly.status).toBe(400);
    expect(closeEarly.body.code).toBe("BOOKING_NEEDS_RESERVATION");
    expect((await request(manager).post(`/api/portal-requests/${reqId}/reply`).send({ reply: "We kijken ernaar", status: "in_progress" })).status).toBe(200);
    // Approving as requested conflicts; a busy driver is refused; the same-type alternative works.
    const conflict = await request(manager).post(`/api/portal-requests/${reqId}/approve`).send({});
    expect(conflict.status).toBe(409);
    expect(conflict.body.conflicts[0].startDate).toBe("2026-10-12");
    expect((await request(manager).post(`/api/portal-requests/${reqId}/approve`).send({ vehicleId: sameType.id, driverId: busyDriver.id })).status).toBe(409);
    expect((await request(manager).post(`/api/portal-requests/${reqId}/approve`).send({ vehicleId: sameType.id, endDate: "2026-10-01" })).status).toBe(400);
    await storage.addToBlacklist({ vehicleId: otherType.id, customerId, reason: "t", createdBy: null });
    expect((await request(manager).post(`/api/portal-requests/${reqId}/approve`).send({ vehicleId: otherType.id })).status).toBe(409);
    expect((await request(manager).get(`/api/portal-requests/${reqId}/alternatives`)).body.vehicles.some((v: any) => v.id === otherType.id)).toBe(false);

    const ok = await request(manager).post(`/api/portal-requests/${reqId}/approve`).send({ vehicleId: sameType.id, startTime: "08:30", endDate: "2026-10-16" });
    expect(ok.status).toBe(200);
    expect(ok.body.status).toBe("done");
    expect(ok.body.reservationId).toBe(ok.body.reservation.id);
    expect(ok.body.staffReply).toContain(`#${ok.body.reservation.id}`);
    const created = await storage.getReservation(ok.body.reservation.id);
    expect(created).toMatchObject({ customerId, vehicleId: sameType.id, driverId: driver.id, startDate: "2026-10-10", endDate: "2026-10-16", startTime: "08:30", status: "booked", type: "standard" });
    // Closed requests cannot be approved twice.
    expect((await request(manager).post(`/api/portal-requests/${reqId}/approve`).send({})).status).toBe(400);
  });

  it("lists, counts new and takes a request", async () => {
    const list = await request(manager).get(`/api/portal-requests?status=new&customerId=${customerId}`);
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
