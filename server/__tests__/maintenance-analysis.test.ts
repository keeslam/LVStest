/**
 * Onderhoudsanalyse (Kees, 2026-10-26), Task 2: the server analysis behind the window.
 * Fixtures: two brands, three models, vehicles with km history in different bands and
 * costs with suppliers (spelled three ways for one garage).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { inArray } from "drizzle-orm";
import { db } from "../db";
import { UserPermission, expenses, vehicleMileageReadings } from "../../shared/schema";
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
      { brand: FIAT, model: "DUCATO", band: "0–50.000", amount: 100, km: 10000, perKm: 0.01, vehicles: 1, count: 1 },
      { brand: FIAT, model: "DUCATO", band: "50–100.000", amount: 600, km: 30000, perKm: 0.02, vehicles: 1, count: 1 },
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
});
