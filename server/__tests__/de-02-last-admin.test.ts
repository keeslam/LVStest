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
 * file and switched back on afterwards.
 *
 * THAT IS DANGEROUS ON A SHARED DATABASE: any other test file logging in as an
 * administrator at the same time fails, and a killed run would leave every
 * administrator switched off. So the file only runs when
 * DE02_ALLOW_ADMIN_TOGGLE=1 is set, by whoever runs it ALONE (nothing else
 * testing against the same database). The ids are snapshotted before the first
 * switch and restored in a finally, and, if the process dies, by an exit hook
 * that restores them synchronously through a child process.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { and, eq, inArray, notInArray, sql } from "drizzle-orm";
import { db } from "../db";
import { appSettings, users, UserPermission } from "../../shared/schema";
import { hashPassword } from "../auth";
import { agentFor, cleanupFixtureUsers, FIXTURE_USER_PREFIX, type TestAgent } from "./helpers/app";

const ALLOWED = process.env.DE02_ALLOW_ADMIN_TOGGLE === "1";
const STARTUP_SCRIPT = fileURLToPath(new URL("../../startup-migration.js", import.meta.url));
const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const FK_MARKER = "migration:d19_user_fk_set_null";

/** Active administrators as they were before this file touched anything. */
let snapshot: number[] = [];
let restoredByHook = false;
let counter = 0;

/** Synchronous, for the exit hook: a child process puts the snapshot back. */
function restoreSynchronously(): void {
  if (restoredByHook || snapshot.length === 0) return;
  restoredByHook = true;
  try {
    execFileSync(
      process.execPath,
      [
        "-e",
        "const {Client}=require('pg');(async()=>{const c=new Client({connectionString:process.env.DATABASE_URL});await c.connect();await c.query(\"UPDATE users SET active = true WHERE role = 'admin' AND id = ANY($1::int[])\",[JSON.parse(process.argv[1])]);await c.end()})()",
        JSON.stringify(snapshot),
      ],
      { cwd: REPO_ROOT, env: { ...process.env, DATABASE_SSL: "false" }, timeout: 20_000 },
    );
  } catch {
    /* nothing more can be done while exiting */
  }
}

async function restoreAdmins(): Promise<void> {
  if (snapshot.length === 0) return;
  await db.update(users).set({ active: true }).where(and(eq(users.role, "admin"), inArray(users.id, snapshot)));
  restoredByHook = true; // restored in-process: the exit hook has nothing left to do
}

/** The "logged-in account can be deleted" test needs the D19 FK rule; apply the step if the database lacks it. */
async function ensureUserForeignKeyRule(): Promise<void> {
  const res = await db.execute(sql`
    SELECT 1 FROM pg_constraint
     WHERE contype = 'f' AND confrelid = 'users'::regclass AND confdeltype = 'a'
       AND conrelid = 'audit_logs'::regclass
  `);
  if (res.rows.length === 0) return;
  await db.delete(appSettings).where(eq(appSettings.key, FK_MARKER));
  execFileSync(process.execPath, [STARTUP_SCRIPT], {
    cwd: REPO_ROOT,
    env: { ...process.env, DATABASE_SSL: "false", TIMESTAMPTZ_MIGRATION: "" },
    encoding: "utf8",
    timeout: 60_000,
  });
}

/** Switches off every active admin except `keep`, remembering them for afterAll. */
async function onlyActiveAdmins(keep: number[]): Promise<void> {
  const others = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.role, "admin"), eq(users.active, true), keep.length ? notInArray(users.id, keep) : undefined));
  const ids = others.map((r) => r.id);
  if (ids.length === 0) return;
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

if (!ALLOWED) {
  console.warn(
    "[de-02-last-admin] SKIPPED: the file switches every other active administrator of the test database off while it runs. " +
      "Run it alone (nothing else testing against the same database) with DE02_ALLOW_ADMIN_TOGGLE=1.",
  );
}

describe.skipIf(!ALLOWED)("D19 - the last administrator account is protected", () => {
  let manager: TestAgent;

  beforeAll(async () => {
    const active = await db.select({ id: users.id }).from(users).where(and(eq(users.role, "admin"), eq(users.active, true)));
    snapshot = active.map((r) => r.id);
    restoredByHook = false;
    process.on("exit", restoreSynchronously);
    await ensureUserForeignKeyRule();
    manager = await agentFor([UserPermission.MANAGE_USERS]);
  }, 90_000);

  afterAll(async () => {
    try {
      // First: put the administrators back. Then the fixture clean-up, which may fail.
      await restoreAdmins();
    } finally {
      process.off("exit", restoreSynchronously);
      await cleanupFixtureUsers();
    }
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
