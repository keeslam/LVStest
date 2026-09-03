import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";
import fs from "fs";
import path from "path";
vi.mock("../utils/email-service", () => ({ sendEmail: vi.fn(async () => true) }));

import { buildPortalTestApp, createTestCustomer, createTestVehicle, createTestDriver, createTestReservation, createTestFine, cleanupPortalTestData, TEST_EMAIL_DOMAIN } from "./portal-helpers";
import { portalStorage } from "../services/portal-storage";
import { finesStorage } from "../services/fines-storage";
import { linkFineManually } from "../services/fine-attribution";
import { hashPassword } from "../auth";
import { getUploadsDir } from "../../shared/paths";

const password = "wachtwoord-1234";
async function login(app: any, email: string) {
  const agent = request.agent(app);
  expect((await agent.post("/api/portal/login").send({ email, password })).status).toBe(200);
  return agent;
}

describe("portal fines", () => {
  const app = buildPortalTestApp();
  let plate: string, a: number, b: number, driverA: number, driverOther: number, linkedId: number, newId: number, letterPath: string;

  beforeAll(async () => {
    await cleanupPortalTestData();
    plate = `PT${Date.now().toString().slice(-6)}`;
    const v = await createTestVehicle(plate);
    a = (await createTestCustomer("PFA")).id; b = (await createTestCustomer("PFB")).id;
    driverA = (await createTestDriver(a, "Chauffeur A")).id; driverOther = (await createTestDriver(a, "Ander")).id;
    const res = await createTestReservation({ customerId: a, vehicleId: v.id, driverId: driverA, status: "picked_up" });
    letterPath = path.join(getUploadsDir(), "fines", "__test__", "brief.pdf");
    fs.mkdirSync(path.dirname(letterPath), { recursive: true }); fs.writeFileSync(letterPath, "%PDF");
    const f1 = await createTestFine({ licensePlate: plate, offenceAt: new Date("2026-09-03T10:00:00Z") });
    await finesStorage.updateFine(f1.id, { letterFilePath: path.relative(process.cwd(), letterPath) });
    linkedId = (await linkFineManually(f1.id, { customerId: a, reservationId: res.id, driverId: driverA }, "t")).id;
    newId = (await createTestFine({ licensePlate: plate, offenceAt: new Date("2026-09-04T10:00:00Z") })).id;
    for (const [cid, email, role, driverId] of [[a, `admin@${TEST_EMAIL_DOMAIN}`, "admin", null], [a, `drv@${TEST_EMAIL_DOMAIN}`, "driver", driverOther], [b, `b@${TEST_EMAIL_DOMAIN}`, "admin", null]] as const) {
      const u = await portalStorage.createPortalUser({ customerId: cid, email, fullName: "U", role, driverId }, "t");
      await portalStorage.updatePortalUser(u.id, { passwordHash: await hashPassword(password) });
    }
  });
  afterAll(async () => { await cleanupPortalTestData(); fs.rmSync(path.dirname(letterPath), { recursive: true, force: true }); });

  it("shows linked fines only, with driver and letter flag", async () => {
    const agent = await login(app, `admin@${TEST_EMAIL_DOMAIN}`);
    const res = await agent.get("/api/portal/fines");
    expect(res.body.map((f: any) => f.id)).toEqual([linkedId]);
    expect(res.body[0]).toMatchObject({ licensePlate: plate, hasLetter: true, driver: { id: driverA } });
    expect(Number(res.body[0].totalAmount)).toBe(110);
    expect((await agent.get(`/api/portal/fines/${newId}`)).status).toBe(404);
    expect((await agent.get(`/api/portal/fines/${linkedId}/letter`)).status).toBe(200);
  });

  it("driver role sees only own fines; other customer sees none", async () => {
    const drv = await login(app, `drv@${TEST_EMAIL_DOMAIN}`);
    expect((await drv.get("/api/portal/fines")).body).toEqual([]);
    const other = await login(app, `b@${TEST_EMAIL_DOMAIN}`);
    expect((await other.get(`/api/portal/fines/${linkedId}/letter`)).status).toBe(404);
  });

  it("respects the canViewFines switch", async () => {
    await portalStorage.updateCustomerSettings(a, { canViewFines: false }, "t");
    const agent = await login(app, `admin@${TEST_EMAIL_DOMAIN}`);
    expect((await agent.get("/api/portal/fines")).body.code).toBe("PORTAL_FEATURE_DISABLED");
    await portalStorage.updateCustomerSettings(a, { canViewFines: true }, "t");
  });
});
