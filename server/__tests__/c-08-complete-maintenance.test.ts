/**
 * Sub-project C, Task 8 (besluit B-37) - "Onderhoud afronden" in ONE call.
 *
 * Completing a block used to be three client calls with three different rights
 * (`POST /api/documents`, `PATCH /api/vehicles/:id`, then the completion), and a
 * failure halfway left the upload and the vehicle changes behind. Now the
 * completion route takes the APK date, the mileage and the APK file itself and
 * writes everything in one transaction:
 *
 *   - a `manage_maintenance`-only account can do it (no manage_vehicles, no
 *     manage_documents);
 *   - a mileage below the vehicle's current reading is a 400
 *     `MILEAGE_LOWER_THAN_CURRENT { current, given }` and NOTHING changes - no
 *     document row, no file, no vehicle change, the block stays open;
 *   - the file is written before the commit and unlinked when the transaction
 *     fails.
 *
 * The whole file runs with UPLOADS_DIR pointed at a temp directory (the
 * production shape) so "no file left behind" is a statement about a directory
 * this test owns.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs from "fs";
import path from "path";
import { eq } from "drizzle-orm";

import {
  useTempUploadsDir,
  removeTempUploadsDir,
  listFilesRecursive,
  tinyPdf,
} from "./helpers/uploads";

// MUST run before anything builds the app: registerRoutes() resolves the
// uploads directory once, when it creates the multer destinations.
const TEMP_UPLOADS = useTempUploadsDir("lvs-c08-");

const { db } = await import("../db");
const { reservations, vehicles, documents } = await import("../../shared/schema");
const { storage } = await import("../storage");
const { resolveDocumentFilePath } = await import("../services/document-paths");
const { normalizeReservationStatus } = await import("../services/lifecycle");
const { agentFor, cleanupFixtureUsers } = await import("./helpers/app");
const { createFixtureCustomer, createFixtureVehicle, createFixtureReservation, cleanupFixtures } = await import("./helpers/fixtures");

type Agent = Awaited<ReturnType<typeof agentFor>>;

/** Well away from "today": no assertion here may depend on the date. */
const BLOCK_START = "2026-11-02";
const COMPLETION = "2026-11-09";
const APK_DATE = "2027-11-09";

let admin: Agent;
let maintenanceOnly: Agent;

beforeAll(async () => {
  admin = await agentFor("admin");
  // The point of B-37: this account holds neither manage_vehicles nor manage_documents.
  maintenanceOnly = await agentFor(["manage_maintenance"]);
}, 60_000);

afterAll(async () => {
  await cleanupFixtures();
  await cleanupFixtureUsers();
  removeTempUploadsDir(TEMP_UPLOADS);
});

async function blockRow(id: number) {
  const [row] = await db.select().from(reservations).where(eq(reservations.id, id));
  return row;
}
async function vehicleRow(id: number) {
  const [row] = await db.select().from(vehicles).where(eq(vehicles.id, id));
  return row;
}
async function documentsOf(reservationId: number) {
  return db.select().from(documents).where(eq(documents.reservationId, reservationId));
}

/** A car in the workshop: workshop flag set, `needs_fixing`, an open block. */
async function carInTheWorkshop(overrides: Partial<typeof vehicles.$inferInsert> = {}) {
  const vehicle = await createFixtureVehicle({
    maintenanceStatus: "in_service",
    availabilityStatus: "needs_fixing",
    currentMileage: 40_000,
    apkDate: "2026-12-01",
    lastServiceDate: "2025-11-01",
    lastServiceMileage: 20_000,
    ...overrides,
  });
  const block = await createFixtureReservation({
    customerId: null, vehicleId: vehicle.id, startDate: BLOCK_START, endDate: null,
    status: "booked", type: "maintenance_block",
  });
  await db.update(reservations).set({ maintenanceStatus: "in" }).where(eq(reservations.id, block.id));
  return { vehicle, block };
}

/** The multipart body the completion dialog sends when a file is chosen. */
function completionRequest(agent: Agent, blockId: number, fields: Record<string, string>, file?: { bytes: Buffer; name: string; type: string }) {
  let req = agent.post(`/api/reservations/${blockId}/complete-maintenance`);
  for (const [key, value] of Object.entries(fields)) req = req.field(key, value);
  if (file) req = req.attach("apkFile", file.bytes, { filename: file.name, contentType: file.type });
  return req;
}

const pdfFile = (marker: string) => ({ bytes: tinyPdf(marker), name: "apk-keuring.pdf", type: "application/pdf" });

describe("B-37 - one-call maintenance completion", () => {
  it("a manage_maintenance-only account completes with APK date, mileage and file in one call", async () => {
    const { vehicle, block } = await carInTheWorkshop();
    const bytes = tinyPdf("FIXT-c08-happy");

    const res = await completionRequest(maintenanceOnly, block.id, {
      completionDate: COMPLETION,
      maintenanceCategory: "scheduled_maintenance",
      notes: "regular_maintenance:\nBeurt gedaan",
      currentMileage: "41250",
      apkDate: APK_DATE,
    }, { bytes, name: "apk-keuring.pdf", type: "application/pdf" });

    expect(res.status).toBe(200);

    // The block is closed with the one date convention.
    const closed = await blockRow(block.id);
    expect(closed.maintenanceStatus).toBe("out");
    expect(normalizeReservationStatus(closed.status)).toBe("completed");
    expect(closed.endDate).toBe(COMPLETION);
    expect(closed.startDate).toBe(BLOCK_START);

    // The vehicle: readings written, workshop flag cleared, rentable again.
    const car = await vehicleRow(vehicle.id);
    expect(car.apkDate).toBe(APK_DATE);
    expect(car.currentMileage).toBe(41_250);
    expect(car.lastServiceDate).toBe(COMPLETION);
    expect(car.lastServiceMileage).toBe(41_250);
    expect(car.maintenanceStatus).toBe("ok");
    expect(car.availabilityStatus).toBe("available");

    // The APK file is a documents row tied to the vehicle AND the block.
    const docs = await documentsOf(block.id);
    expect(docs).toHaveLength(1);
    expect(docs[0].documentType).toBe("APK Inspection");
    expect(docs[0].vehicleId).toBe(vehicle.id);
    expect(docs[0].reservationId).toBe(block.id);
    expect(docs[0].contentType).toBe("application/pdf");
    expect(docs[0].notes ?? "").toContain(APK_DATE);

    // ... and the bytes really are on disk.
    const onDisk = resolveDocumentFilePath(docs[0].filePath);
    expect(onDisk).not.toBeNull();
    expect(fs.readFileSync(onDisk!).equals(bytes)).toBe(true);

    // The response says what was written.
    expect(res.body.documentId).toBe(docs[0].id);
    expect(res.body.block.id).toBe(block.id);
    expect(res.body.vehicle).toMatchObject({
      apkDate: APK_DATE, currentMileage: 41_250, lastServiceDate: COMPLETION, lastServiceMileage: 41_250,
    });
  });

  it("a repair does not move the last-service fields; an unchanged vehicle keeps its APK date without a date in the request", async () => {
    const { vehicle, block } = await carInTheWorkshop();

    const res = await completionRequest(maintenanceOnly, block.id, {
      completionDate: COMPLETION, maintenanceCategory: "repair", currentMileage: "40500",
    });

    expect(res.status).toBe(200);
    const car = await vehicleRow(vehicle.id);
    expect(car.currentMileage).toBe(40_500);
    expect(car.apkDate).toBe("2026-12-01");
    expect(car.lastServiceDate).toBe("2025-11-01");
    expect(car.lastServiceMileage).toBe(20_000);
    expect(res.body.documentId).toBeNull();
    expect(await documentsOf(block.id)).toHaveLength(0);
  });

  it("a mileage lower than the vehicle's current reading is a 400 and nothing changes", async () => {
    const { vehicle, block } = await carInTheWorkshop();
    const filesBefore = listFilesRecursive(TEMP_UPLOADS);

    const res = await completionRequest(maintenanceOnly, block.id, {
      completionDate: COMPLETION,
      maintenanceCategory: "scheduled_maintenance",
      currentMileage: "39000",
      apkDate: APK_DATE,
    }, pdfFile("FIXT-c08-lower-mileage"));

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("MILEAGE_LOWER_THAN_CURRENT");
    expect(res.body.current).toBe(40_000);
    expect(res.body.given).toBe(39_000);

    // The block is still open, the vehicle untouched, no document, no file.
    const open = await blockRow(block.id);
    expect(open.maintenanceStatus).toBe("in");
    expect(normalizeReservationStatus(open.status)).toBe("booked");
    expect(open.endDate).toBeNull();

    const car = await vehicleRow(vehicle.id);
    expect(car.currentMileage).toBe(40_000);
    expect(car.apkDate).toBe("2026-12-01");
    expect(car.lastServiceDate).toBe("2025-11-01");
    expect(car.maintenanceStatus).toBe("in_service");
    expect(car.availabilityStatus).toBe("needs_fixing");

    expect(await documentsOf(block.id)).toHaveLength(0);
    expect(listFilesRecursive(TEMP_UPLOADS)).toEqual(filesBefore);
  });

  it("the same mileage as the current reading is fine (only lower is refused)", async () => {
    const { vehicle, block } = await carInTheWorkshop();
    const res = await completionRequest(maintenanceOnly, block.id, {
      completionDate: COMPLETION, currentMileage: "40000",
    });
    expect(res.status).toBe(200);
    expect((await vehicleRow(vehicle.id)).currentMileage).toBe(40_000);
  });

  it("a failure after the file was written rolls everything back and leaves no file", async () => {
    const { vehicle, block } = await carInTheWorkshop();
    const filesBefore = listFilesRecursive(TEMP_UPLOADS);

    // The workshop-flag write is the last write of the transaction: forcing it
    // to throw is the case that would leave a half state without the rollback.
    const spy = vi.spyOn(storage as any, "markVehicleForService")
      .mockRejectedValueOnce(new Error("FIXT-forced failure"));
    let res;
    try {
      res = await completionRequest(maintenanceOnly, block.id, {
        completionDate: COMPLETION,
        maintenanceCategory: "scheduled_maintenance",
        currentMileage: "41000",
        apkDate: APK_DATE,
      }, pdfFile("FIXT-c08-forced-failure"));
    } finally {
      spy.mockRestore();
    }

    expect(res.status).toBe(500);

    const open = await blockRow(block.id);
    expect(open.maintenanceStatus).toBe("in");
    expect(normalizeReservationStatus(open.status)).toBe("booked");

    const car = await vehicleRow(vehicle.id);
    expect(car.currentMileage).toBe(40_000);
    expect(car.apkDate).toBe("2026-12-01");
    expect(car.lastServiceDate).toBe("2025-11-01");
    expect(car.maintenanceStatus).toBe("in_service");

    expect(await documentsOf(block.id)).toHaveLength(0);
    // The file the upload middleware wrote before the transaction is gone.
    expect(listFilesRecursive(TEMP_UPLOADS)).toEqual(filesBefore);
  });

  it("completeMaintenance itself unlinks the file it was handed when its transaction fails or refuses", async () => {
    const { vehicle, block } = await carInTheWorkshop();
    const handOver = (name: string) => {
      const file = path.join(TEMP_UPLOADS, name);
      fs.writeFileSync(file, tinyPdf(name));
      return { path: file, originalName: name, size: fs.statSync(file).size, mimeType: "application/pdf" };
    };

    // a failure inside the transaction
    const failing = handOver("FIXT-direct-failure.pdf");
    const spy = vi.spyOn(storage as any, "markVehicleForService")
      .mockRejectedValueOnce(new Error("FIXT-forced failure"));
    try {
      await expect(storage.completeMaintenance(block.id, {
        completionDate: COMPLETION, apkDate: APK_DATE, currentMileage: 41_000, apkFile: failing,
      })).rejects.toThrow("FIXT-forced failure");
    } finally {
      spy.mockRestore();
    }
    expect(fs.existsSync(failing.path)).toBe(false);

    // a refusal (mileage below the current reading)
    const refused = handOver("FIXT-direct-refusal.pdf");
    const result = await storage.completeMaintenance(block.id, {
      completionDate: COMPLETION, currentMileage: 100, apkFile: refused,
    });
    expect(result.ok).toBe(false);
    expect(fs.existsSync(refused.path)).toBe(false);

    // and nothing of it reached the rows
    expect((await blockRow(block.id)).maintenanceStatus).toBe("in");
    expect((await vehicleRow(vehicle.id)).currentMileage).toBe(40_000);
    expect(await documentsOf(block.id)).toHaveLength(0);
  });

  it("a failing recompute of the spare AFTER the commit keeps the committed document row and file, and the route still answers 200", async () => {
    const { vehicle, block } = await carInTheWorkshop();
    // A spare out with the customer: closing the block closes it, and the spare car
    // gets its availability recomputed after the commit (the step that throws here).
    const customerId = (await createFixtureCustomer("C08spare")).id;
    const spareVehicle = await createFixtureVehicle();
    const rental = await createFixtureReservation({
      customerId, vehicleId: vehicle.id, startDate: BLOCK_START, endDate: "2026-12-20", status: "picked_up",
    });
    const spare = await createFixtureReservation({
      customerId, vehicleId: spareVehicle.id, startDate: BLOCK_START, endDate: null,
      status: "picked_up", type: "replacement",
    });
    await db.update(reservations)
      .set({ replacementForReservationId: rental.id, spareVehicleStatus: "picked_up" })
      .where(eq(reservations.id, spare.id));

    const original = storage.recomputeVehicleAvailability.bind(storage);
    let thrown = 0;
    const spy = vi.spyOn(storage as any, "recomputeVehicleAvailability")
      .mockImplementation(async (...args: any[]) => {
        // Only the spare car's recompute, and only once: the vehicle's own one runs inside the transaction.
        if (args[0] === spareVehicle.id && thrown === 0) {
          thrown += 1;
          throw new Error("FIXT-forced recompute failure");
        }
        return (original as any)(...args);
      });
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    let res;
    try {
      res = await completionRequest(maintenanceOnly, block.id, {
        completionDate: COMPLETION, currentMileage: "41000", apkDate: APK_DATE,
      }, pdfFile("FIXT-c08-post-commit"));
    } finally {
      spy.mockRestore();
      errorLog.mockRestore();
    }

    expect(thrown).toBe(1);
    expect(res.status).toBe(200);

    // Everything committed stays: the block, the spare, the document row and its file.
    expect(normalizeReservationStatus((await blockRow(block.id)).status)).toBe("completed");
    expect(normalizeReservationStatus((await blockRow(spare.id)).status)).toBe("completed");
    const docs = await documentsOf(block.id);
    expect(docs).toHaveLength(1);
    expect(res.body.documentId).toBe(docs[0].id);
    const onDisk = resolveDocumentFilePath(docs[0].filePath);
    expect(onDisk).not.toBeNull();
    expect(fs.existsSync(onDisk!)).toBe(true);
  });

  it("a JSON body without a file still works and carries APK date and mileage", async () => {
    const { vehicle, block } = await carInTheWorkshop();

    const res = await maintenanceOnly.post(`/api/reservations/${block.id}/complete-maintenance`).send({
      completionDate: COMPLETION, maintenanceCategory: "repair", currentMileage: 40_800, apkDate: APK_DATE,
    });

    expect(res.status).toBe(200);
    expect(res.body.documentId).toBeNull();
    const car = await vehicleRow(vehicle.id);
    expect(car.apkDate).toBe(APK_DATE);
    expect(car.currentMileage).toBe(40_800);
    expect(car.maintenanceStatus).toBe("ok");
    expect(car.availabilityStatus).toBe("available");
    expect(await documentsOf(block.id)).toHaveLength(0);
  });

  it("a JSON body that only names the date keeps working exactly as before (OPT-015)", async () => {
    const { vehicle, block } = await carInTheWorkshop();
    const res = await admin.post(`/api/reservations/${block.id}/complete-maintenance`).send({ completionDate: COMPLETION });
    expect(res.status).toBe(200);
    const car = await vehicleRow(vehicle.id);
    expect(car.currentMileage).toBe(40_000);
    expect(car.apkDate).toBe("2026-12-01");
    expect(car.availabilityStatus).toBe("available");
  });

  it("refuses a file that is not an allowed type and leaves nothing behind", async () => {
    const { vehicle, block } = await carInTheWorkshop();
    const filesBefore = listFilesRecursive(TEMP_UPLOADS);

    const res = await completionRequest(maintenanceOnly, block.id, { completionDate: COMPLETION }, {
      bytes: Buffer.from("MZ not a document"), name: "keuring.exe", type: "application/octet-stream",
    });

    expect(res.status).toBe(400);
    expect((await blockRow(block.id)).maintenanceStatus).toBe("in");
    expect((await vehicleRow(vehicle.id)).maintenanceStatus).toBe("in_service");
    expect(listFilesRecursive(TEMP_UPLOADS)).toEqual(filesBefore);
  });

  it("a file whose bytes do not match its declared type is refused and removed", async () => {
    const { block } = await carInTheWorkshop();
    const filesBefore = listFilesRecursive(TEMP_UPLOADS);

    const res = await completionRequest(maintenanceOnly, block.id, { completionDate: COMPLETION }, {
      bytes: Buffer.from("this is plain text, not a pdf"), name: "apk.pdf", type: "application/pdf",
    });

    expect(res.status).toBe(400);
    expect((await blockRow(block.id)).maintenanceStatus).toBe("in");
    expect(await documentsOf(block.id)).toHaveLength(0);
    expect(listFilesRecursive(TEMP_UPLOADS)).toEqual(filesBefore);
  });

  it("an invalid field with a file attached is a 400 and removes the file", async () => {
    const { block } = await carInTheWorkshop();
    const filesBefore = listFilesRecursive(TEMP_UPLOADS);

    for (const fields of [
      { completionDate: "geen datum" },
      { completionDate: COMPLETION, apkDate: "morgen" },
      { completionDate: COMPLETION, currentMileage: "veel" },
      { completionDate: COMPLETION, currentMileage: "-5" },
    ]) {
      const res = await completionRequest(maintenanceOnly, block.id, fields, pdfFile("FIXT-c08-bad-field"));
      expect(res.status).toBe(400);
    }

    expect((await blockRow(block.id)).maintenanceStatus).toBe("in");
    expect(listFilesRecursive(TEMP_UPLOADS)).toEqual(filesBefore);
  });

  it("an unknown block, an ordinary rental and a missing id never write a file", async () => {
    const vehicle = await createFixtureVehicle();
    const rental = await createFixtureReservation({
      customerId: null, vehicleId: vehicle.id, startDate: BLOCK_START, endDate: "2026-12-01", status: "booked",
    });
    const filesBefore = listFilesRecursive(TEMP_UPLOADS);

    const notFound = await completionRequest(maintenanceOnly, 99_999_999, { completionDate: COMPLETION }, pdfFile("FIXT-c08-404"));
    expect(notFound.status).toBe(404);
    const notABlock = await completionRequest(maintenanceOnly, rental.id, { completionDate: COMPLETION }, pdfFile("FIXT-c08-rental"));
    expect(notABlock.status).toBe(400);

    expect(normalizeReservationStatus((await blockRow(rental.id)).status)).toBe("booked");
    expect(listFilesRecursive(TEMP_UPLOADS)).toEqual(filesBefore);
  });

  it("view_vehicles alone is a 403, before any file is written", async () => {
    const { block } = await carInTheWorkshop();
    const outsider = await agentFor(["view_vehicles"]);
    const filesBefore = listFilesRecursive(TEMP_UPLOADS);

    const res = await completionRequest(outsider, block.id, { completionDate: COMPLETION }, pdfFile("FIXT-c08-403"));

    expect(res.status).toBe(403);
    expect((await blockRow(block.id)).maintenanceStatus).toBe("in");
    expect(listFilesRecursive(TEMP_UPLOADS)).toEqual(filesBefore);
  });

  it("D7: a block that is already completed is refused, 409 ALREADY_COMPLETED, and nothing is written", async () => {
    const { vehicle, block } = await carInTheWorkshop();
    const first = await completionRequest(maintenanceOnly, block.id, { completionDate: COMPLETION, currentMileage: "41000" });
    expect(first.status).toBe(200);
    const filesBefore = listFilesRecursive(TEMP_UPLOADS);
    const readingBefore = (await vehicleRow(vehicle.id)).currentMileage;

    const again = await completionRequest(maintenanceOnly, block.id, { completionDate: "2026-11-20", currentMileage: "45000" }, pdfFile("FIXT-c08-again"));

    expect(again.status).toBe(409);
    expect(again.body.code).toBe("ALREADY_COMPLETED");
    // The first completion stands: same end date, same reading, no second document or file.
    expect((await blockRow(block.id)).endDate).toBe(COMPLETION);
    expect((await vehicleRow(vehicle.id)).currentMileage).toBe(readingBefore);
    expect(listFilesRecursive(TEMP_UPLOADS)).toEqual(filesBefore);
  });

  it("manage_reservations (without manage_maintenance) is still accepted: the guard is unchanged", async () => {
    const { block } = await carInTheWorkshop();
    const reservationsOnly = await agentFor(["manage_reservations"]);
    const res = await reservationsOnly.post(`/api/reservations/${block.id}/complete-maintenance`).send({ completionDate: COMPLETION });
    expect(res.status).toBe(200);
  });
});
