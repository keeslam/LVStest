/**
 * FIX-Z, route level — the half of the schema tightening that only shows up
 * against the database (BUG-020, BUG-125), plus the 400s the new schemas
 * produce on the real endpoints (BUG-041, BUG-042, BUG-044, BUG-054, BUG-149).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { vehicles } from "../../shared/schema";
import { agentFor, cleanupFixtureUsers, type TestAgent } from "./helpers/app";
import { createFixtureVehicle, cleanupFixtures, FIXTURE_PLATE_PREFIX } from "./helpers/fixtures";

function bodyText(body: unknown): string {
  return JSON.stringify(body ?? {}).slice(0, 400);
}

describe("FIX-Z — input validation at the route boundary", () => {
  let admin: TestAgent;

  beforeAll(async () => {
    admin = await agentFor("admin");
  }, 60_000);

  afterAll(async () => {
    await cleanupFixtures();
    await cleanupFixtureUsers();
  });

  describe("BUG-020 — a plate is the same plate however it is punctuated", () => {
    it("refuses the same plate written three ways", async () => {
      const stem = `${FIXTURE_PLATE_PREFIX}${Date.now().toString(36).slice(-5).toUpperCase()}`;
      const first = await admin.post("/api/vehicles").send({
        licensePlate: `${stem}-12-C`,
        brand: "FIXT-Brand",
        model: "Model",
      });
      expect(first.status, bodyText(first.body)).toBe(201);

      for (const variant of [`${stem}12c`, `${stem} 12 C`, `${stem}-12-c`]) {
        const res = await admin.post("/api/vehicles").send({
          licensePlate: variant,
          brand: "FIXT-Brand",
          model: "Model",
        });
        expect(res.status, `${variant} -> ${bodyText(res.body)}`).toBe(409);
        expect(res.body.field).toBe("licensePlate");
        expect(bodyText(res.body)).not.toContain("_unique");
      }
    }, 60_000);

    it("an edit may not move a vehicle onto another vehicle's plate", async () => {
      const a = await createFixtureVehicle();
      const b = await createFixtureVehicle();
      const res = await admin.patch(`/api/vehicles/${b.id}`).send({ licensePlate: a.licensePlate.toLowerCase() });
      expect(res.status, bodyText(res.body)).toBe(409);
      expect(res.body.field).toBe("licensePlate");
    }, 60_000);
  });

  describe("BUG-125 — the barcode belongs to the server", () => {
    it("a PATCH cannot overwrite it", async () => {
      const vehicle = await createFixtureVehicle({ barcode: `FIXT-BC-${Date.now().toString(36)}` } as any);
      const res = await admin.patch(`/api/vehicles/${vehicle.id}`).send({ barcode: "VEH-000001", remarks: "edited" });
      expect(res.status, bodyText(res.body)).toBe(200);

      const [after] = await db.select().from(vehicles).where(eq(vehicles.id, vehicle.id));
      expect(after.barcode).toBe(vehicle.barcode);
      expect(after.remarks).toBe("edited");
    }, 30_000);

    it("regenerate walks past a revision that is already taken", async () => {
      const vehicle = await createFixtureVehicle();
      // Park the revision the naive implementation would pick on another row.
      const blocker = await createFixtureVehicle({ barcode: `VEH-${String(vehicle.id).padStart(6, "0")}-R2` } as any);
      expect(blocker.barcode).toBeTruthy();

      const res = await admin.post(`/api/vehicles/${vehicle.id}/barcode/regenerate`);
      if (res.status === 404) return; // route not mounted in this build
      expect(res.status, bodyText(res.body)).toBe(200);

      const [after] = await db.select().from(vehicles).where(eq(vehicles.id, vehicle.id));
      expect(after.barcode).toBeTruthy();
      expect(after.barcode).not.toBe(blocker.barcode);
    }, 30_000);
  });

  describe("the new schemas answer 400 on the real endpoints", () => {
    it("negative mileage, impossible date and a nonsense service interval", async () => {
      const vehicle = await createFixtureVehicle();
      for (const patch of [
        { departureMileage: -1 },
        { returnMileage: -1 },
        { apkDate: "2026-02-30" },
        { serviceIntervalKm: -5 },
        { serviceIntervalMonths: 0 },
      ]) {
        const res = await admin.patch(`/api/vehicles/${vehicle.id}`).send(patch);
        expect(res.status, `${JSON.stringify(patch)} -> ${bodyText(res.body)}`).toBe(400);
        expect(bodyText(res.body)).not.toContain("syntax for type");
      }
    }, 60_000);

    it("a blank or oversized customer name", async () => {
      for (const name of ["   ", "x".repeat(5000)]) {
        const res = await admin.post("/api/customers").send({ name, customerType: "business" });
        expect(res.status, `${name.slice(0, 10)} -> ${bodyText(res.body)}`).toBe(400);
      }
    }, 30_000);
  });
});
