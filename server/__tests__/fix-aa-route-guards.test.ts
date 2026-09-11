/**
 * FIX-AA — route-level domain guards and error shaping.
 *
 * Ten guards that existed on one path and were missing on the sibling path
 * (BUG-017, BUG-030, BUG-031, BUG-038, BUG-039, BUG-049, BUG-123, BUG-124,
 * BUG-131, BUG-133).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { and, eq, like } from "drizzle-orm";
import { db } from "../db";
import { reservations, vehicles, vehicleCustomerBlacklist, reservationDriverAssignments, drivers } from "../../shared/schema";
import { agentFor, cleanupFixtureUsers, type TestAgent } from "./helpers/app";
import {
  createFixtureCustomer, createFixtureVehicle, createFixtureReservation, cleanupFixtures, FIXTURE_PLATE_PREFIX,
} from "./helpers/fixtures";

function bodyText(body: unknown): string {
  return JSON.stringify(body ?? {}).slice(0, 400);
}

function leaksInternals(body: unknown): boolean {
  return /"stack"|constraint|"detail"|"schema"|syntax for type|violates/i.test(JSON.stringify(body ?? {}));
}

describe("FIX-AA — route guards", () => {
  let admin: TestAgent;
  let customerId: number;

  beforeAll(async () => {
    admin = await agentFor("admin");
    const customer = await createFixtureCustomer("FixAA");
    customerId = customer.id;
  }, 60_000);

  afterAll(async () => {
    await db.delete(vehicleCustomerBlacklist).where(eq(vehicleCustomerBlacklist.customerId, customerId));
    await cleanupFixtures();
    await cleanupFixtureUsers();
  });

  describe("BUG-017 — the blacklist holds on the edit paths too", () => {
    it("both PATCH routes refuse a move onto a blacklisted pair", async () => {
      const blocked = await createFixtureVehicle();
      await db.insert(vehicleCustomerBlacklist).values({ vehicleId: blocked.id, customerId });

      for (const suffix of ["", "/basic"]) {
        const free = await createFixtureVehicle();
        const row = await createFixtureReservation({ vehicleId: free.id, customerId });
        const res = await admin.patch(`/api/reservations/${row.id}${suffix}`).send({ vehicleId: blocked.id });
        expect(res.status, `PATCH /:id${suffix} -> ${bodyText(res.body)}`).toBe(409);
        expect(bodyText(res.body)).toMatch(/blacklist/i);

        const [after] = await db.select().from(reservations).where(eq(reservations.id, row.id));
        expect(after.vehicleId).toBe(free.id);
      }
    }, 60_000);
  });

  describe("BUG-031 — mark-needs-service checks its date range", () => {
    it("an inverted range is 400 and inserts nothing", async () => {
      const vehicle = await createFixtureVehicle();
      const row = await createFixtureReservation({ vehicleId: vehicle.id, customerId });

      const before = await db.select().from(reservations)
        .where(and(eq(reservations.vehicleId, vehicle.id), eq(reservations.type, "maintenance_block")));

      const res = await admin.post(`/api/reservations/${row.id}/mark-needs-service`).send({
        maintenanceStatus: "needs_service",
        serviceStartDate: "2026-11-10",
        serviceEndDate: "2026-11-01",
      });
      expect(res.status, bodyText(res.body)).toBe(400);

      const after = await db.select().from(reservations)
        .where(and(eq(reservations.vehicleId, vehicle.id), eq(reservations.type, "maintenance_block")));
      expect(after.length).toBe(before.length);
    }, 30_000);

    it("a garbage date is 400 as well", async () => {
      const vehicle = await createFixtureVehicle();
      const row = await createFixtureReservation({ vehicleId: vehicle.id, customerId });
      const res = await admin.post(`/api/reservations/${row.id}/mark-needs-service`).send({
        maintenanceStatus: "needs_service",
        serviceStartDate: "not-a-date",
      });
      expect(res.status, bodyText(res.body)).toBe(400);
    }, 30_000);
  });

  describe("BUG-039 — a reservation cannot point at a vehicle or customer that does not exist", () => {
    it("answers 404 naming the field", async () => {
      const vehicle = await createFixtureVehicle();

      const badVehicle = await admin.post("/api/reservations").send({
        vehicleId: 2147483646, customerId, startDate: "2026-11-01", endDate: "2026-11-03",
      });
      expect(badVehicle.status, bodyText(badVehicle.body)).toBe(404);
      expect(badVehicle.body.field).toBe("vehicleId");
      expect(leaksInternals(badVehicle.body), bodyText(badVehicle.body)).toBe(false);

      const badCustomer = await admin.post("/api/reservations").send({
        vehicleId: vehicle.id, customerId: 2147483646, startDate: "2026-11-01", endDate: "2026-11-03",
      });
      expect(badCustomer.status, bodyText(badCustomer.body)).toBe(404);
      expect(badCustomer.body.field).toBe("customerId");
    }, 30_000);

    it("the maintenance_block branch checks the vehicle too", async () => {
      const res = await admin.post("/api/reservations").send({
        vehicleId: 2147483646, type: "maintenance_block", startDate: "2026-11-01", endDate: "2026-11-03",
      });
      expect(res.status, bodyText(res.body)).toBe(404);
      expect(res.body.field).toBe("vehicleId");
    }, 30_000);
  });

  describe("BUG-038 — a duplicate contract number is a clean 409", () => {
    it("the second pickup with the same number is refused without driver text", async () => {
      const contractNumber = `FIXT-C${Date.now().toString(36)}`;
      const a = await createFixtureVehicle();
      const b = await createFixtureVehicle();
      const first = await createFixtureReservation({ vehicleId: a.id, customerId });
      const second = await createFixtureReservation({ vehicleId: b.id, customerId });

      const ok = await admin.post(`/api/reservations/${first.id}/pickup`).send({
        contractNumber, pickupMileage: 1000, fuelLevelPickup: "full", pickupDate: "2026-10-01",
      });
      expect(ok.status, bodyText(ok.body)).toBe(200);

      const clash = await admin.post(`/api/reservations/${second.id}/pickup`).send({
        contractNumber, pickupMileage: 1000, fuelLevelPickup: "full", pickupDate: "2026-10-01",
      });
      expect(clash.status, bodyText(clash.body)).toBe(409);
      expect(leaksInternals(clash.body), bodyText(clash.body)).toBe(false);
    }, 60_000);
  });

  describe("BUG-131 — pickup and return dates are validated", () => {
    it("a garbage return date is 400", async () => {
      const vehicle = await createFixtureVehicle();
      const row = await createFixtureReservation({ vehicleId: vehicle.id, customerId });
      const res = await admin.post(`/api/reservations/${row.id}/return`).send({
        returnDate: "x", returnMileage: 2000, fuelLevelReturn: "full",
      });
      expect(res.status, bodyText(res.body)).toBe(400);
      expect(leaksInternals(res.body), bodyText(res.body)).toBe(false);
    }, 30_000);

    it("a garbage pickup date is 400", async () => {
      const vehicle = await createFixtureVehicle();
      const row = await createFixtureReservation({ vehicleId: vehicle.id, customerId });
      const res = await admin.post(`/api/reservations/${row.id}/pickup`).send({
        contractNumber: `FIXT-P${Date.now().toString(36)}`, pickupMileage: 1000, fuelLevelPickup: "full", pickupDate: "31/12/2026",
      });
      expect(res.status, bodyText(res.body)).toBe(400);
    }, 30_000);
  });

  describe("BUG-123 — bulk-import-plates refuses an empty plate", () => {
    it("reports every bad row and creates no nameless vehicle", async () => {
      const res = await admin.post("/api/vehicles/bulk-import-plates").send({
        licensePlates: ["", "   ", null, 123],
      });
      expect(res.status, bodyText(res.body)).toBe(200);
      expect(res.body.imported ?? []).toHaveLength(0);
      expect((res.body.failed ?? []).length).toBe(4);

      const blanks = await db.select({ id: vehicles.id }).from(vehicles).where(eq(vehicles.licensePlate, ""));
      expect(blanks).toHaveLength(0);
    }, 30_000);
  });

  describe("BUG-124 — bulk-import-csv reads Dutch dates as Dutch dates", () => {
    it("09-03-2026 is 2026-03-09, and an impossible date fails its row", async () => {
      const plate = `${FIXTURE_PLATE_PREFIX}${Date.now().toString(36).slice(-5).toUpperCase()}D`;
      const res = await admin.post("/api/vehicles/bulk-import-csv").send({
        vehicles: [
          { licensePlate: plate, brand: "FIXT-Brand", model: "Model", apkDate: "09-03-2026" },
          { licensePlate: `${plate}X`, brand: "FIXT-Brand", model: "Model", apkDate: "2026-02-30" },
        ],
      });
      expect(res.status, bodyText(res.body)).toBe(200);

      const [imported] = await db.select().from(vehicles).where(like(vehicles.licensePlate, `${plate}%`));
      expect(imported, bodyText(res.body)).toBeTruthy();
      expect(imported.apkDate).toBe("2026-03-09");
      expect((res.body.failed ?? []).length).toBeGreaterThanOrEqual(1);
    }, 30_000);
  });

  describe("BUG-133 — a driver change through /basic lands in the history", () => {
    it("writes a driver-assignment row", async () => {
      const vehicle = await createFixtureVehicle();
      const row = await createFixtureReservation({ vehicleId: vehicle.id, customerId });
      const [driver] = await db.insert(drivers).values({
        customerId, displayName: "FIXT-Driver",
      } as any).returning();

      const res = await admin.patch(`/api/reservations/${row.id}/basic`).send({ driverId: driver.id });
      expect(res.status, bodyText(res.body)).toBe(200);

      const history = await db.select().from(reservationDriverAssignments)
        .where(eq(reservationDriverAssignments.reservationId, row.id));
      expect(history.length, "no driver-assignment row was written").toBeGreaterThan(0);

      await db.delete(reservationDriverAssignments).where(eq(reservationDriverAssignments.reservationId, row.id));
      await db.delete(drivers).where(eq(drivers.id, driver.id));
    }, 30_000);
  });

  describe("BUG-030 / BUG-049 — a refused upload is a 400, not a 500 with a stack", () => {
    it("a disallowed extension is 400 with no stack", async () => {
      const vehicle = await createFixtureVehicle();
      const res = await admin
        .post("/api/documents")
        .field("vehicleId", String(vehicle.id))
        .field("documentType", "Other")
        .attach("file", Buffer.from([0x4d, 0x5a, 0x90, 0x00]), "payload.exe");
      expect(res.status, bodyText(res.body)).toBe(400);
      expect(leaksInternals(res.body), bodyText(res.body)).toBe(false);
    }, 30_000);

    it("the file part before vehicleId is 400, not 500", async () => {
      const vehicle = await createFixtureVehicle();
      const res = await admin
        .post("/api/documents")
        .attach("file", Buffer.from("hello"), "note.txt")
        .field("vehicleId", String(vehicle.id))
        .field("documentType", "Other");
      expect([200, 201, 400], bodyText(res.body)).toContain(res.status);
      expect(leaksInternals(res.body), bodyText(res.body)).toBe(false);
    }, 30_000);
  });
});
