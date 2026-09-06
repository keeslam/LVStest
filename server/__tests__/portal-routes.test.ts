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
    await storage.updateVehicle(online.id, { offeredOnline: true, onlineDescription: "Ruime bus" });
    await storage.updateVehicle(blockedForA.id, { offeredOnline: true });
    const block = await storage.addToBlacklist({ vehicleId: blockedForA.id, customerId: a, reason: "test", createdBy: null });

    const { agent, csrf } = await loginAs(app, emailA);
    const list = await agent.get("/api/portal/vehicles");
    expect(list.status).toBe(200);
    const ids = list.body.map((v: any) => v.id);
    expect(ids).toContain(online.id);
    expect(ids).not.toContain(blockedForA.id);
    expect(ids).not.toContain(offline.id);
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
    const ok = await send(online.id);
    expect(ok.status).toBe(201);
    expect(ok.body.type).toBe("booking");
    expect(ok.body.payload.vehicleLabel).toContain(online.licensePlate);

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

  it("driver-role users cannot manage drivers", async () => {
    const du = await portalStorage.createPortalUser({ customerId: a, email: `d@${TEST_EMAIL_DOMAIN}`, fullName: "D", role: "driver", driverId: driverA }, "t");
    await portalStorage.updatePortalUser(du.id, { passwordHash: await hashPassword(password) });
    const { agent, csrf } = await loginAs(app, `d@${TEST_EMAIL_DOMAIN}`);
    const res = await agent.post("/api/portal/drivers").set("X-CSRF-Token", csrf).send({ displayName: "X" });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("PORTAL_ROLE_FORBIDDEN");
  });
});
