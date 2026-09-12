/**
 * OPT-022 — auditlog per record ("Geschiedenis"-tab).
 *
 * The workflow report measured `GET /api/audit-logs?resourceId=3563` answering
 * with 906 rows: the filter was accepted, parsed by the client, and then never
 * reached the query. These tests pin both halves — the query-string filter on
 * the activity log, and the per-record endpoint the History tab reads.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq, like } from "drizzle-orm";
import { db } from "../db";
import { auditLogs } from "../../shared/schema";
import { agentFor, cleanupFixtureUsers, type TestAgent } from "./helpers/app";

const MARKER = "FIXT-opt022";
let admin: TestAgent;
let reservationOnly: TestAgent;
let vehicleOnly: TestAgent;

beforeAll(async () => {
  admin = await agentFor("admin");
  reservationOnly = await agentFor(["manage_reservations"]);
  vehicleOnly = await agentFor(["manage_vehicles"]);

  // Three rows on one reservation, three on another, so "only that record"
  // is a claim with something to exclude.
  const rows = [
    { resourceType: "reservation", resourceId: "900001", action: "reservation.create" },
    { resourceType: "reservation", resourceId: "900001", action: "reservation.pickup" },
    { resourceType: "reservation", resourceId: "900001", action: "reservation.return" },
    { resourceType: "reservation", resourceId: "900002", action: "reservation.create" },
    { resourceType: "vehicle", resourceId: "900001", action: "vehicle.update" },
  ];
  for (const row of rows) {
    await db.insert(auditLogs).values({
      username: `${MARKER}-user`,
      action: row.action,
      resourceType: row.resourceType,
      resourceId: row.resourceId,
      details: { marker: MARKER },
    } as any);
  }
});

afterAll(async () => {
  await db.delete(auditLogs).where(like(auditLogs.username, `${MARKER}%`));
  await cleanupFixtureUsers();
});

describe("OPT-022 — one record's history", () => {
  it("the activity log honours ?resourceId instead of ignoring it", async () => {
    const res = await admin.get("/api/audit-logs?resourceType=reservation&resourceId=900001&limit=200");
    expect(res.status).toBe(200);
    const ids: string[] = res.body.logs.map((l: any) => l.resourceId);
    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids)).toEqual(new Set(["900001"]));
    expect(res.body.total).toBe(3);
  });

  it("the same id under another resource type is not mixed in", async () => {
    const res = await admin.get("/api/audit-logs/resource/reservation/900001");
    expect(res.status).toBe(200);
    expect(res.body.logs).toHaveLength(3);
    expect(res.body.logs.every((l: any) => l.resourceType === "reservation")).toBe(true);
  });

  it("the per-record endpoint returns the rows newest first", async () => {
    const res = await admin.get("/api/audit-logs/resource/vehicle/900001");
    expect(res.status).toBe(200);
    expect(res.body.logs).toHaveLength(1);
    expect(res.body.logs[0].action).toBe("vehicle.update");
  });

  it("an unknown resource type is refused rather than answered with everything", async () => {
    const res = await admin.get("/api/audit-logs/resource/expense/900001");
    expect(res.status).toBe(400);
  });

  it("a non-numeric id is refused", async () => {
    const res = await admin.get("/api/audit-logs/resource/reservation/abc");
    expect(res.status).toBe(400);
  });

  it("the permission is the one of the record's own type", async () => {
    // manage_reservations may read a reservation's history...
    const ok = await reservationOnly.get("/api/audit-logs/resource/reservation/900001");
    expect(ok.status).toBe(200);
    // ...but not a customer's.
    const denied = await reservationOnly.get("/api/audit-logs/resource/customer/900001");
    expect(denied.status).toBe(403);
    // and manage_vehicles may not read a reservation's.
    const denied2 = await vehicleOnly.get("/api/audit-logs/resource/reservation/900001");
    expect(denied2.status).toBe(403);
  });

  it("an unrelated staff account gets no history at all", async () => {
    const nobody = await agentFor(["view_vehicles"]);
    const res = await nobody.get("/api/audit-logs/resource/vehicle/900001");
    expect(res.status).toBe(403);
  });
});
