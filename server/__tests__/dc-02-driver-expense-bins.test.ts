/**
 * Sub-project D, package DC item 2 (besluit B-41 D8, approval B-42; spec
 * docs/superpowers/specs/2026-10-11-besluiten-d-design.md §5): drivers and expenses
 * each get a recycle bin, like the six kinds of sub-project C.
 *
 *  - deleting a driver / an expense = snapshot into `deleted_records` + hard delete in ONE
 *    transaction; the driver snapshot carries the SET-NULL links it blanked (`cascade.nulled`),
 *    the expense snapshot the inbox items that listed it;
 *  - restoring a driver needs its customer (409 CUSTOMER_MISSING otherwise), puts back the
 *    links whose rows still exist and only where the column is still empty;
 *  - restoring an expense puts `inbox_item_id` and the `invoice_inbox_items.expense_ids` entry
 *    back when the inbox item still exists, and says VEHICLE_MISSING (a warning, not a refusal)
 *    when its vehicle is gone (`expenses.vehicle_id` has no foreign key);
 *  - emptying the bin goes through the generic branch: the driver's licence copy and the
 *    expense's receipt are removed unless a live row (e.g. the inbox attachment) still uses them;
 *  - `GET /api/deleted-records?type=driver&customerId=` filters one customer's drivers;
 *  - `driver.delete` is audited with a label (drivers are a tracked resource).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs";
import path from "path";
import { and, eq, inArray, like } from "drizzle-orm";

import { useTempUploadsDir, removeTempUploadsDir } from "./helpers/uploads";

const UPLOADS = useTempUploadsDir("lvs-dc02-");

const { db } = await import("../db");
const {
  auditLogs, customers, deletedRecords, documents, drivers, expenses, fines, invoiceInboxItems, reservations, vehicles,
} = await import("../../shared/schema");
const { agentFor, cleanupFixtureUsers } = await import("./helpers/app");
const { createFixtureCustomer, createFixtureVehicle, createFixtureReservation, cleanupFixtures, FIXTURE_PREFIX } = await import("./helpers/fixtures");
type TestAgent = Awaited<ReturnType<typeof agentFor>>;

const ROW_PREFIX = `${FIXTURE_PREFIX}DC02-`;
let admin: TestAgent;
let binKeeper: TestAgent;
let customersOnly: TestAgent;
let expensesOnly: TestAgent;
let seq = 0;
const binRowIds: number[] = [];
const fineIds: number[] = [];
const inboxIds: number[] = [];
const documentIds: number[] = [];

const unique = (label: string) => `${label}-${Date.now().toString(36)}-${++seq}`;

function put(rel: string): string {
  const abs = path.join(UPLOADS, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, "bytes");
  return rel;
}
const onDisk = (rel: string) => fs.existsSync(path.join(UPLOADS, rel));

async function binRowFor(entityType: string, entityId: number) {
  const rows = await db.select().from(deletedRecords)
    .where(and(eq(deletedRecords.entityType, entityType), eq(deletedRecords.entityId, entityId)));
  const row = rows[rows.length - 1];
  if (row) binRowIds.push(row.id);
  return row;
}

async function newDriver(customerId: number, over: Partial<typeof drivers.$inferInsert> = {}) {
  const [row] = await db.insert(drivers).values({
    customerId, displayName: `${ROW_PREFIX}${unique("Chauffeur")}`, ...over,
  }).returning();
  return row;
}

async function newExpense(vehicleId: number, over: Partial<typeof expenses.$inferInsert> = {}) {
  const [row] = await db.insert(expenses).values({
    vehicleId, category: "fuel", amount: "45.50", date: "2026-10-01", description: `${ROW_PREFIX}${unique("kost")}`, ...over,
  }).returning();
  return row;
}

async function newInboxItem(over: Partial<typeof invoiceInboxItems.$inferInsert> = {}) {
  const [row] = await db.insert(invoiceInboxItems).values({
    attachmentHash: `${ROW_PREFIX}${unique("hash")}`, status: "booked", ...over,
  }).returning();
  inboxIds.push(row.id);
  return row;
}

const auditRows = async (action: string, resourceId: number) =>
  db.select().from(auditLogs).where(and(eq(auditLogs.action, action), eq(auditLogs.resourceId, String(resourceId))));

beforeAll(async () => {
  admin = await agentFor("admin");
  binKeeper = await agentFor(["manage_recycle_bin"]);
  customersOnly = await agentFor(["manage_customers", "view_customers"]);
  expensesOnly = await agentFor(["manage_expenses", "view_expenses"]);
}, 90_000);

afterAll(async () => {
  if (binRowIds.length) await db.delete(deletedRecords).where(inArray(deletedRecords.id, binRowIds));
  await db.delete(deletedRecords).where(like(deletedRecords.label, `%${ROW_PREFIX}%`));
  if (fineIds.length) await db.delete(fines).where(inArray(fines.id, fineIds));
  if (inboxIds.length) await db.delete(invoiceInboxItems).where(inArray(invoiceInboxItems.id, inboxIds));
  if (documentIds.length) await db.delete(documents).where(inArray(documents.id, documentIds));
  await db.delete(drivers).where(like(drivers.displayName, `${ROW_PREFIX}%`));
  await db.delete(expenses).where(like(expenses.description, `${ROW_PREFIX}%`));
  await cleanupFixtures();
  await cleanupFixtureUsers();
  removeTempUploadsDir(UPLOADS);
});

describe("D8 - drivers have a recycle bin", () => {
  it("delete = snapshot + hard delete: the bin row carries the driver and the links it blanked", async () => {
    const customer = await createFixtureCustomer("DC02a");
    const vehicle = await createFixtureVehicle();
    const driver = await newDriver(customer.id, { email: "chauffeur@fixture-test.invalid" });
    const reservation = await createFixtureReservation({ customerId: customer.id, vehicleId: vehicle.id });
    await db.update(reservations).set({ driverId: driver.id }).where(eq(reservations.id, reservation.id));
    const [fine] = await db.insert(fines).values({
      licensePlate: vehicle.licensePlate, offenceAt: new Date("2026-09-01T10:00:00Z"), description: "FIXT-DC02 fine",
      amount: "10.00", totalAmount: "10.00", driverId: driver.id,
    } as any).returning();
    fineIds.push(fine.id);

    const res = await customersOnly.delete(`/api/drivers/${driver.id}`);
    expect(res.status).toBe(200);

    // Hard-deleted, links blanked by the foreign keys...
    expect((await db.select().from(drivers).where(eq(drivers.id, driver.id)))).toHaveLength(0);
    expect((await db.select().from(reservations).where(eq(reservations.id, reservation.id)))[0].driverId).toBeNull();

    // ...and everything is in the bin.
    const bin = await binRowFor("driver", driver.id);
    expect(bin).toBeDefined();
    expect(bin.label).toContain(driver.displayName);
    expect((bin.payload as any).driver).toMatchObject({ id: driver.id, customerId: customer.id, displayName: driver.displayName });
    const nulled = (bin.payload as any).cascade.nulled as Array<{ table: string; column: string; id: number; value: number }>;
    expect(nulled).toEqual(expect.arrayContaining([
      expect.objectContaining({ table: "reservations", column: "driver_id", id: reservation.id, value: driver.id }),
      expect.objectContaining({ table: "fines", column: "driver_id", id: fine.id, value: driver.id }),
    ]));
    expect(bin.deletedBy).toBe(customersOnly.username);

    // The audit row names the driver (drivers are a tracked resource).
    const audit = await auditRows("driver.delete", driver.id);
    expect(audit).toHaveLength(1);
    expect(JSON.stringify(audit[0].details)).toContain(driver.displayName);
  });

  it("restore puts the driver back with its id and the links that are still empty, and audits driver.restore", async () => {
    const customer = await createFixtureCustomer("DC02b");
    const vehicle = await createFixtureVehicle();
    const driver = await newDriver(customer.id, { licenseExpiry: "2030-01-01" });
    const other = await newDriver(customer.id);
    const kept = await createFixtureReservation({ customerId: customer.id, vehicleId: vehicle.id });
    const reassigned = await createFixtureReservation({ customerId: customer.id, vehicleId: vehicle.id, startDate: "2026-11-01", endDate: "2026-11-03" });
    await db.update(reservations).set({ driverId: driver.id }).where(inArray(reservations.id, [kept.id, reassigned.id]));
    await customersOnly.delete(`/api/drivers/${driver.id}`);
    const bin = await binRowFor("driver", driver.id);
    // Someone gave one of the reservations to another driver in the meantime.
    await db.update(reservations).set({ driverId: other.id }).where(eq(reservations.id, reassigned.id));

    const res = await binKeeper.post(`/api/deleted-records/${bin.id}/restore`);
    expect(res.status).toBe(200);

    const [back] = await db.select().from(drivers).where(eq(drivers.id, driver.id));
    expect(back).toMatchObject({ id: driver.id, customerId: customer.id, displayName: driver.displayName, licenseExpiry: "2030-01-01" });
    expect(back.createdAt).toBeInstanceOf(Date);
    expect((await db.select().from(reservations).where(eq(reservations.id, kept.id)))[0].driverId).toBe(driver.id);
    // Not trampled: the column was no longer empty.
    expect((await db.select().from(reservations).where(eq(reservations.id, reassigned.id)))[0].driverId).toBe(other.id);

    expect((await db.select().from(deletedRecords).where(eq(deletedRecords.id, bin.id)))[0].restoredAt).not.toBeNull();
    expect(await auditRows("driver.restore", driver.id)).toHaveLength(1);
    // A second restore is refused.
    const again = await binKeeper.post(`/api/deleted-records/${bin.id}/restore`);
    expect(again.status).toBe(409);
    expect(again.body.code).toBe("ALREADY_RESTORED");
  });

  it("restore is refused with CUSTOMER_MISSING while the customer is gone; it works once the customer is back", async () => {
    const customer = await createFixtureCustomer("DC02c");
    const driver = await newDriver(customer.id);
    await customersOnly.delete(`/api/drivers/${driver.id}`);
    const bin = await binRowFor("driver", driver.id);

    // The customer is deleted for good (through the route: it lands in the customer bin).
    const del = await admin.delete(`/api/customers/${customer.id}`);
    expect([200, 204]).toContain(del.status);
    const customerBin = await binRowFor("customer", customer.id);
    expect(customerBin).toBeDefined();

    const refused = await binKeeper.post(`/api/deleted-records/${bin.id}/restore`);
    expect(refused.status).toBe(409);
    expect(refused.body.code).toBe("CUSTOMER_MISSING");
    expect((await db.select().from(deletedRecords).where(eq(deletedRecords.id, bin.id)))[0].restoredAt).toBeNull();
    expect((await db.select().from(drivers).where(eq(drivers.id, driver.id)))).toHaveLength(0);

    // Customer first, then the driver.
    expect((await binKeeper.post(`/api/deleted-records/${customerBin.id}/restore`)).status).toBe(200);
    expect((await binKeeper.post(`/api/deleted-records/${bin.id}/restore`)).status).toBe(200);
    expect((await db.select().from(drivers).where(eq(drivers.id, driver.id)))).toHaveLength(1);
  });

  it("restore drops a licence-document link whose document is gone, and refuses a taken id", async () => {
    const customer = await createFixtureCustomer("DC02d");
    const [doc] = await db.insert(documents).values({
      customerId: customer.id, documentType: "driver_license", fileName: `${ROW_PREFIX}licence.pdf`, fileSize: 10, contentType: "application/pdf", filePath: put(`dc02/licence-${unique("a")}.pdf`),
    } as any).returning();
    documentIds.push(doc.id);
    const driver = await newDriver(customer.id, { licenseDocumentId: doc.id });
    await customersOnly.delete(`/api/drivers/${driver.id}`);
    const bin = await binRowFor("driver", driver.id);
    await db.delete(documents).where(eq(documents.id, doc.id));

    // The id is taken first.
    await db.execute((await import("drizzle-orm")).sql`INSERT INTO drivers (id, customer_id, display_name) VALUES (${driver.id}, ${customer.id}, ${ROW_PREFIX + "squatter"})`);
    const taken = await binKeeper.post(`/api/deleted-records/${bin.id}/restore`);
    expect(taken.status).toBe(409);
    expect(taken.body.code).toBe("ID_TAKEN");
    await db.delete(drivers).where(eq(drivers.id, driver.id));

    const ok = await binKeeper.post(`/api/deleted-records/${bin.id}/restore`);
    expect(ok.status).toBe(200);
    const [back] = await db.select().from(drivers).where(eq(drivers.id, driver.id));
    expect(back.licenseDocumentId).toBeNull();
  });

  it("GET ?type=driver&customerId= lists only that customer's drivers; a bad filter is a 400", async () => {
    const a = await createFixtureCustomer("DC02e1");
    const b = await createFixtureCustomer("DC02e2");
    const da = await newDriver(a.id);
    const db_ = await newDriver(b.id);
    await customersOnly.delete(`/api/drivers/${da.id}`);
    await customersOnly.delete(`/api/drivers/${db_.id}`);
    await binRowFor("driver", da.id);
    await binRowFor("driver", db_.id);

    const all = await binKeeper.get("/api/deleted-records?type=driver");
    expect(all.status).toBe(200);
    expect(all.body.map((r: any) => r.entityId)).toEqual(expect.arrayContaining([da.id, db_.id]));

    const mine = await binKeeper.get(`/api/deleted-records?type=driver&customerId=${a.id}`);
    expect(mine.status).toBe(200);
    expect(mine.body.map((r: any) => r.entityId)).toEqual([da.id]);
    // The list never carries the payload.
    expect(mine.body[0].payload).toBeUndefined();

    expect((await binKeeper.get("/api/deleted-records?type=driver&customerId=abc")).status).toBe(400);
    const wrongKind = await binKeeper.get(`/api/deleted-records?type=fine&customerId=${a.id}`);
    expect(wrongKind.status).toBe(400);
    expect(wrongKind.body.code).toBe("INVALID_BIN_FILTER");
  });

  it("emptying the bin removes the licence copy; the bin needs manage_recycle_bin, deleting a driver does not", async () => {
    const customer = await createFixtureCustomer("DC02f");
    const rel = put(`dc02/licence-${unique("b")}.pdf`);
    const driver = await newDriver(customer.id, { licenseFilePath: rel });
    await customersOnly.delete(`/api/drivers/${driver.id}`);
    const bin = await binRowFor("driver", driver.id);

    // customersOnly deleted a driver but cannot see or empty the bin.
    expect((await customersOnly.get("/api/deleted-records?type=driver")).status).toBe(403);
    expect((await customersOnly.post("/api/deleted-records/purge").send({ ids: [bin.id] })).status).toBe(403);
    expect(onDisk(rel)).toBe(true);

    const purged = await binKeeper.post("/api/deleted-records/purge").send({ ids: [bin.id] });
    expect(purged.status).toBe(200);
    expect(purged.body).toEqual({ purged: 1, failed: [] });
    expect(onDisk(rel)).toBe(false);
    expect(await auditRows("driver.purge", driver.id)).toHaveLength(1);
  });
});

describe("D8 - expenses have a recycle bin", () => {
  it("delete = snapshot + hard delete: the bin row carries the expense and the inbox item that listed it", async () => {
    const vehicle = await createFixtureVehicle();
    const item = await newInboxItem();
    const expense = await newExpense(vehicle.id, { inboxItemId: item.id, receiptFilePath: put(`dc02/bon-${unique("a")}.pdf`) });
    await db.update(invoiceInboxItems).set({ expenseIds: [expense.id, 999999] }).where(eq(invoiceInboxItems.id, item.id));

    const res = await expensesOnly.delete(`/api/expenses/${expense.id}`);
    expect(res.status).toBe(200);
    expect((await db.select().from(expenses).where(eq(expenses.id, expense.id)))).toHaveLength(0);

    const bin = await binRowFor("expense", expense.id);
    expect(bin).toBeDefined();
    expect(bin.label).toContain(`Kostenpost #${expense.id}`);
    expect(bin.label).toContain(vehicle.licensePlate);
    expect((bin.payload as any).expense).toMatchObject({ id: expense.id, vehicleId: vehicle.id, category: "fuel", inboxItemId: item.id });
    expect((bin.payload as any).inboxItemIds).toEqual([item.id]);
    // The inbox item no longer lists the deleted expense, and keeps the others.
    const [after] = await db.select().from(invoiceInboxItems).where(eq(invoiceInboxItems.id, item.id));
    expect(after.expenseIds).toEqual([999999]);
    // The file stays: a restore needs it.
    expect(onDisk((bin.payload as any).expense.receiptFilePath)).toBe(true);
    const deleteAudit = await auditRows("expense.delete", expense.id);
    expect(deleteAudit).toHaveLength(1);
    expect(JSON.stringify(deleteAudit[0].details)).toContain(String((expense as any).description));
  });

  it("restore brings the expense back with its id, the inbox link and the expense_ids entry", async () => {
    const vehicle = await createFixtureVehicle();
    const item = await newInboxItem();
    const expense = await newExpense(vehicle.id, { inboxItemId: item.id });
    await db.update(invoiceInboxItems).set({ expenseIds: [expense.id] }).where(eq(invoiceInboxItems.id, item.id));
    await expensesOnly.delete(`/api/expenses/${expense.id}`);
    const bin = await binRowFor("expense", expense.id);

    const res = await binKeeper.post(`/api/deleted-records/${bin.id}/restore`);
    expect(res.status).toBe(200);
    expect(res.body.warnings ?? []).toEqual([]);

    const [back] = await db.select().from(expenses).where(eq(expenses.id, expense.id));
    expect(back).toMatchObject({ id: expense.id, vehicleId: vehicle.id, category: "fuel", inboxItemId: item.id });
    expect(Number(back.amount)).toBe(45.5);
    expect(back.createdAt).toBeInstanceOf(Date);
    const [itemAfter] = await db.select().from(invoiceInboxItems).where(eq(invoiceInboxItems.id, item.id));
    expect(itemAfter.expenseIds).toEqual([expense.id]);
    expect(await auditRows("expense.restore", expense.id)).toHaveLength(1);
    expect((await binKeeper.post(`/api/deleted-records/${bin.id}/restore`)).body.code).toBe("ALREADY_RESTORED");
  });

  it("restore without its inbox item: the link is dropped; without its vehicle: restored with a VEHICLE_MISSING warning", async () => {
    const vehicle = await createFixtureVehicle();
    const item = await newInboxItem();
    const expense = await newExpense(vehicle.id, { inboxItemId: item.id });
    await expensesOnly.delete(`/api/expenses/${expense.id}`);
    const bin = await binRowFor("expense", expense.id);
    await db.delete(invoiceInboxItems).where(eq(invoiceInboxItems.id, item.id));

    const ok = await binKeeper.post(`/api/deleted-records/${bin.id}/restore`);
    expect(ok.status).toBe(200);
    expect((await db.select().from(expenses).where(eq(expenses.id, expense.id)))[0].inboxItemId).toBeNull();

    // A vehicle that is gone for good.
    const ghostVehicleId = 2147000000;
    const orphan = await newExpense(ghostVehicleId);
    await expensesOnly.delete(`/api/expenses/${orphan.id}`);
    const orphanBin = await binRowFor("expense", orphan.id);
    const warned = await binKeeper.post(`/api/deleted-records/${orphanBin.id}/restore`);
    expect(warned.status).toBe(200);
    expect(warned.body.warnings).toEqual(["VEHICLE_MISSING"]);
    expect((await db.select().from(expenses).where(eq(expenses.id, orphan.id)))).toHaveLength(1);
  });

  it("restore is refused with ID_TAKEN when the id was given to something else", async () => {
    const vehicle = await createFixtureVehicle();
    const expense = await newExpense(vehicle.id);
    await expensesOnly.delete(`/api/expenses/${expense.id}`);
    const bin = await binRowFor("expense", expense.id);
    await db.execute((await import("drizzle-orm")).sql`INSERT INTO expenses (id, vehicle_id, category, amount, date, description) VALUES (${expense.id}, ${vehicle.id}, 'fuel', 1, '2026-10-02', ${ROW_PREFIX + "squatter"})`);
    const res = await binKeeper.post(`/api/deleted-records/${bin.id}/restore`);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("ID_TAKEN");
  });

  it("emptying the bin removes the receipt unless a live row (the inbox attachment) still uses it", async () => {
    const vehicle = await createFixtureVehicle();
    const lone = put(`dc02/bon-${unique("lone")}.pdf`);
    const shared = put(`dc02/bon-${unique("shared")}.pdf`);
    await newInboxItem({ attachmentPath: shared });
    const a = await newExpense(vehicle.id, { receiptFilePath: lone });
    const b = await newExpense(vehicle.id, { receiptFilePath: shared });
    await expensesOnly.delete(`/api/expenses/${a.id}`);
    await expensesOnly.delete(`/api/expenses/${b.id}`);
    const binA = await binRowFor("expense", a.id);
    const binB = await binRowFor("expense", b.id);

    const purged = await binKeeper.post("/api/deleted-records/purge").send({ ids: [binA.id, binB.id] });
    expect(purged.body).toEqual({ purged: 2, failed: [] });
    expect(onDisk(lone)).toBe(false);
    expect(onDisk(shared)).toBe(true);
    expect(await auditRows("expense.purge", a.id)).toHaveLength(1);
  });

  it("the whole bin of one kind can be emptied for both new kinds", async () => {
    const customer = await createFixtureCustomer("DC02g");
    const vehicle = await createFixtureVehicle();
    const driver = await newDriver(customer.id);
    const expense = await newExpense(vehicle.id);
    await customersOnly.delete(`/api/drivers/${driver.id}`);
    await expensesOnly.delete(`/api/expenses/${expense.id}`);
    await binRowFor("driver", driver.id);
    await binRowFor("expense", expense.id);
    for (const kind of ["driver", "expense"] as const) {
      const res = await binKeeper.post("/api/deleted-records/purge").send({ entityType: kind, all: true });
      expect(res.status).toBe(200);
      expect(res.body.purged).toBeGreaterThanOrEqual(1);
      expect((await binKeeper.get(`/api/deleted-records?type=${kind}`)).body).toEqual([]);
    }
  });
});
