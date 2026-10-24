import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { appSettings, auditLogs, interactiveDamageChecks, reservations, vehicleMileageReadings, vehicles } from "../../shared/schema";
import { createFixtureCustomer, createFixtureReservation, createFixtureVehicle, cleanupFixtures } from "./helpers/fixtures";
import { backfillMileageHistory, MILEAGE_BACKFILL_KEY } from "../services/mileage-backfill";

let vehicleId: number;
let resId: number;
let deletedResId: number;
let dupCheckId: number;
let checkId: number;
let deletedCheckId: number;
let auditChangesId: number;
let auditPortalId: number;
let auditBadId: number;
let auditFutureId: number;
const auditIds: number[] = [];

async function readingsFor(vid: number) {
  return db.select().from(vehicleMileageReadings).where(eq(vehicleMileageReadings.vehicleId, vid));
}
async function clearFlag() {
  await db.delete(appSettings).where(eq(appSettings.key, MILEAGE_BACKFILL_KEY));
}
async function audit(details: Record<string, any>, createdAt?: Date, resourceId = String(vehicleId)) {
  const [a] = await db.insert(auditLogs).values({
    username: "Piet", action: "vehicle.update", resourceType: "vehicle", resourceId, details, ...(createdAt ? { createdAt } : {}),
  }).returning();
  auditIds.push(a.id);
  return a.id;
}

describe("mileage backfill", () => {
  beforeAll(async () => {
    await clearFlag();
    const v = await createFixtureVehicle({ lastServiceMileage: 40000, lastServiceDate: "2026-02-01" } as any);
    vehicleId = v.id;
    const c = await createFixtureCustomer();
    const r = await createFixtureReservation({ customerId: c.id, vehicleId, startDate: "2026-03-01", endDate: "2026-03-05" });
    resId = r.id;
    await db.update(reservations).set({ pickupMileage: 50000, returnMileage: 50400, actualPickupDate: "2026-03-02" } as any).where(eq(reservations.id, resId));
    const r2 = await createFixtureReservation({ customerId: c.id, vehicleId, startDate: "2026-04-01", endDate: "2026-04-05" });
    deletedResId = r2.id;
    await db.update(reservations).set({ pickupMileage: 51000, deletedAt: new Date() } as any).where(eq(reservations.id, deletedResId));
    // duplicate of the pickup (same value, same day) and a distinct return check
    const [dup] = await db.insert(interactiveDamageChecks).values({
      vehicleId, reservationId: resId, checkType: "pickup", checkDate: new Date("2026-03-02T10:00:00Z"), mileage: 50000,
    } as any).returning();
    dupCheckId = dup.id;
    const [chk] = await db.insert(interactiveDamageChecks).values({
      vehicleId, reservationId: resId, checkType: "return", checkDate: new Date("2026-03-05T10:00:00Z"), mileage: 50410,
    } as any).returning();
    checkId = chk.id;
    const [dchk] = await db.insert(interactiveDamageChecks).values({
      vehicleId, reservationId: deletedResId, checkType: "return", checkDate: new Date("2026-04-05T10:00:00Z"), mileage: 51500,
    } as any).returning();
    deletedCheckId = dchk.id;
    auditChangesId = await audit({ changes: [{ field: "currentMileage", from: 50400, to: 50500 }] }, new Date("2026-03-06T10:00:00Z"));
    auditPortalId = await audit({ currentMileage: { from: 50500, to: 50600 }, viaPortalRequest: 1 }, new Date("2026-03-07T10:00:00Z"));
    auditBadId = await audit({ changes: [{ field: "currentMileage", from: 1, to: "abc" }] }, new Date("2026-03-08T10:00:00Z"));
    auditFutureId = await audit({ changes: [{ field: "currentMileage", from: 1, to: 60000 }] }, new Date(Date.now() + 3_600_000));
  });
  afterAll(async () => {
    await db.delete(vehicleMileageReadings).where(eq(vehicleMileageReadings.vehicleId, vehicleId));
    if (auditIds.length) await db.delete(auditLogs).where(inArray(auditLogs.id, auditIds));
    await db.delete(interactiveDamageChecks).where(eq(interactiveDamageChecks.vehicleId, vehicleId));
    await cleanupFixtures();
    await clearFlag();
  });

  it("maakt een regel per bron met de juiste soort", async () => {
    const res = await backfillMileageHistory();
    expect(res.inserted).toBeGreaterThanOrEqual(6);
    const rows = await readingsFor(vehicleId);
    const find = (source: string, sourceId: number) => rows.filter((r) => r.source === source && r.sourceId === sourceId);
    expect(find("pickup", resId)).toHaveLength(1);
    expect(find("pickup", resId)[0].mileage).toBe(50000);
    expect(find("return", resId)).toHaveLength(1);
    expect(find("return", resId)[0].mileage).toBe(50400);
    expect(find("damage_check", checkId)).toHaveLength(1);
    expect(find("damage_check", checkId)[0].mileage).toBe(50410);
    expect(find("damage_check", dupCheckId)).toHaveLength(0);
    expect(find("service", vehicleId)).toHaveLength(1);
    expect(find("service", vehicleId)[0].mileage).toBe(40000);
    const imp = find("import", auditChangesId);
    expect(imp).toHaveLength(1);
    expect(imp[0].mileage).toBe(50500);
    expect(imp[0].sourceTable).toBe("audit_logs");
    expect(imp[0].actorName).toBe("Piet");
    expect(find("import", auditPortalId)[0].mileage).toBe(50600);
    expect(find("import", auditBadId)).toHaveLength(0);
    expect(find("import", auditFutureId)).toHaveLength(0);
    // soft-deleted reservations and their checks stay out
    expect(rows.filter((r) => r.sourceId === deletedResId || r.sourceId === deletedCheckId)).toHaveLength(0);
    expect(rows).toHaveLength(6);
  });

  it("zet de vlag; een volgende run slaat over", async () => {
    const [flag] = await db.select().from(appSettings).where(eq(appSettings.key, MILEAGE_BACKFILL_KEY));
    expect(flag).toBeTruthy();
    const before = (await readingsFor(vehicleId)).length;
    const res = await backfillMileageHistory();
    expect(res).toEqual({ inserted: 0, skipped: 0 });
    expect((await readingsFor(vehicleId)).length).toBe(before);
  });

  it("tweede run (geforceerd) voegt niets toe en heft niets op", async () => {
    await db.update(vehicleMileageReadings).set({ voidedAt: new Date(), voidedBy: "Admin" })
      .where(and(eq(vehicleMileageReadings.source, "pickup"), eq(vehicleMileageReadings.sourceId, resId)));
    const res = await backfillMileageHistory({ force: true });
    expect(res.inserted).toBe(0);
    expect(res.skipped).toBeGreaterThan(0);
    const [p] = await db.select().from(vehicleMileageReadings)
      .where(and(eq(vehicleMileageReadings.source, "pickup"), eq(vehicleMileageReadings.sourceId, resId)));
    expect(p.voidedAt).not.toBeNull();
    expect(await readingsFor(vehicleId)).toHaveLength(6);
  });
});
