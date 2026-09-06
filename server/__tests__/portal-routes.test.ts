import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";
import fs from "fs";
import path from "path";

const { sendEmail, notify } = vi.hoisted(() => ({ sendEmail: vi.fn(async () => true), notify: vi.fn(async () => undefined) }));
vi.mock("../utils/email-service", () => ({ sendEmail }));
vi.mock("../services/portal-notifications", () => ({ notifyStaffOfPortalEvent: notify }));

import { buildPortalTestApp, createTestCustomer, createTestVehicle, createTestDriver, createTestReservation, createTestDocument, cleanupPortalTestData, TEST_EMAIL_DOMAIN } from "./portal-helpers";
import { portalStorage } from "../services/portal-storage";
import { hashPassword } from "../auth";
import { getUploadsDir } from "../../shared/paths";
import { storage } from "../storage";
import { requestsStorage } from "../services/portal-requests-storage";
import { customerNotifications } from "../services/portal-customer-notifications";
import { db } from "../db";
import { reservations } from "../../shared/schema";
import { eq } from "drizzle-orm";

const password = "wachtwoord-1234";

async function loginAs(app: any, email: string) {
  const agent = request.agent(app);
  const res = await agent.post("/api/portal/login").send({ email, password });
  expect(res.status).toBe(200);
  const { body } = await agent.get("/api/portal/csrf-token");
  return { agent, csrf: body.token as string };
}

describe("portal routes", () => {
  const app = buildPortalTestApp();
  let a: number, b: number, vehicleId: number, driverA: number, resA: number, resA2: number, resB: number, docA: number;
  const emailA = `a@${TEST_EMAIL_DOMAIN}`, emailB = `b@${TEST_EMAIL_DOMAIN}`;
  const docFile = path.join(getUploadsDir(), "__portal_test__", "test.pdf");

  beforeAll(async () => {
    await cleanupPortalTestData();
    a = (await createTestCustomer("RA")).id;
    b = (await createTestCustomer("RB")).id;
    vehicleId = (await createTestVehicle()).id;
    driverA = (await createTestDriver(a, "Driver A")).id;
    resA = (await createTestReservation({ customerId: a, vehicleId, driverId: driverA, status: "picked_up" })).id;
    resA2 = (await createTestReservation({ customerId: a, vehicleId, status: "booked" })).id;
    resB = (await createTestReservation({ customerId: b, vehicleId })).id;
    docA = (await createTestDocument({ reservationId: resA, vehicleId, documentType: "Contract (Signed)" })).id;
    fs.mkdirSync(path.dirname(docFile), { recursive: true });
    fs.writeFileSync(docFile, "pdf");
    for (const [cid, email] of [[a, emailA], [b, emailB]] as const) {
      const u = await portalStorage.createPortalUser({ customerId: cid, email, fullName: "U", role: "admin" }, "t");
      await portalStorage.updatePortalUser(u.id, { passwordHash: await hashPassword(password) });
    }
  });
  afterAll(async () => { await cleanupPortalTestData(); fs.rmSync(path.dirname(docFile), { recursive: true, force: true }); });

  it("lists own reservations only, without prices by default", async () => {
    const { agent } = await loginAs(app, emailA);
    const res = await agent.get("/api/portal/reservations");
    expect(res.body.map((r: any) => r.id)).toEqual(expect.arrayContaining([resA, resA2])); expect(res.body).toHaveLength(2);
    expect(res.body[0]).not.toHaveProperty("totalPrice");
    expect(res.body[0].vehicle.id).toBe(vehicleId);
  });

  it("returns 404 for another customer's reservation and document", async () => {
    const { agent } = await loginAs(app, emailB);
    expect((await agent.get(`/api/portal/reservations/${resA}`)).status).toBe(404);
    expect((await agent.get(`/api/portal/documents/${docA}/download`)).status).toBe(404);
  });

  it("downloads an own contract and logs it", async () => {
    const { agent } = await loginAs(app, emailA);
    const res = await agent.get(`/api/portal/documents/${docA}/download`);
    expect(res.status).toBe(200);
    expect(res.headers["content-disposition"]).toContain("test.pdf");
    const log = await portalStorage.listActivity({ customerId: a, limit: 5 });
    expect(log.some((l) => l.action === "document_downloaded" && l.entityId === docA)).toBe(true);
  });

  it("hides documents when contracts are switched off", async () => {
    await portalStorage.updateCustomerSettings(a, { canViewContracts: false }, "t");
    const { agent } = await loginAs(app, emailA);
    const res = await agent.get("/api/portal/documents");
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("PORTAL_FEATURE_DISABLED");
    await portalStorage.updateCustomerSettings(a, { canViewContracts: true }, "t");
  });

  it("manages drivers and changes the driver of a running rental", async () => {
    const { agent, csrf } = await loginAs(app, emailA);
    const created = await agent.post("/api/portal/drivers").set("X-CSRF-Token", csrf).send({ displayName: "Nieuwe", email: "n@x.nl", licenseOrigin: "België", preferredLanguage: "en", notes: "Rijdt alleen op weekdagen" });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ licenseOrigin: "België", preferredLanguage: "en", notes: "Rijdt alleen op weekdagen" });
    expect((await agent.post("/api/portal/drivers").set("X-CSRF-Token", csrf).send({ displayName: "Fout", preferredLanguage: "de" })).status).toBe(400);
    const noContact = await agent.post("/api/portal/drivers").set("X-CSRF-Token", csrf).send({ displayName: "Zonder contact" });
    expect(noContact.status).toBe(400);
    expect(noContact.body.error).toMatch(/e-mailadres of telefoonnummer/);
    expect((await agent.post("/api/portal/drivers").set("X-CSRF-Token", csrf).send({ displayName: "Alleen telefoon", phone: "0612345678" })).status).toBe(201);
    const list = await agent.get("/api/portal/drivers");
    expect(list.body.map((d: any) => d.displayName)).toEqual(["Alleen telefoon", "Driver A", "Nieuwe"]);

    const change = await agent.post(`/api/portal/reservations/${resA}/driver`).set("X-CSRF-Token", csrf).send({ driverId: created.body.id, note: "vakantie" });
    expect(change.status).toBe(200);
    expect(change.body.driver.id).toBe(created.body.id);
    // Same driver again on the same car is fine (no other car involved).
    expect((await agent.post(`/api/portal/reservations/${resA}/driver`).set("X-CSRF-Token", csrf).send({ driverId: created.body.id })).status).toBe(200);
    // One car per driver: the driver now on resA cannot also be put on the booked resA2.
    const busy = await agent.post(`/api/portal/reservations/${resA2}/driver`).set("X-CSRF-Token", csrf).send({ driverId: created.body.id });
    expect(busy.status).toBe(400);
    expect(busy.body.code).toBe("PORTAL_DRIVER_BUSY");
    expect(busy.body.error).toMatch(/rijdt al in/);
    // Driver A was replaced on resA, so Driver A is free for resA2.
    expect((await agent.post(`/api/portal/reservations/${resA2}/driver`).set("X-CSRF-Token", csrf).send({ driverId: driverA })).status).toBe(200);
    // The fixture inserted the reservation directly (no history row), so the
    // change opens the first row; through the app the create hook adds one.
    expect(change.body.driverHistory.at(-1).driverId).toBe(created.body.id);
    expect(change.body.driverHistory.at(-1).assignedUntil).toBeNull();
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ kind: "portal_driver_change", customerId: a }));

    const foreign = await agent.post(`/api/portal/reservations/${resB}/driver`).set("X-CSRF-Token", csrf).send({ driverId: created.body.id });
    expect(foreign.status).toBe(404);
  });

  it("deactivates instead of deleting", async () => {
    const { agent, csrf } = await loginAs(app, emailA);
    const res = await agent.patch(`/api/portal/drivers/${driverA}`).set("X-CSRF-Token", csrf).send({ status: "inactive" });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("inactive");
    expect((await agent.delete(`/api/portal/drivers/${driverA}`).set("X-CSRF-Token", csrf)).status).toBe(404);
  });

  it("per-account permissions take features away below the customer setting", async () => {
    const users = await portalStorage.listPortalUsersByCustomer(a);
    const me0 = await loginAs(app, emailA);
    expect((await me0.agent.get("/api/portal/me")).body.settings).toMatchObject({ canViewFines: true, canReturn: true });
    await portalStorage.updatePortalUser(users[0].id, { permissions: { canViewFines: false, canReturn: false } });
    const { agent, csrf } = await loginAs(app, emailA);
    const me = await agent.get("/api/portal/me");
    expect(me.body.settings).toMatchObject({ canViewFines: false, canReturn: false, canSubmitRequests: true });
    expect((await agent.get("/api/portal/fines")).status).toBe(403);
    const early = await agent.post("/api/portal/requests").set("X-CSRF-Token", csrf)
      .field("type", "early_return").field("message", "eerder").field("reservationId", String(resA)).field("payload", JSON.stringify({ returnDate: "2099-01-01" }));
    expect(early.status).toBe(403);
    await portalStorage.updatePortalUser(users[0].id, { permissions: {} });
  });

  it("shows online vehicles minus the customer's blacklist and refuses booking a blocked vehicle", async () => {
    const online = await createTestVehicle();
    const blockedForA = await createTestVehicle();
    const offline = await createTestVehicle();
    const rented = await createTestVehicle();
    const broken = await createTestVehicle();
    await storage.updateVehicle(online.id, { offeredOnline: true, onlineDescription: "Ruime bus" });
    await storage.updateVehicle(rented.id, { offeredOnline: true, availabilityStatus: "rented" });
    await storage.updateVehicle(broken.id, { offeredOnline: true, availabilityStatus: "needs_fixing" });
    await storage.updateVehicle(blockedForA.id, { offeredOnline: true });
    const block = await storage.addToBlacklist({ vehicleId: blockedForA.id, customerId: a, reason: "test", createdBy: null });

    const { agent, csrf } = await loginAs(app, emailA);
    const list = await agent.get("/api/portal/vehicles");
    expect(list.status).toBe(200);
    const ids = list.body.map((v: any) => v.id);
    expect(ids).toContain(online.id);
    expect(ids).not.toContain(blockedForA.id);
    expect(ids).not.toContain(offline.id);
    expect(ids).not.toContain(rented.id);
    expect(list.body.find((v: any) => v.id === online.id).description).toBe("Ruime bus");
    // Customer B is not blocked, so B sees both online vehicles.
    const asB = await loginAs(app, emailB);
    expect(((await asB.agent.get("/api/portal/vehicles")).body as any[]).map((v) => v.id)).toEqual(expect.arrayContaining([online.id, blockedForA.id]));

    const today = new Date().toISOString().slice(0, 10);
    const send = (vehicleId: number) => agent.post("/api/portal/requests").set("X-CSRF-Token", csrf)
      .field("type", "booking").field("message", "Graag deze auto").field("payload", JSON.stringify({ vehicleId, startDate: today, endDate: "" }));
    const blocked = await send(blockedForA.id);
    expect(blocked.status).toBe(403);
    expect(blocked.body.code).toBe("PORTAL_VEHICLE_BLOCKED");
    expect((await send(offline.id)).status).toBe(404);
    // A vehicle that is out of service is never bookable, whatever the calendar says.
    const busy = await send(broken.id);
    expect(busy.status).toBe(409);
    expect(busy.body.code).toBe("PORTAL_VEHICLE_UNAVAILABLE");
    const ok = await send(online.id);
    expect(ok.status).toBe(201);
    expect(ok.body.type).toBe("booking");
    expect(ok.body.payload.vehicleLabel).toContain(online.licensePlate);

    // Period first: a vehicle booked next month is free this week but not then.
    const nextMonth = new Date(); nextMonth.setDate(nextMonth.getDate() + 30);
    const nm = nextMonth.toISOString().slice(0, 10);
    const nmEnd = new Date(nextMonth.getTime() + 5 * 86_400_000).toISOString().slice(0, 10);
    await createTestReservation({ customerId: b, vehicleId: online.id, startDate: nm, endDate: nmEnd });
    const thisWeek = await agent.get(`/api/portal/vehicles?start=${today}&end=${today}`);
    expect(thisWeek.body.map((v: any) => v.id)).toContain(online.id);
    const thatWeek = await agent.get(`/api/portal/vehicles?start=${nm}&end=${nmEnd}`);
    expect(thatWeek.body.map((v: any) => v.id)).not.toContain(online.id);
    expect((await agent.get(`/api/portal/vehicles?start=${nmEnd}&end=${nm}`)).status).toBe(400);
    // A rented vehicle with a free calendar in the period is offered when a period is given.
    expect(((await agent.get(`/api/portal/vehicles?start=${nm}&end=${nmEnd}`)).body as any[]).map((v) => v.id)).toContain(rented.id);
    // Booking that period on the busy vehicle is refused; a duplicate open request too.
    const sendFull = (vehicleId: number, payload: Record<string, unknown>) => agent.post("/api/portal/requests").set("X-CSRF-Token", csrf)
      .field("type", "booking").field("message", "Graag").field("payload", JSON.stringify({ vehicleId, ...payload }));
    expect((await sendFull(online.id, { startDate: nm, endDate: nmEnd })).status).toBe(409);
    expect((await sendFull(broken.id, { startDate: nm, endDate: nmEnd })).status).toBe(409);
    // The earlier open-ended request for this vehicle already covers today.
    const dup = await sendFull(online.id, { startDate: today, endDate: today });
    expect(dup.status).toBe(409);
    expect(dup.body.code).toBe("PORTAL_DUPLICATE_REQUEST");
    // Driver and times travel with the request.
    const chauffeur = await createTestDriver(a, "Chauffeur B");
    const withDriver = await sendFull(rented.id, { startDate: today, endDate: today, startTime: "09:00", endTime: "17:30", driverId: chauffeur.id });
    expect(withDriver.status).toBe(201);
    expect(withDriver.body.payload).toMatchObject({ startTime: "09:00", endTime: "17:30", driverId: String(chauffeur.id), driverLabel: "Chauffeur B" });
    expect((await sendFull(rented.id, { startDate: today, endDate: today, startTime: "9h" })).status).toBe(400);
    // Withdraw: only while nothing happened to it yet.
    expect((await agent.delete(`/api/portal/requests/${withDriver.body.id}`).set("X-CSRF-Token", csrf)).status).toBe(200);
    expect((await agent.get(`/api/portal/requests/${withDriver.body.id}`)).status).toBe(404);
    await requestsStorage.updateRequest(ok.body.id, { status: "in_progress" });
    expect((await agent.delete(`/api/portal/requests/${ok.body.id}`).set("X-CSRF-Token", csrf)).status).toBe(400);

    // Lifting the block makes the vehicle visible and bookable again.
    await storage.removeFromBlacklist(block.id);
    expect(((await agent.get("/api/portal/vehicles")).body as any[]).map((v) => v.id)).toContain(blockedForA.id);
    expect((await send(blockedForA.id)).status).toBe(201);

    // Booking is off for this customer: list and request both refused.
    await portalStorage.updateCustomerSettings(a, { canBook: false }, "t");
    expect((await agent.get("/api/portal/vehicles")).status).toBe(403);
    expect((await send(online.id)).status).toBe(403);
    await portalStorage.updateCustomerSettings(a, { canBook: true }, "t");
  });

  it("maintenance and mileage requests, the conversation on a request, contract acknowledgement and the bell", async () => {
    const { agent, csrf } = await loginAs(app, emailA);
    const maint = await agent.post("/api/portal/requests").set("X-CSRF-Token", csrf)
      .field("type", "maintenance").field("message", "Er brandt een lampje").field("reservationId", String(resA))
      .field("payload", JSON.stringify({ issue: "Motorlampje brandt", mileage: "12345", urgent: "true" }));
    expect(maint.status).toBe(201);
    expect(maint.body.payload).toMatchObject({ issue: "Motorlampje brandt", mileage: 12345, urgent: true });
    const km = await agent.post("/api/portal/requests").set("X-CSRF-Token", csrf)
      .field("type", "mileage").field("message", "Stand doorgegeven").field("reservationId", String(resA)).field("payload", JSON.stringify({ mileage: "12400" }));
    expect(km.status).toBe(201);
    expect(km.body.payload.mileage).toBe(12400);
    expect((await agent.post("/api/portal/requests").set("X-CSRF-Token", csrf).field("type", "maintenance").field("message", "x").field("reservationId", String(resA)).field("payload", JSON.stringify({}))).status).toBe(400);

    // Conversation: the customer can add to an open request, not to a closed one.
    const msg = await agent.post(`/api/portal/requests/${maint.body.id}/messages`).set("X-CSRF-Token", csrf).send({ body: "Het lampje is oranje, geen rood." });
    expect(msg.status).toBe(201);
    expect(msg.body).toMatchObject({ author: "customer", body: "Het lampje is oranje, geen rood." });
    expect((await agent.get(`/api/portal/requests/${maint.body.id}`)).body.messages).toHaveLength(1);
    await requestsStorage.updateRequest(km.body.id, { status: "done" });
    expect((await agent.post(`/api/portal/requests/${km.body.id}/messages`).set("X-CSRF-Token", csrf).send({ body: "nog iets" })).status).toBe(400);

    // Contract acknowledgement: once, with the user's name; second call returns the first.
    const docs = await agent.get("/api/portal/documents");
    const contract = docs.body.find((d: any) => d.id === docA);
    expect(contract.ack).toBeNull();
    const ack = await agent.post(`/api/portal/documents/${docA}/ack`).set("X-CSRF-Token", csrf);
    expect(ack.status).toBe(200);
    expect(ack.body.by).toBe("U");
    const again = await agent.post(`/api/portal/documents/${docA}/ack`).set("X-CSRF-Token", csrf);
    expect(again.body.at).toBe(ack.body.at);
    expect((await agent.get("/api/portal/documents")).body.find((d: any) => d.id === docA).ack.by).toBe("U");

    // The bell: a notification written for the customer shows up unread, then read.
    await customerNotifications.notify({ customerId: a, type: "test", title: "Testmelding", description: "Hallo", link: "/aanvragen/1" });
    expect((await agent.get("/api/portal/notifications/unread-count")).body.count).toBeGreaterThanOrEqual(1);
    const list = await agent.get("/api/portal/notifications");
    const mine = list.body.find((n: any) => n.title === "Testmelding");
    expect(mine.isRead).toBe(false);
    expect((await agent.post("/api/portal/notifications/read").set("X-CSRF-Token", csrf).send({ ids: [mine.id] })).status).toBe(200);
    expect((await agent.get("/api/portal/notifications")).body.find((n: any) => n.id === mine.id).isRead).toBe(true);
    // Customer B never sees A's notification.
    const asB = await loginAs(app, emailB);
    expect((await asB.agent.get("/api/portal/notifications")).body.some((n: any) => n.id === mine.id)).toBe(false);
  });

  it("driver-role users cannot manage drivers", async () => {
    const du = await portalStorage.createPortalUser({ customerId: a, email: `d@${TEST_EMAIL_DOMAIN}`, fullName: "D", role: "driver", driverId: driverA }, "t");
    await portalStorage.updatePortalUser(du.id, { passwordHash: await hashPassword(password) });
    const { agent, csrf } = await loginAs(app, `d@${TEST_EMAIL_DOMAIN}`);
    const res = await agent.post("/api/portal/drivers").set("X-CSRF-Token", csrf).send({ displayName: "X" });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("PORTAL_ROLE_FORBIDDEN");
  });
});

describe("my vehicles", () => {
  const app = buildPortalTestApp();
  let customerId: number, agent: ReturnType<typeof request.agent>, csrf: string, vehicleId: number, rentalId: number, otherCustomerId: number;
  const email = `mv@${TEST_EMAIL_DOMAIN}`;
  const isoDayOffset = (days: number) => new Date(Date.now() + days * 24 * 3600e3).toISOString().slice(0, 10);
  const threeDaysAgo = isoDayOffset(-3);
  const nextMonthStart = isoDayOffset(30);
  const nextMonthEnd = isoDayOffset(35);

  beforeAll(async () => {
    customerId = (await createTestCustomer("MV")).id;
    otherCustomerId = (await createTestCustomer("MVO")).id;
    vehicleId = (await createTestVehicle()).id;
    rentalId = (await createTestReservation({ customerId, vehicleId, startDate: "2026-09-01", endDate: null, status: "picked_up" })).id;
    await createTestReservation({ customerId, vehicleId: (await createTestVehicle()).id, startDate: "2026-12-01", endDate: "2026-12-05", status: "booked" });
    await createTestReservation({ customerId: otherCustomerId, vehicleId: (await createTestVehicle()).id, startDate: "2026-09-01", endDate: null, status: "picked_up" });
    // A placeholder spare for our rental must never show up.
    await db.insert(reservations).values({ customerId, vehicleId: null, startDate: "2026-10-10", endDate: "2026-10-11", status: "booked", type: "replacement", placeholderSpare: true, replacementForReservationId: rentalId });
    const u = await portalStorage.createPortalUser({ customerId, email, fullName: "MV", role: "admin" }, "t");
    await portalStorage.updatePortalUser(u.id, { passwordHash: await hashPassword(password) });
    ({ agent, csrf } = await loginAs(app, email));
  });
  afterAll(async () => { await cleanupPortalTestData(); });

  it("lists only vehicles in use, with maintenance info and the 48-hour flag", async () => {
    const block = await storage.createMaintenanceBlock(vehicleId, "2099-10-10", "2099-10-11");
    const res = await agent.get("/api/portal/vehicles/mine");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({ reservationId: rentalId, vehicle: { id: vehicleId }, maintenance: { blockId: block.id, status: "scheduled", canRequestChange: true, replacement: null } });
    await db.update(reservations).set({ startDate: new Date(Date.now() + 24 * 3600e3).toISOString().slice(0, 10), endDate: null }).where(eq(reservations.id, block.id));
    expect((await agent.get("/api/portal/vehicles/mine")).body[0].maintenance.canRequestChange).toBe(false);
  });

  it("prefers the upcoming scheduled block over a recently finished out block", async () => {
    const v = (await createTestVehicle()).id;
    await createTestReservation({ customerId, vehicleId: v, startDate: "2026-09-01", endDate: null, status: "picked_up" });
    const outBlock = await storage.createMaintenanceBlock(v, "2026-08-20", threeDaysAgo);
    await db.update(reservations).set({ maintenanceStatus: "out" }).where(eq(reservations.id, outBlock.id));
    const scheduledBlock = await storage.createMaintenanceBlock(v, nextMonthStart, nextMonthEnd);
    const res = await agent.get("/api/portal/vehicles/mine");
    const item = res.body.find((x: any) => x.vehicle.id === v);
    expect(item.maintenance.blockId).toBe(scheduledBlock.id);
  });

  it("falls back to the recent out block when there is no upcoming block", async () => {
    const v = (await createTestVehicle()).id;
    await createTestReservation({ customerId, vehicleId: v, startDate: "2026-09-01", endDate: null, status: "picked_up" });
    const outBlock = await storage.createMaintenanceBlock(v, "2026-08-20", threeDaysAgo);
    await db.update(reservations).set({ maintenanceStatus: "out" }).where(eq(reservations.id, outBlock.id));
    const res = await agent.get("/api/portal/vehicles/mine");
    const item = res.body.find((x: any) => x.vehicle.id === v);
    expect(item.maintenance.status).toBe("out");
  });

  it("sees an open-ended block that started before the rental", async () => {
    const v = (await createTestVehicle()).id;
    await createTestReservation({ customerId, vehicleId: v, startDate: "2026-09-01", endDate: null, status: "picked_up" });
    const block = await storage.createMaintenanceBlock(v, "2026-08-20");
    await db.update(reservations).set({ maintenanceStatus: "in" }).where(eq(reservations.id, block.id));
    const res = await agent.get("/api/portal/vehicles/mine");
    const item = res.body.find((x: any) => x.vehicle.id === v);
    expect(item.maintenance).toMatchObject({ blockId: block.id, status: "in", endDate: null, canRequestChange: false });
  });

  it("counts a block for a picked-up rental whose startDate is later than the block", async () => {
    const v = (await createTestVehicle()).id;
    await createTestReservation({ customerId, vehicleId: v, startDate: "2099-01-10", endDate: null, status: "picked_up" });
    const block = await storage.createMaintenanceBlock(v, "2098-12-20", "2098-12-21");
    const res = await agent.get("/api/portal/vehicles/mine");
    const item = res.body.find((x: any) => x.vehicle.id === v);
    expect(item.maintenance.blockId).toBe(block.id);
  });

  it("scopes a driver login to only their own rental", async () => {
    const driver = await createTestDriver(customerId, "Rijder");
    const driverVehicleId = (await createTestVehicle()).id;
    const driverRentalId = (await createTestReservation({ customerId, vehicleId: driverVehicleId, driverId: driver.id, startDate: "2026-09-01", endDate: null, status: "picked_up" })).id;
    const driverEmail = `mvd@${TEST_EMAIL_DOMAIN}`;
    const du = await portalStorage.createPortalUser({ customerId, email: driverEmail, fullName: "MV Driver", role: "driver", driverId: driver.id }, "t");
    await portalStorage.updatePortalUser(du.id, { passwordHash: await hashPassword(password) });
    const { agent: driverAgent } = await loginAs(app, driverEmail);
    const res = await driverAgent.get("/api/portal/vehicles/mine");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].reservationId).toBe(driverRentalId);
    expect(res.body[0].vehicle.id).toBe(driverVehicleId);
  });

  // Amsterdam-local date/time for a maintenance block, robust to the test machine's own timezone.
  const amsDate = (d: Date) => {
    const parts = new Intl.DateTimeFormat("nl-NL", { timeZone: "Europe/Amsterdam", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(d);
    const get = (t: string) => parts.find((x) => x.type === t)!.value;
    return `${get("year")}-${get("month")}-${get("day")}`;
  };
  const amsTime = (d: Date) => {
    const hm = new Intl.DateTimeFormat("nl-NL", { timeZone: "Europe/Amsterdam", hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
    return hm.startsWith("24") ? `00${hm.slice(2)}` : hm;
  };

  it("one open maintenance report per rental", async () => {
    const body = { type: "maintenance", message: "Piept", reservationId: rentalId, payload: JSON.stringify({ issue: "Piept bij remmen", needsReplacement: "true" }) };
    expect((await agent.post("/api/portal/requests").set("X-CSRF-Token", csrf).send(body)).status).toBe(201);
    const dup = await agent.post("/api/portal/requests").set("X-CSRF-Token", csrf).send(body);
    expect(dup.status).toBe(409);
    expect(dup.body.code).toBe("PORTAL_DUPLICATE_REQUEST");
  });

  it("maintenance change: allowed 49 hours before, refused 47 hours before, once the car is in, and twice", async () => {
    const far = new Date(Date.now() + 49 * 3600e3), near = new Date(Date.now() + 47 * 3600e3);
    const okBlock = await storage.createMaintenanceBlock(vehicleId, amsDate(far), undefined);
    await db.update(reservations).set({ startTime: amsTime(far) }).where(eq(reservations.id, okBlock.id));
    const change = (blockId: number) => agent.post("/api/portal/requests").set("X-CSRF-Token", csrf).send({ type: "maintenance_change", message: "Past niet", reservationId: blockId, payload: JSON.stringify({ newDate: "2099-01-05", reason: "Vakantie" }) });
    expect((await change(okBlock.id)).status).toBe(201);
    const twice = await change(okBlock.id);
    expect(twice.status).toBe(409);
    expect(twice.body.code).toBe("PORTAL_DUPLICATE_REQUEST");
    const lateBlock = await storage.createMaintenanceBlock(vehicleId, amsDate(near), undefined);
    await db.update(reservations).set({ startTime: amsTime(near) }).where(eq(reservations.id, lateBlock.id));
    const late = await change(lateBlock.id);
    expect(late.status).toBe(400);
    expect(late.body.code).toBe("PORTAL_MAINTENANCE_TOO_LATE");
    const inBlock = await storage.createMaintenanceBlock(vehicleId, "2099-03-01", "2099-03-02");
    await db.update(reservations).set({ maintenanceStatus: "in" }).where(eq(reservations.id, inBlock.id));
    expect((await change(inBlock.id)).body.code).toBe("PORTAL_MAINTENANCE_TOO_LATE");
    const foreign = await storage.createMaintenanceBlock((await createTestVehicle()).id, "2099-04-01", "2099-04-02");
    expect((await change(foreign.id)).status).toBe(404);
  });
});
