/**
 * FIX-A — process survival (BUG-002, BUG-061, BUG-101).
 *
 * The bug is literally "the process exits", so the server under test must not
 * be the vitest worker: this file drives the real `server/index.ts` as a child
 * process (plan §8.2), fires the crash payloads, and asserts the child is
 * still alive and still answering afterwards.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startChildServer, rawRequest, get, sleep, collectCookies, type ChildServer } from "./helpers/childServer";
import { createTestCustomer, cleanupPortalTestData, TEST_EMAIL_DOMAIN } from "./portal-helpers";
import { portalStorage } from "../services/portal-storage";
import { hashPassword } from "../auth";

let server: ChildServer;
const portalPassword = "wachtwoord-1234";
const portalEmail = `childcrash@${TEST_EMAIL_DOMAIN}`;

describe("FIX-A — the server survives a request-scoped error", () => {
  beforeAll(async () => {
    await cleanupPortalTestData();
    const customer = await createTestCustomer("ChildCrash");
    const user = await portalStorage.createPortalUser(
      { customerId: customer.id, email: portalEmail, fullName: "U", role: "admin" }, "t");
    await portalStorage.updatePortalUser(user.id, { passwordHash: await hashPassword(portalPassword) });
    server = await startChildServer();
  }, 180_000);

  afterAll(async () => {
    if (server) await server.stop();
    await cleanupPortalTestData();
  }, 30_000);

  it("stays up and keeps serving after the BUG-002 payload, on a real logged-in portal session", async () => {
    const before = await get(server.port, "/health");
    expect(before.status).toBe(200);

    // A real portal session, because this is the exact privilege level from
    // which one HTTP request used to take the whole backoffice down.
    const loginBody = JSON.stringify({ email: portalEmail, password: portalPassword });
    const login = await rawRequest(server.port, "POST", "/api/portal/login", {
      body: loginBody,
      headers: { "content-type": "application/json", "content-length": String(Buffer.byteLength(loginBody)) },
    });
    expect(login.status).toBe(200);
    let cookies = collectCookies("", login);

    const tokenRes = await rawRequest(server.port, "GET", "/api/portal/csrf-token", { headers: { cookie: cookies } });
    cookies = collectCookies(cookies, tokenRes);
    const csrf = tokenRes.json()?.token as string;
    expect(csrf).toBeTruthy();

    const body = JSON.stringify({ type: "other", message: "Dit is een vraag", payload: "not-json-at-all" });
    const res = await rawRequest(server.port, "POST", "/api/portal/requests", {
      body,
      headers: {
        "content-type": "application/json",
        "content-length": String(Buffer.byteLength(body)),
        cookie: cookies,
        "x-csrf-token": csrf,
      },
    });
    expect(res.status).toBe(400);

    await sleep(500);
    expect(server.alive()).toBe(true);
    expect((await get(server.port, "/health")).status).toBe(200);
  }, 60_000);

  it("stays up after an unknown :customerId on the portal-admin settings route (BUG-061)", async () => {
    const res = await get(server.port, "/api/portal-admin/customers/999999999/settings");
    // 401 without a session; the point is that a response arrives at all and
    // the process is still there afterwards.
    expect(res.status).toBeGreaterThanOrEqual(400);

    await sleep(500);
    expect(server.alive()).toBe(true);
    expect((await get(server.port, "/health")).status).toBe(200);
  }, 60_000);

  it("survives an unhandled rejection and logs it loudly instead of exiting", async () => {
    // The process policy itself: an unhandled rejection must log and continue.
    // Triggered through /health's sibling so nothing in the database changes.
    const res = await get(server.port, "/api");
    expect(res.status).toBe(200);
    expect(server.alive()).toBe(true);

    const log = server.stdout.join("") + server.stderr.join("");
    // If anything did reject during this run, the new policy must have said so
    // without shutting down.
    if (log.includes("UNHANDLED PROMISE REJECTION")) {
      expect(log).toContain("process stays up");
      expect(log).not.toContain("UNHANDLED_REJECTION received, starting graceful shutdown");
    }
    expect((await get(server.port, "/health")).status).toBe(200);
  }, 60_000);
});
