/**
 * Sub-project C (besluiten **B-30, B-33, B-38, B-39**) - three new per-account
 * rights, granted once to every account with role `manager`:
 *
 *   revert_handover          - undo a pickup, a return or a cancellation
 *   cancel_picked_up_rental  - cancel or delete a rental that was already picked up
 *   manage_recycle_bin       - see, restore and empty every recycle bin
 *
 * A role is only a label in this application: role `admin` passes every check
 * on its own (`hasPermission()` short-circuits), every other account has an
 * explicit `permissions` list. The owner decided that admin and manager may do
 * all of the above, so the managers get the three values once; nobody else
 * does unless an administrator ticks the box.
 *
 * `role = 'admin'` accounts are untouched. Accounts of any other role are
 * untouched too.
 *
 * **Operational rule (remediation plan section 1.2.3).** This script changes
 * data. It defaults to a dry run and refuses to write outside `lvs_fixtest`
 * unless `--i-know-what-i-am-doing` is passed - the same rule as
 * scripts/migrate-document-permissions.ts.
 *
 *   npx tsx scripts/migrate-manager-rights-c.ts           # dry run
 *   npx tsx scripts/migrate-manager-rights-c.ts --apply   # writes (lvs_fixtest only)
 *
 * A deploy does not need this script: startup-migration.js runs the same
 * mapping once (`grantManagerRightsC`), guarded by the `app_settings` marker
 * below, and never aborts the boot.
 */
import { eq, sql } from "drizzle-orm";
import { db } from "../server/db";
import { users, appSettings, UserPermission } from "../shared/schema";

/**
 * The single declaration of the mapping. startup-migration.js repeats it in
 * SQL. server/__tests__/c-01-rights.test.ts checks that the marker and the three
 * right names also occur in startup-migration.js, and runs that script against
 * lvs_fixtest to see which accounts end up with which rights; it does not diff
 * the two implementations line by line.
 */
export const MANAGER_RIGHTS_C = {
  /** `app_settings.key` that records the step as done, so it runs exactly once. */
  marker: "migration:c_manager_rights",
  /** In the order they are appended to a manager's list. */
  rights: [
    UserPermission.REVERT_HANDOVER,
    UserPermission.CANCEL_PICKED_UP_RENTAL,
    UserPermission.MANAGE_RECYCLE_BIN,
  ] as string[],
} as const;

/**
 * The rights that have to be *added* to `current` for an account of `role`.
 * Pure, so the mapping is testable without a database.
 */
export function managerRightsCFor(role: string, current: readonly string[]): string[] {
  if (role !== "manager") return [];
  const held = new Set(current);
  return MANAGER_RIGHTS_C.rights.filter((right) => !held.has(right));
}

export interface ManagerRightsCResult {
  dryRun: boolean;
  /** Accounts looked at (role manager only). */
  considered: number;
  /** Accounts that gain at least one of the three rights. */
  gained: number;
  /** Accounts left exactly as they were. */
  unchanged: number;
  updated: number;
}

export async function migrateManagerRightsC(
  options: { dryRun?: boolean } = {},
): Promise<ManagerRightsCResult> {
  const dryRun = options.dryRun ?? true;

  const rows = await db
    .select({ id: users.id, role: users.role, permissions: users.permissions })
    .from(users)
    .where(eq(users.role, "manager"));

  let updated = 0;
  const pending: Array<{ id: number; permissions: string[] }> = [];

  for (const row of rows) {
    // Same rule as the startup step: a permissions value that is not a list is
    // left alone rather than guessed at.
    if (!Array.isArray(row.permissions)) continue;
    const additions = managerRightsCFor(row.role, row.permissions);
    if (additions.length === 0) continue;
    pending.push({ id: row.id, permissions: [...row.permissions, ...additions] });
  }

  if (!dryRun) {
    for (const change of pending) {
      await db.update(users).set({ permissions: change.permissions }).where(eq(users.id, change.id));
      updated += 1;
    }
    await db
      .insert(appSettings)
      .values({
        key: MANAGER_RIGHTS_C.marker,
        value: { appliedAt: new Date().toISOString(), granted: updated },
        category: "general",
        description:
          "Sub-project C: revert_handover, cancel_picked_up_rental and manage_recycle_bin granted once to role manager",
      })
      .onConflictDoNothing({ target: appSettings.key });
  }

  return {
    dryRun,
    considered: rows.length,
    gained: pending.length,
    unchanged: rows.length - pending.length,
    updated,
  };
}

/** `true` only for the dedicated remediation test database. */
function isTestDatabase(): boolean {
  return /\/lvs_fixtest(\?|$)/.test(process.env.DATABASE_URL ?? "");
}

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");
  const forced = process.argv.includes("--i-know-what-i-am-doing");

  if (apply && !isTestDatabase() && !forced) {
    console.error(
      "Refusing to write: DATABASE_URL does not point at lvs_fixtest.\n" +
      "Running this against the development clone, an audit database or production is an\n" +
      "owner decision (remediation plan section 1.2.3).",
    );
    process.exitCode = 2;
    return;
  }

  const result = await migrateManagerRightsC({ dryRun: !apply });
  console.log(
    `[C] ${result.considered} manager account(s): ${result.gained} gain at least one of ` +
    `${MANAGER_RIGHTS_C.rights.join(", ")}, ${result.unchanged} unchanged.` +
    (result.dryRun ? " Dry run - re-run with --apply to write." : ` Wrote ${result.updated}.`),
  );
  const [marker] = await db
    .select({ key: appSettings.key })
    .from(appSettings)
    .where(sql`${appSettings.key} = ${MANAGER_RIGHTS_C.marker}`);
  console.log(`[C] marker ${MANAGER_RIGHTS_C.marker}: ${marker ? "present" : "absent"}`);
}

if (process.argv[1] && /migrate-manager-rights-c\.(ts|js)$/.test(process.argv[1])) {
  main().then(
    () => process.exit(process.exitCode ?? 0),
    (err) => {
      console.error(err);
      process.exit(1);
    },
  );
}
