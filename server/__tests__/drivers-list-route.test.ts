/**
 * GET /api/drivers — the list the customers page has been asking for since August.
 *
 * Reported from the running application: opening the customers page showed
 * "Antwoord van de server is geen JSON". The page queries `/api/drivers` to
 * count each customer's drivers and to power the "Met chauffeurs" filter, but
 * the server never had that route. The request fell through to the app's
 * index.html with a 200; before the audit the query function swallowed the
 * parse error, so every customer silently showed zero drivers and the filter
 * silently returned nothing. The route now exists, with the same permission as
 * the per-customer driver list.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { drivers } from "@shared/schema";
import { agentFor, cleanupFixtureUsers, type TestAgent } from "./helpers/app";
import { createFixtureCustomer, cleanupFixtures } from "./helpers/fixtures";

describe("GET /api/drivers", () => {
  let staff: TestAgent;
  let outsider: TestAgent;
  let customerId: number;
  let driverId: number;

  beforeAll(async () => {
    staff = await agentFor(["view_customers"]);
    outsider = await agentFor(["view_vehicles"]);
    customerId = (await createFixtureCustomer("Chauffeurlijst")).id;
    const [row] = await db
      .insert(drivers)
      .values({ customerId, displayName: "FIXT-chauffeur Jansen" } as typeof drivers.$inferInsert)
      .returning();
    driverId = row.id;
  });

  afterAll(async () => {
    await db.delete(drivers).where(eq(drivers.id, driverId));
    await cleanupFixtures();
    await cleanupFixtureUsers();
  });

  it("geeft de chauffeurs als JSON-lijst", async () => {
    const res = await staff.get("/api/drivers");

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/application\/json/);
    expect(Array.isArray(res.body)).toBe(true);
    const mine = res.body.find((d: { id: number }) => d.id === driverId);
    expect(mine).toBeDefined();
    expect(mine.customerId).toBe(customerId);
  });

  it("vraagt hetzelfde recht als de chauffeurslijst van één klant", async () => {
    const res = await outsider.get("/api/drivers");
    expect(res.status).toBe(403);
  });
});
