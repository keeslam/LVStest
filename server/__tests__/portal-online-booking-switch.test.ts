/**
 * Kees, 2026-10-18: renting the vehicles offered online can be switched off for the whole portal
 * (App-instellingen > Klantenportaal). Off overrides the customer's own canBook: no vehicle list, no
 * rental request. Every other request keeps working.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";

const { sendEmail } = vi.hoisted(() => ({ sendEmail: vi.fn(async () => true) }));
vi.mock("../utils/email-service", () => ({ sendEmail }));

import { buildPortalTestApp, createTestCustomer, createTestVehicle, cleanupPortalTestData, TEST_EMAIL_DOMAIN } from "./portal-helpers";
import { portalStorage } from "../services/portal-storage";
import { getPortalConfig, savePortalConfig, clearPortalConfigCache } from "../services/portal-config";
import { storage } from "../storage";
import { hashPassword } from "../auth";
import { PORTAL_CONFIG_KEY, type PortalConfig } from "../../shared/portal-types";

describe("renting online vehicles on or off for the whole portal", () => {
  const app = buildPortalTestApp();
  const email = `booking-switch-${Date.now().toString(36)}@${TEST_EMAIL_DOMAIN}`;
  let before: PortalConfig;
  let hadRow = false;
  let vehicleId: number;

  const login = async () => {
    const agent = request.agent(app);
    expect((await agent.post("/api/portal/login").send({ email, password: "wachtwoord-1234" })).status).toBe(200);
    const csrf = (await agent.get("/api/portal/csrf-token")).body.token as string;
    return { agent, csrf };
  };
  const bookingBody = () => ({ type: "booking", payload: { vehicleId, startDate: "2099-03-01", endDate: "2099-03-05" }, message: "Graag" });

  beforeAll(async () => {
    await cleanupPortalTestData();
    clearPortalConfigCache();
    hadRow = Boolean(await storage.getAppSettingByKey(PORTAL_CONFIG_KEY));
    before = await getPortalConfig();
    const customerId = (await createTestCustomer("BookingSwitch")).id;
    await portalStorage.updateCustomerSettings(customerId, { canBook: true, canSubmitRequests: true }, "t");
    vehicleId = (await createTestVehicle()).id;
    const user = await portalStorage.createPortalUser({ customerId, email, fullName: "Schakelaar", role: "admin" }, "t");
    await portalStorage.updatePortalUser(user.id, { passwordHash: await hashPassword("wachtwoord-1234") });
  });

  afterAll(async () => {
    // Put the configuration back as it was (or the default, which is on).
    await savePortalConfig(hadRow ? before : { ...before, onlineBookingEnabled: true }, "test");
    clearPortalConfigCache();
    await cleanupPortalTestData();
  });

  it("with online booking on, the customer's own switch decides", async () => {
    await savePortalConfig({ ...before, onlineBookingEnabled: true }, "test");
    const { agent } = await login();
    const me = (await agent.get("/api/portal/me")).body;
    expect(me.settings.canBook).toBe(true);
    expect(me.settings.canSubmitRequests).toBe(true);
    expect((await agent.get("/api/portal/vehicles")).status).toBe(200);
  });

  it("with online booking off: no vehicle list and no rental request, but other requests still go through", async () => {
    await savePortalConfig({ ...before, onlineBookingEnabled: false }, "test");
    const { agent, csrf } = await login();
    const me = (await agent.get("/api/portal/me")).body;
    expect(me.settings.canBook).toBe(false);
    expect(me.settings.canSubmitRequests).toBe(true);

    const vehicles = await agent.get("/api/portal/vehicles");
    expect(vehicles.status).toBe(403);
    expect(vehicles.body.code).toBe("PORTAL_FEATURE_DISABLED");
    expect((await agent.post("/api/portal/requests").set("X-CSRF-Token", csrf).send(bookingBody())).status).toBe(403);

    expect((await agent.get("/api/portal/requests")).status).toBe(200);
    const other = await agent.post("/api/portal/requests").set("X-CSRF-Token", csrf).send({ type: "other", payload: { subject: "Vraag" }, message: "Hallo" });
    expect(other.status).toBe(201);
  });

  it("is kept when the rest of the configuration is saved without it", async () => {
    await savePortalConfig({ ...before, onlineBookingEnabled: false }, "test");
    const { onlineBookingEnabled: _dropped, ...rest } = before;
    // An older screen that does not know the field must not quietly switch it back on.
    const saved = await savePortalConfig(rest, "test");
    expect(saved.onlineBookingEnabled).toBe(false);
  });
});
