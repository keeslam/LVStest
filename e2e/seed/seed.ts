import { E2E } from "../support/env";
import { PROFILES, ROLES, roleLabel, usernameOf } from "./users";

/** Writes the fixed E2E content. DATABASE_URL must already point at lvs_e2e. */
export async function runSeed(): Promise<void> {
  if (!/\/lvs_e2e$/.test(process.env.DATABASE_URL || "")) throw new Error("runSeed only runs against lvs_e2e");
  // Imported late: these modules open the database pool from DATABASE_URL on import.
  const { db } = await import("../../server/db");
  const { users } = await import("../../shared/schema");
  const { hashPassword } = await import("../../server/auth");

  const password = await hashPassword(E2E.password);
  await db.insert(users).values(ROLES.map((role) => ({
    username: usernameOf(role),
    password,
    fullName: `E2E ${role}`,
    email: `${role}@e2e.invalid`,
    role: roleLabel[role],
    permissions: PROFILES[role],
    active: true,
  })));
}
