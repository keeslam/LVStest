import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";
import path from "path";
import fs from "fs";
import os from "os";

const { processFineLetterWithAI } = vi.hoisted(() => ({ processFineLetterWithAI: vi.fn() }));
vi.mock("../utils/fine-scanner", async (importOriginal) => ({ ...(await importOriginal<any>()), processFineLetterWithAI }));
vi.mock("../utils/email-service", () => ({ sendEmail: vi.fn(async () => true) }));

import { registerFineRoutes } from "../routes/fines";
import { normaliseParsedFine } from "../utils/fine-scanner";
import { buildStaffTestApp, createTestCustomer, createTestVehicle, createTestDriver, createTestReservation, createTestFine, cleanupPortalTestData } from "./portal-helpers";
import { UserPermission } from "../../shared/schema";

// Smallest valid PDF the upload validator accepts.
const PDF = Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n");

describe("fine letter scan", () => {
  const uploadsDir = fs.mkdtempSync(path.join(os.tmpdir(), "fines-scan-"));
  const app = buildStaffTestApp([UserPermission.MANAGE_FINES], (a) => registerFineRoutes(a, { requireAuth: (_r: any, _s: any, n: any) => n(), uploadsDir } as any));
  let customerId: number, driverId: number, reservationId: number;

  beforeAll(async () => {
    await cleanupPortalTestData();
    customerId = (await createTestCustomer("Scan")).id;
    driverId = (await createTestDriver(customerId, "Scan Driver")).id;
    const vehicleId = (await createTestVehicle("PTSCAN1")).id;
    reservationId = (await createTestReservation({ customerId, vehicleId, driverId, startDate: "2026-07-20", endDate: "2026-07-30", status: "picked_up" })).id;
    await createTestFine({ licensePlate: "PTSCAN1", offenceAt: new Date("2026-07-01T10:00:00"), description: "__portal_test__ earlier" })
      .then((f) => import("../services/fines-storage").then(({ finesStorage }) => finesStorage.updateFine(f.id, { reference: "CJIB-DUP-1" })));
  });
  afterAll(async () => { await cleanupPortalTestData(); fs.rmSync(uploadsDir, { recursive: true, force: true }); });

  it("normalises a raw model answer", () => {
    const p = normaliseParsedFine({ licensePlate: "pt-scan-1", offenceAt: "2026-07-26 21:17", amount: 95.004, description: " Snelheid ", confidence: { licensePlate: "high", amount: "nope" } });
    expect(p).toMatchObject({ licensePlate: "PTSCAN1", offenceAt: "2026-07-26T21:17:00", amount: 95, description: "Snelheid" });
    expect(p.confidence).toEqual({ licensePlate: "high", offenceAt: "low", amount: "low", reference: "low" });
  });

  it("returns the parsed letter with the covering reservation and driver", async () => {
    processFineLetterWithAI.mockResolvedValueOnce(normaliseParsedFine({
      licensePlate: "PT-SCAN-1", offenceAt: "2026-07-26T21:17:00", reference: "CJIB-NEW-1", description: "Snelheid 12 km/u te hard", amount: 95,
      confidence: { licensePlate: "high", offenceAt: "high", amount: "high", reference: "medium" },
    }));
    const res = await request(app).post("/api/fines/scan").attach("letterFile", PDF, "brief.pdf");
    expect(res.status).toBe(200);
    expect(res.body.parsed.licensePlate).toBe("PTSCAN1");
    expect(res.body.vehicle).toMatchObject({ brand: "Test" });
    expect(res.body.candidates.covering.map((c: any) => c.id)).toEqual([reservationId]);
    expect(res.body.candidates.covering[0].driverName).toBe("Scan Driver");
    expect(res.body.duplicateOf).toBeNull();
    expect(fs.readdirSync(path.join(uploadsDir, "fines"))).toHaveLength(0); // temp upload removed
  });

  it("flags a letter whose reference already exists", async () => {
    processFineLetterWithAI.mockResolvedValueOnce(normaliseParsedFine({
      licensePlate: "PTSCAN1", offenceAt: "2026-07-01T10:00:00", reference: "CJIB-DUP-1", description: "dubbel", amount: 50, confidence: {},
    }));
    const res = await request(app).post("/api/fines/scan").attach("letterFile", PDF, "brief.pdf");
    expect(res.status).toBe(200);
    expect(res.body.duplicateOf).toMatchObject({ status: "new" });
  });

  it("copes with an unreadable letter", async () => {
    processFineLetterWithAI.mockResolvedValueOnce(normaliseParsedFine({ description: "", confidence: {} }));
    const res = await request(app).post("/api/fines/scan").attach("letterFile", PDF, "brief.pdf");
    expect(res.status).toBe(200);
    expect(res.body.parsed.licensePlate).toBeNull();
    expect(res.body.candidates).toEqual({ covering: [], near: [] });
  });

  it("reports a scanner failure as 502", async () => {
    processFineLetterWithAI.mockRejectedValueOnce(new Error("GEMINI_API_KEY is not configured"));
    const res = await request(app).post("/api/fines/scan").attach("letterFile", PDF, "brief.pdf");
    expect(res.status).toBe(502);
    expect(res.body.message).toContain("GEMINI_API_KEY");
  });
});
