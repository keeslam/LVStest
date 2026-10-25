/**
 * Report builder phase 6: the new data sources. Each source keeps its own
 * fixed rules (maintenance blocks only, nothing from the recycle bin, voided
 * km readings left out unless the report filters on them).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { db } from "../db";
import {
  reservations, interactiveDamageChecks, vehicleMileageReadings, vehicleTransports, fines,
} from "../../shared/schema";
import { agentFor, cleanupFixtureUsers, type TestAgent } from "./helpers/app";
import { createFixtureVehicle, createFixtureCustomer, createFixtureReservation, cleanupFixtures } from "./helpers/fixtures";

describe("report builder sources", () => {
  let admin: TestAgent;
  let V: number;
  let K: number;
  let B1: number;
  let D1: number;
  let D3: number;
  const damageCheckIds: number[] = [];
  const fineIds: number[] = [];
  const mileageIds: number[] = [];
  const transportIds: number[] = [];

  const run = (source: string, table: string, columns: unknown[], filters: unknown[] = []) =>
    admin.post("/api/reports/execute").send({
      dataSources: [source],
      columns,
      filters: [...filters, { table, field: "vehicleId", operator: "equals", value: V }],
    });

  beforeAll(async () => {
    admin = await agentFor("admin");
    V = (await createFixtureVehicle()).id;
    K = (await createFixtureCustomer("Rapportbron")).id;

    const S = (await createFixtureReservation({ vehicleId: V, customerId: K, type: "standard" })).id;
    B1 = (await createFixtureReservation({ vehicleId: V, type: "maintenance_block" })).id;
    const B2 = (await createFixtureReservation({ vehicleId: V, type: "maintenance_block" })).id;
    const T = (await createFixtureReservation({ vehicleId: V, customerId: K, type: "standard" })).id;
    await db.update(reservations).set({ deletedAt: new Date() } as any).where(inArray(reservations.id, [B2, T]));

    const checks = await db.insert(interactiveDamageChecks).values([
      { vehicleId: V, reservationId: S, checkType: "return", checkDate: new Date("2019-03-01T10:00:00Z") },
      { vehicleId: V, reservationId: T, checkType: "return", checkDate: new Date("2019-03-02T10:00:00Z") },
      { vehicleId: V, reservationId: null, checkType: "return", checkDate: new Date("2019-03-03T10:00:00Z") },
    ] as any).returning({ id: interactiveDamageChecks.id });
    damageCheckIds.push(...checks.map((c) => c.id));
    D1 = checks[0].id;
    D3 = checks[2].id;

    const readings = await db.insert(vehicleMileageReadings).values([
      { vehicleId: V, mileage: 10000, recordedAt: new Date("2019-03-01T10:00:00Z"), source: "manual" },
      { vehicleId: V, mileage: 10500, recordedAt: new Date("2019-03-02T10:00:00Z"), source: "manual" },
      { vehicleId: V, mileage: 10400, recordedAt: new Date("2019-03-03T10:00:00Z"), source: "manual", voidedAt: new Date() },
    ]).returning({ id: vehicleMileageReadings.id });
    mileageIds.push(...readings.map((r) => r.id));

    const transports = await db.insert(vehicleTransports).values([
      { vehicleId: V, transportType: "delivery", status: "scheduled", scheduledDate: "2019-03-01" },
      { vehicleId: V, transportType: "swap", status: "completed", scheduledDate: "2019-03-02" },
    ] as any).returning({ id: vehicleTransports.id });
    transportIds.push(...transports.map((t) => t.id));
  });

  afterAll(async () => {
    if (damageCheckIds.length) await db.delete(interactiveDamageChecks).where(inArray(interactiveDamageChecks.id, damageCheckIds));
    if (fineIds.length) await db.delete(fines).where(inArray(fines.id, fineIds));
    if (mileageIds.length) await db.delete(vehicleMileageReadings).where(inArray(vehicleMileageReadings.id, mileageIds));
    if (transportIds.length) await db.delete(vehicleTransports).where(inArray(vehicleTransports.id, transportIds));
    await db.delete(vehicleMileageReadings).where(eq(vehicleMileageReadings.vehicleId, V));
    await cleanupFixtures();
    await cleanupFixtureUsers();
  });

  it("werkplaatsbezoeken: alleen bezoeken, niet uit de prullenbak", async () => {
    const res = await run("workshop_visits", "workshop_visits", [{ table: "workshop_visits", field: "id" }]);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ id: B1 }]);
  });

  it("schadechecks bij een reservering in de prullenbak tellen niet", async () => {
    const res = await run("damage_checks", "interactive_damage_checks", [{ table: "interactive_damage_checks", field: "id" }]);
    expect(res.status).toBe(200);
    expect(res.body.map((r: any) => r.id).sort((a: number, b: number) => a - b)).toEqual([D1, D3]);
  });

  it("vervallen km-standen tellen niet, tenzij je erop filtert", async () => {
    const cols = [
      { table: "vehicle_mileage_readings", field: "id", aggregation: "COUNT" },
      { table: "vehicle_mileage_readings", field: "mileage", aggregation: "SUM" },
    ];
    const all = await run("mileage_readings", "vehicle_mileage_readings", cols);
    expect(all.status).toBe(200);
    expect(Number(all.body[0].id)).toBe(2);
    expect(Number(all.body[0].mileage)).toBe(20500);
    const voided = await run("mileage_readings", "vehicle_mileage_readings", cols.slice(0, 1),
      [{ table: "vehicle_mileage_readings", field: "voidedAt", operator: "is_not_null", value: null }]);
    expect(voided.status).toBe(200);
    expect(Number(voided.body[0].id)).toBe(1);
  });

  it("transporten: alle soorten en statussen", async () => {
    const res = await run("transports", "vehicle_transports", [{ table: "vehicle_transports", field: "id", aggregation: "COUNT" }]);
    expect(res.status).toBe(200);
    expect(Number(res.body[0].id)).toBe(2);
  });
});
