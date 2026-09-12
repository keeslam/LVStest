/**
 * FIX-B, the negative half — a source scan that keeps the uploads directory at
 * exactly one owner.
 *
 * The wave started from 79 hard `path.join(process.cwd(), 'uploads')` joins
 * against 21 uses of `shared/paths.ts getUploadsDir()`. Fixing them once is
 * worth little if the next feature adds an eightieth: the failure mode is
 * silent (a 200 with the wrong body, a 403 on every licence, a 404 forever),
 * shows up only when `UPLOADS_DIR` is set, and so never appears in local
 * development. This test is the ratchet.
 *
 * It is a static scan, deliberately: the runtime tests in
 * fix-b-uploads-dir.test.ts prove the behaviour, this one proves there is no
 * second definition of where uploads live.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const ROOT = process.cwd();

/** Directories that are scanned. Tests and build output are excluded. */
const SCAN_DIRS = ["server", "shared"];
const SKIP_DIR_NAMES = new Set(["node_modules", "__tests__", "dist", "build", ".git"]);

/**
 * The one file allowed to say `process.cwd()` and `'uploads'` in the same
 * breath: it is the definition of the default. Everything else must ask it.
 */
const PATH_OWNER = path.join("shared", "paths.ts");

/**
 * The documented legacy fallback (phase 20 §2.5 point 8): `document-paths.ts`
 * still tries the cwd-relative candidate when resolving a STORED path, because
 * that is the only reason rows written by the old code are still readable. It
 * is a read-side fallback inside the owner's own helper, and it is guarded by
 * a containment check — not a second definition of the root. It must stay
 * until those rows are migrated, which is a production-data action.
 */
const ALLOWED_LEGACY_FALLBACK = path.join("server", "services", "document-paths.ts");

function sourceFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (SKIP_DIR_NAMES.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) out.push(full);
    }
  };
  for (const d of SCAN_DIRS) walk(path.join(ROOT, d));
  return out;
}

/** Strips // and /* *​/ comments so a comment quoting the old code is not a hit. */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "")
    .replace(/([^:])\/\/.*$/gm, "$1");
}

describe("FIX-B — the uploads directory has no second definition", () => {
  const files = sourceFiles();

  it("scans a meaningful number of source files", () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it("no file outside shared/paths.ts joins process.cwd() onto 'uploads'", () => {
    // Matches path.join(process.cwd(), 'uploads'…), path.resolve(process.cwd(),
    // "uploads"…) and the template-literal `${process.cwd()}/uploads` shape.
    const patterns = [
      /path\s*\.\s*(?:join|resolve)\s*\(\s*process\s*\.\s*cwd\s*\(\s*\)\s*,\s*['"`]uploads/,
      /\bjoin\s*\(\s*process\s*\.\s*cwd\s*\(\s*\)\s*,\s*['"`]uploads/,
      /process\s*\.\s*cwd\s*\(\s*\)\s*\}[\\/]+uploads/,
    ];
    const offenders: string[] = [];
    for (const file of files) {
      const rel = path.relative(ROOT, file);
      if (rel === PATH_OWNER) continue;
      const body = stripComments(fs.readFileSync(file, "utf8"));
      for (const line of body.split("\n")) {
        if (patterns.some((p) => p.test(line))) offenders.push(`${rel}: ${line.trim()}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("only the documented legacy read fallback joins process.cwd() onto a stored path column", () => {
    // `path.join(process.cwd(), <something>Path)` is the exact shape that made
    // BUG-012, BUG-070 and BUG-169 possible: an unbounded filesystem operation
    // built from a database column.
    const pattern =
      /path\s*\.\s*(?:join|resolve)\s*\(\s*process\s*\.\s*cwd\s*\(\s*\)\s*,\s*[A-Za-z_$][\w$.()\s]*(?:[Pp]ath|filePath|filepath)\b/;
    const offenders: string[] = [];
    for (const file of files) {
      const rel = path.relative(ROOT, file);
      if (rel === ALLOWED_LEGACY_FALLBACK) continue;
      const body = stripComments(fs.readFileSync(file, "utf8"));
      for (const line of body.split("\n")) {
        if (pattern.test(line)) offenders.push(`${rel}: ${line.trim()}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("shared/paths.ts is still the only place the default uploads root is spelled out", () => {
    const owner = fs.readFileSync(path.join(ROOT, PATH_OWNER), "utf8");
    expect(owner).toContain("process.env.UPLOADS_DIR");
    // And it reads the environment per call, which is what makes the temp-dir
    // tests — and a redeploy that changes the mount — work at all.
    expect(owner).not.toMatch(/const\s+UPLOADS_DIR\s*=\s*process\.env\.UPLOADS_DIR/);
  });
});
