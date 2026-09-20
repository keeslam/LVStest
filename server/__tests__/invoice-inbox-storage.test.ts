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

  /**
   * I1: mailparser keeps the NUL from `Subject: =?utf-8?Q?x=00?=`, and
   * PostgreSQL refuses it in text and in jsonb — so every write for such a mail
   * threw, the mail stayed unseen and was rescanned (and re-billed) every run.
   */
  it("strips control characters PostgreSQL refuses, in the columns and inside parsed", async () => {
    const hash = `hash-${unique()}`;
    const item = await inboxStorage.create({
      attachmentHash: hash,
      subject: "Factuur\u0000 2026\u0007",
      fromAddress: "a\u0000@b.nl",
      status: "review",
      createdBy: INBOX_TEST_ACTOR,
      parsed: {
        vendor: "Gar\u0000age", invoiceNumber: "F-\u00011", invoiceDate: "2026-09-10", currency: "EUR", totalAmount: 10,
        lineItems: [{ description: "Grote\u0000 beurt", amount: 10, category: "Maintenance" }],
        plates: ["PT\u0000IB01"],
      } as any,
    });
    expect(item.subject).toBe("Factuur 2026");
    expect(item.fromAddress).toBe("a@b.nl");
    expect(item.parsed?.vendor).toBe("Garage");
    expect(item.parsed?.invoiceNumber).toBe("F-1");
    expect(item.parsed?.lineItems[0].description).toBe("Grote beurt");
    expect(item.parsed?.plates).toEqual(["PTIB01"]);

    const updated = await inboxStorage.update(item.id, { errorMessage: "fout\u0000melding", note: "regel\u000Bbreuk" });
    expect(updated?.errorMessage).toBe("foutmelding");
    expect(updated?.note).toBe("regelbreuk");
  });

  it("keeps the whitespace a person typed: tab, newline and carriage return survive", async () => {
    const item = await inboxStorage.create({
      attachmentHash: `hash-${unique()}`, status: "review", createdBy: INBOX_TEST_ACTOR,
      note: "eerste regel\ntweede\tregel",
    });
    expect(item.note).toBe("eerste regel\ntweede\tregel");
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

  /**
   * I7: the invoice hash needs vendor, number, date and total to match exactly,
   * and the vendor is whatever the model spelled — "Jansen" one time, "Jansen
   * B.V." the next. Number plus total catches that pair.
   */
  it("finds an active item by invoice number and total, however the vendor was spelled", async () => {
    const number = `DUP-${unique()}`;
    const parsed = (over: Record<string, unknown>) => ({
      vendor: "Jansen", invoiceNumber: number, invoiceDate: "2026-09-10", currency: "EUR",
      totalAmount: 181.5, lineItems: [], ...over,
    }) as any;

    const first = await inboxStorage.create({ attachmentHash: `hash-${unique()}`, status: "booked", parsed: parsed({}), createdBy: INBOX_TEST_ACTOR });
    expect((await inboxStorage.findActiveByNumberAndTotal(number, 18150))?.id).toBe(first.id);
    // Written with spaces and in lower case: normalised on both sides.
    expect((await inboxStorage.findActiveByNumberAndTotal(number, 18150))?.parsed?.vendor).toBe("Jansen");
    expect(await inboxStorage.findActiveByNumberAndTotal(number, 18151)).toBeUndefined();
    expect(await inboxStorage.findActiveByNumberAndTotal(`${number}X`, 18150)).toBeUndefined();
    expect(await inboxStorage.findActiveByNumberAndTotal(number, 18150, first.id)).toBeUndefined();

    // A dismissed item does not stand in the way of a new one.
    await inboxStorage.update(first.id, { status: "dismissed" });
    expect(await inboxStorage.findActiveByNumberAndTotal(number, 18150)).toBeUndefined();

    // A total the model wrote as text is not a number: no false duplicate.
    await inboxStorage.create({ attachmentHash: `hash-${unique()}`, status: "review", parsed: parsed({ totalAmount: "181,50" }), createdBy: INBOX_TEST_ACTOR });
    expect(await inboxStorage.findActiveByNumberAndTotal(number, 18150)).toBeUndefined();
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

  /**
   * M5/M6: the manifest that bootstraps a fresh database carries columns, not
   * indexes, so both of these have to come from startup-migration.js. Without
   * the UNIQUE one, "an attachment is processed once" silently stops holding.
   */
  it("has the index on expenses.inbox_item_id and exactly one unique index on attachment_hash", async () => {
    const expensesIndex = await db.execute(sql`SELECT 1 FROM pg_indexes WHERE indexname = 'expenses_inbox_item_id_idx'`);
    expect(expensesIndex.rows).toHaveLength(1);

    // Exactly one: the table DDL already gives attachment_hash a UNIQUE
    // constraint, so the migration's own index must not be a second copy of it.
    const unique = await db.execute(sql`
      SELECT c.relname AS indexname
      FROM pg_index i
      JOIN pg_class c ON c.oid = i.indexrelid
      JOIN pg_class t ON t.oid = i.indrelid
      JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = i.indkey[0]
      WHERE t.relname = 'invoice_inbox_items' AND i.indisunique AND i.indnatts = 1 AND a.attname = 'attachment_hash'
    `);
    expect(unique.rows).toHaveLength(1);
  });

  /**
   * The manifest that bootstraps a fresh database only adds columns to tables
   * that are already there, so the run log's table comes from the explicit
   * block in startup-migration.js — index included, and exactly once however
   * often the migration runs.
   */
  it("has the table and the single started_at index of the run log", async () => {
    const table = await db.execute(sql`SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'invoice_inbox_runs'`);
    expect(table.rows).toHaveLength(1);

    const index = await db.execute(sql`SELECT 1 FROM pg_indexes WHERE tablename = 'invoice_inbox_runs' AND indexname = 'invoice_inbox_runs_started_at_idx'`);
    expect(index.rows).toHaveLength(1);
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
