/**
 * FIX-K — authentication, session and rate-limit hardening (BUG-008, BUG-047,
 * BUG-062, BUG-074, BUG-083, BUG-091, BUG-092, BUG-094, BUG-095, BUG-096,
 * BUG-105, BUG-161).
 *
 * This cluster deliberately touches no route in server/routes.ts.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import request from "supertest";
import { db, pool } from "../db";
import { activeSessions, loginAttempts, users } from "../../shared/schema";
import { makeApp, agentFor, cleanupFixtureUsers, FIXTURE_USER_PREFIX, type TestAgent } from "./helpers/app";
import {
  hashPassword, comparePasswords, needsRehash, SCRYPT_PARAMS, resolveSessionSecret,
} from "../auth";
import { resolveDefaultAdminPassword } from "../initAdmin";
import {
  checkAccountLockout, reserveLoginAttempt, settleLoginAttempt, clearFailedAttempts,
  loginLimiter, portalLoginLimiter, portalForgotLimiter, portalActivateLimiter, apiLimiterKey,
  LOCKOUT_THRESHOLD,
} from "../middleware/security/rateLimiter";

function csrfFrom(res: request.Response, name = "XSRF-TOKEN"): string | null {
  const raw = res.headers["set-cookie"] as unknown as string[] | undefined;
  if (!raw) return null;
  // The login response carries TWO Set-Cookie headers for this name: the one
  // the pipeline middleware wrote before session.regenerate(), and the one the
  // handler writes afterwards against the new session. A browser keeps the
  // last; so does this.
  let found: string | null = null;
  for (const cookie of raw) {
    const m = new RegExp(`(?:^|;\\s*)${name}=([^;]+)`).exec(cookie);
    if (m) found = decodeURIComponent(m[1]);
  }
  return found;
}

describe("FIX-K — auth, session and rate-limit hardening", () => {
  afterAll(async () => {
    await cleanupFixtureUsers();
  });

  describe("BUG-094 — scrypt runs with explicit, recorded cost parameters", () => {
    it("records the parameters in the hash and still verifies", async () => {
      const hash = await hashPassword("correct horse battery staple");
      expect(hash.split(".")).toHaveLength(5);
      expect(hash).toContain(`.s${SCRYPT_PARAMS.N}.`);
      expect(SCRYPT_PARAMS.N).toBeGreaterThan(16384); // stronger than Node's default
      expect(await comparePasswords("correct horse battery staple", hash)).toBe(true);
      expect(await comparePasswords("wrong", hash)).toBe(false);
      expect(needsRehash(hash)).toBe(false);
    }, 30_000);

    it("still verifies a legacy hash, and flags it for rehashing", async () => {
      // The old format: <hash>.<salt>, made with Node's defaults.
      const { scrypt, randomBytes } = await import("crypto");
      const { promisify } = await import("util");
      const scryptAsync = promisify(scrypt) as (p: string, s: string, l: number) => Promise<Buffer>;
      const salt = randomBytes(16).toString("hex");
      const legacy = `${(await scryptAsync("legacy-password", salt, 64)).toString("hex")}.${salt}`;

      expect(await comparePasswords("legacy-password", legacy)).toBe(true);
      expect(await comparePasswords("nope", legacy)).toBe(false);
      expect(needsRehash(legacy)).toBe(true);
    }, 30_000);

    it("a login upgrades a legacy hash in place", async () => {
      const agent = await agentFor([]);
      const { scrypt, randomBytes } = await import("crypto");
      const { promisify } = await import("util");
      const scryptAsync = promisify(scrypt) as (p: string, s: string, l: number) => Promise<Buffer>;
      const salt = randomBytes(16).toString("hex");
      const legacy = `${(await scryptAsync(agent.password, salt, 64)).toString("hex")}.${salt}`;
      await db.update(users).set({ password: legacy }).where(eq(users.id, agent.userId));

      const app = await makeApp();
      const fresh = request.agent(app);
      const seed = await fresh.get("/api/user");
      const login = await fresh
        .post("/api/login")
        .set("X-CSRF-Token", csrfFrom(seed) ?? "")
        .send({ username: agent.username, password: agent.password });
      expect(login.status, JSON.stringify(login.body)).toBe(200);

      const [after] = await db.select().from(users).where(eq(users.id, agent.userId));
      expect(needsRehash(after.password)).toBe(false);
      expect(await comparePasswords(agent.password, after.password)).toBe(true);
    }, 60_000);
  });

  describe("BUG-008 — the lockout lasts 15 minutes, not 135", () => {
    it("reports a remaining time inside the window whatever the session timezone", async () => {
      const username = `${FIXTURE_USER_PREFIX}lockout-${Date.now().toString(36)}`;
      // Berlin is the audit's reproduction: a +1/+2 offset turned 15 minutes
      // into 135 because the column is `timestamp` without a zone.
      await pool.query("set time zone 'Europe/Berlin'");
      try {
        for (let i = 0; i < LOCKOUT_THRESHOLD; i++) {
          await db.insert(loginAttempts).values({
            username, ipAddress: "127.0.0.1", userAgent: "test", success: false, failureReason: "invalid_credentials",
          });
        }
        const status = await checkAccountLockout(username, "127.0.0.1");
        expect(status.locked).toBe(true);
        expect(status.remainingTime, `remainingTime was ${status.remainingTime}`).toBeGreaterThan(840); // > 14 min
        expect(status.remainingTime).toBeLessThanOrEqual(900); // <= 15 min, not 8100
      } finally {
        await pool.query("set time zone 'UTC'");
        await db.delete(loginAttempts).where(eq(loginAttempts.username, username));
      }
    }, 30_000);
  });

  describe("BUG-161 — a concurrent burst is throttled, not fully evaluated", () => {
    it("30 parallel reservations lock the account and most never reach the password", async () => {
      const username = `${FIXTURE_USER_PREFIX}burst-${Date.now().toString(36)}`;
      try {
        const results = await Promise.all(
          Array.from({ length: 30 }, () => reserveLoginAttempt(username, "127.0.0.1", "test")),
        );
        const allowed = results.filter((r) => !r.locked).length;
        expect(allowed, "every parallel guess was allowed through to scrypt").toBeLessThan(30);
        expect(results.some((r) => r.locked), "the burst never locked the account").toBe(true);

        const [{ count }] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(loginAttempts)
          .where(eq(loginAttempts.username, username));
        expect(Number(count)).toBe(30); // every attempt is recorded, none lost
      } finally {
        await db.delete(loginAttempts).where(eq(loginAttempts.username, username));
      }
    }, 60_000);

    it("a settled successful attempt stops counting against the account", async () => {
      const username = `${FIXTURE_USER_PREFIX}settle-${Date.now().toString(36)}`;
      try {
        const first = await reserveLoginAttempt(username, "127.0.0.1", "test");
        await settleLoginAttempt(first.attemptId, { success: true });
        const [row] = await db
          .select()
          .from(loginAttempts)
          .where(and(eq(loginAttempts.username, username), eq(loginAttempts.success, true)));
        expect(row).toBeTruthy();
        await clearFailedAttempts(username);
        const status = await checkAccountLockout(username, "127.0.0.1");
        expect(status.locked).toBe(false);
      } finally {
        await db.delete(loginAttempts).where(eq(loginAttempts.username, username));
      }
    }, 30_000);
  });

  describe("BUG-047 — the token /api/login hands back is usable immediately", () => {
    it("the very next mutating request is not CSRF_INVALID", async () => {
      const seeded = await agentFor("admin");
      const app = await makeApp();
      const fresh = request.agent(app);
      const seed = await fresh.get("/api/user");
      const login = await fresh
        .post("/api/login")
        .set("X-CSRF-Token", csrfFrom(seed) ?? "")
        .send({ username: seeded.username, password: seeded.password });
      expect(login.status, JSON.stringify(login.body)).toBe(200);

      // The token from the login response itself — not from a later GET.
      const token = csrfFrom(login);
      expect(token, "POST /api/login set no XSRF-TOKEN cookie").toBeTruthy();

      const next = await fresh.post("/api/session/heartbeat").set("X-CSRF-Token", token!).send({});
      expect(next.status, JSON.stringify(next.body)).not.toBe(403);
      expect(JSON.stringify(next.body)).not.toContain("CSRF_INVALID");
    }, 60_000);
  });

  describe("BUG-095 — logout removes the tracked session", () => {
    it("active_sessions has no row for the session afterwards", async () => {
      const agent = await agentFor([]);
      const tracked = await db.select().from(activeSessions).where(eq(activeSessions.userId, agent.userId));
      expect(tracked.length, "login did not track a session").toBeGreaterThan(0);
      // BUG-095: the tracked lifetime follows the cookie, not 30 days.
      const lifetimeMs = tracked[0].expiresAt.getTime() - tracked[0].lastActivity.getTime();
      expect(lifetimeMs).toBeLessThanOrEqual(60 * 60 * 1000);

      const out = await agent.post("/api/logout").send({});
      expect(out.status).toBe(200);

      const after = await db.select().from(activeSessions).where(eq(activeSessions.userId, agent.userId));
      expect(after).toHaveLength(0);
    }, 60_000);
  });

  describe("BUG-091 — a password change ends the other sessions", () => {
    it("session B is 401 after session A changes the password", async () => {
      const sessionA = await agentFor([]);
      const app = await makeApp();
      const sessionB = request.agent(app);
      const seedB = await sessionB.get("/api/user");
      const loginB = await sessionB
        .post("/api/login")
        .set("X-CSRF-Token", csrfFrom(seedB) ?? "")
        .send({ username: sessionA.username, password: sessionA.password });
      expect(loginB.status, JSON.stringify(loginB.body)).toBe(200);
      expect((await sessionB.get("/api/user")).status).toBe(200);

      const changed = await sessionA.post("/api/users/change-password").send({
        currentPassword: sessionA.password,
        newPassword: "Rotated-Password-9",
      });
      expect(changed.status, JSON.stringify(changed.body)).toBe(200);

      expect((await sessionB.get("/api/user")).status).toBe(401);
      const rows = await db
        .select()
        .from(activeSessions)
        .where(eq(activeSessions.userId, sessionA.userId));
      expect(rows.length).toBeLessThanOrEqual(1); // only the caller's own
    }, 60_000);
  });

  describe("BUG-092 / BUG-105 — each auth route has its own bucket", () => {
    it("the four limiters are four separate instances", () => {
      const instances = new Set([loginLimiter, portalLoginLimiter, portalForgotLimiter, portalActivateLimiter]);
      expect(instances.size).toBe(4);
    });

    it("the portal reset limiter counts successful requests, the login limiters do not", async () => {
      // express-rate-limit keeps its options on the middleware function; assert
      // on behaviour instead by driving a tiny app through each limiter.
      const express = (await import("express")).default;
      const counts: Record<string, number> = {};
      for (const [name, limiter, expected] of [
        ["forgot", portalForgotLimiter, true],
        ["login", loginLimiter, false],
      ] as const) {
        const app = express();
        app.use(express.json());
        app.post("/x", limiter, (_req, res) => res.json({ ok: true }));
        let limited = false;
        for (let i = 0; i < 12; i++) {
          const res = await request(app).post("/x").set("X-Forwarded-For", `10.9.9.${name.length}`).send({});
          if (res.status === 429) { limited = true; break; }
        }
        counts[name] = limited ? 1 : 0;
        expect(limited, `${name}: expected always-200 traffic to be limited=${expected}`).toBe(expected);
      }
      expect(counts).toBeTruthy();
    }, 60_000);
  });

  describe("BUG-074 — the API limiter is keyed per user", () => {
    it("keys an authenticated request on the user id, not the IP", async () => {
      const keyGenerator = apiLimiterKey;
      const asUser = await keyGenerator({ user: { id: 42 }, ip: "10.0.0.1", socket: {} } as any, {} as any);
      const asAnon = await keyGenerator({ ip: "10.0.0.1", socket: {} } as any, {} as any);
      expect(asUser).toBe("user:42");
      expect(asAnon).toBe("ip:10.0.0.1");
      expect(asUser).not.toBe(asAnon);
    });
  });

  describe("BUG-062 — no built-in admin password", () => {
    it("throws in production when DEFAULT_ADMIN_PASSWORD is missing", () => {
      expect(() => resolveDefaultAdminPassword({ NODE_ENV: "production" } as NodeJS.ProcessEnv)).toThrow(
        /DEFAULT_ADMIN_PASSWORD/,
      );
      expect(resolveDefaultAdminPassword({ NODE_ENV: "production", DEFAULT_ADMIN_PASSWORD: "set-by-ops" } as NodeJS.ProcessEnv))
        .toBe("set-by-ops");
    });

    it("generates a one-off password in development instead of admin123", () => {
      const log = vi.spyOn(console, "log").mockImplementation(() => {});
      try {
        const generated = resolveDefaultAdminPassword({ NODE_ENV: "development" } as NodeJS.ProcessEnv);
        expect(generated).not.toBe("admin123");
        expect(generated.length).toBeGreaterThanOrEqual(12);
      } finally {
        log.mockRestore();
      }
    });
  });

  describe("BUG-083 — the portal realm signs with a real secret", () => {
    it("reuses resolveSessionSecret and never the hard-coded string", async () => {
      expect(resolveSessionSecret()).not.toBe("portal-dev-secret");
      const source = await import("fs").then((fs) => fs.readFileSync("server/portal-auth.ts", "utf8"));
      expect(source).not.toContain('"portal-dev-secret"');
      expect(source).toContain("resolveSessionSecret()");
    });
  });
});
