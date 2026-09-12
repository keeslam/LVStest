/**
 * FIX-L, route level — the six status and confirmation gaps of BUG-221, plus
 * the rule that a restore failure is reported as a failure and never leaks the
 * connection string.
 *
 * Everything here runs with BACKUP_PATH pointed at a temp directory, so no
 * test can see, write or delete anything in the repository's own backups/.
 * Nothing in this file restores a database: the destructive paths are covered
 * against a scratch database in fix-l-restore-safety.test.ts.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

const TEMP_BACKUPS = fs.mkdtempSync(path.join(os.tmpdir(), "lvs-backups-routes-"));
const TEMP_UPLOADS = fs.mkdtempSync(path.join(os.tmpdir(), "lvs-uploads-routes-"));
process.env.BACKUP_PATH = TEMP_BACKUPS;
process.env.UPLOADS_DIR = TEMP_UPLOADS;

const { agentFor, cleanupFixtureUsers } = await import("./helpers/app");
const { goodDump, truncatedDump, foreignDatabaseDump, gzipped } = await import("./fixtures/backup-dumps");

type Agent = Awaited<ReturnType<typeof agentFor>>;

describe("FIX-L — the backup routes", () => {
  let admin: Agent;

  beforeAll(async () => {
    admin = await agentFor("admin");
  }, 60_000);

  afterAll(async () => {
    await cleanupFixtureUsers();
    fs.rmSync(TEMP_BACKUPS, { recursive: true, force: true });
    fs.rmSync(TEMP_UPLOADS, { recursive: true, force: true });
    delete process.env.BACKUP_PATH;
    delete process.env.UPLOADS_DIR;
  });

  // ------------------------------------------------------------- BUG-221(e)
  it("BUG-221(e): a zero-byte upload is refused rather than listed as a backup", async () => {
    const res = await admin
      .post("/api/backups/upload")
      .field("type", "database")
      .attach("backup", Buffer.alloc(0), "empty.sql");
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toMatch(/empty/i);

    const listed = await admin.get("/api/backups?type=database");
    expect((listed.body as any[]).some((b) => String(b.filename).includes("empty"))).toBe(false);
  });

  // ------------------------------------------------------------- BUG-221(f)
  it("BUG-221(f): restore-data refuses to drop anything without the typed confirmation", async () => {
    const res = await admin
      .post("/api/backups/restore-data")
      .field("type", "database")
      .attach("backup", Buffer.from(goodDump(), "utf8"), "confirm-me.sql");
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Confirmation does not match/i);
  });

  it("BUG-221(f): restore-files refuses to overwrite anything without the typed confirmation", async () => {
    const res = await admin
      .post("/api/backups/restore-files")
      .attach("backup", gzipped(goodDump()), "confirm-me.tar.gz");
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Confirmation does not match/i);
  });

  // ------------------------------------------------------------- BUG-197
  it("BUG-197: an uploaded truncated dump is refused with a reason, and nothing is dropped", async () => {
    const res = await admin
      .post("/api/backups/restore-data")
      .field("confirm", "half.sql")
      .attach("backup", Buffer.from(truncatedDump(), "utf8"), "half.sql");
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Refusing to restore/i);
    expect(res.body.error).toMatch(/PostgreSQL database dump complete/);
    // The refusal is the whole message — never a connection string (BUG-075).
    expect(JSON.stringify(res.body)).not.toMatch(/postgres(ql)?:\/\//);
  });

  it("BUG-199: an uploaded dump aimed at another database is refused by name", async () => {
    const res = await admin
      .post("/api/backups/restore-data")
      .field("confirm", "foreign.sql")
      .attach("backup", Buffer.from(foreignDatabaseDump("someone_elses_db"), "utf8"), "foreign.sql");
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Refusing to restore/i);
    expect(JSON.stringify(res.body)).not.toMatch(/postgres(ql)?:\/\//);
  });

  // ------------------------------------------------------------- BUG-221(c)
  it("BUG-221(c): health reports a missing backup directory as stale instead of green", async () => {
    const moved = `${TEMP_BACKUPS}-moved`;
    fs.renameSync(TEMP_BACKUPS, moved);
    try {
      const res = await admin.get("/api/backups/health");
      expect(res.status).toBe(200);
      // Renaming the backup volume used to answer stale:false, lastError:null
      // while /list quietly returned [].
      expect(res.body.backupPathExists).toBe(false);
      expect(res.body.stale).toBe(true);
      expect(String(res.body.backupPathError)).toMatch(/does not exist/i);
    } finally {
      fs.renameSync(moved, TEMP_BACKUPS);
    }
  });

  it("BUG-221(c): health reports an empty backup directory as stale too", async () => {
    const res = await admin.get("/api/backups/health");
    expect(res.status).toBe(200);
    expect(res.body.backupPathExists).toBe(true);
    expect(res.body.backupPath).toBe(TEMP_BACKUPS);
    // No backups have been written here, so this must not read as healthy.
    expect(res.body.stale).toBe(true);
    expect(String(res.body.backupPathError)).toMatch(/No backups were found/i);
    // BUG-219: whether a restore could even run is part of the health answer.
    expect(res.body).toHaveProperty("restoreToolsOk");
  });

  // ------------------------------------------------------------- BUG-221(b)
  it("BUG-221(b): the next scheduled time is the next 02:00, never a day out", async () => {
    const res = await admin.get("/api/backups/status");
    expect(res.status).toBe(200);
    const next = new Date(res.body.nextScheduled);
    expect(Number.isNaN(next.getTime())).toBe(false);

    // Independent of the hour the suite happens to run at: the next run is in
    // the future, within 24 hours, and lands exactly on 02:00 local time.
    const msAway = next.getTime() - Date.now();
    expect(msAway).toBeGreaterThan(0);
    expect(msAway).toBeLessThanOrEqual(24 * 60 * 60 * 1000);
    expect(next.getHours()).toBe(2);
    expect(next.getMinutes()).toBe(0);
  });

  // ------------------------------------------------------------- BUG-097/076
  it("an uploaded backup keeps a neutralised name inside the backup directory", async () => {
    const dump = Buffer.from(goodDump(), "utf8");
    const res = await admin
      .post("/api/backups/upload")
      .field("type", "database")
      .attach("backup", dump, "weird name (1).sql");
    expect(res.status).toBe(200);

    const written = res.body.backup.filename as string;
    expect(written).toBe(path.basename(written));
    expect(written).not.toMatch(/[\\/]/);
    expect(fs.existsSync(path.join(TEMP_BACKUPS, written))).toBe(true);
    // Every file the upload produced sits directly in the backup directory.
    const strays = fs.readdirSync(TEMP_BACKUPS, { withFileTypes: true })
      .filter((e) => e.isFile() && !e.name.startsWith("uploaded-"));
    expect(strays.map((e) => e.name)).toEqual([]);
  });

  // ------------------------------------------------------------- BUG-197/075
  it("a restore of a backup that is not there answers 404, not a stack trace", async () => {
    const res = await admin
      .post("/api/backups/restore/database")
      .send({ filename: "no-such-backup.sql.gz", confirmFilename: "no-such-backup.sql.gz" });
    expect(res.status).toBe(404);
    expect(JSON.stringify(res.body)).not.toMatch(/postgres(ql)?:\/\//);
  });

  // ------------------------------------------------------------- BUG-221(a)
  it("BUG-221(a): a second backup while one is running answers 409 with Retry-After", async () => {
    const { backupService } = await import("../backupService");
    const spy = vi.spyOn(backupService, "runBackup").mockRejectedValue(new Error("Backup is already running"));
    try {
      const res = await admin.post("/api/backups/run").send({});
      // It used to be a flat 500 "Backup is already running": indistinguishable
      // from the backup itself having crashed, and with nothing telling the
      // client when to try again.
      expect(res.status).toBe(409);
      expect(res.headers["retry-after"]).toBe("60");
      expect(res.body.error).toMatch(/already running/i);
      expect(res.body.retryAfterSeconds).toBe(60);
    } finally {
      spy.mockRestore();
    }
  });

  it("a backup that genuinely fails is still a 500, not a 409", async () => {
    const { backupService } = await import("../backupService");
    const spy = vi.spyOn(backupService, "runBackup").mockRejectedValue(new Error("disk is full"));
    try {
      const res = await admin.post("/api/backups/run").send({});
      expect(res.status).toBe(500);
      expect(res.headers["retry-after"]).toBeUndefined();
    } finally {
      spy.mockRestore();
    }
  });

  // ------------------------------------------------------------- BUG-221(d)
  it("BUG-221(d): cleanup removes the empty date folders it leaves behind", async () => {
    const { backupService } = await import("../backupService");
    const emptyDay = path.join(TEMP_BACKUPS, "database", "2025", "05", "01");
    fs.mkdirSync(emptyDay, { recursive: true });
    const keptDay = path.join(TEMP_BACKUPS, "files", "2025", "06", "02");
    fs.mkdirSync(keptDay, { recursive: true });
    fs.writeFileSync(path.join(keptDay, "files-backup-keep.tar.gz"), "x");

    await backupService.cleanupOldBackups();

    // The empty year/month/day chain is gone...
    expect(fs.existsSync(emptyDay)).toBe(false);
    expect(fs.existsSync(path.join(TEMP_BACKUPS, "database", "2025"))).toBe(false);
    // ...but a folder that still holds a backup, and the type directories
    // themselves, are left exactly where they were.
    expect(fs.existsSync(path.join(keptDay, "files-backup-keep.tar.gz"))).toBe(true);
    expect(fs.existsSync(path.join(TEMP_BACKUPS, "files"))).toBe(true);
  });

  // ------------------------------------------------------------- BUG-198
  it("BUG-198: restoreFiles extracts into UPLOADS_DIR, not into the application directory", async () => {
    const { backupService } = await import("../backupService");
    const { getUploadsDir } = await import("../../shared/paths");
    expect(getUploadsDir()).toBe(TEMP_UPLOADS);

    // Build a files archive of the shape createFilesBackup writes: every entry
    // prefixed `uploads/`.
    const tar = await import("tar");
    const staging = fs.mkdtempSync(path.join(os.tmpdir(), "lvs-stage-"));
    fs.mkdirSync(path.join(staging, "uploads", "contracts"), { recursive: true });
    fs.writeFileSync(path.join(staging, "uploads", "contracts", "restored.pdf"), "RESTORED-BYTES");
    const archiveName = "files-backup-FIXT-restore.tar.gz";
    tar.c({ file: path.join(TEMP_BACKUPS, archiveName), cwd: staging, gzip: true, sync: true }, ["uploads"]);

    const result = await backupService.restoreFiles(archiveName, undefined, { skipSafetyBackup: true });

    expect(result.filesWritten).toBe(1);
    // Into the uploads root the application actually serves...
    expect(fs.readFileSync(path.join(TEMP_UPLOADS, "contracts", "restored.pdf"), "utf8")).toBe("RESTORED-BYTES");
    // ...with the `uploads/` prefix stripped rather than nested...
    expect(fs.existsSync(path.join(TEMP_UPLOADS, "uploads"))).toBe(false);
    // ...and nothing written into the repository, which is where this used to go.
    expect(fs.existsSync(path.join(process.cwd(), "uploads", "contracts", "restored.pdf"))).toBe(false);

    fs.rmSync(staging, { recursive: true, force: true });
  });

  it("BUG-198: restoreFiles refuses an extraction target that is not the uploads directory", async () => {
    const { backupService } = await import("../backupService");
    const elsewhere = fs.mkdtempSync(path.join(os.tmpdir(), "lvs-elsewhere-"));
    try {
      // The safety backup archives getUploadsDir(); extracting anywhere else
      // would protect one directory while overwriting another.
      await expect(
        backupService.restoreFiles("files-backup-FIXT-restore.tar.gz", elsewhere, { skipSafetyBackup: true }),
      ).rejects.toThrow(/not the uploads directory/i);
    } finally {
      fs.rmSync(elsewhere, { recursive: true, force: true });
    }
  });

  // ------------------------------------------------------------- BUG-208
  it("BUG-208: a complete restore with a bad files archive stops before the database is touched", async () => {
    const { backupService } = await import("../backupService");
    const { goodDump: dump } = await import("./fixtures/backup-dumps");
    fs.writeFileSync(path.join(TEMP_BACKUPS, "db-backup-FIXT-complete.sql"), dump());
    fs.writeFileSync(path.join(TEMP_BACKUPS, "files-backup-FIXT-broken.tar.gz"), "not a tar archive at all");

    await expect(
      backupService.restoreComplete(
        "db-backup-FIXT-complete.sql",
        "files-backup-FIXT-broken.tar.gz",
        { skipSafetyBackup: true },
      ),
    ).rejects.toThrow(/files archive is unusable/i);

    // The old order ran the database half first and only then discovered the
    // files half was broken — by which time everyone was logged out and the
    // response still said the whole restore had failed.
  });

  it("restore/database still refuses a mismatched confirmation", async () => {
    const res = await admin
      .post("/api/backups/restore/database")
      .send({ filename: "anything.sql.gz", confirmFilename: "something-else.sql.gz" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Confirmation does not match/i);
  });
});
