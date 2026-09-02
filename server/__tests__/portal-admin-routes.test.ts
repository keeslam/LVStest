import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import express from "express";
import request from "supertest";

const { sendEmail } = vi.hoisted(() => ({ sendEmail: vi.fn(async () => true) }));
vi.mock("../utils/email-service", () => ({ sendEmail }));

import { registerPortalAdminRoutes } from "../routes/portal-admin";
import { createTestCustomer, createTestVehicle, createTestDriver, cleanupPortalTestData, TEST_EMAIL_DOMAIN } from "./portal-helpers";
import { portalStorage } from "../services/portal-storage";
import { UserPermission } from "../../shared/schema";

function staffApp(permissions: string[]) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).user = { id: 1, username: "staff-test", role: "manager", permissions };
    (req as any).isAuthenticated = () => true;
    next();
  });
  registerPortalAdminRoutes(app, { requireAuth: (_r: any, _s: any, n: any) => n() } as any);
  return app;
}

describe("portal admin routes", () => {
  const app = staffApp([UserPermission.MANAGE_PORTAL]);
  const viewer = staffApp([UserPermission.VIEW_PORTAL]);
  let customerId: number, driverId: number, vehicleId: number, accountId: number;

  beforeAll(async () => {
    await cleanupPortalTestData();
    customerId = (await createTestCustomer("Adm")).id;
    driverId = (await createTestDriver(customerId)).id;
    vehicleId = (await createTestVehicle()).id;
  });
  afterAll(cleanupPortalTestData);

  it("creates an account and sends the invitation", async () => {
    const res = await request(app).post(`/api/portal-admin/customers/${customerId}/accounts`)
      .send({ email: `adm@${TEST_EMAIL_DOMAIN}`, fullName: "Adm", role: "admin" });
    expect(res.status).toBe(201);
    expect(res.body.inviteSent).toBe(true);
    accountId = res.body.account.id;
    expect(res.body.account).not.toHaveProperty("passwordHash");
    expect(res.body.account).not.toHaveProperty("inviteTokenHash");
  });

  it("rejects a driver account whose driver belongs to another customer", async () => {
    const other = await createTestCustomer("Adm2");
    const foreign = await createTestDriver(other.id);
    const res = await request(app).post(`/api/portal-admin/customers/${customerId}/accounts`)
      .send({ email: `drv@${TEST_EMAIL_DOMAIN}`, fullName: "D", role: "driver", driverId: foreign.id });
    expect(res.status).toBe(400);
    const ok = await request(app).post(`/api/portal-admin/customers/${customerId}/accounts`)
      .send({ email: `drv@${TEST_EMAIL_DOMAIN}`, fullName: "D", role: "driver", driverId });
    expect(ok.status).toBe(201);
  });

  it("viewers can read but not change", async () => {
    expect((await request(viewer).get(`/api/portal-admin/customers/${customerId}/accounts`)).status).toBe(200);
    expect((await request(viewer).patch(`/api/portal-admin/accounts/${accountId}`).send({ active: false })).status).toBe(403);
  });

  it("updates switches and deletes a never-activated account", async () => {
    const s = await request(app).patch(`/api/portal-admin/customers/${customerId}/settings`).send({ canSubmitRequests: false, internalNotes: "Wil alleen bellen" });
    expect(s.status).toBe(200);
    expect(s.body.canSubmitRequests).toBe(false);
    expect((await request(app).delete(`/api/portal-admin/accounts/${accountId}`)).status).toBe(200);
    expect(await portalStorage.getPortalUser(accountId)).toBeUndefined();
  });

  it("toggles vehicles online, singly and in bulk", async () => {
    const one = await request(app).patch(`/api/portal-admin/vehicles-online/${vehicleId}`).send({ offeredOnline: true, onlineDescription: "Bestelbus L2H2" });
    expect(one.body.offeredOnline).toBe(true);
    const bulk = await request(app).post(`/api/portal-admin/vehicles-online/bulk`).send({ ids: [vehicleId], offeredOnline: false });
    expect(bulk.body.updated).toBe(1);
    const list = await request(app).get(`/api/portal-admin/vehicles-online`);
    expect(list.body.find((v: any) => v.id === vehicleId).offeredOnline).toBe(false);
  });

  it("saves and reads config", async () => {
    const put = await request(app).put(`/api/portal-admin/config`).send({ allowedFrameOrigins: ["https://lamgroep.nl", "http://lamgroep.local"], notificationEmail: `staff@${TEST_EMAIL_DOMAIN}`, portalBaseUrl: "https://portaal.lamgroep.nl" });
    expect(put.status).toBe(200);
    const get = await request(app).get(`/api/portal-admin/config`);
    expect(get.body.allowedFrameOrigins).toContain("http://lamgroep.local");
    const bad = await request(app).put(`/api/portal-admin/config`).send({ allowedFrameOrigins: ["not a url"] });
    expect(bad.status).toBe(400);
  });
});
