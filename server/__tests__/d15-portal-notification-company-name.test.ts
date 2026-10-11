/**
 * D15 follow-up (df-review Minor 2): the in-app portal notifications (the customer's bell) said
 * "Lam Groep" in running text while the portal mails already follow the company name setting
 * (`company_name`, services/company-name.ts), so a customer saw two names. Every notification text
 * now takes the name from `companyName()`.
 *
 * The behaviour is walked for the reservation, maintenance, APK/service and request-reply texts;
 * the fiscal nightly texts need a whole fiscal fixture, so a source check covers all five files:
 * no hard-coded "Lam Groep" is left in a notification text.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs from "fs";
import path from "path";
import request from "supertest";
import { eq } from "drizzle-orm";
const { sendEmail } = vi.hoisted(() => ({ sendEmail: vi.fn(async () => true) }));
vi.mock("../utils/email-service", () => ({ sendEmail }));
vi.mock("../services/reservation-pdf-regeneration", () => ({ scheduleContractRegeneration: vi.fn() }));

import { onMaintenanceBlockChanged } from "../services/portal-maintenance-events";
import { onReservationChangedByStaff } from "../services/portal-reservation-events";
import { customerNotifications, scanVehicleAlertsForPortal } from "../services/portal-customer-notifications";
import { registerPortalRequestRoutes } from "../routes/portal-requests";
import { requestsStorage } from "../services/portal-requests-storage";
import { portalStorage } from "../services/portal-storage";
import { storage } from "../storage";
import { loadCompanyName, portalCompanyName } from "../services/company-name";
import { db } from "../db";
import { appSettings, reservations, vehicles, UserPermission, type Reservation } from "../../shared/schema";
import { getUploadsDir } from "../../shared/paths";
import { buildStaffTestApp, createTestCustomer, createTestVehicle, createTestReservation, cleanupPortalTestData, TEST_EMAIL_DOMAIN } from "./portal-helpers";

const NAME = "Testgarage FIXT-D15";
const deps = { uploadsDir: getUploadsDir(), requireAuth: (_r: any, _s: any, n: any) => n() } as any;
const manager = buildStaffTestApp([UserPermission.MANAGE_PORTAL], (app) => registerPortalRequestRoutes(app, deps));

let customerId: number, userId: number, rentalId: number, vehicleId: number;

/** Stores (or removes) the company name setting and reloads the cache. */
async function setName(value: string | null) {
  await db.delete(appSettings).where(eq(appSettings.key, "company_name"));
  if (value !== null) await db.insert(appSettings).values({ key: "company_name", value, category: "business", description: "Bedrijfsnaam" } as any);
  await loadCompanyName();
}
const bell = async (type: string) => (await customerNotifications.listForUser(customerId, userId)).filter((n) => n.type === type);
const noOldName = (text: string) => expect(text).not.toContain("Lam Groep");

beforeAll(async () => {
  await cleanupPortalTestData();
  await setName(null);
  customerId = (await createTestCustomer("CN")).id;
  userId = (await portalStorage.createPortalUser({ customerId, email: `cn@${TEST_EMAIL_DOMAIN}`, fullName: "Melder", role: "admin" }, "t")).id;
  vehicleId = (await createTestVehicle()).id;
  rentalId = (await createTestReservation({ customerId, vehicleId, startDate: "2026-09-01", endDate: null, status: "picked_up" })).id;
});
afterAll(async () => {
  await cleanupPortalTestData();
  await setName(null);
});

describe("until a company name is saved, the bell keeps the old name (like the portal mails)", () => {
  it("portalCompanyName() is Lam Groep without a stored name, and follows the setting once saved", async () => {
    await setName(null);
    expect(portalCompanyName()).toBe("Lam Groep");
    await setName("   ");
    expect(portalCompanyName()).toBe("Lam Groep"); // an unusable stored value is not a saved name
    await setName(NAME);
    expect(portalCompanyName()).toBe(NAME);
  });

  it("a staff change of a reservation says Lam Groep while unsaved, the saved name afterwards", async () => {
    await setName(null);
    const rental = await createTestReservation({ customerId, vehicleId: (await createTestVehicle()).id, startDate: "2026-12-01", endDate: "2026-12-05" });
    expect(await onReservationChangedByStaff(rental, { ...rental, startDate: "2026-12-02", endDate: "2026-12-06" } as Reservation)).toBe("reservation_changed");
    const [unsavedNote] = (await bell("reservation_changed")).filter((x) => x.link === `/reserveringen/${rental.id}`);
    expect(unsavedNote.description).toContain("Lam Groep heeft uw reservering aangepast.");

    await setName(NAME);
    const other = await createTestReservation({ customerId, vehicleId: (await createTestVehicle()).id, startDate: "2026-12-10", endDate: "2026-12-12" });
    expect(await onReservationChangedByStaff(other, { ...other, startDate: "2026-12-11", endDate: "2026-12-13" } as Reservation)).toBe("reservation_changed");
    const [savedNote] = (await bell("reservation_changed")).filter((x) => x.link === `/reserveringen/${other.id}`);
    expect(savedNote.description).toContain(`${NAME} heeft uw reservering aangepast.`);
  });
});

describe("portal notifications carry the company name from the setting", () => {
  beforeAll(() => setName(NAME));
  it("maintenance planned, in and cancelled", async () => {
    const block = await storage.createMaintenanceBlock(vehicleId, "2026-10-10", "2026-10-11");
    expect(await onMaintenanceBlockChanged(null, block)).toBe("maintenance_planned");
    expect(await onMaintenanceBlockChanged(block, { ...block, maintenanceStatus: "in" })).toBe("maintenance_in");
    const other = await storage.createMaintenanceBlock(vehicleId, "2026-10-14", "2026-10-15");
    expect(await onMaintenanceBlockChanged(other, null)).toBe("maintenance_cancelled");

    for (const type of ["maintenance_planned", "maintenance_in", "maintenance_cancelled"]) {
      const [n] = await bell(type);
      expect(n, type).toBeTruthy();
      expect(n.description, type).toContain(NAME);
      noOldName(n.description);
    }
  });

  it("a reservation changed or cancelled by staff", async () => {
    const rental = await createTestReservation({ customerId, vehicleId: (await createTestVehicle()).id, startDate: "2026-11-01", endDate: "2026-11-05" });
    const moved = { ...rental, startDate: "2026-11-02", endDate: "2026-11-06" } as Reservation;
    expect(await onReservationChangedByStaff(rental, moved)).toBe("reservation_changed");
    expect(await onReservationChangedByStaff(moved, null)).toBe("reservation_cancelled");

    for (const type of ["reservation_changed", "reservation_cancelled"]) {
      const [n] = (await bell(type)).filter((x) => x.link === `/reserveringen/${rental.id}`);
      expect(n, type).toBeTruthy();
      expect(n.description, type).toContain(NAME);
      noOldName(n.description);
    }
  });

  it("the APK and service alerts for a car on the road", async () => {
    const car = await createTestVehicle();
    await db.update(vehicles).set({ apkDate: "2020-01-01" }).where(eq(vehicles.id, car.id));
    const res = await createTestReservation({ customerId, vehicleId: car.id, startDate: "2026-09-01", endDate: null, status: "picked_up" });
    await scanVehicleAlertsForPortal();
    const [n] = (await bell("apk_expired")).filter((x) => x.link === `/reserveringen/${res.id}`);
    expect(n).toBeTruthy();
    expect(n.description).toContain(NAME);
    noOldName(n.description);
  });

  it("the staff status message of a request without a reply text", async () => {
    const req = await requestsStorage.createRequest({ customerId, portalUserId: userId, type: "other", payload: { subject: "Vraag" }, message: "Hallo" });
    const res = await request(manager).post(`/api/portal-requests/${req.id}/reply`).send({ status: "in_progress" });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const [n] = (await bell("request_in_progress")).filter((x) => x.link === `/aanvragen/${req.id}`);
    expect(n.description).toBe(`${NAME} heeft uw aanvraag #${req.id} in behandeling.`);
  });
});

describe("no notification text hard-codes the old name", () => {
  it.each([
    "server/services/portal-reservation-events.ts",
    "server/services/portal-customer-notifications.ts",
    "server/services/portal-maintenance-events.ts",
    "server/routes/portal-requests.ts",
    "server/services/fiscal/nightly.ts",
  ])("%s", (file) => {
    const source = fs.readFileSync(path.resolve(__dirname, "../..", file), "utf8");
    // Comments may still name the company; running text must not.
    const code = source.split(/\r?\n/).filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line));
    expect(code.filter((line) => line.includes("Lam Groep"))).toEqual([]);
  });
});
