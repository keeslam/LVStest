/**
 * besluiten.md **B-23** — "extra vinkje in admin panel of dit ook
 * bekeken/bewerkt mag worden" (BUG-167).
 *
 * Two permissions now guard every document and PDF route:
 *
 *   view_documents    — read a document, download it, read `contracts/data`
 *   manage_documents  — generate, upload, edit, e-mail, delete
 *
 * Until this wave `/api/contracts/*` sat behind `requireAuth` only, so *every*
 * logged-in account could pull a customer's address, telephone number and
 * driving-licence number out of `contracts/data` and write `documents` rows.
 * Closing that gate would take contract generation away from the people who
 * actually do it, so this step hands the new permissions to the accounts whose
 * present-day work needs them — and to nobody else.
 *
 * **What is mapped, exactly:**
 *
 * | account already has   | gets `view_documents` | gets `manage_documents` |
 * |-----------------------|-----------------------|-------------------------|
 * | `manage_documents`    | yes                   | (already has it)        |
 * | `manage_reservations` | yes                   | yes                     |
 * | `view_reservations`   | yes                   | no                      |
 * | anything else only    | no                    | no                      |
 *
 * `role = 'admin'` accounts are untouched: `hasPermission()` short-circuits on
 * the admin role, so they already pass every gate.
 *
 * The `view_vehicles`-only account from BUG-167 is deliberately in the last
 * row: it gets nothing, which is the whole point of the decision.
 *
 * **Operational rule (remediation plan §1.2.3).** This script changes data. It
 * defaults to a dry run and refuses to write outside `lvs_fixtest` unless
 * `--i-know-what-i-am-doing` is passed — the same rule as
 * scripts/close-returned-reservations.ts.
 *
 *   npx tsx scripts/migrate-document-permissions.ts           # dry run
 *   npx tsx scripts/migrate-document-permissions.ts --apply   # writes (lvs_fixtest only)
 *
 * A deploy does not need this script: startup-migration.js runs the same
 * mapping once, guarded by the `app_settings` marker below.
 */
import { eq, sql } from "drizzle-orm";
import { db } from "../server/db";
import { users, appSettings, UserPermission } from "../shared/schema";

/**
 * The single declaration of the mapping. startup-migration.js repeats it in
 * SQL; server/__tests__/wave12-document-permissions.test.ts asserts the two
 * agree.
 */
export const DOCUMENT_PERMISSION_MIGRATION = {
  /** `app_settings.key` that records the step as done, so it runs exactly once. */
  marker: "migration:b23_document_permissions",
  /** Holding any of these earns `view_documents`. */
  grantsView: [
    UserPermission.MANAGE_DOCUMENTS,
    UserPermission.MANAGE_RESERVATIONS,
    UserPermission.VIEW_RESERVATIONS,
  ] as string[],
  /** Holding any of these earns `manage_documents`. */
  grantsManage: [
    UserPermission.MANAGE_DOCUMENTS,
    UserPermission.MANAGE_RESERVATIONS,
  ] as string[],
} as const;

/**
 * The permissions that have to be *added* to `current`. Pure, so the mapping
 * is testable without a database.
 */
export function documentPermissionsFor(current: readonly string[]): string[] {
  const held = new Set(current);
  const additions: string[] = [];
  if (
    !held.has(UserPermission.VIEW_DOCUMENTS) &&
    DOCUMENT_PERMISSION_MIGRATION.grantsView.some((p) => held.has(p))
  ) {
    additions.push(UserPermission.VIEW_DOCUMENTS);
  }
  if (
    !held.has(UserPermission.MANAGE_DOCUMENTS) &&
    DOCUMENT_PERMISSION_MIGRATION.grantsManage.some((p) => held.has(p))
  ) {
    additions.push(UserPermission.MANAGE_DOCUMENTS);
  }
  return additions;
}

export interface DocumentPermissionResult {
  dryRun: boolean;
  /** Accounts looked at (admins excluded — they already pass every gate). */
  considered: number;
  /** Accounts that would gain `view_documents`. */
  gainView: number;
  /** Accounts that would gain `manage_documents`. */
  gainManage: number;
  /** Accounts left exactly as they were. */
  unchanged: number;
  updated: number;
}

export async function migrateDocumentPermissions(
  options: { dryRun?: boolean } = {},
): Promise<DocumentPermissionResult> {
  const dryRun = options.dryRun ?? true;

  const rows = await db
    .select({ id: users.id, role: users.role, permissions: users.permissions })
    .from(users);

  const staff = rows.filter((r) => r.role !== "admin");
  let gainView = 0;
  let gainManage = 0;
  let updated = 0;
  const pending: Array<{ id: number; permissions: string[] }> = [];

  for (const row of staff) {
    const current = (row.permissions ?? []) as string[];
    const additions = documentPermissionsFor(current);
    if (additions.length === 0) continue;
    if (additions.includes(UserPermission.VIEW_DOCUMENTS)) gainView += 1;
    if (additions.includes(UserPermission.MANAGE_DOCUMENTS)) gainManage += 1;
    pending.push({ id: row.id, permissions: [...current, ...additions] });
  }

  if (!dryRun) {
    for (const change of pending) {
      await db.update(users).set({ permissions: change.permissions }).where(eq(users.id, change.id));
      updated += 1;
    }
    await db
      .insert(appSettings)
      .values({
        key: DOCUMENT_PERMISSION_MIGRATION.marker,
        value: { appliedAt: new Date().toISOString(), updated },
        category: "general",
        description: "B-23: view_documents/manage_documents mapped onto the existing accounts",
      })
      .onConflictDoNothing({ target: appSettings.key });
  }

  return {
    dryRun,
    considered: staff.length,
    gainView,
    gainManage,
    unchanged: staff.length - pending.length,
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
      "owner decision (remediation plan §1.2.3).",
    );
    process.exitCode = 2;
    return;
  }

  const result = await migrateDocumentPermissions({ dryRun: !apply });
  console.log(
    `[B-23] ${result.considered} non-admin account(s): ` +
    `${result.gainView} gain view_documents, ${result.gainManage} gain manage_documents, ` +
    `${result.unchanged} unchanged.` +
    (result.dryRun ? " Dry run — re-run with --apply to write." : ` Wrote ${result.updated}.`),
  );
  // Kept for the marker check when reporting on a clone.
  const [marker] = await db
    .select({ key: appSettings.key })
    .from(appSettings)
    .where(sql`${appSettings.key} = ${DOCUMENT_PERMISSION_MIGRATION.marker}`);
  console.log(`[B-23] marker ${DOCUMENT_PERMISSION_MIGRATION.marker}: ${marker ? "present" : "absent"}`);
}

if (process.argv[1] && /migrate-document-permissions\.(ts|js)$/.test(process.argv[1])) {
  main().then(
    () => process.exit(process.exitCode ?? 0),
    (err) => {
      console.error(err);
      process.exit(1);
    },
  );
}
