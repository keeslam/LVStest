/**
 * Report builder: every field it offers must be queryable, old saved-report
 * field names keep working, and removed fields give a clear message.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { DATA_SOURCES } from "@shared/report-builder-config";
import { agentFor, cleanupFixtureUsers, type TestAgent } from "./helpers/app";

describe("report builder fields", () => {
  let admin: TestAgent;

  beforeAll(async () => {
    admin = await agentFor("admin");
  });

  afterAll(async () => {
    await cleanupFixtureUsers();
  });

  it("de bouwer biedt precies deze bronnen", () => {
    expect(DATA_SOURCES.map((s) => s.id)).toEqual([
      "vehicles", "customers", "reservations", "expenses", "drivers",
      "fines", "transports", "workshop_visits", "damage_checks", "mileage_readings",
    ]);
  });

  it("elk aangeboden veld van elke bron is opvraagbaar", async () => {
    for (const source of DATA_SOURCES) {
      for (const field of source.fields) {
        const res = await admin.post("/api/reports/execute").send({
          dataSources: [source.id],
          columns: [{ table: source.table, field: field.name }],
        });
        expect(res.status, `${source.id}.${field.name}`).toBe(200);
      }
    }
  });

  it("een opgeslagen rapport met een oude veldnaam werkt nog", async () => {
    const res = await admin.post("/api/reports/execute").send({
      dataSources: ["reservations"],
      columns: [{ table: "reservations", field: "totalAmount" }],
    });
    expect(res.status).toBe(200);
  });

  it("een verwijderd veld geeft een duidelijke melding", async () => {
    const res = await admin.post("/api/reports/execute").send({
      dataSources: ["reservations"],
      columns: [{ table: "reservations", field: "paidAmount" }],
    });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("REPORT_FIELD_REMOVED");
    expect(res.body.field).toBe("reservations.paidAmount");
  });
});
