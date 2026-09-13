/**
 * WAVE 15 item 2 — besluit **B-20**: "Bonnetjesveld met een lokaal pad.
 * Besluit: weigeren. Alleen een echte link of een geüpload bestand; een lokaal
 * of netwerkpad werkt voor collega's toch niet."
 *
 * The decision was taken and never built: `C:\scans\bon.pdf` was stored as
 * happily as `https://…`, and the next colleague clicking it got nothing,
 * because that drive is on the desk of whoever typed it.
 *
 * What must stay true after the refusal:
 *   - an http(s) link, a `mailto:`/`tel:` link and an in-app path remain valid;
 *   - the refusal is in Dutch and says what to do instead;
 *   - it lives on the **write path**, so the API refuses it as well — a form is
 *     not a security boundary and `curl` is not a colleague;
 *   - rows that already carry such a path are left exactly as they are.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";

import { insertExpenseSchema } from "../../shared/schema";
import { isLocalOrNetworkPath, LOCAL_PATH_MESSAGE } from "../../shared/safe-url";
import { db } from "../db";
import { expenses } from "../../shared/schema";
import { eq } from "drizzle-orm";
import { agentFor, cleanupFixtureUsers, type TestAgent } from "./helpers/app";
import { createFixtureVehicle, cleanupFixtures } from "./helpers/fixtures";

const LOCAL_PATHS = [
  "C:\\scans\\bon.pdf",
  "c:/scans/bon.pdf",
  "\\\\server\\share\\bon.pdf",
  "//server/share/bon.pdf",
  "file:///C:/scans/bon.pdf",
];

const REAL_LINKS = [
  "https://bonnen.example.test/2026/bon.pdf",
  "http://bonnen.example.test/bon.pdf",
  "mailto:administratie@example.test",
  "tel:+31201234567",
  "/uploads/FIXT-1/receipts/bon.pdf",
  "uploads/FIXT-1/receipts/bon.pdf",
];

describe("B-20 — het bonnetjesveld weigert een lokaal of netwerkpad", () => {
  it("herkent een lokaal pad en een netwerkpad, en laat een echte link met rust", () => {
    for (const value of LOCAL_PATHS) expect(isLocalOrNetworkPath(value), value).toBe(true);
    for (const value of REAL_LINKS) expect(isLocalOrNetworkPath(value), value).toBe(false);
    expect(isLocalOrNetworkPath("")).toBe(false);
    expect(isLocalOrNetworkPath(null)).toBe(false);
  });

  it("het opslagschema weigert het met een Nederlandse uitleg", () => {
    for (const receiptUrl of LOCAL_PATHS) {
      const parsed = insertExpenseSchema.safeParse({
        vehicleId: 1, category: "Fuel", amount: "10", date: "2026-10-01", receiptUrl,
      });
      expect(parsed.success, receiptUrl).toBe(false);
      const message = parsed.success ? "" : parsed.error.errors.map((e) => e.message).join(" ");
      expect(message, receiptUrl).toBe(LOCAL_PATH_MESSAGE);
      // Dutch, and it says what to do instead (B-18).
      expect(message).toMatch(/werkt niet/);
      expect(message).toMatch(/upload/i);
    }
  });

  it("een echte link, een mailto/tel-link en een pad binnen de app blijven geldig", () => {
    for (const receiptUrl of REAL_LINKS) {
      const parsed = insertExpenseSchema.safeParse({
        vehicleId: 1, category: "Fuel", amount: "10", date: "2026-10-01", receiptUrl,
      });
      expect(parsed.success, `${receiptUrl}: ${parsed.success ? "" : JSON.stringify(parsed.error.errors)}`).toBe(true);
    }
    // An empty field is not a path.
    expect(insertExpenseSchema.safeParse({
      vehicleId: 1, category: "Fuel", amount: "10", date: "2026-10-01", receiptUrl: "",
    }).success).toBe(true);
  });

  it("javascript: wordt nog steeds geweigerd, met zijn eigen melding (FIX-R / BUG-072)", () => {
    const parsed = insertExpenseSchema.safeParse({
      vehicleId: 1, category: "Fuel", amount: "10", date: "2026-10-01", receiptUrl: "javascript:alert(1)",
    });
    expect(parsed.success).toBe(false);
    const message = parsed.success ? "" : parsed.error.errors.map((e) => e.message).join(" ");
    expect(message).not.toBe(LOCAL_PATH_MESSAGE);
  });
});

describe("B-20 — de API weigert het ook, niet alleen het formulier", () => {
  let admin: TestAgent;
  let vehicleId: number;

  beforeAll(async () => {
    admin = await agentFor("admin");
    vehicleId = (await createFixtureVehicle()).id;
  }, 60_000);

  afterAll(async () => {
    await cleanupFixtures();
    await cleanupFixtureUsers();
  });

  it("POST /api/expenses met C:\\scans\\bon.pdf geeft 400 en slaat niets op", async () => {
    const res = await admin.post("/api/expenses").send({
      vehicleId, category: "Fuel", amount: "12.50", date: "2026-10-01",
      description: "B20 lokaal pad", receiptUrl: "C:\\scans\\bon.pdf",
    });
    expect(res.status, JSON.stringify(res.body)).toBe(400);
    expect(JSON.stringify(res.body)).toContain("werkt niet");

    const rows = await db.select().from(expenses).where(eq(expenses.vehicleId, vehicleId));
    expect(rows).toHaveLength(0);
  }, 30_000);

  it("POST /api/expenses met \\\\server\\share\\bon.pdf geeft 400", async () => {
    const res = await admin.post("/api/expenses").send({
      vehicleId, category: "Fuel", amount: "12.50", date: "2026-10-01",
      description: "B20 netwerkpad", receiptUrl: "\\\\server\\share\\bon.pdf",
    });
    expect(res.status, JSON.stringify(res.body)).toBe(400);
  }, 30_000);

  it("POST /api/expenses met een echte link wordt gewoon opgeslagen", async () => {
    const res = await admin.post("/api/expenses").send({
      vehicleId, category: "Fuel", amount: "12.50", date: "2026-10-01",
      description: "B20 echte link", receiptUrl: "https://bonnen.example.test/bon.pdf",
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.receiptUrl).toBe("https://bonnen.example.test/bon.pdf");
  }, 30_000);

  it("een bestaande rij met een lokaal pad blijft staan; alleen nieuw schrijven wordt geweigerd", async () => {
    // Written straight to the table, the way the rows that are already there
    // got in. B-20 changes what may be *stored from now on*, not history.
    const [row] = await db.insert(expenses).values({
      vehicleId, category: "Fuel", amount: "9.99", date: "2026-10-02",
      description: "B20 bestaande rij", receiptUrl: "C:\\oud\\bon.pdf",
    }).returning();
    const [readBack] = await db.select().from(expenses).where(eq(expenses.id, row.id));
    expect(readBack.receiptUrl).toBe("C:\\oud\\bon.pdf");

    const res = await admin.get(`/api/expenses/${row.id}`);
    expect(res.status).toBe(200);
    expect(res.body.receiptUrl).toBe("C:\\oud\\bon.pdf");
  }, 30_000);
});
