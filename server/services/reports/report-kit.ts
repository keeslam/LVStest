/**
 * Rapporten fase 2 — the server half of the report kit. Every money report
 * (fines, extra km, transport) parses the same period and paging, builds its
 * SQL from the same day and money helpers, and gets the same three routes
 * from `mountReport`: summary (the tiles), rows (one page of one tile) and
 * export (all rows of one tile, up to REPORT_EXPORT_LIMIT).
 *
 * Every query parameter is parsed into a closed set of values first, so
 * nothing the request sends ends up in SQL except as a bound parameter.
 */
import type { Express, RequestHandler } from "express";
import { sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { officeTimeZone } from "../office-time";
import { dateInZone } from "../../../shared/office-timezone";
import { UserRole } from "../../../shared/schema";
import {
  REPORT_EXPORT_LIMIT,
  type ReportExport,
  type ReportPage,
  type ReportTileTotal,
} from "../../../shared/report-kit";

export interface ReportFilter {
  from: string;
  to: string;
  vehicleId: number | null;
}

/** yyyy-mm-dd and a real calendar date (no 2026-02-30). */
export function isRealDate(value: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.toISOString().slice(0, 10) === value;
}

/** From the first of January of today's year up to and including today. */
export function defaultReportPeriod(today: string): { from: string; to: string } {
  return { from: `${today.slice(0, 4)}-01-01`, to: today };
}

export function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : null;
}

export function positiveInt(value: unknown, fallback: number): number {
  const n = typeof value === "string" ? Number.parseInt(value, 10) : NaN;
  return Number.isFinite(n) && n >= 1 ? n : fallback;
}

/** Period (default: this year up to today) and an optional vehicle; "all" or empty means every vehicle. */
export function parseReportFilter(
  query: Record<string, unknown>,
  today: string,
): { ok: true; filter: ReportFilter } | { ok: false; code: "INVALID_DATE" | "INVALID_VEHICLE" } {
  const period = defaultReportPeriod(today);
  const from = query.from === undefined || query.from === "" ? period.from : query.from;
  const to = query.to === undefined || query.to === "" ? period.to : query.to;
  if (typeof from !== "string" || typeof to !== "string" || !isRealDate(from) || !isRealDate(to) || from > to) {
    return { ok: false, code: "INVALID_DATE" };
  }
  const rawVehicle = query.vehicleId;
  let vehicleId: number | null = null;
  if (rawVehicle !== undefined && rawVehicle !== "" && rawVehicle !== "all") {
    if (typeof rawVehicle !== "string" || !/^\d+$/.test(rawVehicle)) return { ok: false, code: "INVALID_VEHICLE" };
    vehicleId = Number.parseInt(rawVehicle, 10);
    if (!Number.isSafeInteger(vehicleId) || vehicleId <= 0) return { ok: false, code: "INVALID_VEHICLE" };
  }
  return { ok: true, filter: { from, to, vehicleId } };
}

/** Number of calendar days in the period, both ends included. */
export function periodDays(filter: ReportFilter): number {
  const ms = (day: string) => Date.parse(`${day}T00:00:00Z`);
  return Math.round((ms(filter.to) - ms(filter.from)) / 86_400_000) + 1;
}

/** Who is looking at the report; a definition's `redact` decides what this viewer may see. */
export interface ReportViewer {
  isAdmin: boolean;
}

/** Sort, direction and page; unknown values fall back, the page size is at most 250 (default 50). */
export function parseReportPaging<S extends string>(
  query: Record<string, unknown>,
  sorts: readonly S[],
  defaultSort: S,
  defaultDir: "asc" | "desc",
): { sort: S; dir: "asc" | "desc"; page: number; pageSize: number } {
  return {
    sort: oneOf(query.sort, sorts) ?? defaultSort,
    dir: oneOf(query.dir, ["asc", "desc"] as const) ?? defaultDir,
    page: positiveInt(query.page, 1),
    pageSize: Math.min(positiveInt(query.pageSize, 50), 250),
  };
}

/**
 * A timestamp as the calendar date in the office time zone. Works for timestamptz and for a
 * naive `timestamp` column (still the case in some databases until the timestamptz conversion
 * runs): a naive value holds UTC wall time, because Drizzle writes ISO strings with Z.
 */
export function officeDaySql(column: SQL | AnyPgColumn): SQL {
  return sql`((CASE WHEN pg_typeof(${column}) = 'timestamp with time zone'::regtype THEN (${column})::timestamptz ELSE ((${column})::timestamp AT TIME ZONE 'UTC') END) AT TIME ZONE ${officeTimeZone()})::date`;
}

/**
 * A text date (`yyyy-mm-dd…`) as a date. Text that does not start with a real calendar date
 * (no date at all, month 13, 30 February) gives NULL instead of breaking the whole query.
 * The cast only runs after both checks passed (nested CASE), so it can never throw.
 */
export function textDaySql(column: SQL | AnyPgColumn): SQL {
  const y = sql`substr(${column}, 1, 4)::int`;
  const m = sql`substr(${column}, 6, 2)::int`;
  const d = sql`substr(${column}, 9, 2)::int`;
  const lastDay = sql`extract(day from (make_date(${y}, ${m}, 1) + interval '1 month - 1 day'))::int`;
  return sql`(CASE WHEN (${column}) ~ '^(?!0000)\\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\\d|3[01])'
    THEN (CASE WHEN ${d} <= ${lastDay} THEN left(${column}, 10)::date END) END)`;
}

/** The day falls inside the filter's period (both ends included). */
export function inPeriodSql(day: SQL, filter: ReportFilter): SQL {
  return sql`${day} >= ${filter.from}::date AND ${day} <= ${filter.to}::date`;
}

/** A sum of money, 0 when there are no rows, rounded to cents. */
export function money(sumSql: SQL): SQL<number> {
  return sql<number>`round(coalesce(${sumSql}, 0)::numeric, 2)::float8`;
}

export interface ReportDefinition<Tile extends string, Sort extends string, Row, Summary extends { tiles: Record<Tile, ReportTileTotal> }> {
  /** "fines" → error code FINES_REPORT_FAILED. */
  key: string;
  tiles: readonly Tile[];
  sorts: readonly Sort[];
  defaultSort: Sort;
  defaultDir: "asc" | "desc";
  summary(filter: ReportFilter): Promise<Summary>;
  count(filter: ReportFilter, tile: Tile): Promise<number>;
  list(filter: ReportFilter, tile: Tile, order: { sort: Sort; dir: "asc" | "desc" }, limit: number, offset: number): Promise<Row[]>;
  /** Longest period in days; a longer one is refused with 400 PERIOD_TOO_LONG on all three routes. */
  maxDays?: number;
  /** Applied to every row of /rows and /export for this viewer (e.g. blank out km readings for non-admins). */
  redact?: (row: Row, viewer: ReportViewer) => Row;
}

/**
 * Registers GET `${basePath}/summary`, `${basePath}/rows?tile=` and
 * `${basePath}/export?tile=` behind `guards`.
 */
export function mountReport<Tile extends string, Sort extends string, Row, Summary extends { tiles: Record<Tile, ReportTileTotal> }>(
  app: Express,
  basePath: string,
  guards: RequestHandler[],
  def: ReportDefinition<Tile, Sort, Row, Summary>,
): void {
  const failedCode = `${def.key.toUpperCase().replace(/-/g, "_")}_REPORT_FAILED`;
  const failedMessage = `Failed to load the ${def.key} report`;

  type Handler = (query: Record<string, unknown>, filter: ReportFilter, viewer: ReportViewer) => Promise<{ status: number; body: unknown }>;
  const route = (path: string, handler: Handler) => {
    app.get(`${basePath}/${path}`, ...guards, async (req, res) => {
      try {
        const query = req.query as Record<string, unknown>;
        const parsed = parseReportFilter(query, dateInZone(new Date(), officeTimeZone()));
        if (!parsed.ok) {
          const message = parsed.code === "INVALID_DATE" ? "Invalid date range" : "Invalid vehicle";
          return res.status(400).json({ message, code: parsed.code });
        }
        if (def.maxDays !== undefined && periodDays(parsed.filter) > def.maxDays) {
          return res.status(400).json({ message: "Period too long", code: "PERIOD_TOO_LONG" });
        }
        const viewer: ReportViewer = { isAdmin: (req as { user?: { role?: string } }).user?.role === UserRole.ADMIN };
        const { status, body } = await handler(query, parsed.filter, viewer);
        res.status(status).json(body);
      } catch (error) {
        console.error(`Error loading the ${def.key} report:`, error);
        res.status(500).json({ message: failedMessage, code: failedCode });
      }
    });
  };
  const redactRows = (rows: Row[], viewer: ReportViewer): Row[] => (def.redact ? rows.map((r) => def.redact!(r, viewer)) : rows);
  const invalidTile = { status: 400, body: { message: "Invalid tile", code: "INVALID_TILE" } };

  route("summary", async (_query, filter) => {
    const summary = await def.summary(filter);
    return { status: 200, body: { ...summary, from: filter.from, to: filter.to } };
  });

  route("rows", async (query, filter, viewer) => {
    const tile = oneOf(query.tile, def.tiles);
    if (!tile) return invalidTile;
    const paging = parseReportPaging(query, def.sorts, def.defaultSort, def.defaultDir);
    const total = await def.count(filter, tile);
    const pages = Math.max(1, Math.ceil(total / paging.pageSize));
    const page = Math.min(paging.page, pages);
    const rows = await def.list(filter, tile, { sort: paging.sort, dir: paging.dir }, paging.pageSize, (page - 1) * paging.pageSize);
    const body: ReportPage<Row> = { rows: redactRows(rows, viewer), total, page, pageSize: paging.pageSize };
    return { status: 200, body };
  });

  route("export", async (query, filter, viewer) => {
    const tile = oneOf(query.tile, def.tiles);
    if (!tile) return invalidTile;
    const paging = parseReportPaging(query, def.sorts, def.defaultSort, def.defaultDir);
    const rows = await def.list(filter, tile, { sort: paging.sort, dir: paging.dir }, REPORT_EXPORT_LIMIT + 1, 0);
    const body: ReportExport<Row> = { rows: redactRows(rows.slice(0, REPORT_EXPORT_LIMIT), viewer), truncated: rows.length > REPORT_EXPORT_LIMIT };
    return { status: 200, body };
  });
}
