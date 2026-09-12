/**
 * OPT-016 — "Bulkacties met resultaat per rij".
 *
 * The two bulk actions in the product could not say what had and had not
 * happened: the APK bulk-confirm/dismiss answered with one number, so a row
 * that was already resolved or had been deleted was silently "not counted",
 * and a failure halfway produced a 500 with the part that *had* been written
 * invisible.
 *
 * (The transport bulk's client half was already converted to `allSettled` in
 * FIX-Q/BUG-053; this is the other half of the proposal.)
 */
import { describe, it, expect, afterAll } from "vitest";
import request from "supertest";
import { eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { apkDateChanges, vehicles, UserPermission } from "../../shared/schema";
import { buildStaffTestApp } from "./portal-helpers";
import apkDateChangesRouter from "../routes/apk-date-changes";
import { createFixtureVehicle, cleanupFixtures } from "./helpers/fixtures";

// The router is mounted in server/index.ts, which the in-process harness
// deliberately does not load; this mounts the very same router under the very
// same path, with a staff user that holds the permission the mount requires.
const app = buildStaffTestApp([UserPermission.MANAGE_VEHICLES], (a) => {
  a.use("/api/apk-date-changes", apkDateChangesRouter);
});
const admin = {
  post: (url: string) => request(app).post(url),
};

const createdChangeIds: number[] = [];

afterAll(async () => {
  if (createdChangeIds.length) {
    await db.delete(apkDateChanges).where(inArray(apkDateChanges.id, createdChangeIds));
  }
  await cleanupFixtures();
});

async function pendingChange(newDate: string, status: string = "pending") {
  const vehicle = await createFixtureVehicle({ apkDate: "2026-01-01" });
  const [row] = await db.insert(apkDateChanges).values({
    vehicleId: vehicle.id,
    previousApkDate: "2026-01-01",
    newApkDate: newDate,
    status,
  }).returning();
  createdChangeIds.push(row.id);
  return { change: row, vehicle };
}

describe("OPT-016 — een resultaat per rij", () => {
  it("a bulk of 3 with 1 bad id returns 3 entries, 2 ok and 1 error, and the 2 good ones happened", async () => {
    const a = await pendingChange("2027-03-01");
    const b = await pendingChange("2027-04-01");
    const missingId = 99_999_999;

    const res = await admin.post("/api/apk-date-changes/bulk-confirm")
      .send({ ids: [a.change.id, missingId, b.change.id] });

    expect(res.status).toBe(200);
    expect(res.body.results).toHaveLength(3);
    expect(res.body.succeeded).toBe(2);
    expect(res.body.failed).toBe(1);

    // In the order they were asked for, so the UI can line them up with rows.
    expect(res.body.results[0]).toMatchObject({ id: a.change.id, ok: true });
    expect(res.body.results[1]).toMatchObject({ id: missingId, ok: false, reason: "not_found" });
    expect(res.body.results[2]).toMatchObject({ id: b.change.id, ok: true });

    // The two valid ones really were applied — the bad row did not roll them back.
    const [vehicleA] = await db.select().from(vehicles).where(eq(vehicles.id, a.vehicle.id));
    const [vehicleB] = await db.select().from(vehicles).where(eq(vehicles.id, b.vehicle.id));
    expect(vehicleA.apkDate).toBe("2027-03-01");
    expect(vehicleB.apkDate).toBe("2027-04-01");
  });

  it("names an already-handled row instead of silently not counting it", async () => {
    const done = await pendingChange("2027-05-01", "confirmed");
    const open = await pendingChange("2027-06-01");

    const res = await admin.post("/api/apk-date-changes/bulk-dismiss")
      .send({ ids: [done.change.id, open.change.id] });

    expect(res.status).toBe(200);
    expect(res.body.results[0]).toMatchObject({ id: done.change.id, ok: false, reason: "not_pending" });
    expect(res.body.results[0].message).toContain("confirmed");
    expect(res.body.results[1]).toMatchObject({ id: open.change.id, ok: true });
    expect(res.body.succeeded).toBe(1);
    expect(res.body.failed).toBe(1);
  });

  it("keeps the aggregate counts the old client read", async () => {
    const one = await pendingChange("2027-07-01");
    const confirm = await admin.post("/api/apk-date-changes/bulk-confirm").send({ ids: [one.change.id] });
    expect(confirm.body.confirmed).toBe(1);

    const two = await pendingChange("2027-08-01");
    const dismiss = await admin.post("/api/apk-date-changes/bulk-dismiss").send({ ids: [two.change.id] });
    expect(dismiss.body.dismissed).toBe(1);
  });

  it("a bulk where every row fails is still a 200 with a full report", async () => {
    const res = await admin.post("/api/apk-date-changes/bulk-confirm")
      .send({ ids: [99_999_997, 99_999_998] });
    expect(res.status).toBe(200);
    expect(res.body.succeeded).toBe(0);
    expect(res.body.failed).toBe(2);
    expect(res.body.results.every((r: any) => r.ok === false)).toBe(true);
  });

  it("still refuses a request that is not a list of ids", async () => {
    expect((await admin.post("/api/apk-date-changes/bulk-confirm").send({ ids: [] })).status).toBe(400);
    expect((await admin.post("/api/apk-date-changes/bulk-confirm").send({ ids: ["x"] })).status).toBe(400);
    expect((await admin.post("/api/apk-date-changes/bulk-dismiss").send({})).status).toBe(400);
  });
});
