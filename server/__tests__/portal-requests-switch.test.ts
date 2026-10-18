/**
 * Kees, 2026-10-18: requests can be switched off for the whole portal (Instellingen > Klantenportaal).
 * Off overrides the customer's own switch: the tab disappears and every request route says no.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { buildPortalTestApp, createTestCustomer, cleanupPortalTestData, TEST_EMAIL_DOMAIN } from "./portal-helpers";
import { portalStorage } from "../services/portal-storage";
import { getPortalConfig, savePortalConfig, clearPortalConfigCache } from "../services/portal-config";
import { storage } from "../storage";
import { hashPassword } from "../auth";
import { PORTAL_CONFIG_KEY, type PortalConfig } from "../../shared/portal-types";

describe("requests on or off for the whole portal", () => {
  const app = buildPortalTestApp();
  const email = `switch-${Date.now().toString(36)}@${TEST_EMAIL_DOMAIN}`;
  let before: PortalConfig;
  let hadRow = false;

  const login = async () => {
    const agent = request.agent(app);
    expect((await agent.post("/api/portal/login").send({ email, password: "wachtwoord-1234" })).status).toBe(200);
    const csrf = (await agent.get("/api/portal/csrf-token")).body.token as string;
    return { agent, csrf };
  };

  beforeAll(async () => {
    await cleanupPortalTestData();
    clearPortalConfigCache();
    hadRow = Boolean(await storage.getAppSettingByKey(PORTAL_CONFIG_KEY));
    before = await getPortalConfig();
    const customerId = (await createTestCustomer("Switch")).id;
    const user = await portalStorage.createPortalUser({ customerId, email, fullName: "Schakelaar", role: "admin" }, "t");
    await portalStorage.updatePortalUser(user.id, { passwordHash: await hashPassword("wachtwoord-1234") });
  });

  afterAll(async () => {
    // Put the configuration back exactly as it was (or as the default it was).
    if (hadRow) await savePortalConfig(before, "test");
    else await savePortalConfig({ ...before, requestsEnabled: true }, "test");
    clearPortalConfigCache();
    await cleanupPortalTestData();
  });

  it("with requests on, the customer's own switch decides", async () => {
    await savePortalConfig({ ...before, requestsEnabled: true }, "test");
    const { agent } = await login();
    expect((await agent.get("/api/portal/me")).body.settings.canSubmitRequests).toBe(true);
    expect((await agent.get("/api/portal/requests")).status).toBe(200);
  });

  it("with requests off, the tab is gone and every request route refuses", async () => {
    await savePortalConfig({ ...before, requestsEnabled: false }, "test");
    const { agent, csrf } = await login();
    expect((await agent.get("/api/portal/me")).body.settings.canSubmitRequests).toBe(false);
    const list = await agent.get("/api/portal/requests");
    expect(list.status).toBe(403);
    expect(list.body.code).toBe("PORTAL_FEATURE_DISABLED");
    const post = await agent.post("/api/portal/requests").set("X-CSRF-Token", csrf).send({ type: "other", message: "Hallo" });
    expect(post.status).toBe(403);
  });

  it("is kept when the rest of the configuration is saved without it", async () => {
    await savePortalConfig({ ...before, requestsEnabled: false }, "test");
    const { requestsEnabled: _dropped, ...rest } = before;
    // An older screen that does not know the field must not quietly switch requests back on.
    const saved = await savePortalConfig(rest, "test");
    expect(saved.requestsEnabled).toBe(false);
  });
});
