/**
 * Secrets and error leakage — BUG-075, BUG-148, BUG-079 (leak half).
 *
 * These three are the same failure in three places: something the server knows
 * and the caller must not — the connection string, a constraint name, a
 * response body — ends up outside the process.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import os from "os";
import nodePath from "path";
import nodeFs from "fs";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { vehicles } from "../../shared/schema";
import { describeDbError, dbErrorBody } from "../utils/db-errors";
import { runPgDump } from "../routes/backups";
import { agentFor, cleanupFixtureUsers, type TestAgent } from "./helpers/app";
import { cleanupFixtures, createFixtureVehicle, FIXTURE_PLATE_PREFIX } from "./helpers/fixtures";

describe("BUG-075 — the backup export never returns the connection string", () => {
  it("a pg_dump failure carries no postgres:// URL, no password and no command line", async () => {
    const url = "postgresql://backup_user:SUPER-SECRET-PW@db.internal:5432/car_rental";
    const dumpPath = nodePath.join(os.tmpdir(), `fixt-pgdump-${Date.now()}.sql`);
    let message = "";
    try {
      // A binary that does not exist forces the failure path without needing a
      // database; the assertion is about what the error is allowed to contain.
      const originalPath = process.env.PATH;
      process.env.PATH = "";
      try {
        await runPgDump(url, dumpPath);
      } finally {
        process.env.PATH = originalPath;
      }
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toBeTruthy();
    expect(message).not.toContain("SUPER-SECRET-PW");
    expect(message).not.toContain("postgresql://");
    expect(message).not.toContain("backup_user");
    // And no half-written dump is left behind for someone to download.
    expect(nodeFs.existsSync(dumpPath)).toBe(false);
  }, 30_000);
});

describe("BUG-148 — a database error never carries database text", () => {
  const pgUnique = { code: "23505", constraint: "vehicles_barcode_unique", detail: "Key (barcode)=(VEH-1) already exists.", schema: "public", table: "vehicles", message: 'duplicate key value violates unique constraint "vehicles_barcode_unique"' };
  const pgFk = { code: "23503", constraint: "interactive_damage_checks_reservation_id_fk", detail: "Key (id)=(3407) is still referenced from table interactive_damage_checks.", table: "reservations" };

  it("maps a unique violation to 409 and names our field, not the constraint", () => {
    const described = describeDbError(pgUnique);
    expect(described.status).toBe(409);
    expect(described.field).toBe("barcode");
    const body = JSON.stringify(dbErrorBody(described));
    expect(body).not.toContain("vehicles_barcode_unique");
    expect(body).not.toContain("duplicate key");
    expect(body).not.toContain("public");
  });

  it("maps a foreign-key violation to 409 without the detail row id", () => {
    const described = describeDbError(pgFk);
    expect(described.status).toBe(409);
    const body = JSON.stringify(dbErrorBody(described));
    expect(body).not.toContain("3407");
    expect(body).not.toContain("interactive_damage_checks");
  });

  it("an unrecognised error stays a generic 500", () => {
    const described = describeDbError(new Error("something exploded"), "Failed to do the thing");
    expect(described.status).toBe(500);
    expect(described.recognised).toBe(false);
    expect(JSON.stringify(dbErrorBody(described))).not.toContain("something exploded");
  });

  it("never produces an error or details key", () => {
    for (const e of [pgUnique, pgFk, new Error("x")]) {
      const body = dbErrorBody(describeDbError(e));
      expect(body).not.toHaveProperty("error");
      expect(body).not.toHaveProperty("details");
    }
  });

  describe("over HTTP", () => {
    let admin: TestAgent;
    let plate: string;

    beforeAll(async () => {
      admin = await agentFor("admin");
      const existing = await createFixtureVehicle({ barcode: `FIXT-BC-${Date.now().toString(36)}` } as any);
      plate = existing.licensePlate;
    }, 60_000);

    afterAll(async () => {
      await cleanupFixtures();
      await cleanupFixtureUsers();
    });

    it("a duplicate license plate is a 409 naming licensePlate, with no constraint text", async () => {
      const res = await admin.post("/api/vehicles").send({ licensePlate: plate, brand: "FIXT-Brand", model: "Model" });
      expect(res.status).toBe(409);
      expect(res.body.field).toBe("licensePlate");
      const body = JSON.stringify(res.body);
      expect(body).not.toContain("unique constraint");
      expect(body).not.toContain("_unique");
      expect(body).not.toContain("Key (");
    });

    it("a duplicate barcode is not reported as a duplicate license plate", async () => {
      const [source] = await db.select().from(vehicles).where(eq(vehicles.licensePlate, plate));
      if (!source.barcode) return; // nothing to collide with
      const res = await admin.post("/api/vehicles").send({
        licensePlate: `${FIXTURE_PLATE_PREFIX}-X${Date.now().toString(36)}`.slice(0, 20),
        brand: "FIXT-Brand",
        model: "Model",
        barcode: source.barcode,
      });
      expect(res.status).toBe(409);
      expect(res.body.field).not.toBe("licensePlate");
      expect(JSON.stringify(res.body)).not.toContain("_unique");
    });
  });
});

describe("BUG-079 — response bodies are not written to the container log", () => {
  it("the request logger does not capture res.json by default", async () => {
    // server/index.ts monkey-patched res.json unconditionally and logged the
    // body; it now only does so behind LOG_RESPONSE_BODIES=true.
    const fs = await import("fs");
    const source = fs.readFileSync("server/index.ts", "utf8");
    expect(source).toContain("LOG_RESPONSE_BODIES");
    // The capture is inside the flag.
    const capture = source.indexOf("capturedJsonResponse = bodyJson");
    const flag = source.indexOf("if (LOG_RESPONSE_BODIES) {");
    expect(flag).toBeGreaterThan(-1);
    expect(capture).toBeGreaterThan(flag);
    // And even then the known secret keys are redacted before stringify.
    expect(source).toContain("JSON.stringify(redactForLog(capturedJsonResponse))");
  });

  it("the redactor removes every known secret key", async () => {
    const { redactForLog } = await import("../utils/log-redaction");
    const redacted = redactForLog({
      smtpHost: "smtp.test",
      smtpPassword: "super-secret",
      nested: { token: "abc", password: "def", keep: "visible" },
      list: [{ cjibPassword: "x" }],
    });
    const text = JSON.stringify(redacted);
    expect(text).not.toContain("super-secret");
    expect(text).not.toContain("abc");
    expect(text).not.toContain("def");
    expect(text).toContain("visible");
    expect(text).toContain("smtp.test");
  });
});
