/**
 * Audit A-3-5 — which vehicles would get another type if the RDW mapping were applied again.
 *
 * Before the fix a 9-seat passenger van (VW Transporter, Fiat Ducato, Peugeot Boxer, Ford
 * Transit/Tourneo ...) was stored as "SUV". The mapping in server/utils/rdw-api.ts is fixed, but
 * vehicles that are already in the database keep their old type until someone decides to change
 * them. This script is that decision's preparation: it READS the vehicles, asks the RDW for each
 * registration (read-only open data) and prints a table of the vehicles whose type would change.
 * It never writes: there is no --apply. Changing the rows is a separate, owner-approved step.
 *
 * Usage:
 *   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/lvstest DATABASE_SSL=false \
 *     npx tsx scripts/remap-vehicle-types.ts
 *
 * Refuses anything that is not a localhost database (like scripts/seed-audit-users.ts).
 */
import { pathToFileURL } from "url";
import { vehicleTypeFromRdwRow } from "../server/utils/rdw-api";

export function isLocalDatabaseUrl(url: string): boolean {
  return /@(localhost|127\.0\.0\.1|\[::1\])(:\d+)?\//.test(url);
}

export interface VehicleRow {
  id: number;
  licensePlate: string;
  brand: string | null;
  model: string | null;
  vehicleType: string | null;
}

export interface RemapChange extends VehicleRow {
  newType: string;
}

/** Pure part: the vehicles whose stored type differs from what the RDW row maps to today. */
export function planRemap(rows: Array<{ vehicle: VehicleRow; rdw: Record<string, unknown> | null }>): RemapChange[] {
  const changes: RemapChange[] = [];
  for (const { vehicle, rdw } of rows) {
    if (!rdw) continue; // not at the RDW: nothing to compare with, keep the stored type
    const newType = vehicleTypeFromRdwRow(rdw);
    if (newType && newType !== vehicle.vehicleType) changes.push({ ...vehicle, newType });
  }
  return changes;
}

const RDW_BASE_URL = (process.env.RDW_BASE_URL || "https://opendata.rdw.nl").replace(/\/+$/, "");
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchRegistration(plate: string): Promise<Record<string, unknown> | null> {
  const normalized = plate.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  const response = await fetch(`${RDW_BASE_URL}/resource/m9d7-ebf2.json?kenteken=${normalized}`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(15000), // one stuck lookup must not hang the whole dry run
  });
  if (!response.ok) throw new Error(`RDW ${response.status}`);
  const data = await response.json();
  return Array.isArray(data) && data.length > 0 ? (data[0] as Record<string, unknown>) : null;
}

async function main() {
  const url = process.env.DATABASE_URL || "";
  if (!isLocalDatabaseUrl(url)) {
    throw new Error("remap-vehicle-types only runs against a localhost database");
  }
  const dbName = url.split("/").pop()?.split("?")[0];
  console.log(`Database: ${dbName} (read-only, nothing is written)`);
  const { db, pool } = await import("../server/db");
  const { vehicles } = await import("../shared/schema");
  const list = await db
    .select({
      id: vehicles.id,
      licensePlate: vehicles.licensePlate,
      brand: vehicles.brand,
      model: vehicles.model,
      vehicleType: vehicles.vehicleType,
    })
    .from(vehicles)
    .orderBy(vehicles.id);

  const rows: Array<{ vehicle: VehicleRow; rdw: Record<string, unknown> | null }> = [];
  const failed: string[] = [];
  for (const vehicle of list) {
    try {
      rows.push({ vehicle, rdw: await fetchRegistration(vehicle.licensePlate) });
    } catch (error) {
      failed.push(`${vehicle.licensePlate} (${(error as Error).message})`);
    }
    await sleep(150); // be kind to the open-data service
  }

  const changes = planRemap(rows);
  console.log(`${list.length} vehicles checked, ${rows.filter((r) => !r.rdw).length} not at the RDW, ${failed.length} lookups failed.`);
  console.log(`${changes.length} vehicle(s) would change type:`);
  for (const c of changes) {
    console.log(`  #${c.id}  ${c.licensePlate.padEnd(9)} ${String(c.brand ?? "").padEnd(14)} ${String(c.model ?? "").padEnd(22)} ${String(c.vehicleType ?? "-").padEnd(10)} -> ${c.newType}`);
  }
  const byChange = new Map<string, number>();
  for (const c of changes) byChange.set(`${c.vehicleType ?? "-"} -> ${c.newType}`, (byChange.get(`${c.vehicleType ?? "-"} -> ${c.newType}`) ?? 0) + 1);
  for (const [label, n] of byChange) console.log(`  ${label}: ${n}`);
  if (failed.length) console.log(`Lookups that failed (kept as is): ${failed.join(", ")}`);
  await pool.end();
}

// Only run when started directly, so the tests can import planRemap.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then(() => process.exit(0)).catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
