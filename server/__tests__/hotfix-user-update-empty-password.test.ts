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
import { users } from "../../shared/schema";
import { agentFor, anonAgent, cleanupFixtureUsers, type TestAgent } from "./helpers/app";

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
