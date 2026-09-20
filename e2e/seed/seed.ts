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

  const { vehicles, customers, reservations, expenses } = await import("../../shared/schema");
  const { SEED, officeDay } = await import("./data");
  const vehicleRows = await db.insert(vehicles).values(SEED.vehicles.map((v) => ({ ...v }))).returning({ id: vehicles.id });
  const customerRows = await db.insert(customers).values(SEED.customers.map((c) => ({ ...c }))).returning({ id: customers.id });
  await db.insert(reservations).values(SEED.reservations.map(({ label, vehicle, customer, ...rest }) => ({
    ...rest,
    vehicleId: vehicleRows[vehicle].id,
    customerId: customerRows[customer].id,
    notes: `e2e:${label}`,
    type: "standard",
  })));
  await db.insert(expenses).values([
    { vehicleId: vehicleRows[0].id, category: "maintenance", amount: "245.50", date: officeDay(-5), description: "E2E kleine beurt" },
    { vehicleId: vehicleRows[1].id, category: "tires", amount: "612.00", date: officeDay(-12), description: "E2E banden" },
  ]);
}
