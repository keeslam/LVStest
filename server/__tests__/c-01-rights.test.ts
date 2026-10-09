/**
 * Sub-project C, task 1 (besluiten B-30, B-33, B-38, B-39) — the three new
 * rights, the recycle-bin guard and the one-time grant to role manager.
 *
 *   revert_handover          Overdracht terugdraaien
 *   cancel_picked_up_rental  Opgehaalde huur annuleren of verwijderen
 *   manage_recycle_bin       Prullenbak beheren
 *
 * Spec: docs/superpowers/specs/2026-10-09-terugdraaien-prullenbak-design.md §1, §7.
 *
 * The startup step lives in startup-migration.js, which runs itself on import
 * and exports nothing - so the real thing is exercised the way production runs
 * it: `node startup-migration.js` as a child process against lvs_fixtest.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { and, eq, inArray, like } from "drizzle-orm";
import { db } from "../db";
import { users, appSettings, deletedRecords, customers, UserPermission } from "../../shared/schema";
import { permissionLabel, PERMISSION_LABELS } from "../../shared/permission-labels";
import { PROFILES, ROLES } from "../../e2e/seed/users";
import {
  MANAGER_RIGHTS_C,
  managerRightsCFor,
  migrateManagerRightsC,
} from "../../scripts/migrate-manager-rights-c";
import { agentFor, anonAgent, cleanupFixtureUsers, FIXTURE_USER_PREFIX, type TestAgent } from "./helpers/app";
import { createFixtureCustomer, cleanupFixtures, FIXTURE_PREFIX } from "./helpers/fixtures";

const NEW_RIGHTS = ["revert_handover", "cancel_picked_up_rental", "manage_recycle_bin"] as const;
const MARKER = "migration:c_manager_rights";
const STARTUP_SCRIPT = fileURLToPath(new URL("../../startup-migration.js", import.meta.url));
const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
// The exact form scripts/migrate-manager-rights-c.ts uses: the database name must
// end the path, so lvs_fixtest_copy or a URL that merely mentions lvs_fixtest fails.
const FIXTEST_URL = /\/lvs_fixtest(\?|$)/;

function runStartupMigration(): string {
  // The child gets the environment of this test run, so it can only ever touch
  // the database the test itself is allowed to touch. TIMESTAMPTZ_MIGRATION is
  // blanked on purpose: startup-migration.js converts every timestamp column
  // when it is "apply", and a developer shell must not turn that on here.
  return execFileSync(process.execPath, [STARTUP_SCRIPT], {
    cwd: REPO_ROOT,
    env: { ...process.env, DATABASE_SSL: "false", TIMESTAMPTZ_MIGRATION: "" },
    encoding: "utf8",
    timeout: 60_000,
  });
}

/**
 * For a describe that writes to every manager row and to the one-time marker:
 * refuse to run anywhere but lvs_fixtest, and leave the marker as it was found.
 *
 * Vitest runs a suite's afterAll even when its beforeAll threw (the runner marks
 * the tests skipped, rethrows into its own catch, then still calls the afterAll
 * hooks), so the cleanup cannot assume the guard held. `guarded` is set only
 * once the guard has passed and the marker row is captured; without it a wrong
 * DATABASE_URL would fail the guard and then delete that database's real marker,
 * and the next boot would grant the three rights to the managers all over again.
 */
function useFixtestMarkerGuard(): void {
  let guarded = false;
  let markerBefore: (typeof appSettings.$inferSelect) | undefined;

  beforeAll(async () => {
    expect(process.env.DATABASE_URL ?? "").toMatch(FIXTEST_URL);
    const [row] = await db.select().from(appSettings).where(eq(appSettings.key, MARKER));
    markerBefore = row;
    guarded = true;
    await db.delete(appSettings).where(eq(appSettings.key, MARKER));
  });

  afterAll(async () => {
    if (!guarded) return;
    await cleanupFixtureUsers();
    // Leave the marker the way this describe found it.
    await db.delete(appSettings).where(eq(appSettings.key, MARKER));
    if (markerBefore) await db.insert(appSettings).values(markerBefore).onConflictDoNothing();
  });
}

let counter = 0;
async function createAccount(role: string, permissions: string[]): Promise<number> {
  counter += 1;
  const [row] = await db
    .insert(users)
    .values({
      username: `${FIXTURE_USER_PREFIX}c01-${Date.now().toString(36)}-${counter}`,
      password: "not-a-real-hash",
      role,
      permissions,
      active: true,
    })
    .returning({ id: users.id });
  return row.id;
}

async function permissionsOf(id: number): Promise<unknown> {
  const [row] = await db.select({ permissions: users.permissions }).from(users).where(eq(users.id, id));
  return row.permissions;
}

describe("C-01 - the three new rights exist and are labelled", () => {
  it("are values of UserPermission, in the spec order right after authorize_mileage_decrease", () => {
    expect(UserPermission.REVERT_HANDOVER).toBe("revert_handover");
    expect(UserPermission.CANCEL_PICKED_UP_RENTAL).toBe("cancel_picked_up_rental");
    expect(UserPermission.MANAGE_RECYCLE_BIN).toBe("manage_recycle_bin");

    const values = Object.values(UserPermission) as string[];
    const at = values.indexOf("authorize_mileage_decrease");
    expect(at).toBeGreaterThanOrEqual(0);
    expect(values.slice(at + 1, at + 4)).toEqual([...NEW_RIGHTS]);
  });

  it("each has its Dutch label (the users dialog renders them from Object.values)", () => {
    expect(permissionLabel("revert_handover")).toBe("Overdracht terugdraaien");
    expect(permissionLabel("cancel_picked_up_rental")).toBe("Opgehaalde huur annuleren of verwijderen");
    expect(permissionLabel("manage_recycle_bin")).toBe("Prullenbak beheren");
    // No value of the model may fall back to its raw key.
    for (const value of Object.values(UserPermission)) {
      expect(PERMISSION_LABELS[value], `${value} has no Dutch label`).toBeTruthy();
    }
  });
});

describe("C-01 - the E2E profiles", () => {
  it("admin and manager receive the three rights; no other profile does", () => {
    for (const right of NEW_RIGHTS) {
      expect(PROFILES.admin, `admin lacks ${right}`).toContain(right);
      expect(PROFILES.manager, `manager lacks ${right}`).toContain(right);
      for (const role of ROLES.filter((r) => r !== "admin" && r !== "manager")) {
        expect(PROFILES[role], `${role} must not hold ${right}`).not.toContain(right);
      }
    }
  });

  it("the maintenance profile can see reservations (the completion story needs it)", () => {
    expect(PROFILES.maintenance).toContain("view_reservations");
  });
});

describe("C-01 - the grant to role manager: pure mapping and its mirror script", () => {
  it("declares the marker and the three rights once, the way startup-migration.js repeats them", () => {
    expect(MANAGER_RIGHTS_C.marker).toBe(MARKER);
    expect([...MANAGER_RIGHTS_C.rights]).toEqual([...NEW_RIGHTS]);
    const source = readFileSync(STARTUP_SCRIPT, "utf8");
    expect(source).toContain(MARKER);
    for (const right of NEW_RIGHTS) expect(source).toContain(right);
  });

  it("a manager gets what is missing, an admin and any other role get nothing", () => {
    expect(managerRightsCFor("manager", [])).toEqual([...NEW_RIGHTS]);
    expect(managerRightsCFor("manager", ["view_vehicles", "revert_handover"])).toEqual([
      "cancel_picked_up_rental",
      "manage_recycle_bin",
    ]);
    expect(managerRightsCFor("manager", [...NEW_RIGHTS])).toEqual([]);
    expect(managerRightsCFor("admin", [])).toEqual([]);
    for (const role of ["user", "cleaner", "viewer", "accountant", "maintenance"]) {
      expect(managerRightsCFor(role, [])).toEqual([]);
    }
  });

  describe("against lvs_fixtest", () => {
    // --apply writes the marker row too; the helper puts it back as found.
    useFixtestMarkerGuard();

    it("a dry run counts and writes nothing; --apply writes once and the second run changes nothing", async () => {
      const manager = await createAccount("manager", []);
      const admin = await createAccount("admin", []);
      const other = await createAccount("user", ["manage_reservations"]);

      const dry = await migrateManagerRightsC({ dryRun: true });
      expect(dry.dryRun).toBe(true);
      expect(dry.gained).toBeGreaterThanOrEqual(1);
      expect(await permissionsOf(manager)).toEqual([]);

      const first = await migrateManagerRightsC({ dryRun: false });
      expect(first.updated).toBeGreaterThanOrEqual(1);
      expect(await permissionsOf(manager)).toEqual([...NEW_RIGHTS]);
      expect(await permissionsOf(admin)).toEqual([]);
      expect(await permissionsOf(other)).toEqual(["manage_reservations"]);

      const second = await migrateManagerRightsC({ dryRun: false });
      expect(second.updated).toBe(0);
      expect(await permissionsOf(manager)).toEqual([...NEW_RIGHTS]);
    });
  });
});

describe("C-01 - startup-migration.js: the one-time grant (marker migration:c_manager_rights)", () => {
  // The step writes to every manager in the database it runs against.
  useFixtestMarkerGuard();

  it("grants the three rights to managers, skips admin and other roles, survives a malformed row, and runs once", async () => {
    const empty = await createAccount("manager", []);
    const partial = await createAccount("manager", ["view_vehicles", "revert_handover"]);
    const complete = await createAccount("manager", [...NEW_RIGHTS]);
    const admin = await createAccount("admin", []);
    const plain = await createAccount("user", ["manage_reservations"]);
    // A permissions value that is not a list must be skipped, never abort the boot.
    const malformed = await createAccount("manager", []);
    await db.update(users).set({ permissions: { odd: true } as any }).where(eq(users.id, malformed));

    const firstRun = runStartupMigration();
    expect(firstRun).toContain("Database migration completed successfully");
    expect(firstRun).toMatch(/manager rights \(C\)/i);

    expect(await permissionsOf(empty)).toEqual([...NEW_RIGHTS]);
    expect(await permissionsOf(partial)).toEqual(["view_vehicles", "revert_handover", "cancel_picked_up_rental", "manage_recycle_bin"]);
    expect(await permissionsOf(complete)).toEqual([...NEW_RIGHTS]);
    expect(await permissionsOf(admin)).toEqual([]);
    expect(await permissionsOf(plain)).toEqual(["manage_reservations"]);
    expect(await permissionsOf(malformed)).toEqual({ odd: true });
    const [marker] = await db.select().from(appSettings).where(eq(appSettings.key, MARKER));
    expect(marker).toBeDefined();

    // Second boot: an administrator who unticked a right must not get it back.
    await db.update(users).set({ permissions: [] }).where(eq(users.id, empty));
    const secondRun = runStartupMigration();
    expect(secondRun).toContain("Database migration completed successfully");
    expect(secondRun).toMatch(/already (granted|mapped)/i);
    expect(await permissionsOf(empty)).toEqual([]);
    expect(await permissionsOf(partial)).toEqual(["view_vehicles", "revert_handover", "cancel_picked_up_rental", "manage_recycle_bin"]);
  }, 90_000);
});

describe("C-01 - the recycle bin opens for manage_recycle_bin instead of requireAdmin", () => {
  let admin: TestAgent;
  let reservationsOnly: TestAgent;
  let binKeeper: TestAgent;
  let customerId: number;
  let binRecordId: number;

  beforeAll(async () => {
    admin = await agentFor("admin");
    reservationsOnly = await agentFor(["manage_reservations", "view_reservations", "manage_vehicles", "manage_customers"]);
    binKeeper = await agentFor(["manage_recycle_bin"]);
    // One real bin row: delete a customer through the route.
    const customer = await createFixtureCustomer("C01-bin");
    customerId = customer.id;
    const deleted = await admin.delete(`/api/customers/${customer.id}`);
    expect(deleted.status).toBe(204);
    const [record] = await db
      .select()
      .from(deletedRecords)
      .where(and(eq(deletedRecords.entityType, "customer"), eq(deletedRecords.entityId, customer.id)));
    binRecordId = record.id;
  }, 90_000);

  afterAll(async () => {
    await db.delete(deletedRecords).where(like(deletedRecords.label, `${FIXTURE_PREFIX}%`));
    await db.delete(customers).where(inArray(customers.id, [customerId]));
    await cleanupFixtures();
    await cleanupFixtureUsers();
  });

  it("GET /api/deleted-records: 401 anonymous, 403 for manage_reservations (and the other manage rights) alone, 200 for manage_recycle_bin, 200 for admin", async () => {
    const anon = await anonAgent();
    expect((await anon.get("/api/deleted-records")).status).toBe(401);

    const refused = await reservationsOnly.get("/api/deleted-records");
    expect(refused.status).toBe(403);
    expect(refused.body.message).toContain("manage_recycle_bin");

    const keeper = await binKeeper.get("/api/deleted-records");
    expect(keeper.status).toBe(200);
    expect(keeper.body.map((r: any) => r.id)).toContain(binRecordId);

    const adminList = await admin.get("/api/deleted-records");
    expect(adminList.status).toBe(200);
  });

  it("POST /api/deleted-records/:id/restore: 403 without the right (row stays binned), 200 with it", async () => {
    const refused = await reservationsOnly.post(`/api/deleted-records/${binRecordId}/restore`).send({});
    expect(refused.status).toBe(403);
    const [still] = await db.select().from(deletedRecords).where(eq(deletedRecords.id, binRecordId));
    expect(still.restoredAt).toBeNull();

    const restored = await binKeeper.post(`/api/deleted-records/${binRecordId}/restore`).send({});
    expect(restored.status).toBe(200);
    const [after] = await db.select().from(deletedRecords).where(eq(deletedRecords.id, binRecordId));
    expect(after.restoredAt).not.toBeNull();
    const [customer] = await db.select().from(customers).where(eq(customers.id, customerId));
    expect(customer).toBeDefined();
  });

  it("an admin still restores (the role bypass of hasPermission)", async () => {
    const customer = await createFixtureCustomer("C01-admin-restore");
    expect((await admin.delete(`/api/customers/${customer.id}`)).status).toBe(204);
    const [record] = await db
      .select()
      .from(deletedRecords)
      .where(and(eq(deletedRecords.entityType, "customer"), eq(deletedRecords.entityId, customer.id)));
    const restored = await admin.post(`/api/deleted-records/${record.id}/restore`).send({});
    expect(restored.status).toBe(200);
  });
});
