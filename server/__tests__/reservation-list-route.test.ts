/**
 * BUG-205 (Kees, 2026-10-19): GET /api/reservations answers a page with ?view=, rows by id with ?ids=,
 * and the old full array without either (other screens and scripts still read it).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { agentFor, cleanupFixtureUsers, type TestAgent } from "./helpers/app";

describe("GET /api/reservations", () => {
  let admin: TestAgent;
  beforeAll(async () => { admin = await agentFor("admin"); });
  afterAll(async () => { await cleanupFixtureUsers(); });

  it("answers a page with ?view=, at most pageSize rows, slim vehicle and customer", async () => {
    const res = await admin.get("/api/reservations?view=current&page=1&pageSize=5");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(false);
    expect(res.body.rows.length).toBeLessThanOrEqual(5);
    expect(res.body).toMatchObject({ page: 1, pageSize: 5 });
    expect(typeof res.body.total).toBe("number");
    expect(Object.keys(res.body.counts).sort()).toEqual(["completed", "current", "history"]);
    for (const row of res.body.rows) {
      if (row.customer) expect(row.customer.notes).toBeUndefined();
      if (row.vehicle) expect(Object.keys(row.vehicle).length).toBeLessThanOrEqual(5);
    }
  });

  it("refuses a bad view, a too large page and a malformed id list", async () => {
    expect((await admin.get("/api/reservations?view=everything")).status).toBe(400);
    expect((await admin.get("/api/reservations?view=current&pageSize=5000")).status).toBe(400);
    expect((await admin.get("/api/reservations?ids=1;drop")).status).toBe(400);
  });

  it("keeps the old array without view or ids", async () => {
    const res = await admin.get("/api/reservations?search=zzzz-no-such-thing");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});
