/**
 * A-12-2 (audit 2026-10-09): the customer form sends "" for an empty company
 * name. "" is never a value; POST and PATCH /api/customers store it as NULL
 * (same rule as the debtor number, B-35), so no screen can show a blank name.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq, like } from "drizzle-orm";
import { db } from "../db";
import { customers, deletedRecords } from "../../shared/schema";
import { agentFor, cleanupFixtureUsers, type TestAgent } from "./helpers/app";
import { cleanupFixtures, FIXTURE_PREFIX } from "./helpers/fixtures";

let admin: TestAgent;
const TAG = `t${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;
const fixtureName = (label: string) => `${FIXTURE_PREFIX}CN-${label}-${TAG}`;
const stored = async (id: number) => (await db.select().from(customers).where(eq(customers.id, id)))[0];

beforeAll(async () => { admin = await agentFor("admin"); });
afterAll(async () => {
  await db.delete(deletedRecords).where(like(deletedRecords.label, `${FIXTURE_PREFIX}%`));
  await cleanupFixtures();
  await cleanupFixtureUsers();
});

describe("A-12-2: an empty company name is stored as NULL", () => {
  it("POST turns '' and whitespace into NULL and keeps a real company name trimmed", async () => {
    const empty = await admin.post("/api/customers").send({ name: fixtureName("a"), customerType: "business", companyName: "" });
    expect(empty.status).toBe(201);
    expect((await stored(empty.body.id)).companyName).toBeNull();

    const spaces = await admin.post("/api/customers").send({ name: fixtureName("b"), customerType: "business", companyName: "   " });
    expect(spaces.status).toBe(201);
    expect((await stored(spaces.body.id)).companyName).toBeNull();

    const real = await admin.post("/api/customers").send({ name: fixtureName("c"), customerType: "business", companyName: "  Echt BV " });
    expect(real.status).toBe(201);
    expect((await stored(real.body.id)).companyName).toBe("Echt BV");
  });

  it("PATCH turns '' into NULL, leaves the field alone when it is not sent", async () => {
    const created = await admin.post("/api/customers").send({ name: fixtureName("d"), customerType: "business", companyName: "Eerst BV" });
    expect(created.status).toBe(201);

    const untouched = await admin.patch(`/api/customers/${created.body.id}`).send({ phone: "0612345678" });
    expect(untouched.status).toBe(200);
    expect((await stored(created.body.id)).companyName).toBe("Eerst BV");

    const cleared = await admin.patch(`/api/customers/${created.body.id}`).send({ companyName: "" });
    expect(cleared.status).toBe(200);
    expect((await stored(created.body.id)).companyName).toBeNull();
  });
});
