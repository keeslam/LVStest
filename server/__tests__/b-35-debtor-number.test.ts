/**
 * B-35 — debtor number unique when filled, case-insensitively and trimmed,
 * including numbers held by a customer sitting in the recycle bin.
 *
 * besluiten B-35 (BUG-045). Pattern copied from the license-plate pre-check
 * (server/routes.ts `findVehicleByNormalisedPlate`) and `server/utils/db-errors.ts`.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq, like, and, sql } from "drizzle-orm";
import { db } from "../db";
import { customers, deletedRecords } from "../../shared/schema";
import { agentFor, cleanupFixtureUsers, type TestAgent } from "./helpers/app";
import { cleanupFixtures, FIXTURE_PREFIX } from "./helpers/fixtures";
import { describeDbError } from "../utils/db-errors";

let admin: TestAgent;
// Unique per test run, so re-running this file never collides with a row a
// previous (possibly interrupted) run left behind.
const TAG = `t${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;

beforeAll(async () => {
  admin = await agentFor("admin");
});

afterAll(async () => {
  // Soft-deleted fixture customers only live on in deleted_records; cleanupFixtures()
  // only ever looks at the live `customers` table (see BUG-145 for why that omission
  // matters), so the bin has to be cleaned separately.
  await db.delete(deletedRecords).where(like(deletedRecords.label, `${FIXTURE_PREFIX}%`));
  await cleanupFixtures();
  await cleanupFixtureUsers();
});

function fixtureName(label: string): string {
  return `${FIXTURE_PREFIX}B35-${label}-${TAG}`;
}

async function createCustomer(name: string, debtorNumber?: string | null) {
  const payload: Record<string, unknown> = { name: fixtureName(name), customerType: "business" };
  if (debtorNumber !== undefined) payload.debtorNumber = debtorNumber;
  const res = await admin.post("/api/customers").send(payload);
  return res;
}

describe("B-35 — debtor number uniqueness", () => {
  it("is unique case-insensitively and trimmed on create", async () => {
    const first = await createCustomer("First", `  ${TAG}-AB-12 `);
    expect(first.status).toBe(201);
    expect(first.body.debtorNumber).toBe(`${TAG}-AB-12`);

    const second = await createCustomer("Second", `${TAG}-ab-12`);
    expect(second.status).toBe(409);
    expect(second.body.field).toBe("debtorNumber");
    expect(second.body.code).toBe("DEBTOR_NUMBER_TAKEN");
    expect(second.body.conflictingCustomerId).toBe(first.body.id);
    expect(second.body.conflictingCustomerName).toBe(first.body.name);
    expect(typeof second.body.message).toBe("string");
  });

  it("stores blank and missing debtor numbers as NULL, never colliding with each other", async () => {
    const blank1 = await createCustomer("Blank1", "");
    const blank2 = await createCustomer("Blank2", "   ");
    const none1 = await createCustomer("None1", undefined);
    const none2 = await createCustomer("None2", null);
    for (const res of [blank1, blank2, none1, none2]) {
      expect(res.status).toBe(201);
      expect(res.body.debtorNumber).toBeFalsy();
    }
  });

  it("refuses a PATCH to a number another live customer holds, but allows keeping your own", async () => {
    const holder = await createCustomer("Holder", `${TAG}-CD-34`);
    const editor = await createCustomer("Editor", `${TAG}-EF-56`);
    expect(holder.status).toBe(201);
    expect(editor.status).toBe(201);

    const clash = await admin.patch(`/api/customers/${editor.body.id}`).send({ debtorNumber: `${TAG}-cd-34` });
    expect(clash.status).toBe(409);
    expect(clash.body.field).toBe("debtorNumber");
    expect(clash.body.code).toBe("DEBTOR_NUMBER_TAKEN");
    expect(clash.body.conflictingCustomerId).toBe(holder.body.id);

    const keepOwn = await admin
      .patch(`/api/customers/${editor.body.id}`)
      .send({ debtorNumber: `${TAG}-EF-56`, notes: "unchanged number" });
    expect(keepOwn.status).toBe(200);
    expect(keepOwn.body.debtorNumber).toBe(`${TAG}-EF-56`);
  });

  it("keeps a number reserved for the customer holding it in the recycle bin, and blocks a new create against it", async () => {
    const inBin = await createCustomer("InBin", `${TAG}-DEB-7`);
    expect(inBin.status).toBe(201);

    const del = await admin.delete(`/api/customers/${inBin.body.id}`);
    expect(del.status).toBe(204);

    const [record] = await db
      .select()
      .from(deletedRecords)
      .where(and(eq(deletedRecords.entityType, "customer"), eq(deletedRecords.entityId, inBin.body.id)));
    expect(record).toBeDefined();

    const blocked = await createCustomer("Clash", `${TAG}-deb-7`);
    expect(blocked.status).toBe(409);
    expect(blocked.body.field).toBe("debtorNumber");
    expect(blocked.body.code).toBe("DEBTOR_NUMBER_IN_RECYCLE_BIN");
    expect(blocked.body.deletedRecordId).toBe(record.id);
    expect(blocked.body.conflictingCustomerName).toBe(inBin.body.name);

    // Restoring while the number is still free succeeds.
    const restored = await admin.post(`/api/deleted-records/${record.id}/restore`).send({});
    expect(restored.status).toBe(200);
    const [row] = await db.select().from(customers).where(eq(customers.id, inBin.body.id));
    expect(row.debtorNumber).toBe(`${TAG}-DEB-7`);
  });

  it("refuses to restore a customer whose debtor number a live customer took meanwhile, naming that customer", async () => {
    const original = await createCustomer("Original", `${TAG}-GH-89`);
    expect(original.status).toBe(201);
    const del = await admin.delete(`/api/customers/${original.body.id}`);
    expect(del.status).toBe(204);
    const [record] = await db
      .select()
      .from(deletedRecords)
      .where(and(eq(deletedRecords.entityType, "customer"), eq(deletedRecords.entityId, original.body.id)));
    expect(record).toBeDefined();

    // `original`'s row is now entirely gone from `customers` (soft delete is a
    // snapshot-then-hard-delete), so the app's own bin pre-check on POST/PATCH
    // is the only thing that would normally stop a *different* live customer
    // from ending up with "GH-89" while `original` sits in the bin. A raw
    // write bypasses that pre-check the same way a genuine race would, so it
    // stands in for "a live customer took the number meanwhile".
    const takenBy = await createCustomer("TakenBy", undefined);
    expect(takenBy.status).toBe(201);
    await db.update(customers).set({ debtorNumber: `${TAG}-gh-89` }).where(eq(customers.id, takenBy.body.id));

    const restore = await admin.post(`/api/deleted-records/${record.id}/restore`).send({});
    expect(restore.status).toBe(409);
    expect(restore.body.code).toBe("DEBTOR_NUMBER_TAKEN");
    expect(restore.body.message).toContain(takenBy.body.name);
    // Task 6 fix round: the client translates by `code` and never reads the English
    // message, so the holder also travels as a field of its own.
    expect(restore.body.conflictingCustomerName).toBe(takenBy.body.name);
  });

  it("normalises an un-trimmed debtor number on restore, for a snapshot written before this feature trimmed on write", async () => {
    const original = await createCustomer("PreFeature", `${TAG}-XY-99`);
    expect(original.status).toBe(201);
    const del = await admin.delete(`/api/customers/${original.body.id}`);
    expect(del.status).toBe(204);
    const [record] = await db
      .select()
      .from(deletedRecords)
      .where(and(eq(deletedRecords.entityType, "customer"), eq(deletedRecords.entityId, original.body.id)));
    expect(record).toBeDefined();

    // Stand in for a snapshot written before write-time normalisation
    // existed: the bin's payload holds a padded value verbatim.
    const untrimmed = `  ${TAG}-XY-99  `;
    await db.execute(sql`
      UPDATE deleted_records
      SET payload = jsonb_set(payload, '{customer,debtorNumber}', to_jsonb(${untrimmed}::text))
      WHERE id = ${record.id}
    `);

    const restore = await admin.post(`/api/deleted-records/${record.id}/restore`).send({});
    expect(restore.status).toBe(200);
    const [row] = await db.select().from(customers).where(eq(customers.id, original.body.id));
    expect(row.debtorNumber).toBe(`${TAG}-XY-99`);
  });

  it("a direct insert that bypasses the app's own pre-check is stopped by the database index", async () => {
    const value = `${TAG}-ZZ-01`;
    await db
      .insert(customers)
      .values({ name: fixtureName("RaceA"), customerType: "business", debtorNumber: value } as any);

    let caught: any = null;
    try {
      await db
        .insert(customers)
        .values({ name: fixtureName("RaceB"), customerType: "business", debtorNumber: value.toUpperCase() } as any);
    } catch (error) {
      caught = error;
    }
    expect(caught).not.toBeNull();
    expect(caught.code).toBe("23505");

    const description = describeDbError(caught);
    expect(description.status).toBe(409);
    expect(description.field).toBe("debtorNumber");
    expect(description.recognised).toBe(true);
  });
});
