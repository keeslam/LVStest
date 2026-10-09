/**
 * Hotfix (fysieke E2E-audit 2026-10-09, module 17, bevinding 1) — a user saved
 * from the users dialog without a new password was locked out.
 *
 * The edit form sends `password: ""` when "Nieuw wachtwoord (leeg laten om te
 * behouden)" is left empty. `PATCH /api/users/:id` only branched on a truthy
 * password, so the empty string travelled on to `storage.updateUser`, which
 * strips a truthy password and therefore wrote "" as the stored hash.
 *
 * A password that is not a non-empty string means "no change" — it must never
 * reach storage, and only a real new password is hashed and stored.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { users, UserPermission } from "../../shared/schema";
import { storage } from "../storage";
import { agentFor, anonAgent, cleanupFixtureUsers, FIXTURE_USER_PREFIX, makeApp, type TestAgent } from "./helpers/app";

async function storedHash(userId: number): Promise<string> {
  const [row] = await db.select({ password: users.password }).from(users).where(eq(users.id, userId));
  return row.password;
}

/** POST /api/login from a cookie jar that has never logged in; returns the status. */
async function loginStatus(username: string, password: string): Promise<number> {
  const anon = await anonAgent();
  const res = await anon.post("/api/login").send({ username, password });
  return res.status;
}

describe("PATCH /api/users/:id — an empty password means 'no change'", () => {
  let admin: TestAgent;

  beforeAll(async () => {
    admin = await agentFor("admin");
  }, 90_000);

  afterAll(async () => {
    await cleanupFixtureUsers();
  });

  it("password: \"\" keeps the stored hash and the user can still log in", async () => {
    const target = await agentFor([]);
    const before = await storedHash(target.userId);
    expect(before.length).toBeGreaterThan(0);

    const res = await admin.patch(`/api/users/${target.userId}`).send({ fullName: "X", password: "" });
    expect(res.status).toBe(200);
    expect(res.body.fullName).toBe("X");

    const after = await storedHash(target.userId);
    expect(after).toBe(before);
    expect(await loginStatus(target.username, target.password)).toBe(200);
  });

  it("password: \"   \" (whitespace only) keeps the stored hash too", async () => {
    const target = await agentFor([]);
    const before = await storedHash(target.userId);

    const res = await admin.patch(`/api/users/${target.userId}`).send({ fullName: "Y", password: "   " });
    expect(res.status).toBe(200);

    expect(await storedHash(target.userId)).toBe(before);
    expect(await loginStatus(target.username, target.password)).toBe(200);
  });

  it("password: null never overwrites the stored hash", async () => {
    const target = await agentFor([]);
    const before = await storedHash(target.userId);

    // Whether the body validator answers 200 or 400 is not the point; the hash is.
    const res = await admin.patch(`/api/users/${target.userId}`).send({ fullName: "Z", password: null });
    expect([200, 400]).toContain(res.status);

    expect(await storedHash(target.userId)).toBe(before);
    expect(await loginStatus(target.username, target.password)).toBe(200);
  });

  it("a real new password still replaces the hash, and only the new one logs in", async () => {
    const target = await agentFor([]);
    const before = await storedHash(target.userId);

    const res = await admin
      .patch(`/api/users/${target.userId}`)
      .send({ fullName: "W", password: "brand-new-password-2" });
    expect(res.status).toBe(200);

    const after = await storedHash(target.userId);
    expect(after).not.toBe(before);
    expect(after.length).toBeGreaterThan(0);
    expect(await loginStatus(target.username, "brand-new-password-2")).toBe(200);
    expect(await loginStatus(target.username, target.password)).toBe(401);
  });

  it("self-update with an empty password keeps the hash (restricted self-update path)", async () => {
    const self = await agentFor([]);
    const before = await storedHash(self.userId);

    const res = await self.patch(`/api/users/${self.userId}`).send({ fullName: "Mezelf", password: "" });
    expect(res.status).toBe(200);
    expect(res.body.fullName).toBe("Mezelf");

    expect(await storedHash(self.userId)).toBe(before);
    expect(await loginStatus(self.username, self.password)).toBe(200);
  });

  it("an admin editing their own row with an empty password keeps the hash", async () => {
    const self = await agentFor("admin");
    const before = await storedHash(self.userId);

    const res = await self.patch(`/api/users/${self.userId}`).send({ fullName: "Beheerder", password: "" });
    expect(res.status).toBe(200);

    expect(await storedHash(self.userId)).toBe(before);
    expect(await loginStatus(self.username, self.password)).toBe(200);
  });
});

describe("PATCH /api/users/:id — a manage_users manager and an empty password (final wave, item 1)", () => {
  afterAll(async () => {
    await cleanupFixtureUsers();
  });

  it("a manager with manage_users saving a colleague with password \"\" is not refused and the hash stays", async () => {
    // The users dialog always sends `password: ""` when the field is left empty.
    // An empty value resets nothing, so it must not trip the BUG-063 rule
    // "only an administrator can set another account's password".
    const manager = await agentFor([UserPermission.MANAGE_USERS]);
    const colleague = await agentFor([]);
    const before = await storedHash(colleague.userId);

    const res = await manager.patch(`/api/users/${colleague.userId}`).send({ fullName: "Collega", password: "" });
    expect(res.status).toBe(200);
    expect(res.body.fullName).toBe("Collega");

    expect(await storedHash(colleague.userId)).toBe(before);
    expect(await loginStatus(colleague.username, colleague.password)).toBe(200);
  });

  it("whitespace only from a manager is 'no change' as well", async () => {
    const manager = await agentFor([UserPermission.MANAGE_USERS]);
    const colleague = await agentFor([]);
    const before = await storedHash(colleague.userId);

    const res = await manager.patch(`/api/users/${colleague.userId}`).send({ fullName: "Collega 2", password: "   " });
    expect(res.status).toBe(200);
    expect(await storedHash(colleague.userId)).toBe(before);
  });

  it("a REAL new password for a colleague is still refused for a manager (BUG-063 intact)", async () => {
    const manager = await agentFor([UserPermission.MANAGE_USERS]);
    const colleague = await agentFor([]);
    const before = await storedHash(colleague.userId);

    const res = await manager.patch(`/api/users/${colleague.userId}`).send({ password: "manager-sets-this-1" });
    expect(res.status).toBe(403);
    expect(res.body.field).toBe("password");

    expect(await storedHash(colleague.userId)).toBe(before);
    expect(await loginStatus(colleague.username, colleague.password)).toBe(200);
  });
});

describe("PATCH /api/users/:id/admin — the unvalidated legacy route is gone (final wave, item 2)", () => {
  it("is not registered, so an admin gets the JSON 404 and nothing is written", async () => {
    const admin = await agentFor("admin");
    const target = await agentFor([]);
    const before = await storedHash(target.userId);

    const res = await admin.patch(`/api/users/${target.userId}/admin`).send({ password: "", fullName: "Legacy" });
    expect(res.status).toBe(404);
    expect(await storedHash(target.userId)).toBe(before);

    const app: any = await makeApp();
    const registered = app._router.stack
      .filter((layer: any) => layer.route)
      .map((layer: any) => layer.route.path);
    expect(registered).not.toContain("/api/users/:id/admin");

    await cleanupFixtureUsers();
  });
});

describe("storage.updateUser never writes a password (final wave, item 3)", () => {
  afterAll(async () => {
    await cleanupFixtureUsers();
  });

  it.each(["", "   ", "a-real-looking-password"])("a password key %j is stripped, the hash stays", async (password) => {
    const target = await agentFor([]);
    const before = await storedHash(target.userId);

    const updated = await storage.updateUser(target.userId, { fullName: "Via storage", password } as any);
    expect(updated?.fullName).toBe("Via storage");

    expect(await storedHash(target.userId)).toBe(before);
    expect(await loginStatus(target.username, target.password)).toBe(200);
  });
});

describe("POST /api/users — a blank password is refused (final wave, item 4)", () => {
  afterAll(async () => {
    await cleanupFixtureUsers();
  });

  const body = (suffix: string, password: unknown) => ({
    username: `${FIXTURE_USER_PREFIX}new-${Date.now().toString(36)}-${suffix}`,
    password,
    fullName: "Nieuw",
    role: "user",
    permissions: [],
    active: true,
  });

  it.each([["empty", ""], ["whitespace", "   "]])("%s password answers 400 and creates no account", async (label, password) => {
    const admin = await agentFor("admin");
    const payload = body(label, password);

    const res = await admin.post("/api/users").send(payload);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("PASSWORD_REQUIRED");

    const rows = await db.select({ id: users.id }).from(users).where(eq(users.username, payload.username));
    expect(rows).toHaveLength(0);
  });

  it("a real password still creates the account, and it can log in", async () => {
    const admin = await agentFor("admin");
    const payload = body("real", "a-real-password-1");

    const res = await admin.post("/api/users").send(payload);
    expect(res.status).toBe(201);
    expect(res.body.password).toBeUndefined();
    expect(await loginStatus(payload.username, "a-real-password-1")).toBe(200);
  });
});
