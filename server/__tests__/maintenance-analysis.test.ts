/**
 * Onderhoudsanalyse (Kees, 2026-10-26), Task 2: the server analysis behind the window.
 * Fixtures: two brands, three models, vehicles with km history in different bands and
 * costs with suppliers (spelled three ways for one garage).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { inArray, sql } from "drizzle-orm";
import { db } from "../db";
import { UserPermission, expenses, vehicleMileageReadings, vehicles, deletedRecords } from "../../shared/schema";
import { kmBandOf, modelWithoutBrand, supplierKey, KM_BANDS } from "../../shared/maintenance-analysis";
import { agentFor, cleanupFixtureUsers, type TestAgent } from "./helpers/app";
import { createFixtureVehicle, cleanupFixtures } from "./helpers/fixtures";

const FIAT = "FIXTMAFIAT";
const FORD = "FIXTMAFORD";
const P = { from: "2026-01-01", to: "2026-09-30" };
const BASE = "/api/reports/maintenance-analysis";

describe("kmBandOf / modelWithoutBrand / supplierKey", () => {
  it("bands: the boundary belongs to the higher band", () => {
    expect(kmBandOf(0)).toBe("0–50.000");
    expect(kmBandOf(49999)).toBe("0–50.000");
    expect(kmBandOf(50000)).toBe("50–100.000");
    expect(kmBandOf(150000)).toBe("150–200.000");
    expect(kmBandOf(200000)).toBe("200.000+");
    expect(KM_BANDS.map((b) => b.key)).toEqual(["0–50.000", "50–100.000", "100–150.000", "150–200.000", "200.000+"]);
  });
  it("the model without the brand in front", () => {
    expect(modelWithoutBrand("FIAT", "FIAT DUCATO")).toBe("DUCATO");
    expect(modelWithoutBrand("FIAT", "DUCATO")).toBe("DUCATO");
    expect(modelWithoutBrand("Fiat", "FIAT  DOBLO")).toBe("DOBLO");
    expect(modelWithoutBrand("FIAT", "FIAT")).toBe("FIAT");
    expect(modelWithoutBrand("FIAT", "FIATDUCATO")).toBe("FIATDUCATO");
  });
  it("supplier key: case and spaces do not split a supplier", () => {
    expect(supplierKey("Garage  Jansen")).toBe("garage jansen");
    expect(supplierKey("garage jansen ")).toBe("garage jansen");
    expect(supplierKey("  ")).toBeNull();
    expect(supplierKey(null)).toBeNull();
  });
});

describe("maintenance analysis endpoints", () => {
  let admin: TestAgent;
  let staff: TestAgent;
  const ids: Record<string, number> = {};
  const vehicleIds: number[] = [];

  const vehicle = async (name: string, brand: string, model: string) => {
    const v = await createFixtureVehicle({ brand, model, dateIn: "2025-01-01" });
    ids[name] = v.id;
    vehicleIds.push(v.id);
    return v.id;
  };
  const cost = (vehicleId: number, category: string, amount: string, date: string, supplier: string | null = null) =>
    ({ vehicleId, category, amount, date, supplier, description: "FIXT-ma" });

  beforeAll(async () => {
    admin = await agentFor("admin");
    staff = await agentFor([UserPermission.VIEW_REPORTS]);
    const K1 = await vehicle("K1", FIAT, `${FIAT} DUCATO`);
    const D = [await vehicle("D1", FIAT, `${FIAT} DOBLO`), await vehicle("D2", FIAT, "DOBLO"), await vehicle("D3", FIAT, "DOBLO"), await vehicle("D4", FIAT, "DOBLO")];
    const T1 = await vehicle("T1", FORD, "TRANSIT");
    const T2 = await vehicle("T2", FORD, "TRANSIT");
    const T3 = await vehicle("T3", FORD, "TRANSIT");

    await db.insert(vehicleMileageReadings).values([
      { vehicleId: K1, mileage: 40000, recordedAt: new Date("2026-01-01T11:00:00Z"), source: "manual" },
      { vehicleId: K1, mileage: 60000, recordedAt: new Date("2026-03-01T11:00:00Z"), source: "manual" },
      { vehicleId: K1, mileage: 80000, recordedAt: new Date("2026-05-01T10:00:00Z"), source: "manual" },
      // A voided typo never counts.
      { vehicleId: K1, mileage: 990000, recordedAt: new Date("2026-04-01T10:00:00Z"), source: "manual", voidedAt: new Date("2026-04-02T10:00:00Z"), voidedBy: "FIXT-test" },
    ] as any);

    await db.insert(expenses).values([
      // K1: EUR 100 at 40.000 km (band 0–50.000), EUR 600 at 60.000 km (band 50–100.000).
      cost(K1, "maintenance", "100.00", "2026-02-01", "Garage  Jansen"),
      cost(K1, "tires", "600.00", "2026-04-01", "garage jansen "),
      cost(K1, "fuel", "999.00", "2026-04-02"), // not maintenance
      // DOBLO: D1 far above three comparable vehicles.
      cost(D[0], "maintenance", "1000.00", "2026-03-01", "Garage Jansen"),
      cost(D[1], "maintenance", "100.00", "2026-03-01", "Garage Jansen"),
      cost(D[2], "brakes", "100.00", "2026-03-01", "Bandenhuis"),
      cost(D[3], "maintenance", "100.00", "2026-03-01"),
      // TRANSIT: T1 high but only two comparable vehicles; tires twice within 90 days.
      cost(T1, "tires", "2000.00", "2026-05-01"),
      cost(T1, "tires", "2000.00", "2026-07-15"),
      cost(T1, "brakes", "50.00", "2026-01-10"),
      cost(T1, "brakes", "50.00", "2026-06-01"),
      // T2 rises each of the last three full months (Jun < Jul < Aug < Sep), T3 does not.
      cost(T2, "maintenance", "10.00", "2026-06-10"),
      cost(T2, "maintenance", "20.00", "2026-07-10"),
      cost(T2, "maintenance", "30.00", "2026-08-10"),
      cost(T2, "maintenance", "40.00", "2026-09-10"),
      cost(T3, "maintenance", "10.00", "2026-06-10"),
      cost(T3, "maintenance", "30.00", "2026-07-10"),
      cost(T3, "maintenance", "20.00", "2026-08-10"),
      cost(T3, "maintenance", "40.00", "2026-09-10"),
    ]);
  });

  afterAll(async () => {
    await db.delete(vehicleMileageReadings).where(inArray(vehicleMileageReadings.vehicleId, vehicleIds));
    await cleanupFixtures();
    await cleanupFixtureUsers();
  });

  it("overview: every category has a name, tiles add up, fuel is not maintenance", async () => {
    const res = await admin.get(`${BASE}/overview`).query({ ...P, brand: FIAT });
    expect(res.status).toBe(200);
    expect(res.body.byCategory.map((c: any) => c.key)).toEqual(["maintenance", "tires", "brakes"]);
    for (const c of res.body.byCategory) {
      expect(c.label).toBeTruthy();
      expect(c.label).not.toBe("0");
    }
    expect(res.body.byCategory.map((c: any) => c.label)).toEqual(["Onderhoud", "Banden", "Remmen"]);
    expect(res.body.tiles.total).toBe(2000);
    expect(res.body.tiles.count).toBe(6);
    expect(typeof res.body.tiles.perKm).toBe("number");
    expect(res.body.topVehicles[0]).toMatchObject({ vehicleId: ids.D1, total: 1000, model: "DOBLO" });
  });

  it("overview with a comparison period gives the previous tiles", async () => {
    const res = await staff.get(`${BASE}/overview`).query({ ...P, brand: FORD, compareFrom: "2025-01-01", compareTo: "2025-09-30" });
    expect(res.status).toBe(200);
    expect(res.body.previous).toMatchObject({ total: 0, count: 0, from: "2025-01-01", to: "2025-09-30" });
  });

  it("brands: the model without the brand twice; cost per km per band = costs in band ÷ km driven in band", async () => {
    const res = await admin.get(`${BASE}/brands`).query({ ...P, brand: FIAT });
    expect(res.status).toBe(200);
    expect(res.body.models.map((m: any) => m.model).sort()).toEqual(["DOBLO", "DUCATO"]);
    const doblo = res.body.models.find((m: any) => m.model === "DOBLO");
    expect(doblo).toMatchObject({ key: `${FIAT} | DOBLO`, vehicles: 4, vehiclesWithCosts: 4, count: 4, total: 1300, rated: true });
    const ducato = res.body.kmBands.filter((b: any) => b.model === "DUCATO");
    expect(ducato).toEqual([
      { level: "model", brand: FIAT, model: "DUCATO", band: "0–50.000", amount: 100, km: 10000, perKm: 0.01, vehicles: 1, count: 1 },
      { level: "model", brand: FIAT, model: "DUCATO", band: "50–100.000", amount: 600, km: 30000, perKm: 0.02, vehicles: 1, count: 1 },
    ]);
  });

  it("vehicles: plate with dashes, per month over the months owned, km band for the admin", async () => {
    const res = await admin.get(`${BASE}/vehicles`).query({ ...P, vehicleId: ids.D1 });
    expect(res.status).toBe(200);
    const [line] = res.body.vehicles;
    expect(line).toMatchObject({ vehicleId: ids.D1, brand: FIAT, model: "DOBLO", total: 1000, count: 1, lastDate: "2026-03-01", kmBand: null, perKm: null });
    expect(line.perMonth).toBe(Math.round((1000 / (273 / (365.25 / 12))) * 100) / 100);
    const k1 = (await admin.get(`${BASE}/vehicles`).query({ ...P, vehicleId: ids.K1 })).body.vehicles[0];
    expect(k1).toMatchObject({ kmBand: "50–100.000", total: 700, perKm: 0.0175 });
  });

  it("non-admin: no km fields, and a km-band filter or drill is refused", async () => {
    const overview = await staff.get(`${BASE}/overview`).query({ ...P, brand: FIAT });
    expect(overview.status).toBe(200);
    expect(overview.body.tiles).not.toHaveProperty("perKm");
    const brands = await staff.get(`${BASE}/brands`).query({ ...P, brand: FIAT });
    expect(brands.body).not.toHaveProperty("kmBands");
    expect(brands.body.brands[0]).not.toHaveProperty("perKm");
    const vehicles = await staff.get(`${BASE}/vehicles`).query({ ...P, vehicleId: ids.K1 });
    expect(vehicles.body.vehicles[0]).not.toHaveProperty("perKm");
    expect(vehicles.body.vehicles[0]).not.toHaveProperty("kmBand");
    const trends = await staff.get(`${BASE}/trends`).query({ ...P, brand: FIAT });
    expect(trends.body).not.toHaveProperty("forecast");
    const rows = await staff.get(`${BASE}/rows`).query({ ...P, vehicleId: ids.K1 });
    expect(rows.body.rows[0]).not.toHaveProperty("km");
    expect((await staff.get(`${BASE}/overview`).query({ ...P, kmBand: "0–50.000" })).status).toBe(403);
    expect((await staff.get(`${BASE}/rows`).query({ ...P, drill: "kmBand", key: "0–50.000" })).status).toBe(403);
    expect((await admin.get(`${BASE}/overview`).query({ ...P, brand: FIAT, kmBand: "0–50.000" })).body.tiles).toMatchObject({ total: 100, count: 1, perKm: 0.01 });
  });

  it("signal aboveGroup only with at least 3 comparable vehicles", async () => {
    const fiat = (await staff.get(`${BASE}/signals`).query({ ...P, brand: FIAT })).body.signals.filter((s: any) => s.kind === "aboveGroup");
    expect(fiat).toHaveLength(1);
    expect(fiat[0]).toMatchObject({ vehicleId: ids.D1, basis: "month", comparables: 3, average: 11.15, value: 111.49, percent: 900 });
    const ford = (await staff.get(`${BASE}/signals`).query({ ...P, brand: FORD })).body.signals.filter((s: any) => s.kind === "aboveGroup");
    expect(ford).toEqual([]); // T1 is far above, but there are only two other TRANSITs
  });

  it("signal repeated: same category within 90 days, not after 142 days", async () => {
    const signals = (await staff.get(`${BASE}/signals`).query({ ...P, brand: FORD })).body.signals;
    const repeated = signals.filter((s: any) => s.kind === "repeated" && s.vehicleId === ids.T1);
    // T2 and T3 have maintenance every month, so they repeat too; T1's brakes (142 days apart) do not.
    expect(signals.filter((s: any) => s.kind === "repeated").map((s: any) => s.vehicleId).sort()).toEqual([ids.T1, ids.T2, ids.T3].sort());
    expect(repeated).toEqual([expect.objectContaining({ vehicleId: ids.T1, category: "tires", categoryLabel: "Banden", firstDate: "2026-05-01", secondDate: "2026-07-15", days: 75 })]);
  });

  it("signal rising: each of the last 3 full months higher than the month before", async () => {
    const rising = (await staff.get(`${BASE}/signals`).query({ ...P, brand: FORD })).body.signals.filter((s: any) => s.kind === "rising");
    expect(rising.map((s: any) => s.vehicleId)).toEqual([ids.T2]);
    expect(rising[0].months).toEqual([
      { month: "2026-06", amount: 10 }, { month: "2026-07", amount: 20 }, { month: "2026-08", amount: 30 }, { month: "2026-09", amount: 40 },
    ]);
    // A period that ends mid-September: September is not full yet, so the window is May..August.
    const mid = (await staff.get(`${BASE}/signals`).query({ from: P.from, to: "2026-09-15", brand: FORD })).body.signals.filter((s: any) => s.kind === "rising");
    expect(mid.map((s: any) => s.months.map((m: any) => m.month))).toEqual([["2026-05", "2026-06", "2026-07", "2026-08"]]);
  });

  it("signals carry the dates they looked at; a vehicle drill over them opens exactly those lines", async () => {
    const signals = (await staff.get(`${BASE}/signals`).query({ ...P, brand: FORD })).body.signals;
    const rising = signals.find((s: any) => s.kind === "rising" && s.vehicleId === ids.T2);
    expect(rising).toMatchObject({ drillFrom: "2026-06-01", drillTo: "2026-09-30" });
    const risingRows = (await staff.get(`${BASE}/rows`).query({ ...P, brand: FORD, from: rising.drillFrom, to: rising.drillTo, drill: "vehicle", key: String(ids.T2) })).body;
    expect([risingRows.total, risingRows.amount]).toEqual([4, 100]);
    const repeated = signals.find((s: any) => s.kind === "repeated" && s.vehicleId === ids.T1);
    expect(repeated).toMatchObject({ drillFrom: "2026-05-01", drillTo: "2026-07-15" });
    const repeatedRows = (await staff.get(`${BASE}/rows`).query({ ...P, brand: FORD, from: repeated.drillFrom, to: repeated.drillTo, category: "tires", drill: "vehicle", key: String(ids.T1) })).body;
    expect(repeatedRows.rows.map((r: any) => r.id).sort()).toEqual([...repeated.expenseIds].sort());
  });

  it("suppliers: one group for three spellings, its most used name; drill supplier gives exactly count lines", async () => {
    const res = await admin.get(`${BASE}/suppliers`).query({ ...P, brand: FIAT });
    expect(res.status).toBe(200);
    const jansen = res.body.suppliers.find((s: any) => s.key === "garage jansen");
    expect(jansen).toMatchObject({ supplier: "Garage Jansen", count: 4, total: 1800, avg: 450 });
    const unknown = res.body.suppliers.find((s: any) => s.key === null);
    expect(unknown).toMatchObject({ supplier: "Onbekend", count: 1, total: 100 });
    for (const s of res.body.suppliers) {
      const rows = await admin.get(`${BASE}/rows`).query({ ...P, brand: FIAT, drill: "supplier", key: s.key ?? "__null" });
      expect(rows.status).toBe(200);
      expect(rows.body.total).toBe(s.count);
      expect(rows.body.rows).toHaveLength(s.count);
      expect(rows.body.amount).toBe(s.total);
    }
    const filtered = await admin.get(`${BASE}/overview`).query({ ...P, brand: FIAT, supplier: "GARAGE JANSEN" });
    expect(filtered.body.tiles.count).toBe(4);
    expect(res.body.topRepairs[0]).toMatchObject({ vehicleId: ids.D1, amount: 1000, supplier: "Garage Jansen", categoryLabel: "Onderhoud" });
  });

  it("rows: drills and the km of each line for the admin", async () => {
    const byModel = await admin.get(`${BASE}/rows`).query({ ...P, drill: "model", key: `${FIAT} | DUCATO` });
    expect(byModel.body.rows.map((r: any) => [r.date, r.km, r.category])).toEqual([["2026-04-01", 60000, "tires"], ["2026-02-01", 40000, "maintenance"]]);
    const byBand = await admin.get(`${BASE}/rows`).query({ ...P, brand: FIAT, drill: "kmBand", key: "50–100.000" });
    expect(byBand.body.total).toBe(1);
    const byMonth = await admin.get(`${BASE}/rows`).query({ ...P, brand: FORD, drill: "month", key: "2026-07" });
    expect(byMonth.body.total).toBe(3);
    expect((await admin.get(`${BASE}/rows`).query({ ...P, drill: "nope", key: "x" })).status).toBe(400);
    expect((await admin.get(`${BASE}/rows`).query({ ...P, drill: "brand" })).status).toBe(400);
  });

  it("trends: months with the comparison period, forecast = 90 × km per day × cost per km of model + band", async () => {
    const res = await admin.get(`${BASE}/trends`).query({ ...P, brand: FIAT, compareFrom: "2025-01-01", compareTo: "2025-09-30" });
    expect(res.status).toBe(200);
    expect(res.body.months).toHaveLength(9);
    expect(res.body.months[2]).toEqual({ month: "2026-03", amount: 1300, previous: 0 });
    expect(res.body.forecastVehicles).toHaveLength(1);
    const f = res.body.forecastVehicles[0];
    expect(f).toMatchObject({ vehicleId: ids.K1, band: "50–100.000", kmPerDay: 333.3, perKm: 0.02 });
    expect(f.amount).toBe(Math.round(90 * 333.3 * 0.02 * 100) / 100);
    expect(res.body.forecast).toHaveLength(3);
    const sum = res.body.forecast.reduce((n: number, m: any) => n + m.amount, 0);
    expect(sum).toBeCloseTo(f.amount, 1);
  });

  it("invalid input is a 400", async () => {
    expect((await admin.get(`${BASE}/overview`).query({ from: "2026-02-30", to: P.to })).status).toBe(400);
    expect((await admin.get(`${BASE}/overview`).query({ ...P, category: "fuel" })).status).toBe(400);
    expect((await admin.get(`${BASE}/overview`).query({ ...P, kmBand: "x" })).status).toBe(400);
    expect((await admin.get(`${BASE}/overview`).query({ ...P, compareFrom: "2026-01-01" })).status).toBe(400);
  });

  it("a repeated query value or yearFrom after yearTo is a 400", async () => {
    expect((await admin.get(`${BASE}/overview?from=${P.from}&to=${P.to}&brand=${FIAT}&brand=${FORD}`)).status).toBe(400);
    expect((await admin.get(`${BASE}/rows?from=${P.from}&to=${P.to}&drill=brand&key=${FIAT}&key=${FORD}`)).status).toBe(400);
    expect((await admin.get(`${BASE}/overview`).query({ ...P, yearFrom: "2020", yearTo: "2010" })).status).toBe(400);
    expect((await admin.get(`${BASE}/overview`).query({ ...P, yearFrom: "2010", yearTo: "2020" })).status).toBe(200);
  });

  it("a km-band filter from a non-admin is a 403 on every part", async () => {
    for (const part of ["overview", "brands", "vehicles", "suppliers", "trends", "signals", "rows"]) {
      expect((await staff.get(`${BASE}/${part}`).query({ ...P, kmBand: "0–50.000" })).status, part).toBe(403);
    }
  });

  it("drill category, brand and vehicle open exactly the counted lines", async () => {
    const q = { ...P, brand: FIAT };
    const overview = (await admin.get(`${BASE}/overview`).query(q)).body;
    for (const c of overview.byCategory) {
      const rows = (await admin.get(`${BASE}/rows`).query({ ...q, drill: "category", key: c.key })).body;
      expect([rows.total, rows.amount], c.key).toEqual([c.count, c.amount]);
    }
    const brands = (await staff.get(`${BASE}/brands`).query(q)).body;
    for (const b of brands.brands) {
      const rows = (await staff.get(`${BASE}/rows`).query({ ...q, drill: "brand", key: b.brand })).body;
      expect([rows.total, rows.amount]).toEqual([b.count, b.total]);
    }
    for (const m of brands.models) {
      const rows = (await staff.get(`${BASE}/rows`).query({ ...q, drill: "model", key: m.key })).body;
      expect([rows.total, rows.amount]).toEqual([m.count, m.total]);
    }
    const vehicles = (await staff.get(`${BASE}/vehicles`).query(q)).body.vehicles;
    expect(vehicles.length).toBe(5);
    for (const v of vehicles) {
      const rows = (await staff.get(`${BASE}/rows`).query({ ...q, drill: "vehicle", key: String(v.vehicleId) })).body;
      expect([rows.total, rows.amount]).toEqual([v.count, v.total]);
    }
  });

  it("a km-band cell (band + brand + model) opens exactly its lines", async () => {
    const lines = (await admin.get(`${BASE}/brands`).query({ ...P, brand: FIAT })).body.kmBands;
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      const query: Record<string, string> = { ...P, brand: line.brand ?? "__null", drill: "kmBand", key: line.band ?? "__null" };
      if (line.level === "model") query.model = line.model ?? "__null";
      const rows = (await admin.get(`${BASE}/rows`).query(query)).body;
      expect([rows.total, rows.amount], `${line.model} ${line.band}`).toEqual([line.count, line.amount]);
    }
  });
});

describe("maintenance analysis: removed vehicles and months owned", () => {
  const OWN = "FIXTMAOWN";
  let admin: TestAgent;
  let staff: TestAgent;
  const orphanExpenseIds: number[] = [];
  const deletedRecordIds: number[] = [];
  let snapId: number;
  let bareId: number;
  let mid: number, sold: number, short: number, weekly: number;
  const months = (days: number) => days / (365.25 / 12);
  const r2 = (n: number) => Math.round(n * 100) / 100;

  beforeAll(async () => {
    admin = await agentFor("admin");
    staff = await agentFor([UserPermission.VIEW_REPORTS]);
    // Two vehicles removed from the vehicles table while their costs stayed: one with a recycle-bin snapshot, one without.
    const snap = await createFixtureVehicle({ brand: "FIXTMAGONE", model: "FIXTMAGONE KANGOO", dateIn: "2025-01-01" });
    const bare = await createFixtureVehicle({ brand: "FIXTMAGONE", model: "KANGOO", dateIn: "2025-01-01" });
    snapId = snap.id;
    bareId = bare.id;
    const inserted = await db.insert(expenses).values([
      { vehicleId: snapId, category: "maintenance", amount: "321.00", date: "2026-04-04", description: "FIXT-ma-orphan" },
      { vehicleId: bareId, category: "brakes", amount: "123.00", date: "2026-04-05", description: "FIXT-ma-orphan" },
    ]).returning();
    orphanExpenseIds.push(...inserted.map((e) => e.id));
    await db.delete(vehicles).where(inArray(vehicles.id, [snapId, bareId]));
    const [rec] = await db.insert(deletedRecords).values({
      entityType: "vehicle", entityId: snapId, label: "FIXT gone", payload: { vehicle: snap },
    }).returning();
    deletedRecordIds.push(rec.id);

    mid = (await createFixtureVehicle({ brand: OWN, model: "X", dateIn: "2026-08-01" })).id;
    sold = (await createFixtureVehicle({ brand: OWN, model: "X", dateIn: "2025-01-01", outOfFleetDate: "2026-03-31", outOfFleetReason: "sold" })).id;
    short = (await createFixtureVehicle({ brand: OWN, model: "X", dateIn: "2026-09-29" })).id;
    weekly = (await createFixtureVehicle({ brand: "FIXTMAWEEK", model: "Y", dateIn: "2025-01-01" })).id;
    await db.insert(expenses).values({ vehicleId: weekly, category: "tires", amount: "100.00", date: "2026-09-25", description: "FIXT-ma" });
    await db.insert(expenses).values([
      { vehicleId: mid, category: "maintenance", amount: "200.00", date: "2026-08-15", description: "FIXT-ma" },
      { vehicleId: sold, category: "maintenance", amount: "135.00", date: "2026-05-15", description: "FIXT-ma" },
      { vehicleId: short, category: "maintenance", amount: "50.00", date: "2026-09-29", description: "FIXT-ma" },
    ]);
  });

  afterAll(async () => {
    await db.delete(expenses).where(inArray(expenses.id, orphanExpenseIds));
    await db.delete(deletedRecords).where(inArray(deletedRecords.id, deletedRecordIds));
    await cleanupFixtures();
    await cleanupFixtureUsers();
  });

  it("costs of a removed vehicle still count, under its recycle-bin plate and brand when there is one", async () => {
    const overview = (await admin.get(`${BASE}/overview`).query({ ...P, vehicleId: String(snapId) })).body;
    expect(overview.tiles).toMatchObject({ total: 321, count: 1 });
    const rows = (await admin.get(`${BASE}/rows`).query({ ...P, vehicleId: String(bareId) })).body;
    expect(rows.total).toBe(1);
    expect(rows.rows[0]).toMatchObject({ amount: 123, category: "brakes" });
    const gone = (await staff.get(`${BASE}/brands`).query({ ...P, brand: "FIXTMAGONE" })).body;
    expect(gone.models).toEqual([expect.objectContaining({ model: "KANGOO", count: 1, total: 321 })]);
  });

  it("the overview total equals every maintenance cost of the period in the expenses table", async () => {
    const [{ total, count }] = (await db.execute(sql`
      SELECT round(coalesce(sum(amount::numeric), 0), 2)::float8 AS total, count(*)::int AS count FROM expenses
      WHERE lower(btrim(category)) IN ('maintenance', 'tires', 'brakes') AND left(date, 10) >= ${P.from} AND left(date, 10) <= ${P.to}`)).rows as any[];
    const overview = (await admin.get(`${BASE}/overview`).query(P)).body;
    expect(overview.tiles.count).toBe(count);
    expect(overview.tiles.total).toBeCloseTo(total, 2);
  });

  it("per month: added mid-period, sold with a later cost, and a 2-day owner floored at 1 month", async () => {
    const lines = (await staff.get(`${BASE}/vehicles`).query({ ...P, brand: OWN })).body.vehicles;
    const of = (id: number) => lines.find((l: any) => l.vehicleId === id).perMonth;
    expect(of(mid)).toBe(r2(200 / months(61))); // 1 Aug .. 30 Sep
    expect(of(sold)).toBe(r2(135 / months(135))); // 1 Jan .. 15 May: the cost after the sale extends the months owned
    expect(of(short)).toBe(50); // 29 .. 30 Sep is 2 days: counted as 1 month
    const tiles = (await staff.get(`${BASE}/overview`).query({ ...P, brand: OWN })).body.tiles;
    expect(tiles.perVehicleMonth).toBe(r2(385 / (months(61) + months(135) + 1)));
  });

  it("the 1-month floor is never longer than the period: one week stays a monthly rate", async () => {
    const week = { from: "2026-09-24", to: "2026-09-30", brand: "FIXTMAWEEK" };
    const line = (await staff.get(`${BASE}/vehicles`).query(week)).body.vehicles[0];
    expect(line.vehicleId).toBe(weekly);
    expect(line.perMonth).toBe(r2(100 / months(7))); // about EUR 434.82, not EUR 100
    expect((await staff.get(`${BASE}/overview`).query(week)).body.tiles.perVehicleMonth).toBe(r2(100 / months(7)));
  });
});

describe("maintenance analysis: final fixes", () => {
  const EMPTY = "FIXTMAEMPTY";
  const FIX = "FIXTMAFIX";
  let admin: TestAgent;
  let staff: TestAgent;
  const orphanExpenseIds: number[] = [];
  let noModel: number;
  let orphan: number;
  const fix: Record<string, number> = {};
  const vehicleIds: number[] = [];

  beforeAll(async () => {
    admin = await agentFor("admin");
    staff = await agentFor([UserPermission.VIEW_REPORTS]);
    // A vehicle with an empty model, and a removed vehicle without a recycle-bin snapshot (no brand, no model).
    noModel = (await createFixtureVehicle({ brand: EMPTY, model: "", dateIn: "2025-01-01" })).id;
    await db.insert(expenses).values({ vehicleId: noModel, category: "maintenance", amount: "77.00", date: "2026-02-02", description: "FIXT-ma" });
    const gone = await createFixtureVehicle({ brand: EMPTY, model: "GONE", dateIn: "2025-01-01" });
    orphan = gone.id;
    const inserted = await db.insert(expenses).values({ vehicleId: orphan, category: "brakes", amount: "55.00", date: "2026-02-03", description: "FIXT-ma-orphan" }).returning();
    orphanExpenseIds.push(...inserted.map((e) => e.id));
    await db.delete(vehicles).where(inArray(vehicles.id, [orphan]));

    // FIX: A1 has km readings in 50–100.000 and a cost there; A2 has a cost without any km reading; A3 nothing.
    for (const name of ["A1", "A2", "A3"]) {
      fix[name] = (await createFixtureVehicle({ brand: FIX, model: "VAN", dateIn: "2025-01-01" })).id;
      vehicleIds.push(fix[name]);
    }
    await db.insert(vehicleMileageReadings).values([
      { vehicleId: fix.A1, mileage: 60000, recordedAt: new Date("2026-01-01T11:00:00Z"), source: "manual" },
      { vehicleId: fix.A1, mileage: 70000, recordedAt: new Date("2026-06-01T10:00:00Z"), source: "manual" },
    ] as any);
    await db.insert(expenses).values([
      { vehicleId: fix.A1, category: "maintenance", amount: "300.00", date: "2026-03-01", description: "FIXT-ma" },
      { vehicleId: fix.A2, category: "tires", amount: "400.00", date: "2026-03-02", description: "FIXT-ma" },
    ]);
  });

  afterAll(async () => {
    await db.delete(expenses).where(inArray(expenses.id, orphanExpenseIds));
    await db.delete(vehicleMileageReadings).where(inArray(vehicleMileageReadings.vehicleId, vehicleIds));
    await cleanupFixtures();
    await cleanupFixtureUsers();
  });

  it("an empty model is null, filter and drill on __null match the counted lines", async () => {
    const brands = (await staff.get(`${BASE}/brands`).query({ ...P, brand: EMPTY })).body;
    const unknown = brands.models.find((m: any) => m.model === null);
    expect(unknown).toMatchObject({ brand: EMPTY, key: `${EMPTY} | __null`, count: 1, total: 77 });
    expect(brands.models.every((m: any) => m.model !== "")).toBe(true);
    const drilled = (await staff.get(`${BASE}/rows`).query({ ...P, brand: EMPTY, drill: "model", key: unknown.key })).body;
    expect([drilled.total, drilled.amount]).toEqual([1, 77]);
    const filtered = (await staff.get(`${BASE}/overview`).query({ ...P, brand: EMPTY, model: "__null" })).body;
    expect(filtered.tiles).toMatchObject({ count: 1, total: 77 });
    const line = (await staff.get(`${BASE}/vehicles`).query({ ...P, vehicleId: String(noModel) })).body.vehicles[0];
    expect(line).toMatchObject({ brand: EMPTY, model: null });
  });

  it("a removed vehicle without snapshot has brand and model null; brand __null filters and drills to it", async () => {
    const line = (await staff.get(`${BASE}/vehicles`).query({ ...P, vehicleId: String(orphan) })).body.vehicles[0];
    expect(line).toMatchObject({ brand: null, model: null, total: 55 });
    const brands = (await staff.get(`${BASE}/brands`).query({ ...P, brand: "__null" })).body;
    expect(brands.brands).toHaveLength(1);
    expect(brands.brands[0].brand).toBeNull();
    const b = brands.brands[0];
    const drilled = (await staff.get(`${BASE}/rows`).query({ ...P, drill: "brand", key: "__null" })).body;
    expect([drilled.total, drilled.amount]).toEqual([b.count, b.total]);
    expect(drilled.rows.some((r: any) => r.vehicleId === orphan)).toBe(true);
    const filtered = (await staff.get(`${BASE}/overview`).query({ ...P, brand: "__null" })).body;
    expect([filtered.tiles.count, filtered.tiles.total]).toEqual([b.count, b.total]);
    // Every brand and model in the unfiltered answer is null or a real name, never "".
    const all = (await staff.get(`${BASE}/brands`).query(P)).body;
    expect(all.brands.some((x: any) => x.brand === "")).toBe(false);
    expect(all.models.some((x: any) => x.brand === "" || x.model === "")).toBe(false);
  });

  it("km-band matrix: an Onbekende km column (band null) so a brand row adds up to the brand total", async () => {
    const res = (await admin.get(`${BASE}/brands`).query({ ...P, brand: FIX })).body;
    const brandLines = res.kmBands.filter((l: any) => l.level === "brand");
    const unknown = brandLines.find((l: any) => l.band === null);
    expect(unknown).toMatchObject({ brand: FIX, model: null, band: null, amount: 400, count: 1, km: 0, perKm: null, vehicles: 1 });
    const sum = brandLines.reduce((n: number, l: any) => n + l.amount, 0);
    expect(sum).toBe(res.brands[0].total);
    expect(res.kmBands.filter((l: any) => l.level === "model").reduce((n: number, l: any) => n + l.amount, 0)).toBe(700);
    const rows = (await admin.get(`${BASE}/rows`).query({ ...P, brand: FIX, drill: "kmBand", key: "__null" })).body;
    expect([rows.total, rows.amount]).toEqual([1, 400]);
    // With a km-band filter there is no unknown column.
    const banded = (await admin.get(`${BASE}/brands`).query({ ...P, brand: FIX, kmBand: "50–100.000" })).body;
    expect(banded.kmBands.some((l: any) => l.band === null)).toBe(false);
  });

  it("a km-band filter narrows the vehicle list and the brand's vehicle count to cars with costs or km in that band", async () => {
    const q = { ...P, brand: FIX, kmBand: "50–100.000" };
    const list = (await admin.get(`${BASE}/vehicles`).query(q)).body.vehicles;
    expect(list.map((v: any) => v.vehicleId)).toEqual([fix.A1]);
    const brands = (await admin.get(`${BASE}/brands`).query(q)).body;
    expect(brands.brands[0]).toMatchObject({ brand: FIX, vehicles: 1, vehiclesWithCosts: 1, total: 300 });
    // Without the filter all three count.
    expect((await admin.get(`${BASE}/brands`).query({ ...P, brand: FIX })).body.brands[0].vehicles).toBe(3);
  });
});
