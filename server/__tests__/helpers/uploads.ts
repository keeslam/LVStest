/**
 * A temporary UPLOADS_DIR for the file-path tests (remediation plan §8.3).
 *
 * `getUploadsDir()` reads `process.env.UPLOADS_DIR` on EVERY call rather than
 * caching it at import time, which is what makes this possible — and is
 * exactly why FIX-B routes every path through it.
 *
 * Two rules from the plan, both load-bearing:
 *
 *  1. Never set `UPLOADS_DIR` globally in `setup.ts`. That would hide the
 *     `process.cwd()` joins instead of exposing them; each path test opts in.
 *  2. Always assert the **bytes** on a round trip, not just the status code.
 *     BUG-026 answered 200 with the SPA's index.html; a status assertion alone
 *     would have passed.
 *
 * `registerRoutes()` reads the uploads directory once, at build time, to
 * create the multer destinations — so a test file that needs uploads to land
 * in the temp tree must call `useTempUploadsDir()` at module scope, before
 * anything builds the app.
 */
import fs from "fs";
import os from "os";
import path from "path";

/** Absolute path of the repository's own uploads directory — never written to by a test. */
export const REPO_UPLOADS_DIR = path.join(process.cwd(), "uploads");

/**
 * Creates a temp directory outside the repository, points `UPLOADS_DIR` at it
 * for the rest of the process, and returns it. Call at module scope.
 *
 * Deliberately does NOT restore the previous value on its own: the app object
 * that `makeApp()` caches was built against this directory, so putting the old
 * value back mid-file would re-create the very split this wave removes.
 * `removeTempUploadsDir()` is the explicit teardown.
 */
export function useTempUploadsDir(label = "lvs-uploads-"): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), label));
  process.env.UPLOADS_DIR = dir;
  return dir;
}

/** Deletes a directory made by `useTempUploadsDir()`. Safe to call twice. */
export function removeTempUploadsDir(dir: string): void {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    /* the OS will reap it */
  }
}

/**
 * Scoped variant from the plan, for code that resolves paths per call (helpers
 * and services) rather than at app-build time.
 */
export async function withTempUploads<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lvs-uploads-"));
  const prev = process.env.UPLOADS_DIR;
  process.env.UPLOADS_DIR = dir;
  try {
    return await fn(dir);
  } finally {
    if (prev === undefined) delete process.env.UPLOADS_DIR;
    else process.env.UPLOADS_DIR = prev;
    removeTempUploadsDir(dir);
  }
}

/** Every regular file under `dir`, as paths relative to it, with forward slashes. */
export function listFilesRecursive(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  const walk = (current: string) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else out.push(path.relative(dir, full).split(path.sep).join("/"));
    }
  };
  walk(dir);
  return out.sort();
}

/**
 * A snapshot of the repository's own uploads directory, so a test can prove
 * that nothing was written outside the configured root. The repo's `uploads/`
 * is off limits to this suite — see the wave rules.
 */
export function snapshotRepoUploads(): string[] {
  return listFilesRecursive(REPO_UPLOADS_DIR);
}

/** The smallest byte sequence Node's PDF sniffers and the upload validator accept. */
export function tinyPdf(marker: string): Buffer {
  const body = `%PDF-1.4\n% ${marker}\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n` +
    `2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n` +
    `3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\n` +
    `trailer<</Root 1 0 R>>\n%%EOF\n`;
  return Buffer.from(body, "utf8");
}
