/**
 * D19 (besluit B-41, spec section 11): 20 foreign keys to users.id had no ON
 * DELETE rule, so deleting an account that ever logged in (it has audit rows)
 * failed and the route answered a misleading 404. A hand-written, idempotent
 * step in startup-migration.js (marker migration:d19_user_fk_set_null) sets
 * ON DELETE SET NULL on every such key, found at run time from the catalog.
 *
 * Like company-name-migration.test.ts it runs the real script as a child
 * process against lvs_fixtest.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { eq, sql } from "drizzle-orm";
import { db } from "../db";
import { appSettings, users, auditLogs, customers } from "../../shared/schema";
import { hashPassword } from "../auth";
import { cleanupPortalTestData } from "./portal-helpers";

const STARTUP_SCRIPT = fileURLToPath(new URL("../../startup-migration.js", import.meta.url));
const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const FIXTEST_URL = /\/lvs_fixtest(\?|$)/;
const MARKER = "migration:d19_user_fk_set_null";
const MANAGER_MARKER = "migration:c_manager_rights";
const AUDIT_FK = "audit_logs_user_id_users_id_fk";
const CUSTOMER_FK = "customers_created_by_user_id_users_id_fk";

/** pg_constraint.confdeltype for every FK to users.id: a = no action, n = set null, c = cascade. */
async function deleteRules(): Promise<Record<string, string>> {
  const res = await db.execute(sql`
    SELECT c.conname, c.confdeltype::text AS rule
      FROM pg_constraint c
     WHERE c.contype = 'f' AND c.confrelid = 'users'::regclass
  `);
  return Object.fromEntries(res.rows.map((r: any) => [r.conname, r.rule]));
}

describe("startup-migration.js: user foreign keys become ON DELETE SET NULL (marker migration:d19_user_fk_set_null)", () => {
  let guarded = false;
  const saved: Record<string, typeof appSettings.$inferSelect | undefined> = {};
  const createdUsers: number[] = [];
  const createdCustomers: number[] = [];

  function runStartupMigration(): string {
    return execFileSync(process.execPath, [STARTUP_SCRIPT], {
      cwd: REPO_ROOT,
      env: { ...process.env, DATABASE_SSL: "false", TIMESTAMPTZ_MIGRATION: "" },
      encoding: "utf8",
      timeout: 60_000,
    });
  }

  async function makeUser(label: string): Promise<number> {
    const [row] = await db
      .insert(users)
      .values({
        username: `D19-probe-${label}-${Date.now().toString(36)}`,
        password: await hashPassword("fixture-password-1"),
        role: "user",
        permissions: [],
        active: true,
      })
      .returning({ id: users.id });
    createdUsers.push(row.id);
    return row.id;
  }

  beforeAll(async () => {
    expect(process.env.DATABASE_URL ?? "").toMatch(FIXTEST_URL);
    await cleanupPortalTestData();
    for (const key of [MARKER, MANAGER_MARKER]) {
      const [row] = await db.select().from(appSettings).where(eq(appSettings.key, key));
      saved[key] = row;
    }
    guarded = true;
    // Keep the manager-rights step out of this run (see company-name-migration.test.ts).
    await db.insert(appSettings).values({
      key: MANAGER_MARKER, value: { appliedAt: "d19 placeholder", granted: 0 }, category: "general",
      description: "d19 placeholder, restored after the test",
    }).onConflictDoNothing();
    await db.delete(appSettings).where(eq(appSettings.key, MARKER));
  });

  afterAll(async () => {
    if (!guarded) return;
    for (const id of createdCustomers) await db.delete(customers).where(eq(customers.id, id));
    for (const id of createdUsers) {
      await db.delete(auditLogs).where(eq(auditLogs.userId, id));
      await db.delete(users).where(eq(users.id, id));
    }
    await cleanupPortalTestData();
    for (const key of [MARKER, MANAGER_MARKER]) {
      await db.delete(appSettings).where(eq(appSettings.key, key));
      if (saved[key]) await db.insert(appSettings).values(saved[key]!).onConflictDoNothing();
    }
  });

  it("without the step a user with audit rows cannot be deleted; with it the key is cleared and the user is gone", async () => {
    // Put two keys back to 'no action' (as production has them) so the test does
    // not depend on whether an earlier run already migrated this database.
    for (const [table, name, column] of [
      ["audit_logs", AUDIT_FK, "user_id"],
      ["customers", CUSTOMER_FK, "created_by_user_id"],
    ]) {
      await db.execute(sql.raw(`ALTER TABLE ${table} DROP CONSTRAINT IF EXISTS ${name}`));
      await db.execute(sql.raw(`ALTER TABLE ${table} ADD CONSTRAINT ${name} FOREIGN KEY (${column}) REFERENCES users(id)`));
    }
    const before = await deleteRules();
    expect(before[AUDIT_FK]).toBe("a");
    expect(before[CUSTOMER_FK]).toBe("a");
    const cascadeBefore = Object.entries(before).filter(([, rule]) => rule === "c").map(([name]) => name).sort();
    const setNullBefore = Object.entries(before).filter(([, rule]) => rule === "n").map(([name]) => name).sort();

    const userId = await makeUser("a");
    await db.insert(auditLogs).values({ userId, username: "D19-probe-a", action: "user.login", status: "success" } as any);
    const [customer] = await db
      .insert(customers)
      .values({ name: "D19 klant", createdByUser: userId } as any)
      .returning({ id: customers.id });
    createdCustomers.push(customer.id);

    // The problem the step solves: the delete is refused by the database.
    await expect(db.delete(users).where(eq(users.id, userId))).rejects.toThrow();

    const first = runStartupMigration();
    expect(first).toContain("Database migration completed successfully");
    expect(first).toMatch(/ON DELETE SET NULL/);

    const after = await deleteRules();
    expect(after[AUDIT_FK]).toBe("n");
    expect(after[CUSTOMER_FK]).toBe("n");
    // No key to users.id is left without a rule, and the ones that had a rule keep it.
    expect(Object.values(after).filter((rule) => rule === "a")).toEqual([]);
    expect(Object.entries(after).filter(([, rule]) => rule === "c").map(([name]) => name).sort()).toEqual(cascadeBefore);
    for (const name of setNullBefore) expect(after[name]).toBe("n");

    const [marker] = await db.select().from(appSettings).where(eq(appSettings.key, MARKER));
    expect(marker).toBeDefined();

    await db.delete(users).where(eq(users.id, userId));
    expect(await db.select().from(users).where(eq(users.id, userId))).toHaveLength(0);
    const [auditRow] = await db.select().from(auditLogs).where(eq(auditLogs.username, "D19-probe-a"));
    expect(auditRow.userId).toBeNull();
    const [customerRow] = await db.select().from(customers).where(eq(customers.id, customer.id));
    expect(customerRow.createdByUser).toBeNull();
    await db.delete(auditLogs).where(eq(auditLogs.username, "D19-probe-a"));
  }, 120_000);

  it("runs once: the marker stops a second pass, and without the marker the step changes nothing and does not fail", async () => {
    const second = runStartupMigration();
    expect(second).toContain("Database migration completed successfully");
    expect(second).toMatch(/already|skipping/i);

    await db.delete(appSettings).where(eq(appSettings.key, MARKER));
    const rules = await deleteRules();
    const third = runStartupMigration();
    expect(third).toContain("Database migration completed successfully");
    expect(await deleteRules()).toEqual(rules);
  }, 120_000);
});
