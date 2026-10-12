import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from "vitest";
import request from "supertest";

const { sendEmail } = vi.hoisted(() => ({ sendEmail: vi.fn(async () => true) }));
vi.mock("../utils/email-service", () => ({ sendEmail }));
vi.mock("../services/portal-config", () => ({
  getPortalConfig: async () => ({ allowedFrameOrigins: [], notificationEmail: "", portalBaseUrl: "https://portaal.lamgroep.nl", pickupAddress: "", openingHours: "", pickupInstructions: "", privacyUrl: "", phone: "" }),
}));

import { buildPortalTestApp, createTestCustomer, createTestDriver, cleanupPortalTestData, TEST_EMAIL_DOMAIN } from "./portal-helpers";
import { portalStorage } from "../services/portal-storage";
import { requestsStorage } from "../services/portal-requests-storage";
import {
  PORTAL_TEMPLATE, ensurePortalEmailTemplates, sendNewDeviceMail, sendMaintenanceMail, sendPortalCustomerMail,
  sendRequestReplyMail, requestReplyMailOptedOut, sendPortalInvite,
} from "../services/portal-mail";
import { hashPassword } from "../auth";

const password = "wachtwoord-1234";
const deviceInfo = { ua: "Test", ip: "127.0.0.1", at: new Date().toISOString() };

describe("portal mail preferences", () => {
  const app = buildPortalTestApp();
  let customerId: number;
  let adminId: number;
  let driverId: number;

  beforeAll(async () => {
    await cleanupPortalTestData();
    await ensurePortalEmailTemplates();
    const customer = await createTestCustomer("Voorkeur");
    customerId = customer.id;
    const { storage } = await import("../storage");
    await storage.updateCustomer(customerId, { email: `bedrijf@${TEST_EMAIL_DOMAIN}` } as any);
    const admin = await portalStorage.createPortalUser({ customerId, email: `admin@${TEST_EMAIL_DOMAIN}`, fullName: "Admin", role: "admin" }, "t");
    adminId = admin.id;
    await portalStorage.updatePortalUser(adminId, { passwordHash: await hashPassword(password) });
    const driver = await createTestDriver(customerId, "Chauffeur");
    const du = await portalStorage.createPortalUser({ customerId, email: `drv@${TEST_EMAIL_DOMAIN}`, fullName: "Drv", role: "driver", driverId: driver.id }, "t");
    driverId = du.id;
    await portalStorage.updatePortalUser(driverId, { passwordHash: await hashPassword(password) });
  });
  beforeEach(async () => {
    sendEmail.mockClear();
    await portalStorage.updatePortalUser(adminId, { mailPreferences: {} });
    await portalStorage.updateCustomerSettings(customerId, { mailReservationChanges: true, mailMaintenance: true, mailDocuments: true }, "t");
  });
  afterAll(cleanupPortalTestData);

  async function login(email: string) {
    const agent = request.agent(app);
    await agent.post("/api/portal/login").send({ email, password });
    const csrf = (await agent.get("/api/portal/csrf-token")).body.token as string;
    return { agent, csrf };
  }

  describe("senders", () => {
    it("sends everything by default (missing keys count as on)", async () => {
      const admin = (await portalStorage.getPortalUser(adminId))!;
      expect(await sendNewDeviceMail(admin, deviceInfo)).toBe(true);
      expect(await sendMaintenanceMail(customerId, { plate: "AB12CD", car: "Auto", event: "Onderhoud gepland", date: "2030-01-01", endDate: null })).toBe(true);
      expect(await sendPortalCustomerMail(customerId, PORTAL_TEMPLATE.RESERVATION_CHANGED, { plate: "AB12CD" }, "/reserveringen/1")).toBe(true);
      expect(await sendPortalCustomerMail(customerId, PORTAL_TEMPLATE.DOCUMENT_AVAILABLE, {}, "/documenten")).toBe(true);
      expect(sendEmail).toHaveBeenCalledTimes(4);
    });

    it("skips the new-device mail when the account switched it off, and only for that account", async () => {
      await portalStorage.updatePortalUser(adminId, { mailPreferences: { newDevice: false } });
      expect(await sendNewDeviceMail((await portalStorage.getPortalUser(adminId))!, deviceInfo)).toBe(false);
      expect(await sendNewDeviceMail((await portalStorage.getPortalUser(driverId))!, deviceInfo)).toBe(true);
      expect(sendEmail).toHaveBeenCalledTimes(1);
    });

    it("skips the reply to a request when its submitter switched it off, and reports that as opted out", async () => {
      const row = await requestsStorage.createRequest({ customerId, portalUserId: adminId, type: "other", message: "Vraag" });
      await requestsStorage.updateRequest(row.id, { staffReply: "Antwoord", status: "done" });
      expect(await requestReplyMailOptedOut(row.id)).toBe(false);
      expect(await sendRequestReplyMail(row.id)).toBe(true);

      sendEmail.mockClear();
      await portalStorage.updatePortalUser(adminId, { mailPreferences: { requestReply: false } });
      expect(await requestReplyMailOptedOut(row.id)).toBe(true);
      expect(await sendRequestReplyMail(row.id)).toBe(false);
      expect(sendEmail).not.toHaveBeenCalled();
    });

    it("skips each company mail only under its own switch", async () => {
      await portalStorage.updateCustomerSettings(customerId, { mailReservationChanges: false }, "t");
      expect(await sendPortalCustomerMail(customerId, PORTAL_TEMPLATE.RESERVATION_CHANGED, {}, "/x")).toBe(false);
      expect(await sendPortalCustomerMail(customerId, PORTAL_TEMPLATE.RESERVATION_CANCELLED, {}, "/x")).toBe(false);
      expect(await sendPortalCustomerMail(customerId, PORTAL_TEMPLATE.DOCUMENT_AVAILABLE, {}, "/x")).toBe(true);

      await portalStorage.updateCustomerSettings(customerId, { mailMaintenance: false }, "t");
      expect(await sendMaintenanceMail(customerId, { plate: "AB12CD", car: "Auto", event: "Onderhoud gepland", date: "2030-01-01", endDate: null })).toBe(false);

      await portalStorage.updateCustomerSettings(customerId, { mailDocuments: false }, "t");
      expect(await sendPortalCustomerMail(customerId, PORTAL_TEMPLATE.DOCUMENT_AVAILABLE, {}, "/x")).toBe(false);
    });

    it("never switches off the invitation and reset mails", async () => {
      await portalStorage.updatePortalUser(adminId, { mailPreferences: { newDevice: false, requestReply: false } });
      await portalStorage.updateCustomerSettings(customerId, { mailReservationChanges: false, mailMaintenance: false, mailDocuments: false }, "t");
      const admin = (await portalStorage.getPortalUser(adminId))!;
      expect((await sendPortalInvite(admin, "invite")).sent).toBe(true);
      expect((await sendPortalInvite(admin, "reset")).sent).toBe(true);
    });
  });

  describe("routes", () => {
    it("shows every preference in /me, with the company switches for admins only", async () => {
      const a = await login(`admin@${TEST_EMAIL_DOMAIN}`);
      const me = (await a.agent.get("/api/portal/me")).body;
      expect(me.mailPreferences).toEqual({ newDevice: true, requestReply: true });
      expect(me.companyMail).toEqual({ mailReservationChanges: true, mailMaintenance: true, mailDocuments: true });

      const d = await login(`drv@${TEST_EMAIL_DOMAIN}`);
      const driverMe = (await d.agent.get("/api/portal/me")).body;
      expect(driverMe.mailPreferences).toEqual({ newDevice: true, requestReply: true });
      expect(driverMe.companyMail).toBeUndefined();
    });

    it("lets any account change its own mails, and leaves the other accounts alone", async () => {
      const d = await login(`drv@${TEST_EMAIL_DOMAIN}`);
      const saved = await d.agent.patch("/api/portal/me/mail-preferences").set("X-CSRF-Token", d.csrf).send({ newDevice: false });
      expect(saved.status).toBe(200);
      expect(saved.body.mailPreferences).toEqual({ newDevice: false, requestReply: true });
      expect((await portalStorage.getPortalUser(adminId))!.mailPreferences).toEqual({});
      // A second change merges instead of replacing.
      const again = await d.agent.patch("/api/portal/me/mail-preferences").set("X-CSRF-Token", d.csrf).send({ requestReply: false });
      expect(again.body.mailPreferences).toEqual({ newDevice: false, requestReply: false });
      await portalStorage.updatePortalUser(driverId, { mailPreferences: {} });
    });

    it("rejects empty, unknown and non-boolean preference bodies", async () => {
      const a = await login(`admin@${TEST_EMAIL_DOMAIN}`);
      const patch = (body: unknown) => a.agent.patch("/api/portal/me/mail-preferences").set("X-CSRF-Token", a.csrf).send(body as object);
      expect((await patch({})).status).toBe(400);
      expect((await patch({ newDevice: "nee" })).status).toBe(400);
      expect((await patch({ passwordHash: "x" })).status).toBe(400);
    });

    it("lets an admin change the company switches, and refuses a driver", async () => {
      const a = await login(`admin@${TEST_EMAIL_DOMAIN}`);
      const saved = await a.agent.patch("/api/portal/me/company-mail").set("X-CSRF-Token", a.csrf).send({ mailMaintenance: false });
      expect(saved.status).toBe(200);
      expect(saved.body.companyMail).toEqual({ mailReservationChanges: true, mailMaintenance: false, mailDocuments: true });
      expect((await portalStorage.getOrCreateCustomerSettings(customerId)).mailMaintenance).toBe(false);

      const d = await login(`drv@${TEST_EMAIL_DOMAIN}`);
      const refused = await d.agent.patch("/api/portal/me/company-mail").set("X-CSRF-Token", d.csrf).send({ mailMaintenance: true });
      expect(refused.status).toBe(403);
      expect((await portalStorage.getOrCreateCustomerSettings(customerId)).mailMaintenance).toBe(false);
    });

    it("needs the CSRF token", async () => {
      const a = await login(`admin@${TEST_EMAIL_DOMAIN}`);
      expect((await a.agent.patch("/api/portal/me/mail-preferences").send({ newDevice: false })).status).toBe(403);
    });
  });
});
