/**
 * The report page keeps two choices per user: the last report per tab and the shown columns per report.
 * Both keys must be accepted by the user-settings routes (they were refused as unknown).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { agentFor, cleanupFixtureUsers, type TestAgent } from "./helpers/app";

describe("report user settings", () => {
  let agent: TestAgent;
  beforeAll(async () => { agent = await agentFor(["view_reports"]); });
  afterAll(async () => { await cleanupFixtureUsers(); });

  const cases: Array<[string, unknown, unknown[]]> = [
    ["reports_last_selected", { overview: "fleet", saved: "saved-3" }, [[1], "x", { a: 1 }, { a: ["b"] }]],
    ["report_columns", { vehicles: { hidden: ["a"], extra: ["customer.name"] } }, [[1], "x", { v: "x" }, { v: { hidden: [1], extra: [] } }, { v: { hidden: [], extra: "x" } }]],
  ];

  for (const [key, value, bad] of cases) {
    it(`${key}: GET null, PUT, GET, DELETE`, async () => {
      const first = await agent.get(`/api/user-settings/${key}`);
      expect(first.status).toBe(200);
      expect(first.body.value).toBeNull();
      const put = await agent.put(`/api/user-settings/${key}`).send({ value });
      expect(put.status, JSON.stringify(put.body)).toBe(200);
      expect((await agent.get(`/api/user-settings/${key}`)).body).toEqual({ value, source: "user" });
      expect((await agent.delete(`/api/user-settings/${key}`)).status).toBe(204);
      expect((await agent.get(`/api/user-settings/${key}`)).body.value).toBeNull();
    });
    it(`${key}: refuses a value of the wrong shape`, async () => {
      for (const b of bad) expect((await agent.put(`/api/user-settings/${key}`).send({ value: b })).status, JSON.stringify(b)).toBe(400);
    });
  }

  it("refuses an oversized value", async () => {
    const big = Object.fromEntries(Array.from({ length: 500 }, (_, i) => [`r${i}`, { hidden: Array.from({ length: 50 }, (_, j) => `f${j}`), extra: [] }]));
    expect((await agent.put("/api/user-settings/report_columns").send({ value: big })).status).toBe(400);
  });
});
