/**
 * Sub-project C, task 7 (besluit B-38, approval B-39; spec
 * docs/superpowers/specs/2026-10-09-terugdraaien-prullenbak-design.md §5):
 * emptying a recycle bin - one record, a selection, or everything of one kind.
 *
 *   DELETE /api/deleted-records/:id
 *   POST   /api/deleted-records/purge   { ids } | { entityType, all: true }
 *
 * Both need the explicit right manage_recycle_bin (role admin passes). The answer
 * is { purged, failed: [{id, code, message}] }. Every purged record writes an audit
 * row `<entityType>.purge`. What a permanent delete removes per kind:
 *
 *   restored record         the bin row only (the data is live again)
 *   reservation / block     the soft-deleted reservations row after its dependants
 *                           (damage checks, documents, delivery tasks, assignments,
 *                           usage period); scan events and fiscal assessments keep
 *                           their row with a null reservation; self-links on other
 *                           reservations are nulled; their files go with them
 *   vehicle/customer/fine/  the bin row, plus the files named in the snapshot
 *   transport
 *
 * A file is only removed after the commit, only when it resolves under the uploads
 * directory and when no live row in any file-bearing table still points at it (in any
 * of the shapes a path is stored in). A path outside the uploads directory is never
 * touched, whatever the snapshot says.
 *
 * The whole file runs with UPLOADS_DIR on a temp directory outside the repository
 * (the production shape) and asserts the bytes on disk, not only status codes.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { and, desc, eq, inArray, like } from "drizzle-orm";

import { useTempUploadsDir, removeTempUploadsDir } from "./helpers/uploads";

// MUST run before anything builds the app (registerRoutes reads the directory once).
const UPLOADS = useTempUploadsDir("lvs-c07-");
const OUTSIDE = fs.mkdtempSync(path.join(os.tmpdir(), "lvs-c07-outside-"));

const { db } = await import("../db");
const schema = await import("../../shared/schema");
const {
  auditLogs, customers, deletedRecords, deliveryTasks, documents, drivers, expenses, fines,
  fiscalAssessments, interactiveDamageChecks, portalRequestAttachments, portalRequests,
  reservationDriverAssignments, reservations, scanEvents, vehicleTransports, vehicleUsagePeriods,
  vehicles,
} = schema;
const { agentFor, anonAgent, cleanupFixtureUsers } = await import("./helpers/app");
const {
  createFixtureCustomer, createFixtureVehicle, createFixtureReservation, cleanupFixtures,
  FIXTURE_PREFIX,
} = await import("./helpers/fixtures");
type TestAgent = Awaited<ReturnType<typeof agentFor>>;

/** Far-future / far-past days: never a dependency on today. */
const FUTURE = { start: "2031-03-03", end: "2031-03-07" };
const PAST = { start: "2019-03-03", end: "2019-03-07" };

const ROW_PREFIX = `${FIXTURE_PREFIX}C07-`;
const FINE_PLATE = "C07-ZZ-9";

let admin: TestAgent;
let binKeeper: TestAgent;
let reservationsOnly: TestAgent;
let customerId: number;
let seq = 0;
const binRowIds: number[] = [];
const extraVehicleIds: number[] = [];

/** Writes a file under the uploads directory; returns the stored (relative) path. */
function put(rel: string, body = "bytes"): string {
  const abs = path.join(UPLOADS, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, body);
  return rel;
}
const onDisk = (rel: string) => fs.existsSync(path.join(UPLOADS, rel));
const unique = (label: string) => `${label}-${Date.now().toString(36)}-${++seq}`;

async function binRowFor(entityType: string, entityId: number) {
  const [row] = await db.select().from(deletedRecords)
    .where(and(eq(deletedRecords.entityType, entityType), eq(deletedRecords.entityId, entityId)))
    .orderBy(desc(deletedRecords.id)).limit(1);
  if (row) binRowIds.push(row.id);
  return row;
}
const binRowExists = async (id: number) =>
  (await db.select({ id: deletedRecords.id }).from(deletedRecords).where(eq(deletedRecords.id, id))).length > 0;

async function insertBinRow(entityType: string, over: Partial<typeof deletedRecords.$inferInsert> = {}) {
  const [row] = await db.insert(deletedRecords).values({
    entityType, entityId: 980000 + ++seq, label: `${ROW_PREFIX}${entityType}-${seq}`, payload: {}, relatedCounts: {}, ...over,
  }).returning();
  binRowIds.push(row.id);
  return row;
}

async function addDocument(over: { vehicleId?: number | null; reservationId?: number | null; filePath: string }) {
  const [doc] = await db.insert(documents).values({
    vehicleId: over.vehicleId ?? null, reservationId: over.reservationId ?? null,
    documentType: "Test", fileName: path.basename(over.filePath), filePath: over.filePath,
    fileSize: 5, contentType: "application/pdf",
  }).returning();
  return doc;
}

async function auditRows(action: string, resourceId: number) {
  return db.select().from(auditLogs).where(and(eq(auditLogs.action, action), eq(auditLogs.resourceId, String(resourceId))));
}

beforeAll(async () => {
  admin = await agentFor("admin");
  binKeeper = await agentFor(["manage_recycle_bin"]);
  reservationsOnly = await agentFor(["manage_reservations", "view_reservations", "manage_vehicles", "manage_customers"]);
  customerId = (await createFixtureCustomer("C07")).id;
}, 90_000);

afterAll(async () => {
  vi.restoreAllMocks();
  if (binRowIds.length) await db.delete(deletedRecords).where(inArray(deletedRecords.id, binRowIds));
  await db.delete(deletedRecords).where(like(deletedRecords.label, `${ROW_PREFIX}%`));
  await db.delete(fines).where(like(fines.licensePlate, `${FINE_PLATE}%`));
  const vehicleRows = await db.select({ id: vehicles.id }).from(vehicles).where(like(vehicles.licensePlate, "FIXT%"));
  const ids = vehicleRows.map((v) => v.id);
  if (ids.length) {
    await db.delete(interactiveDamageChecks).where(inArray(interactiveDamageChecks.vehicleId, ids));
    await db.delete(vehicleTransports).where(inArray(vehicleTransports.vehicleId, ids));
  }
  await db.delete(scanEvents).where(like(scanEvents.code, `${ROW_PREFIX}%`));
  await cleanupFixtures();
  await cleanupFixtureUsers();
  removeTempUploadsDir(UPLOADS);
  removeTempUploadsDir(OUTSIDE);
});

/* ------------------------------------------------------------------ *
 * Rights and request shapes
 * ------------------------------------------------------------------ */

describe("C-07 - the purge routes: who may call them and what they accept", () => {
  it("answers 401 to somebody who is not signed in", async () => {
    const anon = await anonAgent();
    expect((await anon.delete("/api/deleted-records/1")).status).toBe(401);
    expect((await anon.post("/api/deleted-records/purge").send({ ids: [1] })).status).toBe(401);
  });

  it("answers 403 naming manage_recycle_bin to an account that holds manage_reservations only, and removes nothing", async () => {
    const row = await insertBinRow("transport");

    const single = await reservationsOnly.delete(`/api/deleted-records/${row.id}`);
    expect(single.status).toBe(403);
    expect(single.body.message).toContain("manage_recycle_bin");
    const bulk = await reservationsOnly.post("/api/deleted-records/purge").send({ ids: [row.id] });
    expect(bulk.status).toBe(403);
    const all = await reservationsOnly.post("/api/deleted-records/purge").send({ entityType: "transport", all: true });
    expect(all.status).toBe(403);

    expect(await binRowExists(row.id)).toBe(true);
  });

  it("lets manage_recycle_bin and role admin through", async () => {
    const a = await insertBinRow("transport");
    const b = await insertBinRow("transport");
    const one = await binKeeper.delete(`/api/deleted-records/${a.id}`);
    expect(one.status).toBe(200);
    expect(one.body).toEqual({ purged: 1, failed: [] });
    const many = await admin.post("/api/deleted-records/purge").send({ ids: [b.id] });
    expect(many.status).toBe(200);
    expect(many.body).toEqual({ purged: 1, failed: [] });
    expect(await binRowExists(a.id)).toBe(false);
    expect(await binRowExists(b.id)).toBe(false);
  });

  it.each([
    ["an empty body", {}],
    ["an empty id list", { ids: [] }],
    ["ids that are not integers", { ids: ["7"] }],
    ["a fractional id", { ids: [1.5] }],
    ["a zero id", { ids: [0] }],
    ["a negative id", { ids: [-3] }],
    ["too many ids", { ids: Array.from({ length: 1001 }, (_, i) => i + 1) }],
    ["ids and all together", { ids: [1], entityType: "fine", all: true }],
    ["all without a kind", { all: true }],
    ["a kind without all", { entityType: "fine" }],
    ["all: false", { entityType: "fine", all: false }],
    ["all as a string", { entityType: "fine", all: "true" }],
    ["an unknown kind", { entityType: "expense", all: true }],
    ["an unknown extra field", { ids: [1], everything: true }],
  ])("refuses %s with 400 INVALID_PURGE_REQUEST before touching anything", async (_label, body) => {
    const witness = await insertBinRow("transport");
    const res = await binKeeper.post("/api/deleted-records/purge").send(body as object);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("INVALID_PURGE_REQUEST");
    expect(typeof res.body.message).toBe("string");
    expect(await binRowExists(witness.id)).toBe(true);
  });

  it("DELETE of a record that is not there is a clean 404 NOT_FOUND; the bulk route lists it under failed", async () => {
    const single = await binKeeper.delete("/api/deleted-records/2147483000");
    expect(single.status).toBe(404);
    expect(single.body.code).toBe("NOT_FOUND");
    expect(single.body.purged).toBe(0);
    expect(single.body.failed).toEqual([{ id: 2147483000, code: "NOT_FOUND", message: expect.any(String) }]);

    const bulk = await binKeeper.post("/api/deleted-records/purge").send({ ids: [2147483000, 2147482999] });
    expect(bulk.status).toBe(200);
    expect(bulk.body.purged).toBe(0);
    expect(bulk.body.failed.map((f: any) => f.code)).toEqual(["NOT_FOUND", "NOT_FOUND"]);
  });

  it("a non-numeric id is refused by the shared id check, never reaches the database", async () => {
    expect((await binKeeper.delete("/api/deleted-records/purge")).status).toBe(400);
    expect((await binKeeper.delete("/api/deleted-records/abc")).status).toBe(400);
  });
});

/* ------------------------------------------------------------------ *
 * Per kind
 * ------------------------------------------------------------------ */

describe("C-07 - a vehicle: the bin row goes, the files nobody else uses go with it", () => {
  it("removes the snapshot's files (documents, receipts, damage checks, delivery photos) but keeps what a live row still uses or what lies outside the uploads directory", async () => {
    const vehicle = await createFixtureVehicle();
    const plate = vehicle.licensePlate;

    const docFile = put(`${plate}/doc-${unique("a")}.pdf`);
    const receiptFile = put(`${plate}/receipt-${unique("b")}.pdf`);
    const damageFile = put(`${plate}/damage-${unique("c")}.pdf`);
    const photoFile = put(`${plate}/photo-${unique("d")}.jpg`);
    const signatureFile = put(`${plate}/signature-${unique("e")}.png`);
    const sharedFile = put(`shared/keep-${unique("f")}.pdf`);
    const outsideFile = path.join(OUTSIDE, `outside-${unique("g")}.txt`);
    fs.writeFileSync(outsideFile, "do not touch");
    const traversal = `../c07-traversal-${unique("h")}.txt`;
    const traversalAbs = path.resolve(UPLOADS, traversal);
    fs.writeFileSync(traversalAbs, "do not touch either");

    await addDocument({ vehicleId: vehicle.id, filePath: docFile });
    await addDocument({ vehicleId: vehicle.id, filePath: sharedFile });
    await addDocument({ vehicleId: vehicle.id, filePath: outsideFile });
    await addDocument({ vehicleId: vehicle.id, filePath: traversal });
    await db.insert(expenses).values({ vehicleId: vehicle.id, category: "fuel", amount: "10", date: PAST.start, receiptFilePath: receiptFile });
    const past = await createFixtureReservation({ customerId, vehicleId: vehicle.id, startDate: PAST.start, endDate: PAST.end, status: "completed" });
    await db.update(reservations).set({ damageCheckPath: damageFile }).where(eq(reservations.id, past.id));
    await db.insert(deliveryTasks).values({
      reservationId: past.id, type: "delivery", deliveryAddress: "Teststraat 1",
      deliveryPhotoPath: photoFile, deliverySignaturePath: signatureFile,
    });

    // Another vehicle's LIVE document points at the shared file - written as an absolute
    // path, the other shape a path is stored in.
    const other = await createFixtureVehicle();
    extraVehicleIds.push(other.id);
    await addDocument({ vehicleId: other.id, filePath: path.join(UPLOADS, sharedFile) });

    const del = await admin.delete(`/api/vehicles/${vehicle.id}`).send({ confirmLicensePlate: plate });
    expect(del.status).toBe(200);
    const record = await binRowFor("vehicle", vehicle.id);
    expect(record).toBeDefined();
    for (const f of [docFile, receiptFile, damageFile, photoFile, signatureFile, sharedFile]) expect(onDisk(f), f).toBe(true);

    const res = await binKeeper.delete(`/api/deleted-records/${record.id}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ purged: 1, failed: [] });

    expect(await binRowExists(record.id)).toBe(false);
    for (const f of [docFile, receiptFile, damageFile, photoFile, signatureFile]) expect(onDisk(f), `${f} should be gone`).toBe(false);
    expect(onDisk(sharedFile), "a live row still uses it").toBe(true);
    expect(fs.readFileSync(outsideFile, "utf8")).toBe("do not touch");
    expect(fs.readFileSync(traversalAbs, "utf8")).toBe("do not touch either");

    const audit = await auditRows("vehicle.purge", vehicle.id);
    expect(audit).toHaveLength(1);
    expect(audit[0].resourceType).toBe("vehicle");
    expect(audit[0].status).toBe("success");
    expect(audit[0].username).toBe(binKeeper.username);
    expect(audit[0].details).toMatchObject({ label: record.label, deletedRecordId: record.id, restored: false });
    expect((audit[0].details as any).files.removed).toBe(5);
    expect((audit[0].details as any).files.kept).toBeGreaterThanOrEqual(3);
  });

  it("never touches the uploads root, a directory, or an empty path - whatever the snapshot says", async () => {
    const vehicle = await createFixtureVehicle();
    const nested = put(`dir-as-path-${unique("i")}/inner.txt`);
    const dirPath = path.dirname(nested);
    await addDocument({ vehicleId: vehicle.id, filePath: dirPath });
    await addDocument({ vehicleId: vehicle.id, filePath: "." });
    await addDocument({ vehicleId: vehicle.id, filePath: "uploads/" });
    await addDocument({ vehicleId: vehicle.id, filePath: "  " });

    expect((await admin.delete(`/api/vehicles/${vehicle.id}`).send({ confirmLicensePlate: vehicle.licensePlate })).status).toBe(200);
    const record = await binRowFor("vehicle", vehicle.id);

    const res = await binKeeper.delete(`/api/deleted-records/${record.id}`);
    expect(res.status).toBe(200);
    expect(res.body.purged).toBe(1);
    expect(fs.existsSync(UPLOADS)).toBe(true);
    expect(onDisk(nested)).toBe(true);
    expect(await binRowExists(record.id)).toBe(false);
  });

  it("does not follow a link inside the uploads directory that leads out of it (BUG-098 shape): the file outside survives", async () => {
    const vehicle = await createFixtureVehicle();
    const victim = path.join(OUTSIDE, `linked-${unique("lk")}.txt`);
    fs.writeFileSync(victim, "outside, reached through a link");
    const linkName = `link-${unique("ln")}`;
    // A directory junction: creatable on Windows without elevation, a symlink elsewhere.
    fs.symlinkSync(OUTSIDE, path.join(UPLOADS, linkName), "junction");
    try {
      await addDocument({ vehicleId: vehicle.id, filePath: `${linkName}/${path.basename(victim)}` });
      expect((await admin.delete(`/api/vehicles/${vehicle.id}`).send({ confirmLicensePlate: vehicle.licensePlate })).status).toBe(200);
      const record = await binRowFor("vehicle", vehicle.id);

      const res = await binKeeper.delete(`/api/deleted-records/${record.id}`);
      expect(res.body).toEqual({ purged: 1, failed: [] });
      expect(fs.readFileSync(victim, "utf8")).toBe("outside, reached through a link");
    } finally {
      fs.rmSync(path.join(UPLOADS, linkName), { force: true, recursive: false });
    }
  });

  it("a file that cannot be removed is reported under failed with its own code; the row purge stands", async () => {
    const vehicle = await createFixtureVehicle();
    const file = put(`${vehicle.licensePlate}/stuck-${unique("j")}.pdf`);
    await addDocument({ vehicleId: vehicle.id, filePath: file });
    expect((await admin.delete(`/api/vehicles/${vehicle.id}`).send({ confirmLicensePlate: vehicle.licensePlate })).status).toBe(200);
    const record = await binRowFor("vehicle", vehicle.id);

    const spy = vi.spyOn(fs.promises, "unlink").mockRejectedValueOnce(Object.assign(new Error("EACCES: permission denied"), { code: "EACCES" }));
    const res = await binKeeper.delete(`/api/deleted-records/${record.id}`);
    spy.mockRestore();

    expect(res.status).toBe(200);
    expect(res.body.purged).toBe(1);
    expect(res.body.failed).toHaveLength(1);
    expect(res.body.failed[0]).toMatchObject({ id: record.id, code: "FILE_REMOVAL_FAILED" });
    // The OS message stays out of the answer; the file is still there.
    expect(JSON.stringify(res.body)).not.toContain("EACCES");
    expect(onDisk(file)).toBe(true);
    expect(await binRowExists(record.id)).toBe(false);
    expect((await auditRows("vehicle.purge", vehicle.id))[0].details).toMatchObject({ files: { failed: 1 } });
  });
});

describe("C-07 - a customer: files from the cascade snapshot, and the debtor number is free again", () => {
  it("removes driver licences and portal attachments; the debtor number can be used again afterwards", async () => {
    const debtor = `C07-${Date.now().toString(36)}`;
    const created = await admin.post("/api/customers").send({ name: `${ROW_PREFIX}Klant-${unique("k")}`, customerType: "business", debtorNumber: debtor });
    expect(created.status).toBe(201);
    const id = created.body.id;

    const licence = put(`drivers/licence-${unique("l")}.jpg`);
    const attachment = put(`portal/attachment-${unique("m")}.pdf`);
    await db.insert(drivers).values({ customerId: id, displayName: "Piet Test", licenseFilePath: licence });
    const [request] = await db.insert(portalRequests).values({ customerId: id, type: "other", message: "hallo" }).returning();
    await db.insert(portalRequestAttachments).values({
      requestId: request.id, fileName: "a.pdf", filePath: attachment, contentType: "application/pdf", fileSize: 5,
    });

    expect((await admin.delete(`/api/customers/${id}`)).status).toBe(204);
    const record = await binRowFor("customer", id);
    expect(record).toBeDefined();

    // While it sits in the bin the number is reserved ...
    const blocked = await admin.post("/api/customers").send({ name: `${ROW_PREFIX}Nieuw-${unique("n")}`, customerType: "business", debtorNumber: debtor });
    expect(blocked.status).toBe(409);
    expect(blocked.body.code).toBe("DEBTOR_NUMBER_IN_RECYCLE_BIN");

    const res = await binKeeper.post("/api/deleted-records/purge").send({ ids: [record.id] });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ purged: 1, failed: [] });
    expect(onDisk(licence)).toBe(false);
    expect(onDisk(attachment)).toBe(false);

    // ... and the moment the bin row is gone it is free.
    const again = await admin.post("/api/customers").send({ name: `${ROW_PREFIX}Nieuw-${unique("o")}`, customerType: "business", debtorNumber: debtor });
    expect(again.status).toBe(201);
    expect(again.body.debtorNumber).toBe(debtor);

    expect((await auditRows("customer.purge", id))).toHaveLength(1);
  });
});

describe("C-07 - a fine and a transport", () => {
  it("a fine: the letter goes with the bin row, unless a live row shares it", async () => {
    const letter = put(`fines/letter-${unique("p")}.pdf`);
    const sharedLetter = put(`fines/shared-${unique("q")}.pdf`);

    const makeFine = async (file: string, description: string) => {
      const created = await admin.post("/api/fines").send({
        licensePlate: FINE_PLATE, offenceAt: "2031-02-02T10:00:00.000Z", description, amount: 20,
      });
      expect(created.status).toBe(201);
      const id = created.body.fine.id;
      await db.update(fines).set({ letterFilePath: file }).where(eq(fines.id, id));
      return id as number;
    };
    const gone = await makeFine(letter, "Letter weg");
    const first = await makeFine(sharedLetter, "Gedeelde brief 1");
    const second = await makeFine(sharedLetter, "Gedeelde brief 2");

    expect((await admin.delete(`/api/fines/${gone}`)).status).toBe(200);
    expect((await admin.delete(`/api/fines/${first}`)).status).toBe(200);
    const goneRecord = await binRowFor("fine", gone);
    const firstRecord = await binRowFor("fine", first);

    const res = await binKeeper.post("/api/deleted-records/purge").send({ ids: [goneRecord.id, firstRecord.id] });
    expect(res.body).toEqual({ purged: 2, failed: [] });
    expect(onDisk(letter)).toBe(false);
    // `second` is still a live fine with the same letter.
    expect(onDisk(sharedLetter)).toBe(true);
    expect((await db.select().from(fines).where(eq(fines.id, second))).length).toBe(1);
    expect((await auditRows("fine.purge", gone))).toHaveLength(1);
  });

  it("a transport: only the bin row goes", async () => {
    const vehicle = await createFixtureVehicle();
    const [transport] = await db.insert(vehicleTransports).values({
      vehicleId: vehicle.id, transportType: "breakdown", scheduledDate: FUTURE.start, status: "scheduled",
    } as any).returning();
    expect((await admin.delete(`/api/transports/${transport.id}`)).status).toBe(204);
    const record = await binRowFor("transport", transport.id);
    expect(record).toBeDefined();

    const res = await binKeeper.delete(`/api/deleted-records/${record.id}`);
    expect(res.body).toEqual({ purged: 1, failed: [] });
    expect(await binRowExists(record.id)).toBe(false);
    expect((await auditRows("transport.purge", transport.id))).toHaveLength(1);
    // Vehicles and the rest are untouched.
    expect((await db.select().from(vehicles).where(eq(vehicles.id, vehicle.id))).length).toBe(1);
  });
});

describe("C-07 - a reservation: the soft-deleted row goes after its dependants", () => {
  it("removes documents, damage checks, driver assignments, delivery tasks, the usage period and their files; keeps scan events and other records, nulling the links", async () => {
    const vehicle = await createFixtureVehicle();
    const rental = await createFixtureReservation({ customerId, vehicleId: vehicle.id, startDate: FUTURE.start, endDate: FUTURE.end });
    const sibling = await createFixtureReservation({ customerId, vehicleId: vehicle.id, startDate: "2031-05-01", endDate: "2031-05-03" });

    const contract = put(`${vehicle.licensePlate}/contract-${unique("r")}.pdf`);
    const damageUpload = put(`${vehicle.licensePlate}/damage-${unique("s")}.pdf`);
    const photo = put(`${vehicle.licensePlate}/delivery-${unique("t")}.jpg`);
    const vehicleLevel = put(`${vehicle.licensePlate}/apk-${unique("u")}.pdf`);
    await addDocument({ vehicleId: vehicle.id, reservationId: rental.id, filePath: contract });
    await addDocument({ vehicleId: vehicle.id, reservationId: null, filePath: vehicleLevel });
    await db.update(reservations).set({ damageCheckPath: damageUpload }).where(eq(reservations.id, rental.id));
    await db.insert(interactiveDamageChecks).values({ vehicleId: vehicle.id, reservationId: rental.id, checkType: "pickup", checkDate: new Date() });
    await db.insert(reservationDriverAssignments).values({ reservationId: rental.id, assignedFrom: new Date() });
    await db.insert(deliveryTasks).values({ reservationId: rental.id, type: "delivery", deliveryAddress: "Teststraat 2", deliveryPhotoPath: photo });
    const [scan] = await db.insert(scanEvents).values({ code: `${ROW_PREFIX}scan-${unique("v")}`, matchType: "reservation", reservationId: rental.id }).returning();
    // Self-links on ANOTHER reservation (no foreign keys exist for these four).
    await db.update(reservations).set({
      replacementForReservationId: rental.id, maintenanceBlockId: rental.id, affectedRentalId: rental.id, recurringParentId: rental.id,
    }).where(eq(reservations.id, sibling.id));
    // A fiscal assessment of ANOTHER period that names this reservation, and a transport pointing at it.
    const [siblingPeriod] = await db.insert(vehicleUsagePeriods).values({ reservationId: sibling.id, customerId, vehicleId: vehicle.id, startDate: "2031-05-01" }).returning();
    const [assessment] = await db.insert(fiscalAssessments).values({
      usagePeriodId: siblingPeriod.id, customerId, vehicleId: vehicle.id, reservationId: rental.id,
      periodStart: "2031-05-01", periodEndEffective: "2031-05-03", calculationDate: "2031-05-01",
      ruleKey: "test", status: "ok", months: [], dataQuality: "complete", explanation: "test",
      inputs: {}, parameters: [], inputHash: unique("hash"), trigger: "test",
    }).returning();
    const [transport] = await db.insert(vehicleTransports).values({
      vehicleId: vehicle.id, transportType: "delivery", scheduledDate: FUTURE.start, status: "scheduled", reservationId: rental.id,
    } as any).returning();

    expect((await admin.delete(`/api/reservations/${rental.id}`)).status).toBe(200);
    const record = await binRowFor("reservation", rental.id);
    expect(record).toBeDefined();
    // Soft-deleted: the row is still there, with every dependant.
    expect((await db.select().from(reservations).where(eq(reservations.id, rental.id)))[0].deletedAt).not.toBeNull();

    const res = await binKeeper.delete(`/api/deleted-records/${record.id}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ purged: 1, failed: [] });

    const countOf = async (table: any, col: any, id: number) => (await db.select().from(table).where(eq(col, id))).length;
    expect(await binRowExists(record.id)).toBe(false);
    expect(await countOf(reservations, reservations.id, rental.id)).toBe(0);
    expect(await countOf(documents, documents.reservationId, rental.id)).toBe(0);
    expect(await countOf(interactiveDamageChecks, interactiveDamageChecks.reservationId, rental.id)).toBe(0);
    expect(await countOf(reservationDriverAssignments, reservationDriverAssignments.reservationId, rental.id)).toBe(0);
    expect(await countOf(deliveryTasks, deliveryTasks.reservationId, rental.id)).toBe(0);
    expect(await countOf(vehicleUsagePeriods, vehicleUsagePeriods.reservationId, rental.id)).toBe(0);
    for (const f of [contract, damageUpload, photo]) expect(onDisk(f), `${f} should be gone`).toBe(false);
    expect(onDisk(vehicleLevel), "a vehicle-level document is not this reservation's").toBe(true);

    // Kept, with the link cleared.
    expect((await db.select().from(scanEvents).where(eq(scanEvents.id, scan.id)))[0].reservationId).toBeNull();
    expect((await db.select().from(fiscalAssessments).where(eq(fiscalAssessments.id, assessment.id)))[0].reservationId).toBeNull();
    expect((await db.select().from(vehicleTransports).where(eq(vehicleTransports.id, transport.id)))[0].reservationId).toBeNull();
    const [after] = await db.select().from(reservations).where(eq(reservations.id, sibling.id));
    expect(after).toBeDefined();
    expect([after.replacementForReservationId, after.maintenanceBlockId, after.affectedRentalId, after.recurringParentId]).toEqual([null, null, null, null]);

    const audit = await auditRows("reservation.purge", rental.id);
    expect(audit).toHaveLength(1);
    expect(audit[0].details).toMatchObject({ label: record.label, deletedRecordId: record.id, restored: false });
    expect((audit[0].details as any).removed).toMatchObject({ reservations: 1, documents: 1, interactive_damage_checks: 1, delivery_tasks: 1, reservation_driver_assignments: 1 });
  });

  it("a maintenance block goes the same way, under its own audit action", async () => {
    const vehicle = await createFixtureVehicle();
    const block = await createFixtureReservation({ customerId: null, vehicleId: vehicle.id, startDate: FUTURE.start, endDate: FUTURE.end, type: "maintenance_block" });
    const apk = put(`${vehicle.licensePlate}/apk-block-${unique("w")}.pdf`);
    await addDocument({ vehicleId: vehicle.id, reservationId: block.id, filePath: apk });
    expect((await admin.delete(`/api/reservations/${block.id}`)).status).toBe(200);
    const record = await binRowFor("maintenance_block", block.id);

    const res = await binKeeper.post("/api/deleted-records/purge").send({ ids: [record.id] });
    expect(res.body).toEqual({ purged: 1, failed: [] });
    expect((await db.select().from(reservations).where(eq(reservations.id, block.id))).length).toBe(0);
    expect(onDisk(apk)).toBe(false);
    expect((await auditRows("maintenance_block.purge", block.id))).toHaveLength(1);
    expect((await auditRows("reservation.purge", block.id))).toHaveLength(0);
  });

  it("a purge that rolls back removes nothing at all - no row, no dependant, no file - and says PURGE_FAILED; the others in the selection still go", async () => {
    const vehicle = await createFixtureVehicle();
    const rental = await createFixtureReservation({ customerId, vehicleId: vehicle.id, startDate: FUTURE.start, endDate: FUTURE.end });
    const contract = put(`${vehicle.licensePlate}/rollback-${unique("rb")}.pdf`);
    const doc = await addDocument({ vehicleId: vehicle.id, reservationId: rental.id, filePath: contract });
    expect((await admin.delete(`/api/reservations/${rental.id}`)).status).toBe(200);
    const record = await binRowFor("reservation", rental.id);
    const other = await insertBinRow("transport");

    // The first transaction does all its work and then fails, as a commit that cannot happen would.
    const original = db.transaction.bind(db);
    const spy = vi.spyOn(db, "transaction").mockImplementationOnce(((work: any) =>
      original(async (tx: any) => { await work(tx); throw new Error("forced rollback"); })) as any);
    const res = await binKeeper.post("/api/deleted-records/purge").send({ ids: [record.id, other.id] });
    spy.mockRestore();

    expect(res.status).toBe(200);
    expect(res.body.purged).toBe(1);
    expect(res.body.failed).toEqual([{ id: record.id, code: "PURGE_FAILED", message: expect.any(String) }]);
    expect(JSON.stringify(res.body)).not.toContain("forced rollback");
    expect(await binRowExists(record.id)).toBe(true);
    expect((await db.select().from(reservations).where(eq(reservations.id, rental.id))).length).toBe(1);
    expect((await db.select().from(documents).where(eq(documents.id, doc.id))).length).toBe(1);
    expect(onDisk(contract)).toBe(true);
    expect(await binRowExists(other.id)).toBe(false);
    const audit = await auditRows("reservation.purge", rental.id);
    expect(audit).toHaveLength(1);
    expect(audit[0].status).toBe("failure");

    // And a second try, now that nothing is wrong, completes.
    const retry = await binKeeper.delete(`/api/deleted-records/${record.id}`);
    expect(retry.body).toEqual({ purged: 1, failed: [] });
    expect(onDisk(contract)).toBe(false);
  });

  it("a reservation that is live again (restored by hand, bin row never marked) is never hard-deleted: only the bin row goes", async () => {
    const vehicle = await createFixtureVehicle();
    const rental = await createFixtureReservation({ customerId, vehicleId: vehicle.id, startDate: FUTURE.start, endDate: FUTURE.end });
    expect((await admin.delete(`/api/reservations/${rental.id}`)).status).toBe(200);
    const record = await binRowFor("reservation", rental.id);
    await db.update(reservations).set({ deletedAt: null }).where(eq(reservations.id, rental.id));

    const res = await binKeeper.delete(`/api/deleted-records/${record.id}`);
    expect(res.body).toEqual({ purged: 1, failed: [] });
    expect(await binRowExists(record.id)).toBe(false);
    expect((await db.select().from(reservations).where(eq(reservations.id, rental.id))).length).toBe(1);
  });
});

describe("C-07 - a record that was restored: only the bin row goes", () => {
  it("keeps the customer, its driver and the driver's licence file", async () => {
    const created = await admin.post("/api/customers").send({ name: `${ROW_PREFIX}Terug-${unique("x")}`, customerType: "business" });
    const id = created.body.id;
    const licence = put(`drivers/restored-${unique("y")}.jpg`);
    await db.insert(drivers).values({ customerId: id, displayName: "Terug Test", licenseFilePath: licence });
    expect((await admin.delete(`/api/customers/${id}`)).status).toBe(204);
    const record = await binRowFor("customer", id);
    expect((await binKeeper.post(`/api/deleted-records/${record.id}/restore`).send({})).status).toBe(200);
    expect((await db.select().from(customers).where(eq(customers.id, id))).length).toBe(1);

    const res = await binKeeper.delete(`/api/deleted-records/${record.id}`);
    expect(res.body).toEqual({ purged: 1, failed: [] });
    expect(await binRowExists(record.id)).toBe(false);
    expect((await db.select().from(customers).where(eq(customers.id, id))).length).toBe(1);
    expect((await db.select().from(drivers).where(eq(drivers.customerId, id))).length).toBe(1);
    expect(onDisk(licence)).toBe(true);
    expect((await auditRows("customer.purge", id))[0].details).toMatchObject({ restored: true });
  });

  it("a restore and a purge of the same record at the same moment end in one clean state: never a 5xx, never a customer without its licence file", async () => {
    for (let attempt = 0; attempt < 3; attempt++) {
      const created = await admin.post("/api/customers").send({ name: `${ROW_PREFIX}Race-${unique("race")}`, customerType: "business" });
      const id = created.body.id;
      const licence = put(`drivers/race-${unique("rc")}.jpg`);
      await db.insert(drivers).values({ customerId: id, displayName: "Race Test", licenseFilePath: licence });
      expect((await admin.delete(`/api/customers/${id}`)).status).toBe(204);
      const record = await binRowFor("customer", id);

      const [restore, purge] = await Promise.all([
        binKeeper.post(`/api/deleted-records/${record.id}/restore`).send({}),
        admin.delete(`/api/deleted-records/${record.id}`),
      ]);

      expect(restore.status, JSON.stringify(restore.body)).toBeLessThan(500);
      expect(purge.status, JSON.stringify(purge.body)).toBeLessThan(500);
      const live = (await db.select().from(customers).where(eq(customers.id, id))).length === 1;
      expect(await binRowExists(record.id), "either way the bin row is gone").toBe(false);
      if (live) {
        // The restore won: the purge found a restored record and removed only the bin row.
        expect(restore.status).toBe(200);
        expect(onDisk(licence)).toBe(true);
        expect((await db.select().from(drivers).where(eq(drivers.customerId, id))).length).toBe(1);
      } else {
        // The purge won: the restore was refused cleanly, and the file went with the record.
        expect(restore.status).toBe(409);
        expect(onDisk(licence)).toBe(false);
      }
    }
  });

  it("keeps a restored reservation with its documents", async () => {
    const vehicle = await createFixtureVehicle();
    const rental = await createFixtureReservation({ customerId, vehicleId: vehicle.id, startDate: FUTURE.start, endDate: FUTURE.end });
    const contract = put(`${vehicle.licensePlate}/restored-contract-${unique("z")}.pdf`);
    await addDocument({ vehicleId: vehicle.id, reservationId: rental.id, filePath: contract });
    expect((await admin.delete(`/api/reservations/${rental.id}`)).status).toBe(200);
    const record = await binRowFor("reservation", rental.id);
    expect((await binKeeper.post(`/api/deleted-records/${record.id}/restore`).send({})).status).toBe(200);

    expect((await binKeeper.delete(`/api/deleted-records/${record.id}`)).body).toEqual({ purged: 1, failed: [] });
    const [back] = await db.select().from(reservations).where(eq(reservations.id, rental.id));
    expect(back.deletedAt).toBeNull();
    expect(onDisk(contract)).toBe(true);
    expect((await db.select().from(documents).where(eq(documents.reservationId, rental.id))).length).toBe(1);
  });
});

/* ------------------------------------------------------------------ *
 * Selection, all, audit
 * ------------------------------------------------------------------ */

describe("C-07 - a selection, a whole kind, and the audit trail", () => {
  it("purges exactly the selected rows, counts a repeated id once and reports an unknown one", async () => {
    const rows = [await insertBinRow("transport"), await insertBinRow("transport"), await insertBinRow("transport")];
    const res = await binKeeper.post("/api/deleted-records/purge").send({ ids: [rows[0].id, rows[2].id, rows[0].id, 2147482000] });
    expect(res.status).toBe(200);
    expect(res.body.purged).toBe(2);
    expect(res.body.failed).toEqual([{ id: 2147482000, code: "NOT_FOUND", message: expect.any(String) }]);
    expect(await binRowExists(rows[0].id)).toBe(false);
    expect(await binRowExists(rows[1].id)).toBe(true);
    expect(await binRowExists(rows[2].id)).toBe(false);
  });

  it("a selection may mix kinds; each record gets the audit row of its own kind", async () => {
    const t = await insertBinRow("transport");
    const f = await insertBinRow("fine");
    const res = await binKeeper.post("/api/deleted-records/purge").send({ ids: [t.id, f.id] });
    expect(res.body).toEqual({ purged: 2, failed: [] });
    expect(await auditRows("transport.purge", t.entityId)).toHaveLength(1);
    expect(await auditRows("fine.purge", f.entityId)).toHaveLength(1);
  });

  it("{ entityType, all: true } empties that kind - restored rows included - and no other kind", async () => {
    const mine = [
      await insertBinRow("transport"),
      await insertBinRow("transport", { restoredAt: new Date(), restoredBy: "kees" }),
    ];
    const otherKind = await insertBinRow("maintenance_block");
    const before = (await db.select({ id: deletedRecords.id }).from(deletedRecords).where(eq(deletedRecords.entityType, "transport"))).length;
    expect(before).toBeGreaterThanOrEqual(2);

    const res = await binKeeper.post("/api/deleted-records/purge").send({ entityType: "transport", all: true });
    expect(res.status).toBe(200);
    expect(res.body.purged).toBe(before);
    expect(res.body.failed).toEqual([]);
    expect((await db.select().from(deletedRecords).where(eq(deletedRecords.entityType, "transport"))).length).toBe(0);
    for (const row of mine) expect(await binRowExists(row.id)).toBe(false);
    expect(await binRowExists(otherKind.id)).toBe(true);
    expect((await binKeeper.get("/api/deleted-records?type=transport")).body).toEqual([]);

    // Emptying an empty bin is a clean no-op.
    const again = await binKeeper.post("/api/deleted-records/purge").send({ entityType: "transport", all: true });
    expect(again.body).toEqual({ purged: 0, failed: [] });
  });

  it("the routes log for themselves: one purge row per record and no generic 'deleted-record' rows", async () => {
    const a = await insertBinRow("transport");
    await binKeeper.delete(`/api/deleted-records/${a.id}`);
    const b = await insertBinRow("transport");
    const c = await insertBinRow("transport");
    await binKeeper.post("/api/deleted-records/purge").send({ ids: [b.id, c.id] });
    // The mutation middleware writes after the response; give it room to (not) do so.
    await new Promise((resolve) => setTimeout(resolve, 250));

    const mine = await db.select().from(auditLogs).where(eq(auditLogs.userId, binKeeper.userId));
    const wanted = [a, b, c].map((r) => String(r.entityId));
    // Exactly one purge row for each of the three records (this account purged others in
    // the tests above, hence the filter on the ids) ...
    for (const entityId of wanted) {
      expect(mine.filter((r) => r.action === "transport.purge" && r.resourceId === entityId), entityId).toHaveLength(1);
    }
    // ... and the generic middleware wrote nothing of its own for these requests.
    expect(mine.filter((r) => /^deleted-record/.test(r.action))).toEqual([]);
  });
});
