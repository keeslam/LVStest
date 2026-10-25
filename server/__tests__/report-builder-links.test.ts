/**
 * Reports redesign part 3: builder fields from the linked vehicle, customer,
 * reservation and driver. Many-to-one only (a row never doubles), the target
 * source needs its own right, km fields stay admin only.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { fines, savedReports, vehicles } from "../../shared/schema";
import { DATA_SOURCES, linkedSourcesOf, canUseReportField } from "../../shared/report-builder-config";
import * as schema from "../../shared/schema";
import { agentFor, cleanupFixtureUsers, type TestAgent } from "./helpers/app";
import { createFixtureVehicle, createFixtureCustomer, createFixtureReservation, cleanupFixtures } from "./helpers/fixtures";

describe("report builder links", () => {
  let admin: TestAgent;
  let V1: number;
  let V2: number;
  let K: number;
  let KName: string;
  const brand1 = `FIXT-Link-A-${Date.now()}`;
  const brand2 = `FIXT-Link-B-${Date.now()}`;
  const DESC = `FIXT-link-${Date.now()}`;
  const fineIds: number[] = [];
  const savedIds: number[] = [];

  const finesOf = (extra: { columns: unknown[]; filters?: unknown[]; groupBy?: unknown[] }) => ({
    name: "t",
    dataSources: ["fines"],
    columns: extra.columns,
    groupBy: extra.groupBy ?? [],
    filters: [...(extra.filters ?? []), { table: "fines", field: "description", operator: "equals", value: DESC }],
  });

  beforeAll(async () => {
    admin = await agentFor("admin");
    V1 = (await createFixtureVehicle({ brand: brand1 })).id;
    V2 = (await createFixtureVehicle({ brand: brand2 })).id;
    const customer = await createFixtureCustomer("Koppeling");
    K = customer.id;
    KName = customer.name;
    const R = (await createFixtureReservation({ vehicleId: V1, customerId: K })).id;
    const plate = (await db.select().from(vehicles).where(eq(vehicles.id, V1)))[0].licensePlate;
    const rows = await db.insert(fines).values([
      { licensePlate: plate, vehicleId: V1, customerId: K, reservationId: R, offenceAt: new Date("2019-01-10T10:00:00Z"), description: DESC, amount: "40", adminFee: "10", totalAmount: "50", status: "linked" },
      { licensePlate: plate, vehicleId: V1, customerId: null, offenceAt: new Date("2019-01-11T10:00:00Z"), description: DESC, amount: "20", adminFee: "0", totalAmount: "20", status: "new" },
      { licensePlate: plate, vehicleId: V2, customerId: K, offenceAt: new Date("2019-01-12T10:00:00Z"), description: DESC, amount: "30", adminFee: "0", totalAmount: "30", status: "linked" },
    ] as any).returning({ id: fines.id });
    fineIds.push(...rows.map((r) => r.id));
  });

  afterAll(async () => {
    if (savedIds.length) await db.delete(savedReports).where(inArray(savedReports.id, savedIds));
    if (fineIds.length) await db.delete(fines).where(inArray(fines.id, fineIds));
    await cleanupFixtures();
    await cleanupFixtureUsers();
  });

  it("every link column exists on the main table, and every target is a known source", () => {
    const tables: Record<string, any> = {
      vehicles: schema.vehicles, customers: schema.customers, reservations: schema.reservations,
      expenses: schema.expenses, drivers: schema.drivers, fines: schema.fines,
      vehicle_transports: schema.vehicleTransports, workshop_visits: schema.reservations,
      interactive_damage_checks: schema.interactiveDamageChecks, vehicle_mileage_readings: schema.vehicleMileageReadings,
    };
    for (const source of DATA_SOURCES) {
      for (const link of source.links ?? []) {
        expect(tables[source.table][link.column], `${source.id} ${link.name}`).toBeTruthy();
        expect(DATA_SOURCES.some((s) => s.id === link.target)).toBe(true);
      }
    }
    expect(linkedSourcesOf({ dataSources: ["fines"], columns: [{ table: "customers", field: "name", via: "customer" }], filters: [], groupBy: [] } as any))
      .toEqual(["customers"]);
  });

  it("each fine is one row, with the brand and the customer name; no customer gives null", async () => {
    const res = await admin.post("/api/reports/execute").send(finesOf({
      columns: [
        { table: "fines", field: "id" },
        { table: "fines", field: "offenceAt" },
        { table: "vehicles", field: "brand", via: "vehicle" },
        { table: "customers", field: "name", via: "customer" },
      ],
    }));
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(3);
    const byId = new Map(res.body.map((r: any) => [r.id, r]));
    expect((byId.get(fineIds[0]) as any)["vehicle.brand"]).toBe(brand1);
    expect((byId.get(fineIds[0]) as any)["customer.name"]).toBe(KName);
    expect((byId.get(fineIds[1]) as any)["customer.name"]).toBeNull();
    expect((byId.get(fineIds[2]) as any)["vehicle.brand"]).toBe(brand2);
    expect(Object.keys(res.body[0])).toContain("offenceAt");
  });

  it("grouping on a linked field counts every fine once", async () => {
    const res = await admin.post("/api/reports/execute").send(finesOf({
      columns: [
        { table: "vehicles", field: "brand", via: "vehicle" },
        { table: "fines", field: "id", aggregation: "COUNT" },
      ],
      groupBy: [{ table: "vehicles", field: "brand", via: "vehicle" }],
    }));
    expect(res.status).toBe(200);
    expect(res.body.map((r: any) => [r["vehicle.brand"], Number(r.id)])).toEqual([[brand1, 2], [brand2, 1]]);
    expect(res.body.reduce((s: number, r: any) => s + Number(r.id), 0)).toBe(3);
  });

  it("a linked date field groups per month too", async () => {
    const res = await admin.post("/api/reports/execute").send(finesOf({
      columns: [
        { table: "reservations", field: "startDate", via: "reservation" },
        { table: "fines", field: "id", aggregation: "COUNT" },
      ],
      groupBy: [{ table: "reservations", field: "startDate", via: "reservation", period: "month" }],
    }));
    expect(res.status).toBe(200);
    expect(res.body.map((r: any) => [r["reservation.startDate"], Number(r.id)])).toEqual([["2026-10", 1], [null, 2]]);
  });

  it("filters on a linked field", async () => {
    const res = await admin.post("/api/reports/execute").send(finesOf({
      columns: [{ table: "fines", field: "id" }],
      filters: [{ table: "customers", field: "name", via: "customer", operator: "equals", value: KName }],
    }));
    expect(res.status).toBe(200);
    expect(res.body.map((r: any) => r.id).sort((a: number, b: number) => a - b)).toEqual([fineIds[0], fineIds[2]]);
  });

  it("a plain column next to a grouped linked field must be in the grouping", async () => {
    const res = await admin.post("/api/reports/execute").send(finesOf({
      columns: [{ table: "vehicles", field: "brand", via: "vehicle" }, { table: "fines", field: "id", aggregation: "COUNT" }],
      groupBy: [{ table: "vehicles", field: "brand" }],
    }));
    expect(res.status).toBe(400);
  });

  it("an unknown link is 400 REPORT_LINK_INVALID", async () => {
    const res = await admin.post("/api/reports/execute").send(finesOf({
      columns: [{ table: "vehicles", field: "brand", via: "garage" }],
    }));
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("REPORT_LINK_INVALID");
  });

  it("a link to another table than its target is 400", async () => {
    const res = await admin.post("/api/reports/execute").send(finesOf({
      columns: [{ table: "customers", field: "name", via: "vehicle" }],
    }));
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("REPORT_LINK_INVALID");
  });

  it("a link from a source that does not have it is 400", async () => {
    const res = await admin.post("/api/reports/execute").send({
      dataSources: ["expenses"], columns: [{ table: "customers", field: "name", via: "customer" }], filters: [],
    });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("REPORT_LINK_INVALID");
  });

  it("without the customer right a linked customer field is 403, and such a saved report is hidden", async () => {
    const cfg = finesOf({ columns: [{ table: "fines", field: "id" }, { table: "customers", field: "name", via: "customer" }] });
    const saved = await admin.post("/api/reports/saved").send({ ...cfg, name: `Link fixt ${Date.now()}` });
    expect(saved.status).toBe(200);
    savedIds.push(saved.body.id);

    const user = await agentFor(["view_reports", "manage_reports", "view_fines"]);
    const res = await user.post("/api/reports/execute").send(cfg);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("REPORT_SOURCE_RIGHT_REQUIRED");
    expect(res.body.source).toBe("customers");
    const plain = await user.post("/api/reports/execute").send(finesOf({ columns: [{ table: "fines", field: "id" }] }));
    expect(plain.status).toBe(200);

    expect((await user.get("/api/reports/saved")).body.map((r: any) => r.id)).not.toContain(saved.body.id);
    expect((await admin.get("/api/reports/saved")).body.map((r: any) => r.id)).toContain(saved.body.id);
    const post = await user.post("/api/reports/saved").send({ ...cfg, name: "nope" });
    expect(post.status).toBe(403);
    expect(post.body.code).toBe("REPORT_SOURCE_RIGHT_REQUIRED");
    const put = await user.put(`/api/reports/saved/${saved.body.id}`).send({ ...cfg, name: "nope" });
    expect(put.status).toBe(403);
  });

  it("a filter on a linked field needs the target right as well", async () => {
    const user = await agentFor(["view_reports", "view_fines"]);
    const res = await user.post("/api/reports/execute").send(finesOf({
      columns: [{ table: "fines", field: "id" }],
      filters: [{ table: "customers", field: "name", via: "customer", operator: "equals", value: "X" }],
    }));
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("REPORT_SOURCE_RIGHT_REQUIRED");
  });

  it("km fields through a link stay admin only", async () => {
    const cfg = finesOf({ columns: [{ table: "fines", field: "id" }, { table: "vehicles", field: "currentMileage", via: "vehicle" }] });
    const user = await agentFor(["view_reports", "view_fines", "view_vehicles", "manage_vehicles"]);
    const res = await user.post("/api/reports/execute").send(cfg);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("REPORT_SOURCE_RIGHT_REQUIRED");
    expect((await admin.post("/api/reports/execute").send(cfg)).status).toBe(200);
    const brand = await user.post("/api/reports/execute").send(finesOf({ columns: [{ table: "vehicles", field: "brand", via: "vehicle" }] }));
    expect(brand.status).toBe(200);
  });

  it("a via that is not a string never slips past the rights", async () => {
    const noCustomer = await agentFor(["view_reports", "manage_reports", "view_fines"]);
    for (const via of [["customer"], { name: "customer" }, 1, true]) {
      const res = await noCustomer.post("/api/reports/execute").send(finesOf({
        columns: [{ table: "fines", field: "id" }, { table: "customers", field: "name", via }],
      }));
      expect([400, 403], JSON.stringify(via)).toContain(res.status);
      const filtered = await noCustomer.post("/api/reports/execute").send(finesOf({
        columns: [{ table: "fines", field: "id" }],
        filters: [{ table: "customers", field: "name", via, operator: "equals", value: KName }],
      }));
      expect([400, 403], JSON.stringify(via)).toContain(filtered.status);
    }
    const asAdmin = await admin.post("/api/reports/execute").send(finesOf({
      columns: [{ table: "customers", field: "name", via: ["customer"] }],
    }));
    expect(asAdmin.status).toBe(400);
    expect(asAdmin.body.code).toBe("REPORT_LINK_INVALID");
    const vehicleUser = await agentFor(["view_reports", "view_fines", "view_vehicles"]);
    const km = await vehicleUser.post("/api/reports/execute").send(finesOf({
      columns: [{ table: "vehicles", field: "currentMileage", via: ["vehicle"] }],
    }));
    expect([400, 403]).toContain(km.status);
    const saved = await admin.post("/api/reports/saved").send({ ...finesOf({ columns: [{ table: "customers", field: "name", via: ["customer"] }] }), name: "x" });
    expect(saved.status).toBe(400);
  });

  it("several links in one report: plain and linked fields with the same name stay apart", async () => {
    const res = await admin.post("/api/reports/execute").send(finesOf({
      columns: [
        { table: "fines", field: "id" },
        { table: "fines", field: "status" },
        { table: "vehicles", field: "id", via: "vehicle" },
        { table: "reservations", field: "status", via: "reservation" },
        { table: "customers", field: "name", via: "customer" },
        { table: "drivers", field: "firstName", via: "driver" },
      ],
    }));
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(3);
    const first = res.body.find((r: any) => r.id === fineIds[0]);
    expect(first.status).toBe("linked");
    expect(first["reservation.status"]).toBe("booked");
    expect(first["vehicle.id"]).toBe(V1);
    expect(first["customer.name"]).toBe(KName);
    expect(first["driver.firstName"]).toBeNull();
    const grouped = await admin.post("/api/reports/execute").send(finesOf({
      columns: [
        { table: "fines", field: "status" },
        { table: "reservations", field: "status", via: "reservation" },
        { table: "fines", field: "id", aggregation: "COUNT" },
      ],
      groupBy: [{ table: "fines", field: "status" }, { table: "reservations", field: "status", via: "reservation" }],
    }));
    expect(grouped.status).toBe(200);
    expect(grouped.body.map((r: any) => [r.status, r["reservation.status"], Number(r.id)]))
      .toEqual([["linked", "booked", 1], ["linked", null, 1], ["new", null, 1]]);
  });

  it("saving a report with an unknown link is 400 REPORT_LINK_INVALID", async () => {
    const bad = { ...finesOf({ columns: [{ table: "vehicles", field: "brand", via: "garage" }] }), name: `Bad link ${Date.now()}` };
    const post = await admin.post("/api/reports/saved").send(bad);
    expect(post.status).toBe(400);
    expect(post.body.code).toBe("REPORT_LINK_INVALID");
    const wrongTable = await admin.post("/api/reports/saved").send({ ...bad, columns: [{ table: "customers", field: "name", via: "vehicle" }] });
    expect(wrongTable.status).toBe(400);
    expect(wrongTable.body.code).toBe("REPORT_LINK_INVALID");
    const good = await admin.post("/api/reports/saved").send({ ...bad, columns: [{ table: "vehicles", field: "brand", via: "vehicle" }] });
    expect(good.status).toBe(200);
    savedIds.push(good.body.id);
    const put = await admin.put(`/api/reports/saved/${good.body.id}`).send(bad);
    expect(put.status).toBe(400);
    expect(put.body.code).toBe("REPORT_LINK_INVALID");
  });
});

describe("km fields in the builder are admin only", () => {
  let admin: TestAgent;
  let staff: TestAgent;
  const savedIds: number[] = [];
  const vehicleRights = ["view_reports", "manage_reports", "view_vehicles", "manage_vehicles", "view_reservations", "view_damage_checks"];

  beforeAll(async () => {
    admin = await agentFor("admin");
    staff = await agentFor(vehicleRights);
  });
  afterAll(async () => {
    if (savedIds.length) await db.delete(savedReports).where(inArray(savedReports.id, savedIds));
    await cleanupFixtureUsers();
  });

  it("marks every km field and canUseReportField follows it", () => {
    const km = DATA_SOURCES.flatMap((s) => s.fields.filter((f) => f.adminOnly).map((f) => `${f.table}.${f.name}`)).sort();
    expect(km).toEqual([
      "interactive_damage_checks.mileage",
      "reservations.pickupMileage",
      "reservations.returnMileage",
      "vehicle_mileage_readings.mileage",
      "vehicles.currentMileage",
    ]);
    const vehiclesSource = DATA_SOURCES.find((s) => s.id === "vehicles")!;
    expect(canUseReportField({ role: "user", permissions: vehicleRights }, vehiclesSource, "currentMileage")).toBe(false);
    expect(canUseReportField({ role: "user", permissions: vehicleRights }, vehiclesSource, "brand")).toBe(true);
    expect(canUseReportField({ role: "admin", permissions: [] }, vehiclesSource, "currentMileage")).toBe(true);
  });

  it.each([
    ["column", { dataSources: ["vehicles"], columns: [{ table: "vehicles", field: "currentMileage" }], filters: [], groupBy: [] }],
    ["filter", { dataSources: ["vehicles"], columns: [{ table: "vehicles", field: "id" }], filters: [{ table: "vehicles", field: "currentMileage", operator: "greater_than", value: 0 }], groupBy: [] }],
    ["group", { dataSources: ["reservations"], columns: [{ table: "reservations", field: "pickupMileage" }, { table: "reservations", field: "id", aggregation: "COUNT" }], filters: [], groupBy: [{ table: "reservations", field: "pickupMileage" }] }],
    ["aggregation", { dataSources: ["reservations"], columns: [{ table: "reservations", field: "returnMileage", aggregation: "SUM" }], filters: [], groupBy: [] }],
    ["damage check", { dataSources: ["damage_checks"], columns: [{ table: "interactive_damage_checks", field: "mileage" }], filters: [], groupBy: [] }],
  ])("direct km use (%s) is 403 for staff and 200 for an admin", async (_label, cfg) => {
    const res = await staff.post("/api/reports/execute").send(cfg);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("REPORT_SOURCE_RIGHT_REQUIRED");
    expect((await admin.post("/api/reports/execute").send(cfg)).status).toBe(200);
  });

  it("a saved report with a km field is hidden from staff and cannot be saved or changed by them", async () => {
    const cfg = { name: `Km direct ${Date.now()}`, dataSources: ["vehicles"], columns: [{ table: "vehicles", field: "licensePlate" }, { table: "vehicles", field: "currentMileage" }], filters: [], groupBy: [] };
    const saved = await admin.post("/api/reports/saved").send(cfg);
    expect(saved.status).toBe(200);
    savedIds.push(saved.body.id);
    expect((await staff.get("/api/reports/saved")).body.map((r: any) => r.id)).not.toContain(saved.body.id);
    expect((await admin.get("/api/reports/saved")).body.map((r: any) => r.id)).toContain(saved.body.id);
    expect((await staff.post("/api/reports/saved").send(cfg)).status).toBe(403);
    const plain = { ...cfg, columns: [{ table: "vehicles", field: "licensePlate" }] };
    expect((await staff.put(`/api/reports/saved/${saved.body.id}`).send(plain)).status).toBe(403);
    expect((await staff.post("/api/reports/execute").send(plain)).status).toBe(200);
  });
});
