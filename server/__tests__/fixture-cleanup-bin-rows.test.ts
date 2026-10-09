/**
 * Final wave of sub-project C, item 23 - a test that deletes something through the
 * API as a fixture account leaves a recycle-bin row behind (c-08b-maintenance-edit-close
 * and fix-v-spare-cascade each left `maintenance_block` rows in lvs_fixtest, found as
 * rows 4094/4095). The bin row is not a fixture row by name or by foreign key, only by
 * its `deleted_by`, so `cleanupFixtureUsers()` - which every such file already calls in
 * its afterAll - now removes the bin rows its accounts made.
 */
import { describe, it, expect, afterAll } from "vitest";
import { and, eq, like } from "drizzle-orm";
import { db } from "../db";
import { deletedRecords } from "../../shared/schema";
import { agentFor, cleanupFixtureUsers, FIXTURE_USER_PREFIX } from "./helpers/app";
import { createFixtureReservation, createFixtureVehicle, cleanupFixtures } from "./helpers/fixtures";

afterAll(async () => {
  await cleanupFixtures();
  await cleanupFixtureUsers();
});

describe("cleanupFixtureUsers() also removes the recycle-bin rows a fixture account made", () => {
  it("a maintenance block deleted through the API leaves no bin row once the fixture accounts are cleaned", async () => {
    const admin = await agentFor("admin");
    const vehicle = await createFixtureVehicle();
    const block = await createFixtureReservation({
      vehicleId: vehicle.id, startDate: "2031-05-05", endDate: "2031-05-06", status: "scheduled", type: "maintenance_block",
    });

    const res = await admin.delete(`/api/reservations/${block.id}`);
    expect([200, 204]).toContain(res.status);
    const made = await db.select().from(deletedRecords)
      .where(and(eq(deletedRecords.entityType, "maintenance_block"), eq(deletedRecords.deletedBy, admin.username)));
    expect(made, "the delete should have written a bin row for this account").toHaveLength(1);

    // The order every file uses in its afterAll: the soft-deleted block references its deleting user.
    await cleanupFixtures();
    await cleanupFixtureUsers();

    const left = await db.select({ id: deletedRecords.id }).from(deletedRecords)
      .where(like(deletedRecords.deletedBy, `${FIXTURE_USER_PREFIX}%`));
    expect(left).toEqual([]);
  });
});
