/**
 * B-64 (Kees, 2026-10-22): a fine is linked again when its plate or moment is corrected.
 * - A fine without a customer is linked again on save.
 * - A linked one is left alone; the detail warns when its reservation no longer had the car, and
 *   "Opnieuw koppelen" redoes the link on request.
 * - The list's bulk action links the ticked fines without a customer.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";

const { sendEmail } = vi.hoisted(() => ({ sendEmail: vi.fn(async () => true) }));
vi.mock("../utils/email-service", () => ({ sendEmail }));

import { registerFineRoutes } from "../routes/fines";
import { buildStaffTestApp, createTestCustomer, createTestVehicle, createTestReservation, createTestFine, cleanupPortalTestData } from "./portal-helpers";
import { finesStorage } from "../services/fines-storage";
import { UserPermission } from "../../shared/schema";
import { getUploadsDir } from "../../shared/paths";

const deps = { uploadsDir: getUploadsDir(), requireAuth: (_r: any, _s: any, n: any) => n() } as any;

describe("bekeuring opnieuw koppelen (B-64)", () => {
  const app = buildStaffTestApp([UserPermission.MANAGE_FINES], (a) => registerFineRoutes(a, deps));
  let customerA: number, customerB: number, resA: number, resB: number;
  const plateA = "PT-RA-1", plateB = "PT-RB-2";

  beforeAll(async () => {
    await cleanupPortalTestData();
    customerA = (await createTestCustomer("Herkoppel A")).id;
    customerB = (await createTestCustomer("Herkoppel B")).id;
    const carA = (await createTestVehicle(plateA)).id;
    const carB = (await createTestVehicle(plateB)).id;
    resA = (await createTestReservation({ customerId: customerA, vehicleId: carA, startDate: "2026-09-01", endDate: "2026-09-10", status: "returned" })).id;
    resB = (await createTestReservation({ customerId: customerB, vehicleId: carB, startDate: "2026-09-01", endDate: "2026-09-10", status: "returned" })).id;
  });
  afterAll(cleanupPortalTestData);

  it("links a fine without a customer again when its plate is corrected", async () => {
    const fine = await createTestFine({ licensePlate: "PTXX99", offenceAt: new Date("2026-09-05T10:00:00Z") });
    const res = await request(app).patch(`/api/fines/${fine.id}`).send({ licensePlate: plateA });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: "linked", reservationId: resA, customerId: customerA, linkedBy: "system" });
  });

  it("leaves a linked fine alone, warns, and links it again on request", async () => {
    const fine = await createTestFine({ licensePlate: plateA, offenceAt: new Date("2026-09-05T10:00:00Z") });
    await finesStorage.updateFine(fine.id, { customerId: customerA, reservationId: resA, status: "linked" });
    expect((await request(app).get(`/api/fines/${fine.id}`)).body.linkMismatch).toBe(false);

    const patched = await request(app).patch(`/api/fines/${fine.id}`).send({ licensePlate: plateB });
    expect(patched.body).toMatchObject({ status: "linked", reservationId: resA });
    expect((await request(app).get(`/api/fines/${fine.id}`)).body.linkMismatch).toBe(true);

    const again = await request(app).post(`/api/fines/${fine.id}/reattribute`);
    expect(again.status).toBe(200);
    expect(again.body).toMatchObject({ linked: true, fine: { reservationId: resB, customerId: customerB } });
    expect((await request(app).get(`/api/fines/${fine.id}`)).body.linkMismatch).toBe(false);
  });

  it("bulk: links the new ones it can, skips the rest with a reason", async () => {
    const match = await createTestFine({ licensePlate: plateB, offenceAt: new Date("2026-09-06T10:00:00Z") });
    const none = await createTestFine({ licensePlate: plateB, offenceAt: new Date("2026-12-01T10:00:00Z") });
    const linked = await createTestFine({ licensePlate: plateA, offenceAt: new Date("2026-09-06T10:00:00Z") });
    await finesStorage.updateFine(linked.id, { customerId: customerA, reservationId: resA, status: "linked" });
    const res = await request(app).post("/api/fines/bulk").send({ action: "attribute", ids: [match.id, none.id, linked.id] });
    expect(res.status).toBe(200);
    expect(res.body.done).toEqual([match.id]);
    expect(res.body.skipped).toEqual(expect.arrayContaining([{ id: none.id, reason: "NO_MATCH" }, { id: linked.id, reason: "NOT_NEW" }]));
    expect((await finesStorage.getFine(match.id))?.reservationId).toBe(resB);
  });
});
