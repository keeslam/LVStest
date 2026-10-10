/**
 * Audit A-9-8 (package P1): GET /api/expenses filters on vehicleId, from, to
 * and category, behind the same guard as before (manage_expenses). Without
 * parameters it answers exactly as it did.
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

describe("GET /api/expenses filters", () => {
  const register = (a: any) => registerExpenseRoutes(a, { upload: multer({ dest: os.tmpdir() }) } as any);
  const app = buildStaffTestApp([UserPermission.MANAGE_EXPENSES], register);
  const outsider = buildStaffTestApp([], register);
  let vehicleA: number;
  let vehicleB: number;
  const ids: number[] = [];

  const add = async (vehicleId: number, category: string, date: string, amount: string) => {
    const [row] = await db.insert(expenses).values({ vehicleId, category, amount, date, description: "p1-filter" }).returning();
    ids.push(row.id);
    return row.id;
  };
  const list = async (query: string, who = app) => {
    const res = await request(who).get(`/api/expenses${query}`);
    // Only this file's own rows: the shared test database may hold others.
    return { status: res.status, rows: (Array.isArray(res.body) ? res.body : []).filter((e: any) => ids.includes(e.id)), body: res.body };
  };

  beforeAll(async () => {
    await cleanupPortalTestData();
    vehicleA = (await createTestVehicle("PT-FLT-A")).id;
    vehicleB = (await createTestVehicle("PT-FLT-B")).id;
    await add(vehicleA, "fuel", "2026-09-01", "10.00");
    await add(vehicleA, "toll", "2026-09-15", "20.00");
    await add(vehicleB, "fuel", "2026-10-01", "30.00");
    await add(vehicleB, "Parking", "2026-10-09", "40.00");
  });
  afterAll(async () => {
    await db.delete(expenses).where(inArray(expenses.id, ids));
    await db.delete(expenses).where(eq(expenses.vehicleId, vehicleA));
    await db.delete(expenses).where(eq(expenses.vehicleId, vehicleB));
    await cleanupPortalTestData();
  });

  it("without parameters returns everything, as before", async () => {
    const { status, rows } = await list("");
    expect(status).toBe(200);
    expect(rows).toHaveLength(4);
    expect(rows[0].vehicle).toBeDefined();
  });

  it("filters on vehicle, on category (any casing) and on the period, and combines them", async () => {
    expect((await list(`?vehicleId=${vehicleA}`)).rows.map((e: any) => e.category).sort()).toEqual(["fuel", "toll"]);
    expect((await list("?category=FUEL")).rows).toHaveLength(2);
    expect((await list("?category=parking")).rows).toHaveLength(1);
    expect((await list("?from=2026-09-15&to=2026-10-01")).rows.map((e: any) => e.date).sort()).toEqual(["2026-09-15", "2026-10-01"]);
    expect((await list("?from=2026-10-01")).rows).toHaveLength(2);
    expect((await list("?to=2026-09-01")).rows).toHaveLength(1);
    expect((await list(`?vehicleId=${vehicleB}&category=fuel&from=2026-09-01&to=2026-10-31`)).rows.map((e: any) => e.amount)).toEqual(["30.00"]);
    expect((await list(`?vehicleId=${vehicleA}&category=parking`)).rows).toHaveLength(0);
  });

  it("refuses nonsense parameters with a 400 instead of ignoring them", async () => {
    expect((await list("?vehicleId=abc")).status).toBe(400);
    expect((await list("?from=01-10-2026")).status).toBe(400);
    expect((await list("?to=morgen")).status).toBe(400);
  });

  it("keeps the same guard: no manage_expenses, no list", async () => {
    expect((await list("", outsider)).status).toBe(403);
    expect((await list(`?vehicleId=${vehicleA}`, outsider)).status).toBe(403);
  });
});
