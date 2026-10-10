/**
 * Streams a `tar -czf -` archive straight to the HTTP response.
 *
 * Why not "build a file, then res.download" (A-19-1, A-19-2):
 *  - the archive was written into <cwd>/temp, inside the tree it archives, and a
 *    failure left a half file behind;
 *  - the first byte only left the server after the whole archive was built
 *    (17 s for 448 MB), which a proxy with a default timeout can cut off.
 * Streaming has no file to leave behind and sends the first byte at once.
 *
 * The first output is held back briefly (until HOLD_BYTES, HOLD_MS or the end),
 * because tar writes the gzip header before it notices that, say, the directory
 * is missing. A failure inside that window is a fixed JSON 500 (message + code,
 * never tar's own text, which carries the command line and absolute paths; that
 * goes to the server log). A failure after the stream was committed destroys the
 * connection, so the browser reports a failed download instead of saving a
 * short "good" archive. The window is short enough that a proxy still sees the
 * first byte within a second.
 */
import { spawn as realSpawn, type ChildProcess } from "child_process";
import fs from "fs";
import path from "path";
import type { Response } from "express";

/** Output held back before the response is committed; whichever limit comes first. */
const HOLD_BYTES = 64 * 1024;
const HOLD_MS = 1000;

/**
 * Path argument for tar. A Windows path with backslashes is mangled by GNU tar
 * (the one in Git for Windows reads \ as an escape and a drive colon as a host),
 * and a missing directory then went unnoticed; forward slashes work in both GNU
 * tar and bsdtar. A no-op on Linux, where production runs.
 */
export function tarPath(p: string): string {
  return process.platform === "win32" ? p.split(String.fromCharCode(92)).join("/") : p;
}

export interface StreamTarOptions {
  filename: string;
  /** Complete argument list for `tar`, ending in `-czf -` style output to stdout. */
  args: string[];
  cwd?: string;
  /** What the client gets when tar fails before sending anything. */
  failure?: { error: string; code: string };
  /** Test seam. */
  spawnImpl?: typeof realSpawn;
}

export function streamTarGz(res: Response, opts: StreamTarOptions): Promise<void> {
  const failure = opts.failure ?? { error: "Failed to create the archive", code: "BACKUP_DOWNLOAD_FAILED" };
  const spawnImpl = opts.spawnImpl ?? realSpawn;

  return new Promise<void>((resolve) => {
    let child: ChildProcess;
    try {
      child = spawnImpl("tar", opts.args, { cwd: opts.cwd, stdio: ["ignore", "pipe", "pipe"] });
    } catch (error) {
      console.error(`[backup] ${failure.code}: tar could not be started:`, error);
      res.status(500).json(failure);
      return resolve();
    }

    let started = false;
    let finished = false;
    let held: Buffer[] = [];
    let heldBytes = 0;
    let holdTimer: NodeJS.Timeout | undefined;
    let stdoutEnded = false;
    let exitCode: number | null | undefined;
    let stderr = "";

    const finish = () => {
      finished = true;
      if (holdTimer) clearTimeout(holdTimer);
      resolve();
    };
    const fail = (reason: string) => {
      if (finished) return;
      console.error(`[backup] ${failure.code}: ${reason}${stderr ? ` | tar said: ${stderr.trim().slice(0, 500)}` : ""}`);
      try { child.kill(); } catch { /* already gone */ }
      if (!started && !res.headersSent) {
        res.status(500).json(failure);
      } else {
        res.destroy();
      }
      finish();
    };
    const send = (chunk: Buffer) => {
      if (!res.write(chunk)) {
        child.stdout?.pause();
        res.once("drain", () => child.stdout?.resume());
      }
    };
    /** Commit the response: headers, then everything held back so far. */
    const begin = () => {
      if (started) return;
      started = true;
      if (holdTimer) clearTimeout(holdTimer);
      res.setHeader("Content-Type", "application/gzip");
      res.setHeader("Content-Disposition", `attachment; filename="${opts.filename}"`);
      res.setHeader("Cache-Control", "no-store");
      for (const chunk of held) send(chunk);
      held = [];
    };
    const maybeFinish = () => {
      if (finished || exitCode === undefined || !stdoutEnded) return;
      if (exitCode !== 0) return fail(`tar exited with code ${exitCode}`);
      begin();
      res.end();
      finish();
    };

    child.stderr?.on("data", (chunk) => {
      if (stderr.length < 2000) stderr += String(chunk);
    });
    child.stdout?.on("data", (chunk: Buffer) => {
      if (finished) return;
      if (started) return send(chunk);
      held.push(chunk);
      heldBytes += chunk.length;
      if (heldBytes >= HOLD_BYTES) begin();
      else if (!holdTimer) holdTimer = setTimeout(begin, HOLD_MS);
    });
    child.stdout?.on("end", () => { stdoutEnded = true; maybeFinish(); });
    child.on("error", (error) => fail(error.message));
    child.on("close", (code) => { exitCode = code ?? -1; maybeFinish(); });

    // The browser went away mid-download: stop producing the archive.
    res.on("close", () => {
      if (finished) return;
      try { child.kill(); } catch { /* already gone */ }
      finish();
    });
  });
}

/**
 * Earlier versions wrote car-rental-*.sql / *.tar.gz into <cwd>/temp and left
 * them behind when pg_dump or tar failed (0-byte dumps, a 26 MB half archive).
 * Removes those leftovers: zero-byte ones, and anything older than a day. Never
 * touches a file that does not look like one of ours. Returns the names removed.
 */
export function sweepStaleBackupTemp(dir: string, maxAgeMs = 24 * 3600 * 1000): string[] {
  const removed: string[] = [];
  let names: string[];
  try {
    names = fs.readdirSync(dir);
  } catch {
    return removed;
  }
  for (const name of names) {
    if (!/^car-rental-(data|code|files)-.*\.(sql|tar\.gz)$/.test(name)) continue;
    const full = path.join(dir, name);
    try {
      const stat = fs.statSync(full);
      if (!stat.isFile()) continue;
      if (stat.size === 0 || Date.now() - stat.mtimeMs > maxAgeMs) {
        fs.unlinkSync(full);
        removed.push(name);
      }
    } catch {
      /* in use or already gone: leave it */
    }
  }
  return removed;
}
