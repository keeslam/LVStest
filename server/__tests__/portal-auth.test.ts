import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";

const { sendEmail } = vi.hoisted(() => ({ sendEmail: vi.fn(async () => true) }));
vi.mock("../utils/email-service", () => ({ sendEmail }));

import { buildPortalTestApp, createTestCustomer, createTestDriver, cleanupPortalTestData, TEST_EMAIL_DOMAIN } from "./portal-helpers";
import { portalStorage } from "../services/portal-storage";
import { sendPortalInvite } from "../services/portal-mail";
import { hashPassword } from "../auth";
import { storage } from "../storage";

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
    // The mail is sent after the answer (a known address must not answer slower than an unknown one).
    await vi.waitFor(() => expect(sendEmail).toHaveBeenCalledTimes(1));
    await new Promise((r) => setTimeout(r, 100));
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

  it("lets an account pick its own language and change its e-mail address after confirmation", async () => {
    const agent = request.agent(app);
    await agent.post("/api/portal/login").send({ email, password });
    const csrf = (await agent.get("/api/portal/csrf-token")).body.token as string;
    // Language: the account overrides the customer's default and can go back to it.
    expect((await agent.get("/api/portal/me")).body).toMatchObject({ language: "nl", languageOverride: null });
    expect((await agent.patch("/api/portal/me").set("X-CSRF-Token", csrf).send({ language: "en" })).body).toMatchObject({ language: "en", languageOverride: "en" });
    expect((await agent.patch("/api/portal/me").set("X-CSRF-Token", csrf).send({ language: null })).body.languageOverride).toBeNull();
    expect((await agent.patch("/api/portal/me").set("X-CSRF-Token", csrf).send({})).status).toBe(400);

    // E-mail: wrong password refused, address in use refused, otherwise a mail with a token goes to the new address.
    sendEmail.mockClear();
    const newEmail = `nieuw-adres@${TEST_EMAIL_DOMAIN}`;
    expect((await agent.post("/api/portal/me/email").set("X-CSRF-Token", csrf).send({ newEmail, currentPassword: "fout" })).body.code).toBe("PORTAL_INVALID_CREDENTIALS");
    const other = await portalStorage.createPortalUser({ customerId, email: `bezet@${TEST_EMAIL_DOMAIN}`, fullName: "Bezet", role: "admin" }, "t");
    // An address that belongs to another account is answered exactly like a free one (no way to find out who has an account), but no mail goes to it.
    sendEmail.mockClear();
    const takenAnswer = await agent.post("/api/portal/me/email").set("X-CSRF-Token", csrf).send({ newEmail: other.email, currentPassword: password });
    expect(takenAnswer.status).toBe(200);
    expect(takenAnswer.body).toEqual({ ok: true, pendingEmail: other.email.toLowerCase() });
    expect(sendEmail).not.toHaveBeenCalled();
    expect((await portalStorage.getPortalUser((await agent.get("/api/portal/me")).body.id))?.pendingEmail ?? null).toBeNull();
    const asked = await agent.post("/api/portal/me/email").set("X-CSRF-Token", csrf).send({ newEmail, currentPassword: password });
    expect(asked.status).toBe(200);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    const mail = (sendEmail as any).mock.calls[0][0];
    expect(mail.to).toBe(newEmail);
    const token = String(mail.html).match(/token=([0-9a-f]{64})/)?.[1];
    expect(token).toBeTruthy();
    expect((await agent.get("/api/portal/me")).body).toMatchObject({ email, pendingEmail: newEmail });

    // Until the link is used nothing changes; the public confirm route flips it once.
    const confirmed = await request(app).post("/api/portal/email/confirm").send({ token });
    expect(confirmed.status).toBe(200);
    expect(confirmed.body.email).toBe(newEmail);
    expect((await request(app).post("/api/portal/email/confirm").send({ token })).body.code).toBe("PORTAL_TOKEN_INVALID");
    // A confirmed change of the login address ends every session of the account, and the old address is told.
    expect((await agent.get("/api/portal/me")).status).toBe(401);
    const notice = (sendEmail as any).mock.calls.map((c: any) => c[0]).find((m: any) => m.to === email);
    expect(notice?.subject).toMatch(/gewijzigd/i);
    expect(String(notice?.html)).toContain(newEmail);
    const fresh = request.agent(app);
    expect((await fresh.post("/api/portal/login").send({ email: newEmail, password })).status).toBe(200);
    const freshMe = (await fresh.get("/api/portal/me")).body;
    expect(freshMe).toMatchObject({ email: newEmail, pendingEmail: null });
    // Put the address back for the tests that follow.
    await portalStorage.updatePortalUser(freshMe.id, { email });
    const admin = request.agent(app);
    expect((await admin.post("/api/portal/login").send({ email, password })).status).toBe(200);
    const csrfAdmin = (await admin.get("/api/portal/csrf-token")).body.token as string;

    // Company addresses: admins edit them, the customer record changes, staff get a notification.
    const saved = await admin.patch("/api/portal/me/company").set("X-CSRF-Token", csrfAdmin).send({ emailForMOT: `apk@${TEST_EMAIL_DOMAIN}`, emailForInvoices: `factuur@${TEST_EMAIL_DOMAIN}`, emailGeneral: "", currentPassword: password });
    expect(saved.status).toBe(200);
    expect(saved.body.company).toMatchObject({ emailForMOT: `apk@${TEST_EMAIL_DOMAIN}`, emailForInvoices: `factuur@${TEST_EMAIL_DOMAIN}`, emailGeneral: null });
    expect((await storage.getCustomer(customerId))?.emailForMOT).toBe(`apk@${TEST_EMAIL_DOMAIN}`);
    // The staff notification names the changed addresses in words, not by field name (audit A-15-5).
    const staffNote = (await storage.getUnreadCustomNotifications()).find((n) => n.type === "portal_customer_update" && n.link === `/customers?customer=${customerId}&tab=portal`);
    expect(staffNote?.description).toContain("APK-adres");
    expect(staffNote?.description).not.toContain("emailForMOT");
    expect((await admin.patch("/api/portal/me/company").set("X-CSRF-Token", csrfAdmin).send({ emailForMOT: "geen-adres", currentPassword: password })).status).toBe(400);
    // Changing these addresses asks for the password again: without it, or with a wrong one, nothing changes.
    expect((await admin.patch("/api/portal/me/company").set("X-CSRF-Token", csrfAdmin).send({ emailForInvoices: `omgeleid@${TEST_EMAIL_DOMAIN}` })).status).toBe(400);
    const wrong = await admin.patch("/api/portal/me/company").set("X-CSRF-Token", csrfAdmin).send({ emailForInvoices: `omgeleid@${TEST_EMAIL_DOMAIN}`, currentPassword: "fout-wachtwoord" });
    expect(wrong.status).toBe(400);
    expect(wrong.body.code).toBe("PORTAL_INVALID_CREDENTIALS");
    expect((await storage.getCustomer(customerId))?.emailForInvoices).toBe(`factuur@${TEST_EMAIL_DOMAIN}`);
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
