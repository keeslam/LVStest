/**
 * Reports redesign parts 3-4, final fixes (server): the 1000-row cut is announced, the same field
 * with two aggregations gets two result keys, and a number shown next to text is rounded.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { inArray } from "drizzle-orm";
import { db } from "../db";
import { expenses } from "../../shared/schema";
import { agentFor, cleanupFixtureUsers, type TestAgent } from "./helpers/app";
import { createFixtureVehicle, cleanupFixtures } from "./helpers/fixtures";

describe("report builder final fixes (server)", () => {
  let admin: TestAgent;
  const DESC = `FIXT-final-${Date.now()}`;
  const BIG = `FIXT-final-big-${Date.now()}`;
  const ids: number[] = [];

  const base = (description: string, columns: unknown[], extra: Record<string, unknown> = {}) => ({
    name: "t", dataSources: ["expenses"], columns, groupBy: [], filters: [{ table: "expenses", field: "description", operator: "equals", value: description }], ...extra,
  });

  beforeAll(async () => {
    admin = await agentFor("admin");
    const V = (await createFixtureVehicle({})).id;
    const small = await db.insert(expenses).values(
      [10, 20, 30].map((a) => ({ vehicleId: V, category: "other", amount: String(a), date: "2019-02-01", description: DESC })) as any,
    ).returning({ id: expenses.id });
    ids.push(...small.map((r) => r.id));
    const big = await db.insert(expenses).values(
      Array.from({ length: 1001 }, () => ({ vehicleId: V, category: "other", amount: "1", date: "2019-02-01", description: BIG })) as any,
    ).returning({ id: expenses.id });
    ids.push(...big.map((r) => r.id));
  });

  afterAll(async () => {
    if (ids.length) await db.delete(expenses).where(inArray(expenses.id, ids));
    await cleanupFixtures();
    await cleanupFixtureUsers();
  });

  it("answers { rows, truncated }: false for a short list", async () => {
    const res = await admin.post("/api/reports/execute").send(base(DESC, [{ table: "expenses", field: "amount" }]));
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.truncated).toBe(false);
    expect(res.body.rows).toHaveLength(3);
  });

  it("cuts at 1000 rows and says so", async () => {
    const res = await admin.post("/api/reports/execute").send(base(BIG, [{ table: "expenses", field: "amount" }]));
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.rows).toHaveLength(1000);
    expect(res.body.truncated).toBe(true);
  });

  it("SUM and AVG of the same field are two columns with their own keys", async () => {
    const res = await admin.post("/api/reports/execute").send(base(DESC, [
      { table: "expenses", field: "amount", aggregation: "SUM" },
      { table: "expenses", field: "amount", aggregation: "AVG" },
    ]));
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const row = res.body.rows[0];
    expect(Object.keys(row).sort()).toEqual(["amount.AVG", "amount.SUM"]);
    expect(Number(row["amount.SUM"])).toBe(60);
    expect(Number(row["amount.AVG"])).toBe(20);
  });

  it("an aggregated calculated field is keyed with its aggregation too", async () => {
    const third = { id: "third", name: "Derde", kind: "formula", type: "money", formula: { kind: "op", op: "/", left: { kind: "field", table: "expenses", field: "amount" }, right: { kind: "number", value: 3 } } };
    const res = await admin.post("/api/reports/execute").send(base(DESC, [
      { calc: "third", table: "", field: "", aggregation: "SUM" },
    ], { calculatedFields: [third] }));
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(Object.keys(res.body.rows[0])).toEqual(["calc.third.SUM"]);
  });

  it("an if-then that mixes text and a number shows the number with two decimals", async () => {
    const third = { id: "third", name: "Derde", kind: "formula", type: "money", formula: { kind: "op", op: "/", left: { kind: "field", table: "expenses", field: "amount" }, right: { kind: "number", value: 3 } } };
    const mix = {
      id: "mix", name: "Mix", kind: "ifThen", type: "text",
      rule: { when: { ref: { kind: "field", table: "expenses", field: "amount" }, test: "gt", value: 15 }, then: { ref: { kind: "calc", id: "third" } }, otherwise: { text: "Laag" } },
    };
    const res = await admin.post("/api/reports/execute").send(base(DESC, [
      { table: "expenses", field: "amount" }, { calc: "mix", table: "", field: "" },
    ], { calculatedFields: [third, mix] }));
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const byAmount = Object.fromEntries(res.body.rows.map((r: any) => [Number(r.amount), r["calc.mix"]]));
    expect(byAmount[10]).toBe("Laag");
    expect(byAmount[20]).toBe("6.67");
    expect(byAmount[30]).toBe("10.00");
  });
});
