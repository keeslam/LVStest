/**
 * besluiten.md **B-10** — "Kentekens normaliseren: ja, bestaande gegevens
 * normaliseren plus een harde uniciteitsregel in de database." (BUG-020)
 *
 * The order the owner set, and the order this script runs in:
 *
 *   1. **measure** which vehicles collide once their plate is normalised —
 *      "AU-001-X", "au001x" and "AU 001 X" are one physical car with three rows,
 *      each with its own mileage, damage history and reservations;
 *   2. if there is a single collision: **stop and report the list**. Merging two
 *      vehicle records is a business decision nobody has taken, and this script
 *      will not make it by picking a winner;
 *   3. only when there are none: normalise the stored plates and add the unique
 *      index on the normalised form, so Postgres catches the race the
 *      application check (routes.ts, `findVehicleByNormalisedPlate`) cannot.
 *
 * **Operational rule (remediation plan §1.2.3).** This script changes data and
 * adds an index. It may be run against `lvs_fixtest` freely; running it against
 * the development clone, the audit databases or production is an owner decision
 * and is not covered by the phase-35 approval. It therefore refuses to write
 * outside `lvs_fixtest` unless `--i-know-what-i-am-doing` is passed, and
 * defaults to a dry run — exactly like `scripts/close-returned-reservations.ts`.
 *
 *   npx tsx scripts/normalize-license-plates.ts           # measure only
 *   npx tsx scripts/normalize-license-plates.ts --apply    # writes (lvs_fixtest only)
 *
 * What it deliberately does not do: delete, merge or rename a vehicle, touch a
 * reservation, or force the index past a collision.
 */
import { sql } from "drizzle-orm";
import { db } from "../server/db";
import { normaliseLicensePlate } from "../shared/schema";

/** The index name, so a second run is a no-op rather than an error. */
export const PLATE_UNIQUE_INDEX = "vehicles_license_plate_normalised_uniq";

/** The normalisation, in SQL, identical to `normaliseLicensePlate` in shared/schema.ts. */
const NORMALISED_PLATE = sql`regexp_replace(upper(license_plate), '[^A-Z0-9]', '', 'g')`;

export interface PlateCollision {
  normalised: string;
  vehicles: Array<{ id: number; licensePlate: string; brand: string | null; model: string | null }>;
}

export interface NormalizePlatesResult {
  /** Rows whose stored plate is not already in normalised form. */
  candidates: number;
  /** Groups of two or more vehicles that become the same plate. */
  collisions: PlateCollision[];
  /** Rows actually rewritten (0 on a dry run or when there are collisions). */
  normalised: number;
  /** True when the unique index exists after this run. */
  indexCreated: boolean;
  dryRun: boolean;
}

/** Every group of vehicles that share a plate once punctuation and case are gone. */
export async function findPlateCollisions(): Promise<PlateCollision[]> {
  const result: any = await db.execute(sql`
    SELECT ${NORMALISED_PLATE} AS normalised,
           json_agg(json_build_object(
             'id', id, 'licensePlate', license_plate, 'brand', brand, 'model', model
           ) ORDER BY id) AS vehicles
    FROM vehicles
    WHERE license_plate IS NOT NULL AND license_plate <> ''
    GROUP BY ${NORMALISED_PLATE}
    HAVING count(*) > 1
    ORDER BY 1
  `);
  const rows = (result.rows ?? result) as Array<{ normalised: string; vehicles: PlateCollision["vehicles"] }>;
  return rows.map((row) => ({ normalised: row.normalised, vehicles: row.vehicles }));
}

export interface NormalizePlatesOptions {
  /** Count and report only; nothing is written. Default `true` from the CLI. */
  dryRun?: boolean;
}

export async function normalizeLicensePlates(
  options: NormalizePlatesOptions = {},
): Promise<NormalizePlatesResult> {
  const dryRun = options.dryRun ?? true;

  const countResult: any = await db.execute(sql`
    SELECT count(*)::int AS n
    FROM vehicles
    WHERE license_plate IS NOT NULL
      AND license_plate <> ''
      AND license_plate <> ${NORMALISED_PLATE}
  `);
  const candidates = Number(((countResult.rows ?? countResult)[0] ?? {}).n ?? 0);

  const collisions = await findPlateCollisions();

  // Step 2 of the owner's order: a collision stops everything. Normalising one
  // of the two rows would make the second one impossible to save, and the
  // unique index would refuse to build anyway.
  if (dryRun || collisions.length > 0) {
    return { candidates, collisions, normalised: 0, indexCreated: false, dryRun };
  }

  const updated: any = await db.execute(sql`
    UPDATE vehicles
    SET license_plate = ${NORMALISED_PLATE}
    WHERE license_plate IS NOT NULL
      AND license_plate <> ''
      AND license_plate <> ${NORMALISED_PLATE}
    RETURNING id
  `);
  const normalised = ((updated.rows ?? updated) as unknown[]).length;

  // The hard rule, so a race between two requests cannot create the duplicate
  // the application check is there to prevent (BUG-020). Functional, unique and
  // additive: it adds no column and changes no type.
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS ${sql.raw(PLATE_UNIQUE_INDEX)}
    ON vehicles (${NORMALISED_PLATE})
  `);

  return { candidates, collisions, normalised, indexCreated: true, dryRun: false };
}

/** `true` only for the dedicated remediation test database. */
function isTestDatabase(): boolean {
  return /\/lvs_fixtest(\?|$)/.test(process.env.DATABASE_URL ?? "");
}

function reportCollisions(collisions: PlateCollision[]): void {
  console.error(
    `[B-10] STOP — ${collisions.length} kenteken(s) vallen na normalisatie samen.\n` +
    "Samenvoegen van twee voertuigrijen is een besluit van de eigenaar; dit script kiest geen winnaar.\n",
  );
  for (const collision of collisions) {
    console.error(`  ${collision.normalised}:`);
    for (const vehicle of collision.vehicles) {
      console.error(`    #${vehicle.id}  "${vehicle.licensePlate}"  ${vehicle.brand ?? ""} ${vehicle.model ?? ""}`.trimEnd());
    }
  }
}

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");
  const forced = process.argv.includes("--i-know-what-i-am-doing");

  if (apply && !isTestDatabase() && !forced) {
    console.error(
      "Refusing to write: DATABASE_URL does not point at lvs_fixtest.\n" +
      "Running this against the development clone, an audit database or production is an\n" +
      "owner decision (remediation plan §1.2.3). Measure the collisions there first with a\n" +
      "dry run, and hand the list to the owner (besluiten.md B-10).",
    );
    process.exitCode = 2;
    return;
  }

  const result = await normalizeLicensePlates({ dryRun: !apply });

  if (result.collisions.length > 0) {
    reportCollisions(result.collisions);
    process.exitCode = 3;
    return;
  }

  if (result.dryRun) {
    console.log(
      `[B-10] geen botsingen. ${result.candidates} voertuig(en) staan niet in genormaliseerde vorm.\n` +
      "Draai opnieuw met --apply om ze op te schonen en de unieke index te plaatsen.",
    );
    return;
  }

  console.log(
    `[B-10] ${result.normalised} kenteken(s) genormaliseerd; unieke index ${PLATE_UNIQUE_INDEX} staat.`,
  );
}

// Only when executed directly, never on import (the regression test imports it).
if (process.argv[1] && /normalize-license-plates\.(ts|js)$/.test(process.argv[1])) {
  main().then(
    () => process.exit(process.exitCode ?? 0),
    (err) => {
      console.error(err);
      process.exit(1);
    },
  );
}

// Re-exported so a caller can normalise one value with the same rule the script
// applies to the whole table.
export { normaliseLicensePlate };
