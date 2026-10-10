/**
 * Audit 2026-10-09 modules 2, 17 and 19 (A-2-7, A-17-3, A-19-1, A-19-2):
 * - a failed backup is classified into a stable reason code, so the client can
 *   speak Dutch and no screen shows an English technical line;
 * - the code/files archives are streamed straight to the response: no file in
 *   the source tree, no half archive, no command line or path in the answer.
 */
import { describe, it, expect } from "vitest";
import { EventEmitter } from "events";
import { PassThrough } from "stream";
import { classifyBackupError } from "../utils/backup-error-code";
import { streamTarGz, sweepStaleBackupTemp } from "../utils/stream-archive";
import fs from "fs";
import os from "os";
import path from "path";

describe("classifyBackupError", () => {
  it.each([
    ["pg_dump could not be started: spawn pg_dump ENOENT", "TOOL_MISSING"],
    ["pg_dump executable not found", "TOOL_MISSING"],
    ["spawn tar ENOENT", "TOOL_MISSING"],
    ["pg_dump exited with code 1: could not connect to server: Connection refused", "DATABASE_UNREACHABLE"],
    ["pg_dump exited with code 1: password authentication failed for user", "DATABASE_UNREACHABLE"],
    ["ENOSPC: no space left on device, write", "DISK_FULL"],
    ["EACCES: permission denied, open '/backups/x'", "PERMISSION_DENIED"],
    ["something nobody foresaw", "UNKNOWN"],
    ["", "UNKNOWN"],
  ])("%s -> %s", (message, code) => {
    expect(classifyBackupError(message)).toBe(code);
  });

  it("accepts the 'ISO date: message' shape of the stored last error", () => {
    expect(classifyBackupError("2026-08-23T12:10:48.705Z: pg_dump executable not found")).toBe("TOOL_MISSING");
  });
});

/** A fake `tar` child process: stdout is a stream, exit is emitted by the test. */
function fakeChild() {
  const child = new EventEmitter() as EventEmitter & { stdout: PassThrough; stderr: PassThrough; kill: () => void };
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.kill = () => {};
  return child;
}

/** A minimal Response double that records what the helper does to it. */
function fakeRes() {
  const out = new PassThrough({ autoDestroy: false });
  const chunks: Buffer[] = [];
  out.on("data", (c) => chunks.push(Buffer.from(c)));
  const res: any = out;
  res.headersSent = false;
  res.statusCode = 200;
  res.headers = {} as Record<string, string>;
  res.setHeader = (k: string, v: string) => { res.headers[k] = v; };
  res.status = (code: number) => { res.statusCode = code; return res; };
  res.json = (body: unknown) => { res.headersSent = true; res.body = body; out.end(); return res; };
  res.destroyed = false;
  const origDestroy = out.destroy.bind(out);
  res.destroy = (err?: Error) => { res.destroyed = true; return origDestroy(err); };
  res.sent = () => Buffer.concat(chunks);
  return res;
}

describe("streamTarGz", () => {
  it("streams the archive: headers on the first byte, then the bytes", async () => {
    const child = fakeChild();
    const res = fakeRes();
    const done = streamTarGz(res, { filename: "x.tar.gz", args: ["-czf", "-"], spawnImpl: (() => child) as any });
    child.stdout.write(Buffer.from([0x1f, 0x8b, 1, 2]));
    child.stdout.end();
    child.emit("close", 0);
    await done;
    expect(res.headers["Content-Type"]).toBe("application/gzip");
    expect(res.headers["Content-Disposition"]).toContain('filename="x.tar.gz"');
    expect([...res.sent()]).toEqual([0x1f, 0x8b, 1, 2]);
    expect(res.destroyed).toBe(false);
  });

  it("answers a fixed 500 with a code when tar cannot start, and never the error text or a path", async () => {
    const child = fakeChild();
    const res = fakeRes();
    const done = streamTarGz(res, {
      filename: "x.tar.gz",
      args: ["-czf", "-"],
      spawnImpl: (() => child) as any,
      failure: { error: "Failed to download app code", code: "BACKUP_DOWNLOAD_FAILED" },
    });
    child.emit("error", new Error("spawn tar ENOENT C:\Users\kees lam\Desktop\secret"));
    await done;
    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ error: "Failed to download app code", code: "BACKUP_DOWNLOAD_FAILED" });
    expect(JSON.stringify(res.body)).not.toMatch(/secret|Users|spawn/);
  });

  it("answers the same 500 when tar exits non-zero before any byte", async () => {
    const child = fakeChild();
    const res = fakeRes();
    const done = streamTarGz(res, {
      filename: "x.tar.gz",
      args: [],
      spawnImpl: (() => child) as any,
      failure: { error: "Failed to download app code", code: "BACKUP_DOWNLOAD_FAILED" },
    });
    child.stderr.write("tar: C:\secret: Cannot open\n");
    child.stdout.end();
    child.emit("close", 2);
    await done;
    expect(res.statusCode).toBe(500);
    expect(res.body.code).toBe("BACKUP_DOWNLOAD_FAILED");
  });

  it("answers the fixed 500 when tar writes its gzip header and then fails (a missing directory)", async () => {
    const child = fakeChild();
    const res = fakeRes();
    const done = streamTarGz(res, {
      filename: "x.tar.gz",
      args: [],
      spawnImpl: (() => child) as any,
      failure: { error: "Failed to download app code", code: "BACKUP_DOWNLOAD_FAILED" },
    });
    child.stdout.write(Buffer.from([0x1f, 0x8b, 8, 0])); // the 20-byte header tar emits before it notices
    await new Promise((r) => setTimeout(r, 10));
    child.stdout.end();
    child.emit("close", 2);
    await done;
    expect(res.statusCode).toBe(500);
    expect(res.body.code).toBe("BACKUP_DOWNLOAD_FAILED");
    expect(res.sent().length).toBe(0);
  });

  it("aborts the connection (a failed download, not a short 'good' file) when tar fails after the stream was committed", async () => {
    const child = fakeChild();
    const res = fakeRes();
    const done = streamTarGz(res, { filename: "x.tar.gz", args: [], spawnImpl: (() => child) as any });
    child.stdout.write(Buffer.alloc(70_000, 1)); // past the hold-back window
    await new Promise((r) => setTimeout(r, 10));
    child.stdout.end();
    child.emit("close", 2);
    await done;
    expect(res.destroyed).toBe(true);
  });
});

describe("sweepStaleBackupTemp", () => {
  it("removes old car-rental-* files and zero-byte ones, leaves everything else", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lvs-sweep-"));
    try {
      const zero = path.join(dir, "car-rental-data-2026-08-22.sql");
      const old = path.join(dir, "car-rental-code-2026-10-09.tar.gz");
      const fresh = path.join(dir, "car-rental-files-today.tar.gz");
      const other = path.join(dir, "notes.txt");
      fs.writeFileSync(zero, "");
      fs.writeFileSync(old, "x");
      fs.writeFileSync(fresh, "x");
      fs.writeFileSync(other, "");
      const longAgo = new Date(Date.now() - 3 * 24 * 3600 * 1000);
      fs.utimesSync(old, longAgo, longAgo);

      const removed = sweepStaleBackupTemp(dir);

      expect(removed.sort()).toEqual(["car-rental-code-2026-10-09.tar.gz", "car-rental-data-2026-08-22.sql"]);
      expect(fs.existsSync(fresh)).toBe(true);
      expect(fs.existsSync(other)).toBe(true);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("does nothing for a directory that does not exist", () => {
    expect(sweepStaleBackupTemp(path.join(os.tmpdir(), "lvs-does-not-exist-xyz"))).toEqual([]);
  });
});
