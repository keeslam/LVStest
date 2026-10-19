/**
 * Kees, 2026-10-19: the fines list can tell customers about, or cancel, several fines at once. Each fine
 * follows its own rules; what is skipped comes back with the reason; it needs the manage-fines right.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";

const { sendEmail } = vi.hoisted(() => ({ sendEmail: vi.fn(async () => true) }));
vi.mock("../utils/email-service", () => ({ sendEmail }));

import { registerFineRoutes } from "../routes/fines";
import { buildStaffTestApp, createTestCustomer, createTestFine, cleanupPortalTestData, TEST_EMAIL_DOMAIN } from "./portal-helpers";
import { finesStorage } from "../services/fines-storage";
import { portalStorage } from "../services/portal-storage";
import { storage } from "../storage";
import { UserPermission } from "../../shared/schema";
import { getUploadsDir } from "../../shared/paths";

const deps = { uploadsDir: getUploadsDir(), requireAuth: (_r: any, _s: any, n: any) => n() } as any;

describe("bekeuringen in bulk", () => {
  const manager = buildStaffTestApp([UserPermission.MANAGE_FINES], (app) => registerFineRoutes(app, deps));
  const viewer = buildStaffTestApp([UserPermission.VIEW_FINES], (app) => registerFineRoutes(app, deps));
  let linkedA: number, linkedB: number, unlinked: number, cancelled: number;

  beforeAll(async () => {
    await cleanupPortalTestData();
    const customerId = (await createTestCustomer("Bulk")).id;
    await storage.updateCustomer(customerId, { email: `bulk@${TEST_EMAIL_DOMAIN}` } as any);
    await portalStorage.updateCustomerSettings(customerId, { portalEnabled: true }, "t");
    const make = async (status: string, linked: boolean) => {
      const f = await createTestFine({ licensePlate: "PT-BULK-1", offenceAt: new Date("2026-09-10T10:00:00Z") });
      await finesStorage.updateFine(f.id, linked ? { customerId, status } as any : { status } as any);
      return f.id;
    };
    linkedA = await make("linked", true);
    linkedB = await make("linked", true);
    unlinked = await make("new", false);
    cancelled = await make("cancelled", true);
  });
  afterAll(cleanupPortalTestData);

  it("needs the manage-fines right and a proper body", async () => {
    expect((await request(viewer).post("/api/fines/bulk").send({ action: "cancel", ids: [linkedA] })).status).toBe(403);
    expect((await request(manager).post("/api/fines/bulk").send({ action: "pay", ids: [linkedA] })).status).toBe(400);
    expect((await request(manager).post("/api/fines/bulk").send({ action: "cancel", ids: [] })).status).toBe(400);
  });

  it("informs only the linked ones and says why the others were skipped", async () => {
    const res = await request(manager).post("/api/fines/bulk").send({ action: "notify", ids: [linkedA, unlinked] });
    expect(res.status).toBe(200);
    expect(res.body.skipped).toEqual([{ id: unlinked, reason: "FINE_NOT_LINKED" }]);
    expect(res.body.done.length + res.body.skipped.length).toBe(2);
  });

  it("cancels several at once; an already cancelled one is skipped", async () => {
    const res = await request(manager).post("/api/fines/bulk").send({ action: "cancel", ids: [linkedB, unlinked, cancelled, 999999999] });
    expect(res.status).toBe(200);
    expect(res.body.done.sort()).toEqual([linkedB, unlinked].sort());
    expect(res.body.skipped).toEqual(expect.arrayContaining([{ id: cancelled, reason: "ALREADY_CANCELLED" }, { id: 999999999, reason: "FINE_NOT_FOUND" }]));
    expect((await finesStorage.getFine(linkedB))?.status).toBe("cancelled");
    expect((await finesStorage.getFine(unlinked))?.status).toBe("cancelled");
  });
});
