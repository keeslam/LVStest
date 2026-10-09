/**
 * Adds the ten E2E rights profiles (e2e/seed/users.ts) as login accounts to a
 * LOCAL database, so a manual browser audit can log in with known test
 * credentials without touching the owner's own accounts.
 *
 * Usage:
 *   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/lvstest DATABASE_SSL=false \
 *     npx tsx scripts/seed-audit-users.ts
 *
 * Refuses anything that is not a localhost database. Idempotent: accounts
 * that already exist are left alone. Passwords are the E2E test password
 * (e2e/support/env.ts), never printed.
 */
import { E2E } from "../e2e/support/env";
import { PROFILES, ROLES, roleLabel, usernameOf } from "../e2e/seed/users";

async function main() {
  const url = process.env.DATABASE_URL || "";
  if (!/@(localhost|127\.0\.0\.1)(:\d+)?\//.test(url)) {
    throw new Error("seed-audit-users only runs against a localhost database");
  }
  const { db } = await import("../server/db");
  const { users } = await import("../shared/schema");
  const { hashPassword } = await import("../server/auth");
  const { inArray } = await import("drizzle-orm");

  const wanted = ROLES.map((role) => usernameOf(role));
  const existing = await db.select({ username: users.username }).from(users).where(inArray(users.username, wanted));
  const present = new Set(existing.map((row) => row.username));
  const missing = ROLES.filter((role) => !present.has(usernameOf(role)));
  if (missing.length === 0) {
    console.log(`All ${ROLES.length} audit accounts already exist.`);
    return;
  }
  const password = await hashPassword(E2E.password);
  await db.insert(users).values(missing.map((role) => ({
    username: usernameOf(role),
    password,
    fullName: `E2E ${role}`,
    email: `${role}@e2e.invalid`,
    role: roleLabel[role],
    permissions: PROFILES[role],
    active: true,
  })));
  console.log(`Added ${missing.length} audit account(s): ${missing.map(usernameOf).join(", ")}`);
}

main().then(() => process.exit(0)).catch((error) => {
  console.error(error);
  process.exit(1);
});
