/**
 * BUG-143 and BUG-034 — counting what is still wrong in the data, without
 * changing any of it.
 *
 * The remediation plan (§1.2.3) forbids touching existing rows, and phase 36
 * left both of these as *cleanup* questions rather than code gaps:
 *
 *   BUG-143  the code path is closed — a reservation or maintenance block on a
 *            vehicle that does not exist is refused with 404 "Vehicle not
 *            found" — but 258 orphan rows are still in the table, all of type
 *            `maintenance_block`, and `reservations.vehicle_id` still has no
 *            foreign key. Whether those rows are deleted, re-pointed or left
 *            alone is the owner's call; how many there are is not.
 *   BUG-034  a maintenance block flips the vehicle to `needs_fixing` through
 *            the status synchronisation rather than immediately, and does not
 *            flip it back when the block is removed. The outcome is a set of
 *            vehicles whose `availability_status` disagrees with the blocks
 *            that are actually on them.
 *
 * This script only reads. It has no `--apply`, so it is safe against any
 * database including production, and it prints a number the owner can decide
 * on.
 *
 *   npx tsx scripts/data-hygiene-report.ts
 *   npx tsx scripts/data-hygiene-report.ts --json
 */
import { sql } from "drizzle-orm";
import { db } from "../server/db";

export interface DataHygieneReport {
  /** BUG-143: live reservations pointing at a vehicle id that does not exist. */
  orphanReservations: number;
  /** The same, split by `type`, because phase 36 found them all to be blocks. */
  orphanReservationsByType: Array<{ type: string; count: number }>;
  /** BUG-143: is there a foreign key on reservations.vehicle_id yet? */
  vehicleForeignKeyPresent: boolean;
  /** BUG-034: vehicles on `needs_fixing`/`in_service` with no live block on them. */
  blockedWithoutBlock: number;
  /** BUG-034: vehicles inside a live maintenance block that do not say so. */
  blockedButAvailable: number;
  /** B-21: rows the bulk close deliberately will not touch. */
  stillOutReservations: number;
  /** B-21: rows carrying a status nobody writes any more. */
  legacyStatusReservations: number;
}

export async function buildDataHygieneReport(): Promise<DataHygieneReport> {
  const one = async (query: any): Promise<number> =>
    Number(((await db.execute(query)).rows[0] as any).n);

  const orphanReservations = await one(sql`
    SELECT count(*)::int AS n
      FROM reservations r
     WHERE r.deleted_at IS NULL
       AND r.vehicle_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM vehicles v WHERE v.id = r.vehicle_id)
  `);

  const orphanByType = (
    await db.execute(sql`
      SELECT r.type, count(*)::int AS n
        FROM reservations r
       WHERE r.deleted_at IS NULL
         AND r.vehicle_id IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM vehicles v WHERE v.id = r.vehicle_id)
       GROUP BY r.type
       ORDER BY n DESC
    `)
  ).rows as Array<{ type: string; n: number }>;

  const vehicleForeignKeyPresent =
    (await one(sql`
      SELECT count(*)::int AS n
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON kcu.constraint_name = tc.constraint_name
       WHERE tc.table_name = 'reservations'
         AND tc.constraint_type = 'FOREIGN KEY'
         AND kcu.column_name = 'vehicle_id'
    `)) > 0;

  const blockedWithoutBlock = await one(sql`
    SELECT count(*)::int AS n
      FROM vehicles v
     WHERE v.availability_status IN ('needs_fixing', 'in_service')
       AND NOT EXISTS (
             SELECT 1 FROM reservations r
              WHERE r.vehicle_id = v.id
                AND r.deleted_at IS NULL
                AND r.type = 'maintenance_block'
                AND r.start_date <= to_char(now(), 'YYYY-MM-DD')
                AND (r.end_date IS NULL OR r.end_date >= to_char(now(), 'YYYY-MM-DD'))
           )
  `);

  const blockedButAvailable = await one(sql`
    SELECT count(*)::int AS n
      FROM vehicles v
     WHERE COALESCE(v.availability_status, '') NOT IN ('needs_fixing', 'in_service')
       AND EXISTS (
             SELECT 1 FROM reservations r
              WHERE r.vehicle_id = v.id
                AND r.deleted_at IS NULL
                AND r.type = 'maintenance_block'
                AND r.start_date <= to_char(now(), 'YYYY-MM-DD')
                AND (r.end_date IS NULL OR r.end_date >= to_char(now(), 'YYYY-MM-DD'))
           )
  `);

  const stillOutReservations = await one(sql`
    SELECT count(*)::int AS n
      FROM reservations
     WHERE deleted_at IS NULL
       AND status = 'picked_up'
       AND end_date IS NOT NULL
       AND end_date < to_char(now(), 'YYYY-MM-DD')
  `);

  const legacyStatusReservations = await one(sql`
    SELECT count(*)::int AS n
      FROM reservations
     WHERE deleted_at IS NULL
       AND status NOT IN ('booked', 'picked_up', 'returned', 'completed', 'cancelled')
  `);

  return {
    orphanReservations,
    orphanReservationsByType: orphanByType.map((r) => ({ type: r.type, count: Number(r.n) })),
    vehicleForeignKeyPresent,
    blockedWithoutBlock,
    blockedButAvailable,
    stillOutReservations,
    legacyStatusReservations,
  };
}

export function formatDataHygieneReport(report: DataHygieneReport): string[] {
  return [
    "Data hygiene — read-only, nothing was changed.",
    "",
    `BUG-143  orphan reservations (vehicle_id points at nothing): ${report.orphanReservations}`,
    ...report.orphanReservationsByType.map((r) => `           ${r.type}: ${r.count}`),
    `         foreign key on reservations.vehicle_id: ${report.vehicleForeignKeyPresent ? "present" : "ABSENT"}`,
    "",
    `BUG-034  vehicles in the workshop with no live maintenance block: ${report.blockedWithoutBlock}`,
    `         vehicles inside a live maintenance block that do not say so: ${report.blockedButAvailable}`,
    "",
    `B-21     reservations still on 'picked_up' past their end date: ${report.stillOutReservations}`,
    `         reservations carrying a legacy status: ${report.legacyStatusReservations}`,
    "",
    "What to do with any of these is an owner decision; this script does not write.",
  ];
}

async function main(): Promise<void> {
  const report = await buildDataHygieneReport();
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    for (const line of formatDataHygieneReport(report)) console.log(line);
  }
}

if (process.argv[1] && /data-hygiene-report\.(ts|js)$/.test(process.argv[1])) {
  main().then(
    () => process.exit(0),
    (err) => {
      console.error(err);
      process.exit(1);
    },
  );
}
