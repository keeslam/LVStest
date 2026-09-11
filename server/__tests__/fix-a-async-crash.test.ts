/**
 * FIX-A — async error handling (BUG-002, BUG-061, BUG-101).
 *
 * Each of these three payloads used to escape its async handler as an
 * unhandled rejection, which `server/index.ts` turned into a graceful shutdown:
 * one request from a low-privileged account stopped the whole application.
 * In-process here (fast); the *survival* assertion lives in
 * fix-a-process-policy.test.ts, which drives a real child process.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";

const { sendEmail, notify } = vi.hoisted(() => ({ sendEmail: vi.fn(async () => true), notify: vi.fn(async () => undefined) }));
vi.mock("../utils/email-service", () => ({ sendEmail }));
vi.mock("../services/portal-notifications", () => ({ notifyStaffOfPortalEvent: notify }));

import express from "express";
import { buildPortalTestApp, buildStaffTestApp, createTestCustomer, cleanupPortalTestData, TEST_EMAIL_DOMAIN } from "./portal-helpers";
import { portalStorage } from "../services/portal-storage";
import { hashPassword } from "../auth";
import { registerPortalAdminRoutes } from "../routes/portal-admin";
import { registerFineRoutes } from "../routes/fines";
import { UserPermission } from "../../shared/schema";
import { parseCjibFile } from "../services/cjib/parser";

const password = "wachtwoord-1234";

describe("FIX-A — a bad payload must not kill the process", () => {
  const portalApp = buildPortalTestApp();
  let customerId: number;
  const email = `crash@${TEST_EMAIL_DOMAIN}`;

  beforeAll(async () => {
    await cleanupPortalTestData();
    customerId = (await createTestCustomer("Crash")).id;
    const u = await portalStorage.createPortalUser({ customerId, email, fullName: "U", role: "admin" }, "t");
    await portalStorage.updatePortalUser(u.id, { passwordHash: await hashPassword(password) });
  });
  afterAll(cleanupPortalTestData);

  it("BUG-002: POST /api/portal/requests with an unparseable payload is a 400, and the app keeps answering", async () => {
    const agent = request.agent(portalApp);
    expect((await agent.post("/api/portal/login").send({ email, password })).status).toBe(200);
    const { body } = await agent.get("/api/portal/csrf-token");

    const res = await agent
      .post("/api/portal/requests")
      .set("X-CSRF-Token", body.token)
      .field("type", "other")
      .field("message", "Dit is een vraag")
      .field("payload", "not-json-at-all");

    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).not.toContain("JSON.parse");

    // The very next request on the same app instance must still answer.
    const after = await agent.get("/api/portal/me");
    expect([200, 401]).toContain(after.status);
  });

  it("BUG-061: portal-admin settings for a non-existent customer is a 404, not an FK violation", async () => {
    const app = buildStaffTestApp([UserPermission.VIEW_PORTAL, UserPermission.MANAGE_PORTAL], (a) =>
      registerPortalAdminRoutes(a, { requireAuth: (_r: any, _s: any, n: any) => n() } as any));

    const res = await request(app).get("/api/portal-admin/customers/999999999/settings");
    expect(res.status).toBe(404);
    const text = JSON.stringify(res.body).toLowerCase();
    expect(text).not.toContain("foreign key");
    expect(text).not.toContain("violates");

    // And the app still serves.
    expect((await request(app).get(`/api/portal-admin/customers/${customerId}/settings`)).status).toBe(200);
  });

  it("BUG-101: deeply nested CJIB XML throws a normal parse error, never a stack overflow", () => {
    const depth = 200;
    const xml = "<?xml version=\"1.0\"?>" + "<a>".repeat(depth) + "<x/>" + "</a>".repeat(depth);
    let thrown: unknown;
    try { parseCjibFile(Buffer.from(xml), "deep.xml"); } catch (e) { thrown = e; }
    expect(thrown).toBeInstanceOf(Error);
    // A RangeError ("Maximum call stack size exceeded") is the crash this bug is
    // about; anything else is a handled parse failure.
    expect(thrown).not.toBeInstanceOf(RangeError);
    expect((thrown as Error).message).toMatch(/could not be parsed|nested deeper than/i);
  });

  it("BUG-101: the upload route answers 400 for a file the parser cannot read", async () => {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      (req as any).user = { id: 1, username: "staff-test", role: "manager", permissions: [UserPermission.MANAGE_FINES] };
      (req as any).isAuthenticated = () => true;
      next();
    });
    registerFineRoutes(app, { requireAuth: (_r: any, _s: any, n: any) => n() } as any);

    const depth = 200;
    const xml = "<?xml version=\"1.0\"?>" + "<a>".repeat(depth) + "<x/>" + "</a>".repeat(depth);
    const res = await request(app)
      .post("/api/fines/imports/upload")
      .attach("file", Buffer.from(xml), { filename: `__portal_test__deep-${Date.now()}.xml`, contentType: "application/xml" });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/nested deeper than|could not be parsed/i);
  });
});
