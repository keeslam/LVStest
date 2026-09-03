import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";
const { notify } = vi.hoisted(() => ({ notify: vi.fn(async () => undefined) }));
vi.mock("../utils/email-service", () => ({ sendEmail: vi.fn(async () => true) }));
vi.mock("../services/portal-notifications", () => ({ notifyStaffOfPortalEvent: notify }));

import { buildPortalTestApp, createTestCustomer, createTestVehicle, createTestDriver, createTestReservation, cleanupPortalTestData, TEST_EMAIL_DOMAIN } from "./portal-helpers";
import { portalStorage } from "../services/portal-storage";
import { hashPassword } from "../auth";

const password = "wachtwoord-1234";
async function login(app: any, email: string) {
  const agent = request.agent(app);
  expect((await agent.post("/api/portal/login").send({ email, password })).status).toBe(200);
  const { body } = await agent.get("/api/portal/csrf-token");
  return { agent, csrf: body.token as string };
}

describe("portal requests (customer)", () => {
  const app = buildPortalTestApp();
  let a: number, b: number, resA: number, resB: number, driverId: number;
  beforeAll(async () => {
    await cleanupPortalTestData();
    a = (await createTestCustomer("PRA")).id; b = (await createTestCustomer("PRB")).id;
    const v = await createTestVehicle();
    driverId = (await createTestDriver(a)).id;
    resA = (await createTestReservation({ customerId: a, vehicleId: v.id, startDate: "2026-09-01", endDate: "2026-12-10", status: "picked_up" })).id;
    resB = (await createTestReservation({ customerId: b, vehicleId: v.id, startDate: "2027-01-01", endDate: "2027-01-05" })).id;
    for (const [cid, email, role, drv] of [[a, `pra@${TEST_EMAIL_DOMAIN}`, "admin", null], [a, `prd@${TEST_EMAIL_DOMAIN}`, "driver", driverId]] as const) {
      const u = await portalStorage.createPortalUser({ customerId: cid, email, fullName: "U", role, driverId: drv }, "t");
      await portalStorage.updatePortalUser(u.id, { passwordHash: await hashPassword(password) });
    }
  });
  afterAll(cleanupPortalTestData);

  it("creates an extension request with an attachment and notifies staff", async () => {
    const { agent, csrf } = await login(app, `pra@${TEST_EMAIL_DOMAIN}`);
    const res = await agent.post("/api/portal/requests").set("X-CSRF-Token", csrf)
      .field("type", "extension").field("reservationId", String(resA)).field("payload", JSON.stringify({ newEndDate: "2026-12-20" })).field("message", "Graag tot de 20e")
      .attach("attachments", Buffer.from("%PDF-1.4"), { filename: "bijlage.pdf", contentType: "application/pdf" });
    expect(res.status).toBe(201);
    expect(res.body.type).toBe("extension");
    expect(res.body.attachments).toHaveLength(1);
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ kind: "portal_request", customerId: a }));
    const att = await agent.get(`/api/portal/requests/${res.body.id}/attachments/${res.body.attachments[0].id}`);
    expect(att.status).toBe(200);
  });

  it("rejects invalid periods, foreign reservations and bad payloads", async () => {
    const { agent, csrf } = await login(app, `pra@${TEST_EMAIL_DOMAIN}`);
    const early = await agent.post("/api/portal/requests").set("X-CSRF-Token", csrf).send({ type: "extension", reservationId: resA, payload: { newEndDate: "2026-12-01" }, message: "x" });
    expect(early.body.code).toBe("PORTAL_REQUEST_INVALID_PERIOD");
    const foreign = await agent.post("/api/portal/requests").set("X-CSRF-Token", csrf).send({ type: "damage", reservationId: resB, payload: {}, message: "x" });
    expect(foreign.status).toBe(404);
    const bad = await agent.post("/api/portal/requests").set("X-CSRF-Token", csrf).send({ type: "other", payload: {}, message: "x" });
    expect(bad.body.code).toBe("PORTAL_VALIDATION");
  });

  it("drivers only see their own submissions", async () => {
    const admin = await login(app, `pra@${TEST_EMAIL_DOMAIN}`);
    expect((await admin.agent.get("/api/portal/requests")).body.length).toBe(1);
    const drv = await login(app, `prd@${TEST_EMAIL_DOMAIN}`);
    expect((await drv.agent.get("/api/portal/requests")).body).toEqual([]);
    const own = await drv.agent.post("/api/portal/requests").set("X-CSRF-Token", drv.csrf).send({ type: "other", payload: { subject: "Hoi" }, message: "Vraag" });
    expect(own.status).toBe(201);
    expect((await drv.agent.get("/api/portal/requests")).body.length).toBe(1);
    expect((await admin.agent.get("/api/portal/requests")).body.length).toBe(2);
  });
});
