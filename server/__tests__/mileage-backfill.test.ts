import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
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
let revertedResId: number;
let revertedPickupCheckId: number;
let revertedReturnCheckId: number;
let looseCheckId: number;
let noonResId: number;
let brokenResId: number;
const BROKEN_VEHICLE_ID = 2147480000;
let warnSpy: ReturnType<typeof vi.spyOn>;
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
    // A pickup reverted before the deploy: reservation km cleared, check kept. The return stands.
    const r3 = await createFixtureReservation({ customerId: c.id, vehicleId, startDate: "2026-03-20", endDate: "2026-03-22" });
    revertedResId = r3.id;
    await db.update(reservations).set({ returnMileage: 53000 } as any).where(eq(reservations.id, revertedResId));
    const [rpc] = await db.insert(interactiveDamageChecks).values({
      vehicleId, reservationId: revertedResId, checkType: "pickup", checkDate: new Date("2026-03-20T10:00:00Z"), mileage: 49000,
    } as any).returning();
    revertedPickupCheckId = rpc.id;
    const [rrc] = await db.insert(interactiveDamageChecks).values({
      vehicleId, reservationId: revertedResId, checkType: "return", checkDate: new Date("2026-03-23T10:00:00Z"), mileage: 53010,
    } as any).returning();
    revertedReturnCheckId = rrc.id;
    // A check without a reservation still counts.
    const [loose] = await db.insert(interactiveDamageChecks).values({
      vehicleId, reservationId: null, checkType: "pickup", checkDate: new Date("2026-03-25T10:00:00Z"), mileage: 53100,
    } as any).returning();
    looseCheckId = loose.id;
    const r4 = await createFixtureReservation({ customerId: c.id, vehicleId, startDate: "2026-03-10", endDate: "2026-03-12" });
    noonResId = r4.id;
    await db.update(reservations).set({ pickupMileage: 50700 } as any).where(eq(reservations.id, noonResId));
    // reservations.vehicle_id has no FK: a row pointing at a missing car makes the insert throw.
    const r5 = await createFixtureReservation({ customerId: c.id, vehicleId, startDate: "2026-03-01", endDate: "2026-03-02" });
    brokenResId = r5.id;
    await db.update(reservations).set({ vehicleId: BROKEN_VEHICLE_ID, pickupMileage: 1000 } as any).where(eq(reservations.id, brokenResId));
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    auditChangesId = await audit({ changes: [{ field: "currentMileage", from: 50400, to: 50500 }] }, new Date("2026-03-06T10:00:00Z"));
    auditPortalId = await audit({ currentMileage: { from: 50500, to: 50600 }, viaPortalRequest: 1 }, new Date("2026-03-07T10:00:00Z"));
    auditBadId = await audit({ changes: [{ field: "currentMileage", from: 1, to: "abc" }] }, new Date("2026-03-08T10:00:00Z"));
    auditFutureId = await audit({ changes: [{ field: "currentMileage", from: 1, to: 60000 }] }, new Date(Date.now() + 3_600_000));
  });
  afterAll(async () => {
    warnSpy?.mockRestore();
    await db.delete(reservations).where(eq(reservations.id, brokenResId));
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
    expect(rows).toHaveLength(10);
  });

  it("slaat de schadecheck van een teruggedraaide overdracht over, niet die zonder reservering", async () => {
    const rows = await readingsFor(vehicleId);
    const find = (source: string, sourceId: number) => rows.filter((r) => r.source === source && r.sourceId === sourceId);
    expect(find("damage_check", revertedPickupCheckId)).toHaveLength(0);
    expect(find("damage_check", revertedReturnCheckId)).toHaveLength(1);
    expect(find("return", revertedResId)[0].mileage).toBe(53000);
    expect(find("pickup", revertedResId)).toHaveLength(0);
    expect(find("damage_check", looseCheckId)).toHaveLength(1);
    expect(find("damage_check", looseCheckId)[0].mileage).toBe(53100);
  });

  it("dateert een teruggehaalde overdracht op 12:00 kantoortijd", async () => {
    const rows = await readingsFor(vehicleId);
    const [p] = rows.filter((r) => r.source === "pickup" && r.sourceId === noonResId);
    expect(p.recordedAt.toISOString()).toBe("2026-03-10T11:00:00.000Z");
    const [first] = rows.filter((r) => r.source === "pickup" && r.sourceId === resId);
    expect(first.recordedAt.toISOString()).toBe("2026-03-02T11:00:00.000Z");
  });

  it("een regel die niet kan worden ingevoegd breekt de run niet af", async () => {
    const broken = await db.select().from(vehicleMileageReadings).where(eq(vehicleMileageReadings.sourceId, brokenResId));
    expect(broken.filter((r) => r.sourceTable === "reservations")).toHaveLength(0);
    const warned = warnSpy.mock.calls.map((args) => args.map(String).join(" "));
    expect(warned.some((w) => w.includes("reservations") && w.includes(String(brokenResId)))).toBe(true);
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
    expect(await readingsFor(vehicleId)).toHaveLength(10);
  });
});
