/**
 * Kees, 2026-10-18: customers upload a PDF or photo (max 10 MB, with a description) to a reservation.
 * An admin on any of the company's reservations, a driver only on their own car; never on another
 * customer's. The content is checked, staff are told, and the file sits with the reservation's documents.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";
import fs from "fs";
import path from "path";

const { sendEmail } = vi.hoisted(() => ({ sendEmail: vi.fn(async () => true) }));
vi.mock("../utils/email-service", () => ({ sendEmail }));
const { notifyStaffOfPortalEvent } = vi.hoisted(() => ({ notifyStaffOfPortalEvent: vi.fn(async () => {}) }));
vi.mock("../services/portal-notifications", () => ({ notifyStaffOfPortalEvent }));

import { buildPortalTestApp, createTestCustomer, createTestVehicle, createTestReservation, createTestDriver, cleanupPortalTestData, TEST_EMAIL_DOMAIN } from "./portal-helpers";
import { portalStorage } from "../services/portal-storage";
import { resolveDocumentFilePath } from "../services/document-paths";
import { storage } from "../storage";
import { hashPassword } from "../auth";
import { getUploadsDir } from "../../shared/paths";

const PDF = Buffer.from("%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n");

describe("customer uploads on a reservation", () => {
  const app = buildPortalTestApp();
  const stamp = Date.now().toString(36);
  const adminEmail = `upload-admin-${stamp}@${TEST_EMAIL_DOMAIN}`;
  const driverEmail = `upload-driver-${stamp}@${TEST_EMAIL_DOMAIN}`;
  let ownCar: number, colleagueCar: number, foreign: number;
  const stored: string[] = [];

  const login = async (email: string) => {
    const agent = request.agent(app);
    expect((await agent.post("/api/portal/login").send({ email, password: "wachtwoord-1234" })).status).toBe(200);
    const csrf = (await agent.get("/api/portal/csrf-token")).body.token as string;
    return { agent, csrf };
  };
  const upload = (s: Awaited<ReturnType<typeof login>>, id: number, file: Buffer, name: string, description: string | null = "Foto van de schade") => {
    const r = s.agent.post(`/api/portal/reservations/${id}/uploads`).set("X-CSRF-Token", s.csrf);
    if (description !== null) r.field("description", description);
    return r.attach("file", file, name);
  };

  beforeAll(async () => {
    await cleanupPortalTestData();
    const customerId = (await createTestCustomer("Upload")).id;
    const driver = await createTestDriver(customerId, "Eigen Bestuurder");
    ownCar = (await createTestReservation({ customerId, vehicleId: (await createTestVehicle()).id, driverId: driver.id, status: "picked_up" })).id;
    colleagueCar = (await createTestReservation({ customerId, vehicleId: (await createTestVehicle()).id, status: "picked_up" })).id;
    foreign = (await createTestReservation({ customerId: (await createTestCustomer("Ander")).id, vehicleId: (await createTestVehicle()).id })).id;
    for (const [email, role, driverId] of [[adminEmail, "admin", null], [driverEmail, "driver", driver.id]] as const) {
      const user = await portalStorage.createPortalUser({ customerId, email, fullName: role, role, driverId } as any, "t");
      await portalStorage.updatePortalUser(user.id, { passwordHash: await hashPassword("wachtwoord-1234") });
    }
  });
  afterAll(async () => {
    for (const p of stored) fs.rmSync(p, { force: true });
    await cleanupPortalTestData();
  });

  it("an admin uploads a PDF: stored with the reservation, listed, downloadable, staff told", async () => {
    const s = await login(adminEmail);
    const res = await upload(s, colleagueCar, PDF, "schade.pdf");
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ reservationId: colleagueCar, fileName: "schade.pdf", description: "Foto van de schade" });
    const doc = await storage.getDocument(res.body.id);
    expect(doc).toMatchObject({ documentType: "Customer Upload", notes: "Foto van de schade", reservationId: colleagueCar });
    const file = resolveDocumentFilePath(doc!.filePath)!;
    stored.push(file);
    expect(fs.existsSync(file)).toBe(true);
    expect(doc!.filePath).toMatch(/\/customer_upload\//);
    expect(notifyStaffOfPortalEvent).toHaveBeenCalledWith(expect.objectContaining({ kind: "portal_document_upload", link: `/reservations/edit/${colleagueCar}` }));

    expect((await s.agent.get(`/api/portal/reservations/${colleagueCar}/uploads`)).body).toHaveLength(1);
    const download = await s.agent.get(`/api/portal/uploads/${res.body.id}/file`);
    expect(download.status).toBe(200);
    expect(download.headers["x-content-type-options"]).toBe("nosniff");
  });

  it("a driver only on their own car", async () => {
    const s = await login(driverEmail);
    const own = await upload(s, ownCar, PDF, "bon.pdf", "Tankbon");
    expect(own.status).toBe(201);
    stored.push(resolveDocumentFilePath((await storage.getDocument(own.body.id))!.filePath)!);
    expect((await upload(s, colleagueCar, PDF, "bon.pdf", "Tankbon")).status).toBe(404);
    expect((await s.agent.get(`/api/portal/reservations/${colleagueCar}/uploads`)).status).toBe(404);
    // The admin's upload on the colleague's car is not the driver's to read.
    const adminDocs = (await (await login(adminEmail)).agent.get(`/api/portal/reservations/${colleagueCar}/uploads`)).body;
    expect((await s.agent.get(`/api/portal/uploads/${adminDocs[0].id}/file`)).status).toBe(404);
  });

  it("refuses another customer's reservation, a fake PDF, a file over 10 MB and a missing description", async () => {
    const s = await login(adminEmail);
    expect((await upload(s, foreign, PDF, "x.pdf")).status).toBe(404);
    const fake = await upload(s, colleagueCar, Buffer.from("MZ this is not a pdf at all"), "nep.pdf");
    expect(fake.status).toBe(400);
    const big = await upload(s, colleagueCar, Buffer.concat([PDF, Buffer.alloc(10 * 1024 * 1024)]), "groot.pdf");
    expect(big.status).toBe(400);
    expect(big.body.code).toBe("PORTAL_FILE_TOO_LARGE");
    expect((await upload(s, colleagueCar, PDF, "x.pdf", null)).status).toBe(400);
    expect((await s.agent.get(`/api/portal/reservations/${colleagueCar}/uploads`)).body).toHaveLength(1);
    // Nothing was left behind in the incoming folder for the refused files.
    const incoming = fs.readdirSync(path.join(getUploadsDir(), "portal-uploads", "incoming"), { withFileTypes: true }).filter((f) => f.isFile());
    expect(incoming.filter((f) => f.name.startsWith("upload_c"))).toHaveLength(0);
  });

  it("needs the CSRF token", async () => {
    const s = await login(adminEmail);
    const res = await s.agent.post(`/api/portal/reservations/${colleagueCar}/uploads`).field("description", "x").attach("file", PDF, "x.pdf");
    expect(res.status).toBe(403);
  });
});
