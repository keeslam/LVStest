/**
 * Kilometerhistorie: alles eromheen is alleen voor beheerders (bekijken,
 * printen, CSV), en het rapport "km per maand" ook.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { agentFor, cleanupFixtureUsers, type TestAgent } from "./helpers/app";
import { createFixtureVehicle, cleanupFixtures } from "./helpers/fixtures";

let admin: TestAgent;
let staff: TestAgent;
let vehicleId: number;

beforeAll(async () => {
  admin = await agentFor("admin");
  staff = await agentFor(["view_reports", "manage_reports", "view_vehicles", "manage_vehicles"]);
  vehicleId = (await createFixtureVehicle()).id;
});
afterAll(async () => {
  await cleanupFixtures();
  await cleanupFixtureUsers();
});

describe("GET /api/mileage-history/:vehicleId", () => {
  it("admin gets rows, summary and vehicle", async () => {
    const res = await admin.get(`/api/mileage-history/${vehicleId}?from=2026-01-01&to=2026-12-31`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("rows");
    expect(res.body).toHaveProperty("summary");
    expect(res.body.vehicle.id).toBe(vehicleId);
  });

  it("works without from/to (defaults)", async () => {
    const res = await admin.get(`/api/mileage-history/${vehicleId}`);
    expect(res.status).toBe(200);
  });

  it("is forbidden for non-admin staff, whatever their report and vehicle rights", async () => {
    const res = await staff.get(`/api/mileage-history/${vehicleId}`);
    expect(res.status).toBe(403);
  });

  it("rejects an impossible date with 400 INVALID_DATE", async () => {
    const res = await admin.get(`/api/mileage-history/${vehicleId}?from=2026-13-40`);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("INVALID_DATE");
  });

  it("rejects from after to with 400 INVALID_DATE", async () => {
    const res = await admin.get(`/api/mileage-history/${vehicleId}?from=2026-05-01&to=2026-04-01`);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("INVALID_DATE");
  });

  it("answers 404 for an unknown vehicle", async () => {
    const res = await admin.get(`/api/mileage-history/2000000000?from=2026-01-01&to=2026-12-31`);
    expect(res.status).toBe(404);
  });
});

describe("GET /api/reports/mileage-per-month", () => {
  it("is admin-only now", async () => {
    expect((await staff.get("/api/reports/mileage-per-month")).status).toBe(403);
    expect((await admin.get("/api/reports/mileage-per-month")).status).toBe(200);
  });
});
