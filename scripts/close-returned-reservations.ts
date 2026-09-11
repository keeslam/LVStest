/**
 * besluiten.md **B-02** — "automatisch afsluiten bij inname", plus the one-off
 * bulk action for the rows that were written before that rule existed.
 *
 * `POST /api/reservations/:id/return` now writes `completed` directly, so no
 * new `returned` row is ever created. What is left is history: rentals that
 * went through the old return flow, stopped at `returned`, and are counted as
 * "the customer still has the car" by `getOverdueReservationsByVehicle` — which
 * is what makes a perfectly normal return block its vehicle four days later
 * (BUG-113). besluiten.md counts 788 such rows over 423 vehicles in the dev
 * clone; the real number has to be measured again before this is run anywhere
 * that matters.
 *
 * **Operational rule (remediation plan §1.2.3).** This script changes data. It
 * may be run against `lvs_fixtest` freely; running it against the development
 * clone, the audit databases or production is an owner decision and is not
 * covered by the phase-35 approval. It therefore refuses to run outside
 * `lvs_fixtest` unless `--i-know-what-i-am-doing` is passed, and defaults to a
 * dry run.
 *
 *   npx tsx scripts/close-returned-reservations.ts              # dry run, counts only
 *   npx tsx scripts/close-returned-reservations.ts --apply      # writes (lvs_fixtest only)
 *
 * What it does, and deliberately does not do:
 *   - `returned` → `completed`, and `completion_date` filled from
 *     `actual_return_date`/`end_date` when it is empty.
 *   - `end_date` is **never** touched (BUG-019: the old "mark as completed"
 *     button is exactly what corrupted it).
 *   - soft-deleted rows are left alone.
 */
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "../server/db";
import { reservations } from "../shared/schema";

export interface CloseReturnedOptions {
  /** Count only; nothing is written. Default `true` from the CLI. */
  dryRun?: boolean;
}

export interface CloseReturnedResult {
  candidates: number;
  closed: number;
  dryRun: boolean;
}

export async function closeReturnedReservations(
  options: CloseReturnedOptions = {},
): Promise<CloseReturnedResult> {
  const dryRun = options.dryRun ?? true;

  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(reservations)
    .where(and(eq(reservations.status, "returned"), isNull(reservations.deletedAt)));

  if (dryRun || n === 0) {
    return { candidates: n, closed: 0, dryRun };
  }

  const updated = await db
    .update(reservations)
    .set({
      status: "completed",
      // The real return day, never "today" — that is BUG-019's mistake.
      completionDate: sql`COALESCE(${reservations.completionDate}, ${reservations.actualReturnDate}, ${reservations.endDate})`,
      updatedAt: new Date(),
      updatedBy: "B-02 bulk close",
    })
    .where(and(eq(reservations.status, "returned"), isNull(reservations.deletedAt)))
    .returning({ id: reservations.id });

  return { candidates: n, closed: updated.length, dryRun: false };
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
      "owner decision (remediation plan §1.2.3). Re-measure the row count first.",
    );
    process.exitCode = 2;
    return;
  }

  const result = await closeReturnedReservations({ dryRun: !apply });
  if (result.dryRun) {
    console.log(`[B-02] ${result.candidates} live reservation(s) sit on 'returned'. Re-run with --apply to close them.`);
  } else {
    console.log(`[B-02] closed ${result.closed} of ${result.candidates} 'returned' reservation(s).`);
  }
}

// Only when executed directly, never on import (the regression test imports it).
if (process.argv[1] && /close-returned-reservations\.(ts|js)$/.test(process.argv[1])) {
  main().then(
    () => process.exit(process.exitCode ?? 0),
    (err) => {
      console.error(err);
      process.exit(1);
    },
  );
}
