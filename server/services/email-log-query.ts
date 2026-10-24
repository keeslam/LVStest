/**
 * Search, filter, sort and page the e-mail log in the database (Kees,
 * 2026-10-24: the log must stay usable at 10,000 rows and more). The client
 * asks for one page at a time; the Analyse totals and the CSV export are
 * counted here too, so the browser never holds the whole table.
 *
 * Every query parameter is parsed into a closed set of values first, so
 * nothing the request sends ends up in SQL except as a bound parameter.
 */
import { sql, type SQL } from "drizzle-orm";
import { db } from "../db";
import { emailLogs, vehicles, type EmailLog } from "@shared/schema";
import { officeTimeZone } from "./office-time";

export const EMAIL_LOG_PAGE_SIZES = [25, 50, 100, 250] as const;
export const EMAIL_LOG_EXPORT_LIMIT = 20000;

/** Kinds with their own label in the log; anything else is "other". */
export const EMAIL_LOG_KINDS = ["apk", "maintenance", "custom", "gps", "documents", "fine_linked"] as const;

// "problem" is failed or partial: the Analyse tile "Rondes met mislukkingen".
const STATUSES = ["sent", "failed", "partial", "problem"] as const;
const SCOPES = ["all", "mails", "runs"] as const;
const SORTS = ["sentAt", "subject", "recipient", "status"] as const;

type Status = (typeof STATUSES)[number];
// "other" is a kind without its own label; "rest" is everything but apk,
// maintenance and custom, which is what the Analyse tile "Overige e-mails" counts.
type Kind = (typeof EMAIL_LOG_KINDS)[number] | "other" | "rest";
type Scope = (typeof SCOPES)[number];
type Sort = (typeof SORTS)[number];

export interface EmailLogQuery {
  q: string;
  status: Status | null;
  kind: Kind | null;
  scope: Scope;
  from: string | null;
  to: string | null;
  sort: Sort;
  dir: "asc" | "desc";
  page: number;
  pageSize: number;
}

export type EmailLogListRow = EmailLog & { vehicles: Array<{ id: number; licensePlate: string }> };

function one<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : null;
}

function isoDate(value: unknown): string | null {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) ? value : null;
}

function positiveInt(value: unknown, fallback: number): number {
  const n = typeof value === "string" ? Number.parseInt(value, 10) : NaN;
  return Number.isFinite(n) && n >= 1 ? n : fallback;
}

/** The request's query string as a query; unknown or malformed values fall back to the defaults. */
export function parseEmailLogQuery(input: Record<string, unknown>): EmailLogQuery {
  const size = positiveInt(input.pageSize, 50);
  return {
    q: typeof input.q === "string" ? input.q.trim().slice(0, 200) : "",
    status: one(input.status, STATUSES),
    kind: one(input.kind, [...EMAIL_LOG_KINDS, "other", "rest"] as const),
    scope: one(input.scope, SCOPES) ?? "all",
    from: isoDate(input.from),
    to: isoDate(input.to),
    sort: one(input.sort, SORTS) ?? "sentAt",
    dir: input.dir === "asc" ? "asc" : "desc",
    page: positiveInt(input.page, 1),
    pageSize: Math.min(size, 250),
  };
}

// The status the client shows (emailLogStatus in CustomerCommunications.tsx),
// as SQL: a single attempt says sent/failed itself, a run is partial when some
// of its mails failed and some went out.
const STATUS_SQL = sql`(CASE
  WHEN ${emailLogs.result} = 'sent' THEN 'sent'
  WHEN ${emailLogs.result} = 'failed' THEN 'failed'
  WHEN ${emailLogs.emailsFailed} > 0 THEN CASE WHEN ${emailLogs.emailsSent} > 0 THEN 'partial' ELSE 'failed' END
  ELSE 'sent' END)`;

/** sent_at is ISO text; a row whose text is not a timestamp has no office date instead of breaking the query. */
function officeDateSql(zone: string): SQL {
  return sql`(CASE WHEN ${emailLogs.sentAt} ~ '^\\d{4}-\\d{2}-\\d{2}T' THEN ((${emailLogs.sentAt})::timestamptz AT TIME ZONE ${zone})::date END)`;
}

function likePattern(text: string): string {
  return `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

function whereSql(query: EmailLogQuery): SQL {
  const parts: SQL[] = [sql`TRUE`];

  if (query.q) {
    const like = likePattern(query.q);
    const or: SQL[] = [
      sql`${emailLogs.subject} ILIKE ${like}`,
      sql`${emailLogs.recipient} ILIKE ${like}`,
      sql`${emailLogs.failureReason} ILIKE ${like}`,
    ];
    // Plates are compared without dashes or spaces, so "ab123c" finds "AB-123-C".
    const plate = query.q.toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (plate.length >= 2) {
      or.push(sql`(jsonb_typeof(${emailLogs.vehicleIds}) = 'array' AND EXISTS (
        SELECT 1 FROM ${vehicles}
        WHERE ${vehicles.id}::text IN (SELECT jsonb_array_elements_text(${emailLogs.vehicleIds}))
          AND regexp_replace(upper(${vehicles.licensePlate}), '[^A-Z0-9]', '', 'g') LIKE ${likePattern(plate)}))`);
    }
    parts.push(sql`(${sql.join(or, sql` OR `)})`);
  }

  if (query.status === "problem") parts.push(sql`${STATUS_SQL} IN ('failed', 'partial')`);
  else if (query.status) parts.push(sql`${STATUS_SQL} = ${query.status}`);

  if (query.kind === "rest") {
    parts.push(sql`${emailLogs.template} NOT IN ('apk', 'maintenance', 'custom')`);
  } else if (query.kind === "other") {
    parts.push(sql`${emailLogs.template} NOT IN (${sql.join(EMAIL_LOG_KINDS.map((k) => sql`${k}`), sql`, `)})`);
  } else if (query.kind) {
    parts.push(sql`${emailLogs.template} = ${query.kind}`);
  }

  if (query.scope === "mails") parts.push(sql`${emailLogs.recipient} IS NOT NULL`);
  if (query.scope === "runs") parts.push(sql`${emailLogs.recipient} IS NULL`);

  if (query.from || query.to) {
    const day = officeDateSql(officeTimeZone());
    if (query.from) parts.push(sql`${day} >= ${query.from}::date`);
    if (query.to) parts.push(sql`${day} <= ${query.to}::date`);
  }

  return sql.join(parts, sql` AND `);
}

function orderSql(query: EmailLogQuery): SQL {
  const dir = query.dir === "asc" ? sql`ASC` : sql`DESC`;
  const column = {
    sentAt: sql`${emailLogs.sentAt}`,
    subject: sql`lower(${emailLogs.subject})`,
    recipient: sql`lower(${emailLogs.recipient})`,
    status: STATUS_SQL,
  }[query.sort];
  // Runs have no recipient; they go last whichever way the column is sorted.
  return sql`${column} ${dir} NULLS LAST, ${emailLogs.id} ${dir}`;
}

async function withVehicles(rows: EmailLog[]): Promise<EmailLogListRow[]> {
  const ids = Array.from(new Set(rows.flatMap((r) => (Array.isArray(r.vehicleIds) ? r.vehicleIds : []))))
    .filter((id): id is number => Number.isInteger(id));
  const plates = new Map<number, string>();
  if (ids.length) {
    const found = await db.execute(sql`SELECT ${vehicles.id} AS id, ${vehicles.licensePlate} AS plate FROM ${vehicles} WHERE ${vehicles.id} IN (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})`);
    for (const v of found.rows as Array<{ id: number; plate: string }>) plates.set(Number(v.id), v.plate);
  }
  return rows.map((r) => ({
    ...r,
    vehicles: (Array.isArray(r.vehicleIds) ? r.vehicleIds : [])
      .filter((id) => plates.has(id))
      .map((id) => ({ id, licensePlate: plates.get(id)! })),
  }));
}

export async function searchEmailLogs(query: EmailLogQuery) {
  const where = whereSql(query);
  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(emailLogs).where(where);
  const pages = Math.max(1, Math.ceil(count / query.pageSize));
  const page = Math.min(query.page, pages);
  const rows = await db.select().from(emailLogs).where(where).orderBy(orderSql(query))
    .limit(query.pageSize).offset((page - 1) * query.pageSize);
  return { rows: await withVehicles(rows), total: count, page, pageSize: query.pageSize };
}

export async function exportEmailLogs(query: EmailLogQuery) {
  const rows = await db.select().from(emailLogs).where(whereSql(query)).orderBy(orderSql(query))
    .limit(EMAIL_LOG_EXPORT_LIMIT + 1);
  const truncated = rows.length > EMAIL_LOG_EXPORT_LIMIT;
  return { rows: await withVehicles(rows.slice(0, EMAIL_LOG_EXPORT_LIMIT)), truncated };
}

/** The Analyse totals (summariseEmailLog in the client used to count them from every row). */
export async function summariseEmailLogs() {
  const status = STATUS_SQL;
  const mail = sql`${emailLogs.recipient} IS NOT NULL`;
  const count = (cond: SQL) => sql<number>`(count(*) FILTER (WHERE ${cond}))::int`;
  const kind = (name: "apk" | "maintenance" | "custom" | "other") => {
    const match = name === "other"
      ? sql`${emailLogs.template} NOT IN ('apk', 'maintenance', 'custom')`
      : sql`${emailLogs.template} = ${name}`;
    return {
      sent: count(sql`${mail} AND ${match} AND ${status} = 'sent'`),
      failed: count(sql`${mail} AND ${match} AND ${status} = 'failed'`),
    };
  };
  const k = { apk: kind("apk"), maintenance: kind("maintenance"), custom: kind("custom"), other: kind("other") };
  const [row] = await db.select({
    sent: count(sql`${mail} AND ${status} = 'sent'`),
    failed: count(sql`${mail} AND ${status} = 'failed'`),
    runs: count(sql`${emailLogs.recipient} IS NULL`),
    runsWithFailures: count(sql`${emailLogs.recipient} IS NULL AND ${emailLogs.emailsFailed} > 0`),
    apkSent: k.apk.sent, apkFailed: k.apk.failed,
    maintenanceSent: k.maintenance.sent, maintenanceFailed: k.maintenance.failed,
    customSent: k.custom.sent, customFailed: k.custom.failed,
    otherSent: k.other.sent, otherFailed: k.other.failed,
  }).from(emailLogs);
  return {
    sent: row.sent,
    failed: row.failed,
    runs: row.runs,
    runsWithFailures: row.runsWithFailures,
    kinds: {
      apk: { sent: row.apkSent, failed: row.apkFailed },
      maintenance: { sent: row.maintenanceSent, failed: row.maintenanceFailed },
      custom: { sent: row.customSent, failed: row.customFailed },
      other: { sent: row.otherSent, failed: row.otherFailed },
    },
  };
}
