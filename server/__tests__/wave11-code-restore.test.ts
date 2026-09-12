/**
 * WAVE 11 — BUG-069 (HIGH): the code restore is no longer an extract over the
 * running application.
 *
 * Phase 36 replayed the route's own filter against the documented payload: it
 * rejected **zero** entries and wrote `dist/server/index.js`, after which the
 * handler called `process.exit(0)` so the new code would be the code that came
 * back up. An authenticated upload turning into running code is the whole bug.
 *
 * The rules asserted here:
 *   1. The route is OFF unless the deployment explicitly turns it on
 *      (`ALLOW_CODE_RESTORE=true`). The owner deploys through Coolify and has
 *      not said the button must stay, so "off" is the default — he can still
 *      switch it on.
 *   2. When it IS on, the archive goes through the same verified, contained
 *      extraction the file restore uses, into a STAGING directory. Nothing is
 *      ever written over `process.cwd()`.
 *   3. No `process.exit` anywhere on the path.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import * as tar from "tar";

const TEMP_BACKUPS = fs.mkdtempSync(path.join(os.tmpdir(), "lvs-coderestore-backups-"));
const TEMP_UPLOADS = fs.mkdtempSync(path.join(os.tmpdir(), "lvs-coderestore-uploads-"));
const TEMP_STAGING = fs.mkdtempSync(path.join(os.tmpdir(), "lvs-coderestore-staging-"));
process.env.BACKUP_PATH = TEMP_BACKUPS;
process.env.UPLOADS_DIR = TEMP_UPLOADS;
process.env.LVS_TEMP_DIR = TEMP_STAGING;

const { agentFor, cleanupFixtureUsers } = await import("./helpers/app");
const {
  inspectCodeArchive,
  extractCodeArchive,
  codeRestoreEnabled,
  makeCodeStagingDir,
} = await import("../restoreSafety");

type Agent = Awaited<ReturnType<typeof agentFor>>;

const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "lvs-coderestore-work-"));

function makeArchive(name: string, entries: Array<{ name: string; body: string }>): string {
  const staging = fs.mkdtempSync(path.join(workDir, "stage-"));
  for (const entry of entries) {
    const full = path.join(staging, entry.name.replace(/\//g, path.sep));
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, entry.body);
  }
  const archivePath = path.join(workDir, name);
  tar.c(
    { file: archivePath, cwd: staging, gzip: true, sync: true, portable: true },
    entries.map((e) => e.name.split("/")[0]).filter((v, i, a) => a.indexOf(v) === i),
  );
  return archivePath;
}

describe("WAVE 11 / BUG-069 — the code restore", () => {
  let admin: Agent;

  beforeAll(async () => {
    admin = await agentFor("admin");
  }, 60_000);

  afterAll(async () => {
    await cleanupFixtureUsers();
    delete process.env.ALLOW_CODE_RESTORE;
    delete process.env.BACKUP_PATH;
    delete process.env.UPLOADS_DIR;
    delete process.env.LVS_TEMP_DIR;
    for (const dir of [TEMP_BACKUPS, TEMP_UPLOADS, TEMP_STAGING, workDir]) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  // ------------------------------------------------------------ the flag
  it("is disabled unless the deployment sets ALLOW_CODE_RESTORE=true", () => {
    delete process.env.ALLOW_CODE_RESTORE;
    expect(codeRestoreEnabled()).toBe(false);
    process.env.ALLOW_CODE_RESTORE = "false";
    expect(codeRestoreEnabled()).toBe(false);
    process.env.ALLOW_CODE_RESTORE = "true";
    expect(codeRestoreEnabled()).toBe(true);
    delete process.env.ALLOW_CODE_RESTORE;
  });

  it("refuses the upload outright while the flag is off, and writes nothing", async () => {
    delete process.env.ALLOW_CODE_RESTORE;
    const archive = makeArchive("code-off.tar.gz", [
      { name: "dist/server/WAVE11-canary.js", body: "console.log('pwned')" },
    ]);
    const before = fs.readdirSync(TEMP_STAGING);

    const res = await admin
      .post("/api/backups/restore-code")
      .field("confirm", "code-off.tar.gz")
      .attach("backup", fs.readFileSync(archive), "code-off.tar.gz");

    expect(res.status).toBe(503);
    expect(JSON.stringify(res.body)).toMatch(/ALLOW_CODE_RESTORE/);
    // Nothing extracted, nowhere.
    expect(fs.readdirSync(TEMP_STAGING)).toEqual(before);
    expect(fs.existsSync(path.join(process.cwd(), "WAVE11-canary.json"))).toBe(false);
  });

  // ------------------------------------------------- containment when it is on
  it("extracts into a staging directory, never over the application (flag on)", async () => {
    process.env.ALLOW_CODE_RESTORE = "true";
    try {
      const archive = makeArchive("code-on.tar.gz", [
        { name: "dist/server/WAVE11-canary.js", body: "MARKER-WAVE11" },
        { name: "WAVE11-canary.json", body: "{}" },
      ]);

      const res = await admin
        .post("/api/backups/restore-code")
        .field("confirm", "code-on.tar.gz")
        .attach("backup", fs.readFileSync(archive), "code-on.tar.gz");

      expect(res.status).toBe(200);
      const staged = String(res.body.stagingPath || "");
      expect(staged).toBeTruthy();
      expect(path.resolve(staged).startsWith(path.resolve(TEMP_STAGING))).toBe(true);
      expect(fs.readFileSync(path.join(staged, "dist", "server", "WAVE11-canary.js"), "utf8")).toBe("MARKER-WAVE11");
      // The running application is untouched. (The payload is named
      // WAVE11-canary on purpose: while this test was red, the unfixed route
      // really did extract over process.cwd() and overwrote this repository's
      // own package.json with the archive's `{}`.)
      expect(fs.existsSync(path.join(process.cwd(), "WAVE11-canary.json"))).toBe(false);
      expect(fs.existsSync(path.join(process.cwd(), "dist", "server", "WAVE11-canary.js"))).toBe(false);
      expect(res.body.restarted).toBeUndefined();
    } finally {
      delete process.env.ALLOW_CODE_RESTORE;
    }
  });

  it("refuses an archive with a traversal or absolute entry (flag on)", async () => {
    process.env.ALLOW_CODE_RESTORE = "true";
    try {
      const staging = fs.mkdtempSync(path.join(workDir, "evil-"));
      fs.mkdirSync(path.join(staging, "dist"), { recursive: true });
      fs.writeFileSync(path.join(staging, "dist", "ok.js"), "ok");
      const archivePath = path.join(workDir, "code-evil.tar.gz");
      // tar writes the literal "../escape.js" member when asked for it.
      fs.writeFileSync(path.join(staging, "escape.js"), "EVIL");
      tar.c(
        { file: archivePath, cwd: path.join(staging, "dist"), gzip: true, sync: true, portable: true, preservePaths: true },
        ["../escape.js", "ok.js"],
      );

      const inspection = await inspectCodeArchive(archivePath);
      expect(inspection.ok).toBe(false);
      expect(inspection.rejected.join(" ")).toContain("escape.js");

      const res = await admin
        .post("/api/backups/restore-code")
        .field("confirm", "code-evil.tar.gz")
        .attach("backup", fs.readFileSync(archivePath), "code-evil.tar.gz");
      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body)).toMatch(/outside/i);
    } finally {
      delete process.env.ALLOW_CODE_RESTORE;
    }
  });

  // ------------------------------------------------------ the extractor itself
  it("the extractor cannot write outside its target even when called directly", async () => {
    const staging = fs.mkdtempSync(path.join(workDir, "direct-"));
    fs.mkdirSync(path.join(staging, "inner"), { recursive: true });
    fs.writeFileSync(path.join(staging, "outside.txt"), "EVIL");
    const archivePath = path.join(workDir, "code-direct.tar.gz");
    tar.c(
      { file: archivePath, cwd: path.join(staging, "inner"), gzip: true, sync: true, portable: true, preservePaths: true },
      ["../outside.txt"],
    );

    const target = makeCodeStagingDir();
    const escaped = path.resolve(target, "..", "outside.txt");
    if (fs.existsSync(escaped)) fs.unlinkSync(escaped);
    await extractCodeArchive(archivePath, target).catch(() => undefined);
    expect(fs.existsSync(escaped)).toBe(false);
    fs.rmSync(target, { recursive: true, force: true });
  });

  // --------------------------------------------------------------- no exit
  it("the route no longer calls process.exit", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "server", "routes", "backups.ts"), "utf8");
    const restoreCode = source.slice(source.indexOf('"/api/backups/restore-code"'));
    const nextRoute = restoreCode.indexOf('app.get("/api/backups/download-files"');
    const body = nextRoute > 0 ? restoreCode.slice(0, nextRoute) : restoreCode;
    expect(body).not.toMatch(/process\.exit/);
    expect(body).not.toMatch(/cwd:\s*process\.cwd\(\)/);
  });
});
