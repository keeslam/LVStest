/**
 * A customer saved with an empty company name ("" rather than NULL) used to
 * show as a blank line in the portal screens: `coalesce(company_name, name)`
 * only falls back on NULL (audit 2026-10-09, A-15-2 / A-12-2). Every query
 * that names a customer must fall back to the person name on "" as well.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "../db";
import { customers, portalRequests } from "../../shared/schema";
import { eq } from "drizzle-orm";
import { cleanupPortalTestData, createTestCustomer, TEST_PREFIX } from "./portal-helpers";
import { portalStorage } from "../services/portal-storage";
import { requestsStorage } from "../services/portal-requests-storage";

describe("klantnaam valt terug op de persoonsnaam bij een lege bedrijfsnaam", () => {
  let customerId: number;
  let personName: string;

  beforeAll(async () => {
    await cleanupPortalTestData();
    const c = await createTestCustomer("Naamloos");
    customerId = c.id;
    personName = c.name;
    await db.update(customers).set({ companyName: "" }).where(eq(customers.id, customerId));
    await portalStorage.getOrCreateCustomerSettings(customerId);
    await db.insert(portalRequests).values({ customerId, type: "other", message: "Vraag", payload: { subject: "x" } });
  });
  afterAll(cleanupPortalTestData);

  it("shows the person name in the customers overview", async () => {
    const row = (await portalStorage.listCustomersOverview()).find((r) => r.customerId === customerId);
    expect(row?.customerName).toBe(personName);
    expect(personName.startsWith(TEST_PREFIX)).toBe(true);
  });

  it("shows the person name on a request", async () => {
    const rows = await requestsStorage.listRequests({ customerId });
    expect(rows[0]?.customerName).toBe(personName);
  });
});
