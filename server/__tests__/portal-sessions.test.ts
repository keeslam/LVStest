/**
 * Kees, 2026-10-18: Mijn account lists the browsers the account is logged in with and signs out one of
 * them or all others; never another account's session, and never the session id itself.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";

const { sendEmail } = vi.hoisted(() => ({ sendEmail: vi.fn(async () => true) }));
vi.mock("../utils/email-service", () => ({ sendEmail }));

import { buildPortalTestApp, createTestCustomer, cleanupPortalTestData, TEST_EMAIL_DOMAIN } from "./portal-helpers";
import { portalStorage } from "../services/portal-storage";
import { hashPassword } from "../auth";
import { pool } from "../db";
import { describeUserAgent } from "../../shared/user-agent";

const CHROME_WIN = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const SAFARI_IOS = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

describe("describeUserAgent", () => {
  it("names the common browsers and systems", () => {
    expect(describeUserAgent(CHROME_WIN)).toEqual({ browser: "Chrome", os: "Windows" });
    expect(describeUserAgent(SAFARI_IOS)).toEqual({ browser: "Safari", os: "iOS" });
    expect(describeUserAgent(`${CHROME_WIN} Edg/130.0`)).toEqual({ browser: "Edge", os: "Windows" });
    expect(describeUserAgent("curl/8")).toEqual({ browser: null, os: null });
  });
});

describe("logged-in devices", () => {
  const app = buildPortalTestApp();
  const stamp = Date.now().toString(36);
  const mail = (who: string) => `sess-${who}-${stamp}@${TEST_EMAIL_DOMAIN}`;

  const login = async (who: string, ua: string) => {
    const agent = request.agent(app);
    expect((await agent.post("/api/portal/login").set("User-Agent", ua).send({ email: mail(who), password: "wachtwoord-1234" })).status).toBe(200);
    const csrf = (await agent.get("/api/portal/csrf-token").set("User-Agent", ua)).body.token as string;
    return { agent, csrf, ua };
  };
  type Session = Awaited<ReturnType<typeof login>>;
  const list = (s: Session) => s.agent.get("/api/portal/me/sessions").set("User-Agent", s.ua);

  beforeAll(async () => {
    await cleanupPortalTestData();
    const customerId = (await createTestCustomer("Sessies")).id;
    for (const who of ["kees", "ander"]) {
      const u = await portalStorage.createPortalUser({ customerId, email: mail(who), fullName: who, role: "admin" } as any, "t");
      await portalStorage.updatePortalUser(u.id, { passwordHash: await hashPassword("wachtwoord-1234") });
    }
  });
  afterAll(cleanupPortalTestData);

  it("lists both browsers, marks this one, and never hands out the session id", async () => {
    const desk = await login("kees", CHROME_WIN);
    const phone = await login("kees", SAFARI_IOS);
    const res = await list(desk);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    const current = res.body.find((s: any) => s.current);
    expect(current).toMatchObject({ browser: "Chrome", os: "Windows" });
    expect(current.signedInAt).toBeTruthy();
    expect(res.body.find((s: any) => !s.current)).toMatchObject({ browser: "Safari", os: "iOS" });
    const sids = (await pool.query("select sid from portal_session where sess -> 'passport' -> 'user' ->> 'id' = $1", [String((await portalStorage.getPortalUserByEmail(mail("kees")))!.id)])).rows.map((r: { sid: string }) => r.sid);
    expect(sids.length).toBeGreaterThanOrEqual(2);
    for (const sid of sids) expect(JSON.stringify(res.body)).not.toContain(sid);
    expect(phone.ua).toBe(SAFARI_IOS);
  });

  it("signs out one other browser; this one cannot be removed that way", async () => {
    const desk = await login("kees", CHROME_WIN);
    const phone = await login("kees", SAFARI_IOS);
    const sessions = (await list(desk)).body as Array<{ id: string; current: boolean; os: string }>;
    const own = sessions.find((s) => s.current)!;
    expect((await desk.agent.delete(`/api/portal/me/sessions/${own.id}`).set("X-CSRF-Token", desk.csrf).set("User-Agent", desk.ua)).status).toBe(400);
    const phoneId = (await list(phone)).body.find((s: any) => s.current).id;
    const del = await desk.agent.delete(`/api/portal/me/sessions/${phoneId}`).set("X-CSRF-Token", desk.csrf).set("User-Agent", desk.ua);
    expect(del.status).toBe(200);
    expect((await phone.agent.get("/api/portal/me").set("User-Agent", SAFARI_IOS)).status).toBe(401);
    expect((await desk.agent.get("/api/portal/me").set("User-Agent", CHROME_WIN)).status).toBe(200);
  });

  it("signs out everywhere else, and cannot touch another account's session", async () => {
    const desk = await login("kees", CHROME_WIN);
    const phone = await login("kees", SAFARI_IOS);
    const other = await login("ander", CHROME_WIN);
    const otherId = (await list(other)).body[0].id;
    expect((await desk.agent.delete(`/api/portal/me/sessions/${otherId}`).set("X-CSRF-Token", desk.csrf).set("User-Agent", desk.ua)).status).toBe(404);
    const res = await desk.agent.post("/api/portal/me/sessions/sign-out-others").set("X-CSRF-Token", desk.csrf).set("User-Agent", desk.ua);
    expect(res.status).toBe(200);
    expect(res.body.count).toBeGreaterThanOrEqual(1);
    expect(res.body.sessions).toHaveLength(1);
    expect((await phone.agent.get("/api/portal/me").set("User-Agent", SAFARI_IOS)).status).toBe(401);
    expect((await other.agent.get("/api/portal/me").set("User-Agent", CHROME_WIN)).status).toBe(200);
  });
});
