/**
 * Kees, 2026-10-18: customers export their vehicles, drivers and reservations as CSV. The file is
 * built in the browser; the server only writes down who exported which list, in the customer's own
 * activity log. A driver may not export the drivers list.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";

const { sendEmail } = vi.hoisted(() => ({ sendEmail: vi.fn(async () => true) }));
vi.mock("../utils/email-service", () => ({ sendEmail }));

import { and, eq } from "drizzle-orm";
import { buildPortalTestApp, createTestCustomer, cleanupPortalTestData, TEST_EMAIL_DOMAIN } from "./portal-helpers";
import { portalStorage } from "../services/portal-storage";
import { hashPassword } from "../auth";
import { db } from "../db";
import { portalActivityLog } from "../../shared/schema";

describe("portal CSV exports", () => {
  const app = buildPortalTestApp();
  const stamp = Date.now().toString(36);
  const adminEmail = `export-admin-${stamp}@${TEST_EMAIL_DOMAIN}`;
  const driverEmail = `export-driver-${stamp}@${TEST_EMAIL_DOMAIN}`;
  let customerId: number;

  const login = async (email: string) => {
    const agent = request.agent(app);
    expect((await agent.post("/api/portal/login").send({ email, password: "wachtwoord-1234" })).status).toBe(200);
    const csrf = (await agent.get("/api/portal/csrf-token")).body.token as string;
    return { agent, csrf };
  };

  beforeAll(async () => {
    await cleanupPortalTestData();
    customerId = (await createTestCustomer("Export")).id;
    for (const [email, role] of [[adminEmail, "admin"], [driverEmail, "driver"]] as const) {
      const user = await portalStorage.createPortalUser({ customerId, email, fullName: role, role }, "t");
      await portalStorage.updatePortalUser(user.id, { passwordHash: await hashPassword("wachtwoord-1234") });
    }
  });

  afterAll(async () => { await cleanupPortalTestData(); });

  it("logs which list was exported and how many rows", async () => {
    const { agent, csrf } = await login(adminEmail);
    const res = await agent.post("/api/portal/exports").set("X-CSRF-Token", csrf).send({ list: "reservations", rows: 85 });
    expect(res.status).toBe(200);
    const rows = await db.select().from(portalActivityLog).where(and(eq(portalActivityLog.customerId, customerId), eq(portalActivityLog.action, "export")));
    expect(rows).toHaveLength(1);
    expect(rows[0].details).toEqual({ list: "reservations", rows: 85 });
  });

  it("refuses an unknown list, a missing CSRF token and a driver exporting the drivers", async () => {
    const admin = await login(adminEmail);
    expect((await admin.agent.post("/api/portal/exports").set("X-CSRF-Token", admin.csrf).send({ list: "customers", rows: 1 })).status).toBe(400);
    expect((await admin.agent.post("/api/portal/exports").send({ list: "vehicles", rows: 1 })).status).toBe(403);

    const driver = await login(driverEmail);
    expect((await driver.agent.post("/api/portal/exports").set("X-CSRF-Token", driver.csrf).send({ list: "drivers", rows: 3 })).status).toBe(403);
    expect((await driver.agent.post("/api/portal/exports").set("X-CSRF-Token", driver.csrf).send({ list: "vehicles", rows: 3 })).status).toBe(200);
  });

  it("needs a portal login", async () => {
    expect((await request(app).post("/api/portal/exports").send({ list: "vehicles", rows: 1 })).status).toBeGreaterThanOrEqual(401);
  });
});
