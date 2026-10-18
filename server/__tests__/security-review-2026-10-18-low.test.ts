/**
 * Security review 2026-10-18, the findings rated Laag (docs/audit/beveiliging-klantgegevens-2026-10-18.md)
 * and the separate portal session store. The lockout (Laag 9) is in wave11-login-limiter.test.ts.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs";
import path from "path";
import { useTempUploadsDir, removeTempUploadsDir, tinyPdf } from "./helpers/uploads";

// MUST run before anything builds the app: registerRoutes() resolves the uploads directory once.
const TEMP_UPLOADS = useTempUploadsDir("lvs-sec1018low-");

const { db, pool } = await import("../db");
const { users } = await import("../../shared/schema");
const { eq } = await import("drizzle-orm");
const { agentFor, anonAgent, cleanupFixtureUsers } = await import("./helpers/app");

type Agent = Awaited<ReturnType<typeof agentFor>>;
let admin: Agent;

beforeAll(async () => {
  admin = await agentFor("admin");
}, 60_000);

afterAll(async () => {
  await cleanupFixtureUsers();
  removeTempUploadsDir(TEMP_UPLOADS);
});

describe("Laag 7 — the report builder respects the customer right", () => {
  const report = (source: string, field: string) => ({ name: "t", dataSources: [source], columns: [{ table: source, field }], filters: [] });

  it("refuses customers and drivers without the customer right, allows vehicles", async () => {
    const reporter = await agentFor(["view_reports"]);
    for (const [source, field] of [["customers", "email"], ["drivers", "displayName"]]) {
      const res = await reporter.post("/api/reports/execute").send(report(source, field));
      expect(res.status).toBe(403);
      expect(res.body.code).toBe("CUSTOMER_RIGHT_REQUIRED");
    }
    expect((await reporter.post("/api/reports/execute").send(report("vehicles", "licensePlate"))).status).toBe(200);
  });

  it("allows them with the customer right", async () => {
    const reporter = await agentFor(["view_reports", "view_customers"]);
    expect((await reporter.post("/api/reports/execute").send(report("customers", "name"))).status).toBe(200);
  });
});

describe("Laag 8 — backups are an administrator's business", () => {
  it("manage_backups alone no longer opens the backup routes", async () => {
    const backups = await agentFor(["manage_backups"]);
    expect((await backups.get("/api/backup-settings")).status).toBe(403);
    expect((await backups.get("/api/backups/list")).status).toBe(403);
    expect((await admin.get("/api/backup-settings")).status).toBe(200);
  });

  it("refuses a backup folder inside the application, except its backups folder", async () => {
    const { backupLocalPathProblem } = await import("../utils/backup-path-guard");
    const root = path.resolve("/srv/app");
    expect(backupLocalPathProblem(undefined, root)).toBeNull();
    expect(backupLocalPathProblem(path.join(root, "backups"), root)).toBeNull();
    expect(backupLocalPathProblem(path.join(root, "backups", "nightly"), root)).toBeNull();
    expect(backupLocalPathProblem(path.resolve("/data/backups"), root)).toBeNull();
    expect(backupLocalPathProblem(path.join(root, "dist", "public"), root)).not.toBeNull();
    expect(backupLocalPathProblem(path.join(root, "uploads"), root)).not.toBeNull();
    expect(backupLocalPathProblem("backups", root)).not.toBeNull();
    expect(backupLocalPathProblem(path.resolve("/data") + path.sep + ".." + path.sep + "x", root)).not.toBeNull();
  });

  it("the route refuses such a folder when it is saved", async () => {
    const res = await admin.post("/api/backup-settings").send({ localPath: path.join(process.cwd(), "dist", "public") });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("BACKUP_PATH_NOT_ALLOWED");
  });
});

describe("Laag 10 — what people typed stays out of the request log", () => {
  it("masks free text in the query, keeps numbers, dates and plain filter words", async () => {
    const { redactQueryForLog } = await import("../utils/log-redaction");
    expect(redactQueryForLog("/api/customers?search=Jan%20de%20Vries&page=2")).toBe("/api/customers?search=***&page=2");
    expect(redactQueryForLog("/api/drivers?email=jan%40example.com")).toBe("/api/drivers?email=***");
    expect(redactQueryForLog("/api/reservations?status=booked&from=2026-10-01&all=true")).toBe("/api/reservations?status=booked&from=2026-10-01&all=true");
    expect(redactQueryForLog("/api/vehicles?q=abc")).toBe("/api/vehicles?q=***");
    expect(redactQueryForLog("/api/vehicles")).toBe("/api/vehicles");
  });
});

describe("Laag 11 — /uploads never shows a stored page", () => {
  it("an HTML file is a sandboxed download, a PDF still opens", async () => {
    const dir = path.join(TEMP_UPLOADS, "sec1018-static");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "oud.html"), "<html><script>alert(1)</script></html>");
    fs.writeFileSync(path.join(dir, "scan.pdf"), tinyPdf("FIXT-sec1018-static"));
    const html = await admin.get("/uploads/sec1018-static/oud.html");
    expect(html.status).toBe(200);
    expect(html.headers["content-disposition"]).toMatch(/^attachment/);
    expect(html.headers["content-security-policy"]).toContain("sandbox");
    expect(html.headers["x-content-type-options"]).toBe("nosniff");
    const pdf = await admin.get("/uploads/sec1018-static/scan.pdf");
    expect(pdf.status).toBe(200);
    expect(pdf.headers["content-disposition"]).toBeUndefined();
  });
});

describe("Laag 12 — small things", () => {
  it("the mileage override hash never leaves the server", async () => {
    await db.update(users).set({ mileageOverridePasswordHash: "hash-should-stay-home" }).where(eq(users.id, admin.userId));
    expect(JSON.stringify((await admin.get("/api/users")).body)).not.toContain("hash-should-stay-home");
    expect(JSON.stringify((await admin.get("/api/user")).body)).not.toContain("hash-should-stay-home");
  });

  it("the object-storage route is gone", async () => {
    expect((await admin.get("/object-storage/anything.png")).status).not.toBe(200);
    expect((await (await anonAgent()).get("/object-storage/anything.png")).status).not.toBe(200);
  });

  it("setupAuth mounts once, however often it is called", async () => {
    const express = (await import("express")).default;
    const { setupAuth } = await import("../auth");
    const app = express();
    const first = setupAuth(app);
    const layers = (app as any)._router.stack.length;
    expect(setupAuth(app)).toBe(first);
    expect((app as any)._router.stack.length).toBe(layers);
  });
});

describe("Portal sessions live apart from staff sessions", () => {
  it("a portal login writes to portal_session with its own secret, never to the staff table", async () => {
    const { buildPortalTestApp, createTestCustomer, cleanupPortalTestData, TEST_EMAIL_DOMAIN } = await import("./portal-helpers");
    const { portalStorage } = await import("../services/portal-storage");
    const { hashPassword, resolveSessionSecret } = await import("../auth");
    const { portalSessionSecret, PORTAL_SESSION_TABLE } = await import("../portal-auth");
    const request = (await import("supertest")).default;
    try {
      const customerId = (await createTestCustomer("SessSplit")).id;
      const email = `sess-split-${Date.now().toString(36)}@${TEST_EMAIL_DOMAIN}`;
      const account = await portalStorage.createPortalUser({ customerId, email, fullName: "Sessie", role: "admin" }, "t");
      await portalStorage.updatePortalUser(account.id, { passwordHash: await hashPassword("wachtwoord-1234") });
      const res = await request(buildPortalTestApp()).post("/api/portal/login").send({ email, password: "wachtwoord-1234" });
      expect(res.status).toBe(200);
      const own = await pool.query(`select count(*)::int as n from ${PORTAL_SESSION_TABLE} where sess -> 'passport' -> 'user' ->> 'id' = $1`, [String(account.id)]);
      expect(own.rows[0].n).toBeGreaterThan(0);
      const shared = await pool.query(`select count(*)::int as n from session where sess -> 'passport' -> 'user' ->> 'kind' = 'portal' and sess -> 'passport' -> 'user' ->> 'id' = $1`, [String(account.id)]);
      expect(shared.rows[0].n).toBe(0);
      expect(portalSessionSecret()).not.toBe(resolveSessionSecret());
    } finally {
      await cleanupPortalTestData();
    }
  });
});
