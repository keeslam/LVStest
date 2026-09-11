/**
 * FIX-J — endpoints with no authentication at all
 * (BUG-003, BUG-060, BUG-046, BUG-051, BUG-093; BUG-005 in fix-j-socket.test.ts).
 *
 * Every assertion below succeeded against the pre-fix code with a *fresh cookie
 * jar and zero logins*: anonymous expense creation, anonymous receipt download
 * of an arbitrary file on disk, and an anonymous RDW proxy.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs";
import path from "path";
import { sql, eq } from "drizzle-orm";
import { db } from "../db";
import { expenses } from "../../shared/schema";
import { getUploadsDir } from "../../shared/paths";
import { anonAgent, agentFor, cleanupFixtureUsers, type TestAgent } from "./helpers/app";
import { cleanupFixtures, createFixtureVehicle } from "./helpers/fixtures";

async function expenseCount(): Promise<number> {
  const r = await db.execute(sql`SELECT count(*)::int AS n FROM expenses`);
  return Number((r as any).rows[0].n);
}

describe("FIX-J — no endpoint answers an anonymous request", () => {
  let anon: TestAgent;
  let staff: TestAgent;
  let vehicleId: number;

  beforeAll(async () => {
    anon = await anonAgent();
    staff = await agentFor(["manage_expenses"]);
    vehicleId = (await createFixtureVehicle()).id;
  }, 60_000);

  afterAll(async () => {
    await cleanupFixtures();
    await cleanupFixtureUsers();
  });

  it("BUG-003: the four expenses routes refuse an anonymous caller and write nothing", async () => {
    const before = await expenseCount();

    const created = await anon.post("/api/expenses/with-receipt")
      .field("vehicleId", String(vehicleId))
      .field("category", "AUDIT-Unauth")
      .field("amount", "12.34")
      .field("date", "2026-09-09");
    expect(created.status).toBe(401);

    expect((await anon.post("/api/expenses").send({ vehicleId, category: "x", amount: "1", date: "2026-01-01" })).status).toBe(401);
    expect((await anon.patch("/api/expenses/1").send({ amount: "999.99" })).status).toBe(401);
    expect((await anon.patch("/api/expenses/1/with-receipt").send({ amount: "999.99" })).status).toBe(401);
    expect((await anon.get("/api/expenses/1/receipt")).status).toBe(401);

    expect(await expenseCount()).toBe(before);
  });

  it("BUG-060: receiptFilePath cannot be set from a request body", async () => {
    const res = await staff.post("/api/expenses").send({
      vehicleId,
      category: "FIXT-path",
      amount: "1",
      date: "2026-01-01",
      receiptFilePath: "../../package.json",
    });
    expect(res.status).toBe(201);
    const [row] = await db.select().from(expenses).where(eq(expenses.id, res.body.id));
    expect(row.receiptFilePath).not.toBe("../../package.json");
    expect(row.receiptFilePath ?? "").not.toContain("package.json");

    await db.delete(expenses).where(eq(expenses.id, res.body.id));
  });

  it("BUG-060: a stored receipt path outside the uploads directory is refused", async () => {
    // Only the database can create this state; the API no longer accepts the field.
    const [row] = await db.insert(expenses).values({
      vehicleId,
      category: "FIXT-traversal",
      amount: "1",
      date: "2026-01-01",
      receiptFilePath: path.resolve(process.cwd(), "package.json"),
    } as any).returning();

    const res = await staff.get(`/api/expenses/${row.id}/receipt`);
    expect(res.status).toBe(404);
    expect(res.text ?? "").not.toContain("\"name\":");
    // The file itself is untouched.
    expect(fs.existsSync(path.resolve(process.cwd(), "package.json"))).toBe(true);

    // A path *inside* uploads still resolves, so legacy rows keep working.
    const legit = path.join(getUploadsDir(), "__fixt_receipt__.txt");
    fs.mkdirSync(path.dirname(legit), { recursive: true });
    fs.writeFileSync(legit, "receipt");
    await db.update(expenses).set({ receiptFilePath: legit }).where(eq(expenses.id, row.id));
    const ok = await staff.get(`/api/expenses/${row.id}/receipt`);
    expect(ok.status).toBe(200);

    fs.rmSync(legit, { force: true });
    await db.delete(expenses).where(eq(expenses.id, row.id));
  });

  it("BUG-046: the RDW proxy refuses an anonymous caller", async () => {
    const res = await anon.get("/api/rdw/vehicle/AB-123-C");
    expect(res.status).toBe(401);
  });

  it("BUG-051: /object-storage/* refuses an anonymous caller", async () => {
    const res = await anon.get("/object-storage/anything");
    expect(res.status).toBe(401);
  });
});
