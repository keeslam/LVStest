import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";

const { sendEmail } = vi.hoisted(() => ({ sendEmail: vi.fn(async () => true) }));
vi.mock("../utils/email-service", () => ({ sendEmail }));

import { buildPortalTestApp, createTestCustomer, createTestDriver, cleanupPortalTestData, TEST_EMAIL_DOMAIN } from "./portal-helpers";
import { portalStorage } from "../services/portal-storage";
import { sendPortalInvite } from "../services/portal-mail";
import { hashPassword } from "../auth";

const email = `login@${TEST_EMAIL_DOMAIN}`;
const password = "wachtwoord-1234";

describe("portal auth", () => {
  const app = buildPortalTestApp();
  let customerId: number, userId: number;

  beforeAll(async () => {
    await cleanupPortalTestData();
    customerId = (await createTestCustomer("Auth")).id;
    const user = await portalStorage.createPortalUser({ customerId, email, fullName: "Login", role: "admin" }, "t");
    userId = user.id;
    await portalStorage.updatePortalUser(userId, { passwordHash: await hashPassword(password) });
  });
  afterAll(cleanupPortalTestData);

  it("rejects /me without a session", async () => {
    const res = await request(app).get("/api/portal/me");
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("PORTAL_NOT_AUTHENTICATED");
  });

  it("logs in with the portal cookie and returns me with settings", async () => {
    const agent = request.agent(app);
    const login = await agent.post("/api/portal/login").send({ email: email.toUpperCase(), password });
    expect(login.status).toBe(200);
    const cookies = login.headers["set-cookie"] as unknown as string[];
    expect(cookies.some((c) => c.startsWith("portal.sid=") && c.includes("SameSite=Lax"))).toBe(true);
    const me = await agent.get("/api/portal/me");
    expect(me.body.customerId).toBe(customerId);
    expect(me.body.settings.canManageDrivers).toBe(true);
    expect(me.body.role).toBe("admin");
  });

  it("refuses wrong passwords without saying which part is wrong", async () => {
    const res = await request(app).post("/api/portal/login").send({ email, password: "nope-nope-nope" });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("PORTAL_INVALID_CREDENTIALS");
  });

  it("blocks a customer whose portal is disabled", async () => {
    await portalStorage.updateCustomerSettings(customerId, { portalEnabled: false }, "t");
    const res = await request(app).post("/api/portal/login").send({ email, password });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("PORTAL_DISABLED");
    await portalStorage.updateCustomerSettings(customerId, { portalEnabled: true }, "t");
  });

  it("activates through an invitation token and rejects it twice", async () => {
    const invited = await portalStorage.createPortalUser({ customerId, email: `new@${TEST_EMAIL_DOMAIN}`, fullName: "New", role: "admin" }, "t");
    const { token } = await sendPortalInvite(invited, "invite");
    const agent = request.agent(app);
    const ok = await agent.post("/api/portal/activate").send({ token, password: "nieuw-wachtwoord-1" });
    expect(ok.status).toBe(200);
    expect((await agent.get("/api/portal/me")).body.email).toBe(`new@${TEST_EMAIL_DOMAIN}`);
    const again = await request(app).post("/api/portal/activate").send({ token, password: "nieuw-wachtwoord-2" });
    expect(again.status).toBe(400);
    expect(again.body.code).toBe("PORTAL_TOKEN_INVALID");
    const short = await request(app).post("/api/portal/activate").send({ token: "a".repeat(64), password: "kort" });
    expect(short.body.code).toBe("PORTAL_VALIDATION");
  });

  it("forgot always answers 200 and mails only existing users", async () => {
    sendEmail.mockClear();
    expect((await request(app).post("/api/portal/forgot").send({ email })).status).toBe(200);
    expect((await request(app).post("/api/portal/forgot").send({ email: `ghost@${TEST_EMAIL_DOMAIN}` })).status).toBe(200);
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it("requires the CSRF token for mutations after login", async () => {
    const agent = request.agent(app);
    await agent.post("/api/portal/login").send({ email, password });
    const noToken = await agent.patch("/api/portal/me").send({ fullName: "X" });
    expect(noToken.status).toBe(403);
    const { body } = await agent.get("/api/portal/csrf-token");
    const ok = await agent.patch("/api/portal/me").set("X-CSRF-Token", body.token).send({ fullName: "Login 2" });
    expect(ok.status).toBe(200);
    expect(ok.body.fullName).toBe("Login 2");
  });

  it("driver-role users get their driver scope", async () => {
    const driver = await createTestDriver(customerId, "Chauffeur");
    const du = await portalStorage.createPortalUser({ customerId, email: `drv@${TEST_EMAIL_DOMAIN}`, fullName: "Drv", role: "driver", driverId: driver.id }, "t");
    await portalStorage.updatePortalUser(du.id, { passwordHash: await hashPassword(password) });
    const agent = request.agent(app);
    await agent.post("/api/portal/login").send({ email: `drv@${TEST_EMAIL_DOMAIN}`, password });
    const me = await agent.get("/api/portal/me");
    expect(me.body.role).toBe("driver");
    expect(me.body.driverId).toBe(driver.id);
  });
});
