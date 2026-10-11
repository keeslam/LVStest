/**
 * D19 (besluit B-41, spec section 11): the last active administrator account
 * cannot be deleted, demoted or deactivated (409 LAST_ADMIN); your own account
 * stays 400 CANNOT_DELETE_SELF; another administrator can be deleted; and
 * deleting an account that ever logged in works (needs the FK migration of
 * de-02-user-fk-set-null.test.ts). The users list says which row is the last
 * administrator (`isLastAdmin`), so the dialog can disable that delete button.
 *
 * "Last" is a property of the whole table, so each test first makes the
 * accounts it creates the only active administrators: every other active
 * administrator of the test database is switched off for the duration of the
 * file and switched back on in afterAll.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { and, eq, inArray, notInArray } from "drizzle-orm";
import { db } from "../db";
import { users, UserPermission } from "../../shared/schema";
import { hashPassword } from "../auth";
import { agentFor, cleanupFixtureUsers, FIXTURE_USER_PREFIX, type TestAgent } from "./helpers/app";

const switchedOff: number[] = [];
let counter = 0;

/** Switches off every active admin except `keep`, remembering them for afterAll. */
async function onlyActiveAdmins(keep: number[]): Promise<void> {
  const others = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.role, "admin"), eq(users.active, true), keep.length ? notInArray(users.id, keep) : undefined));
  const ids = others.map((r) => r.id);
  if (ids.length === 0) return;
  switchedOff.push(...ids);
  await db.update(users).set({ active: false }).where(inArray(users.id, ids));
}

async function secondAdmin(active = true): Promise<number> {
  counter += 1;
  const [row] = await db
    .insert(users)
    .values({
      username: `${FIXTURE_USER_PREFIX}de02-admin-${Date.now().toString(36)}-${counter}`,
      password: await hashPassword("fixture-password-1"),
      role: "admin",
      permissions: [],
      active,
    })
    .returning({ id: users.id });
  return row.id;
}

const exists = async (id: number) => (await db.select({ id: users.id }).from(users).where(eq(users.id, id))).length === 1;

describe("D19 - the last administrator account is protected", () => {
  let manager: TestAgent;

  beforeAll(async () => {
    manager = await agentFor([UserPermission.MANAGE_USERS]);
  }, 90_000);

  afterAll(async () => {
    await cleanupFixtureUsers();
    const restore = switchedOff.filter(Boolean);
    if (restore.length) await db.update(users).set({ active: true }).where(inArray(users.id, restore));
  });

  it("DELETE of the last active admin answers 409 LAST_ADMIN and deletes nothing", async () => {
    const admin = await agentFor("admin");
    await onlyActiveAdmins([admin.userId]);

    const res = await manager.delete(`/api/users/${admin.userId}`);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("LAST_ADMIN");
    expect(await exists(admin.userId)).toBe(true);
  });

  it("your own account is still CANNOT_DELETE_SELF, also when you are the last admin", async () => {
    const admin = await agentFor("admin");
    await onlyActiveAdmins([admin.userId]);

    const res = await admin.delete(`/api/users/${admin.userId}`);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("CANNOT_DELETE_SELF");
  });

  it("PATCH cannot demote or deactivate the last active admin (409 LAST_ADMIN)", async () => {
    const admin = await agentFor("admin");
    await onlyActiveAdmins([admin.userId]);

    for (const body of [{ role: "manager" }, { active: false }]) {
      const res = await manager.patch(`/api/users/${admin.userId}`).send(body);
      expect(res.status, JSON.stringify(body)).toBe(409);
      expect(res.body.code).toBe("LAST_ADMIN");
    }
    // The admin demoting themselves is the same case.
    const self = await admin.patch(`/api/users/${admin.userId}`).send({ role: "user" });
    expect(self.status).toBe(409);
    expect(self.body.code).toBe("LAST_ADMIN");

    const [row] = await db.select().from(users).where(eq(users.id, admin.userId));
    expect(row.role).toBe("admin");
    expect(row.active).toBe(true);
  });

  it("PATCH that leaves the last admin an active admin still works", async () => {
    const admin = await agentFor("admin");
    await onlyActiveAdmins([admin.userId]);

    const res = await manager
      .patch(`/api/users/${admin.userId}`)
      .send({ fullName: "Enige beheerder", active: true });
    expect(res.status).toBe(200);
    expect(res.body.fullName).toBe("Enige beheerder");
  });

  it("with a second active admin, one admin can delete the other, and the survivor is then protected", async () => {
    const admin = await agentFor("admin");
    const other = await secondAdmin();
    await onlyActiveAdmins([admin.userId, other]);

    const res = await admin.delete(`/api/users/${other}`);
    expect(res.status).toBe(200);
    expect(await exists(other)).toBe(false);

    const again = await manager.delete(`/api/users/${admin.userId}`);
    expect(again.status).toBe(409);
    expect(again.body.code).toBe("LAST_ADMIN");
  });

  it("with a second active admin, demoting or deactivating one of them is allowed", async () => {
    const admin = await agentFor("admin");
    const other = await secondAdmin();
    const third = await secondAdmin();
    await onlyActiveAdmins([admin.userId, other, third]);

    expect((await admin.patch(`/api/users/${other}`).send({ role: "manager" })).status).toBe(200);
    expect((await admin.patch(`/api/users/${third}`).send({ active: false })).status).toBe(200);

    // Now `admin` is the only active admin again.
    const res = await manager.patch(`/api/users/${admin.userId}`).send({ active: false });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("LAST_ADMIN");
  });

  it("an inactive admin account is not 'the last admin' and can be deleted", async () => {
    const admin = await agentFor("admin");
    const dormant = await secondAdmin(false);
    await onlyActiveAdmins([admin.userId]);

    const res = await admin.delete(`/api/users/${dormant}`);
    expect(res.status).toBe(200);
    expect(await exists(dormant)).toBe(false);
  });

  it("an account that has logged in (it has audit rows) can be deleted", async () => {
    const admin = await agentFor("admin");
    const colleague = await agentFor([]);
    await onlyActiveAdmins([admin.userId]);

    const res = await admin.delete(`/api/users/${colleague.userId}`);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(await exists(colleague.userId)).toBe(false);
  });

  it("an unknown id is a real 404", async () => {
    const admin = await agentFor("admin");
    const res = await admin.delete("/api/users/2147483000");
    expect(res.status).toBe(404);
  });

  it("GET /api/users marks the last active admin with isLastAdmin, and nobody when there are two", async () => {
    const admin = await agentFor("admin");
    const other = await secondAdmin();
    const user = await agentFor([]);
    await onlyActiveAdmins([admin.userId]);

    const solo = await admin.get("/api/users");
    expect(solo.status).toBe(200);
    const flagged = (solo.body as any[]).filter((u) => u.isLastAdmin === true).map((u) => u.id);
    expect(flagged).toEqual([admin.userId]);
    expect((solo.body as any[]).find((u) => u.id === user.userId).isLastAdmin).toBe(false);
    expect((solo.body as any[]).find((u) => u.id === other)).toBeDefined();
    expect(solo.body.every((u: any) => u.password === undefined)).toBe(true);

    await db.update(users).set({ active: true }).where(eq(users.id, other));
    const pair = await admin.get("/api/users");
    expect((pair.body as any[]).filter((u) => u.isLastAdmin === true)).toHaveLength(0);
  });
});
