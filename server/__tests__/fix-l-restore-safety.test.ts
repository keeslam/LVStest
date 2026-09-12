/**
 * FIX-L — a restore that fails loudly.
 *
 * BUG-197 (CRITICAL) is the one that matters: `psql <url> -f <file>` runs
 * without ON_ERROR_STOP and without a transaction, so psql carries on past
 * every error and still exits 0. A dump whose download was cut in half, or
 * whose COPY block holds one bad row, therefore returned
 * 200 "Database restore completed successfully" while leaving users, vehicles
 * and reservations empty and every sequence reset to 1 — with nobody able to
 * log in to start a recovery.
 *
 * Also closes BUG-199 (a dump with \connect restores into, and first drops, a
 * different database), BUG-206 and BUG-207 (temp files leaked into os.tmpdir()
 * and a 20 MB plaintext dump left on the backup volume by a `require` inside
 * an ES module), BUG-208 (restore/complete was not atomic and reported a
 * half-applied restore as a flat failure), BUG-219 (external gunzip/tar),
 * BUG-220 (ghost `running` rows survive a restore) and BUG-221 (six status and
 * confirmation gaps).
 *
 * SAFETY: every end-to-end restore runs against a database this file created
 * itself, named lvs_scratch_<pid>_<n>, and the helper refuses any other name.
 * That guard is the first assertion below. Nothing here ever restores into
 * lvs_fixtest, let alone anywhere else.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import * as tar from "tar";
import zlib from "zlib";

import {
  inspectDump,
  dumpTargetsForeignDatabase,
  databaseNameFromUrl,
  inspectFilesArchive,
  extractFilesArchive,
  cleanupStaleTempFiles,
  firstErrorLine,
  isGzip,
  DUMP_END_MARKER,
} from "../restoreSafety";
import {
  isScratchDatabaseName,
  scratchDatabaseName,
  withScratchDatabase,
  queryScratch,
  countRows,
} from "./helpers/scratchDb";
import { ensurePgTools } from "./helpers/pgTools";
import {
  goodDump, copyErrorDump, truncatedDump, tinyDump, foreignDatabaseDump,
  shellEscapeDump, dumpWithSuspiciousData, gzipped, corruptGzip,
} from "./fixtures/backup-dumps";

const PG_TOOLS = ensurePgTools();

let workDir: string;
const write = (name: string, data: string | Buffer): string => {
  const target = path.join(workDir, name);
  fs.writeFileSync(target, data);
  return target;
};

/**
 * Wave 9: os.tmpdir() is shared with every other process on this machine —
 * including another instance of this very application, which is exactly what
 * made "nothing was left in the temp directory" fail once for a reason that
 * had nothing to do with the code under test. `LVS_TEMP_DIR` points the
 * backup and restore code at a directory this file owns, so the assertion is
 * about our own leftovers and nobody else's.
 */
let tempRoot = "";
let previousTempDir: string | undefined;

beforeAll(() => {
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), "lvs-fixl-"));
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "lvs-fixl-temp-"));
  previousTempDir = process.env.LVS_TEMP_DIR;
  process.env.LVS_TEMP_DIR = tempRoot;
});
afterAll(() => {
  if (previousTempDir === undefined) delete process.env.LVS_TEMP_DIR;
  else process.env.LVS_TEMP_DIR = previousTempDir;
  fs.rmSync(workDir, { recursive: true, force: true });
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
describe("FIX-L — the scratch-database guard", () => {
  it("is asserted before anything else in this file runs", () => {
    // The rail that keeps every restore in this file away from a database
    // anyone cares about.
    expect(isScratchDatabaseName(scratchDatabaseName())).toBe(true);
    for (const name of ["lvs_fixtest", "lvs_audit", "postgres", "", "lvs_scratch", "lvs_scratchy_1_1"]) {
      expect({ name, scratch: isScratchDatabaseName(name) }).toEqual({ name, scratch: false });
    }
  });
});

// ---------------------------------------------------------------------------
describe("FIX-L — an archive is verified before the database is touched", () => {
  it("accepts a complete dump", async () => {
    const result = await inspectDump(write("good.sql", goodDump()));
    expect(result.ok).toBe(true);
    expect(result.complete).toBe(true);
    expect(result.forbidden).toEqual([]);
    expect(result.targetDatabase).toBeNull();
  });

  it("accepts the same dump gzipped", async () => {
    const file = write("good.sql.gz", gzipped(goodDump()));
    expect(isGzip(file)).toBe(true);
    const result = await inspectDump(file);
    expect(result.ok).toBe(true);
    expect(result.bytes).toBeGreaterThan(1024);
  });

  it("BUG-197: refuses a dump truncated halfway — the shape a broken download has", async () => {
    const result = await inspectDump(write("half.sql", truncatedDump()));
    expect(result.ok).toBe(false);
    expect(result.complete).toBe(false);
    // The old check read the first 4 KB and looked for something dump-shaped,
    // which this file passes with flying colours.
    expect(result.reason).toContain(DUMP_END_MARKER);
  });

  it("BUG-197: refuses a dump that is too small to be one", async () => {
    const result = await inspectDump(write("tiny.sql", tinyDump()));
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/only \d+ bytes/);
  });

  it("BUG-197: refuses a corrupt gzip instead of dropping tables and then failing", async () => {
    const result = await inspectDump(write("corrupt.sql.gz", corruptGzip()));
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/corrupt or truncated/i);
  });

  it("BUG-199: refuses a dump that targets a different database, and names it", async () => {
    const result = await inspectDump(write("foreign.sql", foreignDatabaseDump("some_other_database")));
    expect(result.ok).toBe(false);
    expect(result.targetDatabase).toBe("some_other_database");
    expect(result.forbidden).toEqual(expect.arrayContaining(["\\connect", "CREATE DATABASE", "DROP DATABASE"]));

    const message = dumpTargetsForeignDatabase(result, "postgresql://u:p@localhost:5432/lvs_fixtest");
    expect(message).toContain("some_other_database");
    expect(message).toContain("lvs_fixtest");
    expect(message).toContain("Nothing was changed");
  });

  it("refuses a dump that shells out", async () => {
    const result = await inspectDump(write("shell.sql", shellEscapeDump()));
    expect(result.ok).toBe(false);
    expect(result.forbidden).toEqual(expect.arrayContaining(["\\! (shell)", "COPY … FROM PROGRAM"]));
  });

  it("does NOT refuse a dump whose COPY data merely looks like a directive", async () => {
    // Within a COPY block every line is a row. A guard that cannot tell the
    // difference would refuse ordinary backups, which is worse than useless.
    const result = await inspectDump(write("suspicious-data.sql", dumpWithSuspiciousData()));
    expect(result.ok).toBe(true);
    expect(result.forbidden).toEqual([]);
  });

  it("refuses a file that is not there at all", async () => {
    const result = await inspectDump(path.join(workDir, "does-not-exist.sql"));
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/missing/i);
  });

  it("databaseNameFromUrl reads the target out of a connection string", () => {
    expect(databaseNameFromUrl("postgresql://u:p@localhost:5432/lvs_fixtest")).toBe("lvs_fixtest");
    expect(databaseNameFromUrl("nonsense")).toBeNull();
  });

  it("firstErrorLine surfaces psql's own message", () => {
    const stderr = [
      "psql:restore.sql:12: NOTICE:  table does not exist, skipping",
      'psql:restore.sql:41: ERROR:  invalid input syntax for type integer: "NOTANINT"',
      "psql:restore.sql:41: CONTEXT:  COPY fixt_vehicles, line 1",
    ].join("\n");
    expect(firstErrorLine(stderr)).toContain("invalid input syntax");
    expect(firstErrorLine("all quiet")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
describe("FIX-L — file archives cannot write outside the uploads directory", () => {
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

  it("accepts and extracts a normal uploads archive", async () => {
    const archive = makeArchive("files-good.tar.gz", [
      { name: "uploads/contracts/AA11BB/one.pdf", body: "ONE" },
      { name: "uploads/drivers/licence.jpg", body: "TWO" },
    ]);
    const inspection = await inspectFilesArchive(archive);
    expect(inspection.ok).toBe(true);
    expect(inspection.entries).toBe(2);

    const target = fs.mkdtempSync(path.join(workDir, "target-"));
    const written = await extractFilesArchive(archive, target);
    expect(written).toBe(2);
    // The `uploads/` prefix is stripped: files land IN the uploads directory,
    // not in an `uploads` folder inside it.
    expect(fs.readFileSync(path.join(target, "contracts", "AA11BB", "one.pdf"), "utf8")).toBe("ONE");
    expect(fs.readFileSync(path.join(target, "drivers", "licence.jpg"), "utf8")).toBe("TWO");
    expect(fs.existsSync(path.join(target, "uploads"))).toBe(false);
  });

  it("BUG-069/BUG-198: refuses an archive with a ../ entry, and writes nothing", async () => {
    // node-tar will not create an archive containing '..' through its normal
    // API, so the entry is forged into the tar header directly.
    const archive = path.join(workDir, "files-evil.tar.gz");
    writeForgedTarGz(archive, [
      { name: "uploads/../../evil.txt", body: "OWNED" },
      { name: "uploads/ok.txt", body: "fine" },
    ]);

    const inspection = await inspectFilesArchive(archive);
    expect(inspection.ok).toBe(false);
    expect(inspection.reason).toMatch(/outside the uploads directory/i);
    expect(inspection.rejected.join(" ")).toContain("..");

    // And even if something called the extractor anyway, the filter holds.
    const target = fs.mkdtempSync(path.join(workDir, "target-evil-"));
    const outside = path.resolve(target, "..", "..", "evil.txt");
    if (fs.existsSync(outside)) fs.unlinkSync(outside);
    await extractFilesArchive(archive, target).catch(() => undefined);
    expect(fs.existsSync(outside)).toBe(false);
    expect(fs.existsSync(path.join(target, "..", "..", "evil.txt"))).toBe(false);
  });

  it("refuses an archive whose entries are not under uploads/", async () => {
    const archive = makeArchive("files-wrongroot.tar.gz", [
      { name: "server/index.ts", body: "process.exit(0)" },
    ]);
    const inspection = await inspectFilesArchive(archive);
    expect(inspection.ok).toBe(false);
    expect(inspection.rejected).toContain("server/index.ts");
  });

  it("refuses an empty archive", async () => {
    const staging = fs.mkdtempSync(path.join(workDir, "empty-"));
    fs.mkdirSync(path.join(staging, "uploads"));
    const archive = path.join(workDir, "files-empty.tar.gz");
    tar.c({ file: archive, cwd: staging, gzip: true, sync: true }, ["uploads"]);
    const inspection = await inspectFilesArchive(archive);
    expect(inspection.ok).toBe(false);
    expect(inspection.reason).toMatch(/no files/i);
  });

  it("refuses a corrupt archive", async () => {
    const archive = write("files-corrupt.tar.gz", corruptGzip());
    const inspection = await inspectFilesArchive(archive);
    expect(inspection.ok).toBe(false);
    expect(inspection.reason).toMatch(/corrupt or truncated/i);
  });
});

// ---------------------------------------------------------------------------
describe("FIX-L — temporary files and external tools", () => {
  it("BUG-206: stale db-backup/files-backup temp files are swept, fresh ones are kept", () => {
    const stale = path.join(tempRoot, `db-backup-FIXT-${process.pid}-stale.sql.gz`);
    const fresh = path.join(tempRoot, `db-backup-FIXT-${process.pid}-fresh.sql.gz`);
    const unrelated = path.join(tempRoot, `something-else-FIXT-${process.pid}.txt`);
    fs.writeFileSync(stale, "x");
    fs.writeFileSync(fresh, "x");
    fs.writeFileSync(unrelated, "x");
    const old = Date.now() - 48 * 60 * 60 * 1000;
    fs.utimesSync(stale, old / 1000, old / 1000);
    fs.utimesSync(unrelated, old / 1000, old / 1000);

    try {
      cleanupStaleTempFiles();
      expect(fs.existsSync(stale)).toBe(false);
      expect(fs.existsSync(fresh)).toBe(true);
      // Only the backup service's own temp files, never anything else in tmp.
      expect(fs.existsSync(unrelated)).toBe(true);
    } finally {
      for (const f of [stale, fresh, unrelated]) {
        try { fs.unlinkSync(f); } catch { /* already gone */ }
      }
    }
  });

  it("BUG-207: there is no `require(` anywhere in the backup or restore path", () => {
    // The original bug was `require('fs').unlinkSync` in an ES module: it threw
    // ReferenceError, the catch swallowed it, and a 20 MB plaintext dump stayed
    // on the backup volume for ever.
    for (const file of ["server/backupService.ts", "server/restoreSafety.ts", "server/routes/backups.ts"]) {
      const body = fs.readFileSync(path.join(process.cwd(), file), "utf8");
      const offenders = body
        .split("\n")
        .filter((line) => /(^|[^.\w"'`])require\s*\(/.test(line) && !line.trim().startsWith("*") && !line.trim().startsWith("//"));
      expect({ file, offenders }).toEqual({ file, offenders: [] });
    }
  });

  it("BUG-219: the restore path no longer spawns gunzip or tar", () => {
    // Comments are stripped first: the code that replaced these spawns
    // documents what it replaced, and a comment quoting the old call must not
    // read as the old call still being there.
    const stripComments = (source: string) =>
      source
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^[ \t]*\/\/.*$/gm, "")
        .replace(/([^:])\/\/.*$/gm, "$1");
    for (const file of ["server/backupService.ts", "server/restoreSafety.ts", "server/routes/backups.ts"]) {
      const body = stripComments(fs.readFileSync(path.join(process.cwd(), file), "utf8"));
      expect({ file, gunzip: /spawn\(\s*['"]gunzip['"]/.test(body) }).toEqual({ file, gunzip: false });
      expect({ file, tarSpawn: /spawn\(\s*['"]tar['"]/.test(body) }).toEqual({ file, tarSpawn: false });
      // The one remaining `tar -czf` is download-code/download-files, which
      // create archives rather than extract them; extraction is what BUG-069
      // and BUG-198 were about and it is all through the npm package now.
      expect({ file, tarExtract: /exec\w*\(\s*`tar -xzf/.test(body) }).toEqual({ file, tarExtract: false });
    }
  });
});

// ---------------------------------------------------------------------------
// End-to-end: a real psql restore into a database this file creates and drops.
// ---------------------------------------------------------------------------
const e2e = PG_TOOLS ? describe : describe.skip;
if (!PG_TOOLS) {
  console.warn(
    "FIX-L: psql/pg_dump were not found on this host (and not under any known " +
    "PostgreSQL install directory), so the end-to-end restore group is skipped. " +
    "Set PG_BIN_DIR to the directory holding them to run it.",
  );
}

e2e("FIX-L — a real restore into a scratch database", () => {
  const SEED_VEHICLES = 7;
  const SEED_USERS = 5;

  /** Creates the scratch database and fills it with rows a bad restore would destroy. */
  async function withSeededScratch<T>(fn: (url: string, name: string) => Promise<T>): Promise<T> {
    return withScratchDatabase(async (url, name) => {
      await queryScratch(url, "CREATE TABLE public.fixt_vehicles (id integer NOT NULL, plate text NOT NULL)");
      await queryScratch(url, "CREATE TABLE public.fixt_users (id integer NOT NULL, username text NOT NULL)");
      for (let i = 1; i <= SEED_VEHICLES; i++) {
        await queryScratch(url, "INSERT INTO public.fixt_vehicles VALUES ($1, $2)", [i, `SEED-${i}`]);
      }
      for (let i = 1; i <= SEED_USERS; i++) {
        await queryScratch(url, "INSERT INTO public.fixt_users VALUES ($1, $2)", [i, `seed-user-${i}`]);
      }
      return fn(url, name);
    });
  }

  it("the good archive restores, and the row counts match the dump", async () => {
    const { runPsqlRestore } = await import("../restoreSafety");
    await withSeededScratch(async (url) => {
      const file = write("e2e-good.sql", goodDump(3, 2));
      const inspection = await inspectDump(file);
      expect(inspection.ok).toBe(true);

      await runPsqlRestore(url, file);

      expect(await countRows(url, "fixt_vehicles")).toBe(3);
      expect(await countRows(url, "fixt_users")).toBe(2);
    });
  }, 60_000);

  it("BUG-197: a dump with one bad COPY row fails LOUDLY and leaves every row untouched", async () => {
    const { runPsqlRestore, RestoreFailedError } = await import("../restoreSafety");
    await withSeededScratch(async (url) => {
      const file = write("e2e-copyerror.sql", copyErrorDump());

      // It passes verification — it is a complete, well-formed dump. The
      // failure has to come from psql, which is the whole point: without
      // ON_ERROR_STOP psql skipped the bad row, dropped and recreated the
      // table empty, and exited 0.
      expect((await inspectDump(file)).ok).toBe(true);

      let thrown: unknown = null;
      try {
        await runPsqlRestore(url, file);
      } catch (error) {
        thrown = error;
      }

      expect(thrown).toBeInstanceOf(RestoreFailedError);
      const message = (thrown as Error).message;
      expect(message).toContain("invalid input syntax");
      expect(message).toContain("rolled back");
      // Never the connection string (BUG-075).
      expect(message).not.toMatch(/postgres(ql)?:\/\//);

      // --single-transaction is what makes this true: the DROP TABLE that the
      // dump starts with was rolled back along with the failing COPY.
      expect(await countRows(url, "fixt_vehicles")).toBe(SEED_VEHICLES);
      expect(await countRows(url, "fixt_users")).toBe(SEED_USERS);
    });
  }, 60_000);

  it("BUG-197: a truncated dump is refused before psql runs, so nothing changes", async () => {
    const { runPsqlRestore } = await import("../restoreSafety");
    await withSeededScratch(async (url) => {
      const file = write("e2e-half.sql", truncatedDump());
      const inspection = await inspectDump(file);
      expect(inspection.ok).toBe(false);

      // The guard refuses it; psql is never invoked. Prove the data is intact
      // either way.
      if (inspection.ok) await runPsqlRestore(url, file);
      expect(await countRows(url, "fixt_vehicles")).toBe(SEED_VEHICLES);
      expect(await countRows(url, "fixt_users")).toBe(SEED_USERS);
    });
  }, 60_000);

  it("BUG-197: a corrupt archive is refused before psql runs, so nothing changes", async () => {
    await withSeededScratch(async (url) => {
      const file = write("e2e-corrupt.sql.gz", corruptGzip());
      expect((await inspectDump(file)).ok).toBe(false);
      expect(await countRows(url, "fixt_vehicles")).toBe(SEED_VEHICLES);
      expect(await countRows(url, "fixt_users")).toBe(SEED_USERS);
    });
  }, 60_000);

  it("BUG-199: a foreign-database dump is refused, and that database is never created", async () => {
    const other = `lvs_scratch_${process.pid}_neverexists`;
    await withSeededScratch(async (url) => {
      const file = write("e2e-foreign.sql", foreignDatabaseDump(other));
      const inspection = await inspectDump(file);
      expect(inspection.ok).toBe(false);
      expect(dumpTargetsForeignDatabase(inspection, url)).toContain(other);

      expect(await countRows(url, "fixt_vehicles")).toBe(SEED_VEHICLES);

      const rows = await queryScratch<{ datname: string }>(
        url,
        "SELECT datname FROM pg_database WHERE datname = $1",
        [other],
      );
      expect(rows).toEqual([]);
    });
  }, 60_000);

  it("BUG-220: after a restore no run is left on `running`, and the pre-restore row is rewritten", async () => {
    const { db } = await import("../db");
    const { backupRuns } = await import("../../shared/schema");
    const { eq, desc } = await import("drizzle-orm");
    const { backupService } = await import("../backupService");

    const backupDir = fs.mkdtempSync(path.join(os.tmpdir(), "lvs-b220-"));
    const previousBackupPath = process.env.BACKUP_PATH;
    const previousDatabaseUrl = process.env.DATABASE_URL;
    const createdRunIds: number[] = [];

    try {
      process.env.BACKUP_PATH = backupDir;
      fs.writeFileSync(path.join(backupDir, "db-backup-FIXT-b220.sql"), goodDump(3, 2));

      // The ghost: a run that was still open when the dump was written. It used
      // to come back with the restore and sit on `running` for ever, and the
      // pre-restore row that recorded the way back was dropped along with the
      // rest of backup_runs.
      const [ghost] = await db.insert(backupRuns)
        .values({ type: "database", status: "running", trigger: "FIXT-ghost", startedAt: new Date() })
        .returning();
      createdRunIds.push(ghost.id);

      await withScratchDatabase(async (url) => {
        process.env.DATABASE_URL = url;
        // Give the scratch database enough content that its own dump clears
        // verifyDatabaseBackup's 1 KB floor — an empty database dumps to ~775
        // bytes, and the safety backup would (correctly) refuse it as "not a
        // dump of anything", which is a different guard than the one under test.
        await queryScratch(url, "CREATE TABLE public.fixt_vehicles (id integer NOT NULL, plate text NOT NULL)");
        for (let i = 1; i <= 30; i++) {
          await queryScratch(url, "INSERT INTO public.fixt_vehicles VALUES ($1, $2)", [i, `SEED-PADDING-${i}`]);
        }

        // The safety backup runs a real pg_dump of the scratch database, so
        // this exercises the whole pipeline, not just psql.
        const result = await backupService.restoreDatabase("db-backup-FIXT-b220.sql");
        expect(result.safetyBackupFilename).toBeTruthy();

        expect(await countRows(url, "fixt_vehicles")).toBe(3);

        const stillRunning = await db.select().from(backupRuns).where(eq(backupRuns.status, "running"));
        expect(stillRunning).toEqual([]);

        const [latest] = await db.select().from(backupRuns)
          .where(eq(backupRuns.trigger, "pre-restore"))
          .orderBy(desc(backupRuns.id))
          .limit(1);
        expect(latest?.filename).toBe(result.safetyBackupFilename);
        if (latest) createdRunIds.push(latest.id);

        const [closedGhost] = await db.select().from(backupRuns).where(eq(backupRuns.id, ghost.id));
        expect(closedGhost.status).toBe("failed");
        expect(closedGhost.error).toMatch(/interrupted by a database restore/i);
      });
    } finally {
      if (previousBackupPath === undefined) delete process.env.BACKUP_PATH;
      else process.env.BACKUP_PATH = previousBackupPath;
      process.env.DATABASE_URL = previousDatabaseUrl;
      for (const id of createdRunIds) {
        await db.delete(backupRuns).where(eq(backupRuns.id, id)).catch(() => undefined);
      }
      await db.delete(backupRuns).where(eq(backupRuns.trigger, "FIXT-ghost")).catch(() => undefined);
      fs.rmSync(backupDir, { recursive: true, force: true });
    }
  }, 120_000);

  it("no db-backup-* or files-backup-* file is left in the temp directory by any of this", () => {
    // Wave 9: this used to scan os.tmpdir() for anything younger than ten
    // minutes, so a dev server running beside the suite and taking a backup
    // failed the test — a red run that said nothing about the code. The
    // directory scanned now contains only what this file's own code put there
    // (see LVS_TEMP_DIR in beforeAll), so a leftover here really is a leak.
    const leaked = fs.readdirSync(tempRoot).filter((name) => /^(db-backup-|files-backup-)/.test(name));
    expect(leaked).toEqual([]);
  });
});

/**
 * Writes a .tar.gz containing entries whose names node-tar's own writer would
 * refuse to emit — the traversal shapes a hostile archive carries. Built by
 * hand so the test exercises the reader's filter rather than the writer's.
 */
function writeForgedTarGz(target: string, entries: Array<{ name: string; body: string }>): void {
  const blocks: Buffer[] = [];
  for (const entry of entries) {
    const header = Buffer.alloc(512, 0);
    const body = Buffer.from(entry.body, "utf8");
    header.write(entry.name.slice(0, 99), 0, "utf8");
    header.write("0000644\0", 100, "utf8");            // mode
    header.write("0000000\0", 108, "utf8");            // uid
    header.write("0000000\0", 116, "utf8");            // gid
    header.write(body.length.toString(8).padStart(11, "0") + "\0", 124, "utf8");
    header.write("00000000000\0", 136, "utf8");        // mtime
    header.write("        ", 148, "utf8");             // checksum placeholder
    header.write("0", 156, "utf8");                    // typeflag: regular file
    header.write("ustar\0" + "00", 257, "utf8");
    let sum = 0;
    for (const byte of header) sum += byte;
    header.write(sum.toString(8).padStart(6, "0") + "\0 ", 148, "utf8");

    blocks.push(header);
    blocks.push(body);
    const pad = (512 - (body.length % 512)) % 512;
    if (pad) blocks.push(Buffer.alloc(pad, 0));
  }
  blocks.push(Buffer.alloc(1024, 0)); // end-of-archive
  fs.writeFileSync(target, zlib.gzipSync(Buffer.concat(blocks)));
}
