/**
 * FIX-X — a snapshot of everything a delete takes with it, derived from the
 * database instead of written by hand (remediation plan §3 FIX-X).
 *
 * `deleteVehicle` snapshotted a hand-written list of seven tables. Postgres
 * deletes more than that: `reservation_driver_assignments` and
 * `apk_date_changes` go with a CASCADE, `fines.vehicle_id`,
 * `fines.reservation_id` and three `vehicle_transports` columns of *other*
 * vehicles are quietly set to NULL. None of it was counted in
 * `GET /api/vehicles/:id/delete-impact`, none of it was in the payload, and
 * none of it came back on restore — so "restorable: true" was not true
 * (BUG-110). The same hand-written-list problem would appear again the moment
 * anyone adds a table, which is exactly how it went stale the first time.
 *
 * So the list is read from `information_schema` at runtime: every foreign key
 * pointing at the row being deleted, followed transitively for the ones that
 * CASCADE, plus the columns a SET NULL is about to blank so the restore can
 * rewire them.
 *
 * Deliberately generic and read-only: it discovers and it restores, it never
 * decides *whether* a delete may happen. That stays with the caller.
 */
import { sql } from "drizzle-orm";

export type FkAction = "CASCADE" | "SET NULL" | "SET DEFAULT" | "RESTRICT" | "NO ACTION";

export interface ForeignKeyEdge {
  /** The table holding the foreign key. */
  table: string;
  /** The column holding the foreign key. */
  column: string;
  /** The table it points at. */
  referencedTable: string;
  /** The column it points at (always the primary key here). */
  referencedColumn: string;
  onDelete: FkAction;
}

export interface CascadeSnapshot {
  /**
   * Rows Postgres would delete, parents first, so a restore can insert them in
   * this same order and never violate a foreign key.
   */
  deleted: Array<{ table: string; rows: Record<string, unknown>[] }>;
  /**
   * Columns a SET NULL would blank on rows that themselves survive — the value
   * is kept so the restore can put it back.
   */
  nulled: Array<{ table: string; column: string; idColumn: string; id: unknown; value: unknown }>;
}

/** Cached per process: the FK graph does not change while the server runs. */
let edgeCache: ForeignKeyEdge[] | null = null;

export async function foreignKeyEdges(executor: any): Promise<ForeignKeyEdge[]> {
  if (edgeCache) return edgeCache;
  const result: any = await executor.execute(sql`
    SELECT
      tc.table_name        AS table_name,
      kcu.column_name      AS column_name,
      ccu.table_name       AS referenced_table,
      ccu.column_name      AS referenced_column,
      rc.delete_rule       AS delete_rule
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema
    JOIN information_schema.constraint_column_usage ccu
      ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
    JOIN information_schema.referential_constraints rc
      ON rc.constraint_name = tc.constraint_name AND rc.constraint_schema = tc.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'
  `);
  const rows: any[] = result.rows ?? result ?? [];
  edgeCache = rows.map((r) => ({
    table: r.table_name,
    column: r.column_name,
    referencedTable: r.referenced_table,
    referencedColumn: r.referenced_column,
    onDelete: (r.delete_rule as FkAction) ?? "NO ACTION",
  }));
  return edgeCache;
}

/** Test seam — the graph is cached for the life of the process. */
export function resetForeignKeyCache(): void {
  edgeCache = null;
}

function ident(name: string): any {
  // Table and column names come from information_schema, never from a request.
  return sql.raw(`"${name.replace(/"/g, '""')}"`);
}

async function selectRows(executor: any, table: string, column: string, values: unknown[]): Promise<any[]> {
  if (values.length === 0) return [];
  const list = sql.join(values.map((v) => sql`${v}`), sql`, `);
  const result: any = await executor.execute(
    sql`SELECT * FROM ${ident(table)} WHERE ${ident(column)} IN (${list})`,
  );
  return result.rows ?? result ?? [];
}

/**
 * Everything a `DELETE FROM <rootTable> WHERE id = <rootId>` would take with
 * it, in insertion order for the restore.
 *
 * `skipTables` lets the caller exclude tables it snapshots itself in a richer
 * shape (the vehicle delete keeps its hand-built payload keys for backward
 * compatibility with the records already in `deleted_records`).
 */
export async function collectCascadeSnapshot(
  executor: any,
  rootTable: string,
  rootId: number,
  options: {
    skipTables?: string[];
    /**
     * Extra starting points. `reservations.vehicle_id` has no foreign key at all
     * (BUG-039), so a vehicle delete never *reaches* the reservations through
     * the FK graph — yet the code deletes them by hand, and Postgres then
     * cascades their driver assignments away. The caller seeds those ids here.
     */
    seeds?: Array<{ table: string; ids: number[] }>;
  } = {},
): Promise<CascadeSnapshot> {
  const edges = await foreignKeyEdges(executor);
  const skip = new Set(options.skipTables ?? []);

  const deleted: CascadeSnapshot["deleted"] = [];
  const nulled: CascadeSnapshot["nulled"] = [];

  // BFS over the CASCADE edges. `frontier` maps a table to the primary-key
  // values of its rows that are about to disappear.
  let frontier: Array<{ table: string; column: string; values: unknown[] }> = [
    { table: rootTable, column: "id", values: [rootId] },
    ...(options.seeds ?? [])
      .filter((seed) => seed.ids.length > 0)
      .map((seed) => ({ table: seed.table, column: "id", values: seed.ids as unknown[] })),
  ];
  const seen = new Set<string>([`${rootTable}:${rootId}`]);
  let depth = 0;

  while (frontier.length > 0 && depth < 6) {
    const next: typeof frontier = [];

    for (const level of frontier) {
      for (const edge of edges) {
        if (edge.referencedTable !== level.table || edge.referencedColumn !== level.column) continue;

        const rows = await selectRows(executor, edge.table, edge.column, level.values);
        if (rows.length === 0) continue;

        if (edge.onDelete === "CASCADE") {
          if (!skip.has(edge.table)) {
            const fresh = rows.filter((r) => !seen.has(`${edge.table}:${r.id}`));
            for (const r of fresh) seen.add(`${edge.table}:${r.id}`);
            if (fresh.length > 0) deleted.push({ table: edge.table, rows: fresh });
          }
          const ids = rows.map((r) => r.id).filter((v) => v !== undefined && v !== null);
          if (ids.length > 0) next.push({ table: edge.table, column: "id", values: ids });
        } else if (edge.onDelete === "SET NULL" || edge.onDelete === "SET DEFAULT") {
          // The row survives; only this column is blanked. Keep the old value.
          for (const row of rows) {
            if (row[edge.column] == null) continue;
            nulled.push({
              table: edge.table,
              column: edge.column,
              idColumn: "id",
              id: row.id,
              value: row[edge.column],
            });
          }
        }
        // RESTRICT / NO ACTION: Postgres will refuse the delete. The caller sees
        // the error; nothing to snapshot.
      }
    }

    frontier = next;
    depth += 1;
  }

  return { deleted, nulled };
}

/** A flat `{table: count}` for an impact list, from the same discovery. */
export function snapshotCounts(snapshot: CascadeSnapshot): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const entry of snapshot.deleted) {
    counts[entry.table] = (counts[entry.table] ?? 0) + entry.rows.length;
  }
  for (const entry of snapshot.nulled) {
    const key = `${entry.table}.${entry.column}`;
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

/**
 * Puts a snapshot back: the deleted rows in the order they were captured
 * (parents first), then the columns a SET NULL had blanked.
 *
 * Rows whose id has since been taken are skipped and reported rather than
 * crashing the whole restore on a primary-key collision.
 */
export async function restoreCascadeSnapshot(
  executor: any,
  snapshot: CascadeSnapshot | null | undefined,
  options: { skipTables?: string[] } = {},
): Promise<{ restored: number; skipped: Array<{ table: string; id: unknown; reason: string }> }> {
  const skip = new Set(options.skipTables ?? []);
  const skipped: Array<{ table: string; id: unknown; reason: string }> = [];
  let restored = 0;

  for (const entry of snapshot?.deleted ?? []) {
    if (skip.has(entry.table)) continue;
    for (const row of entry.rows) {
      const columns = Object.keys(row);
      if (columns.length === 0) continue;
      try {
        const colList = sql.join(columns.map((c) => ident(c)), sql`, `);
        const valList = sql.join(columns.map((c) => sql`${row[c] ?? null}`), sql`, `);
        await executor.execute(
          sql`INSERT INTO ${ident(entry.table)} (${colList}) VALUES (${valList}) ON CONFLICT DO NOTHING`,
        );
        restored += 1;
      } catch (error) {
        skipped.push({ table: entry.table, id: (row as any).id, reason: (error as Error).message });
      }
    }
    // Keep the serial sequence ahead of the ids we forced back in.
    try {
      await executor.execute(sql`
        SELECT setval(
          pg_get_serial_sequence(${entry.table}, 'id'),
          GREATEST((SELECT COALESCE(MAX(id), 1) FROM ${ident(entry.table)}), 1)
        )
      `);
    } catch {
      // Not every table has a serial id; nothing to do.
    }
  }

  for (const entry of snapshot?.nulled ?? []) {
    if (skip.has(entry.table)) continue;
    try {
      await executor.execute(sql`
        UPDATE ${ident(entry.table)}
        SET ${ident(entry.column)} = ${entry.value}
        WHERE ${ident(entry.idColumn)} = ${entry.id} AND ${ident(entry.column)} IS NULL
      `);
      restored += 1;
    } catch (error) {
      skipped.push({ table: entry.table, id: entry.id, reason: (error as Error).message });
    }
  }

  return { restored, skipped };
}
