import { and, count, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { db } from "../../db";
import { expenses, invoiceInboxItems, vehicles, type InvoiceInboxItem } from "../../../shared/schema";
import type { InboxStatus } from "../../../shared/invoice-inbox";

export type InboxItemWithVehicle = InvoiceInboxItem & { vehiclePlate: string | null };

const ACTIVE: InboxStatus[] = ["booked", "review"];

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
  async countByStatus(status: InboxStatus): Promise<number> {
    const [row] = await db.select({ n: count() }).from(invoiceInboxItems).where(eq(invoiceInboxItems.status, status));
    return Number(row?.n ?? 0);
  },
  async create(data: typeof invoiceInboxItems.$inferInsert): Promise<InvoiceInboxItem> {
    const [row] = await db.insert(invoiceInboxItems).values(data).returning();
    return row;
  },
  async update(id: number, patch: Partial<typeof invoiceInboxItems.$inferInsert>): Promise<InvoiceInboxItem | undefined> {
    const [row] = await db.update(invoiceInboxItems).set(patch).where(eq(invoiceInboxItems.id, id)).returning();
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
