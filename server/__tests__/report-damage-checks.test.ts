/**
 * Rapporten fase 5, Task 4 - damage checks: checks per month and kind, how many returns have
 * damage, vehicles and customers with the most damage, same per-customer count as customer value,
 * bad markers and recycle-bin reservations do not count, every tile equal to its list, rights.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { interactiveDamageChecks, reservations } from "../../shared/schema";
import { DAMAGE_CHECK_REPORT_TILES } from "../../shared/reports/damage-checks-report";
import { agentFor, cleanupFixtureUsers, type TestAgent } from "./helpers/app";
import { createFixtureCustomer, createFixtureReservation, createFixtureVehicle, cleanupFixtures } from "./helpers/fixtures";
import { expectDrillMatchesLines, expectTilesMatchRows } from "./helpers/report-kit";

describe("damage checks report", () => {
  let staff: TestAgent;
  let V1: number;
  let V2: number;
  let plate1: string;
  let plate2: string;
  let A: number;
  let nameA: string;
  let RA: number;
  let C2: number;
  const checkIds: number[] = [];
  const Q = { from: "2019-01-01", to: "2019-12-31" };

  const check = async (v: { vehicleId: number; reservationId: number | null; checkType: string; checkDate: string; damageMarkers: string | null }) => {
    const [row] = await db.insert(interactiveDamageChecks).values({ ...v, checkDate: new Date(v.checkDate), completedBy: "Tester" } as any).returning();
    checkIds.push(row.id);
    return row.id;
  };

  beforeAll(async () => {
    staff = await agentFor(["view_reports", "view_damage_checks"]);
    const v1 = await createFixtureVehicle();
    const v2 = await createFixtureVehicle();
    V1 = v1.id; V2 = v2.id; plate1 = v1.licensePlate; plate2 = v2.licensePlate;
    const a = await createFixtureCustomer("SchadeA");
    const b = await createFixtureCustomer("SchadeB");
    A = a.id; nameA = a.name;
    RA = (await createFixtureReservation({ customerId: A, vehicleId: V1 })).id;
    const RA2 = (await createFixtureReservation({ customerId: A, vehicleId: V1 })).id;
    const RB = (await createFixtureReservation({ customerId: b.id, vehicleId: V2 })).id;
    const RD = (await createFixtureReservation({ customerId: A, vehicleId: V1 })).id;
    await db.update(reservations).set({ deletedAt: new Date() }).where(eq(reservations.id, RD));

    await check({ vehicleId: V1, reservationId: RA, checkType: "pickup", checkDate: "2019-02-01T10:00:00Z", damageMarkers: '[{"x":1}]' });
    C2 = await check({ vehicleId: V1, reservationId: RA, checkType: "return", checkDate: "2019-02-10T10:00:00Z", damageMarkers: '[{"x":1},{"x":2}]' });
    await check({ vehicleId: V2, reservationId: RB, checkType: "pickup", checkDate: "2019-03-01T10:00:00Z", damageMarkers: "[]" });
    await check({ vehicleId: V2, reservationId: RB, checkType: "return", checkDate: "2019-03-05T10:00:00Z", damageMarkers: "geen json" });
    await check({ vehicleId: V1, reservationId: RA2, checkType: "return", checkDate: "2019-03-20T10:00:00Z", damageMarkers: ' [ {"x":3} ]' });
    await check({ vehicleId: V2, reservationId: null, checkType: "return", checkDate: "2019-04-01T10:00:00Z", damageMarkers: '[{"x":4}]' });
    await check({ vehicleId: V1, reservationId: RD, checkType: "return", checkDate: "2019-04-02T10:00:00Z", damageMarkers: '[{"x":5}]' });
    await check({ vehicleId: V1, reservationId: null, checkType: "pickup", checkDate: "2018-12-31T23:30:00Z", damageMarkers: null });
    await check({ vehicleId: V1, reservationId: null, checkType: "return", checkDate: "2019-12-31T23:30:00Z", damageMarkers: '[{"x":1}]' });
  });

  afterAll(async () => {
    if (checkIds.length) await db.delete(interactiveDamageChecks).where(inArray(interactiveDamageChecks.id, checkIds));
    await cleanupFixtures();
    await cleanupFixtureUsers();
  });

  it("tegels, maanden en meeste schades", async () => {
    const s = (await staff.get("/api/reports/damage-checks/summary").query(Q)).body;
    expect(s.tiles).toEqual({ all: { count: 7, amount: 0 }, pickup: { count: 3, amount: 0 }, return: { count: 4, amount: 0 }, withDamage: { count: 3, amount: 0 } });
    expect(s.byMonth).toEqual([
      { month: "2019-01", pickup: 1, return: 0, withDamage: 0 },
      { month: "2019-02", pickup: 1, return: 1, withDamage: 1 },
      { month: "2019-03", pickup: 1, return: 2, withDamage: 1 },
      { month: "2019-04", pickup: 0, return: 1, withDamage: 1 },
    ]);
    expect(s.byVehicle).toEqual([{ key: V1, label: plate1, count: 2, amount: 0 }, { key: V2, label: plate2, count: 1, amount: 0 }]);
    expect(s.byCustomer).toEqual([{ key: A, label: nameA, count: 2, amount: 0 }, { key: null, label: null, count: 1, amount: 0 }]);
  });

  it("voertuigfilter", async () => {
    const s = (await staff.get("/api/reports/damage-checks/summary").query({ ...Q, vehicleId: String(V1) })).body;
    expect(s.tiles.all.count).toBe(4);
    expect(s.tiles.withDamage.count).toBe(2);
  });

  it("rij", async () => {
    const r = (await staff.get("/api/reports/damage-checks/rows").query({ ...Q, tile: "withDamage", sort: "checkDate", dir: "asc" })).body.rows[0];
    expect(r).toMatchObject({
      id: C2, checkDate: "2019-02-10T10:00:00.000Z", checkType: "return", vehicleId: V1, licensePlate: plate1,
      reservationId: RA, customerId: A, customerName: nameA, hasDamage: true, amount: 0,
    });
  });

  it("zelfde aantal per klant als klantwaarde", async () => {
    const rows = (await staff.get("/api/reports/customer-value/rows").query({ ...Q, tile: "costs", pageSize: "250" })).body.rows;
    expect(rows.find((x: any) => x.customerId === A).damageChecks).toBe(2);
  });

  it("elke tegel opent precies zijn rijen", () => expectTilesMatchRows(staff, "/api/reports/damage-checks", Q, DAMAGE_CHECK_REPORT_TILES));

  it("uitsplitsing: voertuig en klant (ook zonder klant) openen precies hun regels", async () => {
    const s = (await staff.get("/api/reports/damage-checks/summary").query(Q)).body;
    await expectDrillMatchesLines(staff, "/api/reports/damage-checks", Q, "withDamage", "vehicle", s.byVehicle);
    await expectDrillMatchesLines(staff, "/api/reports/damage-checks", Q, "withDamage", "customer", s.byCustomer);
  });

  it("rechten: rapportrecht en schadecheckrecht", async () => {
    const status = async (perms: string[] | "admin") => (await (await agentFor(perms as any)).get("/api/reports/damage-checks/summary").query(Q)).status;
    expect(await status(["view_reports"])).toBe(403);
    expect(await status(["view_damage_checks"])).toBe(403);
    expect(await status(["view_reports", "view_damage_checks"])).toBe(200);
    expect(await status(["manage_reports", "manage_damage_checks"])).toBe(200);
    expect(await status("admin")).toBe(200);
  });
});
