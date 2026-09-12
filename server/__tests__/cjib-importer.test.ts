import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs from "fs";
import path from "path";

const { sendEmail } = vi.hoisted(() => ({ sendEmail: vi.fn(async () => true) }));
vi.mock("../utils/email-service", () => ({ sendEmail }));

import { importCjibFile } from "../services/cjib/importer";
import { resolveDocumentFilePath } from "../services/document-paths";
import { importStorage } from "../services/cjib/import-storage";
import { finesStorage } from "../services/fines-storage";
import { storage } from "../storage";
import { createTestCustomer, createTestVehicle, createTestDriver, createTestReservation, cleanupPortalTestData, TEST_PREFIX } from "./portal-helpers";

const fixture = (name: string) => fs.readFileSync(path.join(__dirname, "fixtures", "cjib", name));

describe("cjib importer", () => {
  let customerId: number, reservationId: number;
  const rawPaths: string[] = [];

  beforeAll(async () => {
    await cleanupPortalTestData();
    customerId = (await createTestCustomer("Cjib")).id;
    const driverId = (await createTestDriver(customerId, "Cjib Driver")).id;
    const vehicleId = (await createTestVehicle("PTCJ01")).id; // matches the first XML record
    await createTestVehicle("PTCJ02");
    reservationId = (await createTestReservation({ customerId, vehicleId, driverId, startDate: "2026-07-20", endDate: "2026-07-30", status: "picked_up" })).id;
  });
  afterAll(async () => {
    await cleanupPortalTestData();
    for (const p of rawPaths) fs.rmSync(p, { force: true });
    const notes = await storage.getCustomNotificationsByType("portal_fine_import");
    for (const n of notes) if (n.description.includes(TEST_PREFIX) || n.title.includes(TEST_PREFIX)) await storage.deleteCustomNotification(n.id);
  });

  it("creates and links fines from the XML fixture, and tells staff", async () => {
    const before = (await storage.getCustomNotificationsByType("portal_fine_import")).length;
    const { file, skipped } = await importCjibFile({ buffer: fixture("beschikkingen.xml"), fileName: `${TEST_PREFIX}beschikkingen.xml`, source: "cjib_upload", createdBy: "test" });
    // FIX-B: rawPath is now stored relative to the uploads root rather than to
    // process.cwd(), so it resolves through the one owner — which additionally
    // proves the file really is inside the uploads directory. Cleanup uses the
    // resolved absolute path.
    const rawAbsolute = resolveDocumentFilePath(file.rawPath!);
    if (rawAbsolute) rawPaths.push(rawAbsolute);
    expect(skipped).toBe(false);
    expect(file).toMatchObject({ status: "processed", recordsTotal: 2, recordsCreated: 2, recordsLinked: 1, recordsDuplicate: 0, recordsFailed: 0 });
    expect(rawAbsolute).not.toBeNull();
    expect(fs.existsSync(rawAbsolute!)).toBe(true);

    const linked = file.details.find((d) => d.reference === "1234567890")!;
    expect(linked.outcome).toBe("linked");
    const fine = await finesStorage.getFine(linked.fineId!);
    expect(fine).toMatchObject({ status: "linked", customerId, reservationId, source: "cjib", importFileId: file.id, amount: "95.00", receivedAt: "2026-07-30" });
    expect(fine!.internalNotes).toContain("Feitcode VM012");

    const unlinked = file.details.find((d) => d.reference === "1234567891")!;
    expect(unlinked.outcome).toBe("created");
    expect((await finesStorage.getFine(unlinked.fineId!))!.status).toBe("new");

    expect((await storage.getCustomNotificationsByType("portal_fine_import")).length).toBe(before + 1);
    expect((await finesStorage.listFines({ importFileId: file.id })).length).toBe(2);
  });

  it("skips the same file a second time and counts duplicate references from another file", async () => {
    const again = await importCjibFile({ buffer: fixture("beschikkingen.xml"), fileName: `${TEST_PREFIX}beschikkingen.xml`, source: "cjib_ftps", createdBy: "scheduler" });
    expect(again.skipped).toBe(true);

    // Same beschikkingsnummer in a differently formatted file: not created twice.
    const csv = "beschikkingsnummer;kenteken;pleegdatum;bedrag;omschrijving\n1234567890;PT-CJ-01;26-07-2026;95;dubbel\n";
    const { file } = await importCjibFile({ buffer: Buffer.from(csv), fileName: `${TEST_PREFIX}dubbel.csv`, source: "cjib_upload", createdBy: "test" });
    { const abs = resolveDocumentFilePath(file.rawPath!); if (abs) rawPaths.push(abs); }
    expect(file).toMatchObject({ recordsTotal: 1, recordsCreated: 0, recordsDuplicate: 1 });
  });

  it("records a parse error instead of throwing", async () => {
    const { file } = await importCjibFile({ buffer: Buffer.from("kapot"), fileName: `${TEST_PREFIX}kapot.csv`, source: "cjib_upload", createdBy: "test" });
    { const abs = resolveDocumentFilePath(file.rawPath!); if (abs) rawPaths.push(abs); }
    expect(file.status).toBe("failed");
    expect(file.errorMessage).toMatch(/CSV/);
  });

  it("keeps going when one record is broken", async () => {
    const csv = "beschikkingsnummer;kenteken;pleegdatum;bedrag\n3000000001;PT-CJ-02;01-08-2026;50\n3000000002;;01-08-2026;50\n";
    const { file } = await importCjibFile({ buffer: Buffer.from(csv), fileName: `${TEST_PREFIX}half.csv`, source: "cjib_upload", createdBy: "test" });
    { const abs = resolveDocumentFilePath(file.rawPath!); if (abs) rawPaths.push(abs); }
    expect(file).toMatchObject({ status: "processed", recordsTotal: 2, recordsCreated: 1, recordsFailed: 1 });
    expect(file.details.find((d) => d.outcome === "failed")!.error).toMatch(/missing kenteken/);
    expect(await importStorage.get(file.id)).toBeDefined();
  });
});
