/**
 * Kees, 2026-10-18: an admin account invites colleagues (admins and drivers) and blocks them, never
 * with more rights than it has itself; the office is told and can switch this off per customer.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";

const { sendEmail } = vi.hoisted(() => ({ sendEmail: vi.fn(async () => true) }));
vi.mock("../utils/email-service", () => ({ sendEmail }));
const { notifyStaffOfPortalEvent } = vi.hoisted(() => ({ notifyStaffOfPortalEvent: vi.fn(async () => {}) }));
vi.mock("../services/portal-notifications", () => ({ notifyStaffOfPortalEvent }));

import { buildPortalTestApp, createTestCustomer, createTestDriver, cleanupPortalTestData, TEST_EMAIL_DOMAIN } from "./portal-helpers";
import { portalStorage } from "../services/portal-storage";
import { hashPassword } from "../auth";

describe("colleagues in the portal", () => {
  const app = buildPortalTestApp();
  const stamp = Date.now().toString(36);
  const mail = (who: string) => `col-${who}-${stamp}@${TEST_EMAIL_DOMAIN}`;
  let customerId: number, driverId: number, otherDriverId: number, fullAdminId: number;

  async function account(who: string, role: "admin" | "driver", extra: Record<string, unknown> = {}, cid = customerId) {
    const u = await portalStorage.createPortalUser({ customerId: cid, email: mail(who), fullName: who, role, ...extra } as any, "t");
    await portalStorage.updatePortalUser(u.id, { passwordHash: await hashPassword("wachtwoord-1234") });
    return u;
  }
  const login = async (who: string) => {
    const agent = request.agent(app);
    expect((await agent.post("/api/portal/login").send({ email: mail(who), password: "wachtwoord-1234" })).status).toBe(200);
    const csrf = (await agent.get("/api/portal/csrf-token")).body.token as string;
    return { agent, csrf };
  };

  beforeAll(async () => {
    await cleanupPortalTestData();
    customerId = (await createTestCustomer("Collega")).id;
    driverId = (await createTestDriver(customerId, "Piet Rijder")).id;
    const other = (await createTestCustomer("Ander")).id;
    otherDriverId = (await createTestDriver(other, "Vreemde")).id;
    // The inviter may not see fines; a second admin may see everything.
    await account("beperkt", "admin", { permissions: { canViewFines: false } });
    fullAdminId = (await account("volledig", "admin")).id;
    await account("rijder", "driver", { driverId: (await createTestDriver(customerId, "Eigen")).id });
    await account("buitenstaander", "admin", {}, other);
  });
  afterAll(cleanupPortalTestData);

  it("an admin invites a driver: restrictions come along, the invite is mailed and the office told", async () => {
    const s = await login("beperkt");
    const res = await s.agent.post("/api/portal/colleagues").set("X-CSRF-Token", s.csrf).send({ fullName: "Piet", email: mail("piet"), role: "driver", driverId });
    expect(res.status).toBe(201);
    expect(res.body.inviteSent).toBe(true);
    const created = await portalStorage.getPortalUserByEmail(mail("piet"));
    expect(created).toMatchObject({ customerId, role: "driver", driverId, active: true, passwordHash: null });
    expect(created!.permissions).toEqual({ canViewFines: false });
    expect(sendEmail).toHaveBeenCalled();
    expect(notifyStaffOfPortalEvent).toHaveBeenCalledWith(expect.objectContaining({ title: expect.stringContaining("Collega uitgenodigd"), customerId }));
    expect(res.body.colleagues.some((c: any) => c.email === mail("piet") && c.invitePending && !c.activated)).toBe(true);
  });

  it("refuses a used e-mail, another company's driver and a driver who already has an account", async () => {
    const s = await login("volledig");
    const post = (body: Record<string, unknown>) => s.agent.post("/api/portal/colleagues").set("X-CSRF-Token", s.csrf).send(body);
    const dup = await post({ fullName: "Nieuw", email: mail("piet"), role: "admin" });
    expect(dup.status).toBe(409);
    expect(dup.body.code).toBe("PORTAL_EMAIL_IN_USE");
    expect((await post({ fullName: "Nieuw", email: mail("x1"), role: "driver", driverId: otherDriverId })).status).toBe(404);
    const again = await post({ fullName: "Nieuw", email: mail("x2"), role: "driver", driverId });
    expect(again.status).toBe(409);
    expect(again.body.code).toBe("PORTAL_DRIVER_HAS_ACCOUNT");
  });

  it("a driver account cannot manage colleagues, and no one sees another company's accounts", async () => {
    const d = await login("rijder");
    expect((await d.agent.get("/api/portal/colleagues")).status).toBe(403);
    const s = await login("volledig");
    const list = (await s.agent.get("/api/portal/colleagues")).body as Array<{ email: string }>;
    expect(list.some((c) => c.email === mail("buitenstaander"))).toBe(false);
    const outsider = await portalStorage.getPortalUserByEmail(mail("buitenstaander"));
    expect((await s.agent.patch(`/api/portal/colleagues/${outsider!.id}`).set("X-CSRF-Token", s.csrf).send({ active: false })).status).toBe(404);
  });

  it("blocking: not yourself, not someone with more rights; a blocked colleague is logged out at once", async () => {
    const limited = await login("beperkt");
    const patch = (s: typeof limited, id: number, active: boolean) => s.agent.patch(`/api/portal/colleagues/${id}`).set("X-CSRF-Token", s.csrf).send({ active });
    expect((await patch(limited, fullAdminId, false)).status).toBe(403);
    const me = await portalStorage.getPortalUserByEmail(mail("beperkt"));
    expect((await patch(limited, me!.id, false)).status).toBe(400);

    const driverSession = await login("rijder");
    expect((await driverSession.agent.get("/api/portal/me")).status).toBe(200);
    const full = await login("volledig");
    const rijder = await portalStorage.getPortalUserByEmail(mail("rijder"));
    expect((await patch(full, rijder!.id, false)).status).toBe(200);
    expect((await driverSession.agent.get("/api/portal/me")).status).toBeGreaterThanOrEqual(401);
    expect((await patch(full, rijder!.id, true)).status).toBe(200);
  });

  it("the office can switch it off per customer", async () => {
    await portalStorage.updateCustomerSettings(customerId, { canInviteColleagues: false } as any, "t");
    const s = await login("volledig");
    const res = await s.agent.get("/api/portal/colleagues");
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("PORTAL_FEATURE_DISABLED");
    expect((await s.agent.get("/api/portal/me")).body.settings.canInviteColleagues).toBe(false);
    await portalStorage.updateCustomerSettings(customerId, { canInviteColleagues: true } as any, "t");
  });
});
