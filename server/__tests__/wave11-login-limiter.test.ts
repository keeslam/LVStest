/**
 * WAVE 11 — BUG-009 / BUG-161 (HIGH): the login limiter keys on something the
 * caller cannot choose.
 *
 * Phase 36: ten POST /api/login in a row, each with a different invented
 * `X-Forwarded-For`, gave ten 401s and not one 429 — while the same ten from a
 * single address are refused at number six. `app.set("trust proxy", 1)` was
 * hardcoded and `loginLimiter` had no `keyGenerator`, so the spoofed header
 * became the bucket key and the brake on password guessing could be switched
 * off from the open internet. The library also logged `ERR_ERL_KEY_GEN_IPV6`
 * at start-up.
 *
 * The rules asserted here:
 *   1. The number of proxy hops is configuration (`TRUST_PROXY_HOPS`), not a
 *      hardcoded 1, and it defaults to 1 in production (Coolify) and 0
 *      everywhere else — a directly reachable server trusts no header.
 *   2. The login key is the FIRST UNTRUSTED address for that hop count: extra
 *      entries on the left of the chain change nothing, and with no trusted
 *      hop the header is ignored entirely.
 *   3. IPv6 keys go through the library's own `ipKeyGenerator`, so the
 *      ERR_ERL_KEY_GEN_IPV6 validation is satisfied.
 *   4. The account lockout stays per account, whatever address it comes from.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { like } from "drizzle-orm";
import { ipKeyGenerator } from "express-rate-limit";

import { db } from "../db";
import { loginAttempts } from "../../shared/schema";
import {
  loginLimiterKey,
  firstUntrustedAddress,
  trustProxyHops,
  recordLoginAttempt,
  checkAccountLockout,
  LOCKOUT_THRESHOLD,
} from "../middleware/security/rateLimiter";
import { makeApp, cleanupFixtureUsers } from "./helpers/app";
import request from "supertest";

const USER_PREFIX = "WAVE11-limiter-";

function fakeReq(opts: { xff?: string; remote?: string }) {
  return {
    headers: opts.xff === undefined ? {} : { "x-forwarded-for": opts.xff },
    socket: { remoteAddress: opts.remote ?? "127.0.0.1" },
    get(name: string) {
      return (this as any).headers[name.toLowerCase()];
    },
  } as any;
}

describe("WAVE 11 / BUG-009 — the hop count is configuration", () => {
  const original = process.env.TRUST_PROXY_HOPS;
  const originalEnv = process.env.NODE_ENV;

  afterAll(() => {
    if (original === undefined) delete process.env.TRUST_PROXY_HOPS;
    else process.env.TRUST_PROXY_HOPS = original;
    process.env.NODE_ENV = originalEnv;
  });

  it("defaults to 1 in production and 0 elsewhere, and honours TRUST_PROXY_HOPS", () => {
    delete process.env.TRUST_PROXY_HOPS;
    process.env.NODE_ENV = "production";
    expect(trustProxyHops()).toBe(1);
    process.env.NODE_ENV = "test";
    expect(trustProxyHops()).toBe(0);

    process.env.TRUST_PROXY_HOPS = "2";
    expect(trustProxyHops()).toBe(2);
    process.env.TRUST_PROXY_HOPS = "nonsense";
    expect(trustProxyHops()).toBe(0);
    delete process.env.TRUST_PROXY_HOPS;
  });

  it("with no trusted hop the forwarded header is ignored completely", () => {
    process.env.TRUST_PROXY_HOPS = "0";
    expect(firstUntrustedAddress(fakeReq({ xff: "203.0.113.5", remote: "10.0.0.9" }))).toBe("10.0.0.9");
    expect(firstUntrustedAddress(fakeReq({ xff: "127.0.0.1, 203.0.113.5", remote: "10.0.0.9" }))).toBe("10.0.0.9");
  });

  it("with one trusted hop it is the address that proxy wrote, not the ones the caller sent", () => {
    process.env.TRUST_PROXY_HOPS = "1";
    // The caller stuffed two entries in; the proxy appended the real peer.
    expect(firstUntrustedAddress(fakeReq({ xff: "1.1.1.1, 2.2.2.2, 198.51.100.7" }))).toBe("198.51.100.7");
    // Stuffing more entries on the left cannot move the key.
    expect(firstUntrustedAddress(fakeReq({ xff: "9.9.9.9, 1.1.1.1, 2.2.2.2, 198.51.100.7" }))).toBe("198.51.100.7");
  });

  it("falls back to the socket peer when the chain is shorter than the configured hops", () => {
    process.env.TRUST_PROXY_HOPS = "2";
    expect(firstUntrustedAddress(fakeReq({ xff: "203.0.113.5", remote: "10.0.0.9" }))).toBe("10.0.0.9");
    expect(firstUntrustedAddress(fakeReq({ remote: "10.0.0.9" }))).toBe("10.0.0.9");
  });

  it("IPv6 keys go through the library's ipKeyGenerator (ERR_ERL_KEY_GEN_IPV6)", async () => {
    process.env.TRUST_PROXY_HOPS = "1";
    const key = await loginLimiterKey(fakeReq({ xff: "2001:db8::1" }), {} as any);
    expect(key).toBe(ipKeyGenerator("2001:db8::1"));
    expect(key).toContain("/");
    const v4 = await loginLimiterKey(fakeReq({ xff: "198.51.100.7" }), {} as any);
    expect(v4).toBe("198.51.100.7");
  });
});

describe("WAVE 11 / BUG-009 — the limiter over HTTP", () => {
  let app: Awaited<ReturnType<typeof makeApp>>;

  beforeAll(async () => {
    process.env.TRUST_PROXY_HOPS = "0";
    app = await makeApp();
  }, 60_000);

  afterAll(async () => {
    delete process.env.TRUST_PROXY_HOPS;
    await db.delete(loginAttempts).where(like(loginAttempts.username, `${USER_PREFIX}%`));
    await cleanupFixtureUsers();
  });

  it("ten logins with ten invented X-Forwarded-For values are still stopped", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 10; i++) {
      const res = await request(app)
        .post("/api/login")
        .set("X-Forwarded-For", `203.0.113.${10 + i}`)
        .send({ username: `${USER_PREFIX}${Date.now().toString(36)}-${i}`, password: "wrong-password" });
      statuses.push(res.status);
    }
    expect(statuses).toContain(429);
  }, 60_000);
});

describe("WAVE 11 / BUG-161 — the lockout stays per account", () => {
  const username = `${USER_PREFIX}locked-${Date.now().toString(36)}`;

  afterAll(async () => {
    await db.delete(loginAttempts).where(like(loginAttempts.username, `${USER_PREFIX}%`));
  });

  it("locks the account after the threshold even when every attempt claims a different address", async () => {
    for (let i = 0; i < LOCKOUT_THRESHOLD; i++) {
      await recordLoginAttempt(username, `198.51.100.${i + 1}`, "vitest", false, "invalid_credentials");
    }
    const status = await checkAccountLockout(username, "198.51.100.250");
    expect(status.locked).toBe(true);
    expect(status.attemptsCount).toBeGreaterThanOrEqual(LOCKOUT_THRESHOLD);
  });
});
