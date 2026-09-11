/**
 * FIX-C — path containment on documents.file_path (BUG-012).
 *
 * view, download and delete all built their absolute path with
 * `path.join(process.cwd(), document.filePath)`, so a stored '../package.json'
 * or an absolute path reached straight out of the uploads directory — a read
 * on two routes and an unlink on the third.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs";
import path from "path";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { documents } from "../../shared/schema";
import { getUploadsDir } from "../../shared/paths";
import { agentFor, cleanupFixtureUsers, type TestAgent } from "./helpers/app";
import { cleanupFixtures, createFixtureVehicle } from "./helpers/fixtures";

const OUTSIDE_FILE = path.resolve(process.cwd(), "package.json");

describe("FIX-C — documents.file_path cannot escape the uploads directory", () => {
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

  async function documentWithPath(filePath: string, contentType = "application/json"): Promise<number> {
    // Only the database can create this state: PATCH /api/documents/:id
    // whitelists documentType and notes, so filePath is not client-writable.
    const [row] = await db.insert(documents).values({
      vehicleId,
      documentType: "FIXT-traversal",
      fileName: "package.json",
      filePath,
      fileSize: 1,
      contentType,
    } as any).returning();
    return row.id;
  }

  for (const [label, storedPath] of [
    ["a relative traversal", "../package.json"],
    ["an absolute path outside uploads", OUTSIDE_FILE],
  ] as const) {
    it(`refuses ${label} on view, download and delete, and leaves the file alone`, async () => {
      const id = await documentWithPath(storedPath);

      expect((await admin.get(`/api/documents/view/${id}`)).status).toBe(404);
      expect((await admin.get(`/api/documents/download/${id}`)).status).toBe(404);

      const del = await admin.delete(`/api/documents/${id}`);
      // The record may be removed; the file on disk may not.
      expect([200, 404]).toContain(del.status);
      expect(fs.existsSync(OUTSIDE_FILE)).toBe(true);

      await db.delete(documents).where(eq(documents.id, id));
    });
  }

  it("still serves a document that really is inside the uploads directory", async () => {
    const dir = path.join(getUploadsDir(), "__fixt_documents__");
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, "legit.txt");
    fs.writeFileSync(file, "hello");

    const id = await documentWithPath(file, "text/plain");
    expect((await admin.get(`/api/documents/view/${id}`)).status).toBe(200);
    expect((await admin.get(`/api/documents/download/${id}`)).status).toBe(200);

    expect((await admin.delete(`/api/documents/${id}`)).status).toBe(200);
    expect(fs.existsSync(file)).toBe(false);

    fs.rmSync(dir, { recursive: true, force: true });
    await db.delete(documents).where(eq(documents.id, id));
  });
});
