/**
 * Audit A-9-1 / A-9-2 (package P1): one canonical, lower-case list of expense
 * categories. The form and the invoice inbox used to store "Fuel" while the
 * older data holds "fuel", so the overview showed two tiles for one category.
 * The server is the one place every writer passes through, so it normalises:
 * lower-case, a known key, or `other`.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import multer from "multer";
import os from "os";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { registerExpenseRoutes } from "../routes/expenses";
import { bookInvoiceAsExpenses, groupLinesByCategory } from "../services/expenses/book-invoice";
import { UserPermission, expenses } from "../../shared/schema";
import { buildStaffTestApp, createTestVehicle, cleanupPortalTestData } from "./portal-helpers";

describe("expense categories are stored canonical", () => {
  const app = buildStaffTestApp([UserPermission.MANAGE_EXPENSES], (a) => registerExpenseRoutes(a, { upload: multer({ dest: os.tmpdir() }) } as any));
  let vehicleId: number;

  const stored = async (id: number) => (await db.select().from(expenses).where(eq(expenses.id, id)))[0];

  beforeAll(async () => {
    await cleanupPortalTestData();
    vehicleId = (await createTestVehicle("PT-CAT-01")).id;
  });
  afterAll(async () => {
    await db.delete(expenses).where(eq(expenses.vehicleId, vehicleId));
    await cleanupPortalTestData();
  });

  const post = (category: string) =>
    request(app).post("/api/expenses").send({ vehicleId, category, amount: 12.5, date: "2026-10-01", description: "categorietest" });

  it("POST with a capitalised key stores it lower-case", async () => {
    const res = await post("Fuel");
    expect(res.status).toBe(201);
    expect(res.body.category).toBe("fuel");
    expect((await stored(res.body.id)).category).toBe("fuel");
  });

  it("POST accepts the two new categories, toll and parking", async () => {
    for (const category of ["toll", "Parking"]) {
      const res = await post(category);
      expect(res.status).toBe(201);
      expect(res.body.category).toBe(category.toLowerCase());
    }
  });

  it("POST with an unknown key stores other", async () => {
    const res = await post("Snoep");
    expect(res.status).toBe(201);
    expect((await stored(res.body.id)).category).toBe("other");
  });

  it("PATCH normalises the category the same way", async () => {
    const created = await post("maintenance");
    const patched = await request(app).patch(`/api/expenses/${created.body.id}`)
      .send({ vehicleId, category: "Tires", amount: 12.5, date: "2026-10-01", description: "categorietest" });
    expect(patched.status).toBe(200);
    expect((await stored(created.body.id)).category).toBe("tires");
  });

  it("the invoice booking path stores canonical keys too, and merges lines that differ only in case", async () => {
    expect(groupLinesByCategory([
      { description: "Tanken", amount: 10, category: "Fuel" },
      { description: "Bijvullen", amount: 5, category: "fuel" },
    ])).toEqual([{ category: "fuel", amount: 15, description: "Tanken • Bijvullen" }]);
    const { expenses: booked, errors } = await bookInvoiceAsExpenses({
      invoice: { vendor: "Pomp", invoiceNumber: "C-1", invoiceDate: "2026-10-01" }, vehicleId, createdBy: "test",
      lineItems: [{ description: "Tanken", amount: 10, category: "Fuel" }],
    });
    expect(errors).toEqual([]);
    expect(booked[0].category).toBe("fuel");
  });
});
