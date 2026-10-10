/**
 * Audit 2026-10-09 modules 17 and 19 at route level:
 *  A-17-4  a backup whose manifest holds the old path-safe timestamp lists with
 *          its real date, not 1 Jan 1970
 *  A-17-3 / A-2-7  failures carry a stable code; the health answer carries a
 *          reason code for the last error
 *  A-19-1  the code archive failing answers a fixed message + code: no command
 *          line, no absolute path, no `details`
 *  A-19-2  the files archive is streamed (and nothing is written into <cwd>/temp)
 *
 * BACKUP_PATH and UPLOADS_DIR point at temp directories, so nothing here can see
 * or touch the repository's own backups/ or uploads/.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import zlib from "zlib";

const TEMP_BACKUPS = fs.mkdtempSync(path.join(os.tmpdir(), "lvs-p8-backups-"));
const TEMP_UPLOADS = fs.mkdtempSync(path.join(os.tmpdir(), "lvs-p8-uploads-"));
process.env.BACKUP_PATH = TEMP_BACKUPS;
process.env.UPLOADS_DIR = TEMP_UPLOADS;

const { agentFor, cleanupFixtureUsers } = await import("./helpers/app");
const { backupService } = await import("../backupService");

type Agent = Awaited<ReturnType<typeof agentFor>>;

/** supertest: collect the body as a Buffer. */
const binary = (res: any, cb: (err: Error | null, body: Buffer) => void) => {
  const chunks: Buffer[] = [];
  res.on("data", (c: Buffer) => chunks.push(c));
  res.on("end", () => cb(null, Buffer.concat(chunks)));
};

describe("P8 - backup routes", () => {
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

  it("A-17-4: a manifest with the legacy path-safe timestamp lists with its real date", async () => {
    const dir = path.join(TEMP_BACKUPS, "files", "2025", "10", "13");
    fs.mkdirSync(dir, { recursive: true });
    const name = "files-backup-2025-10-13T21-49-25-514Z.tar.gz";
    // The archive itself is long gone (only the manifest is left), as on the audited machine.
    fs.writeFileSync(
      path.join(dir, `${name}.manifest.json`),
      JSON.stringify({ timestamp: "2025-10-13T21-49-25-514Z", type: "files", filename: name, size: 10, checksum: "x" }),
    );

    const res = await admin.get("/api/backups/list?type=files");
    expect(res.status).toBe(200);
    const row = (res.body as any[]).find((b) => b.filename === name);
    expect(row).toBeTruthy();
    expect(row.timestamp).toBe("2025-10-13T21:49:25.514Z");
  });

  it("A-17-3: a failed 'Back up now' answers a code and a reason, not only English text", async () => {
    const spy = vi.spyOn(backupService, "runBackup").mockRejectedValue(new Error("pg_dump executable not found"));
    try {
      const res = await admin.post("/api/backups/run").send({});
      expect(res.status).toBe(500);
      expect(res.body.code).toBe("BACKUP_FAILED");
      expect(res.body.reason).toBe("TOOL_MISSING");
    } finally {
      spy.mockRestore();
    }
  });

  it("A-2-7: the health answer classifies a missing backup directory", async () => {
    fs.rmSync(TEMP_BACKUPS, { recursive: true, force: true });
    const res = await admin.get("/api/backups/health");
    expect(res.status).toBe(200);
    expect(res.body.lastErrorCode).toBe("BACKUP_DIR_MISSING");
    fs.mkdirSync(TEMP_BACKUPS, { recursive: true });
  });

  it("A-19-2: the files backup is streamed as gzip and nothing is written into <cwd>/temp", async () => {
    fs.writeFileSync(path.join(TEMP_UPLOADS, "hello.txt"), "hello");
    const tempDir = path.join(process.cwd(), "temp");
    const before = fs.existsSync(tempDir) ? fs.readdirSync(tempDir).sort() : [];

    const res = await admin.get("/api/backups/download-files").buffer(true).parse(binary);

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("application/gzip");
    expect(res.headers["content-disposition"]).toMatch(/attachment; filename="car-rental-files-\d{4}-\d{2}-\d{2}\.tar\.gz"/);
    expect(res.headers["content-length"]).toBeUndefined(); // streamed, not built first
    const body = res.body as Buffer;
    expect(body[0]).toBe(0x1f);
    expect(body[1]).toBe(0x8b);
    expect(zlib.gunzipSync(body).toString("latin1")).toContain("hello.txt");
    const after = fs.existsSync(tempDir) ? fs.readdirSync(tempDir).sort() : [];
    expect(after.filter((n) => n.startsWith("car-rental-files-") && !before.includes(n))).toEqual([]);
  });

  it("A-19-1: the code backup streams from the application directory", async () => {
    const tree = fs.mkdtempSync(path.join(os.tmpdir(), "lvs-p8-tree-"));
    fs.writeFileSync(path.join(tree, "a.ts"), "export {};");
    const cwd = vi.spyOn(process, "cwd").mockReturnValue(tree);
    try {
      const res = await admin.get("/api/backups/download-code").buffer(true).parse(binary);
      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toContain("application/gzip");
      expect((res.body as Buffer)[0]).toBe(0x1f);
      // The archive really holds the application directory (not an empty tar).
      expect(zlib.gunzipSync(res.body as Buffer).toString("latin1")).toContain("a.ts");
    } finally {
      cwd.mockRestore();
      fs.rmSync(tree, { recursive: true, force: true });
    }
  });

  it("A-19-1: a failing pg_dump leaves no lvs-dump-* directory and the body has no path", async () => {
    const dumpDirs = () => fs.readdirSync(os.tmpdir()).filter((n) => n.startsWith("lvs-dump-")).sort();
    const before = dumpDirs();
    // pg_dump cannot be started: an empty PATH makes spawn fail with ENOENT (as on the audited machine).
    const pathKey = Object.keys(process.env).find((k) => k.toLowerCase() === "path") ?? "PATH";
    const savedPath = process.env[pathKey];
    process.env[pathKey] = "";
    try {
      const res = await admin.get("/api/backups/download-data");
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: "Failed to download app data", code: "BACKUP_DOWNLOAD_FAILED" });
      expect(JSON.stringify(res.body)).not.toMatch(/pg_dump|ENOENT|Users|lvs-dump|details/);
    } finally {
      process.env[pathKey] = savedPath;
    }
    expect(dumpDirs()).toEqual(before);
  });

  it("A-19-1: when tar fails the answer is a fixed message and a code, with no path, command or details", async () => {
    // tar cannot be started: an empty PATH makes spawn fail with ENOENT, whose text names the command.
    const pathKey = Object.keys(process.env).find((k) => k.toLowerCase() === "path") ?? "PATH";
    const savedPath = process.env[pathKey];
    process.env[pathKey] = "";
    try {
      const res = await admin.get("/api/backups/download-code");
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: "Failed to download app code", code: "BACKUP_DOWNLOAD_FAILED" });
      expect(JSON.stringify(res.body)).not.toMatch(/tar -|details|ENOENT|Users/);
    } finally {
      process.env[pathKey] = savedPath;
    }
  });
});
