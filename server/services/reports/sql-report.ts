/**
 * Rapporten - the SQL half of the report kit. A report declares which rows
 * belong to a tile (`tileWhere`, period included) and what money a tile adds
 * up (`tileAmount`); `sqlReport` builds the tile totals, the count and the
 * WHERE of the list from exactly those two, so a tile can never add up a
 * different set of rows than the list it opens.
 */
import { sql, type SQL } from "drizzle-orm";
import { db } from "../../db";
import { REPORT_BREAKDOWN_LIMIT, type ReportBreakdownRow, type ReportTileTotal } from "../../../shared/report-kit";
import { money, type ReportDefinition, type ReportDrill, type ReportFilter } from "./report-kit";

export async function rowsOf<T>(query: SQL): Promise<T[]> {
  const result = await db.execute(query);
  return result.rows as T[];
}

export interface SqlReportSpec<Tile extends string, Sort extends string, Row, Extras extends object> {
  key: string;
  tiles: readonly Tile[];
  sorts: readonly Sort[];
  defaultSort: Sort;
  defaultDir: "asc" | "desc";
  /** The table expression after FROM, joins included. A join must not repeat rows. */
  from: SQL;
  /** The full condition for a row to belong to a tile: period, vehicle filter and the tile's own rule. */
  tileWhere(tile: Tile, filter: ReportFilter): SQL;
  /** The money one row adds to a tile. */
  tileAmount(tile: Tile): SQL;
  /** The SELECT list of the tile's rows. */
  select(tile: Tile): SQL;
  orderBy(sort: Sort, dir: "asc" | "desc", tile: Tile): SQL;
  /** Breakdown names that /rows and /export accept as `drill` (one per `reportBreakdown` of the summary). */
  drills?: readonly string[];
  /**
   * The condition for one breakdown line, ANDed to the tile's own: the SAME key expression as the
   * breakdown (`keyIs(expr, drill.key)`), so the rows opened equal the count of the line.
   */
  drillWhere?(drill: ReportDrill, filter: ReportFilter): SQL;
  mapRow(row: Record<string, any>): Row;
  /** Everything on the summary besides the tiles (charts, breakdowns, hints). */
  extras(filter: ReportFilter): Promise<Extras>;
}

export function sqlReport<Tile extends string, Sort extends string, Row, Extras extends object>(
  spec: SqlReportSpec<Tile, Sort, Row, Extras>,
): ReportDefinition<Tile, Sort, Row, Extras & { tiles: Record<Tile, ReportTileTotal> }> {
  if (spec.drills?.length && !spec.drillWhere) {
    throw new Error(`sqlReport ${spec.key}: drills are declared but there is no drillWhere`);
  }
  const alias = (prefix: string, tile: Tile) => sql.raw(`"${prefix}_${tile}"`);
  /** The drill of a /rows or /export request (never set on the summary). */
  const drillClause = (filter: ReportFilter): SQL =>
    filter.drill && spec.drillWhere ? sql` AND (${spec.drillWhere(filter.drill, filter)})` : sql``;

  async function tileTotals(filter: ReportFilter): Promise<Record<Tile, ReportTileTotal>> {
    const columns = sql.join(
      spec.tiles.map((tile) => sql`count(*) FILTER (WHERE ${spec.tileWhere(tile, filter)})::int AS ${alias("c", tile)},
        ${money(sql`sum(${spec.tileAmount(tile)}) FILTER (WHERE ${spec.tileWhere(tile, filter)})`)} AS ${alias("a", tile)}`),
      sql`, `,
    );
    const anyTile = sql.join(spec.tiles.map((tile) => sql`(${spec.tileWhere(tile, filter)})`), sql` OR `);
    const [totals] = await rowsOf<Record<string, number>>(sql`SELECT ${columns} FROM ${spec.from} WHERE ${anyTile}`);
    return Object.fromEntries(
      spec.tiles.map((tile) => [tile, { count: Number(totals?.[`c_${tile}`] ?? 0), amount: Number(totals?.[`a_${tile}`] ?? 0) }]),
    ) as Record<Tile, ReportTileTotal>;
  }

  return {
    key: spec.key,
    tiles: spec.tiles,
    sorts: spec.sorts,
    defaultSort: spec.defaultSort,
    defaultDir: spec.defaultDir,
    drills: spec.drills,
    async summary(filter) {
      const [tiles, extras] = await Promise.all([tileTotals(filter), spec.extras(filter)]);
      return { ...extras, tiles };
    },
    async count(filter, tile) {
      const [row] = await rowsOf<{ n: number }>(sql`SELECT count(*)::int AS n FROM ${spec.from} WHERE ${spec.tileWhere(tile, filter)}${drillClause(filter)}`);
      return Number(row?.n ?? 0);
    },
    async list(filter, tile, order, limit, offset) {
      const rows = await rowsOf<Record<string, any>>(sql`
        SELECT ${spec.select(tile)}
        FROM ${spec.from}
        WHERE ${spec.tileWhere(tile, filter)}${drillClause(filter)}
        ORDER BY ${spec.orderBy(order.sort, order.dir, tile)}
        LIMIT ${limit} OFFSET ${offset}`);
      return rows.map((r) => spec.mapRow(r));
    },
  };
}

/** Count and money per key (customer, vehicle, ...) over the rows `where` selects, biggest amount first. */
export async function reportBreakdown(args: { from: SQL; where: SQL; key: SQL; label: SQL; amount: SQL }): Promise<ReportBreakdownRow[]> {
  const rows = await rowsOf<{ key: number | string | null; label: string | null; count: number; amount: number }>(sql`
    SELECT ${args.key} AS key, ${args.label} AS label, count(*)::int AS count, ${money(sql`sum(${args.amount})`)} AS amount
    FROM ${args.from}
    WHERE ${args.where}
    GROUP BY 1, 2
    ORDER BY amount DESC, count DESC, 2 ASC NULLS LAST
    LIMIT ${REPORT_BREAKDOWN_LIMIT}`);
  return rows.map((r) => ({ key: r.key, label: r.label, count: Number(r.count), amount: Number(r.amount) }));
}
