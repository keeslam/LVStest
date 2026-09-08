// scripts/export-schema.ts
//
// Exports every table/column defined in shared/schema.ts into
// schema-columns.json, a plain-JSON manifest that startup-migration.js
// reads at container boot (syncSchemaFromManifest) to additively create
// any table/column that exists in the Drizzle schema but not yet in the
// (production) database. Production never runs `drizzle-kit push` — this
// manifest is how new tables/columns added in dev actually reach it.
//
// Run with: npx tsx scripts/export-schema.ts
// Also run automatically as the first step of `npm run build`, so a
// deploy can never ship a stale manifest.
//
// scripts/export-schema.test.ts imports buildManifest() (this module's
// pure function) as a drift guard: it fails if the committed
// schema-columns.json doesn't match what this script would produce from
// the current shared/schema.ts, i.e. if someone edited the schema and
// forgot to re-run `npm run schema:export`.
import { writeFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { basename } from "path";
import { is, SQL } from "drizzle-orm";
import { PgTable, getTableConfig, PgDialect, type PgColumn } from "drizzle-orm/pg-core";
import * as schema from "../shared/schema";

const dialect = new PgDialect();

export interface ManifestColumn {
  name: string;
  type: string;
  notNull: boolean;
  primary: boolean;
  default: string | null;
}

export interface ManifestTable {
  name: string;
  columns: ManifestColumn[];
}

// Renders a column's Drizzle-level default value as literal SQL text
// suitable for a `DEFAULT <...>` clause, or null when the column has no
// default (or its "default" is really just the implicit serial sequence,
// which needs no DEFAULT clause of its own).
export function renderDefault(col: PgColumn): string | null {
  const value = (col as unknown as { default: unknown }).default;
  if (value === undefined || value === null) return null;

  if (is(value, SQL)) {
    // e.g. defaultNow() -> "now()"
    return dialect.sqlToQuery(value).sql;
  }

  if (typeof value === "string") {
    return `'${value.replace(/'/g, "''")}'`;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (Array.isArray(value) || (typeof value === "object" && value !== null)) {
    const sqlType = col.getSQLType();
    if (sqlType.endsWith("[]")) {
      // Postgres native array column (e.g. text[]) with an array default -
      // render as a Postgres array literal, not JSON, e.g.
      // ["not_for_rental"] -> '{"not_for_rental"}'
      const items = Array.isArray(value) ? value : [];
      const body = items
        .map((item) => `"${String(item).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`)
        .join(",");
      const inner = `{${body}}`;
      return `'${inner.replace(/'/g, "''")}'`;
    }
    // jsonb column with an object/array default
    return `'${JSON.stringify(value).replace(/'/g, "''")}'::jsonb`;
  }

  return null;
}

// Builds the manifest from the schema currently imported. Pure/sync so the
// drift-guard test can call it directly without touching the filesystem.
export function buildManifest(): ManifestTable[] {
  const tables: ManifestTable[] = [];

  for (const key of Object.keys(schema)) {
    const value = (schema as Record<string, unknown>)[key];
    if (!is(value, PgTable)) continue;

    const config = getTableConfig(value as PgTable);
    const columns: ManifestColumn[] = config.columns.map((col) => ({
      name: col.name,
      type: col.getSQLType(),
      notNull: col.notNull,
      primary: col.primary,
      default: renderDefault(col),
    }));

    tables.push({ name: config.name, columns });
  }

  tables.sort((a, b) => a.name.localeCompare(b.name));
  return tables;
}

function main() {
  const manifest = buildManifest();
  const json = JSON.stringify(manifest, null, 2) + "\n";
  const outPath = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
    "schema-columns.json",
  );
  writeFileSync(outPath, json, "utf8");

  const totalColumns = manifest.reduce((sum, t) => sum + t.columns.length, 0);
  console.log(`${manifest.length} tables, ${totalColumns} columns`);
}

// Only write the file when this module is run directly (`npx tsx
// scripts/export-schema.ts`), not when imported by the drift-guard test.
if (process.argv[1] && import.meta.url.endsWith(basename(process.argv[1]))) {
  main();
}
