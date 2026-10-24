import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { vehicleMileageReadings } from "../../shared/schema";
import { createFixtureVehicle, cleanupFixtures } from "./helpers/fixtures";
import { recordMileageReading, voidMileageReadings, getMileageHistory } from "../services/mileage-history";

let vehicleId: number;

async function rowsFor(vid: number) {
  return db.select().from(vehicleMileageReadings).where(eq(vehicleMileageReadings.vehicleId, vid));
}

describe("mileage history service", () => {
  beforeAll(async () => {
    const v = await createFixtureVehicle({ freeKmPerDay: 100 });
    vehicleId = v.id;
  });
  afterAll(async () => {
    await db.delete(vehicleMileageReadings).where(eq(vehicleMileageReadings.vehicleId, vehicleId));
    await cleanupFixtures();
  });

  it("upsert op (source, source_table, source_id): tweede keer overschrijft", async () => {
    const base = { vehicleId, source: "pickup" as const, sourceTable: "reservations", sourceId: 987001 };
    await recordMileageReading(db, { ...base, mileage: 50000, recordedAt: new Date("2026-03-01T09:00:00Z") });
    await recordMileageReading(db, { ...base, mileage: 50120, recordedAt: new Date("2026-03-01T09:30:00Z"), actorName: "Piet" });
    const rows = (await rowsFor(vehicleId)).filter((r) => r.sourceId === 987001);
    expect(rows).toHaveLength(1);
    expect(rows[0].mileage).toBe(50120);
    expect(rows[0].actorName).toBe("Piet");
  });

  it("void zet voidedAt, opnieuw vastleggen heft op", async () => {
    const n = await voidMileageReadings(db, { sourceTable: "reservations", sourceId: 987001 }, "Admin");
    expect(n).toBe(1);
    let r = (await rowsFor(vehicleId)).find((x) => x.sourceId === 987001)!;
    expect(r.voidedAt).not.toBeNull();
    expect(r.voidedBy).toBe("Admin");
    await recordMileageReading(db, { vehicleId, source: "pickup", sourceTable: "reservations", sourceId: 987001, mileage: 50130, recordedAt: new Date("2026-03-01T09:30:00Z") });
    r = (await rowsFor(vehicleId)).find((x) => x.sourceId === 987001)!;
    expect(r.voidedAt).toBeNull();
    expect(r.voidedBy).toBeNull();
    expect(r.mileage).toBe(50130);
  });

  it("negeert ongeldige standen en eist sourceTable bij sourceId", async () => {
    const before = (await rowsFor(vehicleId)).length;
    await recordMileageReading(db, { vehicleId, source: "manual", mileage: 0, recordedAt: new Date() });
    await recordMileageReading(db, { vehicleId, source: "manual", mileage: NaN, recordedAt: new Date() });
    expect((await rowsFor(vehicleId)).length).toBe(before);
    await expect(recordMileageReading(db, { vehicleId, source: "manual", sourceId: 5, mileage: 10, recordedAt: new Date() })).rejects.toThrow();
  });

  it("getMileageHistory gebruikt basisregel voor de eerste regel", async () => {
    await recordMileageReading(db, { vehicleId, source: "manual", mileage: 49000, recordedAt: new Date("2026-02-10T10:00:00Z") });
    await recordMileageReading(db, { vehicleId, source: "manual", mileage: 51000, recordedAt: new Date("2026-03-20T10:00:00Z") });
    const h = await getMileageHistory(vehicleId, "2026-03-01", "2026-03-31");
    expect(h).not.toBeNull();
    expect(h!.vehicle.freeKmPerDay).toBe(100);
    // listed: 50130 (03-01) and 51000 (03-20); baseline 49000 (02-10)
    expect(h!.rows.map((r) => r.mileage)).toEqual([50130, 51000]);
    expect(h!.rows[0].drivenSincePrevious).toBe(1130);
    // first row is on `from`: none of the 1130 km baseline delta falls in the period
    expect(h!.summary.drivenKm).toBe(870);
    expect(h!.summary.freeKm).toBe(3100);
  });

  it("onbekend voertuig geeft null", async () => {
    expect(await getMileageHistory(2147483000, "2026-01-01", "2026-01-31")).toBeNull();
  });
});
