/**
 * D12 (besluit B-41, spec section 8): one password rule for staff accounts -
 * at least 10 characters with a lower case letter, an upper case letter and a
 * digit - on every route that stores a new password, answered as a stable
 * `PASSWORD_TOO_WEAK` code with the broken rules in `issues`.
 *
 * The rule runs AFTER the existing 403 checks (fix-i, fix-d), and a user no
 * longer sets their own password through PATCH (USE_CHANGE_PASSWORD): that goes
 * through "Wachtwoord wijzigen" with the current password.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { users, UserPermission } from "../../shared/schema";
import { agentFor, anonAgent, cleanupFixtureUsers, FIXTURE_USER_PREFIX, type TestAgent } from "./helpers/app";

const STRONG = "Sterk-Wachtwoord-1";

async function storedHash(userId: number): Promise<string> {
  const [row] = await db.select({ password: users.password }).from(users).where(eq(users.id, userId));
  return row.password;
}

async function loginStatus(username: string, password: string): Promise<number> {
  const anon = await anonAgent();
  return (await anon.post("/api/login").send({ username, password })).status;
}

let counter = 0;
function newUserBody(password: unknown) {
  counter += 1;
  return {
    username: `${FIXTURE_USER_PREFIX}de01-${Date.now().toString(36)}-${counter}`,
    password,
    fullName: "Nieuw",
    role: "user",
    permissions: [],
    active: true,
  };
}

describe("D12 - POST /api/users", () => {
  let admin: TestAgent;
  beforeAll(async () => {
    admin = await agentFor("admin");
  }, 90_000);
  afterAll(async () => {
    await cleanupFixtureUsers();
  });

  it.each([
    ["too short", "Abcdefgh1", ["tooShort"]],
    ["no upper case", "abcdefghij1", ["needsUpper"]],
    ["no lower case", "ABCDEFGHIJ1", ["needsLower"]],
    ["no digit", "Abcdefghijk", ["needsDigit"]],
  ])("a password with %s answers 400 PASSWORD_TOO_WEAK and creates nothing", async (_label, password, issues) => {
    const payload = newUserBody(password);
    const res = await admin.post("/api/users").send(payload);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("PASSWORD_TOO_WEAK");
    expect(res.body.field).toBe("password");
    expect(res.body.issues).toEqual(issues);
    const rows = await db.select({ id: users.id }).from(users).where(eq(users.username, payload.username));
    expect(rows).toHaveLength(0);
  });

  it("a blank password is still PASSWORD_REQUIRED, not PASSWORD_TOO_WEAK", async () => {
    const res = await admin.post("/api/users").send(newUserBody(""));
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("PASSWORD_REQUIRED");
  });

  it("a password that follows the rule creates the account and can log in", async () => {
    const payload = newUserBody(STRONG);
    const res = await admin.post("/api/users").send(payload);
    expect(res.status).toBe(201);
    expect(await loginStatus(payload.username, STRONG)).toBe(200);
  });

  it("the 403 for a manager creating an admin comes before the password rule", async () => {
    const manager = await agentFor([UserPermission.MANAGE_USERS]);
    const res = await manager.post("/api/users").send({ ...newUserBody("zwak"), role: "admin" });
    expect(res.status).toBe(403);
  });
});

describe("D12 - PATCH /api/users/:id", () => {
  afterAll(async () => {
    await cleanupFixtureUsers();
  });

  it("an admin resetting another account with a weak password gets PASSWORD_TOO_WEAK and the hash stays", async () => {
    const admin = await agentFor("admin");
    const target = await agentFor([]);
    const before = await storedHash(target.userId);

    const res = await admin.patch(`/api/users/${target.userId}`).send({ password: "kort1A" });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("PASSWORD_TOO_WEAK");
    expect(res.body.issues).toEqual(["tooShort"]);
    expect(await storedHash(target.userId)).toBe(before);
    expect(await loginStatus(target.username, target.password)).toBe(200);
  });

  it("an admin may still reset another account with a strong password", async () => {
    const admin = await agentFor("admin");
    const target = await agentFor([]);

    const res = await admin.patch(`/api/users/${target.userId}`).send({ password: STRONG });
    expect(res.status).toBe(200);
    expect(await loginStatus(target.username, STRONG)).toBe(200);
    expect(await loginStatus(target.username, target.password)).toBe(401);
  });

  it("a blank password is still 'no change' and is not judged by the rule", async () => {
    const admin = await agentFor("admin");
    const target = await agentFor([]);
    const res = await admin.patch(`/api/users/${target.userId}`).send({ fullName: "Zonder", password: "" });
    expect(res.status).toBe(200);
  });

  it("the 403 for a manager setting another account password comes before the rule", async () => {
    const manager = await agentFor([UserPermission.MANAGE_USERS]);
    const target = await agentFor([]);
    const res = await manager.patch(`/api/users/${target.userId}`).send({ password: "zwak" });
    expect(res.status).toBe(403);
  });

  it.each([
    ["a user without rights", () => agentFor([])],
    ["a manager with manage_users", () => agentFor([UserPermission.MANAGE_USERS])],
    ["an administrator", () => agentFor("admin")],
  ])("%s cannot set their own password through PATCH (USE_CHANGE_PASSWORD)", async (_label, make) => {
    const self = await make();
    const before = await storedHash(self.userId);
    const res = await self.patch(`/api/users/${self.userId}`).send({ password: STRONG });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("USE_CHANGE_PASSWORD");
    expect(res.body.field).toBe("password");
    expect(await storedHash(self.userId)).toBe(before);
    expect(await loginStatus(self.username, self.password)).toBe(200);
  });

  it("saving your own profile without a password still works", async () => {
    const self = await agentFor([]);
    const res = await self.patch(`/api/users/${self.userId}`).send({ fullName: "Ik", password: "" });
    expect(res.status).toBe(200);
  });
});

describe("D12 - POST /api/users/change-password", () => {
  afterAll(async () => {
    await cleanupFixtureUsers();
  });

  it("answers 400 PASSWORD_TOO_WEAK with the broken rules, hash unchanged", async () => {
    const user = await agentFor([]);
    const before = await storedHash(user.userId);
    const res = await user
      .post("/api/users/change-password")
      .send({ currentPassword: user.password, newPassword: "Abcdefgh1" });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("PASSWORD_TOO_WEAK");
    expect(res.body.issues).toEqual(["tooShort"]);
    expect(await storedHash(user.userId)).toBe(before);
  });

  it("reports several broken rules at once", async () => {
    const user = await agentFor([]);
    const res = await user
      .post("/api/users/change-password")
      .send({ currentPassword: user.password, newPassword: "kort" });
    expect(res.status).toBe(400);
    expect(res.body.issues).toEqual(["tooShort", "needsUpper", "needsDigit"]);
  });

  it("accepts a password that follows the rule", async () => {
    const user = await agentFor([]);
    const res = await user
      .post("/api/users/change-password")
      .send({ currentPassword: user.password, newPassword: STRONG });
    expect(res.status).toBe(200);
    expect(await loginStatus(user.username, STRONG)).toBe(200);
  });

  it("a wrong current password is reported when the new one is fine", async () => {
    const user = await agentFor([]);
    const res = await user
      .post("/api/users/change-password")
      .send({ currentPassword: "niet-het-huidige", newPassword: STRONG });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("CURRENT_PASSWORD_INCORRECT");
  });
});

describe("D12 - POST /api/register", () => {
  afterAll(async () => {
    await cleanupFixtureUsers();
  });

  it("refuses a weak password with PASSWORD_TOO_WEAK", async () => {
    const admin = await agentFor("admin");
    const payload = newUserBody("zwakzwakzwak");
    const res = await admin.post("/api/register").send(payload);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("PASSWORD_TOO_WEAK");
    expect(res.body.issues).toEqual(["needsUpper", "needsDigit"]);
    const rows = await db.select({ id: users.id }).from(users).where(eq(users.username, payload.username));
    expect(rows).toHaveLength(0);
  });

  it("accepts a strong password", async () => {
    const admin = await agentFor("admin");
    const res = await admin.post("/api/register").send(newUserBody(STRONG));
    expect(res.status).toBe(201);
  });

  it("a non-admin still gets the 403 first", async () => {
    const manager = await agentFor([UserPermission.MANAGE_USERS]);
    const res = await manager.post("/api/register").send(newUserBody("zwak"));
    expect(res.status).toBe(403);
  });
});
