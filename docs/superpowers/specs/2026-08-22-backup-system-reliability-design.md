# Backup System Reliability

Date: 2026-08-22
Status: Approved for planning

## Problem

The app has a backup subsystem (`server/backupService.ts`, `server/backupScheduler.ts`)
that creates database and files backups, lists them, and can restore them. The
restore paths are implemented. But in the live deployment it has not produced a
successful backup in roughly ten months, and the UI reports this misleadingly
rather than as an error.

Observed in the deployment's Backup & Recovery screen:

- "Last Backup: **Never**", while three database and three files backups are
  listed directly below it.
- Every listed backup shows "**Invalid Date**".
- Every database backup shows a size of **10 Bytes**.
- Newest backup is dated 2025-10-19; the schedule claims daily at 02:00.
- No error is displayed, despite the UI having an error panel
  (`backup-dialog.tsx:461`).

Six distinct root causes, each confirmed by reading the code:

### 1. Manifest timestamps are not parseable dates

`createDatabaseBackup` and `createFilesBackup` build a filename-safe timestamp:

```js
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');  // backupService.ts:149, 268
```

and then store that same mangled string as the manifest's `timestamp` field
(`:201`, `:313`). `2025-10-13T21-49-25-494Z` is not valid ISO 8601 — the time
separators are gone — so `new Date(...)` returns `Invalid Date`. Verified.

This also silently breaks the "newest first" sort at `:588`, which compares
`new Date(b.timestamp).getTime()` values that are all `NaN`.

Note the uploaded-backup path (`:568`) uses `fileStat.mtime.toISOString()`, a
valid ISO string — so uploaded backups render correctly while created ones do
not.

### 2. Run status is stored in ephemeral `/tmp`

```js
private statusFile = '/tmp/backup-status.json';  // backupService.ts:37
```

`/tmp` is wiped on every container restart and redeploy. `lastSuccess` and
`lastError` are lost with it. This is why the screen says "Never" while backups
exist on disk, and why no error is shown even though every run may be failing:
the evidence is deleted before anyone reads it.

### 3. Object storage is the schema default and cannot work on this host

`backupSettings.storageType` defaults to `"object_storage"`
(`shared/schema.ts:919`). That path routes through `ObjectStorageService`, which
is hardwired to a Replit sidecar:

```js
const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";  // objectStorage.ts:5
```

The deployment runs on Coolify, where no such endpoint exists. If the
deployment's `backup_settings` row still carries `object_storage` from when this
app ran on Replit, every scheduled backup since the migration has failed at the
storage step — writing its error to `/tmp` and losing it on the next restart.
This is the leading explanation for the ten-month gap.

The local development database's row reads `local_filesystem`, so this cannot be
confirmed from the development environment; the deployment's row is not readable
from here. The design therefore removes the dependency on that row entirely
rather than relying on it being correct.

### 4. Backups are written inside the application directory

```js
private defaultBackupPath = join(process.cwd(), 'backups');  // backupService.ts:38
```

In a container this is ephemeral and is destroyed on redeploy. A persistent
volume is now mounted at `/backups`, but nothing in the code points there — the
path comes from `backupSettings.localPath` in the database, not from the
environment.

### 5. A missed schedule is never caught up, and never reported

`BackupScheduler.start()` registers a single `node-cron` job for `0 2 * * *`.
`node-cron` fires only if the process is alive at that moment. A container that
restarts, sleeps, or redeploys across 02:00 simply does not back up, and nothing
detects or reports the omission. There is no catch-up and no staleness alert.

### 6. Recorded sizes could be written before the file was flushed

`createDatabaseBackup` contains a comment documenting exactly this bug — "a 21KB
dump reported as 10 bytes" — and the fix (awaiting both `pipeline(...)` and
process exit) is present in the current code (`:185-193`). The 10-byte sizes in
the deployment are therefore most likely stale manifests written before that fix,
rather than genuinely empty dumps. This is **unconfirmed**: it requires
downloading one of the deployment's backups and checking its real size, which
cannot be done from the development environment.

## Goals

1. Backups are written to the mounted persistent volume, controlled by
   environment configuration rather than a database row.
2. Backup history survives restarts, so the reported status is always truthful.
3. A missed nightly run is caught up automatically rather than skipped silently.
4. Every backup is verified immediately after being written; one that fails
   verification is recorded as a failure, not as a success.
5. A stale or failing backup is visible in the app without going looking for it.
6. Restoring is recoverable from: a safety backup of current state is taken
   before any restore proceeds.
7. Backups remain downloadable through the UI, so off-box copies can be kept
   manually.

## Non-goals

- **No off-box/S3 replication.** Per explicit direction: the persistent volume
  plus manual download through the UI is the chosen model. This means a total
  loss of the server still loses any backup not downloaded — accepted trade-off,
  recorded here so it is a known limit rather than a surprise.
- **No consolidation of the duplicated backup routes.** `server/routes.ts` has
  20+ backup endpoints with real overlap (`download-data`, `download-code`,
  `download-files`, two generic `download/...` routes, and `restore-data` /
  `restore-code` / `restore-files` alongside `restore/database` /
  `restore/files` / `restore/complete`). This is genuine duplication and worth a
  later pass, but changing it is not required to make backups work and would
  enlarge the blast radius of this change.
- **No change to what the files backup covers.** `uploads/` only, which is
  correct — source code lives in git. Confirmed the container's `WORKDIR /app`
  makes `process.cwd()/uploads` resolve to `/app/uploads`, exactly where the
  uploads volume is mounted.
- **No scheduled test-restores.** Integrity verification is in scope; periodic
  restore-into-a-scratch-database is not.

## Design

### 1. Storage location from the environment

Add a `BACKUP_PATH` environment variable. Resolution order for the backup
directory becomes:

1. `process.env.BACKUP_PATH` if set
2. `backupSettings.localPath` from the database
3. `join(process.cwd(), 'backups')` as a last-resort default

Deployment configuration (Coolify):

- Volume already mounted: source `/backups` → destination `/backups`
- **Add** `BACKUP_PATH=/backups`
- **Delete** `PRIVATE_OBJECT_DIR` — it is the object-storage variable, not the
  backup path, and its current value `=/backups` carries a stray leading `=`.

### 2. Remove object storage from the backup path

Delete the `object_storage` branches from `createDatabaseBackup`,
`createFilesBackup`, `listBackups`, `restoreDatabase`, `restoreFiles`, and
`updateStatusFile`. Local filesystem becomes the only backend.

`backupSettings.storageType` keeps its column (other code may read it) but the
backup service stops branching on it. A settings row still saying
`object_storage` must not be able to break backups again.

`server/objectStorage.ts` itself is left alone — it may serve other features.
Only the backup service's use of it is removed.

### 3. Persist run history in the database

New table `backup_runs`:

| column | type | meaning |
|---|---|---|
| `id` | serial pk | |
| `startedAt` | timestamp not null | when the run began |
| `finishedAt` | timestamp | null while running |
| `type` | text not null | `database` \| `files` |
| `status` | text not null | `running` \| `success` \| `failed` |
| `filename` | text | resulting backup file |
| `sizeBytes` | integer | verified size on disk |
| `checksum` | text | sha256 |
| `verified` | boolean not null default false | passed integrity check |
| `error` | text | failure message, retained |
| `trigger` | text not null | `scheduled` \| `manual` \| `catchup` \| `pre-restore` |

This replaces `/tmp/backup-status.json` entirely. `getStatus()` reads the most
recent rows instead of the temp file. Because it lives in the same database the
app already depends on, it survives restarts and redeploys.

### 4. Real timestamps

`BackupManifest` gains a distinction:

- `timestamp` — a genuine ISO 8601 string (`new Date().toISOString()`)
- `filenameStamp` — the filename-safe variant, used only to build filenames

Sorting and display use `timestamp`.

Existing manifests on the volume have the mangled value. `listBackups` gains a
tolerant parse: if `timestamp` does not parse, fall back to the file's `mtime`
so old backups display a sensible date rather than "Invalid Date". No rewriting
of existing manifest files is required.

### 5. Catch-up on boot

On startup, after the scheduler registers its cron job, query `backup_runs` for
the most recent successful run. If it is older than 24 hours (or there is none),
schedule a catch-up run a few minutes after boot, recorded with
`trigger: 'catchup'`.

The delay keeps a restart loop from hammering the database, and staggering it
away from boot avoids competing with startup migrations.

### 6. Verify every backup

After a backup file is written and before its run row is marked `success`:

- **Database backups:** stream the `.sql.gz` through gunzip; assert it
  decompresses without error, that the decompressed output is non-trivially
  sized, and that it contains the expected trailing marker `pg_dump` emits
  (`-- PostgreSQL database dump complete`). A truncated or empty dump fails here.
- **Files backups:** assert the `.tar.gz` decompresses and lists at least one
  entry.
- **Both:** recompute the sha256 and confirm it matches what was recorded.

A backup failing verification sets `status: 'failed'`, `verified: false`, and a
descriptive `error`. It is not reported as a success.

### 7. Staleness visible in the app

A `GET /api/backups/health` endpoint returns the last verified success, its age,
and whether it is stale (older than 48 hours).

The Backup & Recovery screen shows truthful last-run / last-error information
sourced from `backup_runs`. A dashboard banner appears when the last verified
success is stale or absent, so a silent ten-month failure cannot recur unnoticed.

### 8. Safer restore

Before `restoreDatabase` or `restoreComplete` executes:

1. Take a fresh database backup of current state, recorded with
   `trigger: 'pre-restore'`.
2. If that safety backup fails or fails verification, abort the restore and
   report why. Restoring over live data without a fallback is not permitted.
3. Require the client to send the exact backup filename as confirmation; reject
   a mismatch.

The UI requires typing the backup name before the restore button activates.

### 9. Resolve the uploads directory the same way the app does

The files backup hardcodes its source directory:

```js
const uploadsDir = join(process.cwd(), 'uploads');  // backupService.ts:286
```

but every upload route resolves it through a helper that honours an
environment override:

```js
return process.env.UPLOADS_DIR || path.join(process.cwd(), 'uploads');  // routes.ts:65
```

These agree in the current deployment (`WORKDIR /app`, uploads volume mounted at
`/app/uploads`, `UPLOADS_DIR` unset), so nothing is being missed today. But if
`UPLOADS_DIR` were ever set, uploads would move while the backup carried on
archiving the old — probably empty — directory, reporting success the whole
time. That is the same silent-failure shape this work exists to remove.

The backup service must use the same resolution as the upload routes. Export
`getUploadsDir()` (currently a private function in `server/routes.ts`) into a
shared module and have both call it, so the two cannot drift apart.

Additionally, the files-backup verification (section 6) should fail a backup
whose archive contains **zero** entries while the source directory is non-empty,
rather than recording an empty archive as a success.

### What a full restore actually recovers

Recorded here so the coverage is explicit rather than assumed:

- **Database dump** — every table, therefore: all damage-check / contract /
  transport-report templates and their layouts, vehicle diagram records, all
  application settings (including the damage-check field configuration in
  `app_settings`), reservations, vehicles, customers, expenses, document
  records, users and permissions.
- **Files archive** — `uploads/` in full, therefore: template background images
  (`uploads/templates/`), vehicle diagram images (`uploads/vehicle-diagrams/`),
  damage-check header images (`uploads/damage-check/`), driver documents,
  receipts and uploaded documents.

Database and files backups are taken as a pair on every run, so a restore of
both from the same run yields a consistent system.

### 10. Retention

Existing `cleanupOldBackups` behaviour (retention days from settings, default
30) is kept. When it deletes a backup file, the corresponding `backup_runs` row
is **not** deleted — it is marked as having had its file pruned. History rows
are tiny and remain useful for answering "was this machine backing up in
March?" long after the file itself is gone.

Cleanup must never delete the most recent verified backup of each type,
regardless of its age. Retention must not be able to leave the system with no
backup at all.

## Testing

This repository has no automated test suite and `pg_dump` is not installed on
the development machine, so the database backup path cannot be exercised
end-to-end locally. Verification is therefore split:

**Locally (development):**
- Typecheck passes.
- Timestamp handling: assert a created manifest's `timestamp` parses to a valid
  date, and that a mangled legacy value falls back to `mtime` rather than
  rendering "Invalid Date".
- Verification logic: run the gzip/tar integrity checks against deliberately
  corrupted and truncated fixture files, and confirm they are rejected. These
  need no database.
- Catch-up logic: confirm that with a seeded `backup_runs` row older than 24h a
  catch-up is scheduled, and that with a recent one it is not.

**On the deployment (required before this is trusted):**
- Trigger a manual backup; confirm a `backup_runs` row reaches `success` with
  `verified: true` and a plausible size.
- Confirm the file exists under `/backups` and survives a redeploy.
- Download it through the UI and confirm the downloaded size matches, and that
  it gunzips to readable SQL containing table definitions.
- Restore it into a scratch database and confirm the data is present. This is
  the only test that proves the backup is genuinely restorable; without it the
  system is unverified no matter how green the UI is.

## Rollout

The deployment currently has no known-good backup. Order matters:

1. Deploy the change with `BACKUP_PATH=/backups` set and `PRIVATE_OBJECT_DIR`
   removed.
2. Trigger a manual backup and verify it as above.
3. Download that backup and keep a copy off the server before relying on
   anything else.

## Open risks

- **The 10-byte question is unresolved.** Whether the existing deployment
  backups are empty or merely mis-reported cannot be determined from here.
  Until a fresh verified backup exists, assume there is no usable database
  backup.
- **A volume is not off-box.** Server or disk loss still loses everything not
  downloaded. This is the accepted trade-off from the storage decision; the
  download step in Rollout is what mitigates it.
- **Restore remains destructive by nature.** The pre-restore safety backup
  reduces but does not eliminate the risk, since it depends on the very
  machinery being repaired. It is verified before the restore proceeds, which
  is the strongest available guard short of off-box copies.
