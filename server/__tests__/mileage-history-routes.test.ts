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
  it("is gone: fleet-mileage replaces it", async () => {
    expect((await admin.get("/api/reports/mileage-per-month")).status).toBe(404);
  });
});

describe("POST /api/mileage-history/readings/:id/void and /unvoid (Kees, 2026-10-24)", () => {
  // A mistyped reading that is too high stays the previous reading, so every
  // correct reading after it shows "teruglopende stand" until it is voided.
  it("voiding a typo makes the next reading count again; un-voiding brings it back", async () => {
    const { db } = await import("../db");
    const { vehicleMileageReadings } = await import("@shared/schema");
    const vid = (await createFixtureVehicle()).id;
    const at = (d: string) => new Date(`${d}T11:00:00.000Z`);
    const [, typo] = await db.insert(vehicleMileageReadings).values([
      { vehicleId: vid, mileage: 100000, recordedAt: at("2026-03-01"), source: "manual" },
      { vehicleId: vid, mileage: 1000000, recordedAt: at("2026-03-02"), source: "manual" },
      { vehicleId: vid, mileage: 100200, recordedAt: at("2026-03-03"), source: "manual" },
    ]).returning();
    const url = `/api/mileage-history/${vid}?from=2026-03-01&to=2026-03-31`;

    const before = (await admin.get(url)).body;
    // The jump is listed with its warning but is not the next "previous" (final review 2026-10-25),
    // so the correction already counts from 100 000; voiding only clears the warning.
    expect(before.rows[1].warning).toBe("jump");
    expect(before.rows[2].warning).toBeNull();
    expect(before.rows[2].drivenSincePrevious).toBe(200);
    expect(before.summary.warnings).toBe(1);

    const voided = await admin.post(`/api/mileage-history/readings/${typo.id}/void`);
    expect(voided.status).toBe(200);
    expect(voided.body.voided).toBe(true);
    const after = (await admin.get(url)).body;
    expect(after.rows[1].voided).toBe(true);
    expect(after.rows[2].warning).toBeNull();
    expect(after.rows[2].drivenSincePrevious).toBe(200);
    expect(after.summary.drivenKm).toBe(200);
    expect(after.summary.warnings).toBe(0);

    const back = await admin.post(`/api/mileage-history/readings/${typo.id}/unvoid`);
    expect(back.status).toBe(200);
    expect(back.body.voided).toBe(false);
    expect((await admin.get(url)).body.rows[1].warning).toBe("jump");
  });

  it("is admin only and answers 404 for an unknown reading", async () => {
    expect((await staff.post(`/api/mileage-history/readings/1/void`)).status).toBe(403);
    const res = await admin.post(`/api/mileage-history/readings/999999999/void`);
    expect(res.status).toBe(404);
    expect(res.body.code).toBe("READING_NOT_FOUND");
  });
});
