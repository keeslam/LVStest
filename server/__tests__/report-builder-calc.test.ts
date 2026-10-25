/**
 * Reports redesign part 4, task 2: calculated fields run on the server, per row before grouping.
 * Formulas never reach SQL as text: fields are whitelisted idents, numbers and texts are bound
 * parameters, division by zero gives null.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { inArray } from "drizzle-orm";
import { db } from "../db";
import { expenses, savedReports } from "../../shared/schema";
import { agentFor, cleanupFixtureUsers, type TestAgent } from "./helpers/app";
import { rowsFromExecute } from "./helpers/report-execute";
import { createFixtureVehicle, cleanupFixtures } from "./helpers/fixtures";

const AMT = { kind: "field", table: "expenses", field: "amount" };
const inclVat = { id: "inclVat", name: "Incl. btw", kind: "formula", type: "money", formula: { kind: "op", op: "*", left: AMT, right: { kind: "number", value: 1.21 } } };
const perDay = { id: "perDay", name: "Per dag", kind: "formula", type: "money", formula: { kind: "op", op: "/", left: AMT, right: { kind: "number", value: 0 } } };
const hoog = {
  id: "hoog", name: "Hoog", kind: "ifThen", type: "text",
  rule: { when: { ref: AMT, test: "gt", value: 500 }, then: { text: "Hoog" }, otherwise: { text: "Normaal" } },
};
const calc = (id: string, extra: Record<string, unknown> = {}) => ({ calc: id, table: "", field: "", ...extra });

describe("report builder calculated fields", () => {
  let admin: TestAgent;
  const DESC = `FIXT-calc-${Date.now()}`;
  const amounts = [100, 600, 50, 800];
  const expenseIds: number[] = [];
  const savedIds: number[] = [];

  const report = (extra: { columns: unknown[]; filters?: unknown[]; groupBy?: unknown[]; calculatedFields?: unknown[] }) => ({
    name: "t",
    dataSources: ["expenses"],
    columns: extra.columns,
    groupBy: extra.groupBy ?? [],
    calculatedFields: extra.calculatedFields ?? [inclVat, perDay, hoog],
    filters: [...(extra.filters ?? []), { table: "expenses", field: "description", operator: "equals", value: DESC }],
  });

  beforeAll(async () => {
    admin = rowsFromExecute(await agentFor("admin"));
    const V = (await createFixtureVehicle({})).id;
    const rows = await db.insert(expenses).values(
      amounts.map((a) => ({ vehicleId: V, category: "other", amount: String(a), date: "2019-02-01", description: DESC })) as any,
    ).returning({ id: expenses.id });
    expenseIds.push(...rows.map((r) => r.id));
  });

  afterAll(async () => {
    if (savedIds.length) await db.delete(savedReports).where(inArray(savedReports.id, savedIds));
    if (expenseIds.length) await db.delete(expenses).where(inArray(expenses.id, expenseIds));
    await cleanupFixtures();
    await cleanupFixtureUsers();
  });

  it("a formula gives a value per row; division by zero gives null; if-then gives text", async () => {
    const res = await admin.post("/api/reports/execute").send(report({
      columns: [{ table: "expenses", field: "amount" }, calc("inclVat"), calc("perDay"), calc("hoog")],
    }));
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toHaveLength(4);
    for (const row of res.body) {
      expect(Number(row["calc.inclVat"])).toBeCloseTo(Number(row.amount) * 1.21, 6);
      expect(row["calc.perDay"]).toBeNull();
      expect(row["calc.hoog"]).toBe(Number(row.amount) > 500 ? "Hoog" : "Normaal");
    }
  });

  it("a calc entry never resolves as a plain field, whatever its table/field say", async () => {
    const res = await admin.post("/api/reports/execute").send(report({
      columns: [{ calc: "inclVat", table: "nope", field: "nope" }, { calc: "hoog", table: "expenses", field: "amount" }],
    }));
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(Object.keys(res.body[0]).sort()).toEqual(["calc.hoog", "calc.inclVat"]);
  });

  it("grouping on an if-then field with a count adds up to the number of rows", async () => {
    const res = await admin.post("/api/reports/execute").send(report({
      columns: [calc("hoog"), { table: "expenses", field: "id", aggregation: "COUNT" }],
      groupBy: [calc("hoog")],
    }));
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.map((r: any) => r["calc.hoog"]).sort()).toEqual(["Hoog", "Normaal"]);
    expect(res.body.reduce((s: number, r: any) => s + Number(r["id.COUNT"]), 0)).toBe(amounts.length);
    // Grouped on a calc that is not shown: a hidden group column, removed from the rows.
    const hidden = await admin.post("/api/reports/execute").send(report({
      columns: [{ table: "expenses", field: "id", aggregation: "COUNT" }],
      groupBy: [calc("hoog")],
    }));
    expect(hidden.status, JSON.stringify(hidden.body)).toBe(200);
    expect(hidden.body).toHaveLength(2);
    expect(Object.keys(hidden.body[0])).toEqual(["id.COUNT"]);
  });

  it("a sum over a calc is the sum of the row values; a filter on a calc works per row", async () => {
    const sum = await admin.post("/api/reports/execute").send(report({ columns: [calc("inclVat", { aggregation: "SUM" })] }));
    expect(sum.status, JSON.stringify(sum.body)).toBe(200);
    expect(Number(sum.body[0]["calc.inclVat.SUM"])).toBeCloseTo(amounts.reduce((s, a) => s + a * 1.21, 0), 6);

    const filtered = await admin.post("/api/reports/execute").send(report({
      columns: [{ table: "expenses", field: "amount" }],
      filters: [calc("inclVat", { operator: "greater_than", value: 100 })],
    }));
    expect(filtered.status, JSON.stringify(filtered.body)).toBe(200);
    expect(filtered.body.map((r: any) => Number(r.amount)).sort((a: number, b: number) => a - b)).toEqual([100, 600, 800]);
  });

  it("a calc column without aggregation must be grouped; the same calc twice is a duplicate", async () => {
    const notGrouped = await admin.post("/api/reports/execute").send(report({
      columns: [calc("inclVat"), { table: "expenses", field: "id", aggregation: "COUNT" }],
    }));
    expect(notGrouped.status).toBe(400);
    expect(notGrouped.body.code).toBe("REPORT_COLUMN_NOT_GROUPED");
    expect(notGrouped.body.field).toBe("calc.inclVat");
    const dup = await admin.post("/api/reports/execute").send(report({
      columns: [calc("hoog"), calc("hoog"), { table: "expenses", field: "id", aggregation: "COUNT" }],
      groupBy: [calc("hoog")],
    }));
    expect(dup.status).toBe(400);
    expect(dup.body.code).toBe("REPORT_COLUMN_DUPLICATE");
  });

  it("grouping a calc per month is refused", async () => {
    const res = await admin.post("/api/reports/execute").send(report({
      columns: [{ table: "expenses", field: "id", aggregation: "COUNT" }],
      groupBy: [calc("hoog", { period: "month" })],
    }));
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("REPORT_PERIOD_NOT_DATE");
  });

  it("a cycle is 400 REPORT_CALC_INVALID CYCLE on execute, POST and PUT", async () => {
    const a = { id: "a", name: "A", kind: "formula", type: "number", formula: { kind: "op", op: "+", left: { kind: "calc", id: "b" }, right: { kind: "number", value: 1 } } };
    const b = { id: "b", name: "B", kind: "formula", type: "number", formula: { kind: "calc", id: "a" } };
    const cfg = report({ columns: [calc("a")], calculatedFields: [a, b] });
    const res = await admin.post("/api/reports/execute").send(cfg);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("REPORT_CALC_INVALID");
    expect(res.body.error).toBe("CYCLE");
    expect(["a", "b"]).toContain(res.body.id);
    const post = await admin.post("/api/reports/saved").send({ ...cfg, name: `Calc fixt ${Date.now()}` });
    expect(post.status).toBe(400);
    expect(post.body.error).toBe("CYCLE");
    const ok = await admin.post("/api/reports/saved").send({ ...report({ columns: [calc("inclVat")] }), name: `Calc fixt ${Date.now()}` });
    expect(ok.status).toBe(200);
    savedIds.push(ok.body.id);
    const put = await admin.put(`/api/reports/saved/${ok.body.id}`).send({ ...cfg, name: "x" });
    expect(put.status).toBe(400);
    expect(put.body.error).toBe("CYCLE");
  });

  it("an unknown field or calc in a formula is 400", async () => {
    const bad = { id: "bad", name: "B", kind: "formula", type: "number", formula: { kind: "field", table: "expenses", field: "nope" } };
    const res = await admin.post("/api/reports/execute").send(report({ columns: [calc("bad")], calculatedFields: [bad] }));
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("UNKNOWN_FIELD");
    const missing = await admin.post("/api/reports/execute").send(report({ columns: [calc("ghost")] }));
    expect(missing.status).toBe(400);
    expect(missing.body.code).toBe("REPORT_CALC_INVALID");
    const textMath = { id: "tm", name: "T", kind: "formula", type: "number", formula: { kind: "op", op: "+", left: { kind: "field", table: "expenses", field: "category" }, right: { kind: "number", value: 1 } } };
    const tm = await admin.post("/api/reports/execute").send(report({ columns: [calc("tm")], calculatedFields: [textMath] }));
    expect(tm.status).toBe(400);
    expect(tm.body.code).toBe("REPORT_CALC_INVALID");
  });

  it("a km field through a link in a formula is admin only", async () => {
    const km = { id: "km", name: "Km", kind: "formula", type: "number", formula: { kind: "op", op: "*", left: { kind: "field", table: "vehicles", field: "currentMileage", via: "vehicle" }, right: { kind: "number", value: 2 } } };
    const cfg = report({ columns: [calc("km")], calculatedFields: [km] });
    const user = rowsFromExecute(await agentFor(["view_reports", "manage_reports", "view_vehicles", "manage_vehicles", "manage_expenses"]));
    const res = await user.post("/api/reports/execute").send(cfg);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("REPORT_SOURCE_RIGHT_REQUIRED");
    const post = await user.post("/api/reports/saved").send({ ...cfg, name: "nope" });
    expect(post.status).toBe(403);
    // Also in an if-then rule.
    const rule = { id: "r", name: "R", kind: "ifThen", type: "text", rule: { when: { ref: { kind: "field", table: "vehicles", field: "currentMileage", via: "vehicle" }, test: "gt", value: 1 }, then: { text: "a" }, otherwise: { text: "b" } } };
    const res2 = await user.post("/api/reports/execute").send(report({ columns: [calc("r")], calculatedFields: [rule] }));
    expect(res2.status).toBe(403);
    const asAdmin = await admin.post("/api/reports/execute").send(cfg);
    expect(asAdmin.status, JSON.stringify(asAdmin.body)).toBe(200);
  });

  it("a text with SQL in it comes back as text", async () => {
    const evil = "'; DROP TABLE expenses; --";
    const rule = { id: "e", name: "E", kind: "ifThen", type: "text", rule: { when: { ref: AMT, test: "empty" }, then: { text: "leeg" }, otherwise: { text: evil } } };
    const res = await admin.post("/api/reports/execute").send(report({ columns: [calc("e")], calculatedFields: [rule] }));
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toHaveLength(4);
    for (const row of res.body) expect(row["calc.e"]).toBe(evil);
  });

  it("if-then compares texts and gives a field back", async () => {
    const rule = {
      id: "c", name: "C", kind: "ifThen", type: "number",
      rule: { when: { ref: { kind: "field", table: "expenses", field: "category" }, test: "eq", value: "other" }, then: { ref: AMT }, otherwise: { ref: { kind: "number", value: 0 } } },
    };
    const res = await admin.post("/api/reports/execute").send(report({ columns: [calc("c", { aggregation: "SUM" })], calculatedFields: [rule] }));
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(Number(res.body[0]["calc.c.SUM"])).toBe(amounts.reduce((s, a) => s + a, 0));
  });

  it("calcs that refer to each other many times are capped, not expanded endlessly", async () => {
    const fields: unknown[] = [{ id: "f0", name: "F0", kind: "formula", type: "number", formula: AMT }];
    for (let i = 1; i < 20; i++) {
      const prev = { kind: "calc", id: `f${i - 1}` };
      fields.push({ id: `f${i}`, name: `F${i}`, kind: "ifThen", type: "number", rule: { when: { ref: prev, test: "gt", value: 1 }, then: { ref: prev }, otherwise: { ref: prev } } });
    }
    const res = await admin.post("/api/reports/execute").send(report({ columns: [calc("f19")], calculatedFields: fields }));
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("REPORT_CALC_INVALID");
    expect(res.body.error).toBe("TOO_DEEP");
    const small = await admin.post("/api/reports/execute").send(report({ columns: [calc("f3")], calculatedFields: fields }));
    expect(small.status, JSON.stringify(small.body)).toBe(200);
    expect(small.body.map((r: any) => Number(r["calc.f3"])).sort((a: number, b: number) => a - b)).toEqual([50, 100, 600, 800]);
  });

  it("greater/less than with a value that is not a number is 400, never 500", async () => {
    for (const value of ["abc", "", null, "12abc"]) {
      const rule = { id: "g", name: "G", kind: "ifThen", type: "text", rule: { when: { ref: AMT, test: "gt", value }, then: { text: "a" }, otherwise: { text: "b" } } };
      const res = await admin.post("/api/reports/execute").send(report({ columns: [calc("g")], calculatedFields: [rule] }));
      expect(res.status, JSON.stringify(value)).toBe(400);
      expect(res.body.code).toBe("REPORT_CALC_INVALID");
      expect(res.body.error).toBe("BAD_RULE");
      expect(res.body.id).toBe("g");
    }
  });

  it("a report that cannot run is not saved (text in a sum, greater than on text)", async () => {
    const textMath = { id: "tm", name: "T", kind: "formula", type: "number", formula: { kind: "op", op: "*", left: { kind: "field", table: "expenses", field: "description" }, right: { kind: "number", value: 2 } } };
    const gtText = { id: "gt", name: "G", kind: "ifThen", type: "text", rule: { when: { ref: { kind: "field", table: "expenses", field: "category" }, test: "gt", value: 5 }, then: { text: "a" }, otherwise: { text: "b" } } };
    const textCalcMath = { id: "tc", name: "TC", kind: "formula", type: "number", formula: { kind: "op", op: "+", left: { kind: "calc", id: "hoog" }, right: { kind: "number", value: 1 } } };
    const ok = await admin.post("/api/reports/saved").send({ ...report({ columns: [calc("inclVat")] }), name: `Calc fixt ${Date.now()}` });
    expect(ok.status).toBe(200);
    savedIds.push(ok.body.id);
    for (const [bad, extra] of [[textMath, []], [gtText, []], [textCalcMath, [hoog]]] as const) {
      const cfg = { ...report({ columns: [calc((bad as any).id)], calculatedFields: [...extra, bad] }), name: "nope" };
      const post = await admin.post("/api/reports/saved").send(cfg);
      expect(post.status, (bad as any).id).toBe(400);
      expect(post.body.code).toBe("REPORT_CALC_INVALID");
      expect(post.body.error).toBe("BAD_RULE");
      expect(post.body.id).toBe((bad as any).id);
      const put = await admin.put(`/api/reports/saved/${ok.body.id}`).send(cfg);
      expect(put.status, (bad as any).id).toBe(400);
      expect(put.body.code).toBe("REPORT_CALC_INVALID");
    }
  });

  it("malformed calculated fields are 400, never 500, on execute and save", async () => {
    let deep: any = { kind: "number", value: 1 };
    for (let i = 0; i < 3000; i++) deep = { kind: "op", op: "+", left: deep, right: { kind: "number", value: 1 } };
    const payloads: unknown[] = [
      "x", 5, { id: "a" }, [null], [5], [{}], [{ id: "a", kind: "formula" }],
      [{ id: "a", kind: "formula", type: "number", formula: { kind: "field", table: 1, field: [] } }],
      [{ id: "a", kind: "formula", type: "number", formula: { kind: "field", table: "vehicles", field: "brand", via: ["vehicle"] } }],
      [{ id: "a", kind: "ifThen", type: "text", rule: { when: null, then: { text: "a" }, otherwise: { text: "b" } } }],
      [{ id: "a", kind: "ifThen", type: "text", rule: { when: { ref: { kind: "calc", id: { x: 1 } }, test: "empty" }, then: "a", otherwise: 7 } }],
      [{ id: "a", kind: "formula", type: "number", formula: deep }],
    ];
    for (const calculatedFields of payloads) {
      const cfg = { ...report({ columns: [calc("a")] }), calculatedFields };
      const res = await admin.post("/api/reports/execute").send(cfg);
      expect(res.status, JSON.stringify(calculatedFields).slice(0, 80)).toBe(400);
      expect(res.body.code).toBe("REPORT_CALC_INVALID");
      const post = await admin.post("/api/reports/saved").send({ ...cfg, name: "nope" });
      expect(post.status, JSON.stringify(calculatedFields).slice(0, 80)).toBe(400);
    }
  });

  it("a calc entry in orderBy is refused with 400 (sorting is not run on the server)", async () => {
    const cfg = { ...report({ columns: [calc("inclVat")] }), orderBy: [{ calc: "inclVat", table: "", field: "", direction: "asc" }] };
    const res = await admin.post("/api/reports/execute").send(cfg);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("REPORT_CALC_INVALID");
    expect(res.body.id).toBe("inclVat");
    const post = await admin.post("/api/reports/saved").send({ ...cfg, name: "nope" });
    expect(post.status).toBe(400);
  });

  it("reports without calculated fields work as before", async () => {
    const res = await admin.post("/api/reports/execute").send({
      dataSources: ["expenses"], columns: [{ table: "expenses", field: "amount" }],
      filters: [{ table: "expenses", field: "description", operator: "equals", value: DESC }],
    });
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(4);
  });
});
