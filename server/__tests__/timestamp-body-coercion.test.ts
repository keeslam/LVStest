/**
 * BUG-104 regression — a timestamp column can only arrive as a string.
 *
 * FIX-D made every create/update body validate against the drizzle-zod insert
 * schema. drizzle-zod types a `timestamp()` column as `z.date()`, and JSON has
 * no Date type, so from the moment 221dad7a shipped *every* save of an
 * interactive damage check was a 400 "Invalid damage check data": the screen
 * sends `checkDate: "2026-09-21"` and the schema wanted a `Date` instance. The
 * route's own fallback (`req.body?.checkDate ?? new Date().toISOString()`) is a
 * string too, so even an omitted field could not save.
 *
 * The existing FIX-D test only asserted that `POST {}` is a 400, which is why
 * nothing caught it: the failure mode and the pass condition were the same
 * status code. These tests assert the *valid* request succeeds, and that the
 * invalid ones are still a 400 and never a 500 or a garbage date.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq, inArray, like } from "drizzle-orm";
import { db } from "../db";
import {
  interactiveDamageChecks, reservations, vehicles as vehiclesTable,
} from "../../shared/schema";
import { agentFor, cleanupFixtureUsers, type TestAgent } from "./helpers/app";
import { createFixtureVehicle, cleanupFixtures, FIXTURE_PLATE_PREFIX } from "./helpers/fixtures";
import { coerceBodyForTable } from "../middleware/validateBody";
import { officeDate } from "../services/lifecycle";

function bodyText(body: unknown): string {
  return JSON.stringify(body ?? {}).slice(0, 400);
}

/**
 * `checkDate` comes back over JSON as an ISO string; the assertion that matters
 * is the calendar day the office sees, not the instant.
 */
async function storedCheckDate(id: number): Promise<Date | null> {
  const [row] = await db
    .select({ checkDate: interactiveDamageChecks.checkDate })
    .from(interactiveDamageChecks)
    .where(eq(interactiveDamageChecks.id, id));
  return row ? row.checkDate : null;
}

/** How many checks exist on one vehicle — for "the refused request stored nothing". */
async function countChecksForVehicle(vehicleId: number): Promise<number> {
  const rows = await db
    .select({ id: interactiveDamageChecks.id })
    .from(interactiveDamageChecks)
    .where(eq(interactiveDamageChecks.vehicleId, vehicleId));
  return rows.length;
}

describe("BUG-104 — timestamp columns accept the strings a JSON client can send", () => {
  let staff: TestAgent;
  let vehicleId: number;
  /** Everything this file creates, deleted in afterAll before its vehicle is. */
  const createdCheckIds: number[] = [];

  async function createCheck(body: Record<string, unknown>) {
    const res = await staff.post("/api/interactive-damage-checks").send({
      vehicleId,
      checkType: "pickup",
      notes: "FIXT-timestamp-coercion",
      ...body,
    });
    if (res.status < 300 && res.body?.id) createdCheckIds.push(res.body.id);
    return res;
  }

  beforeAll(async () => {
    staff = await agentFor(["manage_damage_checks", "view_damage_checks"]);
    const vehicle = await createFixtureVehicle();
    vehicleId = vehicle.id;
  }, 60_000);

  afterAll(async () => {
    // interactive_damage_checks.vehicle_id is a real FK, so these rows have to
    // go before cleanupFixtures() removes the fixture vehicles.
    if (createdCheckIds.length) {
      await db.delete(interactiveDamageChecks).where(inArray(interactiveDamageChecks.id, createdCheckIds));
    }
    const fixtureVehicles = await db.select({ id: vehiclesTable.id }).from(vehiclesTable)
      .where(like(vehiclesTable.licensePlate, `${FIXTURE_PLATE_PREFIX}%`));
    const ids = fixtureVehicles.map((v) => v.id);
    if (ids.length) {
      await db.delete(interactiveDamageChecks).where(inArray(interactiveDamageChecks.vehicleId, ids));
    }
    await cleanupFixtures();
    await cleanupFixtureUsers();
  }, 60_000);

  describe("the coercion itself", () => {
    it("turns a bare yyyy-MM-dd into the office's calendar day, winter and summer", () => {
      const summer = coerceBodyForTable(interactiveDamageChecks, { checkDate: "2026-06-21" });
      const winter = coerceBodyForTable(interactiveDamageChecks, { checkDate: "2026-01-15" });
      expect(summer.checkDate).toBeInstanceOf(Date);
      expect(winter.checkDate).toBeInstanceOf(Date);
      // CEST (UTC+2) in June, CET (UTC+1) in January: noon UTC lands mid-afternoon
      // and mid-day respectively, so the office reads back the day it typed.
      expect(officeDate(summer.checkDate as Date)).toBe("2026-06-21");
      expect(officeDate(winter.checkDate as Date)).toBe("2026-01-15");
      // …and a UTC reader (the container, and the client's toISOString()) agrees.
      expect((summer.checkDate as Date).toISOString().slice(0, 10)).toBe("2026-06-21");
      expect((winter.checkDate as Date).toISOString().slice(0, 10)).toBe("2026-01-15");
    });

    it("keeps the exact instant of a full ISO-8601 date-time", () => {
      const out = coerceBodyForTable(interactiveDamageChecks, { checkDate: "2026-09-21T08:30:00.000Z" });
      expect(out.checkDate).toBeInstanceOf(Date);
      expect((out.checkDate as Date).toISOString()).toBe("2026-09-21T08:30:00.000Z");
    });

    it("refuses a date-time without a zone, which JS reads as host-local time", () => {
      // `new Date("2026-09-21T08:30:00")` is 08:30 *where the process runs*: the
      // production container (UTC) and a laptop in Europe/Amsterdam store
      // instants one to two hours apart for the same string. Left untouched so
      // the schema answers 400, rather than the stored instant depending on
      // which machine handled the request.
      for (const zoneless of ["2026-09-21T08:30:00", "2026-09-21T08:30", "2026-09-21 08:30:00"]) {
        const out = coerceBodyForTable(interactiveDamageChecks, { checkDate: zoneless });
        expect(out.checkDate, `input ${JSON.stringify(zoneless)}`).toBe(zoneless);
      }
    });

    it("takes every spelling of an explicit zone", () => {
      // Asserted as an instant, so the expectation holds whatever timezone this
      // test itself runs in.
      const cases: Array<[string, string]> = [
        ["2026-09-21T08:30:00Z", "2026-09-21T08:30:00.000Z"],
        ["2026-09-21T08:30Z", "2026-09-21T08:30:00.000Z"],
        ["2026-09-21T08:30:00+02:00", "2026-09-21T06:30:00.000Z"],
        ["2026-09-21T08:30:00+0200", "2026-09-21T06:30:00.000Z"],
        ["2026-09-21T08:30:00-05:00", "2026-09-21T13:30:00.000Z"],
      ];
      for (const [input, expected] of cases) {
        const out = coerceBodyForTable(interactiveDamageChecks, { checkDate: input });
        expect(out.checkDate, `input ${input}`).toBeInstanceOf(Date);
        expect((out.checkDate as Date).toISOString(), `input ${input}`).toBe(expected);
      }
    });

    it("leaves a malformed string alone so the schema answers 400", () => {
      for (const bad of ["not a date", "2026-13-45", "2026-02-30", "21-09-2026", "", "2026-09", "   "]) {
        const out = coerceBodyForTable(interactiveDamageChecks, { checkDate: bad });
        expect(out.checkDate, `input ${JSON.stringify(bad)}`).not.toBeInstanceOf(Date);
      }
    });

    it("leaves numbers, null, undefined and an existing Date alone", () => {
      expect(coerceBodyForTable(interactiveDamageChecks, { checkDate: 12345 }).checkDate).toBe(12345);
      expect(coerceBodyForTable(interactiveDamageChecks, { checkDate: null }).checkDate).toBeNull();
      expect(coerceBodyForTable(interactiveDamageChecks, { checkDate: undefined }).checkDate).toBeUndefined();
      const instance = new Date("2026-09-21T08:30:00.000Z");
      expect(coerceBodyForTable(interactiveDamageChecks, { checkDate: instance }).checkDate).toBe(instance);
    });

    it("does not touch a TEXT date column", () => {
      // reservations.startDate/endDate are `text`, not `timestamp`; turning them
      // into Dates would write "Mon Oct 01 2026 …" into the column.
      const out = coerceBodyForTable(reservations, { startDate: "2026-10-01", endDate: "2026-10-05" });
      expect(out.startDate).toBe("2026-10-01");
      expect(out.endDate).toBe("2026-10-05");
    });

    it("does not touch a non-column key", () => {
      const out = coerceBodyForTable(interactiveDamageChecks, { somethingElse: "2026-09-21" });
      expect(out.somethingElse).toBe("2026-09-21");
    });
  });

  describe("POST /api/interactive-damage-checks", () => {
    it("saves the yyyy-MM-dd the screen sends, on that calendar day", async () => {
      const res = await createCheck({ checkDate: "2026-09-21" });
      expect([200, 201], bodyText(res.body)).toContain(res.status);
      const stored = await storedCheckDate(res.body.id);
      expect(stored).toBeInstanceOf(Date);
      expect(officeDate(stored as Date)).toBe("2026-09-21");
    }, 30_000);

    it("saves without a checkDate, using the route's own default", async () => {
      const res = await createCheck({ checkType: "return" });
      expect([200, 201], bodyText(res.body)).toContain(res.status);
      const stored = await storedCheckDate(res.body.id);
      expect(stored).toBeInstanceOf(Date);
      expect(officeDate(stored as Date)).toBe(officeDate(new Date()));
    }, 30_000);

    it("saves a full ISO date-time unchanged", async () => {
      const res = await createCheck({ checkType: "inspection", checkDate: "2026-09-21T08:30:00.000Z" });
      expect([200, 201], bodyText(res.body)).toContain(res.status);
      const stored = await storedCheckDate(res.body.id);
      expect((stored as Date).toISOString()).toBe("2026-09-21T08:30:00.000Z");
    }, 30_000);

    it("refuses a string that is not a date with a 400, not a 500", async () => {
      const res = await createCheck({ checkType: "junk-string", checkDate: "not a date" });
      expect(res.status, bodyText(res.body)).toBe(400);
      expect(bodyText(res.body)).toMatch(/checkDate/);
    }, 30_000);

    it("refuses a number with a 400, not a 500", async () => {
      const res = await createCheck({ checkType: "junk-number", checkDate: 12345 });
      expect(res.status, bodyText(res.body)).toBe(400);
    }, 30_000);

    it("refuses a date-time without a zone with a 400, storing nothing", async () => {
      const before = await countChecksForVehicle(vehicleId);
      const res = await createCheck({ checkType: "junk-zoneless", checkDate: "2026-09-21T08:30:00" });
      expect(res.status, bodyText(res.body)).toBe(400);
      expect(bodyText(res.body)).toMatch(/checkDate/);
      expect(await countChecksForVehicle(vehicleId)).toBe(before);
    }, 30_000);

    it("refuses an impossible calendar day rather than rolling it over", async () => {
      const res = await createCheck({ checkType: "junk-rollover", checkDate: "2026-02-30" });
      expect(res.status, bodyText(res.body)).toBe(400);
    }, 30_000);
  });

  describe("the fix is generic, not damage-check-specific", () => {
    /**
     * `vehicles.fuelRefillDate` is the only other timestamp column a client
     * could legally supply on a route that goes through `parsePartialUpdate`.
     * No screen sends it today, which is precisely why it would rot unnoticed:
     * this pins the rule at the middleware, so the next `timestamp()` column
     * somebody exposes on a form cannot bring BUG-104 back.
     */
    it("PATCH /api/vehicles/:id takes an ISO string for a timestamp column", async () => {
      const manager = await agentFor(["manage_vehicles", "view_vehicles"]);
      const vehicle = await createFixtureVehicle();

      const res = await manager.patch(`/api/vehicles/${vehicle.id}`).send({
        fuelRefillDate: "2026-09-21T08:30:00.000Z",
      });
      expect([200, 201], bodyText(res.body)).toContain(res.status);

      const [row] = await db
        .select({ fuelRefillDate: vehiclesTable.fuelRefillDate })
        .from(vehiclesTable)
        .where(eq(vehiclesTable.id, vehicle.id));
      expect(row.fuelRefillDate).toBeInstanceOf(Date);
      expect((row.fuelRefillDate as Date).toISOString()).toBe("2026-09-21T08:30:00.000Z");
    }, 30_000);

    it("PATCH /api/vehicles/:id still refuses a string that is not a date", async () => {
      const manager = await agentFor(["manage_vehicles", "view_vehicles"]);
      const vehicle = await createFixtureVehicle();

      const res = await manager.patch(`/api/vehicles/${vehicle.id}`).send({
        fuelRefillDate: "not a date",
      });
      expect(res.status, bodyText(res.body)).toBe(400);
    }, 30_000);
  });

  describe("PUT /api/interactive-damage-checks/:id", () => {
    it("accepts the same yyyy-MM-dd on an edit", async () => {
      const created = await createCheck({ checkType: "edit-target", checkDate: "2026-09-21" });
      expect([200, 201], bodyText(created.body)).toContain(created.status);

      const res = await staff.put(`/api/interactive-damage-checks/${created.body.id}`).send({
        checkDate: "2026-09-22",
        notes: "FIXT-timestamp-coercion edited",
      });
      expect([200, 201], bodyText(res.body)).toContain(res.status);
      const stored = await storedCheckDate(created.body.id);
      expect(officeDate(stored as Date)).toBe("2026-09-22");
    }, 30_000);

    it("refuses a malformed date on an edit without a 500 or a garbage write", async () => {
      const created = await createCheck({ checkType: "edit-junk", checkDate: "2026-09-21" });
      expect([200, 201], bodyText(created.body)).toContain(created.status);

      const res = await staff.put(`/api/interactive-damage-checks/${created.body.id}`).send({
        checkDate: "not a date",
      });
      expect(res.status, bodyText(res.body)).toBeLessThan(500);
      const stored = await storedCheckDate(created.body.id);
      // Whatever the answer was, the stored day may not have become garbage.
      expect(stored).toBeInstanceOf(Date);
      expect(Number.isNaN((stored as Date).getTime())).toBe(false);
      expect(officeDate(stored as Date)).toBe("2026-09-21");
    }, 30_000);
  });
});
