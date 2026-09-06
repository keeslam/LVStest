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
import { customerNotifications } from "../services/portal-customer-notifications";
import { UserPermission, reservations } from "../../shared/schema";
import { getUploadsDir } from "../../shared/paths";
import { db } from "../db";
import { and, eq } from "drizzle-orm";

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

  it("staff messages and replies reach the customer's bell", async () => {
    const convId = (await requestsStorage.createRequest({ customerId, portalUserId: userId, type: "other", payload: { subject: "Gesprek" }, message: "Vraag over factuur" })).id;
    const msg = await request(manager).post(`/api/portal-requests/${convId}/messages`).send({ body: "Kunt u een foto sturen?" });
    expect(msg.status).toBe(201);
    expect((await request(manager).get(`/api/portal-requests/${convId}`)).body).toMatchObject({ status: "in_progress" });
    expect((await request(manager).get(`/api/portal-requests/${convId}`)).body.messages).toHaveLength(1);
    const before = await customerNotifications.listForUser(customerId, userId);
    expect(before.some((n) => n.type === "request_message" && n.link === `/aanvragen/${convId}`)).toBe(true);
    expect((await request(manager).post(`/api/portal-requests/${convId}/reply`).send({ reply: "Bedankt, geregeld.", status: "done" })).status).toBe(200);
    const after = await customerNotifications.listForUser(customerId, userId);
    expect(after.some((n) => n.type === "request_done" && n.description.includes("Bedankt, geregeld."))).toBe(true);
    expect((await request(manager).get(`/api/portal-requests/${convId}`)).body.messages).toHaveLength(2);
  });

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

  it("approving a maintenance report puts a block in the calendar, with a placeholder spare when asked", async () => {
    const car = await createTestVehicle();
    await storage.updateVehicle(car.id, { currentMileage: 10000 });
    const rental = await createTestReservation({ customerId, vehicleId: car.id, startDate: "2026-09-01", endDate: null, status: "picked_up" });
    const reqId = (await requestsStorage.createRequest({ customerId, portalUserId: userId, type: "maintenance", reservationId: rental.id, payload: { issue: "Lampje", mileage: 12000, urgent: true, needsReplacement: true }, message: "Lampje brandt" })).id;
    expect((await request(manager).post(`/api/portal-requests/${reqId}/approve`).send({})).status).toBe(400);
    expect((await request(manager).post(`/api/portal-requests/${reqId}/reply`).send({ reply: "ok", status: "done" })).body.code).toBe("MAINTENANCE_NEEDS_BLOCK");
    const res = await request(manager).post(`/api/portal-requests/${reqId}/approve`).send({ startDate: "2026-11-02", durationDays: 2, category: "repair", note: "Graag om 8 uur brengen" });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("done");
    const block = res.body.block;
    expect(block).toMatchObject({ type: "maintenance_block", vehicleId: car.id, startDate: "2026-11-02", endDate: "2026-11-03", maintenanceCategory: "repair", maintenanceDuration: 2, portalRequestId: reqId, affectedRentalId: rental.id });
    const placeholders = await db.select().from(reservations).where(eq(reservations.replacementForReservationId, rental.id));
    expect(placeholders.filter((p) => p.placeholderSpare && !p.deletedAt)).toHaveLength(1);
    expect((await storage.getVehicle(car.id))!.currentMileage).toBe(12000);
    expect((await customerNotifications.listForUser(customerId, userId)).some((n) => n.type === "maintenance_planned" && n.link === `/voertuigen?block=${block.id}`)).toBe(true);
    expect((await request(manager).get(`/api/portal-requests/${reqId}`)).body.staffReply).toContain("2026-11-02");
    await db.delete(reservations).where(eq(reservations.portalRequestId, reqId));
  });

  it("approving a change request moves the block and its placeholder", async () => {
    const car = await createTestVehicle();
    const rental = await createTestReservation({ customerId, vehicleId: car.id, startDate: "2026-09-01", endDate: null, status: "picked_up" });
    const block = await storage.createMaintenanceBlock(car.id, "2099-05-10", "2099-05-11");
    await db.update(reservations).set({ maintenanceDuration: 2, affectedRentalId: rental.id }).where(eq(reservations.id, block.id));
    await storage.createPlaceholderReservation(rental.id, customerId, "2099-05-10", "2099-05-11");
    const reqId = (await requestsStorage.createRequest({ customerId, portalUserId: userId, type: "maintenance_change", reservationId: block.id, payload: { newDate: "2099-05-20", reason: "Vakantie", needsReplacement: true }, message: "Graag later" })).id;
    const res = await request(manager).post(`/api/portal-requests/${reqId}/approve`).send({ startDate: "2099-05-20", durationDays: 2 });
    expect(res.status).toBe(200);
    expect(res.body.block).toMatchObject({ id: block.id, startDate: "2099-05-20", endDate: "2099-05-21" });
    const placeholder = (await db.select().from(reservations).where(eq(reservations.replacementForReservationId, rental.id)))[0];
    expect(placeholder).toMatchObject({ startDate: "2099-05-20", endDate: "2099-05-21" });
    expect((await customerNotifications.listForUser(customerId, userId)).some((n) => n.type === "maintenance_moved")).toBe(true);
    await db.delete(reservations).where(eq(reservations.id, block.id));
  });

  it("approving a change request on a staff-planned block finds the rental via vehicle occupancy and persists it", async () => {
    const car = await createTestVehicle();
    const rental = await createTestReservation({ customerId, vehicleId: car.id, startDate: "2026-09-01", endDate: null, status: "picked_up" });
    // Planned directly in the calendar (not via the portal), so there is no affectedRentalId yet.
    const block = await storage.createMaintenanceBlock(car.id, "2098-06-10", "2098-06-11");
    expect(block.affectedRentalId).toBeNull();
    const reqId = (await requestsStorage.createRequest({ customerId, portalUserId: userId, type: "maintenance_change", reservationId: block.id, payload: { newDate: "2098-06-20", reason: "Vakantie", needsReplacement: true }, message: "Graag later" })).id;
    const res = await request(manager).post(`/api/portal-requests/${reqId}/approve`).send({ startDate: "2098-06-20", durationDays: 2 });
    expect(res.status).toBe(200);
    expect(res.body.block).toMatchObject({ id: block.id, affectedRentalId: rental.id, startDate: "2098-06-20", endDate: "2098-06-21" });
    const [placeholder] = await db.select().from(reservations).where(and(eq(reservations.replacementForReservationId, rental.id), eq(reservations.placeholderSpare, true)));
    expect(placeholder).toMatchObject({ startDate: "2098-06-20", endDate: "2098-06-21" });
    await db.delete(reservations).where(eq(reservations.id, block.id));
    await db.delete(reservations).where(eq(reservations.id, placeholder.id));
  });

  it("approving a change request refuses to move a block onto another maintenance block", async () => {
    const car = await createTestVehicle();
    const blockA = await storage.createMaintenanceBlock(car.id, "2097-04-01", "2097-04-02");
    const blockB = await storage.createMaintenanceBlock(car.id, "2097-04-10", "2097-04-11");
    const reqId = (await requestsStorage.createRequest({ customerId, portalUserId: userId, type: "maintenance_change", reservationId: blockA.id, payload: { newDate: "2097-04-10", reason: "Verplaatsen" }, message: "Graag verplaatsen" })).id;
    const res = await request(manager).post(`/api/portal-requests/${reqId}/approve`).send({ startDate: "2097-04-10", durationDays: 2 });
    expect(res.status).toBe(409);
    expect(res.body.message).toBe("Conflicts with another maintenance block");
    expect(res.body.conflicts[0].id).toBe(blockB.id);
    // The refused move must not have gone through.
    expect((await storage.getReservation(blockA.id))!.startDate).toBe("2097-04-01");
    await db.delete(reservations).where(eq(reservations.id, blockA.id));
    await db.delete(reservations).where(eq(reservations.id, blockB.id));
  });
});
