/**
 * B-65: the ticked documents of one vehicle as one ZIP. Same names get a number, a file lost on
 * disk is named in ontbrekend.txt, and documents of another vehicle never go in.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import fs from "fs";
import path from "path";
import { eq } from "drizzle-orm";
import vehicleDocumentsZipRoutes, { uniqueZipName } from "../routes/vehicle-documents-zip";
import { buildStaffTestApp, createTestCustomer, createTestVehicle, createTestReservation, createTestDocument, cleanupPortalTestData } from "./portal-helpers";
import { UserPermission, documents } from "../../shared/schema";
import { getUploadsDir } from "../../shared/paths";
import { db } from "../db";

const binary = (res: any, cb: (err: Error | null, body: Buffer) => void) => {
  const chunks: Buffer[] = [];
  res.on("data", (c: Buffer) => chunks.push(c));
  res.on("end", () => cb(null, Buffer.concat(chunks)));
};

describe("documenten van een voertuig als ZIP (B-65)", () => {
  const app = buildStaffTestApp([UserPermission.VIEW_DOCUMENTS], (a) => a.use("/api/vehicle-documents", vehicleDocumentsZipRoutes));
  const docFile = path.join(getUploadsDir(), "__portal_test__", "test.pdf");
  let vehicleId: number, otherVehicleId: number, docA: number, docB: number, lost: number, foreign: number;

  beforeAll(async () => {
    await cleanupPortalTestData();
    fs.mkdirSync(path.dirname(docFile), { recursive: true });
    fs.writeFileSync(docFile, "%PDF-1.4 test");
    const customerId = (await createTestCustomer("Zip")).id;
    vehicleId = (await createTestVehicle("PT-ZIP-1")).id;
    otherVehicleId = (await createTestVehicle("PT-ZIP-2")).id;
    const resId = (await createTestReservation({ customerId, vehicleId })).id;
    const otherRes = (await createTestReservation({ customerId, vehicleId: otherVehicleId })).id;
    docA = (await createTestDocument({ reservationId: resId, vehicleId, documentType: "Contract", fileName: "contract.pdf" })).id;
    docB = (await createTestDocument({ reservationId: resId, vehicleId, documentType: "Contract", fileName: "contract.pdf" })).id;
    lost = (await createTestDocument({ reservationId: resId, vehicleId, documentType: "Foto", fileName: "foto.jpg" })).id;
    await db.update(documents).set({ filePath: "uploads/__portal_test__/bestaat-niet.jpg" }).where(eq(documents.id, lost));
    foreign = (await createTestDocument({ reservationId: otherRes, vehicleId: otherVehicleId, documentType: "Contract", fileName: "ander.pdf" })).id;
  });
  afterAll(async () => { await cleanupPortalTestData(); fs.rmSync(path.dirname(docFile), { recursive: true, force: true }); });

  it("numbers the same names", () => {
    const taken = new Set<string>();
    expect([uniqueZipName("a.pdf", taken), uniqueZipName("A.pdf", taken), uniqueZipName("a.pdf", taken)]).toEqual(["a.pdf", "A (2).pdf", "a (3).pdf"]);
  });

  it("zips the ticked documents of this vehicle only, and names a lost file", async () => {
    const res = await request(app).post(`/api/vehicle-documents/${vehicleId}/zip`).send({ ids: [docA, docB, lost, foreign] }).buffer(true).parse(binary);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("application/zip");
    expect(res.headers["content-disposition"]).toMatch(/documenten-PT-ZIP-1-\d{4}-\d{2}-\d{2}\.zip/);
    const body = (res.body as Buffer).toString("latin1");
    expect(body.startsWith("PK")).toBe(true);
    expect(body).toContain("contract.pdf");
    expect(body).toContain("contract (2).pdf");
    expect(body).toContain("ontbrekend.txt");
    expect(body).not.toContain("ander.pdf");
  });

  it("refuses an empty selection and one with nothing of this vehicle", async () => {
    expect((await request(app).post(`/api/vehicle-documents/${vehicleId}/zip`).send({ ids: [] })).status).toBe(400);
    expect((await request(app).post(`/api/vehicle-documents/${vehicleId}/zip`).send({ ids: [foreign] })).status).toBe(404);
  });
});
