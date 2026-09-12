/**
 * FIX-B — one path owner: every read, write, delete and static mount resolves
 * through shared/paths.ts.
 *
 * Closes BUG-026 (the static /uploads mount ignored UPLOADS_DIR and answered
 * 200 with the SPA shell), BUG-029 (transport reports 404 forever), BUG-169
 * (GET /api/drivers/:id/license 403 on every licence in production), BUG-200
 * (uploaded backups landed in cwd/backups, invisible and un-restorable),
 * BUG-085's remaining half (the mount served the wrong tree), BUG-098
 * (resolveDocumentFilePath followed a symlink out of uploads/) and BUG-184
 * (two contract uploads for one plate on one day shared one file).
 *
 * The whole file runs with UPLOADS_DIR pointed at a temp directory OUTSIDE the
 * repository — the production/Coolify shape, and the only configuration in
 * which these bugs are visible at all. Every round trip asserts the **bytes**:
 * BUG-026 answered 200 with the wrong body, so a status assertion alone would
 * have passed against the unfixed code.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { eq } from "drizzle-orm";

import {
  useTempUploadsDir,
  removeTempUploadsDir,
  listFilesRecursive,
  snapshotRepoUploads,
  tinyPdf,
} from "./helpers/uploads";

// MUST run before anything builds the app: registerRoutes() resolves the
// uploads directory once, when it creates the multer destinations.
const TEMP_UPLOADS = useTempUploadsDir();
const TEMP_BACKUPS = fs.mkdtempSync(path.join(os.tmpdir(), "lvs-backups-"));
process.env.BACKUP_PATH = TEMP_BACKUPS;

const { db } = await import("../db");
const { documents, drivers, customers } = await import("../../shared/schema");
const { getUploadsDir, getUploadsRoot } = await import("../../shared/paths");
const { getRelativePath, resolveDocumentFilePath } = await import("./../services/document-paths");
const { agentFor, cleanupFixtureUsers } = await import("./helpers/app");
const { cleanupFixtures, createFixtureVehicle, createFixtureCustomer } = await import("./helpers/fixtures");

type Agent = Awaited<ReturnType<typeof agentFor>>;

describe("FIX-B — the uploads directory has exactly one owner", () => {
  let admin: Agent;
  let vehicleId: number;
  let plate: string;
  let repoUploadsBefore: string[];

  beforeAll(async () => {
    repoUploadsBefore = snapshotRepoUploads();
    admin = await agentFor("admin");
    const vehicle = await createFixtureVehicle();
    vehicleId = vehicle.id;
    plate = vehicle.licensePlate;
  }, 60_000);

  afterAll(async () => {
    await cleanupFixtures();
    await cleanupFixtureUsers();
    removeTempUploadsDir(TEMP_UPLOADS);
    removeTempUploadsDir(TEMP_BACKUPS);
    delete process.env.BACKUP_PATH;
  });

  it("the guard itself: UPLOADS_DIR is honoured and sits outside the repository", () => {
    expect(getUploadsDir()).toBe(TEMP_UPLOADS);
    expect(getUploadsRoot()).toBe(path.resolve(TEMP_UPLOADS));
    expect(getUploadsRoot().startsWith(path.resolve(process.cwd()))).toBe(false);
  });

  // ---------------------------------------------------------------- BUG-026
  it("BUG-026: a file written by an upload route is served by /uploads with the SAME BYTES", async () => {
    const bytes = tinyPdf("FIXT-bug026-round-trip");
    const upload = await admin
      .post("/api/documents")
      .field("vehicleId", String(vehicleId))
      .field("documentType", "Other")
      .attach("file", bytes, "round-trip.pdf");
    expect(upload.status).toBe(201);

    const stored: string = upload.body.filePath;
    expect(stored).toBeTruthy();

    // The file really is under the configured root, and the stored value is
    // relative to that root rather than to process.cwd().
    const onDisk = resolveDocumentFilePath(stored);
    expect(onDisk).not.toBeNull();
    expect(onDisk!.startsWith(path.resolve(TEMP_UPLOADS))).toBe(true);
    expect(path.isAbsolute(stored)).toBe(false);
    expect(stored.startsWith("..")).toBe(false);

    // The static mount serves that exact relative path — the bytes, not the
    // SPA shell that the cwd-joined mount used to answer with (200 + wrong body).
    const served = await admin.get(`/uploads/${stored.split(path.sep).join("/")}`);
    expect(served.status).toBe(200);
    expect(Buffer.from(served.body).equals(bytes)).toBe(true);

    // And the scoped download route agrees with it.
    const download = await admin.get(`/api/documents/download/${upload.body.id}`);
    expect(download.status).toBe(200);
    expect(Buffer.from(download.body).equals(bytes)).toBe(true);
  });

  it("BUG-085: the static mount still refuses an employee without manage_documents", async () => {
    const viewer = await agentFor(["view_vehicles"]);
    const res = await viewer.get("/uploads/does-not-matter.pdf");
    expect([401, 403]).toContain(res.status);
  });

  // ---------------------------------------------------------------- BUG-169
  it("BUG-169: a driver licence uploaded under UPLOADS_DIR is served, not 403'd", async () => {
    const customer = await createFixtureCustomer("Licence");
    const licence = tinyPdf("FIXT-bug169-licence");

    const created = await admin
      .post(`/api/customers/${customer.id}/drivers`)
      .field("displayName", "FIXT-driver")
      .attach("licenseFile", licence, "licence.pdf");
    expect(created.status).toBe(201);
    const driverId: number = created.body.id;

    const [row] = await db.select().from(drivers).where(eq(drivers.id, driverId));
    expect(row.licenseFilePath).toBeTruthy();
    // The licence really landed in the temp tree, not in the repository.
    expect(resolveDocumentFilePath(row.licenseFilePath)!.startsWith(path.resolve(TEMP_UPLOADS))).toBe(true);

    // This is the bug: the old containment check compared against a hardcoded
    // path.resolve(cwd, 'uploads'), so EVERY licence answered 403.
    const served = await admin.get(`/api/drivers/${driverId}/license`);
    expect(served.status).toBe(200);
    expect(Buffer.from(served.body).equals(licence)).toBe(true);

    // A stored path that escapes the root is still refused.
    await db.update(drivers).set({ licenseFilePath: "../../package.json" }).where(eq(drivers.id, driverId));
    const escaped = await admin.get(`/api/drivers/${driverId}/license`);
    expect(escaped.status).toBe(403);
    expect(fs.existsSync(path.join(process.cwd(), "package.json"))).toBe(true);

    await db.delete(drivers).where(eq(drivers.id, driverId));
    await db.delete(customers).where(eq(customers.id, customer.id));
  });

  // ---------------------------------------------------------------- BUG-029
  it("BUG-029: getRelativePath() stores uploads-relative paths that resolve back", () => {
    const abs = path.join(TEMP_UPLOADS, "reports", "Transport_Reports_3_vehicles.pdf");
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, tinyPdf("FIXT-bug029"));

    const relative = getRelativePath(abs);
    // The old implementation returned '..\\<tempdir>\\reports\\…' here, and the
    // download route then joined that onto cwd and 404'd.
    expect(relative).toBe("reports/Transport_Reports_3_vehicles.pdf");
    expect(relative.startsWith("..")).toBe(false);
    expect(resolveDocumentFilePath(relative)).toBe(fs.realpathSync(abs));
  });

  it("BUG-029: a documents row written by the report path downloads, not 404s", async () => {
    const bytes = tinyPdf("FIXT-bug029-report");
    const abs = path.join(TEMP_UPLOADS, "reports", `report-${Date.now()}.pdf`);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, bytes);

    const [row] = await db.insert(documents).values({
      vehicleId,
      documentType: "transport_report",
      fileName: path.basename(abs),
      filePath: getRelativePath(abs),
      fileSize: bytes.length,
      contentType: "application/pdf",
    } as any).returning();

    const res = await admin.get(`/api/documents/download/${row.id}`);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("application/pdf");
    expect(Buffer.from(res.body).equals(bytes)).toBe(true);
  });

  // ---------------------------------------------------------------- BUG-098
  it("BUG-098: a symlink inside uploads/ pointing outside it is refused", () => {
    const target = path.join(process.cwd(), "package.json");
    const link = path.join(TEMP_UPLOADS, "escape-link.json");
    let linked = false;
    try {
      fs.symlinkSync(target, link, "file");
      linked = true;
    } catch {
      // Windows without developer mode refuses symlink creation; a junction
      // to a *directory* proves the same containment rule.
      try {
        fs.symlinkSync(process.cwd(), path.join(TEMP_UPLOADS, "escape-dir"), "junction");
        linked = true;
        expect(resolveDocumentFilePath("escape-dir/package.json")).toBeNull();
        return;
      } catch {
        /* no symlink support at all — skip, the lexical guard below still runs */
      }
    }
    if (linked) {
      expect(resolveDocumentFilePath("escape-link.json")).toBeNull();
      expect(fs.existsSync(target)).toBe(true);
    }
    // Lexical traversal is refused with or without symlink support.
    expect(resolveDocumentFilePath("../package.json")).toBeNull();
    expect(resolveDocumentFilePath(path.join(process.cwd(), "package.json"))).toBeNull();
  });

  // ---------------------------------------------------------------- BUG-184
  it("BUG-184: two contract uploads for one plate on one day keep their own bytes", async () => {
    const first = tinyPdf("FIXT-bug184-FIRST-CONTRACT");
    const second = tinyPdf("FIXT-bug184-SECOND-CONTRACT");

    const a = await admin
      .post("/api/documents")
      .field("vehicleId", String(vehicleId))
      .field("documentType", "contract")
      .attach("file", first, "contract.pdf");
    expect(a.status).toBe(201);

    const b = await admin
      .post("/api/documents")
      .field("vehicleId", String(vehicleId))
      .field("documentType", "contract")
      .attach("file", second, "contract.pdf");
    expect(b.status).toBe(201);

    expect(a.body.filePath).not.toBe(b.body.filePath);

    const viewA = await admin.get(`/api/documents/view/${a.body.id}`);
    const viewB = await admin.get(`/api/documents/view/${b.body.id}`);
    expect(viewA.status).toBe(200);
    expect(viewB.status).toBe(200);
    // The first row used to serve the second upload's bytes.
    expect(Buffer.from(viewA.body).equals(first)).toBe(true);
    expect(Buffer.from(viewB.body).equals(second)).toBe(true);
  });

  // ---------------------------------------------------------------- BUG-200
  it("BUG-200: an uploaded backup lands under the resolved backup path and is listed", async () => {
    const { backupService } = await import("../backupService");
    const dump = Buffer.from(
      "--\n-- PostgreSQL database dump\n--\nCREATE TABLE public.x (id integer);\n" +
      "-- PostgreSQL database dump complete\n",
      "utf8",
    );

    const res = await admin
      .post("/api/backups/upload")
      .field("type", "database")
      .attach("backup", dump, "my-backup.sql");
    expect(res.status).toBe(200);

    const backupDir = await backupService.resolveBackupDirectory();
    expect(path.resolve(backupDir)).toBe(path.resolve(TEMP_BACKUPS));

    const written = res.body.backup.filename as string;
    expect(fs.existsSync(path.join(backupDir, written))).toBe(true);
    // Nothing was written into the repository's own backups/ directory.
    expect(fs.existsSync(path.join(process.cwd(), "backups", written))).toBe(false);

    const listed = await admin.get("/api/backups?type=database");
    expect(listed.status).toBe(200);
    expect((listed.body as any[]).some((b) => b.filename === written)).toBe(true);
  });

  const TRAVERSAL_PAYLOADS = [
    "..",
    ".",
    "../x.sql",
    "..\\x.sql",
    "....//x.sql",
    "a/b.sql",
    "a\\b.sql",
    "/etc/passwd",
    "C:\\Windows\\win.ini",
    "\\\\server\\share\\x.sql",
    "db-backup/../../x.sql",
    "sub\\db-backup.sql",
  ];

  it("BUG-097 hardening: the filename guard is an allowlist, not an includes() blacklist", async () => {
    const { isPlainFilename } = await import("../routes/backups");
    for (const payload of TRAVERSAL_PAYLOADS) {
      // The old guard was `filename.includes('..') || filename.includes('/')`,
      // which let every backslash shape through.
      expect({ payload, allowed: isPlainFilename(payload) }).toEqual({ payload, allowed: false });
    }
    for (const ok of ["db-backup-2026-01-01.sql.gz", "files-backup-2026-01-01.tar.gz", "uploaded-database-x.sql"]) {
      expect({ ok, allowed: isPlainFilename(ok) }).toEqual({ ok, allowed: true });
    }
  });

  it("BUG-097 hardening: the traversal payloads that reach the route all answer 400", async () => {
    // Percent-encoded so Express' router does not swallow the separators. A
    // payload consisting only of dots is normalised away by the HTTP client
    // itself and never reaches the handler at all — that is why it is asserted
    // against the guard directly above, exactly as the audit found it.
    const encode = (s: string) =>
      s.split("").map((c) => "%" + c.charCodeAt(0).toString(16).padStart(2, "0")).join("");
    const reachable = TRAVERSAL_PAYLOADS.filter((p) => !/^[.]+$/.test(p));
    for (const payload of reachable) {
      const res = await admin.get(`/api/backups/download/${encode(payload)}`);
      expect({ payload, status: res.status }).toEqual({ payload, status: 400 });
      const typed = await admin.get(`/api/backups/download/database/${encode(payload)}`);
      expect({ payload, status: typed.status }).toEqual({ payload, status: 400 });
      const del = await admin.delete(`/api/backups/database/${encode(payload)}`);
      expect({ payload, status: del.status }).toEqual({ payload, status: 400 });
    }
  });

  // ------------------------------------------------- nothing escapes the root
  it("nothing this file did was written outside the configured uploads root", () => {
    expect(snapshotRepoUploads()).toEqual(repoUploadsBefore);
    // And everything that WAS written is under the temp root.
    const written = listFilesRecursive(TEMP_UPLOADS);
    expect(written.length).toBeGreaterThan(0);
    for (const rel of written) {
      expect(path.resolve(TEMP_UPLOADS, rel).startsWith(path.resolve(TEMP_UPLOADS))).toBe(true);
    }
  });
});
