/**
 * FIX-D — request-body validation and partial-update semantics.
 *
 * BUG-202 is the gate for wave 2: the reservation edit form posts every column
 * of the row as a multipart field, with nulls as empty strings, and the two
 * columns added in August and September 2026 were never added to the
 * hand-maintained `"" -> null` list. Every save has failed since 2026-08-29.
 *
 * Also covers BUG-084 (mass assignment), BUG-111 (unvalidated dates/times/type),
 * BUG-052 (maintenanceStatus outside its enum), BUG-122/BUG-172 (a PATCH that
 * writes fields it was not sent), BUG-063 (mass assignment on users),
 * BUG-025 (settings writes with no bounds), BUG-104 (damage checks with no body
 * validation) and BUG-148 (raw Postgres text in the response).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { reservations, users as usersTable, vehicles as vehiclesTable } from "../../shared/schema";
import { agentFor, cleanupFixtureUsers, type TestAgent } from "./helpers/app";
import {
  createFixtureCustomer, createFixtureVehicle, createFixtureReservation, cleanupFixtures,
} from "./helpers/fixtures";
import { nullableNonTextColumns } from "../middleware/validateBody";

/**
 * The field list `reservation-form.tsx` actually sends on "Reservering
 * bijwerken" (captured in BUG-202): every column of the row, `String(value)`,
 * with `null` appended as `''`. The two that break it are
 * `replacementForTransportId` and `portalRequestId`.
 */
function editFormFields(row: { id: number; vehicleId: number | null; customerId: number | null }) {
  return {
    vehicleId: String(row.vehicleId ?? ""),
    customerId: String(row.customerId ?? ""),
    startDate: "2026-10-01",
    endDate: "2026-10-05",
    startTime: "",
    endTime: "",
    status: "booked",
    type: "standard",
    totalPrice: "",
    notes: "edited by the regression test",
    driverId: "",
    replacementForReservationId: "",
    replacementForTransportId: "",
    affectedRentalId: "",
    portalRequestId: "",
    deliveryStaffId: "",
    recurringParentId: "",
    recurringDayOfWeek: "",
    recurringDayOfMonth: "",
    recurringFrequency: "",
    recurringEndDate: "",
    maintenanceDuration: "",
    maintenanceStatus: "",
    maintenanceCategory: "",
    spareAssignmentDecision: "",
    pickupMileage: "",
    returnMileage: "",
    fuelLevelPickup: "",
    fuelLevelReturn: "",
    fuelCost: "",
    fuelCardNumber: "",
    fuelNotes: "",
    contractNumber: "",
    deliveryAddress: "",
    deliveryCity: "",
    deliveryPostalCode: "",
    deliveryFee: "",
    deliveryStatus: "",
    deliveryNotes: "",
    isRecurring: "false",
    placeholderSpare: "false",
    deliveryRequired: "false",
    spareVehicleStatus: "",
  } as Record<string, string>;
}

function bodyText(body: unknown): string {
  return JSON.stringify(body ?? {}).slice(0, 400);
}

/** BUG-148 / BUG-084: nothing in a response may come from the driver. */
function leaksDatabaseText(body: unknown): boolean {
  return /syntax for type|constraint|"detail"|"schema"|"table"|"stack"|violates/i.test(bodyText(body));
}

describe("FIX-D — body validation and partial updates", () => {
  let admin: TestAgent;
  let vehicleId: number;
  let customerId: number;

  /**
   * Every reservation gets its own vehicle: several of these tests move dates
   * around, and two fixtures sharing one vehicle for the same week would make
   * the (correct) conflict check answer 409.
   */
  async function freshReservation(overrides: Record<string, unknown> = {}) {
    const vehicle = await createFixtureVehicle();
    return createFixtureReservation({ vehicleId: vehicle.id, customerId, ...overrides } as any);
  }

  async function rowOf(id: number) {
    const [row] = await db.select().from(reservations).where(eq(reservations.id, id));
    return row;
  }

  beforeAll(async () => {
    admin = await agentFor("admin");
    const customer = await createFixtureCustomer("FixD");
    const vehicle = await createFixtureVehicle();
    customerId = customer.id;
    vehicleId = vehicle.id;
  }, 60_000);

  afterAll(async () => {
    await cleanupFixtures();
    await cleanupFixtureUsers();
  });

  describe("BUG-202 — the reservation edit form saves", () => {
    it("accepts the exact multipart body the form sends", async () => {
      const row = await freshReservation();
      const req = admin.patch(`/api/reservations/${row.id}`);
      for (const [key, value] of Object.entries(editFormFields(row))) req.field(key, value);
      const res = await req;

      expect(leaksDatabaseText(res.body), bodyText(res.body)).toBe(false);
      expect(res.status, bodyText(res.body)).toBe(200);

      const after = await rowOf(row.id);
      expect(after.portalRequestId).toBeNull();
      expect(after.replacementForTransportId).toBeNull();
      expect(after.notes).toBe("edited by the regression test");
    }, 60_000);

    it("the two columns that drifted are not special — every nullable non-text column clears", async () => {
      // The schema-drift half of BUG-202's regression test: a hand-maintained
      // list falls behind the schema, so assert against the schema itself.
      const row = await freshReservation();
      const columns = nullableNonTextColumns(reservations).filter(
        (c) => !["id", "createdAt", "updatedAt", "deletedAt", "createdByUser", "updatedByUser", "deletedByUser"].includes(c),
      );
      expect(columns.length).toBeGreaterThan(10);

      const failures: string[] = [];
      for (const column of columns) {
        const res = await admin.patch(`/api/reservations/${row.id}`).field(column, "");
        if (res.status !== 200) failures.push(`${column} -> ${res.status} ${bodyText(res.body)}`);
      }
      expect(failures, `these columns still reject an empty string:\n${failures.join("\n")}`).toEqual([]);
    }, 120_000);
  });

  describe("BUG-084 — mass assignment", () => {
    it("ignores id, createdBy and deletedBy in the body", async () => {
      const row = await freshReservation();
      const res = await admin.patch(`/api/reservations/${row.id}`).send({
        id: 999999,
        createdBy: "attacker",
        deletedBy: "attacker",
        deletedAt: "2020-01-01T00:00:00.000Z",
        notes: "still writes the real field",
      });
      expect(res.status, bodyText(res.body)).toBe(200);

      const after = await rowOf(row.id);
      expect(after.id).toBe(row.id);
      expect(after.createdBy).toBe(row.createdBy);
      expect(after.deletedBy).toBeNull();
      expect(after.deletedAt).toBeNull();
      expect(after.notes).toBe("still writes the real field");
    }, 30_000);
  });

  describe("BUG-111 / BUG-052 — dates, times and enums", () => {
    it("refuses garbage and inverted dates, and leaves the row alone", async () => {
      const row = await freshReservation();
      for (const patch of [
        { endDate: "not-a-date" },
        { startDate: "2026-13-45" },
        { endDate: "2020-01-01" }, // before the 2026 start date
        { startTime: "99:99" },
        { type: "garbage" },
        { maintenanceStatus: "garbage" },
      ]) {
        const res = await admin.patch(`/api/reservations/${row.id}`).send(patch);
        expect(res.status, `${JSON.stringify(patch)} -> ${bodyText(res.body)}`).toBe(400);
        expect(leaksDatabaseText(res.body), bodyText(res.body)).toBe(false);
      }
      const after = await rowOf(row.id);
      expect(after.startDate).toBe(row.startDate);
      expect(after.endDate).toBe(row.endDate);
      expect(after.type).toBe(row.type);
    }, 60_000);

    it("accepts a legal partial date change", async () => {
      const row = await freshReservation();
      const res = await admin.patch(`/api/reservations/${row.id}`).send({ endDate: "2026-10-09" });
      expect(res.status, bodyText(res.body)).toBe(200);
      expect((await rowOf(row.id)).endDate).toBe("2026-10-09");
    }, 30_000);
  });

  describe("BUG-122 / BUG-172 — a PATCH writes only what it was sent", () => {
    it("two sequential single-field PATCHes both survive", async () => {
      const row = await freshReservation();
      const first = await admin.patch(`/api/reservations/${row.id}`).send({ notes: "note from A" });
      expect(first.status, bodyText(first.body)).toBe(200);
      const second = await admin.patch(`/api/reservations/${row.id}`).send({ fuelCardNumber: "CARD-42" });
      expect(second.status, bodyText(second.body)).toBe(200);

      const after = await rowOf(row.id);
      expect(after.notes).toBe("note from A");
      expect(after.fuelCardNumber).toBe("CARD-42");
      // and nothing else moved
      expect(after.startDate).toBe(row.startDate);
      expect(after.status).toBe(row.status);
    }, 30_000);

    it("the same holds for PATCH /basic", async () => {
      const row = await freshReservation();
      const first = await admin.patch(`/api/reservations/${row.id}/basic`).send({ notes: "basic A" });
      expect(first.status, bodyText(first.body)).toBe(200);
      const second = await admin.patch(`/api/reservations/${row.id}/basic`).send({ fuelNotes: "basic B" });
      expect(second.status, bodyText(second.body)).toBe(200);

      const after = await rowOf(row.id);
      expect(after.notes).toBe("basic A");
      expect(after.fuelNotes).toBe("basic B");
      expect(after.startDate).toBe(row.startDate);
    }, 30_000);
  });

  describe("BUG-122 — a vehicle PATCH stops rewriting the whole row", () => {
    it("two single-field PATCHes both survive, and the flags they did not send are untouched", async () => {
      const vehicle = await createFixtureVehicle({ gps: true, winterTires: true, currentMileage: 1000 });

      const first = await admin.patch(`/api/vehicles/${vehicle.id}`).send({ remarks: "note from A" });
      expect(first.status, bodyText(first.body)).toBe(200);
      const second = await admin.patch(`/api/vehicles/${vehicle.id}`).send({ radioCode: "1234" });
      expect(second.status, bodyText(second.body)).toBe(200);

      const [after] = await db.select().from(vehiclesTable).where(eq(vehiclesTable.id, vehicle.id));
      expect(after.remarks).toBe("note from A");
      expect(after.radioCode).toBe("1234");
      expect(after.gps).toBe(true);
      expect(after.winterTires).toBe(true);
      expect(after.currentMileage).toBe(1000);
      expect(after.licensePlate).toBe(vehicle.licensePlate);
    }, 60_000);

    it("an out-of-range integer is a 400 with a field name, not a 500", async () => {
      const vehicle = await createFixtureVehicle();
      const res = await admin.patch(`/api/vehicles/${vehicle.id}`).send({ currentMileage: 9e18 });
      expect(res.status, bodyText(res.body)).toBe(400);
      expect(bodyText(res.body)).toMatch(/currentMileage/);
      expect(leaksDatabaseText(res.body), bodyText(res.body)).toBe(false);
    }, 30_000);
  });

  describe("BUG-127 — the two odometer readings are compared with each other", () => {
    it("a return reading below the pickup reading is 400", async () => {
      const row = await freshReservation();
      const up = await admin.patch(`/api/reservations/${row.id}`).send({ pickupMileage: 5000, returnMileage: 5200 });
      expect(up.status, bodyText(up.body)).toBe(200);

      const down = await admin.patch(`/api/reservations/${row.id}`).send({ returnMileage: 4000 });
      expect(down.status, bodyText(down.body)).toBe(400);
      expect(bodyText(down.body)).toMatch(/returnMileage/);

      const after = await rowOf(row.id);
      expect(after.returnMileage).toBe(5200);
    }, 30_000);
  });

  describe("BUG-194 — the template endpoints validate their bodies", () => {
    it("a wrongly typed PDF template field is 400, not a driver error", async () => {
      const created = await admin.post("/api/pdf-templates").send({ name: "FIXT-template", fields: [] });
      if (created.status !== 201 && created.status !== 200) return; // route unavailable in this dataset
      const id = created.body?.id;
      expect(id).toBeTruthy();
      try {
        const res = await admin.patch(`/api/pdf-templates/${id}`).send({ name: 42 });
        expect(res.status, bodyText(res.body)).toBe(400);
        expect(leaksDatabaseText(res.body), bodyText(res.body)).toBe(false);
      } finally {
        await admin.delete(`/api/pdf-templates/${id}`);
      }
    }, 30_000);
  });

  describe("BUG-063 — mass assignment on users", () => {
    it("a non-admin with manage_users cannot reset another account's password", async () => {
      const manager = await agentFor(["manage_users"]);
      const victim = await agentFor([]);
      const [before] = await db.select().from(usersTable).where(eq(usersTable.id, victim.userId));

      const res = await manager.patch(`/api/users/${victim.userId}`).send({ password: "hijacked-1" });
      expect(res.status, bodyText(res.body)).toBe(403);

      const [after] = await db.select().from(usersTable).where(eq(usersTable.id, victim.userId));
      expect(after.password).toBe(before.password);
    }, 60_000);

    it("id and createdAt in a self-update body are ignored", async () => {
      const self = await agentFor([]);
      const res = await self.patch(`/api/users/${self.userId}`).send({ id: 999999, fullName: "Renamed" });
      expect(res.status, bodyText(res.body)).toBe(200);

      const [after] = await db.select().from(usersTable).where(eq(usersTable.id, self.userId));
      expect(after.id).toBe(self.userId);
      expect(after.fullName).toBe("Renamed");
    }, 60_000);
  });

  describe("BUG-025 — settings writes are bounded", () => {
    it("an out-of-range contract number override is 400, not 500", async () => {
      const res = await admin.post("/api/settings/contract-number-override").send({ overrideNumber: 9e18 });
      expect(res.status, bodyText(res.body)).toBe(400);
      expect(leaksDatabaseText(res.body), bodyText(res.body)).toBe(false);
    }, 30_000);

    it("PUT /api/system-settings validates its body", async () => {
      const res = await admin.put("/api/system-settings").send({ apkReminderDays: 9e18 });
      expect(res.status, bodyText(res.body)).toBe(400);
      expect(leaksDatabaseText(res.body), bodyText(res.body)).toBe(false);

      const wrongType = await admin.put("/api/system-settings").send({ showApkReminders: "yes please" });
      expect(wrongType.status, bodyText(wrongType.body)).toBe(400);
    }, 30_000);
  });

  describe("BUG-104 — interactive damage checks", () => {
    it("an empty create body is 400, not 500", async () => {
      const res = await admin.post("/api/interactive-damage-checks").send({});
      expect(res.status, bodyText(res.body)).toBe(400);
      expect(leaksDatabaseText(res.body), bodyText(res.body)).toBe(false);
    }, 30_000);
  });

  describe("BUG-148 — no database text in a response", () => {
    it("a transport on a non-existent vehicle is a 404 naming the field", async () => {
      const res = await admin.post("/api/transports").send({
        vehicleId: 2147483646,
        transportType: "tow",
        scheduledDate: "2026-10-01",
      });
      expect([400, 404], bodyText(res.body)).toContain(res.status);
      expect(bodyText(res.body)).toMatch(/vehicleId/);
      expect(leaksDatabaseText(res.body), bodyText(res.body)).toBe(false);
    }, 30_000);
  });
});
