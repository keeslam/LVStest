import { and, count, desc, eq, ilike, inArray, isNull, ne, notInArray, or, sql, type SQL } from "drizzle-orm";
import { db } from "../../db";
import { expenses, invoiceInboxItems, vehicles, type InvoiceInboxItem } from "../../../shared/schema";
import type { InboxLogRow, InboxStatus, ReviewReason } from "../../../shared/invoice-inbox";

export type InboxItemWithVehicle = InvoiceInboxItem & { vehiclePlate: string | null };

const ACTIVE: InboxStatus[] = ["booked", "review"];

/** Mail the app found no invoice in; every other row is an invoice it looked at. */
const OTHER_REASONS: ReviewReason[] = ["no_attachment", "not_invoice"];
/** The owner types this by hand; a search that walks the whole table is bounded. */
const MAX_SEARCH_LENGTH = 100;

/**
 * PostgreSQL's LIKE escape character is the backslash, so escaping with it is
 * what makes `%`, `_` and `\` in a search text match themselves. The text goes
 * on as a bound parameter either way.
 */
const escapeLike = (text: string) => text.replace(/[\\%_]/g, (ch) => `\\${ch}`);

/** What the log shows of one mail — never the stored file, the hashes or the scan. */
function toLogRow(item: InvoiceInboxItem, vehiclePlate: string | null): InboxLogRow {
  const total = item.parsed?.totalAmount;
  return {
    id: item.id,
    receivedAt: item.receivedAt.toISOString(),
    mailDate: item.mailDate?.toISOString() ?? null,
    fromAddress: item.fromAddress,
    subject: item.subject,
    attachmentName: item.attachmentName,
    status: item.status as InboxStatus,
    reviewReason: (item.reviewReason as ReviewReason | null) ?? null,
    errorMessage: item.errorMessage,
    vehiclePlate,
    vendor: item.parsed?.vendor ?? null,
    invoiceNumber: item.parsed?.invoiceNumber ?? null,
    // A model that wrote "181,50" as text leaves no amount to show.
    totalAmount: typeof total === "number" && Number.isFinite(total) ? total : null,
    hasFile: Boolean(item.attachmentPath),
    expenseIds: item.expenseIds ?? [],
  };
}

/**
 * I1 — anyone can mail this address, and mailparser hands the subject on as it
 * decoded it: `Subject: =?utf-8?Q?x=00?=` keeps its NUL. PostgreSQL refuses a
 * NUL in text *and* in jsonb, so every write for such a mail threw — the mail
 * stayed unseen and was fetched and rescanned (at Gemini's expense) on every
 * run, with 25 of them enough to stop the feature. C0 control characters are
 * stripped here, in the one place every writer passes through; tab, newline and
 * carriage return are what a person types, so they stay.
 *
 * Exported because the run log writes mail subjects too, and has the same
 * problem for the same reason.
 */
export const CONTROL_CHARACTERS =/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g;

function sanitize<T>(value: T): T {
  if (typeof value === "string") return value.replace(CONTROL_CHARACTERS, "") as unknown as T;
  if (Array.isArray(value)) return value.map((entry) => sanitize(entry)) as unknown as T;
  // Date, Buffer and the like are values, not trees to walk.
  if (value === null || typeof value !== "object" || Object.getPrototypeOf(value) !== Object.prototype) return value;
  const out: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) out[key] = sanitize(entry);
  return out as unknown as T;
}

export const inboxStorage = {
  async getByAttachmentHash(hash: string): Promise<InvoiceInboxItem | undefined> {
    const [row] = await db.select().from(invoiceInboxItems).where(eq(invoiceInboxItems.attachmentHash, hash)).limit(1);
    return row;
  },
  async get(id: number): Promise<InvoiceInboxItem | undefined> {
    const [row] = await db.select().from(invoiceInboxItems).where(eq(invoiceInboxItems.id, id));
    return row;
  },
  /** A booked or waiting item with this invoice hash; dismissed items do not count. */
  async findActiveByInvoiceHash(invoiceHash: string, excludeId?: number): Promise<InvoiceInboxItem | undefined> {
    const conditions = [eq(invoiceInboxItems.invoiceHash, invoiceHash), inArray(invoiceInboxItems.status, ACTIVE)];
    if (excludeId !== undefined) conditions.push(ne(invoiceInboxItems.id, excludeId));
    const [row] = await db.select().from(invoiceInboxItems).where(and(...conditions)).orderBy(invoiceInboxItems.id).limit(1);
    return row;
  },
  /**
   * I7 — the same invoice arriving twice does not always hash the same: the
   * invoice hash needs vendor, number, date and total to match exactly, and the
   * vendor is whatever the model spelled ("Jansen" one time, "Jansen B.V." the
   * next). Invoice number plus total, both normalised, catches that pair.
   *
   * `totalAmount` has to be a JSON number: a model that wrote "181,50" as text
   * would otherwise blow up the cast, and two unrelated invoices whose totals do
   * not parse must not look identical.
   */
  async findActiveByNumberAndTotal(invoiceNumber: string, totalCents: number, excludeId?: number): Promise<InvoiceInboxItem | undefined> {
    const number = String(invoiceNumber ?? "").replace(/\s+/g, "").toUpperCase();
    if (!number || !Number.isFinite(totalCents)) return undefined;
    const conditions = [
      inArray(invoiceInboxItems.status, ACTIVE),
      sql`upper(regexp_replace(${invoiceInboxItems.parsed}->>'invoiceNumber', '\\s', '', 'g')) = ${number}`,
      sql`jsonb_typeof(${invoiceInboxItems.parsed}->'totalAmount') = 'number'`,
      sql`round((${invoiceInboxItems.parsed}->>'totalAmount')::numeric * 100) = ${Math.round(totalCents)}`,
    ];
    if (excludeId !== undefined) conditions.push(ne(invoiceInboxItems.id, excludeId));
    const [row] = await db.select().from(invoiceInboxItems).where(and(...conditions)).orderBy(invoiceInboxItems.id).limit(1);
    return row;
  },
  async list(opts: { status: InboxStatus; limit?: number; offset?: number }): Promise<InboxItemWithVehicle[]> {
    const rows = await db
      .select({ item: invoiceInboxItems, vehiclePlate: vehicles.licensePlate })
      .from(invoiceInboxItems)
      .leftJoin(vehicles, eq(invoiceInboxItems.vehicleId, vehicles.id))
      .where(eq(invoiceInboxItems.status, opts.status))
      .orderBy(desc(invoiceInboxItems.receivedAt), desc(invoiceInboxItems.id))
      .limit(Math.min(Math.max(opts.limit ?? 50, 1), 200))
      .offset(Math.max(opts.offset ?? 0, 0));
    return rows.map((r) => ({ ...r.item, vehiclePlate: r.vehiclePlate ?? null }));
  },
  /**
   * The read-only log behind the "Logboek" button: the fetched invoices or the
   * mail that held none, newest first, searched on the server because the log
   * grows without bound.
   */
  async searchLog(opts: { kind: "invoices" | "other"; q?: string; status?: InboxStatus; limit?: number; offset?: number }): Promise<{ items: InboxLogRow[]; total: number }> {
    const conditions: SQL[] = [
      opts.kind === "other"
        ? inArray(invoiceInboxItems.reviewReason, OTHER_REASONS)
        // A row without a reason is an invoice too, and NOT IN says nothing about NULL.
        : or(isNull(invoiceInboxItems.reviewReason), notInArray(invoiceInboxItems.reviewReason, OTHER_REASONS))!,
    ];
    if (opts.status) conditions.push(eq(invoiceInboxItems.status, opts.status));

    const q = String(opts.q ?? "").trim().slice(0, MAX_SEARCH_LENGTH);
    if (q) {
      const like = `%${escapeLike(q)}%`;
      const matches = [
        ilike(invoiceInboxItems.fromAddress, like),
        ilike(invoiceInboxItems.subject, like),
        ilike(invoiceInboxItems.attachmentName, like),
        ilike(invoiceInboxItems.errorMessage, like),
        sql`${invoiceInboxItems.parsed}->>'vendor' ILIKE ${like}`,
        sql`${invoiceInboxItems.parsed}->>'invoiceNumber' ILIKE ${like}`,
      ];
      // Plates are written both ways across the fleet, so both sides drop their
      // dashes and spaces. Text that is nothing else would leave "%%", which
      // would put every mail with a vehicle in the answer.
      const plate = q.replace(/[\s-]/g, "");
      if (plate) matches.push(sql`regexp_replace(${vehicles.licensePlate}, '[\\s-]', '', 'g') ILIKE ${`%${escapeLike(plate)}%`}`);
      conditions.push(or(...matches)!);
    }

    const where = and(...conditions);
    const rows = await db
      .select({ item: invoiceInboxItems, vehiclePlate: vehicles.licensePlate })
      .from(invoiceInboxItems)
      .leftJoin(vehicles, eq(invoiceInboxItems.vehicleId, vehicles.id))
      .where(where)
      .orderBy(desc(invoiceInboxItems.receivedAt), desc(invoiceInboxItems.id))
      .limit(Math.min(Math.max(opts.limit ?? 50, 1), 200))
      .offset(Math.max(opts.offset ?? 0, 0));
    // The same join, or the plate condition would have nothing to count against.
    const [total] = await db
      .select({ n: count() })
      .from(invoiceInboxItems)
      .leftJoin(vehicles, eq(invoiceInboxItems.vehicleId, vehicles.id))
      .where(where);

    return { items: rows.map((r) => toLogRow(r.item, r.vehiclePlate ?? null)), total: Number(total?.n ?? 0) };
  },
  async countByStatus(status: InboxStatus): Promise<number> {
    const [row] = await db.select({ n: count() }).from(invoiceInboxItems).where(eq(invoiceInboxItems.status, status));
    return Number(row?.n ?? 0);
  },
  async create(data: typeof invoiceInboxItems.$inferInsert): Promise<InvoiceInboxItem> {
    const [row] = await db.insert(invoiceInboxItems).values(sanitize(data)).returning();
    return row;
  },
  async update(id: number, patch: Partial<typeof invoiceInboxItems.$inferInsert>): Promise<InvoiceInboxItem | undefined> {
    const [row] = await db.update(invoiceInboxItems).set(sanitize(patch)).where(eq(invoiceInboxItems.id, id)).returning();
    return row;
  },
  /** Expenses already booked from this item, in creation order. */
  async expenseIdsFor(itemId: number): Promise<number[]> {
    const rows = await db.select({ id: expenses.id }).from(expenses).where(eq(expenses.inboxItemId, itemId)).orderBy(expenses.id);
    return rows.map((r) => r.id);
  },
  /** Plates are stored with and without dashes across the fleet, so both sides are normalised in SQL. */
  async findVehiclesByPlates(plates: string[]): Promise<Array<{ id: number; licensePlate: string; brand: string; model: string }>> {
    if (plates.length === 0) return [];
    return db
      .select({ id: vehicles.id, licensePlate: vehicles.licensePlate, brand: vehicles.brand, model: vehicles.model })
      .from(vehicles)
      .where(inArray(sql<string>`upper(regexp_replace(${vehicles.licensePlate}, '[^A-Za-z0-9]', '', 'g'))`, plates));
  },
};
