# Backup System Reliability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the app's backups land on the mounted persistent volume, prove themselves valid before being reported as successful, catch up when a nightly run is missed, and make failure visible instead of silent.

**Architecture:** `server/backupService.ts` keeps its shape (create / list / restore) but stops branching on storage type, stops writing run status to `/tmp`, and gains a verification step. Run history moves into a new `backup_runs` database table, which becomes the single source of truth for "when did this last work". The scheduler gains a boot-time catch-up. A shared `getUploadsDir()` prevents the backup and the upload routes from disagreeing about where files live.

**Tech Stack:** Node/Express, Drizzle ORM on PostgreSQL, `node-cron`, `archiver` (tar.gz), `pg_dump`/`psql` spawned as child processes, React + TanStack Query client.

**Spec:** [docs/superpowers/specs/2026-08-22-backup-system-reliability-design.md](../specs/2026-08-22-backup-system-reliability-design.md)

## Global Constraints

- No automated test runner exists in this repo (no `test` script, no `*.test.*` files). Every task's verification is a scripted check run via `npx tsx` plus a typecheck, not a test-framework invocation. Where this plan says "write a test", it means a standalone script under `scripts/` that exits non-zero on failure.
- **Verification scripts that touch the database must start with `import 'dotenv/config';`.** Standalone `tsx` does not load `.env` the way `server/index.ts` does, so `DATABASE_URL` is undefined without it. This line belongs only in the throwaway verification script, never in committed source.
- **Run the verification scripts from a temp file, not `npx tsx -e "..."`.** The multi-line scripts below contain nested quotes that some shells mangle, producing silent success (exit 0, no output) that looks like a pass. Write the script body to a temporary `.ts` file at the worktree root, run `npx tsx thatfile.ts`, confirm you see its actual output, then delete it. A verification step that prints nothing has not passed — treat missing output as a failure and investigate.
- `pg_dump` is **not installed on the development machine**. No task may depend on running a real database dump locally. Anything needing `pg_dump` is deferred to deployment verification (Task 9).
- Baseline typecheck error count is **405** (`npx tsc --noEmit 2>&1 | grep -c "error TS"`). Tasks must not increase it.
- `BACKUP_PATH=/backups` is the deployment's volume mount. `WORKDIR` is `/app` and uploads are mounted at `/app/uploads`.
- Do not change the 20+ existing backup routes' paths or signatures beyond what a task explicitly requires — route consolidation is an explicit non-goal.
- Follow existing patterns: Drizzle table definitions in `shared/schema.ts`, `apiRequest`/`invalidateByPrefix` on the client, `hasPermission(UserPermission.MANAGE_BACKUPS)` on backup routes.

---

## Task 1: Shared uploads-directory resolver

**Files:**
- Create: `shared/paths.ts`
- Modify: `server/routes.ts:63-66` (delete the private `getUploadsDir`, import the shared one)
- Modify: `server/backupService.ts:286` (use the shared resolver instead of a hardcoded path)

**Interfaces:**
- Produces: `export function getUploadsDir(): string` in `shared/paths.ts` — returns `process.env.UPLOADS_DIR || path.join(process.cwd(), 'uploads')`. Tasks 3 and 6 rely on the backup service resolving uploads through this.

- [ ] **Step 1: Create the shared resolver**

```typescript
// shared/paths.ts
import path from 'path';

/**
 * Where user-uploaded files live.
 *
 * The backup service and the upload routes MUST both resolve the uploads
 * directory through this function. They previously disagreed — the routes
 * honoured UPLOADS_DIR while the backup hardcoded process.cwd()/uploads —
 * which meant setting that variable would silently move uploads while the
 * backup carried on archiving an empty directory, reporting success.
 */
export function getUploadsDir(): string {
  return process.env.UPLOADS_DIR || path.join(process.cwd(), 'uploads');
}

/**
 * Where backups are written. BACKUP_PATH points at the mounted persistent
 * volume in deployment; the caller falls back to the configured database
 * value, then to a local directory, when it is unset.
 */
export function getBackupPathFromEnv(): string | undefined {
  return process.env.BACKUP_PATH || undefined;
}
```

- [ ] **Step 2: Point routes.ts at it**

In `server/routes.ts`, delete the local definition at lines 63-66:

```typescript
function getUploadsDir(): string {
  // Use environment variable if set, otherwise default to uploads in current directory
  return process.env.UPLOADS_DIR || path.join(process.cwd(), 'uploads');
}
```

and add to the imports at the top of the file:

```typescript
import { getUploadsDir } from '@shared/paths';
```

Check the file's existing import style first — if other `@shared/...` imports use a relative path like `../shared/paths`, match whatever is already there rather than introducing a new alias.

- [ ] **Step 3: Point backupService.ts at it**

In `server/backupService.ts`, add the import alongside the existing ones, then replace line 286:

```typescript
const uploadsDir = join(process.cwd(), 'uploads');
```

with:

```typescript
const uploadsDir = getUploadsDir();
```

- [ ] **Step 4: Verify both resolve identically**

```bash
npx tsx -e "
import { getUploadsDir } from './shared/paths';
const a = getUploadsDir();
process.env.UPLOADS_DIR = '/tmp/elsewhere';
const b = getUploadsDir();
if (a === b) { console.error('FAIL: UPLOADS_DIR override had no effect'); process.exit(1); }
if (b !== '/tmp/elsewhere') { console.error('FAIL: expected /tmp/elsewhere, got ' + b); process.exit(1); }
console.log('PASS: default=' + a + ' override=' + b);
"
```
Expected: `PASS: ...`

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit 2>&1 | grep -c "error TS"`
Expected: `405` (unchanged from baseline).

- [ ] **Step 6: Commit**

```bash
git add shared/paths.ts server/routes.ts server/backupService.ts
git commit -m "fix: resolve uploads directory through one shared helper

The backup service hardcoded process.cwd()/uploads while every upload route
honoured UPLOADS_DIR. Setting that variable would have moved uploads while
the backup kept archiving the old, empty directory and reporting success."
```

---

## Task 2: `backup_runs` history table

**Files:**
- Modify: `shared/schema.ts` (add table next to `backupSettings`, currently at line 917)

**Interfaces:**
- Produces: `backupRuns` Drizzle table, plus `BackupRun` / `InsertBackupRun` types. Tasks 3, 4, 5 and 7 read and write it.

- [ ] **Step 1: Add the table definition**

Add immediately after the `backupSettings` block and its exported types in `shared/schema.ts`:

```typescript
// Backup run history. This replaces the previous /tmp/backup-status.json,
// which was wiped on every container restart — taking the record of both
// successes and failures with it, so the UI reported "Never" while backups
// sat on disk and failures left no trace.
export const backupRuns = pgTable("backup_runs", {
  id: serial("id").primaryKey(),
  startedAt: timestamp("started_at").defaultNow().notNull(),
  finishedAt: timestamp("finished_at"),
  type: text("type").notNull(), // 'database' | 'files'
  status: text("status").notNull(), // 'running' | 'success' | 'failed'
  filename: text("filename"),
  sizeBytes: integer("size_bytes"),
  checksum: text("checksum"),
  verified: boolean("verified").default(false).notNull(),
  filePruned: boolean("file_pruned").default(false).notNull(),
  error: text("error"),
  trigger: text("trigger").notNull(), // 'scheduled' | 'manual' | 'catchup' | 'pre-restore'
});

export const insertBackupRunSchema = createInsertSchema(backupRuns).omit({
  id: true,
});

export type BackupRun = typeof backupRuns.$inferSelect;
export type InsertBackupRun = z.infer<typeof insertBackupRunSchema>;
```

- [ ] **Step 2: Apply the schema to the local database**

`drizzle-kit push` needs a TTY for destructive prompts, but this change is purely additive (one new table), so it should apply without prompting.

Run: `npx drizzle-kit push --force`
Expected: `[✓] Changes applied`, no interactive prompt.

If it does prompt or fail, create the table with an explicit statement instead, using the `pg` client pattern already used elsewhere in this repo (read `.env` for `DATABASE_URL`, connect, `CREATE TABLE IF NOT EXISTS backup_runs (...)` matching the columns above), then re-run `npx drizzle-kit push --force` and confirm no drift remains.

- [ ] **Step 3: Confirm the table exists and is writable**

```bash
npx tsx -e "
import { db } from './server/db';
import { backupRuns } from './shared/schema';
const [row] = await db.insert(backupRuns).values({
  type: 'database', status: 'running', trigger: 'manual',
}).returning();
console.log('inserted id', row.id, 'status', row.status, 'verified', row.verified);
if (row.verified !== false) { console.error('FAIL: verified should default false'); process.exit(1); }
await db.delete(backupRuns);
console.log('PASS');
process.exit(0);
"
```
Expected: `inserted id ... PASS`

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit 2>&1 | grep -c "error TS"`
Expected: `405`.

- [ ] **Step 5: Commit**

```bash
git add shared/schema.ts
git commit -m "feat: add backup_runs history table

Replaces /tmp/backup-status.json, which was wiped on every restart and took
all evidence of backup failures with it."
```

---

## Task 3: Backup path from the environment, and no silent object-storage fallback

**Files:**
- Modify: `server/backupService.ts` (`defaultBackupPath` at :38; the storage branches in `createDatabaseBackup` :211-261 and the equivalent block in `createFilesBackup`; the object-storage branch in `listBackups` :532-551)

**Interfaces:**
- Produces: `private resolveBackupPath(settings): Promise<string>` on `BackupService` — returns `BACKUP_PATH` if set, else `settings?.localPath`, else `join(process.cwd(), 'backups')`. Tasks 4, 5 and 6 call it.

- [ ] **Step 1: Add the resolver**

Add to `BackupService`, and import `getBackupPathFromEnv` from `shared/paths`:

```typescript
  /**
   * Where backups are written.
   *
   * BACKUP_PATH wins so the deployment's mounted volume cannot be overridden
   * by a stale database row. Previously this came only from backupSettings,
   * defaulting to the application directory, which a container wipes on every
   * redeploy.
   */
  private resolveBackupPath(settings: { localPath?: string | null } | null): string {
    return getBackupPathFromEnv() || settings?.localPath || join(process.cwd(), 'backups');
  }
```

- [ ] **Step 2: Replace the storage branch in `createDatabaseBackup`**

Replace the whole `try { if (storageType === 'object_storage') { ... } else { ... } } catch { ... }` block (lines 216-261) with:

```typescript
    const backupPath = this.resolveBackupPath(settings);

    try {
      await this.saveToLocalFilesystem(tempFile, filename, 'database', backupPath);

      const typeDir = join(backupPath, 'database');
      const fullPath = await this.ensureBackupDirectory(typeDir);
      const manifestPath = join(fullPath, `${filename}.manifest.json`);
      writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

      console.log(`✅ Database backup saved: ${filename} (${fileStats.size} bytes) in ${fullPath}`);
    } catch (error) {
      const errorMessage = `Failed to save database backup to ${backupPath}: ${error instanceof Error ? error.message : String(error)}`;
      console.error(`❌ ${errorMessage}`);
      throw new Error(errorMessage);
    }
```

Also delete the now-unused `const storageType = ...` line above it.

- [ ] **Step 3: Do the same in `createFilesBackup`**

Find the equivalent `if (storageType === 'object_storage')` block in `createFilesBackup` (search for `storageType` — there is one block per create method) and replace it with the same shape, substituting `'files'` for `'database'` and using the files manifest variable already in scope. Delete its `storageType` line too.

- [ ] **Step 4: Remove the object-storage branch from `listBackups`**

In `listBackups` (:522), delete the `if (storageType === 'object_storage') { ... }` branch (:532-551) and keep only the local-filesystem body, so the method reads its files from `this.resolveBackupPath(settings)` rather than `settings?.localPath || this.defaultBackupPath`. Delete the now-unused `storageType` variable.

- [ ] **Step 5: Check nothing still routes backups through object storage**

```bash
grep -n "objectStorage\|storageType" server/backupService.ts
```
Expected: only the `this.objectStorage = new ObjectStorageService()` constructor assignment may remain (harmless, other features may use the class). No remaining `storageType` branching in create/list. If `updateStatusFile` still uploads to object storage, delete that method entirely — Task 4 replaces it.

- [ ] **Step 6: Verify path precedence**

```bash
npx tsx -e "
process.env.BACKUP_PATH = '/backups';
import('./server/backupService').then(async (m) => {
  const svc: any = new m.BackupService();
  const withEnv = svc.resolveBackupPath({ localPath: '/from/db' });
  if (withEnv !== '/backups') { console.error('FAIL: env should win, got ' + withEnv); process.exit(1); }
  delete process.env.BACKUP_PATH;
  const withDb = svc.resolveBackupPath({ localPath: '/from/db' });
  if (withDb !== '/from/db') { console.error('FAIL: db value should be used, got ' + withDb); process.exit(1); }
  const withNeither = svc.resolveBackupPath(null);
  if (!withNeither.endsWith('backups')) { console.error('FAIL: fallback wrong: ' + withNeither); process.exit(1); }
  console.log('PASS env=' + withEnv + ' db=' + withDb + ' fallback=' + withNeither);
  process.exit(0);
});
"
```
Expected: `PASS ...`

- [ ] **Step 7: Typecheck and commit**

Run: `npx tsc --noEmit 2>&1 | grep -c "error TS"` — expected `405`.

```bash
git add server/backupService.ts
git commit -m "fix: take backup path from BACKUP_PATH, drop object-storage fallback

Backups defaulted to the application directory, which a container wipes on
redeploy, and a failing object-storage write silently fell back to it. The
mounted volume now wins via BACKUP_PATH and a storage failure is reported."
```

---

## Task 4: Record every run in the database

**Files:**
- Modify: `server/backupService.ts` (`getStatus` :111-125, `updateStatus` :128-136, `statusFile` :37, `runBackup` :455-499, `updateStatusFile` :502-519)

**Interfaces:**
- Consumes: `backupRuns` from Task 2, `resolveBackupPath` from Task 3.
- Produces: `startRun(type, trigger): Promise<number>` returning the new row id; `finishRun(id, fields): Promise<void>`; `getStatus(): Promise<BackupStatus>` — note this becomes **async**, so all callers must be updated. Task 7's health endpoint consumes `getLastSuccessfulRun`.

- [ ] **Step 1: Add the run-recording helpers**

```typescript
  /** Open a run row and return its id. */
  private async startRun(type: 'database' | 'files', trigger: string): Promise<number> {
    const [row] = await db.insert(backupRuns).values({
      type, status: 'running', trigger, startedAt: new Date(),
    }).returning();
    return row.id;
  }

  /** Close a run row with its outcome. */
  private async finishRun(id: number, fields: {
    status: 'success' | 'failed';
    filename?: string;
    sizeBytes?: number;
    checksum?: string;
    verified?: boolean;
    error?: string;
  }): Promise<void> {
    await db.update(backupRuns)
      .set({ ...fields, finishedAt: new Date() })
      .where(eq(backupRuns.id, id));
  }

  /** Most recent verified-successful run of a type, if any. */
  async getLastSuccessfulRun(type?: 'database' | 'files'): Promise<BackupRun | undefined> {
    const conditions = [eq(backupRuns.status, 'success'), eq(backupRuns.verified, true)];
    if (type) conditions.push(eq(backupRuns.type, type));
    const [row] = await db.select().from(backupRuns)
      .where(and(...conditions))
      .orderBy(desc(backupRuns.finishedAt))
      .limit(1);
    return row;
  }
```

Add `backupRuns`, `type BackupRun` to the schema import, and `eq`, `and`, `desc` to the `drizzle-orm` import.

- [ ] **Step 2: Replace `getStatus` and delete `updateStatus` / `updateStatusFile` / `statusFile`**

```typescript
  // Current backup status, read from run history rather than a temp file.
  async getStatus(): Promise<BackupStatus> {
    try {
      const lastSuccess = await this.getLastSuccessfulRun();
      const [lastFailure] = await db.select().from(backupRuns)
        .where(eq(backupRuns.status, 'failed'))
        .orderBy(desc(backupRuns.finishedAt))
        .limit(1);

      return {
        isRunning: this.isRunning,
        nextScheduled: this.getNextScheduledTime(),
        lastSuccess: lastSuccess?.finishedAt?.toISOString(),
        lastError: lastFailure
          ? `${lastFailure.finishedAt?.toISOString() ?? ''}: ${lastFailure.error ?? 'unknown error'}`
          : undefined,
      };
    } catch (error) {
      console.error('Error reading backup status:', error);
      return { isRunning: this.isRunning, nextScheduled: this.getNextScheduledTime() };
    }
  }
```

Delete `private statusFile = '/tmp/backup-status.json';` (:37), the whole `updateStatus` method, and the whole `updateStatusFile` method.

- [ ] **Step 3: Wire `runBackup` to the run rows**

Replace `runBackup`'s body (keeping its signature and the `isRunning` guard) so each backup gets its own row:

```typescript
    this.isRunning = true;
    const trigger = triggerLabel ?? 'manual';
    const dbRunId = await this.startRun('database', trigger);
    const filesRunId = await this.startRun('files', trigger);

    try {
      console.log('Starting backup process...');

      const databaseBackup = await this.createDatabaseBackup();
      await this.finishRun(dbRunId, {
        status: 'success',
        filename: databaseBackup.filename,
        sizeBytes: databaseBackup.size,
        checksum: databaseBackup.checksum,
        verified: true,
      });

      const filesBackup = await this.createFilesBackup();
      await this.finishRun(filesRunId, {
        status: 'success',
        filename: filesBackup.filename,
        sizeBytes: filesBackup.size,
        checksum: filesBackup.checksum,
        verified: true,
      });

      console.log('Backup completed successfully');
      return { database: databaseBackup, files: filesBackup };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('Backup failed:', message);
      for (const id of [dbRunId, filesRunId]) {
        const [row] = await db.select().from(backupRuns).where(eq(backupRuns.id, id));
        if (row?.status === 'running') {
          await this.finishRun(id, { status: 'failed', error: message });
        }
      }
      throw error;
    } finally {
      this.isRunning = false;
    }
```

Change the signature to `async runBackup(triggerLabel?: string)`. Note the two backups now run sequentially rather than in a `Promise.all` — this is deliberate: with `Promise.all`, a database failure left the files run's outcome ambiguous.

`verified: true` here is provisional; Task 6 replaces it with the real verification result.

- [ ] **Step 4: Update `getStatus` callers for the async change**

```bash
grep -rn "getStatus()" server/routes.ts server/index.ts
```

Every backup-service `getStatus()` call must now be awaited. Update each one. Do **not** touch `BackupScheduler.getStatus()` — that is a different method on a different class and stays synchronous.

- [ ] **Step 5: Verify history survives and reads back**

```bash
npx tsx -e "
import { db } from './server/db';
import { backupRuns } from './shared/schema';
import { BackupService } from './server/backupService';
await db.delete(backupRuns);
const svc: any = new BackupService();
const id = await svc.startRun('database', 'manual');
await svc.finishRun(id, { status: 'success', filename: 'x.sql.gz', sizeBytes: 1234, checksum: 'abc', verified: true });
const status = await svc.getStatus();
if (!status.lastSuccess) { console.error('FAIL: lastSuccess missing'); process.exit(1); }
const failId = await svc.startRun('database', 'scheduled');
await svc.finishRun(failId, { status: 'failed', error: 'boom' });
const after = await svc.getStatus();
if (!after.lastError || !after.lastError.includes('boom')) { console.error('FAIL: lastError missing: ' + after.lastError); process.exit(1); }
console.log('PASS lastSuccess=' + status.lastSuccess + ' lastError=' + after.lastError);
await db.delete(backupRuns);
process.exit(0);
"
```
Expected: `PASS ...`

- [ ] **Step 6: Typecheck and commit**

Run: `npx tsc --noEmit 2>&1 | grep -c "error TS"` — expected `405`.

```bash
git add server/backupService.ts server/routes.ts server/index.ts
git commit -m "feat: record backup runs in the database instead of /tmp

Run status lived in /tmp/backup-status.json, wiped on every container
restart. That is why the UI showed 'Last Backup: Never' beside a list of
existing backups, and why no failure was ever visible."
```

---

## Task 5: Real timestamps, and tolerant parsing of old manifests

**Files:**
- Modify: `server/backupService.ts` (the `BackupManifest` interface; `createDatabaseBackup` :149/:201; `createFilesBackup` :268/:313; `listBackups` :556-577 and the sort at :588)

**Interfaces:**
- Produces: `BackupManifest.timestamp` is now a genuine ISO 8601 string; `BackupManifest.filenameStamp` holds the filename-safe form. Task 7's UI reads `timestamp`.

- [ ] **Step 1: Extend the manifest type**

In the `BackupManifest` interface add:

```typescript
  /** Filename-safe variant of the timestamp (colons and dots replaced). */
  filenameStamp?: string;
```

- [ ] **Step 2: Store a real timestamp in both create methods**

In `createDatabaseBackup`, replace:

```typescript
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `db-backup-${timestamp}.sql.gz`;
```

with:

```typescript
    // Keep these separate: the filename needs a path-safe stamp, but the
    // manifest needs a parseable date. Storing the path-safe form as the
    // timestamp is what produced "Invalid Date" throughout the UI and broke
    // the newest-first sort, which compared NaN values.
    const startedAtIso = new Date().toISOString();
    const filenameStamp = startedAtIso.replace(/[:.]/g, '-');
    const filename = `db-backup-${filenameStamp}.sql.gz`;
```

Then in that method's manifest literal, replace `timestamp,` with:

```typescript
      timestamp: startedAtIso,
      filenameStamp,
```

Apply the identical change in `createFilesBackup`, with `files-backup-${filenameStamp}.tar.gz`.

- [ ] **Step 3: Parse old manifests tolerantly**

Add a helper to the class:

```typescript
  /**
   * Manifests written before the timestamp fix hold a path-safe string that
   * Date cannot parse. Fall back to the file's mtime so historical backups
   * show a real date instead of "Invalid Date".
   */
  private manifestTime(manifest: BackupManifest, filePath?: string): Date {
    const parsed = new Date(manifest.timestamp);
    if (!Number.isNaN(parsed.getTime())) return parsed;
    if (filePath && existsSync(filePath)) {
      try { return statSync(filePath).mtime; } catch { /* fall through */ }
    }
    return new Date(0);
  }
```

- [ ] **Step 4: Use it in `scanDirectoryForManifests` and the sort**

In `scanDirectoryForManifests`, after parsing each manifest, normalise it before pushing:

```typescript
            const manifest = JSON.parse(manifestContent);
            const backupFile = itemPath.replace(/\.manifest\.json$/, '');
            manifest.timestamp = this.manifestTime(manifest, backupFile).toISOString();
            manifests.push(manifest);
```

The sort at the end of `listBackups` then works unchanged, because every `timestamp` is now parseable.

- [ ] **Step 5: Verify both new and legacy manifests**

```bash
npx tsx -e "
import { BackupService } from './server/backupService';
const svc: any = new BackupService();
const good = svc.manifestTime({ timestamp: '2026-08-22T10:00:00.000Z' } as any);
if (Number.isNaN(good.getTime())) { console.error('FAIL: valid ISO rejected'); process.exit(1); }
const legacy = svc.manifestTime({ timestamp: '2025-10-13T21-49-25-494Z' } as any);
if (Number.isNaN(legacy.getTime())) { console.error('FAIL: legacy produced Invalid Date'); process.exit(1); }
const iso = new Date().toISOString();
if (Number.isNaN(new Date(iso.replace(/[:.]/g,'-')).getTime()) === false) { console.error('FAIL: premise wrong'); process.exit(1); }
console.log('PASS good=' + good.toISOString() + ' legacy=' + legacy.toISOString());
"
```
Expected: `PASS ...` — the legacy value resolves to epoch (no file present) rather than `Invalid Date`.

- [ ] **Step 6: Typecheck and commit**

Run: `npx tsc --noEmit 2>&1 | grep -c "error TS"` — expected `405`.

```bash
git add server/backupService.ts
git commit -m "fix: store parseable timestamps in backup manifests

The manifest stored the filename-safe stamp, which Date cannot parse, so
every backup rendered as 'Invalid Date' and the newest-first sort compared
NaN. Legacy manifests now fall back to file mtime."
```

---

## Task 6: Verify every backup before calling it a success

**Files:**
- Create: `server/backupVerification.ts`
- Modify: `server/backupService.ts` (`runBackup`, to verify before `finishRun`)

**Interfaces:**
- Produces: `verifyDatabaseBackup(filePath: string, expectedChecksum: string): Promise<VerificationResult>` and `verifyFilesBackup(filePath: string, expectedChecksum: string, sourceDir: string): Promise<VerificationResult>`, where `VerificationResult = { ok: boolean; reason?: string; bytes?: number }`. Task 7 surfaces the failure reason.

- [ ] **Step 1: Write the verification module**

```typescript
// server/backupVerification.ts
//
// A backup that has not been read back is not a backup. These checks run
// immediately after a backup is written; anything that fails here is recorded
// as a failed run rather than a success, which is what the 10-byte database
// backups in the deployment should have done.
import { createReadStream, existsSync, readdirSync } from 'fs';
import { createGunzip } from 'zlib';
import { createHash } from 'crypto';
import { pipeline } from 'stream/promises';

export interface VerificationResult {
  ok: boolean;
  reason?: string;
  bytes?: number;
}

/** sha256 of a file on disk. */
async function checksumOf(filePath: string): Promise<string> {
  const hash = createHash('sha256');
  await pipeline(createReadStream(filePath), hash);
  return hash.digest('hex');
}

/** Decompress fully, returning the byte count and a tail sample. */
async function gunzipStats(filePath: string, tailBytes = 4096): Promise<{ bytes: number; tail: string }> {
  let bytes = 0;
  let tail = Buffer.alloc(0);
  const gunzip = createGunzip();
  const source = createReadStream(filePath);
  source.pipe(gunzip);
  await new Promise<void>((resolve, reject) => {
    gunzip.on('data', (chunk: Buffer) => {
      bytes += chunk.length;
      tail = Buffer.concat([tail, chunk]).subarray(-tailBytes);
    });
    gunzip.on('end', resolve);
    gunzip.on('error', reject);
    source.on('error', reject);
  });
  return { bytes, tail: tail.toString('utf8') };
}

const MIN_DUMP_BYTES = 1024;

export async function verifyDatabaseBackup(filePath: string, expectedChecksum: string): Promise<VerificationResult> {
  if (!existsSync(filePath)) return { ok: false, reason: `backup file missing: ${filePath}` };

  let stats: { bytes: number; tail: string };
  try {
    stats = await gunzipStats(filePath);
  } catch (error) {
    return { ok: false, reason: `gzip is corrupt or truncated: ${error instanceof Error ? error.message : String(error)}` };
  }

  if (stats.bytes < MIN_DUMP_BYTES) {
    return { ok: false, bytes: stats.bytes, reason: `dump is only ${stats.bytes} bytes decompressed — expected at least ${MIN_DUMP_BYTES}` };
  }
  if (!stats.tail.includes('PostgreSQL database dump complete')) {
    return { ok: false, bytes: stats.bytes, reason: 'dump does not end with pg_dump completion marker — it was truncated' };
  }

  const actual = await checksumOf(filePath);
  if (actual !== expectedChecksum) {
    return { ok: false, bytes: stats.bytes, reason: `checksum mismatch: recorded ${expectedChecksum}, file is ${actual}` };
  }
  return { ok: true, bytes: stats.bytes };
}

export async function verifyFilesBackup(filePath: string, expectedChecksum: string, sourceDir: string): Promise<VerificationResult> {
  if (!existsSync(filePath)) return { ok: false, reason: `backup file missing: ${filePath}` };

  let stats: { bytes: number; tail: string };
  try {
    stats = await gunzipStats(filePath);
  } catch (error) {
    return { ok: false, reason: `gzip is corrupt or truncated: ${error instanceof Error ? error.message : String(error)}` };
  }

  const sourceHasFiles = existsSync(sourceDir) && readdirSync(sourceDir).length > 0;
  if (sourceHasFiles && stats.bytes === 0) {
    return { ok: false, bytes: 0, reason: `archive is empty while ${sourceDir} contains files` };
  }

  const actual = await checksumOf(filePath);
  if (actual !== expectedChecksum) {
    return { ok: false, bytes: stats.bytes, reason: `checksum mismatch: recorded ${expectedChecksum}, file is ${actual}` };
  }
  return { ok: true, bytes: stats.bytes };
}
```

- [ ] **Step 2: Prove the checks reject bad input**

```bash
npx tsx -e "
import { writeFileSync } from 'fs';
import { gzipSync } from 'zlib';
import { createHash } from 'crypto';
import { verifyDatabaseBackup, verifyFilesBackup } from './server/backupVerification';

const sum = (p: string) => createHash('sha256').update(require('fs').readFileSync(p)).digest('hex');

// empty gzip — the 10-byte case
writeFileSync('/tmp/v-empty.sql.gz', gzipSync(Buffer.from('')));
const empty = await verifyDatabaseBackup('/tmp/v-empty.sql.gz', sum('/tmp/v-empty.sql.gz'));
if (empty.ok) { console.error('FAIL: empty dump accepted'); process.exit(1); }

// truncated: big enough, but no completion marker
writeFileSync('/tmp/v-trunc.sql.gz', gzipSync(Buffer.from('CREATE TABLE x();'.repeat(200))));
const trunc = await verifyDatabaseBackup('/tmp/v-trunc.sql.gz', sum('/tmp/v-trunc.sql.gz'));
if (trunc.ok) { console.error('FAIL: truncated dump accepted'); process.exit(1); }

// good dump
const good = 'CREATE TABLE x();'.repeat(200) + '\n-- PostgreSQL database dump complete\n';
writeFileSync('/tmp/v-good.sql.gz', gzipSync(Buffer.from(good)));
const ok = await verifyDatabaseBackup('/tmp/v-good.sql.gz', sum('/tmp/v-good.sql.gz'));
if (!ok.ok) { console.error('FAIL: good dump rejected: ' + ok.reason); process.exit(1); }

// checksum mismatch
const bad = await verifyDatabaseBackup('/tmp/v-good.sql.gz', 'deadbeef');
if (bad.ok) { console.error('FAIL: checksum mismatch accepted'); process.exit(1); }

// corrupt gzip
writeFileSync('/tmp/v-corrupt.sql.gz', Buffer.from('this is not gzip'));
const corrupt = await verifyDatabaseBackup('/tmp/v-corrupt.sql.gz', sum('/tmp/v-corrupt.sql.gz'));
if (corrupt.ok) { console.error('FAIL: corrupt gzip accepted'); process.exit(1); }

console.log('PASS: empty/truncated/mismatch/corrupt all rejected, good accepted (' + ok.bytes + ' bytes)');
"
```
Expected: `PASS: ...`

- [ ] **Step 3: Verify inside `runBackup` before recording success**

In `runBackup`, after `createDatabaseBackup()` returns, verify before `finishRun`:

```typescript
      const databaseBackup = await this.createDatabaseBackup();
      const dbPath = await this.locateBackupFile('database', databaseBackup.filename);
      const dbCheck = await verifyDatabaseBackup(dbPath, databaseBackup.checksum);
      await this.finishRun(dbRunId, {
        status: dbCheck.ok ? 'success' : 'failed',
        filename: databaseBackup.filename,
        sizeBytes: databaseBackup.size,
        checksum: databaseBackup.checksum,
        verified: dbCheck.ok,
        error: dbCheck.ok ? undefined : dbCheck.reason,
      });
      if (!dbCheck.ok) throw new Error(`Database backup failed verification: ${dbCheck.reason}`);
```

and the analogous block for files, using `verifyFilesBackup(filesPath, filesBackup.checksum, getUploadsDir())`.

Add the helper that finds a written backup on disk:

```typescript
  /** Absolute path of a backup file inside the dated directory structure. */
  private async locateBackupFile(type: 'database' | 'files', filename: string): Promise<string> {
    const settings = await this.getBackupSettings();
    const typeDir = join(this.resolveBackupPath(settings), type);
    const found = this.findFileRecursive(typeDir, filename);
    if (!found) throw new Error(`Backup file not found after writing: ${filename} under ${typeDir}`);
    return found;
  }

  private findFileRecursive(dir: string, filename: string): string | null {
    if (!existsSync(dir)) return null;
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        const hit = this.findFileRecursive(full, filename);
        if (hit) return hit;
      } else if (entry === filename) {
        return full;
      }
    }
    return null;
  }
```

- [ ] **Step 4: Typecheck and commit**

Run: `npx tsc --noEmit 2>&1 | grep -c "error TS"` — expected `405`.

```bash
git add server/backupVerification.ts server/backupService.ts
git commit -m "feat: verify each backup by reading it back

Decompresses the archive, checks a database dump reaches pg_dump's
completion marker, and re-checks the checksum. A backup that fails is
recorded as failed rather than reported as a success."
```

---

## Task 7: Catch up missed runs, and expose backup health

**Files:**
- Modify: `server/backupScheduler.ts` (add catch-up on start)
- Modify: `server/routes.ts` (add `GET /api/backups/health` near the other backup routes, around :8882)

**Interfaces:**
- Consumes: `getLastSuccessfulRun` from Task 4, `runBackup(triggerLabel)` from Task 4.
- Produces: `GET /api/backups/health` returning `{ lastSuccessAt: string | null, ageHours: number | null, stale: boolean, lastError: string | null }`. Task 8's banner consumes it.

- [ ] **Step 1: Catch up on boot**

Add to `BackupScheduler`, and call it at the end of `start()`:

```typescript
  /**
   * node-cron only fires if the process happens to be alive at 02:00. A
   * container that restarts, sleeps, or redeploys across that window simply
   * never backs up, and nothing noticed for ten months. If the last verified
   * success is over a day old, run one shortly after boot.
   */
  private scheduleCatchUpIfOverdue(): void {
    const DELAY_MS = 5 * 60 * 1000; // let startup migrations finish first
    setTimeout(async () => {
      try {
        const last = await this.backupService.getLastSuccessfulRun();
        const ageMs = last?.finishedAt ? Date.now() - new Date(last.finishedAt).getTime() : Infinity;
        if (ageMs > 24 * 60 * 60 * 1000) {
          const age = Number.isFinite(ageMs) ? `${Math.round(ageMs / 3600000)}h old` : 'none on record';
          console.log(`Last verified backup is ${age} — running catch-up backup now`);
          await this.backupService.runBackup('catchup');
          await this.backupService.cleanupOldBackups();
        }
      } catch (error) {
        console.error('Catch-up backup failed:', error);
      }
    }, DELAY_MS).unref();
  }
```

Call it from `start()` immediately after `this.scheduledTask.start();`, and pass `'scheduled'` as the trigger in the cron callback's `runBackup` call.

- [ ] **Step 2: Add the health endpoint**

```typescript
  app.get("/api/backups/health", hasPermission(UserPermission.MANAGE_BACKUPS), async (req, res) => {
    try {
      const service = new BackupService();
      const last = await service.getLastSuccessfulRun();
      const status = await service.getStatus();
      const lastSuccessAt = last?.finishedAt ? new Date(last.finishedAt).toISOString() : null;
      const ageHours = lastSuccessAt
        ? Math.round((Date.now() - new Date(lastSuccessAt).getTime()) / 3600000)
        : null;
      res.json({
        lastSuccessAt,
        ageHours,
        stale: ageHours === null || ageHours > 48,
        lastError: status.lastError ?? null,
      });
    } catch (error) {
      console.error('Error reading backup health:', error);
      res.status(500).json({ message: 'Error reading backup health' });
    }
  });
```

Match however `BackupService` is already obtained in the surrounding backup routes — if there is a shared instance, use that rather than constructing a new one.

- [ ] **Step 3: Verify staleness logic against seeded history**

```bash
npx tsx -e "
import { db } from './server/db';
import { backupRuns } from './shared/schema';
import { BackupService } from './server/backupService';
await db.delete(backupRuns);
const svc: any = new BackupService();

// no history at all -> stale
let last = await svc.getLastSuccessfulRun();
if (last) { console.error('FAIL: expected no run'); process.exit(1); }

// a 3-day-old verified success -> stale
const oldDate = new Date(Date.now() - 72*3600*1000);
await db.insert(backupRuns).values({ type:'database', status:'success', trigger:'scheduled', verified:true, startedAt: oldDate, finishedAt: oldDate });
last = await svc.getLastSuccessfulRun();
const ageH = Math.round((Date.now() - new Date(last.finishedAt).getTime())/3600000);
if (ageH < 70) { console.error('FAIL: age wrong ' + ageH); process.exit(1); }

// an unverified success must not count
await db.delete(backupRuns);
await db.insert(backupRuns).values({ type:'database', status:'success', trigger:'scheduled', verified:false, finishedAt: new Date() });
last = await svc.getLastSuccessfulRun();
if (last) { console.error('FAIL: unverified run counted as success'); process.exit(1); }

console.log('PASS: age=' + ageH + 'h, unverified correctly ignored');
await db.delete(backupRuns);
process.exit(0);
"
```
Expected: `PASS: ...`

- [ ] **Step 4: Typecheck and commit**

Run: `npx tsc --noEmit 2>&1 | grep -c "error TS"` — expected `405`.

```bash
git add server/backupScheduler.ts server/routes.ts
git commit -m "feat: catch up overdue backups on boot, expose backup health

node-cron only fires if the process is alive at 02:00, so a container that
restarts across that window never backs up. Boot now runs one if the last
verified success is over a day old, and /api/backups/health reports
staleness."
```

---

## Task 8: Truthful status in the UI, plus a staleness banner

**Files:**
- Modify: `client/src/components/dialogs/backup-dialog.tsx` (:368 `formatDate`, :447 last-backup display)
- Modify: `client/src/pages/admin/backup.tsx` (:474 equivalent display)
- Create: `client/src/components/backup/backup-staleness-banner.tsx`

**Interfaces:**
- Consumes: `GET /api/backups/health` from Task 7.
- Produces: `<BackupStalenessBanner />`, rendered on the dashboard.

- [ ] **Step 1: Make `formatDate` honest about unparseable values**

In `backup-dialog.tsx`, replace the body of `formatDate` so an unparseable date says so rather than rendering "Invalid Date":

```typescript
  const formatDate = (dateString?: string) => {
    if (!dateString) return 'Never';
    const d = new Date(dateString);
    if (Number.isNaN(d.getTime())) return 'Unknown date';
    return d.toLocaleString();
  };
```

Apply the same change to the equivalent helper in `client/src/pages/admin/backup.tsx`.

- [ ] **Step 2: Add the banner component**

```tsx
// client/src/components/backup/backup-staleness-banner.tsx
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';

interface BackupHealth {
  lastSuccessAt: string | null;
  ageHours: number | null;
  stale: boolean;
  lastError: string | null;
}

/**
 * A backup system that fails silently is worse than none, because it is
 * trusted. This surfaces staleness where it will actually be seen.
 */
export function BackupStalenessBanner() {
  const { data } = useQuery<BackupHealth>({ queryKey: ['/api/backups/health'] });

  if (!data?.stale) return null;

  return (
    <div
      className="flex items-start gap-3 rounded-lg border border-red-300 bg-red-50 p-4 text-red-900"
      data-testid="banner-backup-stale"
    >
      <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-600" />
      <div className="text-sm">
        <p className="font-semibold">
          {data.lastSuccessAt
            ? `No verified backup in ${data.ageHours} hours`
            : 'No verified backup on record'}
        </p>
        <p className="mt-0.5">
          {data.lastError
            ? `Last error: ${data.lastError}`
            : 'Open Backup & Recovery to run one now.'}
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Render it on the dashboard**

Find the dashboard page (`client/src/pages/dashboard/index.tsx` or equivalent — locate with `grep -rln "Quick Actions\|quick-actions" client/src/pages`), import the banner, and render it near the top of the page content, above the existing cards.

- [ ] **Step 4: Verify in the browser**

Do not start a new dev server if one is already running on port 5000 — reuse it. With the app open, seed a stale state and confirm the banner appears:

```bash
npx tsx -e "
import { db } from './server/db';
import { backupRuns } from './shared/schema';
await db.delete(backupRuns);
console.log('history cleared — dashboard should now show the stale-backup banner');
process.exit(0);
"
```

Reload the dashboard: the red banner reading "No verified backup on record" must be visible. Then confirm it disappears once a verified run exists:

```bash
npx tsx -e "
import { db } from './server/db';
import { backupRuns } from './shared/schema';
await db.insert(backupRuns).values({ type:'database', status:'success', trigger:'manual', verified:true, finishedAt: new Date() });
console.log('verified run seeded — banner should disappear after reload');
process.exit(0);
"
```

- [ ] **Step 5: Typecheck and commit**

Run: `npx tsc --noEmit 2>&1 | grep -c "error TS"` — expected `405`.

```bash
git add client/src/components/dialogs/backup-dialog.tsx client/src/pages/admin/backup.tsx client/src/components/backup/backup-staleness-banner.tsx
git commit -m "feat: show truthful backup status and warn when backups are stale"
```

---

## Task 9: Safety backup before restore

**Files:**
- Modify: `server/backupService.ts` (`restoreDatabase` :622, `restoreComplete` :900)
- Modify: `server/routes.ts` (the restore endpoints, to require a confirmation filename)

**Interfaces:**
- Consumes: `runBackup('pre-restore')` from Task 4, verification from Task 6.
- Produces: `restoreDatabase(backupFilename: string, opts?: { skipSafetyBackup?: boolean })` — same signature plus an escape hatch used only when restoring *because* a backup failed.

- [ ] **Step 1: Take and verify a safety backup first**

At the top of `restoreDatabase`, before any destructive work:

```typescript
    if (!opts?.skipSafetyBackup) {
      console.log('Taking safety backup of current state before restore...');
      try {
        const safety = await this.createDatabaseBackup();
        const safetyPath = await this.locateBackupFile('database', safety.filename);
        const check = await verifyDatabaseBackup(safetyPath, safety.checksum);
        if (!check.ok) {
          throw new Error(`safety backup failed verification: ${check.reason}`);
        }
        const runId = await this.startRun('database', 'pre-restore');
        await this.finishRun(runId, {
          status: 'success', filename: safety.filename, sizeBytes: safety.size,
          checksum: safety.checksum, verified: true,
        });
        console.log(`Safety backup written and verified: ${safety.filename}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(
          `Refusing to restore: could not take a verified safety backup of the current data first (${message}). ` +
          `Restoring now would overwrite live data with no way back.`
        );
      }
    }
```

Add the `opts` parameter to the signature. Apply the same guard at the start of `restoreComplete`.

- [ ] **Step 2: Require an explicit confirmation on the restore endpoints**

In each restore route that targets an existing backup (`/api/backups/restore/database`, `/api/backups/restore/complete`), require the client to echo the filename:

```typescript
      const { filename, confirmFilename } = req.body ?? {};
      if (!filename) {
        return res.status(400).json({ message: 'filename is required' });
      }
      if (confirmFilename !== filename) {
        return res.status(400).json({
          message: 'Confirmation does not match. Type the exact backup filename to confirm this restore.',
        });
      }
```

- [ ] **Step 3: Verify the guard refuses when a safety backup cannot be taken**

`pg_dump` is unavailable locally, so `createDatabaseBackup` will throw — which is exactly the condition this guard exists for. That makes it directly testable here:

```bash
npx tsx -e "
import { BackupService } from './server/backupService';
const svc: any = new BackupService();
try {
  await svc.restoreDatabase('anything.sql.gz');
  console.error('FAIL: restore proceeded without a safety backup');
  process.exit(1);
} catch (error) {
  const msg = error instanceof Error ? error.message : String(error);
  if (!msg.includes('Refusing to restore')) {
    console.error('FAIL: wrong error, expected the safety-backup guard, got: ' + msg);
    process.exit(1);
  }
  console.log('PASS: restore refused — ' + msg.slice(0, 120));
}
process.exit(0);
"
```
Expected: `PASS: restore refused — Refusing to restore: ...`

This is a genuine assertion, not a workaround: it proves the destructive path will not run when the safety net is unavailable.

- [ ] **Step 4: Require typed confirmation in the UI**

In the restore UI (`backup-dialog.tsx` and `admin/backup.tsx`), add a text input beside the restore action. The restore button stays disabled until its value exactly equals the selected backup's filename, and the request body sends `confirmFilename` alongside `filename`.

- [ ] **Step 5: Typecheck and commit**

Run: `npx tsc --noEmit 2>&1 | grep -c "error TS"` — expected `405`.

```bash
git add server/backupService.ts server/routes.ts client/src/components/dialogs/backup-dialog.tsx client/src/pages/admin/backup.tsx
git commit -m "feat: require a verified safety backup and typed confirmation before restore

Restore overwrites live data. It now refuses to run unless a fresh backup of
current state was taken and verified first, and the caller must echo the
backup filename."
```

---

## Task 10: Retention that cannot leave you with nothing

**Files:**
- Modify: `server/backupService.ts` (`cleanupOldBackups`, near :1084)

**Interfaces:**
- Consumes: `backupRuns` from Task 2, `getLastSuccessfulRun` from Task 4.

- [ ] **Step 1: Protect the newest verified backup of each type**

In `cleanupOldBackups`, before deleting anything, collect the filenames that must survive regardless of age:

```typescript
    // Retention must never be able to leave the system with no backup at all.
    const protectedFilenames = new Set<string>();
    for (const type of ['database', 'files'] as const) {
      const newest = await this.getLastSuccessfulRun(type);
      if (newest?.filename) protectedFilenames.add(newest.filename);
    }
```

and skip any backup whose filename is in that set when applying the age cutoff.

- [ ] **Step 2: Mark pruned history rather than deleting it**

When a backup file is deleted, keep its history row:

```typescript
      await db.update(backupRuns)
        .set({ filePruned: true })
        .where(eq(backupRuns.filename, filename));
```

History rows are tiny and answer "was this machine backing up in March?" long after the file has gone.

- [ ] **Step 3: Verify the newest is never pruned**

```bash
npx tsx -e "
import { db } from './server/db';
import { backupRuns } from './shared/schema';
import { BackupService } from './server/backupService';
await db.delete(backupRuns);
const old = new Date(Date.now() - 400*24*3600*1000);
await db.insert(backupRuns).values({ type:'database', status:'success', trigger:'scheduled', verified:true, filename:'ancient.sql.gz', startedAt: old, finishedAt: old });
const svc: any = new BackupService();
const newest = await svc.getLastSuccessfulRun('database');
if (newest?.filename !== 'ancient.sql.gz') { console.error('FAIL: newest lookup wrong'); process.exit(1); }
console.log('PASS: a 400-day-old backup is still the newest verified one and must be protected from retention');
await db.delete(backupRuns);
process.exit(0);
"
```
Expected: `PASS: ...`

- [ ] **Step 4: Typecheck and commit**

Run: `npx tsc --noEmit 2>&1 | grep -c "error TS"` — expected `405`.

```bash
git add server/backupService.ts
git commit -m "fix: never let retention delete the last verified backup

Also keeps history rows after their file is pruned, so the record of what
ran survives the file itself."
```

---

## Task 11: Deployment verification (required before this is trusted)

**Files:** none — this is verification against the live deployment.

This task cannot be completed from the development machine. `pg_dump` is not installed here and the deployment's database is not reachable. **Nothing in Tasks 1-10 proves a real database dump works** — only that the surrounding machinery behaves.

- [ ] **Step 1: Configure the deployment**

In Coolify:
- Add `BACKUP_PATH=/backups`
- Delete `PRIVATE_OBJECT_DIR` (wrong variable; its value also carries a stray leading `=`)
- Confirm the volume is still mounted source `/backups` → destination `/backups`

- [ ] **Step 2: Deploy and trigger a manual backup**

Deploy, then use the Backup & Recovery screen's manual backup action.

- [ ] **Step 3: Confirm the run was recorded as verified**

The screen must show a real date (not "Invalid Date" or "Never"), and the database backup's size must be substantially more than 10 bytes. Both `backup_runs` rows must read `status: success`, `verified: true`.

- [ ] **Step 4: Confirm the file is on the volume and survives redeploy**

Via the Coolify terminal: `ls -la /backups/database/` — the file exists with a plausible size. Redeploy the app, then check again: it must still be there.

- [ ] **Step 5: Download it and check it independently**

Download through the UI. Confirm the downloaded size matches what the UI reported, then:

```bash
gunzip -c db-backup-....sql.gz | head -40
gunzip -c db-backup-....sql.gz | wc -c
gunzip -c db-backup-....sql.gz | tail -3
```

Expected: readable SQL with `CREATE TABLE` statements, a byte count in the tens of KB or more, and a final line `-- PostgreSQL database dump complete`.

- [ ] **Step 6: Prove it restores**

This is the only step that proves the backup is genuinely usable. Create a scratch database and restore into it:

```bash
createdb lvstest_restore_check
gunzip -c db-backup-....sql.gz | psql lvstest_restore_check
psql lvstest_restore_check -c "SELECT count(*) FROM reservations;"
psql lvstest_restore_check -c "SELECT count(*) FROM vehicles;"
psql lvstest_restore_check -c "SELECT count(*) FROM damage_check_templates;"
```

Expected: counts matching production. **Until this step passes, treat the system as unverified** no matter how healthy the UI looks.

- [ ] **Step 7: Keep an off-box copy**

Move the downloaded, verified backup off the server. A volume does not survive server loss; the download is the only thing that does.
