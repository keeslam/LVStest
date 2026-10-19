/**
 * BUG-143 — maintenance blocks on a vehicle that no longer exists (258 on the lvs_prodtest clone run of
 * 19-10-2026). Kees decided: "Naar de prullenbak". Each one is soft-deleted the way the Onderhoud screen
 * deletes a block (storage.softDeleteReservation), so it lands in the Onderhoud bin with its row as it
 * was and can be put back from there; nothing is hard-deleted here.
 *
 * Same operational rule as scripts/close-returned-reservations.ts and normalize-license-plates.ts: a dry
 * run by default, writes only with --apply, and outside lvs_fixtest only with --i-know-what-i-am-doing.
 *
 *   npx tsx scripts/orphan-blocks-to-bin.ts            # count and list, nothing changes
 *   npx tsx scripts/orphan-blocks-to-bin.ts --apply    # move them to the bin (lvs_fixtest only)
 */
import { and, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { db } from "../server/db";
import { reservations, vehicles } from "../shared/schema";
import { storage } from "../server/storage";

/** The actor written on each bin row, so the audit says who did it and why. */
export const ORPHAN_ACTOR = "opschoning-BUG-143";

export async function findOrphanBlocks(): Promise<Array<{ id: number; vehicleId: number; startDate: string }>> {
  return db.select({ id: reservations.id, vehicleId: reservations.vehicleId, startDate: reservations.startDate })
    .from(reservations)
    .where(and(
      eq(reservations.type, "maintenance_block"),
      isNull(reservations.deletedAt),
      isNotNull(reservations.vehicleId),
      sql`not exists (select 1 from ${vehicles} v where v.id = ${reservations.vehicleId})`,
    ))
    .orderBy(reservations.id) as Promise<Array<{ id: number; vehicleId: number; startDate: string }>>;
}

export async function moveOrphanBlocksToBin(options: { dryRun?: boolean } = {}): Promise<{ found: number; moved: number; failed: Array<{ id: number; message: string }> }> {
  const orphans = await findOrphanBlocks();
  if (options.dryRun ?? true) return { found: orphans.length, moved: 0, failed: [] };
  let moved = 0;
  const failed: Array<{ id: number; message: string }> = [];
  for (const o of orphans) {
    try {
      if (await storage.softDeleteReservation(o.id, { username: ORPHAN_ACTOR, userId: null })) moved += 1;
    } catch (e: any) {
      failed.push({ id: o.id, message: e?.message ?? String(e) });
    }
  }
  return { found: orphans.length, moved, failed };
}

function isTestDatabase(): boolean {
  return /\/lvs_fixtest(\?|$)/.test(process.env.DATABASE_URL ?? "");
}

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");
  const forced = process.argv.includes("--i-know-what-i-am-doing");
  if (apply && !isTestDatabase() && !forced) {
    console.error("Refusing to write: DATABASE_URL does not point at lvs_fixtest. Run without --apply first and put the count to the owner.");
    process.exitCode = 2;
    return;
  }
  if (!apply) {
    const orphans = await findOrphanBlocks();
    console.log(`[BUG-143] ${orphans.length} maintenance block(s) on a vehicle that does not exist (dry run).`);
    const byVehicle = new Map<number, number>();
    for (const o of orphans) byVehicle.set(o.vehicleId, (byVehicle.get(o.vehicleId) ?? 0) + 1);
    console.log(`  on ${byVehicle.size} missing vehicle id(s); oldest start ${orphans.map((o) => o.startDate).sort()[0] ?? "-"}, newest ${orphans.map((o) => o.startDate).sort().at(-1) ?? "-"}`);
    console.log("Re-run with --apply to move them to the Onderhoud bin (they can be restored from there).");
    return;
  }
  const result = await moveOrphanBlocksToBin({ dryRun: false });
  console.log(`[BUG-143] moved ${result.moved} of ${result.found} orphan block(s) to the Onderhoud bin.`);
  for (const f of result.failed) console.error(`  FAILED #${f.id}: ${f.message}`);
  if (result.failed.length > 0) process.exitCode = 1;
}

if (process.argv[1] && /orphan-blocks-to-bin\.(ts|js)$/.test(process.argv[1])) {
  main().then(() => process.exit(process.exitCode ?? 0), (err) => { console.error(err); process.exit(1); });
}
