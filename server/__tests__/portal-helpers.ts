import { db } from "../db";
import {
  customers, vehicles, drivers, reservations, documents,
  portalUsers, portalCustomerSettings, portalActivityLog, reservationDriverAssignments,
  type Customer, type Vehicle, type Driver, type Reservation, type Document,
} from "../../shared/schema";
import { like, inArray } from "drizzle-orm";
import express, { type Express } from "express";
import { setupPortalAuth } from "../portal-auth";

export const TEST_PREFIX = "__portal_test__";
export const TEST_EMAIL_DOMAIN = "portal-test.invalid";

export async function createTestCustomer(name = "Klant"): Promise<Customer> {
  const [row] = await db.insert(customers).values({
    name: `${TEST_PREFIX}${name}`,
    companyName: `${TEST_PREFIX}${name} BV`,
    email: `${name.toLowerCase()}@${TEST_EMAIL_DOMAIN}`,
    customerType: "business",
    preferredLanguage: "nl",
  }).returning();
  return row;
}

let plateCounter = 0;
export async function createTestVehicle(plate?: string): Promise<Vehicle> {
  plateCounter += 1;
  const [row] = await db.insert(vehicles).values({
    licensePlate: plate ?? `PT-${Date.now().toString().slice(-6)}-${plateCounter}`,
    brand: "Test",
    model: "Model",
  }).returning();
  return row;
}

export async function createTestDriver(customerId: number, displayName = "Bestuurder"): Promise<Driver> {
  const [row] = await db.insert(drivers).values({ customerId, displayName, status: "active" }).returning();
  return row;
}

export async function createTestReservation(input: {
  customerId: number; vehicleId: number; driverId?: number | null;
  startDate?: string; endDate?: string | null; status?: string; type?: string;
}): Promise<Reservation> {
  const [row] = await db.insert(reservations).values({
    customerId: input.customerId,
    vehicleId: input.vehicleId,
    driverId: input.driverId ?? null,
    startDate: input.startDate ?? "2026-09-01",
    endDate: input.endDate === undefined ? "2026-09-10" : input.endDate,
    status: input.status ?? "booked",
    type: input.type ?? "standard",
  }).returning();
  return row;
}

export async function createTestDocument(input: { reservationId: number; vehicleId: number; documentType: string; fileName?: string }): Promise<Document> {
  const [row] = await db.insert(documents).values({
    reservationId: input.reservationId,
    vehicleId: input.vehicleId,
    documentType: input.documentType,
    fileName: input.fileName ?? "test.pdf",
    filePath: "uploads/__portal_test__/test.pdf",
    fileSize: 3,
    contentType: "application/pdf",
  }).returning();
  return row;
}

/** Deletes everything the helpers above created. */
export async function cleanupPortalTestData(): Promise<void> {
  const testCustomers = await db.select({ id: customers.id }).from(customers).where(like(customers.name, `${TEST_PREFIX}%`));
  const ids = testCustomers.map((c) => c.id);
  if (ids.length) {
    await db.delete(portalActivityLog).where(inArray(portalActivityLog.customerId, ids));
    await db.delete(portalUsers).where(inArray(portalUsers.customerId, ids));
    await db.delete(portalCustomerSettings).where(inArray(portalCustomerSettings.customerId, ids));
    const res = await db.select({ id: reservations.id }).from(reservations).where(inArray(reservations.customerId, ids));
    const resIds = res.map((r) => r.id);
    if (resIds.length) {
      await db.delete(reservationDriverAssignments).where(inArray(reservationDriverAssignments.reservationId, resIds));
      await db.delete(documents).where(inArray(documents.reservationId, resIds));
      await db.delete(reservations).where(inArray(reservations.id, resIds));
    }
    await db.delete(drivers).where(inArray(drivers.customerId, ids));
    await db.delete(customers).where(inArray(customers.id, ids));
  }
  await db.delete(vehicles).where(like(vehicles.licensePlate, "PT-%"));
}

/** Express app with only the portal realm mounted; no staff auth, no vite. */
export function buildPortalTestApp(): Express {
  const app = express();
  app.set("trust proxy", 1);
  app.use(express.json());
  const { requirePortalUser } = setupPortalAuth(app);
  // Task 7 adds: registerPortalRoutes(app, { requirePortalUser, uploadsDir })
  void requirePortalUser;
  return app;
}
