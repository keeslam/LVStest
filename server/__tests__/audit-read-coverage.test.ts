/**
 * "Who looked at this, who printed it, who downloaded it."
 *
 * The audit middleware used to log writes only. The owner wants reads of files
 * in the same log: opening or downloading a document, printing a contract,
 * exporting a CSV. Three paths feed that:
 *
 *   - a GET of a tracked file (server/middleware/audit.ts TRACKED_READS);
 *   - the same GET with `?intent=print`, which the client sends when it opens
 *     the file only to print it;
 *   - POST /api/audit-events, for a print or export the server never sees
 *     (a preview already loaded, a label or report rendered in the browser).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs";
import path from "path";
import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { auditLogs, documents } from "../../shared/schema";
import { useTempUploadsDir, removeTempUploadsDir } from "./helpers/uploads";

// Before anything builds the app: the download route resolves files under UPLOADS_DIR.
const uploadsDir = useTempUploadsDir("lvs-audit-reads-");

import { agentFor, cleanupFixtureUsers, type TestAgent } from "./helpers/app";
import { createFixtureVehicle, cleanupFixtures } from "./helpers/fixtures";

let admin: TestAgent;
let documentId: number;

beforeAll(async () => {
  admin = await agentFor("admin");
  const vehicle = await createFixtureVehicle();
  const fileName = "FIXT-audit-read.txt";
  fs.writeFileSync(path.join(uploadsDir, fileName), "contract body");
  const [doc] = await db.insert(documents).values({
    vehicleId: vehicle.id,
    documentType: "contract",
    fileName,
    filePath: fileName,
    fileSize: 13,
    contentType: "text/plain",
  } as any).returning();
  documentId = doc.id;
});

afterAll(async () => {
  await db.delete(documents).where(eq(documents.id, documentId));
  await cleanupFixtures();
  await cleanupFixtureUsers();
  removeTempUploadsDir(uploadsDir);
});

async function rowsFor(resourceType: string, resourceId: number | string) {
  return db.select().from(auditLogs).where(and(
    eq(auditLogs.resourceType, resourceType),
    eq(auditLogs.resourceId, String(resourceId)),
  ));
}

/** The middleware writes from the response's finish event; poll briefly. */
async function waitForAction(resourceType: string, resourceId: number | string, action: string) {
  for (let i = 0; i < 40; i += 1) {
    const hit = (await rowsFor(resourceType, resourceId)).find((r) => r.action === action);
    if (hit) return hit;
    await new Promise((r) => setTimeout(r, 50));
  }
  return (await rowsFor(resourceType, resourceId)).find((r) => r.action === action) ?? null;
}

describe("audit coverage — reads, prints and downloads", () => {
  it("downloading a document is logged as document.download, named after the file", async () => {
    const res = await admin.get(`/api/documents/download/${documentId}`);
    expect(res.status).toBe(200);

    const row = await waitForAction("document", documentId, "document.download");
    expect(row).not.toBeNull();
    expect(row!.username).toBe(admin.username);
    expect(row!.details).toMatchObject({ operation: "download", label: "FIXT-audit-read.txt" });
  });

  it("opening a document to print it (?intent=print) is logged as a print, not a view", async () => {
    const res = await admin.get(`/api/documents/view/${documentId}?intent=print`);
    expect(res.status).toBe(200);

    const row = await waitForAction("document", documentId, "document.print");
    expect(row).not.toBeNull();
    expect(row!.username).toBe(admin.username);
  });

  it("a print from an already-loaded preview is reported by the client and logged as a print", async () => {
    const before = (await rowsFor("document", documentId)).filter((r) => r.action === "document.print").length;
    const res = await admin.post("/api/audit-events").send({ printedUrl: `/api/documents/view/${documentId}` });
    expect(res.status).toBe(204);

    const after = (await rowsFor("document", documentId)).filter((r) => r.action === "document.print");
    expect(after.length).toBe(before + 1);
    expect(after.at(-1)!.details).toMatchObject({ source: "client", label: "FIXT-audit-read.txt" });
  });

  it("a label print is logged under the employee who printed it", async () => {
    const res = await admin.post("/api/audit-events").send({
      action: "label.print",
      details: { output: "dymo", count: 2, plates: ["FIXT-1", "FIXT-2"] },
    });
    expect(res.status).toBe(204);

    const [row] = await db.select().from(auditLogs)
      .where(and(eq(auditLogs.action, "label.print"), eq(auditLogs.username, admin.username)))
      .orderBy(auditLogs.id)
      .limit(1);
    expect(row).toBeDefined();
    expect(row.resourceType).toBe("label");
    expect(row.details).toMatchObject({ output: "dymo", count: 2, source: "client" });
  });

  it("the client cannot invent an action or a file outside the tracked set", async () => {
    expect((await admin.post("/api/audit-events").send({ action: "user.delete", resourceId: 1 })).status).toBe(400);
    expect((await admin.post("/api/audit-events").send({ printedUrl: "/api/users" })).status).toBe(400);
    expect((await admin.post("/api/audit-events").send({ printedUrl: "https://evil.example/x" })).status).toBe(400);
  });

  it("a failed read leaves no 'looked at' row", async () => {
    const res = await admin.get("/api/documents/download/999999999");
    expect(res.status).toBe(404);
    expect(await rowsFor("document", 999999999)).toEqual([]);
  });
});
