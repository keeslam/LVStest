/**
 * A-12-2 (audit 2026-10-09, module 12): a customer saved with "" as company name
 * showed as a blank line in the fines list because `coalesce(company_name, name)`
 * only falls back on NULL. Every query that names a customer now uses ONE helper
 * (server/services/customer-display-name.ts). Complements
 * portal-customer-name-fallback.test.ts (customers overview and requests).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "../db";
import { customers, fines } from "../../shared/schema";
import { cleanupPortalTestData, createTestCustomer, createTestVehicle, createTestReservation } from "./portal-helpers";
import { customerDisplayName, customerDisplayNameFor } from "../services/customer-display-name";
import { finesStorage } from "../services/fines-storage";
import { findCandidates } from "../services/fine-attribution";

describe("customerDisplayName helper", () => {
  const ids: Record<string, number> = {};
  const names: Record<string, string> = {};
  let plate: string;
  let fineId: number;

  beforeAll(async () => {
    await cleanupPortalTestData();
    const vehicle = await createTestVehicle(`PT${Date.now().toString().slice(-6)}`);
    plate = vehicle.licensePlate;
    for (const [key, company] of [["empty", ""], ["blank", "   "], ["null", null], ["real", "Echte Bedrijfsnaam BV"]] as const) {
      const c = await createTestCustomer(`DN-${key}`);
      await db.update(customers).set({ companyName: company }).where(eq(customers.id, c.id));
      ids[key] = c.id;
      names[key] = c.name;
    }
    await createTestReservation({ customerId: ids.empty, vehicleId: vehicle.id, startDate: "2026-09-01", endDate: "2026-09-10", status: "picked_up" });
    const [f] = await db.insert(fines).values({
      licensePlate: plate, offenceAt: new Date("2026-09-03T10:00:00Z"), description: "x", amount: "10.00", adminFee: "0.00", totalAmount: "10.00",
      status: "linked", customerId: ids.empty,
    } as any).returning();
    fineId = f.id;
  });
  afterAll(cleanupPortalTestData);

  it("falls back on the person name for '', whitespace and NULL, and keeps a real company name", async () => {
    const rows = await db.select({ id: customers.id, display: customerDisplayName() }).from(customers).where(sql`${customers.id} in (${sql.join(Object.values(ids).map((i) => sql`${i}`), sql`, `)})`);
    const byId = new Map(rows.map((r) => [r.id, r.display]));
    expect(byId.get(ids.empty)).toBe(names.empty);
    expect(byId.get(ids.blank)).toBe(names.blank);
    expect(byId.get(ids.null)).toBe(names.null);
    expect(byId.get(ids.real)).toBe("Echte Bedrijfsnaam BV");
  });

  it("the aliased variant for raw SQL gives the same answer", async () => {
    const r = await db.execute(sql`SELECT ${customerDisplayNameFor("c")} AS n FROM customers c WHERE c.id = ${ids.empty}`);
    expect((r.rows[0] as any).n).toBe(names.empty);
  });

  it("the fines list names the customer by the person name when the company name is ''", async () => {
    const row = await finesStorage.getFineRow(fineId);
    expect(row?.customerName).toBe(names.empty);
  });

  it("fine attribution names the customer by the person name when the company name is ''", async () => {
    const result = await findCandidates(plate, new Date("2026-09-03T10:00:00Z"));
    expect(result.covering.map((c) => c.customerName)).toEqual([names.empty]);
  });
});
