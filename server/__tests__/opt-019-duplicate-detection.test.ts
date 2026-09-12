/**
 * OPT-019 — "Dubbele klant en chauffeur detecteren".
 *
 * The audit proved the gap by posting the same name and e-mail twice and
 * getting two 201s (ids 1302 and 1303). The rule is warn-and-open, never
 * block: two drivers of one company legitimately share a phone number.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq, inArray, like } from "drizzle-orm";
import { db } from "../db";
import { customers, drivers } from "../../shared/schema";
import { agentFor, cleanupFixtureUsers, type TestAgent } from "./helpers/app";
import { createFixtureCustomer, cleanupFixtures, FIXTURE_PREFIX } from "./helpers/fixtures";
import { normalizePhone } from "../services/duplicate-detection";

let admin: TestAgent;
let existingId: number;
let ownerId: number;
const EMAIL = "opt019-bestaande@fixture-test.invalid";
const PHONE = "06-12 34 56 78";
const createdCustomerIds: number[] = [];
const createdDriverIds: number[] = [];

beforeAll(async () => {
  admin = await agentFor("admin");
  const existing = await createFixtureCustomer("Opt019Bestaand");
  existingId = existing.id;
  await db.update(customers).set({ email: EMAIL, phone: PHONE }).where(eq(customers.id, existingId));

  ownerId = (await createFixtureCustomer("Opt019Owner")).id;
  const [driver] = await db.insert(drivers).values({
    customerId: ownerId,
    displayName: `${FIXTURE_PREFIX}Chauffeur Bestaand`,
    email: EMAIL,
    phone: PHONE,
  }).returning();
  createdDriverIds.push(driver.id);
});

afterAll(async () => {
  if (createdDriverIds.length) await db.delete(drivers).where(inArray(drivers.id, createdDriverIds));
  await db.delete(drivers).where(like(drivers.displayName, `${FIXTURE_PREFIX}%`));
  if (createdCustomerIds.length) await db.delete(customers).where(inArray(customers.id, createdCustomerIds));
  await cleanupFixtures();
  await cleanupFixtureUsers();
});

describe("OPT-019 — duplicaten melden, nooit blokkeren", () => {
  it("normalises a phone number the way people actually type one", () => {
    expect(normalizePhone("06-12 34 56 78")).toBe("0612345678");
    expect(normalizePhone("+31612345678")).toBe("0612345678");
    expect(normalizePhone("0031612345678")).toBe("0612345678");
    expect(normalizePhone("")).toBe("");
  });

  it("names an existing customer with the same e-mail, before anything is created", async () => {
    const res = await admin.get(`/api/customers/duplicates?email=${encodeURIComponent(EMAIL.toUpperCase())}`);
    expect(res.status).toBe(200);
    const ids = res.body.duplicates.map((d: any) => d.id);
    expect(ids).toContain(existingId);
    expect(res.body.duplicates.find((d: any) => d.id === existingId).matchedOn).toContain("email");
  });

  it("matches a phone number written differently", async () => {
    const res = await admin.get("/api/customers/duplicates?phone=%2B31612345678");
    expect(res.body.duplicates.map((d: any) => d.id)).toContain(existingId);
  });

  it("says nothing for a term too short to be specific", async () => {
    const short = await admin.get("/api/customers/duplicates?phone=1234");
    expect(short.body.duplicates).toEqual([]);
    const nothing = await admin.get("/api/customers/duplicates");
    expect(nothing.body.duplicates).toEqual([]);
  });

  it("does not report the record being edited as its own duplicate", async () => {
    const res = await admin.get(
      `/api/customers/duplicates?email=${encodeURIComponent(EMAIL)}&excludeId=${existingId}`,
    );
    expect(res.body.duplicates.map((d: any) => d.id)).not.toContain(existingId);
  });

  it("creating a duplicate still succeeds, and the response names the other one", async () => {
    const res = await admin.post("/api/customers").send({
      name: `${FIXTURE_PREFIX}Opt019 Nieuw`,
      email: EMAIL,
      customerType: "business",
    });
    // Never a refusal — that is the whole decision in this proposal.
    expect(res.status).toBe(201);
    createdCustomerIds.push(res.body.id);
    expect(Array.isArray(res.body.duplicates)).toBe(true);
    expect(res.body.duplicates.map((d: any) => d.id)).toContain(existingId);
    // ...and it does not report the row it just made.
    expect(res.body.duplicates.map((d: any) => d.id)).not.toContain(res.body.id);
  });

  it("a customer with a fresh e-mail reports nothing", async () => {
    const res = await admin.post("/api/customers").send({
      name: `${FIXTURE_PREFIX}Opt019 Uniek`,
      email: "opt019-uniek@fixture-test.invalid",
      customerType: "business",
    });
    expect(res.status).toBe(201);
    createdCustomerIds.push(res.body.id);
    expect(res.body.duplicates).toEqual([]);
  });

  it("finds a duplicate driver across customers, because that is the expensive case", async () => {
    const res = await admin.get(`/api/drivers/duplicates?email=${encodeURIComponent(EMAIL)}`);
    expect(res.status).toBe(200);
    expect(res.body.duplicates.map((d: any) => d.id)).toContain(createdDriverIds[0]);
    expect(res.body.duplicates[0].name).toContain("Chauffeur Bestaand");
  });

  it("creating a duplicate driver succeeds and names the other one", async () => {
    const other = await createFixtureCustomer("Opt019Other");
    const res = await admin.post(`/api/customers/${other.id}/drivers`).send({
      displayName: `${FIXTURE_PREFIX}Chauffeur Nieuw`,
      email: EMAIL,
    });
    expect(res.status).toBe(201);
    createdDriverIds.push(res.body.id);
    expect(res.body.duplicates.map((d: any) => d.id)).toContain(createdDriverIds[0]);
  });

  it("the lookup needs at least the customer view permission", async () => {
    const outsider = await agentFor(["view_vehicles"]);
    expect((await outsider.get("/api/customers/duplicates?email=x@y.invalid")).status).toBe(403);
    expect((await outsider.get("/api/drivers/duplicates?email=x@y.invalid")).status).toBe(403);
  });
});
