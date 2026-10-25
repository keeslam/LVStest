/**
 * Onderhoudsanalyse taak 1: expenses.supplier. Booking from the invoice inbox sets it from the
 * vendor, the form/API trims it (max 120), GET /api/expenses/suppliers lists the names in use,
 * and the one-time backfill (marker migration:expense_supplier_v1) fills old inbox costs only.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import multer from "multer";
import os from "os";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { registerExpenseRoutes } from "../routes/expenses";
import { bookInvoiceAsExpenses } from "../services/expenses/book-invoice";
import { inboxStorage } from "../services/invoice-inbox/inbox-storage";
import { UserPermission, appSettings, expenses } from "../../shared/schema";
import { buildStaffTestApp, createTestVehicle, cleanupPortalTestData, TEST_PREFIX } from "./portal-helpers";
import { cleanupInboxTestData, INBOX_TEST_ACTOR } from "./invoice-inbox-helpers";

const STARTUP_SCRIPT = fileURLToPath(new URL("../../startup-migration.js", import.meta.url));
const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const MARKER = "migration:expense_supplier_v1";
const MANAGER_MARKER = "migration:c_manager_rights";
const unique = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;

describe("expense supplier", () => {
  const register = (a: any) => registerExpenseRoutes(a, { upload: multer({ dest: os.tmpdir() }) } as any);
  const app = buildStaffTestApp([UserPermission.MANAGE_EXPENSES], register);
  const outsider = buildStaffTestApp([], register);
  let vehicleId: number;
  const saved: Record<string, typeof appSettings.$inferSelect | undefined> = {};

  const body = (over: Record<string, unknown> = {}) => ({ vehicleId, category: "maintenance", amount: "25.00", date: "2026-10-01", description: "sup-test", ...over });
  const supplierOf = async (id: number) => (await db.select().from(expenses).where(eq(expenses.id, id)))[0].supplier;
  const runStartupMigration = () => execFileSync(process.execPath, [STARTUP_SCRIPT], {
    cwd: REPO_ROOT, env: { ...process.env, DATABASE_SSL: "false", TIMESTAMPTZ_MIGRATION: "" }, encoding: "utf8", timeout: 60_000,
  });

  beforeAll(async () => {
    expect(process.env.DATABASE_URL ?? "").toMatch(/\/lvs_fixtest(\?|$)/);
    await cleanupInboxTestData();
    await cleanupPortalTestData();
    vehicleId = (await createTestVehicle("PT-SUP-01")).id;
    for (const key of [MARKER, MANAGER_MARKER]) saved[key] = (await db.select().from(appSettings).where(eq(appSettings.key, key)))[0];
    await db.insert(appSettings).values({
      key: MANAGER_MARKER, value: { appliedAt: "supplier placeholder", granted: 0 }, category: "general", description: "placeholder, restored after the test",
    }).onConflictDoNothing();
  });
  afterAll(async () => {
    await cleanupInboxTestData();
    await cleanupPortalTestData();
    for (const key of [MARKER, MANAGER_MARKER]) {
      await db.delete(appSettings).where(eq(appSettings.key, key));
      if (saved[key]) await db.insert(appSettings).values(saved[key]!).onConflictDoNothing();
    }
  });

  it("books the vendor of an inbox invoice as the supplier", async () => {
    const booked = await bookInvoiceAsExpenses({
      invoice: { vendor: `  ${TEST_PREFIX}Garage Jansen `, invoiceNumber: "R-1", invoiceDate: "2026-10-02" },
      vehicleId, lineItems: [{ description: "Beurt", amount: 80, category: "maintenance" }], createdBy: INBOX_TEST_ACTOR,
    });
    expect(booked.errors).toEqual([]);
    expect(await supplierOf(booked.expenses[0].id)).toBe(`${TEST_PREFIX}Garage Jansen`);
  });

  it("trims the supplier on POST and PATCH, clears it when empty, and refuses 121 characters", async () => {
    const created = await request(app).post("/api/expenses").send(body({ supplier: "  Garage Jansen " }));
    expect(created.status).toBe(201);
    expect(created.body.supplier).toBe("Garage Jansen");

    const patched = await request(app).patch(`/api/expenses/${created.body.id}`).send(body({ supplier: "  Banden Pieters  " }));
    expect(patched.status).toBe(200);
    expect(await supplierOf(created.body.id)).toBe("Banden Pieters");

    // A PATCH that does not mention the supplier leaves it alone; an empty one clears it.
    expect((await request(app).patch(`/api/expenses/${created.body.id}`).send(body())).status).toBe(200);
    expect(await supplierOf(created.body.id)).toBe("Banden Pieters");
    expect((await request(app).patch(`/api/expenses/${created.body.id}`).send(body({ supplier: "   " }))).status).toBe(200);
    expect(await supplierOf(created.body.id)).toBeNull();

    expect((await request(app).post("/api/expenses").send(body({ supplier: "x".repeat(120) }))).status).toBe(201);
    expect((await request(app).post("/api/expenses").send(body({ supplier: "x".repeat(121) }))).status).toBe(400);
    expect((await request(app).patch(`/api/expenses/${created.body.id}`).send(body({ supplier: "x".repeat(121) }))).status).toBe(400);
  });

  it("lists each supplier once, merging case and outer spaces, behind the expense right", async () => {
    await request(app).post("/api/expenses").send(body({ supplier: "Zeeman Autos" }));
    await request(app).post("/api/expenses").send(body({ supplier: "zeeman autos" }));
    await request(app).post("/api/expenses").send(body({ supplier: "Aalbers BV" }));
    await request(app).post("/api/expenses").send(body());
    const res = await request(app).get("/api/expenses/suppliers");
    expect(res.status).toBe(200);
    const names: string[] = res.body;
    expect(names.filter((n) => n.toLowerCase() === "zeeman autos")).toHaveLength(1);
    expect(names).toContain("Aalbers BV");
    expect(names).not.toContain("");
    const lower = names.map((n) => n.toLowerCase());
    expect(new Set(lower).size).toBe(lower.length);
    expect(lower).toEqual([...lower].sort());
    expect((await request(outsider).get("/api/expenses/suppliers")).status).toBe(403);
  });

  it("backfills inbox costs once (vendor, else From name) and leaves hand-typed costs empty", async () => {
    const item = (over: Record<string, unknown>) => inboxStorage.create({
      attachmentHash: `hash-${unique()}`, status: "booked", createdBy: INBOX_TEST_ACTOR, ...over,
    } as any);
    const withVendor = await item({ fromAddress: "Factuur <f@a.invalid>", parsed: { vendor: "Garage Vendor", invoiceNumber: "1", invoiceDate: "2026-10-01", currency: "EUR", lineItems: [] } });
    const withName = await item({ fromAddress: '"Banden Pieters" <b@a.invalid>', parsed: null });
    const withAddress = await item({ fromAddress: "only@a.invalid", parsed: null });
    const insert = async (inboxItemId: number | null) =>
      (await db.insert(expenses).values({ vehicleId, category: "maintenance", amount: "10.00", date: "2026-10-01", description: "sup-mig", inboxItemId }).returning())[0].id;
    const a = await insert(withVendor.id);
    const b = await insert(withName.id);
    const c = await insert(withAddress.id);
    const manual = await insert(null);

    await db.delete(appSettings).where(eq(appSettings.key, MARKER));
    const first = runStartupMigration();
    expect(first).toMatch(/Expense suppliers backfilled/);
    expect(await supplierOf(a)).toBe("Garage Vendor");
    expect(await supplierOf(b)).toBe("Banden Pieters");
    expect(await supplierOf(c)).toBe("only@a.invalid");
    expect(await supplierOf(manual)).toBeNull();
    expect((await db.select().from(appSettings).where(eq(appSettings.key, MARKER))).length).toBe(1);

    // Second start: the marker stops it, a late inbox cost stays empty.
    const late = await insert(withVendor.id);
    expect(runStartupMigration()).toMatch(/already backfilled/);
    expect(await supplierOf(late)).toBeNull();
    const rows = await db.select({ id: expenses.id }).from(expenses).where(inArray(expenses.id, [a, b, c, manual, late]));
    expect(rows).toHaveLength(5);
  }, 120_000);
});
