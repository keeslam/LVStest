import { db } from "../db";
import { fines, customers, drivers, vehicles, type Fine } from "../../shared/schema";
import { and, desc, eq, gte, inArray, lte, sql, type SQL } from "drizzle-orm";
import { CUSTOMER_VISIBLE_FINE_STATUSES } from "../../shared/fines";
import type { PortalScope } from "./portal-storage";

export type FineListRow = Fine & { customerName: string | null; driverName: string | null };
export type InsertFineRow = typeof fines.$inferInsert;

export interface FineFilters { status?: string; customerId?: number; licensePlate?: string; from?: string; to?: string }

async function select(where: SQL | undefined): Promise<FineListRow[]> {
  const rows = await db.select({
    fine: fines,
    customerName: sql<string | null>`coalesce(${customers.companyName}, ${customers.name})`,
    driverName: drivers.displayName,
  })
    .from(fines)
    .leftJoin(customers, eq(fines.customerId, customers.id))
    .leftJoin(drivers, eq(fines.driverId, drivers.id))
    .where(where)
    .orderBy(desc(fines.offenceAt), desc(fines.id));
  return rows.map((r) => ({ ...r.fine, customerName: r.customerName, driverName: r.driverName }));
}

/** All fine reads/writes. Customer-facing methods always take the customerId. */
export const finesStorage = {
  async createFine(data: InsertFineRow): Promise<Fine> {
    const [row] = await db.insert(fines).values(data).returning();
    return row;
  },
  async getFine(id: number): Promise<Fine | undefined> {
    const [row] = await db.select().from(fines).where(eq(fines.id, id));
    return row;
  },
  async getFineRow(id: number): Promise<FineListRow | undefined> {
    const [row] = await select(eq(fines.id, id));
    return row;
  },
  async updateFine(id: number, patch: Partial<Fine>): Promise<Fine | undefined> {
    const [row] = await db.update(fines).set({ ...patch, updatedAt: new Date() }).where(eq(fines.id, id)).returning();
    return row;
  },
  async listFines(f: FineFilters): Promise<FineListRow[]> {
    return select(and(
      f.status ? eq(fines.status, f.status) : undefined,
      f.customerId ? eq(fines.customerId, f.customerId) : undefined,
      f.licensePlate ? eq(fines.licensePlate, f.licensePlate) : undefined,
      f.from ? gte(fines.offenceAt, new Date(f.from)) : undefined,
      f.to ? lte(fines.offenceAt, new Date(`${f.to}T23:59:59`)) : undefined,
    ));
  },
  async listFinesForCustomer(customerId: number, scope: PortalScope): Promise<FineListRow[]> {
    return select(and(
      eq(fines.customerId, customerId),
      inArray(fines.status, CUSTOMER_VISIBLE_FINE_STATUSES),
      scope.driverId ? eq(fines.driverId, scope.driverId) : undefined,
    ));
  },
  async getFineForCustomer(id: number, customerId: number, scope: PortalScope): Promise<FineListRow | undefined> {
    const rows = await select(and(
      eq(fines.id, id), eq(fines.customerId, customerId),
      inArray(fines.status, CUSTOMER_VISIBLE_FINE_STATUSES),
      scope.driverId ? eq(fines.driverId, scope.driverId) : undefined,
    ));
    return rows[0];
  },
  async countFinesForCustomer(customerId: number): Promise<number> {
    const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(fines).where(eq(fines.customerId, customerId));
    return r?.n ?? 0;
  },
  async getVehicleByPlate(licensePlate: string): Promise<{ id: number; brand: string; model: string } | undefined> {
    const [row] = await db.select({ id: vehicles.id, brand: vehicles.brand, model: vehicles.model }).from(vehicles).where(eq(vehicles.licensePlate, licensePlate)).limit(1);
    return row;
  },
  async findByReference(reference: string): Promise<Fine | undefined> {
    const [row] = await db.select().from(fines).where(eq(fines.reference, reference)).limit(1);
    return row;
  },
  async countFinesForPlate(licensePlate: string): Promise<number> {
    const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(fines).where(eq(fines.licensePlate, licensePlate));
    return r?.n ?? 0;
  },
};
