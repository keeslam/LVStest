/**
 * Reports redesign part 2, task 1: a builder report runs within a period (the
 * report's periodField) and one vehicle, and a saved report can be updated.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { vehicles, fines, savedReports } from "../../shared/schema";
import { agentFor, cleanupFixtureUsers, type TestAgent } from "./helpers/app";
import { createFixtureVehicle, cleanupFixtures } from "./helpers/fixtures";

describe("report builder scope and update", () => {
  let admin: TestAgent;
  let V1: number;
  let V2: number;
  const fineIds: number[] = [];
  const savedIds: number[] = [];

  const base = (extra: Record<string, unknown> = {}) => ({
    name: "t",
    dataSources: ["fines"],
    columns: [{ table: "fines", field: "id" }],
    filters: [{ table: "fines", field: "vehicleId", operator: "between", value: Math.min(V1, V2), value2: Math.max(V1, V2) }],
    ...extra,
  });
  const ids = (res: any) => res.body.map((r: any) => r.id).sort((a: number, b: number) => a - b);

  beforeAll(async () => {
    admin = await agentFor("admin");
    V1 = (await createFixtureVehicle()).id;
    V2 = (await createFixtureVehicle()).id;
    const plate = async (id: number) => (await db.select().from(vehicles).where(eq(vehicles.id, id)))[0].licensePlate;
    const [p1, p2] = [await plate(V1), await plate(V2)];
    const row = (licensePlate: string, vehicleId: number, offenceAt: string) => ({
      licensePlate, vehicleId, offenceAt: new Date(offenceAt), description: "fixt", amount: "10", adminFee: "0", totalAmount: "10", status: "new",
    });
    const inserted = await db.insert(fines).values([
      row(p1, V1, "2026-09-30T23:30:00Z"), // 1 Oct 01:30 in office time
      row(p1, V1, "2026-10-15T10:00:00Z"),
      row(p2, V2, "2026-10-20T10:00:00Z"),
      row(p1, V1, "2026-09-10T10:00:00Z"),
      row(p2, V2, "2026-11-01T12:00:00Z"),
    ] as any).returning({ id: fines.id });
    fineIds.push(...inserted.map((f) => f.id));
  });

  afterAll(async () => {
    if (savedIds.length) await db.delete(savedReports).where(inArray(savedReports.id, savedIds));
    if (fineIds.length) await db.delete(fines).where(inArray(fines.id, fineIds));
    await cleanupFixtures();
    await cleanupFixtureUsers();
  });

  const october = { from: "2026-10-01", to: "2026-10-31" };

  it("periodeveld + scope: alleen regels in de periode, in kantoortijd", async () => {
    const res = await admin.post("/api/reports/execute").send({ ...base({ periodField: "offenceAt" }), scope: october });
    expect(res.status).toBe(200);
    expect(ids(res)).toEqual([fineIds[0], fineIds[1], fineIds[2]].sort((a, b) => a - b));
  });

  it("zonder periodeveld telt de periode niet mee", async () => {
    const res = await admin.post("/api/reports/execute").send({ ...base(), scope: october });
    expect(res.status).toBe(200);
    expect(ids(res)).toEqual([...fineIds].sort((a, b) => a - b));
  });

  it("scope met vehicleId: alleen die auto", async () => {
    const res = await admin.post("/api/reports/execute").send({ ...base({ periodField: "offenceAt" }), scope: { ...october, vehicleId: V2 } });
    expect(res.status).toBe(200);
    expect(ids(res)).toEqual([fineIds[2]]);
  });

  it("scope met groepering per maand: alleen maanden in de periode", async () => {
    const res = await admin.post("/api/reports/execute").send({
      ...base({
        periodField: "offenceAt",
        columns: [{ table: "fines", field: "offenceAt" }, { table: "fines", field: "id", aggregation: "COUNT" }],
        groupBy: [{ table: "fines", field: "offenceAt", period: "month" }],
      }),
      scope: october,
    });
    expect(res.status).toBe(200);
    expect(res.body.map((r: any) => [r.offenceAt, Number(r.id)])).toEqual([["2026-10", 3]]);
  });

  it("periodeveld dat geen datum is geeft 400", async () => {
    const res = await admin.post("/api/reports/execute").send({ ...base({ periodField: "status" }), scope: october });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ code: "REPORT_PERIOD_FIELD_INVALID" });
  });

  it("een slechte periode geeft 400", async () => {
    const res = await admin.post("/api/reports/execute").send({ ...base({ periodField: "offenceAt" }), scope: { from: "x", to: "2026-10-31" } });
    expect(res.status).toBe(400);
  });

  it("klanten + vehicleId: voertuig wordt genegeerd", async () => {
    const res = await admin.post("/api/reports/execute").send({
      name: "t", dataSources: ["customers"], columns: [{ table: "customers", field: "id", aggregation: "COUNT" }], filters: [],
      scope: { ...october, vehicleId: V1 },
    });
    expect(res.status).toBe(200);
  });

  it("opslaan met een ongeldig tabblad geeft 400", async () => {
    const bad = await admin.post("/api/reports/saved").send(base({ tab: "overview" }));
    expect(bad.status).toBe(400);
    const badPeriod = await admin.post("/api/reports/saved").send(base({ tab: "office", periodField: "status" }));
    expect(badPeriod.status).toBe(400);
    expect(badPeriod.body).toMatchObject({ code: "REPORT_PERIOD_FIELD_INVALID" });
    const ok = await admin.post("/api/reports/saved").send(base({ tab: "office", periodField: "offenceAt" }));
    expect(ok.status).toBe(200);
    savedIds.push(ok.body.id);
    expect(ok.body.configuration).toMatchObject({ tab: "office", periodField: "offenceAt" });
  });

  it("PUT werkt een rapport bij", async () => {
    const created = await admin.post("/api/reports/saved").send(base({ name: "voor" }));
    savedIds.push(created.body.id);
    const res = await admin.put(`/api/reports/saved/${created.body.id}`).send(base({ name: "na", tab: "transports", periodField: "offenceAt" }));
    expect(res.status).toBe(200);
    expect(res.body.name).toBe("na");
    expect(res.body.configuration.tab).toBe("transports");
    const bad = await admin.put(`/api/reports/saved/${created.body.id}`).send(base({ tab: "fiscal" }));
    expect(bad.status).toBe(400);
  });

  it("PUT zonder bronrecht geeft 403 en laat het rapport ongewijzigd", async () => {
    const created = await admin.post("/api/reports/saved").send(base({ name: "boetes" }));
    savedIds.push(created.body.id);
    const manager = await agentFor(["view_reports", "manage_reports"]);
    const res = await manager.put(`/api/reports/saved/${created.body.id}`).send(base({ name: "gewijzigd", tab: "office" }));
    expect(res.status).toBe(403);
    const [row] = await db.select().from(savedReports).where(eq(savedReports.id, created.body.id));
    expect(row.name).toBe("boetes");
    expect((row.configuration as any).tab).toBeUndefined();
  });

  it("PUT met een nieuwe bron zonder recht geeft 403", async () => {
    const manager = await agentFor(["view_reports", "manage_reports", "view_vehicles"]);
    const mine = await manager.post("/api/reports/saved").send({
      name: "auto", dataSources: ["vehicles"], columns: [{ table: "vehicles", field: "id" }], filters: [],
    });
    expect(mine.status).toBe(200);
    savedIds.push(mine.body.id);
    const res = await manager.put(`/api/reports/saved/${mine.body.id}`).send(base());
    expect(res.status).toBe(403);
  });

  it("PUT op een onbekend id geeft 404", async () => {
    const res = await admin.put("/api/reports/saved/999999999").send(base());
    expect(res.status).toBe(404);
  });
});
