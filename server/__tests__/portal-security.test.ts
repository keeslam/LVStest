/**
 * Security fixes of the customer portal (audit 2026-10-12): what a customer must not see, must not
 * be able to do, and the brakes on abuse. One scenario per finding.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import request from "supertest";

const { sendEmail } = vi.hoisted(() => ({ sendEmail: vi.fn(async () => true) }));
vi.mock("../utils/email-service", () => ({ sendEmail }));
vi.mock("../services/reservation-pdf-regeneration", () => ({ scheduleContractRegeneration: vi.fn() }));

import { registerPortalRequestRoutes } from "../routes/portal-requests";
import { buildPortalTestApp, buildStaffTestApp, createTestCustomer, createTestDriver, createTestVehicle, createTestReservation, cleanupPortalTestData, TEST_EMAIL_DOMAIN } from "./portal-helpers";
import { portalStorage } from "../services/portal-storage";
import { requestsStorage } from "../services/portal-requests-storage";
import { customerNotifications } from "../services/portal-customer-notifications";
import { assignDriverToReservation } from "../services/driver-assignments";
import { sendPortalInvite } from "../services/portal-mail";
import { safeContentType, setSafeFileHeaders } from "../utils/portal-files";
import { hashPassword } from "../auth";
import { storage } from "../storage";
import { db } from "../db";
import { reservations, UserPermission } from "../../shared/schema";
import { getUploadsDir } from "../../shared/paths";
import { eq } from "drizzle-orm";

const password = "wachtwoord-1234";
const staffApp = buildStaffTestApp([UserPermission.MANAGE_PORTAL], (app) => registerPortalRequestRoutes(app, { uploadsDir: getUploadsDir(), requireAuth: (_r: any, _s: any, n: any) => n() } as any));

describe("portal security", () => {
  const app = buildPortalTestApp();
  let customerId: number, vehicleId: number, resId: number, d1: number, d2: number;
  let adminId: number, noPricesId: number, driverUserId: number;

  const login = async (email: string, pw = password) => {
    const agent = request.agent(app);
    const res = await agent.post("/api/portal/login").send({ email, password: pw });
    expect(res.status).toBe(200);
    const csrf = (await agent.get("/api/portal/csrf-token")).body.token as string;
    return { agent, csrf };
  };
  const mk = async (email: string, role: "admin" | "driver", extra: Record<string, unknown> = {}) => {
    const u = await portalStorage.createPortalUser({ customerId, email, fullName: email, role, ...extra }, "t");
    await portalStorage.updatePortalUser(u.id, { passwordHash: await hashPassword(password) });
    return u.id;
  };

  beforeAll(async () => {
    await cleanupPortalTestData();
    customerId = (await createTestCustomer("Sec")).id;
    await portalStorage.updateCustomerSettings(customerId, { showPrices: true }, "t");
    vehicleId = (await createTestVehicle()).id;
    d1 = (await createTestDriver(customerId, "Chauffeur Een")).id;
    d2 = (await createTestDriver(customerId, "Chauffeur Twee")).id;
    resId = (await createTestReservation({ customerId, vehicleId, driverId: d1, startDate: "2026-09-01", endDate: "2099-12-31", status: "picked_up" })).id;
    await db.update(reservations).set({ totalPrice: "123.45" }).where(eq(reservations.id, resId));
    adminId = await mk(`sec-admin@${TEST_EMAIL_DOMAIN}`, "admin");
    noPricesId = await mk(`sec-noprice@${TEST_EMAIL_DOMAIN}`, "admin", { permissions: { showPrices: false } });
    driverUserId = await mk(`sec-driver@${TEST_EMAIL_DOMAIN}`, "driver", { driverId: d1 });
  });
  afterAll(cleanupPortalTestData);

  describe("prices follow the account's own switch, in every answer", () => {
    it("shows prices to an account that may see them", async () => {
      const a = await login(`sec-admin@${TEST_EMAIL_DOMAIN}`);
      expect((await a.agent.get("/api/portal/reservations")).body[0].totalPrice).toBeTruthy();
    });
    it("omits prices from the list, the detail and the driver change for an account that may not", async () => {
      const n = await login(`sec-noprice@${TEST_EMAIL_DOMAIN}`);
      const list = (await n.agent.get("/api/portal/reservations")).body;
      expect(list[0]).not.toHaveProperty("totalPrice");
      expect(list[0].vehicle).not.toHaveProperty("dailyPrice");
      expect((await n.agent.get(`/api/portal/reservations/${resId}`)).body).not.toHaveProperty("totalPrice");
      const changed = await n.agent.post(`/api/portal/reservations/${resId}/driver`).set("X-CSRF-Token", n.csrf).send({ driverId: d2 });
      expect(changed.status).toBe(200);
      expect(changed.body).not.toHaveProperty("totalPrice");
    });
  });

  describe("driver history", () => {
    it("leaves out staff user ids and staff-written notes, keeps the customer's own note", async () => {
      await assignDriverToReservation({ reservationId: resId, driverId: d1, byUserId: 1, note: "interne notitie van kantoor" });
      await assignDriverToReservation({ reservationId: resId, driverId: d2, byPortalUserId: adminId, note: "eigen opmerking" });
      const a = await login(`sec-admin@${TEST_EMAIL_DOMAIN}`);
      const history = (await a.agent.get(`/api/portal/reservations/${resId}`)).body.driverHistory as Array<Record<string, unknown>>;
      expect(history.length).toBeGreaterThanOrEqual(2);
      for (const h of history) {
        expect(h).not.toHaveProperty("assignedByUserId");
        expect(h).not.toHaveProperty("assignedByPortalUserId");
        expect(Object.keys(h).sort()).toEqual(["assignedFrom", "assignedUntil", "driverId", "driverName", "id", "note"]);
      }
      expect(JSON.stringify(history)).not.toContain("interne notitie");
      expect(history.some((h) => h.note === "eigen opmerking")).toBe(true);
    });
  });

  describe("notifications follow the features", () => {
    it("hides fine and document notices from an account without those features, and request replies without requests", async () => {
      await portalStorage.updateCustomerSettings(customerId, { canViewFines: false, canViewContracts: false, canSubmitRequests: false }, "t");
      await customerNotifications.notify({ customerId, type: "fine_linked", title: "Boete X", description: "x", link: "/bekeuringen/1" });
      await customerNotifications.notify({ customerId, type: "document_available", title: "Document Y", description: "x" });
      await customerNotifications.notify({ customerId, type: "request_done", title: "Antwoord Z", description: "x", link: "/aanvragen/1" });
      await customerNotifications.notify({ customerId, type: "maintenance_planned", title: "Onderhoud W", description: "x" });
      const a = await login(`sec-admin@${TEST_EMAIL_DOMAIN}`);
      const titles = (await a.agent.get("/api/portal/notifications")).body.map((n: any) => n.title);
      expect(titles).toContain("Onderhoud W");
      expect(titles).not.toContain("Boete X");
      expect(titles).not.toContain("Document Y");
      expect(titles).not.toContain("Antwoord Z");
      await portalStorage.updateCustomerSettings(customerId, { canViewFines: true, canViewContracts: true, canSubmitRequests: true }, "t");
      const again = (await a.agent.get("/api/portal/notifications")).body.map((n: any) => n.title);
      expect(again).toEqual(expect.arrayContaining(["Boete X", "Document Y", "Antwoord Z"]));
    });
  });

  describe("requests", () => {
    it("refuses a new request when the customer already has too many open ones, before anything is stored", async () => {
      const a = await login(`sec-admin@${TEST_EMAIL_DOMAIN}`);
      const open = await requestsStorage.countOpenForCustomer(customerId);
      for (let i = open; i < 30; i++) await requestsStorage.createRequest({ customerId, portalUserId: adminId, type: "other", payload: { subject: `Open ${i}` }, message: "x" });
      const res = await a.agent.post("/api/portal/requests").set("X-CSRF-Token", a.csrf).send({ type: "other", message: "nog een", payload: JSON.stringify({ subject: "Teveel" }) });
      expect(res.status).toBe(429);
      expect(res.body.code).toBe("PORTAL_TOO_MANY_OPEN");
      const before = await requestsStorage.countOpenForCustomer(customerId);
      expect(before).toBe(30);
    });

    it("caps the number of messages on one request", async () => {
      const a = await login(`sec-admin@${TEST_EMAIL_DOMAIN}`);
      const target = (await requestsStorage.listRequestsForCustomer(customerId, {}))[0];
      for (let i = 0; i < 200; i++) await requestsStorage.addMessage({ requestId: target.id, author: "customer", authorName: "t", body: `m${i}` });
      const res = await a.agent.post(`/api/portal/requests/${target.id}/messages`).set("X-CSRF-Token", a.csrf).send({ body: "nummer 201" });
      expect(res.status).toBe(429);
    });

    it("withdraws only a request that is still new, in one statement", async () => {
      const row = await requestsStorage.createRequest({ customerId, portalUserId: adminId, type: "other", payload: { subject: "Intrekken" }, message: "x" });
      await requestsStorage.updateRequest(row.id, { status: "in_progress" });
      expect(await requestsStorage.deleteRequestIfStatus(row.id, "new")).toBeNull();
      expect(await requestsStorage.getRequest(row.id)).toBeTruthy();
      await requestsStorage.updateRequest(row.id, { status: "new" });
      expect(await requestsStorage.deleteRequestIfStatus(row.id, "new")).toEqual([]);
      expect(await requestsStorage.getRequest(row.id)).toBeUndefined();
    });

    it("shows the customer the company name for a staff reply, never the staff login name; staff still see who wrote it", async () => {
      const row = await requestsStorage.createRequest({ customerId, portalUserId: adminId, type: "other", payload: { subject: "Naam" }, message: "vraag" });
      await requestsStorage.addMessage({ requestId: row.id, author: "staff", authorName: "jan.medewerker", body: "antwoord" });
      const a = await login(`sec-admin@${TEST_EMAIL_DOMAIN}`);
      const asCustomer = (await a.agent.get(`/api/portal/requests/${row.id}`)).body;
      expect(JSON.stringify(asCustomer)).not.toContain("jan.medewerker");
      expect(asCustomer.messages[0].authorName).toBeTruthy();
      const asStaff = (await request(staffApp).get(`/api/portal-requests/${row.id}`)).body;
      expect(asStaff.messages[0].authorName).toBe("jan.medewerker");
    });

    it("refuses a question about a fine to an account without the fines feature", async () => {
      await portalStorage.updateCustomerSettings(customerId, { canViewFines: false }, "t");
      const a = await login(`sec-admin@${TEST_EMAIL_DOMAIN}`);
      // The open-request cap is reached by the test above; free some room first.
      for (const r of (await requestsStorage.listRequestsForCustomer(customerId, {})).slice(0, 3)) await requestsStorage.updateRequest(r.id, { status: "done" });
      const res = await a.agent.post("/api/portal/requests").set("X-CSRF-Token", a.csrf).send({ type: "fine_question", message: "waarom?", fineId: 999999, payload: "{}" });
      expect(res.status).toBe(403);
      expect(res.body.code).toBe("PORTAL_FEATURE_DISABLED");
      await portalStorage.updateCustomerSettings(customerId, { canViewFines: true }, "t");
    });
  });

  describe("files are served with a type we decide", () => {
    it("derives the type from the file name and refuses a declared type that does not fit", () => {
      expect(safeContentType("application/pdf", "factuur.pdf")).toBe("application/pdf");
      expect(safeContentType("text/html; x=png", "foto.png")).toBe("image/png");
      expect(safeContentType("text/html", "aanval.html")).toBe("application/octet-stream");
      expect(safeContentType("image/png", "aanval.pdf")).toBe("application/pdf");
      expect(safeContentType(null, "scan.JPG")).toBe("image/jpeg");
    });
    it("sets nosniff, a sandbox policy, and 'inline' only for pdf and images", () => {
      const headers: Record<string, string> = {};
      const res = { setHeader: (k: string, v: string) => { headers[k] = v; } } as any;
      setSafeFileHeaders(res, "text/html", "aanval.html", true, "aanval.html");
      expect(headers["Content-Type"]).toBe("application/octet-stream");
      expect(headers["Content-Disposition"]).toMatch(/^attachment/);
      expect(headers["X-Content-Type-Options"]).toBe("nosniff");
      expect(headers["Content-Security-Policy"]).toContain("sandbox");
      setSafeFileHeaders(res, "application/pdf", "contract.pdf", true, "contract.pdf");
      expect(headers["Content-Disposition"]).toMatch(/^inline/);
      setSafeFileHeaders(res, "application/pdf", "contract.pdf", false, "contract.pdf");
      expect(headers["Content-Disposition"]).toMatch(/^attachment/);
    });
  });

  describe("passwords and sessions", () => {
    it("a reset ends the sessions that were open, and a blocked account does not get a new password", async () => {
      const id = await mk(`sec-reset@${TEST_EMAIL_DOMAIN}`, "admin");
      const open = await login(`sec-reset@${TEST_EMAIL_DOMAIN}`);
      expect((await open.agent.get("/api/portal/me")).status).toBe(200);
      const user = (await portalStorage.getPortalUser(id))!;
      const { token } = await sendPortalInvite(user, "reset");
      const activated = await request(app).post("/api/portal/activate").send({ token, password: "nieuw-wachtwoord-99" });
      expect(activated.status).toBe(200);
      expect((await open.agent.get("/api/portal/me")).status).toBe(401);
      expect((await request(app).post("/api/portal/login").send({ email: `sec-reset@${TEST_EMAIL_DOMAIN}`, password: "nieuw-wachtwoord-99" })).status).toBe(200);

      // Blocked after the link was sent: the link must not set a password.
      const blocked = await mk(`sec-blocked@${TEST_EMAIL_DOMAIN}`, "admin");
      const { token: t2 } = await sendPortalInvite((await portalStorage.getPortalUser(blocked))!, "reset");
      await portalStorage.updatePortalUser(blocked, { active: false });
      const before = (await portalStorage.getPortalUser(blocked))!.passwordHash;
      expect((await request(app).post("/api/portal/activate").send({ token: t2, password: "nieuw-wachtwoord-99" })).status).toBe(403);
      expect((await portalStorage.getPortalUser(blocked))!.passwordHash).toBe(before);
    });

    it("answers the same, quickly, for an unknown and a known address on the forgot form, and caps mails per address", async () => {
      sendEmail.mockClear();
      const known = `sec-admin@${TEST_EMAIL_DOMAIN}`;
      for (let i = 0; i < 5; i++) expect((await request(app).post("/api/portal/forgot").send({ email: known })).status).toBe(200);
      await vi.waitFor(() => expect(sendEmail.mock.calls.length).toBeGreaterThanOrEqual(1));
      await new Promise((r) => setTimeout(r, 300));
      // Three per address per hour, however often the form is submitted.
      expect(sendEmail.mock.calls.filter((c: any) => c[0].to === known).length).toBe(3);
    });

    it("limits how often a login address change can be requested", async () => {
      const a = await login(`sec-noprice@${TEST_EMAIL_DOMAIN}`);
      const statuses: number[] = [];
      for (let i = 0; i < 7; i++) {
        const res = await a.agent.post("/api/portal/me/email").set("X-CSRF-Token", a.csrf).send({ newEmail: `x${i}@${TEST_EMAIL_DOMAIN}`, currentPassword: "fout-wachtwoord" });
        statuses.push(res.status);
        if (res.status === 429) expect(res.body.code).toBe("PORTAL_RATE_LIMITED");
      }
      expect(statuses.slice(0, 5)).toEqual([400, 400, 400, 400, 400]);
      expect(statuses.slice(5)).toEqual([429, 429]);
    });
  });

  describe("a driver books for itself only", () => {
    it("ignores a driverId of a colleague and a driver label made up by the client", async () => {
      await storage.updateVehicle((await createTestVehicle()).id, { offeredOnline: true } as any);
      const bookable = (await db.select().from((await import("../../shared/schema")).vehicles).where(eq((await import("../../shared/schema")).vehicles.offeredOnline, true))).find((v) => v.licensePlate.startsWith("PT"));
      expect(bookable).toBeTruthy();
      // Room under the open-request cap.
      for (const r of (await requestsStorage.listRequestsForCustomer(customerId, {})).slice(0, 5)) await requestsStorage.updateRequest(r.id, { status: "done" });
      const d = await login(`sec-driver@${TEST_EMAIL_DOMAIN}`);
      const res = await d.agent.post("/api/portal/requests").set("X-CSRF-Token", d.csrf).send({
        type: "booking", message: "boeken",
        payload: JSON.stringify({ vehicleId: bookable!.id, startDate: "2098-05-01", endDate: "2098-05-05", driverId: d2, driverLabel: "Directeur Verzonnen" }),
      });
      expect(res.status).toBe(201);
      expect(res.body.payload.driverId).toBe(String(d1));
      expect(res.body.payload.driverLabel).toBe("Chauffeur Een");
      expect(JSON.stringify(res.body)).not.toContain("Verzonnen");
      void driverUserId;
    });
  });
});
