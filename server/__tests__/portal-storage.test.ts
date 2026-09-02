import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { portalStorage } from "../services/portal-storage";
import { createTestCustomer, createTestVehicle, createTestDriver, createTestReservation, createTestDocument, cleanupPortalTestData, TEST_EMAIL_DOMAIN } from "./portal-helpers";

describe("portalStorage", () => {
  let a: number, b: number, vehicleId: number, driverA: number, resA: number, resB: number, docA: number, maintenanceId: number;

  beforeAll(async () => {
    await cleanupPortalTestData();
    a = (await createTestCustomer("A")).id;
    b = (await createTestCustomer("B")).id;
    vehicleId = (await createTestVehicle()).id;
    driverA = (await createTestDriver(a)).id;
    resA = (await createTestReservation({ customerId: a, vehicleId, driverId: driverA })).id;
    resB = (await createTestReservation({ customerId: b, vehicleId })).id;
    maintenanceId = (await createTestReservation({ customerId: a, vehicleId, type: "maintenance_block" })).id;
    docA = (await createTestDocument({ reservationId: resA, vehicleId, documentType: "Contract (Unsigned)" })).id;
    await createTestDocument({ reservationId: resA, vehicleId, documentType: "APK Inspection" });
  });
  afterAll(cleanupPortalTestData);

  it("creates a user, finds it case-insensitively, and creates the settings row", async () => {
    const user = await portalStorage.createPortalUser({ customerId: a, email: `admin@${TEST_EMAIL_DOMAIN}`, fullName: "Admin A", role: "admin" }, "tester");
    const found = await portalStorage.getPortalUserByEmail(`ADMIN@${TEST_EMAIL_DOMAIN}`);
    expect(found?.id).toBe(user.id);
    const settings = await portalStorage.getOrCreateCustomerSettings(a);
    expect(settings.portalEnabled).toBe(true);
    expect(settings.showPrices).toBe(false);
  });

  it("scopes reservations to the customer and hides maintenance blocks", async () => {
    const list = await portalStorage.listReservationsForCustomer(a, {});
    expect(list.map((r) => r.id)).toEqual([resA]);
    expect(await portalStorage.getReservationForCustomer(resB, a, {})).toBeUndefined();
    expect(await portalStorage.getReservationForCustomer(maintenanceId, a, {})).toBeUndefined();
    const own = await portalStorage.getReservationForCustomer(resA, a, {});
    expect(own?.vehicle?.id).toBe(vehicleId);
    expect(own?.driver?.id).toBe(driverA);
  });

  it("scopes by driver for driver-role users", async () => {
    const other = await createTestDriver(a, "Ander");
    expect(await portalStorage.listReservationsForCustomer(a, { driverId: other.id })).toEqual([]);
    expect((await portalStorage.listReservationsForCustomer(a, { driverId: driverA })).length).toBe(1);
  });

  it("lists only contract and damage-check documents of own reservations", async () => {
    const docs = await portalStorage.listDocumentsForCustomer(a, {});
    expect(docs.map((d) => d.id)).toEqual([docA]);
    expect(docs[0].kind).toBe("contract");
    expect(await portalStorage.getDocumentForCustomer(docA, b, {})).toBeUndefined();
  });

  it("writes and lists activity", async () => {
    await portalStorage.logActivity({ customerId: a, action: "login", ip: "127.0.0.1" });
    const rows = await portalStorage.listActivity({ customerId: a, limit: 10 });
    expect(rows[0].action).toBe("login");
  });
});
