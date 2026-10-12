/**
 * A driver account (role "driver") is one person at the customer: it sees its own rentals and what is
 * about them, not the contact data of colleagues, not the notices about their cars. An admin account
 * of the same customer sees everything, and another customer's account sees nothing of this one.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import request from "supertest";

const { sendEmail } = vi.hoisted(() => ({ sendEmail: vi.fn(async () => true) }));
vi.mock("../utils/email-service", () => ({ sendEmail }));

import { buildPortalTestApp, createTestCustomer, createTestDriver, createTestVehicle, createTestReservation, cleanupPortalTestData, TEST_EMAIL_DOMAIN } from "./portal-helpers";
import { portalStorage } from "../services/portal-storage";
import { customerNotifications } from "../services/portal-customer-notifications";
import { hashPassword } from "../auth";

const password = "wachtwoord-1234";

describe("portal driver isolation", () => {
  const app = buildPortalTestApp();
  let customerId: number, otherCustomerId: number;
  let d1Id: number, d2Id: number, d1UserId: number;
  let r1: number, r2: number;

  const login = async (email: string) => {
    const agent = request.agent(app);
    const res = await agent.post("/api/portal/login").send({ email, password });
    expect(res.status).toBe(200);
    const csrf = (await agent.get("/api/portal/csrf-token")).body.token as string;
    return { agent, csrf };
  };

  beforeAll(async () => {
    await cleanupPortalTestData();
    customerId = (await createTestCustomer("Iso")).id;
    otherCustomerId = (await createTestCustomer("IsoAnder")).id;
    const [v1, v2] = [await createTestVehicle(), await createTestVehicle()];
    d1Id = (await createTestDriver(customerId, "Chauffeur Een")).id;
    d2Id = (await createTestDriver(customerId, "Chauffeur Twee")).id;
    r1 = (await createTestReservation({ customerId, vehicleId: v1.id, driverId: d1Id, startDate: "2026-09-01", endDate: "2026-12-31", status: "picked_up" })).id;
    r2 = (await createTestReservation({ customerId, vehicleId: v2.id, driverId: d2Id, startDate: "2026-09-01", endDate: "2026-12-31", status: "picked_up" })).id;
    const mk = async (cid: number, email: string, role: "admin" | "driver", driverId?: number) => {
      const u = await portalStorage.createPortalUser({ customerId: cid, email, fullName: email, role, ...(driverId ? { driverId } : {}) }, "t");
      await portalStorage.updatePortalUser(u.id, { passwordHash: await hashPassword(password) });
      return u.id;
    };
    await mk(customerId, `iso-admin@${TEST_EMAIL_DOMAIN}`, "admin");
    d1UserId = await mk(customerId, `iso-d1@${TEST_EMAIL_DOMAIN}`, "driver", d1Id);
    await mk(otherCustomerId, `iso-other@${TEST_EMAIL_DOMAIN}`, "admin");
  });
  afterAll(cleanupPortalTestData);

  describe("driver list", () => {
    it("gives an admin the drivers of its own customer, with contact data", async () => {
      const a = await login(`iso-admin@${TEST_EMAIL_DOMAIN}`);
      const res = await a.agent.get("/api/portal/drivers");
      expect(res.status).toBe(200);
      expect(res.body.map((d: any) => d.displayName).sort()).toEqual(["Chauffeur Een", "Chauffeur Twee"]);
    });

    it("refuses a driver account, who must not get colleagues' contact data and licence numbers", async () => {
      const d = await login(`iso-d1@${TEST_EMAIL_DOMAIN}`);
      const res = await d.agent.get("/api/portal/drivers");
      expect(res.status).toBe(403);
      expect(JSON.stringify(res.body)).not.toContain("Chauffeur Twee");
    });

    it("gives another customer's admin only its own drivers", async () => {
      const o = await login(`iso-other@${TEST_EMAIL_DOMAIN}`);
      expect((await o.agent.get("/api/portal/drivers")).body).toEqual([]);
    });
  });

  describe("notifications", () => {
    let own: number, other: number, personal: number, fine: number, general: number;
    beforeAll(async () => {
      const n = async (p: Parameters<typeof customerNotifications.notify>[0]) => (await customerNotifications.notify(p))!.id;
      own = await n({ customerId, type: "apk_due", title: "APK eigen auto", description: "x", link: `/reserveringen/${r1}` });
      other = await n({ customerId, type: "apk_due", title: "APK andermans auto", description: "x", link: `/reserveringen/${r2}` });
      fine = await n({ customerId, type: "fine_linked", title: "Bekeuring collega", description: "x", link: "/bekeuringen/1" });
      general = await n({ customerId, type: "other", title: "Algemeen bedrijfsbericht", description: "x" });
      personal = await n({ customerId, portalUserId: d1UserId, type: "request_done", title: "Voor mij", description: "x", link: "/aanvragen/1" });
    });

    it("lets an admin see all of the customer's notifications", async () => {
      const a = await login(`iso-admin@${TEST_EMAIL_DOMAIN}`);
      const titles = (await a.agent.get("/api/portal/notifications")).body.map((x: any) => x.title);
      expect(titles).toEqual(expect.arrayContaining(["APK eigen auto", "APK andermans auto", "Bekeuring collega", "Algemeen bedrijfsbericht"]));
      expect(titles).not.toContain("Voor mij");
    });

    it("shows a driver its own notices and those about its own rentals, nothing about colleagues", async () => {
      const d = await login(`iso-d1@${TEST_EMAIL_DOMAIN}`);
      const titles = (await d.agent.get("/api/portal/notifications")).body.map((x: any) => x.title);
      expect(titles).toEqual(expect.arrayContaining(["APK eigen auto", "Voor mij"]));
      expect(titles).not.toContain("APK andermans auto");
      expect(titles).not.toContain("Bekeuring collega");
      expect(titles).not.toContain("Algemeen bedrijfsbericht");
    });

    it("counts only what the driver may see", async () => {
      const d = await login(`iso-d1@${TEST_EMAIL_DOMAIN}`);
      expect((await d.agent.get("/api/portal/notifications/unread-count")).body.count).toBe(2);
    });

    it("lets a driver mark only visible notices as read; someone else's id does nothing", async () => {
      const d = await login(`iso-d1@${TEST_EMAIL_DOMAIN}`);
      await d.agent.post("/api/portal/notifications/read").set("X-CSRF-Token", d.csrf).send({ ids: [other, fine] });
      const rows = await customerNotifications.listForUser(customerId, 0);
      expect(rows.find((r) => r.id === other)?.isRead).toBe(false);
      expect(rows.find((r) => r.id === fine)?.isRead).toBe(false);
      await d.agent.post("/api/portal/notifications/read").set("X-CSRF-Token", d.csrf).send({});
      const after = await customerNotifications.listForUser(customerId, 0);
      expect(after.find((r) => r.id === own)?.isRead).toBe(true);
      // "Mark all" by a driver must not mark the notices it cannot see.
      expect(after.find((r) => r.id === other)?.isRead).toBe(false);
      expect(after.find((r) => r.id === general)?.isRead).toBe(false);
      expect((await d.agent.get("/api/portal/notifications/unread-count")).body.count).toBe(0);
      void personal;
    });

    it("shows another customer none of these notifications", async () => {
      const o = await login(`iso-other@${TEST_EMAIL_DOMAIN}`);
      expect((await o.agent.get("/api/portal/notifications")).body).toEqual([]);
    });
  });
});
