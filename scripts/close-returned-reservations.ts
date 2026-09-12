/**
 * besluiten.md **B-02** — "automatisch afsluiten bij inname", plus the one-off
 * bulk action for the rows that were written before that rule existed, and
 * **B-21**, which says exactly which of those rows may be closed by a machine
 * and which may not.
 *
 * `POST /api/reservations/:id/return` now writes `completed` directly, so no
 * new `returned` row is ever created. What is left is history: 790 rows that
 * still claim a rental is running. B-21 splits them three ways, and so does
 * this script:
 *
 *   1. **`returned` → `completed`** (B-02). The old return flow stopped there,
 *      and `getOverdueReservationsByVehicle` counts it as "the customer still
 *      has the car" — which is what makes a perfectly normal return block its
 *      vehicle four days later (BUG-113).
 *   2. **`booked`, past its end date, never picked up → `cancelled`** (B-21).
 *      380 rows in the dev clone. Nobody ever came to fetch the car; the
 *      booking simply expired.
 *   3. **a legacy status (`active`, `scheduled`, `in`, `confirmed`, `pending`,
 *      `out`) past its end date → `completed`** (B-21). 38 rows, all of them
 *      maintenance blocks whose work is long over.
 *
 * And the one thing it must **not** do:
 *
 *   4. **`picked_up` is never closed automatically.** 363 rows. They claim the
 *      car is outside; a script cannot know whether it is. They go on the
 *      worklist (`GET /api/reservations/worklist/still-out`, screen
 *      "Nog buiten") for someone to walk through. This script only counts them.
 *
 * `end_date` is **never** touched in any group — BUG-019: the old "mark as
 * completed" button is exactly what corrupted it. Soft-deleted rows are left
 * alone.
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
 *   npx tsx scripts/close-returned-reservations.ts --date=2026-06-15   # fix the reference day
 */
import { and, eq, isNull, isNotNull, lt, ne, notInArray, sql } from "drizzle-orm";
import { db } from "../server/db";
import { reservations } from "../shared/schema";

/**
 * Every spelling a row may legitimately carry today. Anything else in the
 * column is history — see LEGACY_RESERVATION_STATUS_ALIASES in
 * server/services/lifecycle.ts, which is where those spellings are decoded.
 */
export const CANONICAL_RESERVATION_STATUSES = [
  "booked",
  "picked_up",
  "returned",
  "completed",
  "cancelled",
] as const;

export interface CloseReturnedOptions {
  /** Count only; nothing is written. Default `true` from the CLI. */
  dryRun?: boolean;
}

export interface CloseReturnedResult {
  candidates: number;
  closed: number;
  dryRun: boolean;
}

/**
 * B-02 only: `returned` → `completed`. Deliberately unchanged and deliberately
 * narrow — server/__tests__/fix-h-state-machine.test.ts pins that it "closes
 * them and nothing else".
 */
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

export interface CloseStaleOptions {
  /** Count only; nothing is written. Default `true`. */
  dryRun?: boolean;
  /**
   * The reference day, `YYYY-MM-DD`. A parameter rather than `new Date()`
   * inside the query, so the tests never depend on the day they run and so a
   * dry run can be reproduced later against the same cut-off.
   */
  today?: string;
}

export interface StaleGroupResult {
  candidates: number;
  closed: number;
}

export interface CloseStaleResult {
  dryRun: boolean;
  today: string;
  /** B-02: `returned` → `completed`. */
  returned: StaleGroupResult;
  /** B-21: `booked`, past its end date, never picked up → `cancelled`. */
  neverPickedUp: StaleGroupResult;
  /** B-21: a legacy status past its end date → `completed`. */
  legacyStatus: StaleGroupResult;
  /** B-21: `picked_up` rows past their end date. Counted, never written. */
  stillOutWorklist: number;
}

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

/** B-21 group 2: a booking whose car was never collected and whose period is over. */
function neverPickedUpWhere(today: string) {
  return and(
    isNull(reservations.deletedAt),
    eq(reservations.status, "booked"),
    // A maintenance block is not a booking somebody failed to collect; if one
    // is stuck it belongs to the legacy group, which closes it instead.
    ne(reservations.type, "maintenance_block"),
    isNotNull(reservations.endDate),
    lt(reservations.endDate, today),
    isNull(reservations.actualPickupDate),
  );
}

/** B-21 group 3: a status nobody writes any more, on a period that is over. */
function legacyStatusWhere(today: string) {
  return and(
    isNull(reservations.deletedAt),
    notInArray(reservations.status, [...CANONICAL_RESERVATION_STATUSES]),
    isNotNull(reservations.endDate),
    lt(reservations.endDate, today),
  );
}

/** B-21 group 4: the rows a human has to walk. Counted here, never written. */
function stillOutWhere(today: string) {
  return and(
    isNull(reservations.deletedAt),
    eq(reservations.status, "picked_up"),
    isNotNull(reservations.endDate),
    lt(reservations.endDate, today),
  );
}

async function countWhere(where: any): Promise<number> {
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(reservations).where(where);
  return n;
}

export async function closeStaleReservations(
  options: CloseStaleOptions = {},
): Promise<CloseStaleResult> {
  const dryRun = options.dryRun ?? true;
  const today = options.today ?? isoToday();

  const returned = await closeReturnedReservations({ dryRun });

  const neverPickedUpCandidates = await countWhere(neverPickedUpWhere(today));
  const legacyCandidates = await countWhere(legacyStatusWhere(today));
  const stillOut = await countWhere(stillOutWhere(today));

  let neverPickedUpClosed = 0;
  let legacyClosed = 0;

  if (!dryRun) {
    if (neverPickedUpCandidates > 0) {
      const rows = await db
        .update(reservations)
        .set({
          status: "cancelled",
          updatedAt: new Date(),
          updatedBy: "B-21 bulk close (nooit opgehaald)",
        })
        .where(neverPickedUpWhere(today))
        .returning({ id: reservations.id });
      neverPickedUpClosed = rows.length;
    }
    if (legacyCandidates > 0) {
      const rows = await db
        .update(reservations)
        .set({
          status: "completed",
          completionDate: sql`COALESCE(${reservations.completionDate}, ${reservations.actualReturnDate}, ${reservations.endDate})`,
          updatedAt: new Date(),
          updatedBy: "B-21 bulk close (verouderde status)",
        })
        .where(legacyStatusWhere(today))
        .returning({ id: reservations.id });
      legacyClosed = rows.length;
    }
  }

  return {
    dryRun,
    today,
    returned: { candidates: returned.candidates, closed: returned.closed },
    neverPickedUp: { candidates: neverPickedUpCandidates, closed: neverPickedUpClosed },
    legacyStatus: { candidates: legacyCandidates, closed: legacyClosed },
    stillOutWorklist: stillOut,
  };
}

/** `true` only for the dedicated remediation test database. */
function isTestDatabase(): boolean {
  return /\/lvs_fixtest(\?|$)/.test(process.env.DATABASE_URL ?? "");
}

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");
  const forced = process.argv.includes("--i-know-what-i-am-doing");
  const dateArg = process.argv.find((a) => a.startsWith("--date="))?.slice("--date=".length);

  if (dateArg !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(dateArg)) {
    console.error("--date must be YYYY-MM-DD");
    process.exitCode = 2;
    return;
  }

  if (apply && !isTestDatabase() && !forced) {
    console.error(
      "Refusing to write: DATABASE_URL does not point at lvs_fixtest.\n" +
      "Running this against the development clone, an audit database or production is an\n" +
      "owner decision (remediation plan §1.2.3). Re-measure the row counts first.",
    );
    process.exitCode = 2;
    return;
  }

  const result = await closeStaleReservations({ dryRun: !apply, today: dateArg });
  const verb = result.dryRun ? "would close" : "closed";
  console.log(`[B-02/B-21] reference day ${result.today}${result.dryRun ? " (dry run)" : ""}`);
  console.log(`  returned -> completed        : ${result.returned.candidates} candidate(s), ${verb} ${result.dryRun ? result.returned.candidates : result.returned.closed}`);
  console.log(`  booked, nooit opgehaald      : ${result.neverPickedUp.candidates} candidate(s) -> cancelled, ${verb} ${result.dryRun ? result.neverPickedUp.candidates : result.neverPickedUp.closed}`);
  console.log(`  verouderde status            : ${result.legacyStatus.candidates} candidate(s) -> completed, ${verb} ${result.dryRun ? result.legacyStatus.candidates : result.legacyStatus.closed}`);
  console.log(`  picked_up (NIET automatisch) : ${result.stillOutWorklist} row(s) on the worklist "Nog buiten"`);
  if (result.dryRun) {
    console.log("Re-run with --apply to write.");
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
