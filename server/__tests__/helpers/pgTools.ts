/**
 * Finds the PostgreSQL client binaries for the restore tests.
 *
 * `psql` and `pg_dump` are not always on PATH — on a Windows development host
 * the installer puts them in `C:\Program Files\PostgreSQL\<major>\bin` and
 * never touches PATH. That is BUG-219's shape exactly, and the fix carries a
 * `PG_BIN_DIR` escape hatch for it; this helper uses the same hatch so the
 * end-to-end restore tests run wherever PostgreSQL is installed at all.
 *
 * When nothing is found the caller skips the end-to-end group and says so; the
 * guard tests — archive verification, traversal refusal, temp-file hygiene —
 * never invoke psql and always run.
 */
import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";

function runnable(command: string): boolean {
  const result = spawnSync(command, ["--version"], { stdio: "ignore" });
  return !result.error && result.status === 0;
}

const CANDIDATE_DIRS = [
  "C:\\Program Files\\PostgreSQL",
  "C:\\Program Files (x86)\\PostgreSQL",
];

function windowsInstallDirs(): string[] {
  const found: string[] = [];
  for (const base of CANDIDATE_DIRS) {
    if (!fs.existsSync(base)) continue;
    for (const major of fs.readdirSync(base).sort().reverse()) {
      const bin = path.join(base, major, "bin");
      if (fs.existsSync(path.join(bin, "psql.exe"))) found.push(bin);
    }
  }
  return found;
}

const POSIX_DIRS = ["/usr/bin", "/usr/local/bin", "/usr/lib/postgresql/17/bin", "/usr/lib/postgresql/16/bin", "/opt/homebrew/bin"];

/**
 * Ensures `psql` and `pg_dump` can be started, setting `PG_BIN_DIR` if they
 * live somewhere other than PATH. Returns false when they are not installed.
 */
export function ensurePgTools(): boolean {
  if (runnable("psql") && runnable("pg_dump")) return true;

  const candidates = [
    ...(process.env.PG_BIN_DIR ? [process.env.PG_BIN_DIR] : []),
    ...windowsInstallDirs(),
    ...POSIX_DIRS,
  ];
  for (const dir of candidates) {
    const psql = path.join(dir, process.platform === "win32" ? "psql.exe" : "psql");
    const pgDump = path.join(dir, process.platform === "win32" ? "pg_dump.exe" : "pg_dump");
    if (fs.existsSync(psql) && fs.existsSync(pgDump) && runnable(psql)) {
      process.env.PG_BIN_DIR = dir;
      return true;
    }
  }
  return false;
}
