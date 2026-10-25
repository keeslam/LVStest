/**
 * Report builder phase 6: the new data sources. Each source keeps its own
 * fixed rules (maintenance blocks only, nothing from the recycle bin, voided
 * km readings left out unless the report filters on them).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { db } from "../db";
import {
  reservations, interactiveDamageChecks, vehicleMileageReadings, vehicleTransports, fines, savedReports,
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
    if (savedIds.length) await db.delete(savedReports).where(inArray(savedReports.id, savedIds));
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

  const savedIds: number[] = [];

  it.each([
    ["fines", "fines", "status", ["view_reports"], 403],
    ["fines", "fines", "status", ["view_fines"], 403],
    ["fines", "fines", "status", ["view_reports", "view_fines"], 200],
    ["transports", "vehicle_transports", "status", ["view_reports"], 403],
    ["transports", "vehicle_transports", "status", ["view_reports", "view_reservations"], 200],
    ["transports", "vehicle_transports", "status", ["manage_reports", "view_vehicles"], 200],
    ["workshop_visits", "workshop_visits", "status", ["view_reports"], 403],
    ["workshop_visits", "workshop_visits", "status", ["view_reports", "manage_maintenance"], 200],
    ["workshop_visits", "workshop_visits", "status", ["view_reports", "view_reservations"], 200],
    ["damage_checks", "interactive_damage_checks", "checkType", ["view_reports"], 403],
    ["damage_checks", "interactive_damage_checks", "checkType", ["view_reports", "view_damage_checks"], 200],
    ["mileage_readings", "vehicle_mileage_readings", "mileage", ["view_reports", "manage_reports", "view_vehicles", "manage_vehicles"], 403],
    ["mileage_readings", "vehicle_mileage_readings", "mileage", "admin", 200],
  ])("rechten: %s met %j -> %s", async (id, table, field, perms, status) => {
    const agent = await agentFor(perms as any);
    const res = await agent.post("/api/reports/execute").send({ name: "t", dataSources: [id], columns: [{ table, field }], filters: [] });
    expect(res.status).toBe(status);
    if (status === 403 && (perms as string[]).some((p) => p.endsWith("_reports"))) {
      expect(res.body).toMatchObject({ code: "REPORT_SOURCE_RIGHT_REQUIRED", source: id });
    }
  });

  it("elke genoemde bron telt, niet alleen de eerste", async () => {
    const agent = await agentFor(["view_reports", "view_vehicles"]);
    const res = await agent.post("/api/reports/execute").send({ name: "t", dataSources: ["vehicles", "mileage_readings"], columns: [{ table: "vehicles", field: "licensePlate" }], filters: [] });
    expect(res.status).toBe(403);
    expect(res.body.source).toBe("mileage_readings");
  });

  it("een km-rapport van de beheerder is onzichtbaar en niet op te slaan voor anderen", async () => {
    const cfg = { name: `Km fixt ${Date.now()}`, dataSources: ["mileage_readings"], columns: [{ table: "vehicle_mileage_readings", field: "mileage" }], filters: [], groupBy: [] };
    const saved = await admin.post("/api/reports/saved").send(cfg);
    expect(saved.status).toBe(200);
    savedIds.push(saved.body.id);
    const manager = await agentFor(["view_reports", "manage_reports"]);
    expect((await manager.get("/api/reports/saved")).body.map((r: any) => r.id)).not.toContain(saved.body.id);
    expect((await admin.get("/api/reports/saved")).body.map((r: any) => r.id)).toContain(saved.body.id);
    const refused = await manager.post("/api/reports/saved").send(cfg);
    expect(refused.status).toBe(403);
    expect(refused.body.code).toBe("REPORT_SOURCE_RIGHT_REQUIRED");
  });
});
