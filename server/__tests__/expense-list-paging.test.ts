/**
 * Kosten (2026-10-16): GET /api/expenses pages and sorts on the server, so a list
 * of ten thousand invoices never travels to the browser in one go. The count and
 * sum come from the whole selection, not the page; /summary groups the same
 * selection per category with the newest rows of each; /facets lists the picker
 * choices. Without page/pageSize the old array answer is unchanged.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import multer from "multer";
import os from "os";
import { eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { registerExpenseRoutes } from "../routes/expenses";
import { UserPermission, expenses } from "../../shared/schema";
import { buildStaffTestApp, createTestVehicle, cleanupPortalTestData } from "./portal-helpers";

describe("GET /api/expenses paging, sorting, search and totals", () => {
  const register = (a: any) => registerExpenseRoutes(a, { upload: multer({ dest: os.tmpdir() }) } as any);
  const app = buildStaffTestApp([UserPermission.MANAGE_EXPENSES], register);
  const outsider = buildStaffTestApp([], register);
  let vehicleA: number;
  let vehicleB: number;
  const ids: number[] = [];
  // Only this file's rows: the shared test database may hold others, so every
  // request narrows on the two vehicles made here.
  const mine = () => `vehicleId=`;

  const add = async (vehicleId: number, category: string, date: string, amount: string, description = "pg-test") => {
    const [row] = await db.insert(expenses).values({ vehicleId, category, amount, date, description }).returning();
    ids.push(row.id);
    return row.id;
  };
  const get = async (path: string, who = app) => request(who).get(path);

  beforeAll(async () => {
    await cleanupPortalTestData();
    vehicleA = (await createTestVehicle("PT-PG-A")).id;
    vehicleB = (await createTestVehicle("PT-PG-B")).id;
    // Seven rows on vehicle A: three categories, dates and amounts out of step so sorts differ.
    await add(vehicleA, "fuel", "2026-09-01", "10.00", "diesel tanken");
    await add(vehicleA, "fuel", "2026-09-05", "50.00", "diesel");
    await add(vehicleA, "toll", "2026-09-03", "5.00", "tol A2");
    await add(vehicleA, "Toll", "2026-09-10", "7.50", "tol A4");
    await add(vehicleA, "tires", "2026-09-02", "400.00", "vier banden");
    await add(vehicleA, "tires", "2026-09-07", "20.00", "balanceren");
    await add(vehicleA, "fuel", "2026-09-09", "0.10", "stofzuigen");
    await add(vehicleB, "parking", "2026-10-01", "3.00", "parkeren");
  });
  afterAll(async () => {
    await db.delete(expenses).where(inArray(expenses.id, ids));
    await db.delete(expenses).where(eq(expenses.vehicleId, vehicleA));
    await db.delete(expenses).where(eq(expenses.vehicleId, vehicleB));
    await cleanupPortalTestData();
  });

  it("without page or pageSize still answers the whole selection as an array, newest first", async () => {
    const res = await get(`/api/expenses?${mine()}${vehicleA}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(7);
    expect(res.body.map((e: any) => e.date)).toEqual(["2026-09-10", "2026-09-09", "2026-09-07", "2026-09-05", "2026-09-03", "2026-09-02", "2026-09-01"]);
    expect(res.body[0].vehicle.licensePlate).toBe("PT-PG-A");
  });

  it("pages: total and totalAmount cover the whole selection, rows only the page", async () => {
    const first = await get(`/api/expenses?${mine()}${vehicleA}&page=1&pageSize=3`);
    expect(first.status).toBe(200);
    expect(first.body.total).toBe(7);
    expect(first.body.totalAmount).toBeCloseTo(492.6, 2);
    expect(first.body.rows.map((e: any) => e.date)).toEqual(["2026-09-10", "2026-09-09", "2026-09-07"]);
    const third = await get(`/api/expenses?${mine()}${vehicleA}&page=3&pageSize=3`);
    expect(third.body.rows.map((e: any) => e.date)).toEqual(["2026-09-01"]);
    expect(third.body.page).toBe(3);
    expect(third.body.pageSize).toBe(3);
    const beyond = await get(`/api/expenses?${mine()}${vehicleA}&page=9&pageSize=3`);
    expect(beyond.body.rows).toEqual([]);
    expect(beyond.body.total).toBe(7);
  });

  it("sorts on amount, category (any casing together), description and plate, both directions", async () => {
    const amounts = (await get(`/api/expenses?${mine()}${vehicleA}&sort=amount&page=1&pageSize=50`)).body.rows.map((e: any) => Number(e.amount));
    expect(amounts).toEqual([0.1, 5, 7.5, 10, 20, 50, 400]);
    const amountsDesc = (await get(`/api/expenses?${mine()}${vehicleA}&sort=amount&dir=desc`)).body.map((e: any) => Number(e.amount));
    expect(amountsDesc).toEqual([400, 50, 20, 10, 7.5, 5, 0.1]);
    const categories = (await get(`/api/expenses?${mine()}${vehicleA}&sort=category`)).body.map((e: any) => e.category.toLowerCase());
    expect(categories).toEqual(["fuel", "fuel", "fuel", "tires", "tires", "toll", "toll"]);
    const descriptions = (await get(`/api/expenses?${mine()}${vehicleA}&sort=description&dir=asc`)).body.map((e: any) => e.description);
    expect(descriptions[0]).toBe("balanceren");
    expect(descriptions[descriptions.length - 1]).toBe("vier banden");
    const plates = (await get(`/api/expenses?sort=plate&dir=desc&q=PT-PG`)).body.map((e: any) => e.vehicle.licensePlate);
    expect(plates[0]).toBe("PT-PG-B");
  });

  it("searches on plate without dashes, on category, on description and on brand and model", async () => {
    expect((await get(`/api/expenses?q=ptpgb`)).body.map((e: any) => e.description)).toEqual(["parkeren"]);
    expect((await get(`/api/expenses?${mine()}${vehicleB}&q=test model`)).body).toHaveLength(1);
    expect((await get(`/api/expenses?${mine()}${vehicleB}&q=test mobiel`)).body).toHaveLength(0);
    expect((await get(`/api/expenses?${mine()}${vehicleA}&q=TOL`)).body).toHaveLength(2);
    expect((await get(`/api/expenses?${mine()}${vehicleA}&q=diesel`)).body).toHaveLength(2);
    expect((await get(`/api/expenses?${mine()}${vehicleA}&q=%25`)).body).toHaveLength(0);
  });

  it("refuses a bad sort, dir, page or pageSize", async () => {
    expect((await get("/api/expenses?sort=colour")).status).toBe(400);
    expect((await get("/api/expenses?dir=sideways")).status).toBe(400);
    expect((await get("/api/expenses?page=0")).status).toBe(400);
    expect((await get("/api/expenses?page=abc")).status).toBe(400);
    expect((await get("/api/expenses?pageSize=0")).status).toBe(400);
    expect((await get("/api/expenses?pageSize=501")).status).toBe(400);
  });

  it("the summary groups the selection per category with its newest rows, and honours the filters", async () => {
    const res = await get(`/api/expenses/summary?${mine()}${vehicleA}&recent=2`);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(7);
    expect(res.body.totalAmount).toBeCloseTo(492.6, 2);
    const byCategory = res.body.byCategory as Array<{ category: string; count: number; amount: number; recent: any[] }>;
    expect(byCategory.map((g) => g.category)).toEqual(["tires", "fuel", "toll"]);
    const fuel = byCategory.find((g) => g.category === "fuel")!;
    expect(fuel.count).toBe(3);
    expect(fuel.amount).toBeCloseTo(60.1, 2);
    expect(fuel.recent.map((e) => e.date)).toEqual(["2026-09-09", "2026-09-05"]);
    expect(fuel.recent[0].vehicle.licensePlate).toBe("PT-PG-A");
    const toll = byCategory.find((g) => g.category === "toll")!;
    expect(toll.count).toBe(2);
    expect(toll.recent).toHaveLength(2);

    const narrowed = await get(`/api/expenses/summary?${mine()}${vehicleA}&from=2026-09-05&q=diesel`);
    expect(narrowed.body.total).toBe(1);
    expect(narrowed.body.totalAmount).toBeCloseTo(50, 2);
    expect((await get("/api/expenses/summary?recent=21")).status).toBe(400);
  });

  it("the facets list every vehicle with an expense and every category in use", async () => {
    const res = await get("/api/expenses/facets");
    expect(res.status).toBe(200);
    const plates = res.body.vehicles.map((v: any) => v.licensePlate);
    expect(plates).toContain("PT-PG-A");
    expect(plates).toContain("PT-PG-B");
    expect(plates.filter((p: string) => p === "PT-PG-A")).toHaveLength(1);
    for (const c of ["fuel", "toll", "tires", "parking"]) expect(res.body.categories).toContain(c);
    expect(res.body.categories).not.toContain("Toll");
  });

  it("keeps the guard on the new endpoints", async () => {
    expect((await get("/api/expenses?page=1", outsider)).status).toBe(403);
    expect((await get("/api/expenses/summary", outsider)).status).toBe(403);
    expect((await get("/api/expenses/facets", outsider)).status).toBe(403);
  });
});
