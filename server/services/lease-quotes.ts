// Lease quotes: settings, numbering, price calculation, list/search, copy and delete.
// All amounts are excl. btw. The routes in server/routes/lease-quotes.ts are thin wrappers.
import fs from "fs";
import path from "path";
import { and, asc, desc, eq, gte, inArray, lt, or, sql, type SQL } from "drizzle-orm";
import { db } from "../db";
import {
  customers, deletedRecords, leaseQuoteFiles, leaseQuoteSettings, leaseQuoteVariants, leaseQuotes,
  type LeaseQuote, type LeaseQuoteFile, type LeaseQuoteSettings, type LeaseQuoteVariant,
} from "../../shared/schema";
import { calculateLeaseVariant, roundCents } from "../../shared/lease-quote-calc";
import {
  LEASE_QUOTE_STATUSES, displayStatus, formatQuoteNumber, type LeaseQuotePayload,
} from "../../shared/lease-quotes";
import { assertWithinUploads, getUploadsDir } from "../../shared/paths";
import { customerDisplayName } from "./customer-display-name";
import { isoToday } from "./lifecycle";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** numeric columns come back as strings; the API answers with numbers. */
const toNum = (v: string | number | null | undefined): number | null => (v === null || v === undefined ? null : Number(v));
const toStr = (v: number | null | undefined): string | null => (v === null || v === undefined ? null : String(v));

const NUMERIC_QUOTE_KEYS = [
  "purchasePrice", "interestRatePercent", "robPerYear", "otherCostsPerYear", "insurancePerMonth",
  "roadTaxPerMonth", "marginPerMonth", "excessKmPrice", "shortfallKmPrice",
] as const;

export type SerializedVariant = Omit<LeaseQuoteVariant, "residualValue" | "totalPerMonth"> & {
  residualValue: number; totalPerMonth: number | null;
};
export type SerializedQuote = Omit<LeaseQuote, (typeof NUMERIC_QUOTE_KEYS)[number]> & {
  [K in (typeof NUMERIC_QUOTE_KEYS)[number]]: number | null;
} & { customerName: string | null; variants: SerializedVariant[]; files: LeaseQuoteFile[] };

function serializeVariant(v: LeaseQuoteVariant): SerializedVariant {
  return { ...v, residualValue: Number(v.residualValue), totalPerMonth: toNum(v.totalPerMonth) };
}

function serializeQuote(q: LeaseQuote, variants: LeaseQuoteVariant[], files: LeaseQuoteFile[], customerName: string | null): SerializedQuote {
  const out: any = { ...q };
  for (const key of NUMERIC_QUOTE_KEYS) out[key] = toNum(q[key]);
  return { ...out, customerName, variants: variants.map(serializeVariant), files };
}

/* ------------------------------------------------------------------ *
 * Settings
 * ------------------------------------------------------------------ */

export interface SerializedSettings {
  id: number;
  interestRatePercent: number; marginPerMonth: number; robPerYear: number; otherCostsPerYear: number;
  excessKmPrice: number; shortfallKmPrice: number; validityDays: number;
  updatedAt: Date | null; updatedBy: string | null;
}

function serializeSettings(s: LeaseQuoteSettings): SerializedSettings {
  return {
    id: s.id,
    interestRatePercent: Number(s.interestRatePercent ?? 9),
    marginPerMonth: Number(s.marginPerMonth ?? 0),
    robPerYear: Number(s.robPerYear ?? 275),
    otherCostsPerYear: Number(s.otherCostsPerYear ?? 350),
    excessKmPrice: Number(s.excessKmPrice ?? 0),
    shortfallKmPrice: Number(s.shortfallKmPrice ?? 0),
    validityDays: s.validityDays ?? 30,
    updatedAt: s.updatedAt ?? null,
    updatedBy: s.updatedBy ?? null,
  };
}

async function getSettingsRow(executor: Pick<typeof db, "select" | "insert"> = db): Promise<LeaseQuoteSettings> {
  const [row] = await executor.select().from(leaseQuoteSettings).orderBy(leaseQuoteSettings.id).limit(1);
  if (row) return row;
  const [created] = await executor.insert(leaseQuoteSettings).values({}).returning();
  return created;
}

export async function getLeaseQuoteSettings(): Promise<SerializedSettings> {
  return serializeSettings(await getSettingsRow());
}

export type LeaseQuoteSettingsInput = Partial<Pick<SerializedSettings,
  "interestRatePercent" | "marginPerMonth" | "robPerYear" | "otherCostsPerYear" | "excessKmPrice" | "shortfallKmPrice" | "validityDays">>;

export async function updateLeaseQuoteSettings(input: LeaseQuoteSettingsInput, updatedBy: string | null): Promise<SerializedSettings> {
  const current = await getSettingsRow();
  const set: Partial<typeof leaseQuoteSettings.$inferInsert> = { updatedAt: new Date(), updatedBy };
  if (input.interestRatePercent !== undefined) set.interestRatePercent = String(input.interestRatePercent);
  if (input.marginPerMonth !== undefined) set.marginPerMonth = String(input.marginPerMonth);
  if (input.robPerYear !== undefined) set.robPerYear = String(input.robPerYear);
  if (input.otherCostsPerYear !== undefined) set.otherCostsPerYear = String(input.otherCostsPerYear);
  if (input.excessKmPrice !== undefined) set.excessKmPrice = String(input.excessKmPrice);
  if (input.shortfallKmPrice !== undefined) set.shortfallKmPrice = String(input.shortfallKmPrice);
  if (input.validityDays !== undefined) set.validityDays = input.validityDays;
  const [row] = await db.update(leaseQuoteSettings).set(set).where(eq(leaseQuoteSettings.id, current.id)).returning();
  return serializeSettings(row);
}

/* ------------------------------------------------------------------ *
 * Numbering and calculation
 * ------------------------------------------------------------------ */

/** Adds whole days to an ISO date (UTC arithmetic on the calendar date, no zone involved). */
export function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/**
 * Next quote number for the calendar year of `quoteDate`. Runs inside the caller's
 * transaction after taking a transaction-scoped advisory lock, so two parallel creates
 * are serialised and get different numbers (the unique index is the second line of defence).
 */
async function allocateQuoteNumber(tx: Tx, quoteDate: string): Promise<string> {
  const year = Number(quoteDate.slice(0, 4));
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('lease_quote_number'))`);
  // Numbers only go up: deleted quotes waiting in the recycle bin still hold their number
  // (it may be on a PDF already), so the unrestored snapshots count too.
  const like = `LO-${year}-%`;
  const result = await tx.execute(sql`
    SELECT GREATEST(
      COALESCE((SELECT MAX(substring(quote_number from '[0-9]+$')::int) FROM lease_quotes WHERE quote_number LIKE ${like}), 0),
      COALESCE((SELECT MAX(substring(payload->'quote'->>'quoteNumber' from '[0-9]+$')::int) FROM deleted_records
                WHERE entity_type = 'lease_quote' AND restored_at IS NULL AND payload->'quote'->>'quoteNumber' LIKE ${like}), 0)
    ) AS seq
  `);
  const seq = Number((result.rows[0] as any)?.seq ?? 0);
  return formatQuoteNumber(year, seq + 1);
}

/** Server-side total for one variant, rounded to cents; null when the term is missing. */
export function variantTotal(
  quote: Pick<LeaseQuote, (typeof NUMERIC_QUOTE_KEYS)[number]>,
  variant: { termMonths: number; kmPerYear: number; residualValue: number },
): number | null {
  const result = calculateLeaseVariant({
    purchasePrice: Number(quote.purchasePrice ?? 0),
    interestRatePercent: Number(quote.interestRatePercent ?? 0),
    robPerYear: Number(quote.robPerYear ?? 0),
    otherCostsPerYear: Number(quote.otherCostsPerYear ?? 0),
    insurancePerMonth: Number(quote.insurancePerMonth ?? 0),
    roadTaxPerMonth: Number(quote.roadTaxPerMonth ?? 0),
    marginPerMonth: Number(quote.marginPerMonth ?? 0),
  }, variant);
  return result.totalPerMonth === null ? null : roundCents(result.totalPerMonth);
}

type VariantInput = { termMonths: number; kmPerYear: number; residualValue: number; isChosen: boolean };

async function writeVariants(tx: Tx, quote: LeaseQuote, variants: VariantInput[]): Promise<void> {
  await tx.delete(leaseQuoteVariants).where(eq(leaseQuoteVariants.quoteId, quote.id));
  if (variants.length === 0) return;
  await tx.insert(leaseQuoteVariants).values(variants.map((v, position) => ({
    quoteId: quote.id,
    position,
    termMonths: v.termMonths,
    kmPerYear: v.kmPerYear,
    residualValue: String(v.residualValue),
    isChosen: v.isChosen,
    totalPerMonth: toStr(variantTotal(quote, v)),
  })));
}

/** Scalar columns of the payload (everything but the variants), numbers stringified for the numeric columns. */
function payloadColumns(payload: Partial<LeaseQuotePayload>): Partial<typeof leaseQuotes.$inferInsert> {
  const { variants: _variants, ...rest } = payload;
  const out: any = {};
  for (const [key, value] of Object.entries(rest)) {
    if (value === undefined) continue;
    out[key] = (NUMERIC_QUOTE_KEYS as readonly string[]).includes(key) ? toStr(value as number | null) : value;
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Reads
 * ------------------------------------------------------------------ */

async function loadParts(id: number) {
  const [row] = await db.select().from(leaseQuotes).where(eq(leaseQuotes.id, id));
  if (!row) return null;
  const variants = await db.select().from(leaseQuoteVariants).where(eq(leaseQuoteVariants.quoteId, id)).orderBy(leaseQuoteVariants.position, leaseQuoteVariants.id);
  const files = await db.select().from(leaseQuoteFiles).where(eq(leaseQuoteFiles.quoteId, id)).orderBy(leaseQuoteFiles.id);
  let customerName: string | null = null;
  if (row.customerId) {
    const [c] = await db.select({ name: customerDisplayName() }).from(customers).where(eq(customers.id, row.customerId));
    customerName = c?.name ?? null;
  }
  return { row, variants, files, customerName };
}

export async function getLeaseQuote(id: number): Promise<SerializedQuote | null> {
  const parts = await loadParts(id);
  return parts ? serializeQuote(parts.row, parts.variants, parts.files, parts.customerName) : null;
}

export interface LeaseQuoteListRow {
  id: number; quoteNumber: string; quoteDate: string; validUntil: string; status: string; displayStatus: string;
  customerName: string | null; vehicle: string; licensePlate: string | null; monthlyPrice: number | null;
}

const normalizePlate = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");

export const LEASE_QUOTE_SORT_KEYS = ["quoteNumber", "quoteDate", "customerName", "vehicle", "monthlyPrice", "status", "validUntil"] as const;
export type LeaseQuoteSortKey = (typeof LEASE_QUOTE_SORT_KEYS)[number];

export async function listLeaseQuotes(opts: { search?: string; status?: string; page?: number; pageSize?: number; sort?: string; dir?: string }): Promise<{ rows: LeaseQuoteListRow[]; total: number }> {
  const today = isoToday();
  const page = Math.max(1, Math.floor(opts.page ?? 1) || 1);
  const pageSize = Math.min(200, Math.max(1, Math.floor(opts.pageSize ?? 25) || 25));
  const conditions: SQL[] = [];

  const search = (opts.search ?? "").trim();
  if (search) {
    const like = `%${search.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    const parts: SQL[] = [
      sql`${leaseQuotes.quoteNumber} ilike ${like}`,
      sql`${customerDisplayName()} ilike ${like}`,
      sql`${leaseQuotes.prospectName} ilike ${like}`,
      sql`${leaseQuotes.prospectCompany} ilike ${like}`,
      sql`${leaseQuotes.vehicleMake} ilike ${like}`,
      sql`${leaseQuotes.vehicleModel} ilike ${like}`,
      sql`${leaseQuotes.licensePlate} ilike ${like}`,
    ];
    const plate = normalizePlate(search);
    if (plate) parts.push(sql`upper(regexp_replace(coalesce(${leaseQuotes.licensePlate}, ''), '[^A-Za-z0-9]', '', 'g')) like ${`%${plate}%`}`);
    conditions.push(or(...parts)!);
  }

  const status = opts.status;
  if (status === "expired") {
    conditions.push(inArray(leaseQuotes.status, ["concept", "sent"]), lt(leaseQuotes.validUntil, today));
  } else if (status === "concept" || status === "sent") {
    // Matches displayStatus(): an overdue concept/sent quote shows as expired, not as itself.
    conditions.push(eq(leaseQuotes.status, status), gte(leaseQuotes.validUntil, today));
  } else if (status && (LEASE_QUOTE_STATUSES as readonly string[]).includes(status)) {
    conditions.push(eq(leaseQuotes.status, status));
  }
  const where = conditions.length ? and(...conditions) : undefined;

  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` })
    .from(leaseQuotes).leftJoin(customers, eq(leaseQuotes.customerId, customers.id)).where(where);

  const monthlyPriceSql = sql<string | null>`(select v.total_per_month from lease_quote_variants v where v.quote_id = ${leaseQuotes.id} and v.is_chosen order by v.position, v.id limit 1)`;
  // Allowlisted sort; anything else falls back to newest first. The id is always the tiebreak so paging is stable.
  const sortKey = (LEASE_QUOTE_SORT_KEYS as readonly string[]).includes(opts.sort ?? "") ? (opts.sort as LeaseQuoteSortKey) : null;
  const dirFn = opts.dir === "asc" ? asc : desc;
  const sortExpr: Record<LeaseQuoteSortKey, SQL> = {
    quoteNumber: sql`${leaseQuotes.quoteNumber}`,
    quoteDate: sql`${leaseQuotes.quoteDate}`,
    customerName: sql`lower(coalesce(${customerDisplayName()}, ${leaseQuotes.prospectCompany}, ${leaseQuotes.prospectName}, ''))`,
    vehicle: sql`lower(concat_ws(' ', ${leaseQuotes.vehicleMake}, ${leaseQuotes.vehicleModel}, ${leaseQuotes.vehicleTrim}))`,
    monthlyPrice: sql`${monthlyPriceSql}`,
    status: sql`${leaseQuotes.status}`,
    validUntil: sql`${leaseQuotes.validUntil}`,
  };
  const orderBy: SQL[] = sortKey
    ? [sortKey === "monthlyPrice" ? sql`${dirFn(sortExpr.monthlyPrice)} nulls last` : dirFn(sortExpr[sortKey]), desc(leaseQuotes.id)]
    : [desc(leaseQuotes.quoteDate), desc(leaseQuotes.id)];

  const rows = await db.select({
    q: leaseQuotes,
    customerName: customerDisplayName(),
    monthlyPrice: monthlyPriceSql,
  })
    .from(leaseQuotes).leftJoin(customers, eq(leaseQuotes.customerId, customers.id))
    .where(where)
    .orderBy(...orderBy)
    .limit(pageSize).offset((page - 1) * pageSize);

  return {
    total: count,
    rows: rows.map(({ q, customerName, monthlyPrice }) => ({
      id: q.id,
      quoteNumber: q.quoteNumber,
      quoteDate: q.quoteDate,
      validUntil: q.validUntil,
      status: q.status ?? "concept",
      displayStatus: displayStatus(q.status ?? "concept", q.validUntil, today),
      customerName: customerName || q.prospectCompany || q.prospectName || null,
      vehicle: [q.vehicleMake, q.vehicleModel, q.vehicleTrim].filter(Boolean).join(" "),
      licensePlate: q.licensePlate ?? null,
      monthlyPrice: toNum(monthlyPrice),
    })),
  };
}

/* ------------------------------------------------------------------ *
 * Writes
 * ------------------------------------------------------------------ */

export const DEFAULT_VARIANT: VariantInput = { termMonths: 48, kmPerYear: 20000, residualValue: 0, isChosen: true };

/**
 * Creates a concept quote. Settings are copied in (later settings changes never alter it),
 * quoteDate defaults to the office date, validUntil to quoteDate + validityDays.
 */
export async function createLeaseQuote(payload: Partial<LeaseQuotePayload>, actor: string | null): Promise<SerializedQuote> {
  const settings = serializeSettings(await getSettingsRow());
  // The number is fixed here; moving quoteDate to another year later does not renumber the quote.
  const quoteDate = payload.quoteDate ?? isoToday();
  const variants = payload.variants?.length ? payload.variants : [DEFAULT_VARIANT];
  const id = await db.transaction(async (tx) => {
    const quoteNumber = await allocateQuoteNumber(tx, quoteDate);
    const [row] = await tx.insert(leaseQuotes).values({
      interestRatePercent: String(settings.interestRatePercent),
      robPerYear: String(settings.robPerYear),
      otherCostsPerYear: String(settings.otherCostsPerYear),
      marginPerMonth: String(settings.marginPerMonth),
      excessKmPrice: String(settings.excessKmPrice),
      shortfallKmPrice: String(settings.shortfallKmPrice),
      ...payloadColumns(payload),
      quoteNumber,
      status: payload.status ?? "concept",
      quoteDate,
      validUntil: payload.validUntil ?? addDaysIso(quoteDate, settings.validityDays),
      createdBy: actor,
      updatedBy: actor,
    }).returning();
    await writeVariants(tx, row, variants);
    return row.id;
  });
  return (await getLeaseQuote(id))!;
}

/**
 * Replaces the quote's fields (undefined keys stay, null clears) and its variant list.
 * Every variant total is recalculated here; a total sent by the client is never read.
 * Returns null when the quote does not exist.
 */
export async function updateLeaseQuote(id: number, payload: LeaseQuotePayload, actor: string | null): Promise<SerializedQuote | null> {
  const found = await db.transaction(async (tx) => {
    const [existing] = await tx.select().from(leaseQuotes).where(eq(leaseQuotes.id, id)).for("update");
    if (!existing) return false;
    const [row] = await tx.update(leaseQuotes)
      .set({ ...payloadColumns(payload), updatedAt: new Date(), updatedBy: actor })
      .where(eq(leaseQuotes.id, id)).returning();
    await writeVariants(tx, row, payload.variants);
    return true;
  });
  return found ? getLeaseQuote(id) : null;
}

/** Where a quote's files live below the uploads folder (Task 4 uses the same convention). */
export const quoteFilesFolder = (quoteId: number) => `lease-quotes/${quoteId}`;

/**
 * Copies a quote: new number, concept, today, new validUntil; fields and variants as they are.
 * With `withAttachments` the dealer files are copied to new files below the new quote's folder;
 * generated files are never copied.
 */
export async function copyLeaseQuote(id: number, withAttachments: boolean, actor: string | null): Promise<SerializedQuote | null> {
  const parts = await loadParts(id);
  if (!parts) return null;
  const settings = serializeSettings(await getSettingsRow());
  const today = isoToday();
  const { row: src, variants } = parts;
  const copiedPaths: string[] = [];
  let newId: number;
  try {
    newId = await db.transaction(async (tx) => {
      const quoteNumber = await allocateQuoteNumber(tx, today);
      const { id: _id, createdAt: _c, updatedAt: _u, ...fields } = src;
      const [row] = await tx.insert(leaseQuotes).values({
        ...fields,
        quoteNumber,
        status: "concept",
        quoteDate: today,
        validUntil: addDaysIso(today, settings.validityDays),
        createdBy: actor,
        updatedBy: actor,
      }).returning();
      await writeVariants(tx, row, variants.map((v) => ({
        termMonths: v.termMonths, kmPerYear: v.kmPerYear, residualValue: Number(v.residualValue), isChosen: !!v.isChosen,
      })));
      if (withAttachments) {
        const dealerFiles = parts.files.filter((f) => f.kind === "dealer");
        for (const file of dealerFiles) {
          const from = assertWithinUploads(path.join(getUploadsDir(), file.filePath), "lease quote file");
          if (!fs.existsSync(from)) {
            console.warn(`[lease-quotes] dealer file missing on disk, not copied: ${file.filePath} (quote ${id})`);
            continue;
          }
          const safeName = path.basename(file.fileName).replace(/[^\w.\- ]/g, "_") || "file";
          const relative = `${quoteFilesFolder(row.id)}/${Date.now()}-${file.id}-${safeName}`;
          const to = assertWithinUploads(path.join(getUploadsDir(), relative), "lease quote file");
          fs.mkdirSync(path.dirname(to), { recursive: true });
          fs.copyFileSync(from, to);
          copiedPaths.push(to);
          await tx.insert(leaseQuoteFiles).values({
            quoteId: row.id, kind: "dealer", fileName: file.fileName, filePath: relative,
            fileSize: file.fileSize, contentType: file.contentType, createdBy: actor,
          });
        }
      }
      return row.id;
    });
  } catch (error) {
    // The transaction rolled back; do not leave its copied files behind.
    for (const p of copiedPaths) fs.rmSync(p, { force: true });
    throw error;
  }
  // Read after the try: a failing read must never delete files that committed rows point to.
  return getLeaseQuote(newId);
}

/**
 * Deletes a quote: snapshot (quote, variants, file rows) into the recycle bin, then delete.
 * Files stay on disk until the bin row is purged. Returns null when the quote does not exist.
 */
export async function deleteLeaseQuote(id: number, actor: { username: string | null; userId: number | null }): Promise<{ quoteNumber: string } | null> {
  return db.transaction(async (tx) => {
    const [quote] = await tx.select().from(leaseQuotes).where(eq(leaseQuotes.id, id)).for("update");
    if (!quote) return null;
    const variants = await tx.select().from(leaseQuoteVariants).where(eq(leaseQuoteVariants.quoteId, id)).orderBy(leaseQuoteVariants.position, leaseQuoteVariants.id);
    const files = await tx.select().from(leaseQuoteFiles).where(eq(leaseQuoteFiles.quoteId, id)).orderBy(leaseQuoteFiles.id);
    const who = quote.customerId
      ? (await tx.select({ name: customerDisplayName() }).from(customers).where(eq(customers.id, quote.customerId)))[0]?.name
      : null;
    const customerLabel = who || quote.prospectCompany || quote.prospectName || "";
    await tx.insert(deletedRecords).values({
      entityType: "lease_quote",
      entityId: id,
      label: customerLabel ? `${quote.quoteNumber} · ${customerLabel}` : quote.quoteNumber,
      payload: { quote, variants, files },
      relatedCounts: { variants: variants.length, files: files.length },
      deletedBy: actor.username,
      deletedByUserId: actor.userId,
    });
    await tx.delete(leaseQuotes).where(eq(leaseQuotes.id, id));
    return { quoteNumber: quote.quoteNumber };
  });
}
