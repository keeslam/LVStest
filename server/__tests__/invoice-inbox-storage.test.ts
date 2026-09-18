import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "../db";
import { expenses, invoiceInboxItems } from "../../shared/schema";
import { inboxStorage } from "../services/invoice-inbox/inbox-storage";
import { createTestVehicle, cleanupPortalTestData } from "./portal-helpers";
import { cleanupInboxTestData, INBOX_TEST_ACTOR } from "./invoice-inbox-helpers";

const unique = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;

describe("invoice inbox storage", () => {
  let vehicleId: number;

  beforeAll(async () => {
    await cleanupInboxTestData();
    await cleanupPortalTestData();
    vehicleId = (await createTestVehicle("PT-IB-01")).id;
    await createTestVehicle("PTIB02");
  });
  afterAll(async () => {
    await cleanupInboxTestData();
    await cleanupPortalTestData();
  });

  it("creates an item with defaults and finds it by attachment hash", async () => {
    const hash = `hash-${unique()}`;
    const item = await inboxStorage.create({ attachmentHash: hash, fromAddress: "a@b.nl", subject: "Factuur", status: "review", reviewReason: "no_plate", createdBy: INBOX_TEST_ACTOR });
    expect(item.id).toBeGreaterThan(0);
    expect(item.expenseIds).toEqual([]);
    expect(item.receivedAt).toBeInstanceOf(Date);
    expect((await inboxStorage.getByAttachmentHash(hash))?.id).toBe(item.id);
    expect((await inboxStorage.get(item.id))?.subject).toBe("Factuur");
  });

  it("refuses a second item with the same attachment hash", async () => {
    const hash = `hash-${unique()}`;
    await inboxStorage.create({ attachmentHash: hash, status: "review", createdBy: INBOX_TEST_ACTOR });
    await expect(inboxStorage.create({ attachmentHash: hash, status: "review", createdBy: INBOX_TEST_ACTOR })).rejects.toThrow();
  });

  it("treats booked and waiting items as active for the duplicate check, dismissed ones not", async () => {
    const invoiceHash = `inv-${unique()}`;
    const dismissed = await inboxStorage.create({ attachmentHash: `hash-${unique()}`, invoiceHash, status: "dismissed", createdBy: INBOX_TEST_ACTOR });
    expect(await inboxStorage.findActiveByInvoiceHash(invoiceHash)).toBeUndefined();
    const waiting = await inboxStorage.create({ attachmentHash: `hash-${unique()}`, invoiceHash, status: "review", createdBy: INBOX_TEST_ACTOR });
    expect((await inboxStorage.findActiveByInvoiceHash(invoiceHash))?.id).toBe(waiting.id);
    expect(await inboxStorage.findActiveByInvoiceHash(invoiceHash, waiting.id)).toBeUndefined();
    expect(dismissed.id).not.toBe(waiting.id);
  });

  it("updates an item and lists it per status with the vehicle plate", async () => {
    const item = await inboxStorage.create({ attachmentHash: `hash-${unique()}`, status: "review", createdBy: INBOX_TEST_ACTOR });
    const before = await inboxStorage.countByStatus("booked");
    const updated = await inboxStorage.update(item.id, { status: "booked", reviewReason: null, vehicleId, expenseIds: [1, 2], processedAt: new Date(), updatedBy: INBOX_TEST_ACTOR });
    expect(updated).toMatchObject({ status: "booked", vehicleId, expenseIds: [1, 2] });
    expect(await inboxStorage.countByStatus("booked")).toBe(before + 1);
    const listed = (await inboxStorage.list({ status: "booked", limit: 200 })).find((i) => i.id === item.id);
    expect(listed?.vehiclePlate).toBe("PT-IB-01");
  });

  it("finds fleet vehicles by normalised plate, whatever way the plate is stored", async () => {
    const found = await inboxStorage.findVehiclesByPlates(["PTIB01", "PTIB02", "ZZ999Z"]);
    expect(found.map((v) => v.licensePlate).sort()).toEqual(["PT-IB-01", "PTIB02"]);
    expect(await inboxStorage.findVehiclesByPlates([])).toEqual([]);
  });

  it("lists the expense ids booked from an item, in order; none for an item without expenses", async () => {
    const item = await inboxStorage.create({ attachmentHash: `hash-${unique()}`, status: "review", createdBy: INBOX_TEST_ACTOR });
    expect(await inboxStorage.expenseIdsFor(item.id)).toEqual([]);
    const [e1] = await db.insert(expenses).values({ vehicleId, category: "Maintenance", amount: "10.00", date: "2026-09-18", inboxItemId: item.id }).returning();
    const [e2] = await db.insert(expenses).values({ vehicleId, category: "Brakes", amount: "20.00", date: "2026-09-18", inboxItemId: item.id }).returning();
    expect(await inboxStorage.expenseIdsFor(item.id)).toEqual([e1.id, e2.id]);
  });

  it("has the named foreign key from expenses.inbox_item_id to invoice_inbox_items, which sets it null when the item is deleted", async () => {
    const constraint = await db.execute(sql`SELECT 1 FROM pg_constraint WHERE conname = 'expenses_inbox_item_id_invoice_inbox_items_id_fk'`);
    expect(constraint.rows).toHaveLength(1);

    const item = await inboxStorage.create({ attachmentHash: `hash-${unique()}`, status: "review", createdBy: INBOX_TEST_ACTOR });
    const [expense] = await db.insert(expenses).values({
      vehicleId,
      category: "fuel",
      amount: "10.00",
      date: "2026-09-18",
      inboxItemId: item.id,
    }).returning();
    expect(expense.inboxItemId).toBe(item.id);

    await db.delete(invoiceInboxItems).where(eq(invoiceInboxItems.id, item.id));

    const [after] = await db.select().from(expenses).where(eq(expenses.id, expense.id));
    expect(after.inboxItemId).toBeNull();
  });
});
