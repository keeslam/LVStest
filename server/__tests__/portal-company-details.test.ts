import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import request from "supertest";

const { sendEmail } = vi.hoisted(() => ({ sendEmail: vi.fn(async () => true) }));
vi.mock("../utils/email-service", () => ({ sendEmail }));
vi.mock("../services/reservation-pdf-regeneration", () => ({ scheduleContractRegeneration: vi.fn() }));

import { registerPortalRequestRoutes } from "../routes/portal-requests";
import { requestsStorage } from "../services/portal-requests-storage";
import { portalStorage } from "../services/portal-storage";
import { storage } from "../storage";
import { hashPassword } from "../auth";
import { UserPermission } from "../../shared/schema";
import { getUploadsDir } from "../../shared/paths";
import { buildPortalTestApp, buildStaffTestApp, createTestCustomer, createTestDriver, cleanupPortalTestData, TEST_EMAIL_DOMAIN, TEST_PREFIX } from "./portal-helpers";

// Names keep the test prefix, so the helper still finds and removes this customer after the rename.
const P = TEST_PREFIX;

const password = "wachtwoord-1234";
const deps = { uploadsDir: getUploadsDir(), requireAuth: (_r: any, _s: any, n: any) => n() } as any;
const staff = buildStaffTestApp([UserPermission.MANAGE_PORTAL], (app) => registerPortalRequestRoutes(app, deps));

describe("portal company details", () => {
  const app = buildPortalTestApp();
  let customerId: number;

  beforeAll(async () => {
    await cleanupPortalTestData();
    const customer = await createTestCustomer("Bedrijf");
    customerId = customer.id;
    await storage.updateCustomer(customerId, { companyName: `${P}Oude Naam BV`, name: `${P}Oude Naam BV` } as any);
    const admin = await portalStorage.createPortalUser({ customerId, email: `cd-admin@${TEST_EMAIL_DOMAIN}`, fullName: "Beheerder", role: "admin" }, "t");
    await portalStorage.updatePortalUser(admin.id, { passwordHash: await hashPassword(password) });
    const driver = await createTestDriver(customerId, "Chauffeur");
    const du = await portalStorage.createPortalUser({ customerId, email: `cd-drv@${TEST_EMAIL_DOMAIN}`, fullName: "Drv", role: "driver", driverId: driver.id }, "t");
    await portalStorage.updatePortalUser(du.id, { passwordHash: await hashPassword(password) });
  });
  afterAll(cleanupPortalTestData);

  async function login(email: string) {
    const agent = request.agent(app);
    await agent.post("/api/portal/login").send({ email, password });
    const csrf = (await agent.get("/api/portal/csrf-token")).body.token as string;
    return { agent, csrf };
  }
  const staffNotes = async () => (await storage.getUnreadCustomNotifications()).filter((n) => n.link === `/customers/${customerId}` && n.type === "portal_customer_update");

  it("shows the company details to an admin, never to a driver", async () => {
    const a = await login(`cd-admin@${TEST_EMAIL_DOMAIN}`);
    const me = (await a.agent.get("/api/portal/me")).body;
    expect(me.companyDetails).toMatchObject({ companyName: `${P}Oude Naam BV`, pendingNameChange: null });
    // Chamber of commerce and VAT numbers are not part of the portal.
    expect(Object.keys(me.companyDetails)).not.toEqual(expect.arrayContaining(["chamberOfCommerceNumber"]));
    expect(Object.keys(me.companyDetails)).not.toEqual(expect.arrayContaining(["vatNumber"]));
    const d = await login(`cd-drv@${TEST_EMAIL_DOMAIN}`);
    expect((await d.agent.get("/api/portal/me")).body.companyDetails).toBeUndefined();
  });

  it("saves contact and address at once and tells staff what changed, in words", async () => {
    const a = await login(`cd-admin@${TEST_EMAIL_DOMAIN}`);
    const saved = await a.agent.patch("/api/portal/me/company-details").set("X-CSRF-Token", a.csrf).send({ phone: "0612345678", address: "Dorpsstraat 1", postalCode: "1234 AB", city: "Utrecht" });
    expect(saved.status).toBe(200);
    expect(saved.body.companyDetails).toMatchObject({ phone: "0612345678", address: "Dorpsstraat 1", postalCode: "1234 AB", city: "Utrecht" });
    expect(await storage.getCustomer(customerId)).toMatchObject({ phone: "0612345678", address: "Dorpsstraat 1", city: "Utrecht" });
    const note = (await staffNotes()).find((n) => n.description.includes("telefoonnummer"));
    expect(note?.description).toContain("adres");
    expect(note?.description).not.toContain("postalCode");
  });

  it("does not bother staff when nothing changed, and clears a field sent empty", async () => {
    const a = await login(`cd-admin@${TEST_EMAIL_DOMAIN}`);
    const before = (await staffNotes()).length;
    const same = await a.agent.patch("/api/portal/me/company-details").set("X-CSRF-Token", a.csrf).send({ phone: "0612345678", city: "Utrecht" });
    expect(same.status).toBe(200);
    expect((await staffNotes()).length).toBe(before);
    const cleared = await a.agent.patch("/api/portal/me/company-details").set("X-CSRF-Token", a.csrf).send({ billingCity: "" });
    expect(cleared.status).toBe(200);
    expect((await storage.getCustomer(customerId))?.billingCity ?? null).toBeNull();
  });

  it("refuses a driver, unknown fields (company name, VAT) and a missing CSRF token", async () => {
    const d = await login(`cd-drv@${TEST_EMAIL_DOMAIN}`);
    expect((await d.agent.patch("/api/portal/me/company-details").set("X-CSRF-Token", d.csrf).send({ phone: "1" })).status).toBe(403);
    const a = await login(`cd-admin@${TEST_EMAIL_DOMAIN}`);
    const patch = (body: object) => a.agent.patch("/api/portal/me/company-details").set("X-CSRF-Token", a.csrf).send(body);
    expect((await patch({ companyName: "Zelf Gekozen BV" })).status).toBe(400);
    expect((await patch({ vatNumber: "NL123" })).status).toBe(400);
    expect((await patch({ chamberOfCommerceNumber: "123" })).status).toBe(400);
    expect((await storage.getCustomer(customerId))?.companyName).toBe(`${P}Oude Naam BV`);
    expect((await a.agent.patch("/api/portal/me/company-details").send({ phone: "2" })).status).toBe(403);
  });

  describe("company name", () => {
    let requestId: number;

    it("goes to staff as a request and leaves the customer record alone", async () => {
      const a = await login(`cd-admin@${TEST_EMAIL_DOMAIN}`);
      const asked = await a.agent.post("/api/portal/me/company-name").set("X-CSRF-Token", a.csrf).send({ newName: `${P}Nieuwe Naam BV` });
      expect(asked.status).toBe(201);
      requestId = asked.body.companyDetails.pendingNameChange.requestId;
      expect(asked.body.companyDetails.pendingNameChange.newName).toBe(`${P}Nieuwe Naam BV`);
      expect(asked.body.companyDetails.companyName).toBe(`${P}Oude Naam BV`);
      expect((await storage.getCustomer(customerId))?.companyName).toBe(`${P}Oude Naam BV`);
      expect(await requestsStorage.getRequest(requestId)).toMatchObject({ type: "company_name_change", status: "new", customerId });
    });

    it("allows one open request at a time, refuses the current name, a driver and the generic request form", async () => {
      const a = await login(`cd-admin@${TEST_EMAIL_DOMAIN}`);
      const ask = (name: string) => a.agent.post("/api/portal/me/company-name").set("X-CSRF-Token", a.csrf).send({ newName: name });
      expect((await ask("Nog Een Naam")).status).toBe(409);
      const d = await login(`cd-drv@${TEST_EMAIL_DOMAIN}`);
      expect((await d.agent.post("/api/portal/me/company-name").set("X-CSRF-Token", d.csrf).send({ newName: "Drv Naam" })).status).toBe(403);
      // The generic request route does not know this type, so it cannot be used to skip the rules above.
      const generic = await a.agent.post("/api/portal/requests").set("X-CSRF-Token", a.csrf).send({ type: "company_name_change", message: "x", payload: JSON.stringify({ newName: "Sluipweg BV" }) });
      expect(generic.status).toBe(400);
    });

    it("cannot be closed as done without approving, so the customer is never told it is changed while it is not", async () => {
      const res = await request(staff).post(`/api/portal-requests/${requestId}/reply`).send({ reply: "Is gedaan", status: "done" });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe("COMPANY_NAME_NEEDS_APPROVAL");
      expect((await storage.getCustomer(customerId))?.companyName).toBe(`${P}Oude Naam BV`);
    });

    it("is applied to the customer when staff approve, and the short name follows", async () => {
      const res = await request(staff).post(`/api/portal-requests/${requestId}/approve`).send({});
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ status: "done" });
      expect(await storage.getCustomer(customerId)).toMatchObject({ companyName: `${P}Nieuwe Naam BV`, name: `${P}Nieuwe Naam BV` });
      expect((await request(staff).post(`/api/portal-requests/${requestId}/approve`).send({})).status).toBe(400);
      const a = await login(`cd-admin@${TEST_EMAIL_DOMAIN}`);
      const me = (await a.agent.get("/api/portal/me")).body;
      expect(me.companyDetails).toMatchObject({ companyName: `${P}Nieuwe Naam BV`, pendingNameChange: null });
    });

    it("stays as it was when staff reject, and the customer may ask again", async () => {
      const a = await login(`cd-admin@${TEST_EMAIL_DOMAIN}`);
      const asked = await a.agent.post("/api/portal/me/company-name").set("X-CSRF-Token", a.csrf).send({ newName: "Andere Naam BV" });
      expect(asked.status).toBe(201);
      const id = asked.body.companyDetails.pendingNameChange.requestId;
      const rejected = await request(staff).post(`/api/portal-requests/${id}/reply`).send({ reply: "Dit past niet bij uw KvK-inschrijving.", status: "rejected" });
      expect(rejected.status).toBe(200);
      expect((await storage.getCustomer(customerId))?.companyName).toBe(`${P}Nieuwe Naam BV`);
      expect((await a.agent.get("/api/portal/me")).body.companyDetails.pendingNameChange).toBeNull();
    });
  });
});
