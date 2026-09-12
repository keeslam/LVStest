/**
 * FIX-O — document registration and storage (BUG-027, BUG-050, BUG-150,
 * BUG-165, BUG-184, BUG-190) plus owner decision B-05.
 *
 * Everything here asserts on the `documents` table and the files on disk,
 * because that is exactly what the defects had in common: the endpoints all
 * answered 200 with a perfectly good PDF while the dossier stayed empty, or
 * grew rows that pointed at one shared file.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs";
import path from "path";
import { eq, inArray, and } from "drizzle-orm";
import { useTempUploadsDir, removeTempUploadsDir } from "./helpers/uploads";

const uploadsDir = useTempUploadsDir("lvs-fix-o-");

import { db } from "../db";
import { documents, pdfTemplates, vehicles, type Vehicle, type Customer, type Reservation } from "../../shared/schema";
import { agentFor, cleanupFixtureUsers, type TestAgent } from "./helpers/app";
import {
  createFixtureCustomer,
  createFixtureVehicle,
  createFixtureReservation,
  cleanupFixtures,
} from "./helpers/fixtures";
import { resolveDocumentFilePath } from "../services/document-paths";

const TEMPLATE_NAME = "FIXT-O-contract-template";

let admin: TestAgent;
let customer: Customer;
let vehicle: Vehicle;
let reservation: Reservation;
let templateId: number;
let previousDefaultIds: number[] = [];

async function documentsFor(reservationId: number) {
  return db.select().from(documents).where(eq(documents.reservationId, reservationId));
}

beforeAll(async () => {
  admin = await agentFor("admin");
  customer = await createFixtureCustomer("Registry");
  vehicle = await createFixtureVehicle();
  reservation = await createFixtureReservation({ customerId: customer.id, vehicleId: vehicle.id });

  // The test database ships with a default contract template that has no
  // fields at all, which the new picker refuses (BUG-028). Park it for the
  // duration of this file and put a usable one in its place.
  const existingDefaults = await db.select({ id: pdfTemplates.id }).from(pdfTemplates).where(eq(pdfTemplates.isDefault, true));
  previousDefaultIds = existingDefaults.map((row) => row.id);
  if (previousDefaultIds.length > 0) {
    await db.update(pdfTemplates).set({ isDefault: false }).where(inArray(pdfTemplates.id, previousDefaultIds));
  }
  const [template] = await db
    .insert(pdfTemplates)
    .values({
      name: TEMPLATE_NAME,
      isDefault: true,
      fields: [
        { name: "Naam", source: "customer.name", x: 60, y: 120, fontSize: 11 },
        { name: "Kenteken", source: "vehicle.licensePlate", x: 60, y: 150, fontSize: 11 },
      ] as any,
    })
    .returning();
  templateId = template.id;
});

afterAll(async () => {
  await db.delete(documents).where(eq(documents.vehicleId, vehicle.id));
  await db.delete(pdfTemplates).where(eq(pdfTemplates.name, TEMPLATE_NAME));
  if (previousDefaultIds.length > 0) {
    await db.update(pdfTemplates).set({ isDefault: true }).where(inArray(pdfTemplates.id, previousDefaultIds));
  }
  await cleanupFixtures();
  await cleanupFixtureUsers();
  removeTempUploadsDir(uploadsDir);
});

describe("FIX-O — a generated document always gets a row", () => {
  it("BUG-165: generate-default writes the file AND exactly one documents row", async () => {
    const before = await documentsFor(reservation.id);

    const res = await admin.get(`/api/contracts/generate-default/${reservation.id}`);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("application/pdf");

    const after = await documentsFor(reservation.id);
    // The whole point of BUG-165: this count never went up before the fix.
    expect(after.length).toBe(before.length + 1);

    const created = after.find((row) => !before.some((b) => b.id === row.id))!;
    expect(created.documentType).toBe("Contract (Unsigned)");
    // B-05: the version lives in its own column, not in the type label.
    expect(created.version).toBe(1);
    expect(created.isStale).toBe(false);

    const onDisk = resolveDocumentFilePath(created.filePath);
    expect(onDisk).not.toBeNull();
    expect(fs.existsSync(onDisk!)).toBe(true);
    expect(fs.readFileSync(onDisk!).subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });

  it("BUG-027: two generations produce two rows with two different files", async () => {
    const first = await admin.get(`/api/contracts/generate/${reservation.id}?templateId=${templateId}`);
    expect(first.status).toBe(200);
    const second = await admin.get(`/api/contracts/generate/${reservation.id}?templateId=${templateId}`);
    expect(second.status).toBe(200);

    const rows = (await documentsFor(reservation.id))
      .filter((row) => row.documentType === "Contract (Unsigned)")
      .sort((a, b) => a.id - b.id);
    expect(rows.length).toBeGreaterThanOrEqual(2);

    const lastTwo = rows.slice(-2);
    expect(lastTwo[0].filePath).not.toBe(lastTwo[1].filePath);
    for (const row of lastTwo) {
      const onDisk = resolveDocumentFilePath(row.filePath);
      expect(onDisk, `file for document ${row.id}`).not.toBeNull();
      expect(fs.existsSync(onDisk!)).toBe(true);
    }

    // Deleting the older one must not break the newer one: before the fix both
    // rows pointed at the same bytes on disk.
    const deleted = await admin.delete(`/api/documents/${lastTwo[0].id}`);
    expect(deleted.status).toBe(200);
    const download = await admin.get(`/api/documents/download/${lastTwo[1].id}`);
    expect(download.status).toBe(200);
  });

  it("B-05: a new version supersedes the older one and gets its own number", async () => {
    const target = await createFixtureReservation({ customerId: customer.id, vehicleId: vehicle.id });
    await admin.get(`/api/contracts/generate/${target.id}?templateId=${templateId}`);
    await admin.get(`/api/contracts/generate/${target.id}?templateId=${templateId}`);

    const rows = (await documentsFor(target.id)).sort((a, b) => a.id - b.id);
    expect(rows.map((r) => r.version)).toEqual([1, 2]);
    expect(rows[0].isStale).toBe(true);
    expect(rows[0].staleReason).toContain("superseded");
    expect(rows[1].isStale).toBe(false);
  });

  it("BUG-190: two parallel generations never both claim version 1", async () => {
    const target = await createFixtureReservation({ customerId: customer.id, vehicleId: vehicle.id });
    const [a, b] = await Promise.all([
      admin.get(`/api/contracts/generate/${target.id}?templateId=${templateId}`),
      admin.get(`/api/contracts/generate/${target.id}?templateId=${templateId}`),
    ]);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);

    const rows = await documentsFor(target.id);
    expect(rows.length).toBe(2);
    expect([...rows.map((r) => r.version)].sort()).toEqual([1, 2]);
    expect(new Set(rows.map((r) => r.filePath)).size).toBe(2);
  });

  it("BUG-150: a plate change does not orphan the documents of that vehicle", async () => {
    const target = await createFixtureReservation({ customerId: customer.id, vehicleId: vehicle.id });
    const generated = await admin.get(`/api/contracts/generate/${target.id}?templateId=${templateId}`);
    expect(generated.status).toBe(200);
    const [doc] = await documentsFor(target.id);

    await db.update(vehicles).set({ licensePlate: `FIXT-moved-${Date.now().toString(36)}`.slice(0, 20) }).where(eq(vehicles.id, vehicle.id));

    const download = await admin.get(`/api/documents/download/${doc.id}`);
    expect(download.status).toBe(200);
    // The folder is keyed on the vehicle id, so the path never mentions a plate
    // that can be changed or re-issued to another car.
    expect(doc.filePath.replace(/\\/g, "/")).toContain(`documents/${vehicle.id}/`);
  });

  it("BUG-195: a document whose file is gone is listed, and says so", async () => {
    const target = await createFixtureReservation({ customerId: customer.id, vehicleId: vehicle.id });
    await admin.get(`/api/contracts/generate/${target.id}?templateId=${templateId}`);
    const [doc] = await documentsFor(target.id);

    const resolved = resolveDocumentFilePath(doc.filePath)!;
    fs.unlinkSync(resolved);

    const list = await admin.get(`/api/documents/reservation/${target.id}`);
    expect(list.status).toBe(200);
    const listed = list.body.find((row: any) => row.id === doc.id);
    expect(listed, "the row is still listed, not hidden").toBeTruthy();
    expect(listed.fileMissing).toBe(true);

    const single = await admin.get(`/api/documents/${doc.id}`);
    expect(single.body.fileMissing).toBe(true);
  });

  it("B-05: 'opnieuw genereren' makes a new version and marks the old one out of date", async () => {
    const target = await createFixtureReservation({ customerId: customer.id, vehicleId: vehicle.id });
    await admin.get(`/api/contracts/generate/${target.id}?templateId=${templateId}`);
    const [original] = await documentsFor(target.id);

    const regenerated = await admin.post(`/api/documents/${original.id}/regenerate`).send({});
    expect(regenerated.status).toBe(201);
    expect(regenerated.body.version).toBe(2);
    expect(regenerated.body.filePath).not.toBe(original.filePath);

    const [refreshed] = await db.select().from(documents).where(eq(documents.id, original.id));
    expect(refreshed.isStale).toBe(true);
  });

  it("B-05: an uploaded document cannot be 'regenerated'", async () => {
    const [uploaded] = await db
      .insert(documents)
      .values({
        vehicleId: vehicle.id,
        reservationId: reservation.id,
        documentType: "APK Inspection",
        fileName: "apk.pdf",
        filePath: "does/not/matter.pdf",
        fileSize: 10,
        contentType: "application/pdf",
      })
      .returning();
    const res = await admin.post(`/api/documents/${uploaded.id}/regenerate`).send({});
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/regenerated/i);
  });
});

describe("FIX-O — template files are cleaned up with their template", () => {
  it("BUG-050: deleting a PDF template removes its background and preview", async () => {
    const templatesDir = path.join(uploadsDir, "templates");
    fs.mkdirSync(templatesDir, { recursive: true });
    const backgroundAbs = path.join(templatesDir, `fixt-o-background-${Date.now()}.pdf`);
    const previewAbs = path.join(templatesDir, `fixt-o-background-${Date.now()}_preview.png`);
    fs.writeFileSync(backgroundAbs, Buffer.from("%PDF-1.4\n%%EOF\n"));
    fs.writeFileSync(previewAbs, Buffer.from([0x89, 0x50, 0x4e, 0x47]));

    const [template] = await db
      .insert(pdfTemplates)
      .values({
        name: `${TEMPLATE_NAME}-with-background`,
        fields: [] as any,
        backgroundPath: path.relative(uploadsDir, backgroundAbs).split(path.sep).join("/"),
        backgroundPreviewPath: path.relative(uploadsDir, previewAbs).split(path.sep).join("/"),
      } as any)
      .returning();

    const res = await admin.delete(`/api/pdf-templates/${template.id}`);
    expect(res.status).toBe(200);

    expect(fs.existsSync(backgroundAbs)).toBe(false);
    expect(fs.existsSync(previewAbs)).toBe(false);

    await db.delete(pdfTemplates).where(eq(pdfTemplates.id, template.id));
  });

  it("BUG-050: the shared default background is never deleted", async () => {
    const templatesDir = path.join(uploadsDir, "templates");
    fs.mkdirSync(templatesDir, { recursive: true });
    const sharedDefault = path.join(templatesDir, "rental_contract_template.pdf");
    fs.writeFileSync(sharedDefault, Buffer.from("%PDF-1.4\n%%EOF\n"));

    const [template] = await db
      .insert(pdfTemplates)
      .values({
        name: `${TEMPLATE_NAME}-shared-default`,
        fields: [] as any,
        backgroundPath: "templates/rental_contract_template.pdf",
      } as any)
      .returning();

    const res = await admin.delete(`/api/pdf-templates/${template.id}`);
    expect(res.status).toBe(200);
    expect(fs.existsSync(sharedDefault)).toBe(true);

    await db.delete(pdfTemplates).where(eq(pdfTemplates.id, template.id));
  });
});
