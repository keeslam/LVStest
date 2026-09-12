/**
 * besluiten.md **B-22** (BUG-224) — "migreren naar tijdzone-bewuste kolommen,
 * met de aanname dat bestaande waarden Amsterdamse tijd zijn".
 *
 * **The mechanism.** All 101 timestamp columns were `timestamp without time
 * zone`. Nearly all of them are filled by the column default `now()`, which
 * Postgres evaluates in the *session's* time zone — Europe/Amsterdam for this
 * office — so 21:18:26 Dutch time went into the column as the bare wall clock
 * `21:18:26`. Drizzle reads a tz-less column back with
 * `new Date(value + "+0000")`, i.e. it calls that wall clock UTC, the API
 * answers `…T21:18:26Z`, and the screen renders it in Amsterdam as 23:18:26.
 * That is the +120 minutes in BUG-224, and it is the same two hours on every
 * document, every audit line and every notification.
 *
 * **What this does.** For every column that `schema-columns.json` declares as
 * `timestamp with time zone` and that the database still has as `timestamp
 * without time zone`:
 *
 *     ALTER TABLE t ALTER COLUMN c TYPE timestamptz
 *       USING c AT TIME ZONE 'Europe/Amsterdam';
 *
 * `AT TIME ZONE` on a tz-less value means "read this wall clock as Amsterdam
 * time", which is exactly the assumption B-22 records. Column defaults of
 * `now()` need no change: `now()` is already a `timestamptz` and Postgres
 * stops down-casting it the moment the column can hold one.
 *
 * **What it deliberately does not do.** It does not run itself. B-22 says
 * "Migratie eerst op een kloon draaien en de uitkomst voorleggen voordat
 * productie aan de beurt is", so a deploy only *reports* what is still
 * pending; the conversion happens when someone sets
 * `TIMESTAMPTZ_MIGRATION=apply` (startup-migration.js) or runs this script
 * with `--apply`.
 *
 * **Two honest caveats, for the report to the owner.**
 *
 * 1. *The Amsterdam assumption is not true of every single row.* Drizzle
 *    serialises a JavaScript `Date` with `toISOString()`, so the rows that the
 *    application wrote **explicitly** (`updatedAt: new Date()` and friends)
 *    went into the tz-less column as **UTC** wall clock, while every row
 *    filled by the column default went in as **Amsterdam** wall clock. The
 *    conversion moves both by the same one or two hours, so the
 *    default-written rows (the overwhelming majority, and the ones BUG-224 is
 *    about) become correct and the explicitly-written ones move an hour or two
 *    into the future. There is no column that records which is which, so no
 *    migration can separate them. `--report` prints how far apart
 *    `created_at` and `updated_at` sit on rows that were never edited, which
 *    is the cheapest available estimate of how many rows are in the second
 *    group.
 * 2. *The type change rewrites the table.* `ALTER COLUMN … TYPE` takes an
 *    ACCESS EXCLUSIVE lock and rewrites every row. `--report` prints the size
 *    of each table so the owner can see what that costs.
 *
 *   npx tsx scripts/migrate-timestamps-to-timestamptz.ts            # dry run
 *   npx tsx scripts/migrate-timestamps-to-timestamptz.ts --report   # dry run + the clone report
 *   npx tsx scripts/migrate-timestamps-to-timestamptz.ts --apply    # writes (lvs_fixtest only)
 */
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { sql } from "drizzle-orm";
import { db } from "../server/db";

/** The assumption B-22 records, in one place. */
export const ASSUMED_ZONE = "Europe/Amsterdam";

const here = path.dirname(fileURLToPath(import.meta.url));
const MANIFEST = path.resolve(here, "..", "schema-columns.json");

export interface PendingColumn {
  table: string;
  column: string;
}

export interface TimestamptzPlan {
  /** Columns the manifest wants as timestamptz that the database still has without one. */
  pending: PendingColumn[];
  /** Columns already converted. */
  alreadyDone: number;
  /** Columns the manifest declares that this database does not have at all. */
  missing: PendingColumn[];
}

interface ManifestTable {
  name: string;
  columns: Array<{ name: string; type: string }>;
}

function manifestTimestamptzColumns(): PendingColumn[] {
  const manifest = JSON.parse(readFileSync(MANIFEST, "utf8")) as ManifestTable[];
  const wanted: PendingColumn[] = [];
  for (const table of manifest) {
    for (const column of table.columns) {
      if (/^timestamp\b.*with time zone/i.test(column.type)) {
        wanted.push({ table: table.name, column: column.name });
      }
    }
  }
  return wanted;
}

export async function planTimestamptzMigration(): Promise<TimestamptzPlan> {
  const wanted = manifestTimestamptzColumns();

  const rows = (
    await db.execute(sql`
      SELECT table_name, column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'public' AND data_type LIKE 'timestamp%'
    `)
  ).rows as Array<{ table_name: string; column_name: string; data_type: string }>;

  const actual = new Map(rows.map((r) => [`${r.table_name}.${r.column_name}`, r.data_type]));

  const pending: PendingColumn[] = [];
  const missing: PendingColumn[] = [];
  let alreadyDone = 0;

  for (const col of wanted) {
    const type = actual.get(`${col.table}.${col.column}`);
    if (type === undefined) {
      missing.push(col);
    } else if (type === "timestamp without time zone") {
      pending.push(col);
    } else {
      alreadyDone += 1;
    }
  }

  return { pending, alreadyDone, missing };
}

export interface TimestamptzResult extends TimestamptzPlan {
  dryRun: boolean;
  converted: number;
  failures: Array<{ table: string; column: string; message: string }>;
}

export async function migrateTimestampsToTimestamptz(
  options: { dryRun?: boolean } = {},
): Promise<TimestamptzResult> {
  const dryRun = options.dryRun ?? true;
  const plan = await planTimestamptzMigration();

  if (dryRun) {
    return { ...plan, dryRun, converted: 0, failures: [] };
  }

  let converted = 0;
  const failures: TimestamptzResult["failures"] = [];
  for (const col of plan.pending) {
    try {
      await db.execute(
        sql.raw(
          `ALTER TABLE "${col.table}" ALTER COLUMN "${col.column}" ` +
          `TYPE timestamptz USING "${col.column}" AT TIME ZONE '${ASSUMED_ZONE}'`,
        ),
      );
      converted += 1;
    } catch (error: any) {
      failures.push({ table: col.table, column: col.column, message: error?.message ?? String(error) });
    }
  }

  return { ...plan, dryRun: false, converted, failures };
}

/**
 * What a production-shaped clone would go through: the tables that get
 * rewritten, how big they are, and how many rows carry the "written by the
 * application, so already UTC" signature described in caveat 1.
 */
export async function timestamptzCloneReport(): Promise<string[]> {
  const plan = await planTimestamptzMigration();
  const lines: string[] = [];

  const byTable = new Map<string, string[]>();
  for (const col of plan.pending) {
    byTable.set(col.table, [...(byTable.get(col.table) ?? []), col.column]);
  }

  lines.push(`Assumed zone for existing values: ${ASSUMED_ZONE}`);
  lines.push(`Columns to convert: ${plan.pending.length} across ${byTable.size} table(s)`);
  lines.push(`Columns already timestamptz: ${plan.alreadyDone}`);
  if (plan.missing.length > 0) {
    lines.push(`Columns in the manifest but absent here: ${plan.missing.length}`);
  }
  lines.push("");
  lines.push("Per table — rows, on-disk size, columns rewritten:");

  for (const [table, columns] of [...byTable.entries()].sort()) {
    let rowCount = "?";
    let size = "?";
    try {
      const r = (await db.execute(sql.raw(`SELECT count(*)::bigint AS n FROM "${table}"`))).rows as any[];
      rowCount = String(r[0].n);
      const s = (await db.execute(sql.raw(`SELECT pg_size_pretty(pg_total_relation_size('"${table}"')) AS s`)))
        .rows as any[];
      size = String(s[0].s);
    } catch {
      /* a table the manifest knows and this database does not */
    }
    lines.push(`  ${table.padEnd(34)} ${rowCount.padStart(8)} rows  ${size.padStart(9)}  ${columns.join(", ")}`);
  }

  lines.push("");
  lines.push("Caveat 1 — rows the application wrote itself are already UTC and will move:");
  for (const table of ["documents", "audit_logs", "custom_notifications", "reservations", "vehicles"]) {
    const cols = byTable.get(table);
    if (!cols) continue;
    const stamp = cols.includes("created_at") ? "created_at" : cols[0];
    if (!cols.includes("updated_at") || stamp === "updated_at") {
      lines.push(`  ${table.padEnd(24)} (no created_at/updated_at pair to compare)`);
      continue;
    }
    try {
      const r = (
        await db.execute(
          sql.raw(
            `SELECT count(*)::bigint AS total,
                    count(*) FILTER (WHERE abs(extract(epoch FROM (updated_at - created_at))) > 3000)::bigint AS skewed
             FROM "${table}"`,
          ),
        )
      ).rows as any[];
      lines.push(
        `  ${table.padEnd(24)} ${String(r[0].total).padStart(8)} rows, ` +
        `${String(r[0].skewed).padStart(8)} with created_at/updated_at more than 50 minutes apart`,
      );
    } catch (error: any) {
      lines.push(`  ${table.padEnd(24)} (could not measure: ${error?.message ?? error})`);
    }
  }

  lines.push("");
  lines.push("Caveat 2 — every ALTER above takes ACCESS EXCLUSIVE and rewrites the table.");
  lines.push("Run it in a maintenance window, on a clone first (B-22).");

  return lines;
}

/** `true` only for the dedicated remediation test database. */
function isTestDatabase(): boolean {
  return /\/lvs_fixtest(\?|$)/.test(process.env.DATABASE_URL ?? "");
}

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");
  const report = process.argv.includes("--report");
  const forced = process.argv.includes("--i-know-what-i-am-doing");

  if (apply && !isTestDatabase() && !forced) {
    console.error(
      "Refusing to write: DATABASE_URL does not point at lvs_fixtest.\n" +
      "B-22 says the migration runs on a clone first and the outcome is put to the owner\n" +
      "before production is touched (remediation plan §1.2.3).",
    );
    process.exitCode = 2;
    return;
  }

  if (report) {
    for (const line of await timestamptzCloneReport()) console.log(line);
    console.log("");
  }

  const result = await migrateTimestampsToTimestamptz({ dryRun: !apply });
  if (result.dryRun) {
    console.log(
      `[B-22] ${result.pending.length} column(s) still 'timestamp without time zone', ` +
      `${result.alreadyDone} already converted. Dry run — re-run with --apply to convert.`,
    );
  } else {
    console.log(
      `[B-22] converted ${result.converted} of ${result.pending.length} column(s) to timestamptz ` +
      `(existing values read as ${ASSUMED_ZONE}).`,
    );
    for (const failure of result.failures) {
      console.error(`  FAILED ${failure.table}.${failure.column}: ${failure.message}`);
    }
    if (result.failures.length > 0) process.exitCode = 1;
  }
}

if (process.argv[1] && /migrate-timestamps-to-timestamptz\.(ts|js)$/.test(process.argv[1])) {
  main().then(
    () => process.exit(process.exitCode ?? 0),
    (err) => {
      console.error(err);
      process.exit(1);
    },
  );
}
