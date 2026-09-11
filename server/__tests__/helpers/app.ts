/**
 * In-process Express app for the route tests (remediation plan §8.1).
 *
 * Builds the *real* staff app — `setupAuth()` + `registerRoutes()` — without
 * `server/index.ts`, which listens, starts four schedulers and installs the
 * process-level exit policy. Nothing here calls `listen()`; supertest drives
 * the app object directly.
 *
 * NEVER point this at the development database: see server/__tests__/setup.ts.
 */
import express, { type Express } from "express";
import request from "supertest";
import { like } from "drizzle-orm";
import { db } from "../../db";
import { users, auditLogs, loginAttempts } from "../../../shared/schema";
import { setupAuth, hashPassword } from "../../auth";
import { registerRoutes } from "../../routes";

/** Prefix for every user this helper creates, so a leak is greppable. */
export const FIXTURE_USER_PREFIX = "FIXT-user-";

let cachedApp: Express | null = null;

/**
 * The real staff app, built once per vitest file and reused. `registerRoutes`
 * is expensive (119 route registrations, touches the uploads directory) and is
 * stateless with respect to the request, so one instance per file is both
 * correct and much faster.
 */
export async function makeApp(): Promise<Express> {
  if (cachedApp) return cachedApp;
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  setupAuth(app);
  await registerRoutes(app);
  // Terminal error handler, mirroring server/index.ts. Without it Express'
  // default handler answers with an HTML stack trace, which would make the
  // async-error assertions pass for the wrong reason.
  app.use((err: any, _req: any, res: any, _next: any) => {
    const status = err?.status || err?.statusCode || 500;
    res.status(status).json({ error: "Server Error", message: "Internal Server Error" });
  });
  cachedApp = app;
  return cachedApp;
}

export interface TestAgent {
  agent: ReturnType<typeof request.agent>;
  userId: number;
  username: string;
  password: string;
  /** The CSRF token this agent sends on every mutating request. */
  csrf: string;
  get(url: string): request.Test;
  post(url: string): request.Test;
  patch(url: string): request.Test;
  put(url: string): request.Test;
  delete(url: string): request.Test;
}

let userCounter = 0;

function csrfFrom(res: request.Response): string | null {
  const raw = res.headers["set-cookie"] as unknown as string[] | undefined;
  if (!raw) return null;
  for (const cookie of raw) {
    const m = /(?:^|;\s*)XSRF-TOKEN=([^;]+)/.exec(cookie);
    if (m) return decodeURIComponent(m[1]);
  }
  return null;
}

function wrap(agent: ReturnType<typeof request.agent>, token: string): Omit<TestAgent, "userId" | "username" | "password"> {
  const withCsrf = (t: request.Test) => t.set("X-CSRF-Token", token);
  return {
    agent,
    csrf: token,
    get: (url) => agent.get(url),
    post: (url) => withCsrf(agent.post(url)),
    patch: (url) => withCsrf(agent.patch(url)),
    put: (url) => withCsrf(agent.put(url)),
    delete: (url) => withCsrf(agent.delete(url)),
  };
}

/**
 * Creates a throwaway staff user with exactly `permissions` (or a real admin
 * when given `'admin'`), logs it in, and returns a supertest agent carrying
 * both the session cookie and a valid CSRF token.
 *
 * The CSRF token is timestamp+HMAC over the session secret and stays valid for
 * 24 h, so one token captured at login serves the whole test.
 */
export async function agentFor(permissions: string[] | "admin"): Promise<TestAgent> {
  const app = await makeApp();
  userCounter += 1;
  const username = `${FIXTURE_USER_PREFIX}${Date.now().toString(36)}-${userCounter}`;
  const password = "fixture-password-1";
  const isAdmin = permissions === "admin";
  const [row] = await db
    .insert(users)
    .values({
      username,
      password: await hashPassword(password),
      role: isAdmin ? "admin" : "manager",
      permissions: isAdmin ? [] : (permissions as string[]),
      active: true,
    })
    .returning();

  const agent = request.agent(app);
  // A GET first so attachCsrfToken plants XSRF-TOKEN, then log in with it.
  const seed = await agent.get("/api/user");
  const seedToken = csrfFrom(seed) ?? "";
  const login = await agent.post("/api/login").set("X-CSRF-Token", seedToken).send({ username, password });
  if (login.status !== 200) {
    throw new Error(`agentFor(): login failed with ${login.status}: ${JSON.stringify(login.body)}`);
  }
  // Passport regenerates the session on login, which throws away the csrfSecret
  // the seed request created. One more GET lets attachCsrfToken mint a token
  // against the *new* session; that is the one every mutating request must use.
  const refreshed = await agent.get("/api/user");
  const token = csrfFrom(refreshed) ?? csrfFrom(login) ?? seedToken;
  return { ...wrap(agent, token), userId: row.id, username, password };
}

/** A cookie jar that has never logged in — for the "anonymous gets 401" tests. */
export async function anonAgent(): Promise<TestAgent> {
  const app = await makeApp();
  const agent = request.agent(app);
  const seed = await agent.get("/api/user");
  const token = csrfFrom(seed) ?? "";
  return { ...wrap(agent, token), userId: -1, username: "(anonymous)", password: "" };
}

/**
 * Deletes everything `agentFor()` left behind — the users plus the login and
 * audit rows their logins wrote. Cleaned by username prefix, deliberately in
 * FK order; see BUG-145 for what "clean by one key only" costs.
 */
export async function cleanupFixtureUsers(): Promise<void> {
  await db.delete(auditLogs).where(like(auditLogs.username, `${FIXTURE_USER_PREFIX}%`));
  await db.delete(loginAttempts).where(like(loginAttempts.username, `${FIXTURE_USER_PREFIX}%`));
  await db.delete(users).where(like(users.username, `${FIXTURE_USER_PREFIX}%`));
}
