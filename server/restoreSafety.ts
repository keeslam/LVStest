// server/restoreSafety.ts
//
// FIX-L — everything a restore must do BEFORE it touches the live system.
//
// Restore used to be `psql <url> -f <file>` with no ON_ERROR_STOP, no
// --single-transaction and no pre-flight check. psql carries on after every
// error and still exits 0, so a truncated or corrupt dump returned
// 200 "Database restore completed successfully" while leaving the database
// half-empty with every sequence reset to 1 (BUG-197, CRITICAL). A dump
// carrying `\connect other_db` restored into — and first dropped — a different
// database entirely while the API reported success (BUG-199).
//
// The rules this module enforces:
//   1. Read the archive end to end and prove it is a complete dump, before
//      anything is dropped. The end marker is the whole point: a download that
//      was cut in half looks perfectly fine in its first 4 KB.
//   2. Refuse a dump that can leave the target database: \connect, \!, \i,
//      \ir, COPY … FROM PROGRAM, CREATE/DROP DATABASE, ALTER SYSTEM.
//   3. Refuse a dump whose target database is not the one we are restoring.
//   4. Run psql with -v ON_ERROR_STOP=1 --single-transaction, never through a
//      shell, never with the connection string in argv, and report a non-zero
//      exit as a failure carrying psql's own first ERROR: line.
//   5. Unpack file archives with the `tar` npm package and zlib rather than
//      external gunzip/tar binaries — which makes restore work on a Windows
//      host (BUG-219) and closes the extract-over-cwd primitive (BUG-069,
//      BUG-198) with a per-entry filter instead of trusting the archive.
//   6. Every temporary file is removed in a `finally`, and stale ones from
//      earlier crashes are swept at start-up (BUG-206, BUG-207).
import { spawn } from 'child_process';
import {
  closeSync, createReadStream, createWriteStream, existsSync, mkdtempSync,
  openSync, readdirSync, readSync, statSync, unlinkSync,
} from 'fs';
import { createGunzip } from 'zlib';
import { pipeline } from 'stream/promises';
import { join, sep, isAbsolute, normalize } from 'path';
import { tmpdir } from 'os';
import * as tar from 'tar';

/** A plain dump smaller than this is not a dump. Matches backupVerification. */
const MIN_DUMP_BYTES = 1024;

/** pg_dump writes this as the last line of a complete plain dump. */
export const DUMP_END_MARKER = 'PostgreSQL database dump complete';

/**
 * Statements and psql meta-commands that let a dump act outside the database
 * it is being restored into, or shell out. Matched at the start of a line and
 * only outside COPY … FROM stdin data blocks, so a row whose first column
 * happens to begin with one of these words cannot trip the check.
 */
const FORBIDDEN: Array<{ label: string; re: RegExp }> = [
  { label: '\\connect', re: /^\s*\\connect\b/i },
  { label: '\\c', re: /^\s*\\c\s+\S/i },
  { label: '\\! (shell)', re: /^\s*\\!/ },
  { label: '\\i / \\ir (include)', re: /^\s*\\ir?\s+\S/i },
  { label: '\\copy … PROGRAM', re: /^\s*\\copy\b.*\bPROGRAM\b/i },
  { label: 'COPY … FROM PROGRAM', re: /^\s*COPY\b.*\bFROM\s+PROGRAM\b/i },
  { label: 'CREATE DATABASE', re: /^\s*CREATE\s+DATABASE\b/i },
  { label: 'DROP DATABASE', re: /^\s*DROP\s+DATABASE\b/i },
  { label: 'ALTER SYSTEM', re: /^\s*ALTER\s+SYSTEM\b/i },
];

const CONNECT_TARGET = /^\s*\\connect(?:ion)?\s+(?:-reuse-previous=\w+\s+)?("([^"]+)"|\S+)/i;
const CREATE_DB_TARGET = /^\s*CREATE\s+DATABASE\s+("([^"]+)"|[A-Za-z_][\w$]*)/i;

export interface DumpInspection {
  ok: boolean;
  /** Why the dump was refused. Safe to show a user: never contains credentials. */
  reason?: string;
  /** Decompressed size in bytes. */
  bytes: number;
  /** Database the dump wants to connect to or create, when it names one. */
  targetDatabase: string | null;
  /** Every forbidden directive found, for the log. */
  forbidden: string[];
  /** Whether the pg_dump completion marker was present. */
  complete: boolean;
}

/**
 * Reads the whole archive — transparently gunzipping it — and decides whether
 * it may be restored. This is the check that has to happen while the existing
 * data is still intact.
 */
export async function inspectDump(filePath: string): Promise<DumpInspection> {
  const empty: DumpInspection = { ok: false, bytes: 0, targetDatabase: null, forbidden: [], complete: false };
  if (!existsSync(filePath)) {
    return { ...empty, reason: `backup file is missing: ${filePath}` };
  }

  const gz = isGzip(filePath);
  let bytes = 0;
  let tail = '';
  let carry = '';
  let inCopyData = false;
  const forbidden = new Set<string>();
  let targetDatabase: string | null = null;

  const handleLine = (line: string) => {
    if (inCopyData) {
      // A COPY data block ends on a line consisting of exactly "\.".
      if (line.trimEnd() === '\\.') inCopyData = false;
      return;
    }
    if (/^\s*COPY\b.*\bFROM\s+stdin\s*;\s*$/i.test(line)) {
      inCopyData = true;
      return;
    }
    for (const { label, re } of FORBIDDEN) {
      if (re.test(line)) forbidden.add(label);
    }
    const connect = CONNECT_TARGET.exec(line);
    if (connect && !targetDatabase) targetDatabase = (connect[2] ?? connect[1]).replace(/;$/, '');
    const create = CREATE_DB_TARGET.exec(line);
    if (create && !targetDatabase) targetDatabase = create[2] ?? create[1];
  };

  try {
    const source = createReadStream(filePath);
    const stream = gz ? source.pipe(createGunzip()) : source;
    await new Promise<void>((resolve, reject) => {
      stream.on('data', (chunk: Buffer | string) => {
        const text = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
        bytes += typeof chunk === 'string' ? Buffer.byteLength(chunk) : chunk.length;
        const combined = carry + text;
        const lines = combined.split('\n');
        carry = lines.pop() ?? '';
        for (const line of lines) handleLine(line);
        tail = (tail + text).slice(-8192);
      });
      stream.on('end', resolve);
      stream.on('error', reject);
      source.on('error', reject);
    });
    if (carry) handleLine(carry);
  } catch (error) {
    return {
      ...empty,
      bytes,
      reason: gz
        ? `the archive is corrupt or truncated and could not be decompressed (${errText(error)})`
        : `the backup file could not be read (${errText(error)})`,
    };
  }

  const complete = tail.includes(DUMP_END_MARKER);
  const result: DumpInspection = {
    ok: false,
    bytes,
    targetDatabase,
    forbidden: [...forbidden],
    complete,
  };

  if (bytes < MIN_DUMP_BYTES) {
    return { ...result, reason: `the dump is only ${bytes} bytes — it is empty or truncated, so nothing was changed` };
  }
  if (!/PostgreSQL database dump|CREATE TABLE|COPY |INSERT INTO/i.test(tail + carry) && !complete) {
    return { ...result, reason: 'that file does not look like a PostgreSQL dump, so the restore was cancelled. Nothing was changed' };
  }
  if (!complete) {
    return {
      ...result,
      reason: `the dump does not end with the "${DUMP_END_MARKER}" marker — it was truncated, so nothing was changed`,
    };
  }
  if (forbidden.size > 0) {
    return {
      ...result,
      reason:
        `the dump contains ${[...forbidden].join(', ')}, which can act outside the database being restored. ` +
        `Nothing was changed`,
    };
  }
  return { ...result, ok: true };
}

/**
 * BUG-199: a dump carrying `\connect other_db` restores into — and first drops
 * — a different database while the target is left untouched and the API
 * reports success. `inspectDump` already refuses any `\connect`, so this is
 * the second gate: it turns "there is a database name in here" into a specific,
 * legible refusal.
 */
export function dumpTargetsForeignDatabase(
  inspection: DumpInspection,
  databaseUrl: string,
): string | null {
  if (!inspection.targetDatabase) return null;
  const current = databaseNameFromUrl(databaseUrl);
  if (!current) return null;
  if (inspection.targetDatabase === current) return null;
  return (
    `this archive restores into the database "${inspection.targetDatabase}", not "${current}". ` +
    `Restoring it would drop and replace a different database and leave this one untouched. Nothing was changed`
  );
}

/** The database name a connection string points at, or null. */
export function databaseNameFromUrl(databaseUrl: string): string | null {
  try {
    return new URL(databaseUrl).pathname.replace(/^\//, '') || null;
  } catch {
    return null;
  }
}

/**
 * Where the PostgreSQL client binaries live.
 *
 * BUG-219: the restore path depended on external tooling and only discovered
 * it was missing after a minute-long safety backup. `pg_dump`/`psql` are still
 * required (there is no in-process equivalent), but PG_BIN_DIR lets a host
 * that has them somewhere other than PATH — a Windows dev box, a slim
 * container — say so, instead of failing with a bare ENOENT.
 */
export function pgTool(name: 'psql' | 'pg_dump'): string {
  const dir = process.env.PG_BIN_DIR || process.env.PGBIN;
  return dir ? join(dir, name) : name;
}

/** True when psql and pg_dump can actually be started on this host. */
export async function restoreToolsAvailable(): Promise<{ ok: boolean; missing: string[] }> {
  const missing: string[] = [];
  for (const tool of ['psql', 'pg_dump'] as const) {
    const runnable = await new Promise<boolean>((resolve) => {
      const child = spawn(pgTool(tool), ['--version'], { stdio: 'ignore' });
      child.on('error', () => resolve(false));
      child.on('close', (code) => resolve(code === 0));
    });
    if (!runnable) missing.push(tool);
  }
  return { ok: missing.length === 0, missing };
}

/** Connection arguments for psql/pg_dump, with the password in the environment. */
export function pgConnectionArgs(databaseUrl: string): { args: string[]; env: NodeJS.ProcessEnv } {
  const url = new URL(databaseUrl);
  const args = [
    '--host', url.hostname,
    '--port', url.port || '5432',
    '--username', decodeURIComponent(url.username),
    '--dbname', url.pathname.replace(/^\//, ''),
    '--no-password',
  ];
  const env = { ...process.env } as NodeJS.ProcessEnv;
  if (url.password) env.PGPASSWORD = decodeURIComponent(url.password);
  return { args, env };
}

export class RestoreFailedError extends Error {
  constructor(message: string, readonly exitCode: number | null, readonly firstError: string | null) {
    super(message);
    this.name = 'RestoreFailedError';
  }
}

/**
 * BUG-197: runs the dump with ON_ERROR_STOP inside a single transaction, so a
 * bad statement aborts and rolls back instead of being skipped. A non-zero
 * exit is a failure — psql's own first ERROR: line is the message, the
 * connection string never is.
 */
export async function runPsqlRestore(databaseUrl: string, sqlFile: string): Promise<void> {
  const { args, env } = pgConnectionArgs(databaseUrl);
  const full = [
    ...args,
    '--quiet',
    '--no-psqlrc',
    '-v', 'ON_ERROR_STOP=1',
    '--single-transaction',
    '-f', sqlFile,
  ];

  await new Promise<void>((resolve, reject) => {
    const child = spawn(pgTool('psql'), full, { env, stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    let stdout = '';
    child.stdout.on('data', (d) => { stdout += String(d); });
    child.stderr.on('data', (d) => { stderr += String(d); });
    child.on('error', (err: NodeJS.ErrnoException) => {
      reject(new RestoreFailedError(
        err.code === 'ENOENT'
          ? 'psql was not found on this host. Install the PostgreSQL client tools (or set PG_BIN_DIR) to enable restores.'
          : `psql could not be started: ${err.message}`,
        null, null,
      ));
    });
    child.on('close', (code) => {
      if (code === 0) return resolve();
      const firstError = firstErrorLine(stderr) ?? firstErrorLine(stdout);
      reject(new RestoreFailedError(
        `The restore failed and was rolled back; the database was not changed. ` +
        `psql exited with code ${code}${firstError ? `: ${firstError}` : ''}`,
        code, firstError,
      ));
    });
  });
}

/** psql's first `ERROR:` line, trimmed to something a user can read. */
export function firstErrorLine(text: string): string | null {
  for (const line of text.split('\n')) {
    if (/^\s*(psql:.*)?ERROR:/i.test(line)) return line.trim().slice(0, 300);
  }
  const fatal = text.split('\n').find((l) => /FATAL:|could not connect/i.test(l));
  return fatal ? fatal.trim().slice(0, 300) : null;
}

// ---------------------------------------------------------------- file archives

export interface ArchiveInspection {
  ok: boolean;
  reason?: string;
  entries: number;
  /** Entries rejected by the containment filter, for the log. */
  rejected: string[];
}

/** Every entry must sit under this prefix; `archiver` writes it for all of them. */
const ARCHIVE_PREFIX = 'uploads/';

function entryIsSafe(entryPath: string): boolean {
  const p = entryPath.replace(/\\/g, '/');
  if (!p.startsWith(ARCHIVE_PREFIX)) return false;
  if (isAbsolute(p) || /^[A-Za-z]:/.test(p) || p.startsWith('/')) return false;
  const segments = p.split('/');
  if (segments.some((s) => s === '..')) return false;
  const stripped = segments.slice(1).join('/');
  if (!stripped) return false;
  const normalised = normalize(stripped);
  if (normalised.startsWith('..') || isAbsolute(normalised)) return false;
  return true;
}

/**
 * Lists the archive and refuses it if any entry could land outside the target.
 * Runs before the destructive extraction, so a hostile or damaged archive
 * never reaches the filesystem (BUG-069, BUG-198).
 */
export async function inspectFilesArchive(archivePath: string): Promise<ArchiveInspection> {
  if (!existsSync(archivePath)) {
    return { ok: false, entries: 0, rejected: [], reason: `backup file is missing: ${archivePath}` };
  }
  const rejected: string[] = [];
  let entries = 0;
  try {
    await tar.t({
      file: archivePath,
      onentry: (entry: any) => {
        const p = String(entry.path);
        if (p.endsWith('/')) return; // directory entry
        entries += 1;
        if (!entryIsSafe(p)) rejected.push(p.slice(0, 200));
      },
    } as any);
  } catch (error) {
    return { ok: false, entries, rejected, reason: `the archive is corrupt or truncated (${errText(error)})` };
  }
  if (rejected.length > 0) {
    return {
      ok: false,
      entries,
      rejected,
      reason:
        `the archive contains ${rejected.length} entr${rejected.length === 1 ? 'y' : 'ies'} that would be written ` +
        `outside the uploads directory (for example "${rejected[0]}"). Nothing was changed`,
    };
  }
  if (entries === 0) {
    return { ok: false, entries, rejected, reason: 'the archive contains no files. Nothing was changed' };
  }
  return { ok: true, entries, rejected };
}

/**
 * Extracts a verified files archive into `targetDir`, stripping the fixed
 * `uploads/` prefix, with the same per-entry filter applied a second time as
 * the belt to the inspection's braces. Uses the `tar` npm package rather than
 * spawning tar, so this works on a Windows host too (BUG-219).
 */
export async function extractFilesArchive(archivePath: string, targetDir: string): Promise<number> {
  let written = 0;
  await tar.x({
    file: archivePath,
    cwd: targetDir,
    strip: 1,
    preservePaths: false,
    filter: (p: string, entry: any) => {
      const original = String(entry?.path ?? p);
      const safe = entryIsSafe(original);
      if (safe && !original.endsWith('/')) written += 1;
      return safe;
    },
  } as any);
  return written;
}

// ---------------------------------------------------------------- code archives

/**
 * BUG-069 — the code restore.
 *
 * `/api/backups/restore-code` used to run `tar.x({ cwd: process.cwd() })` over
 * an operator-uploaded archive behind nothing but a `..`/absolute filter, and
 * then called `process.exit(0)` so the freshly written files would be the code
 * that came back up. Phase 36 replayed that filter against the documented
 * payload: it rejected **zero** entries and wrote `dist/server/index.js`. That
 * is an upload turning into running code.
 *
 * The route is now **off unless the deployment says otherwise**
 * (`ALLOW_CODE_RESTORE=true`), and when it is on the archive is verified and
 * unpacked into a staging directory — never over the running application, and
 * never followed by an unchecked process exit. The owner deploys through
 * Coolify, so redeploying is how code gets replaced; he can still switch the
 * button back on for a host where that is not true.
 */
export function codeRestoreEnabled(): boolean {
  return String(process.env.ALLOW_CODE_RESTORE ?? '').trim().toLowerCase() === 'true';
}

/** The same containment rule as the uploads archive, without the fixed prefix. */
function codeEntryIsSafe(entryPath: string): boolean {
  const p = entryPath.replace(/\\/g, '/');
  if (!p || p.includes('\0')) return false;
  if (p.startsWith('/') || isAbsolute(p) || /^[A-Za-z]:/.test(p)) return false;
  if (p.split('/').some((seg) => seg === '..')) return false;
  const normalised = normalize(p);
  if (normalised.startsWith('..') || isAbsolute(normalised)) return false;
  return true;
}

/**
 * Lists a code archive and refuses it if any entry could land outside the
 * staging directory — before a single byte is written, exactly as
 * `inspectFilesArchive()` does for the uploads archive.
 */
export async function inspectCodeArchive(archivePath: string): Promise<ArchiveInspection> {
  if (!existsSync(archivePath)) {
    return { ok: false, entries: 0, rejected: [], reason: `backup file is missing: ${archivePath}` };
  }
  const rejected: string[] = [];
  let entries = 0;
  try {
    await tar.t({
      file: archivePath,
      onentry: (entry: any) => {
        const p = String(entry.path);
        if (p.endsWith('/')) return; // directory entry
        entries += 1;
        if (!codeEntryIsSafe(p)) rejected.push(p.slice(0, 200));
      },
    } as any);
  } catch (error) {
    return { ok: false, entries, rejected, reason: `the archive is corrupt or truncated (${errText(error)})` };
  }
  if (rejected.length > 0) {
    return {
      ok: false,
      entries,
      rejected,
      reason:
        `the archive contains ${rejected.length} entr${rejected.length === 1 ? 'y' : 'ies'} that would be written ` +
        `outside the staging directory (for example "${rejected[0]}"). Nothing was changed`,
    };
  }
  if (entries === 0) {
    return { ok: false, entries, rejected, reason: 'the archive contains no files. Nothing was changed' };
  }
  return { ok: true, entries, rejected };
}

/** Extracts a verified code archive into `targetDir`, filter applied again. */
export async function extractCodeArchive(archivePath: string, targetDir: string): Promise<number> {
  let written = 0;
  await tar.x({
    file: archivePath,
    cwd: targetDir,
    preservePaths: false,
    filter: (p: string, entry: any) => {
      const original = String(entry?.path ?? p);
      const safe = codeEntryIsSafe(original);
      if (safe && !original.endsWith('/')) written += 1;
      return safe;
    },
  } as any);
  return written;
}

/** A private staging directory for one code restore. Never `process.cwd()`. */
export function makeCodeStagingDir(): string {
  return mkdtempSync(join(backupTempDir(), 'lvs-code-restore-'));
}

// ---------------------------------------------------------------- temp files

const TEMP_PREFIXES = ['db-backup-', 'files-backup-', 'lvs-restore-'];

/**
 * Where the backup and restore code puts its scratch files.
 *
 * Defaults to the operating system temp directory, which is what production
 * uses. `LVS_TEMP_DIR` exists for the test suite: os.tmpdir() is shared with
 * every other process on the machine — including another instance of this very
 * application — so "nothing was left behind in the temp directory" is not an
 * assertion a test can make about a directory it does not own.
 */
export function backupTempDir(): string {
  const configured = process.env.LVS_TEMP_DIR;
  return configured && configured.trim() !== "" ? configured : tmpdir();
}

/** A private temp directory for one restore, removed by the caller. */
export function makeRestoreTempDir(): string {
  return mkdtempSync(join(backupTempDir(), 'lvs-restore-'));
}

/** Best-effort unlink that never throws — for `finally` blocks. */
export function safeUnlink(filePath: string | null | undefined): void {
  if (!filePath) return;
  try {
    if (existsSync(filePath)) unlinkSync(filePath);
  } catch (error) {
    console.error(`[restore] could not remove temp file ${filePath}:`, errText(error));
  }
}

/**
 * BUG-206/BUG-207: every backup left a 13 MB dump and a 118 MB archive in
 * os.tmpdir() forever, and a failed restore left a 20 MB plaintext dump beside
 * the archive because the cleanup used `require` in an ES module. Temp files
 * are now removed in a `finally`; this sweeps what earlier versions (and
 * crashes) left behind.
 */
export function cleanupStaleTempFiles(maxAgeMs = 60 * 60 * 1000): number {
  let removed = 0;
  const dir = backupTempDir();
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return 0;
  }
  const cutoff = Date.now() - maxAgeMs;
  for (const name of entries) {
    if (!TEMP_PREFIXES.some((p) => name.startsWith(p))) continue;
    const full = join(dir, name);
    try {
      const st = statSync(full);
      if (st.isFile() && st.mtimeMs < cutoff) {
        unlinkSync(full);
        removed += 1;
      }
    } catch {
      /* gone already, or in use — nothing to do */
    }
  }
  if (removed > 0) console.log(`[restore] removed ${removed} stale temporary backup file(s) from ${dir}`);
  return removed;
}

/** Decompresses a .gz into `destination` using zlib — never an external gunzip. */
export async function gunzipTo(source: string, destination: string): Promise<void> {
  await pipeline(createReadStream(source), createGunzip(), createWriteStream(destination));
}

/**
 * True when the file starts with the gzip magic bytes.
 *
 * Note the top-level `openSync` import: BUG-207 was exactly a `require('fs')`
 * inside an ES module, whose ReferenceError was swallowed by a catch and left
 * a 20 MB plaintext dump on the backup volume. There is no `require` anywhere
 * in this file.
 */
export function isGzip(filePath: string): boolean {
  try {
    const handle = openSync(filePath, 'r');
    try {
      const buf = Buffer.alloc(2);
      readSync(handle, buf, 0, 2, 0);
      return buf[0] === 0x1f && buf[1] === 0x8b;
    } finally {
      closeSync(handle);
    }
  } catch {
    return false;
  }
}

function errText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export { sep as pathSeparator };
