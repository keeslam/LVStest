# Phase 17 — Backups & Recovery (test report)

Date: 2026-09-10 22:44–23:10 (local, Europe/Amsterdam). Agent: QA/DB-engineer test agent. All evidence is from live runs against the dedicated `:5002` environment unless a line is explicitly marked *code-read*.

## Environment

| Item | Value |
|---|---|
| Server | `http://localhost:5002`, launch config `audit-bk` (tsx dev mode, auto-restart loop; no restart happened during the phase — pid 6200 up since 22:45:09) |
| Database | `lvs_audit_bk` (fresh clone of `lvs_audit`): 47 tables, 665 vehicles / 348 customers / 2125 reservations / 23 users / 8 portal_users / 281 documents, 31 MB (34 MB at the end) |
| `UPLOADS_DIR` | `C:\Users\kees lam\Desktop\LVStest-main\audit-uploads-bk` — 197 files, 114 MB, `temp/` subdir empty |
| `BACKUP_PATH` | `C:\Users\kees lam\Desktop\LVStest-main\audit-backups` — empty at start |
| `backup_settings` row | `localPath = C:\...\LVStest-main\backups` (ignored because `BACKUP_PATH` wins — verified in 5a) |
| Tooling on server PATH | pg_dump / psql 17.11, Git-for-Windows `tar.exe`, `gzip.exe`. **`gunzip` in Git-for-Windows is a `#!/bin/sh` script**, which Node's `spawn()` cannot execute (`spawn gunzip ENOENT`). For the restore tests I compiled a tiny `gunzip.exe` shim (`docs/audit/wip/scripts/files/p17/gunzip.cs`, `gunzip -c <file>` semantics incl. CRC/ISIZE trailer check; byte-identical output and identical exit codes to real gzip on the good, truncated and corrupted archives) into `%USERPROFILE%\.local\bin` (on the user PATH) and removed it at the end. |
| Scripts | `docs/audit/wip/scripts/p17-*.cjs|sh`, helper `p17-lib.cjs` (BASE :5002, unique `10.17.1.x` fake IPs). Fixtures + logs + snapshots under `docs/audit/wip/scripts/files/p17/` (gitignored; sha256 list in `fixtures.sha256`). |
| Not touched | port 5000/5001, `lvstest`, `lvs_audit`, the repo's `uploads/`. The repo's `backups/` received 5 `uploaded-*` files from the upload test (the route hardcodes it, B17-004) — all removed again by the script. |

## Route / scheduler inventory

All routes are behind `hasPermission(MANAGE_BACKUPS)` (`server/routes/backups.ts`). Verified status codes are from this phase.

| Route | Purpose | Notes / observed |
|---|---|---|
| `GET/POST /api/backup-settings`, `PUT /api/backup-settings/:id` | `backup_settings` row | `PUT` accepts any `localPath`; it is dead when `BACKUP_PATH` is set (`backupService.ts:52-54`), `/api/backups/health` keeps reporting the env path |
| `GET /api/backups/status` | `{isRunning,nextScheduled,lastSuccess,lastError}` from `backup_runs` (`:187-214`) | `nextScheduled` is always "tomorrow 02:00 local" (`:217-223`) |
| `GET /api/backups/health` | `{lastSuccessAt, ageHours, stale(>48h), lastError, backupPath, backupPathFromEnv}` — the older of the two types' last verified success | works; `backupPathFromEnv:true` here |
| `GET /api/backups/list[?type&limit]`, `GET /api/backups` | manifests under `BACKUP_PATH/<type>/YYYY/MM/DD` + loose `*.sql`, `*.sql.gz`, `*.tar.gz`, `*.tgz` in the root (synthesised as `checksum:"uploaded"`) | works |
| `POST /api/backups/run` | `runBackup('manual')`: database → verify → files → verify; single-flight `isRunning` | 200 in 6.3–8.4 s; second concurrent call → **500** `Backup is already running` |
| `GET /api/backups/download/:filename` and `/download/:type/:filename` | stream; `Content-Disposition: attachment; filename="…"`, `Content-Type: application/gzip`, no `Content-Length` | byte-identical to disk (sha256 match, see §Backup content) |
| `DELETE /api/backups/:type/:filename` | delete file + manifest | not exercised beyond code-read |
| `POST /api/backups/cleanup` | GFS retention (`:1129-1227`) | works (see §Retention) |
| `POST /api/backups/upload` (multer, 1 GB) | writes to **`process.cwd()/backups`** (`:798`), not `BACKUP_PATH` | B17-004 |
| `POST /api/backups/restore/database` `{filename, confirmFilename}` | `backupService.restoreDatabase` (`:702-846`): safety backup → locate → `gunzip -c` → manifest checksum → `psql <url> -f file` | works for good archives; see B17-001/003/006/009 |
| `POST /api/backups/restore/files` `{filename}` | `restoreFiles` (`:855-970`): safety backup → checksum → `tar -xzf … -C process.cwd() --overwrite` | no confirm field; B17-002/009 |
| `POST /api/backups/restore/complete` | both safety backups, then DB restore, then files restore | not atomic, B17-007 |
| `POST /api/backups/restore-data` (upload) | sniff gzip magic → decompress with zlib → probe first 4 KB for dump markers → safety backup → `DROP TABLE … CASCADE` all → `psql -f` (`:173-331`) | works; no typed confirmation; B17-001 |
| `POST /api/backups/restore-files` (upload) | safety backup → `tar -xzf upload -C process.cwd()` (`:452-514`) | B17-002 |
| `POST /api/backups/restore-code` (upload) | `tar -xzf` over cwd + `process.exit(0)` | **not executed** (BUG-069, RCE) |
| `GET /api/backups/download-data` | `pg_dump "$DATABASE_URL" > cwd/temp/car-rental-data-<date>.sql` (no `--clean/--no-owner`), `res.download`, unlink after send | 200, 20 087 186 bytes plain SQL, `Content-Disposition: attachment; filename="car-rental-data-2026-09-10.sql"`; contains the SMTP password (BUG-010) and `OWNER TO` lines |
| `GET /api/backups/download-files` | `tar -czf … -C cwd uploads` — **`process.cwd()/uploads`**, not `getUploadsDir()` (`:406`) | 500 on this host (tar drive-letter, B17-009); wrong directory by code (B17-008) |
| `GET /api/backups/download-code` | tar of cwd minus excludes | 500 on this host (same tar issue); not further tested |

Scheduler (`server/backupScheduler.ts`): `node-cron '0 2 * * *'` Europe/Amsterdam → `runBackup('scheduled')` + `cleanupOldBackups()`; boot catch-up (`:65-83`): 5 min after start, if the older of the two types' last verified success is > 24 h old (or none) → `runBackup('catchup')` + cleanup. **Observed:** server started 22:45:08; `backup_runs` 285/286 `trigger=catchup` started 22:50:16 (stored as `20:50:16` UTC in a `timestamp without time zone` column), both `success`, `verified=true`, files `db-backup-2026-09-10T20-50-16-751Z.sql.gz` (13 046 626 B) and `files-backup-2026-09-10T20-50-18-431Z.tar.gz` (117 824 514 B). The 02:00 run itself was not awaited. The previous 28 `catchup` rows in the cloned table (from `:5001`) all failed with the exact `backupService.ts:260` string `pg_dump executable not found on PATH. Install the PostgreSQL client tools (postgresql-client) on this host to enable database backups.`; the UI renders `status.lastError` in a red box (`backup-dialog.tsx:573-578`, "Last backup error:") and the health tile shows `stale` after 48 h.

`BackupScheduler.getStatus()` (`:96-112`) adds one day and then another when `hours >= 2` → "day after tomorrow"; it is not referenced by any route (dead code, *code-read*).

## Backup content verification

Manual run (`p17-a-inventory-run.cjs`, `POST /api/backups/run` → 200 in 6 823 ms):

| File | Size | sha256 (disk) | Manifest checksum | Download `/download/:type/:filename` | `/download/:filename` |
|---|---|---|---|---|---|
| `database/2026/09/10/db-backup-2026-09-10T20-50-42-649Z.sql.gz` | 13 046 975 | `47a61e34…54e5bb` | identical | 200, 13 046 975 B, sha identical | identical |
| `files/2026/09/10/files-backup-2026-09-10T20-50-44-059Z.tar.gz` | 117 824 503 | `7f7d62c1…07602` | identical | 200, sha identical | identical |

Manifest sidecar `<file>.manifest.json` (`timestamp, filenameStamp, type, filename, size, checksum, metadata.compressedSize|fileCount`). `backup_runs` 287/288 `manual success verified=true`.

Database dump (catch-up archive gunzipped: 20 110 669 B): header `\restrict …` (pg_dump 17.11), `--clean --if-exists` present (47 × `DROP TABLE IF EXISTS`, 123 × `DROP CONSTRAINT`), **0** `OWNER TO` / `GRANT` lines (owner/privileges stripped), 47 `CREATE TABLE`, 47 `COPY` blocks, 46 `setval`, no `\connect`, ends with `PostgreSQL database dump complete`. Row counts inside the dump vs live at the same moment: vehicles 665/665, customers 348/348, reservations 2125/2125, users 23/23, portal_users 8/8, app_settings 5/5, session 8/9 and backup_runs 263/265 (the live table had grown by the run's own rows — the dump captures the running backup's own `backup_runs` rows with `status='running'`, see B17-010).

What an attacker with one archive gets: the full `session` table (live `connect.sid` values + cookie JSON — usable for hijack until expiry, 15 min rolling), `users.password` scrypt hashes + salts, `portal_users.password_hash`, `login_attempts`, `audit_logs`, the SMTP password in clear text (`app_settings.email_config.smtpPassword = "AUDIT-super-secret-smtp-pw"`, BUG-010), CJIB FTPS config, all customer PII. On this host the files are NTFS-inherited `SYSTEM/Administrators/kees lam:(F)` only (not world-readable); in the Docker deployment the mode is whatever the volume gives (not testable here).

Files backup (`tar -tzvf`): 197 entries = 197 regular files on disk (`comm` on both sorted lists: none only-on-disk, none only-in-tar); all paths relative under `uploads/…` (no absolute paths, no `..`), no symlinks/directories, owner `0/0`, mode `rw-rw-rw-`. Contents match the real `UPLOADS_DIR` (contracts, damage-checks, reports, drivers, cjib, templates, per-plate dirs). Nothing outside the uploads dir. `metadata.fileCount = 197`.

## Restore matrix

Snapshots: `files/p17/snap-*.txt`; request log `files/p17/restore-log.jsonl`; server log via preview logs. "Mutations" = `p17-mutate.cjs`: create AUDIT-P17 vehicle + customer + reservation, delete vehicle 1809 `AU-131-X` (typed confirmation), upsert `app_settings.audit_p17_marker`.

| # | Case | Request | Result | DB state afterwards | Recoverable? |
|---|---|---|---|---|---|
| 4a | good archive via `restore/database` (after mutations) | 200 in 4 298 ms, `safetyBackupFilename: db-backup-…20-54-52-663Z.sql.gz` | mutations gone: vehicles 665 (max id 1877 = `vehicles_id_seq.last_value`), customers 348, reservations 2125, `audit_p17_*` 0, marker gone, vehicle 1809 back; `session` 10 rows = dump; caller's session → `GET /api/user` **401**; admin re-login 200; `POST /api/vehicles` afterwards → 201 id 1878 (no duplicate key); portal login 200 (hash digest `6743560a` unchanged); SMTP password back; default admin: the existing `admin` row is in the dump — nothing recreated (no restart) | yes; but `backup_runs` now = dump content: rows 287/288 stuck at `running`, the `pre-restore` row 289 is gone (B17-010); a 20 MB plaintext `db-backup-…42-649Z.sql` stays next to the archive (B17-006) |
| 4a' | same, first attempt without the gunzip shim | 500 `spawn gunzip ENOENT` in 1 533 ms **after** the 13 MB safety backup (run 289) | unchanged | n/a (B17-009) |
| 4b-i | downloaded `.sql.gz` via `restore-data` | 200 in 3 971 ms | identical to 4a; session 401; temp `restore-<ts>.sql` removed | yes |
| 4b-ii | plain `.sql` (gunzipped dump) via `restore-data` | 200 in 3 513 ms | mutations rolled back | yes |
| 4b-iii | gzip bytes named `gzcontent.sql` | 200 in 3 799 ms (magic sniff wins over extension) | restored | yes |
| 4b-iv | SQL text named `sqlcontent.sql.gz` / `.tar.gz` | **400** `Could not verify file type` (file-type check) in ~130 ms | unchanged | n/a |
| 4c | `restore/files` with root-uploaded marker tar (`uploads/AUDIT-P17-marker-restorefiles.txt`) | **500** in 8 120 ms `Files restore failed with code 2 … tar (child): Cannot connect to C: resolve failed` — after a 117 MB files safety backup | no file written anywhere | Windows-only tar failure (B17-009). Target directory is `process.cwd()` by code (`:927-934`) = the repo, **not** `UPLOADS_DIR` → B17-002. Deliberately not forced (would write into the repo's `uploads/`). |
| 4c' | `restore-files` (upload) marker | 500, same tar error, safety backup taken | none | idem |
| 4d | `restore/complete` (good DB archive + marker tar) after mutations | **500** in 12 348 ms `Complete restore failed: Files restore failed …` | **database WAS restored** (vehicles 665, mutations gone, sessions replaced → everyone logged out) while the response says failed; files untouched | B17-007 |
| 4e-1 | `p17-trunc50.sql.gz` (first 50 % of bytes) via `restore/database` | 500 `Decompression failed with code 1` in 1 547 ms | unchanged (safety backup taken first) | n/a |
| 4e-2 | `p17-corrupt.sql.gz` (8 bytes overwritten at 50 %) | 500 `Decompression failed with code 1` | unchanged | n/a |
| 4e-3 | `db-backup-p17-tamper.sql.gz` = valid gzip with one extra comment line + the **original** manifest (checksum of the untampered file) placed in `database/2026/09/10` | 500 `Backup file integrity check failed - checksum mismatch` in 1 898 ms | unchanged | manifest verification proven (order: gunzip first (`:759-778`), then checksum (`:784-792`), then psql) |
| 4e-4 | `p17-sqlerror.sql.gz`: `INSERT INTO nonexistent VALUES (1);` inserted after the schema part (line 2936) | **200 success** in 4 414 ms | fully restored (the bad statement was harmless); psql printed `ERROR: relation "nonexistent" does not exist` and exited 0 | — |
| 4e-5 | `p17-copyerror.sql.gz`: first `vehicles` COPY row id replaced by `NOTANINT` | **200 success** in 4 171 ms | **`vehicles` = 0 rows** (665 dropped, COPY aborted), `vehicles_id_seq` 1877, FK cascades: `apk_date_changes`, `fines` COPYs also failed (7 ERROR lines, psql exit 0); customers/reservations/users intact | via psql only (B17-001) |
| 4e-6 | `p17-half.sql` (plain SQL cut at 50 % of lines) | **200 success** in 2 645 ms | **vehicles 0, reservations 0, users 0, session 0**, customers 348, all sequences = 1; `POST /api/login` → 401 then **429 account locked** (failed logins against an empty users table count as failures) — app completely locked out, no in-app way back | psql from the app's own safety backup `db-backup-…21-00-58-070Z.sql.gz` → exit 0 in 2 920 ms, state back, login 200 (B17-001) |
| 4f | `p17-connect.sql.gz` = `pg_dump --create --clean` of scratch DB `lvs_audit_bk_other` (`DROP DATABASE IF EXISTS`, `CREATE DATABASE`, `\connect lvs_audit_bk_other`) | **200 success** in 8 206 ms; caller's session **still valid** (200) | target `lvs_audit_bk` **untouched** (mutations still present); `lvs_audit_bk_other` was dropped and re-created by the restore | nothing restored while "success" (B17-003) |
| 4g | `restore/database` while a writer loops `POST /api/vehicles` every 100 ms | restore 200 in 4 004 ms; writer: 27 × 201 before, then 1 × 400 `relation "vehicles" does not exist`, 3 × 500 `relation "session" does not exist` (with `stack` in the body), 7 × 403 `CSRF_INVALID`, 27 × 401; no request > 1 s, no deadlock | 665 vehicles, 0 `AUDIT-P17-conc` rows (all 27 pre-restore inserts wiped, expected) | consistent |
| 6 | `p17-empty.sql.gz` = dump of `lvs_audit_bk_empty` (47 tables from `startup-migration.js`, 0 rows; that schema has **no FKs**, so the dump has only 49 `DROP CONSTRAINT` lines vs 123) | **200 success** in 2 419 ms | `DROP TABLE vehicles` etc. failed on dependent FKs → data kept (665 vehicles, 23 users) **but every sequence reset to 1** (`vehicles_id_seq.last_value = 1`, min id 2 → the second insert collides), `backup_runs` 0 rows, `session` 1 → operator sees "success", login still works, inserts start failing | psql from safety backup, then app restore of the good archive (B17-001 consequence) |

Environment/platform note: every restore path on this Windows host first spends 1.3–13 s on a safety backup and then fails in `gunzip` (until the shim was added) or `tar` (files) — 6 × 117 MB files safety archives were produced by failed attempts alone.

## Failure modes

| Case | What was done | Observed |
|---|---|---|
| 5a `localPath` → missing dir | `PUT /api/backup-settings/1 {localPath:"C:\AUDIT-P17-does-not-exist\backups"}` → 200; `POST /run` | 200 in 8 436 ms; file landed in `BACKUP_PATH` (`db-backup-…21-05-36-638Z.sql.gz`), missing dir never created, health still reports the env path. **`BACKUP_PATH` env wins; the DB setting is only effective when the env var is unset** (`backupService.ts:52-54`). Setting restored afterwards. |
| 5b backup dir not writable | `icacls …\database\2026\09\10 /deny "kees lam:(W)"`; `POST /run` | **500** in 1 370 ms `Failed to save database backup to C:\…\audit-backups: EPERM: operation not permitted, copyfile 'C:\Users\KEESLA~1\AppData\Local\Temp\db-backup-…' -> '…'`; `backup_runs` 293 database `failed` and 294 files `failed` with the same message (files never attempted); `/status.lastError` and `/health.lastError` carry the string with the full temp and target paths; after `/remove:d` the next run → 200 and `lastError` disappears (failure superseded by success). |
| 5c `BACKUP_PATH` directory missing | renamed `audit-backups` → `.moved`; health/list/run; merged back | `/health` 200 unchanged (no existence check), `/list` → `[]` (silently empty), `/run` → 200 in 7 530 ms, directory recreated via `mkdir -p`, list = 2. No warning that history vanished. |
| disk full | not simulated (no quota tooling on this host) | — |
| `pg_dump` missing | cannot be simulated on `:5002` without restart | error string cited above (`:259-260`); 28 historical `catchup` failures with that exact string are in the cloned `backup_runs`; the UI shows it in the red "Last backup error" box. |
| `gunzip`/`tar` missing or unusable | real on this host (see Environment) | B17-009 |

## Retention / concurrency

Retention (`p17-8-retention.sh`): 7 synthetic archives (2 KB, valid manifests, matching `backup_runs` rows) placed in dated directories + one loose root file `uploaded-old.sql.gz` with mtime 2024-01-01. `POST /api/backups/cleanup` → 200 in 56 ms.

| Archive | Age / rule | Expected | Result |
|---|---|---|---|
| `db-backup-2026-08-20…` | 21 d, Thursday | delete | deleted, `file_pruned=true` |
| `db-backup-2026-08-23…` | 18 d, Sunday | keep (weekly) | kept |
| `db-backup-2026-06-01…` | 101 d, 1st | keep (monthly) | kept |
| `db-backup-2026-06-15…` | 87 d | delete | deleted, pruned |
| `db-backup-2025-05-01…` | 497 d, 1st | delete (> 365 d) | deleted, pruned |
| `files-backup-2026-08-20…` | 21 d | delete | deleted, pruned |
| `files-backup-2026-06-01…` | 101 d, 1st | keep | kept |
| `uploaded-old.sql.gz` (root) | 2.7 y, uploaded | never | kept |

Manifests are deleted with the archives; `backup_runs` rows survive with `file_pruned=true`; empty `YYYY/MM/DD` directories are left behind. "Newest per type is protected" could not be exercised (today's 30 archives are all < 14 d); *code-read* `:1156-1176`. 5 quick backups in a row (5a–5c, 9) all succeeded; cleanup deleted none of them.

Concurrency (`p17-9-concurrent-backup.cjs`): two `POST /api/backups/run` fired simultaneously → A 200 (6.3 s), B **500** `{"error":"Backup is already running"}`; exactly one archive + manifest per type written; `/status.isRunning=true` during the run; a third call during a run → 500 again. No corruption. (Status code should be 409; the UI only disables the button while `status.isRunning` is true from polling.)

## Timings table

| Operation | n | Duration | Size |
|---|---|---|---|
| Database backup (pg_dump + gzip -9, 47 tables, ~11 k rows in the 8 largest tables, 34 MB DB) | 7 | 1.30–1.69 s (avg 1.44 s manual) | 13.0 MB gz / 20.1 MB SQL |
| Files backup (197 files, 114 MB, archiver gzip -9) | 7 | 6.3–8.4 s (12.5 s for the boot catch-up while startup was still busy) | 117.8 MB |
| Full `POST /run` | 7 | 6.3–8.4 s | — |
| `restore/database` (safety backup + gunzip + checksum + psql) | 6 good | 4.1–4.4 s (8.2 s for the `\connect` dump) | — |
| `restore-data` upload | 3 | 3.5–4.0 s | — |
| psql alone (`-f`, 20 MB SQL) | 2 | 2.9 s | — |
| `download-data` | 1 | 0.83 s | 20.1 MB |
| 200 MB upload | 1 | 1.1 s | — |

Extrapolation (honest, linear-ish): pg_dump/psql on this data are I/O bound and scale ~linearly with dump size; a 10× database (≈200 MB SQL) should back up in ~15 s and restore in ~30–40 s, but the whole restore runs in a single psql pass without transaction, so the "everything dropped, nothing loaded yet" window grows with it. The files half dominates: gzip -9 of 114 MB already takes 6–8 s, so 10 GB of uploads (~10 min per run, and per safety backup) would make every restore take 10+ minutes before anything happens and would leak 10 GB into `/tmp` per run (B17-005). Not measured beyond the real data set.

## Tested (passed)

- Backup creation of both types via manual run and boot catch-up; verification (gunzip, size floor, completion marker, sha256) runs after every backup and records `verified=true`.
- Dump flags `--clean --if-exists --no-owner --no-privileges`; owner/privilege statements absent; 47/47 tables; row counts equal live.
- Manifest checksum = disk sha256 = download sha256 (both download routes); `Content-Disposition: attachment`.
- Files archive complete (197/197), relative paths only, no symlinks, matches `UPLOADS_DIR`.
- Good-archive restore via `restore/database` and via `restore-data` (gz, plain SQL, gz-named-.sql) → data, sequences, portal users, SMTP setting, admin all correct; sessions invalidated (all users logged out, new login works).
- Safety backup taken and verified before every destructive path (incl. upload paths); refused-to-restore path not triggered.
- Truncated gzip, corrupted gzip, tampered file with manifest → all refused before psql runs; nothing changed.
- Non-dump uploads refused by the content sniff (`Could not verify file type` / `does not look like a PostgreSQL dump`).
- `restore/database` requires `confirmFilename` (400 on mismatch, *code-read* `:858-862`); `restore/complete` requires both.
- Retention GFS behaves as documented; uploaded/loose files never pruned; `backup_runs` kept as `file_pruned`.
- Single-flight backup guard shared by scheduler and route.
- `BACKUP_PATH` precedence over the DB setting; unwritable directory → failed run rows + `lastError` surfaced in status/health/UI; error cleared by the next success.
- Concurrent writers during a restore: no deadlock, no partial state; writers fail fast (400/500/403/401).
- `upload`: text-as-gz, zip-as-gz, 0-byte `.sql.gz`, `.exe` all refused; 200 MB accepted in 1.1 s (limit 1 GB).
- Boot catch-up scheduling fires 5 min after start when the last verified success is > 24 h old.

## Not tested (why)

- Real 02:00 cron run (would require waiting; catch-up path exercised instead).
- Files restore end-to-end (deleted-document recovery, extra files kept/removed, open file handles): GNU tar on Windows parses `C:\…` as `host:file` → every files restore fails before extraction; forcing it would extract into the repo's `uploads/` (out of bounds). Target directory proven by code only.
- `restore-code` (BUG-069, destructive RCE primitive; would also `process.exit`).
- `download-code` content (500 on this host for the same tar reason).
- Disk full; `pg_dump` absent at runtime on `:5002`.
- "Newest backup is protected" retention rail (all real backups too young).
- ACL of backup files inside the Docker deployment.
- Restore under real production connection load (only one writer loop).

## Findings summary table

| ID | Sev | Title |
|---|---|---|
| B17-001 | CRITICAL | Restore reports success when psql fails or the dump is incomplete (no `ON_ERROR_STOP` / no transaction): silent data loss up to a fully locked-out app |
| B17-002 | HIGH | Files restore (3 paths) extracts into `process.cwd()`, not `UPLOADS_DIR`; safety backup is taken from a different directory than the one overwritten |
| B17-003 | HIGH | A dump containing `\connect`/`CREATE DATABASE` restores into another database (and drops it first) while the target stays untouched and the API reports success |
| B17-004 | HIGH | `POST /api/backups/upload` stores files in `process.cwd()/backups` instead of `BACKUP_PATH` → uploaded backups cannot be listed, downloaded or restored (404) |
| B17-005 | MEDIUM | Every backup leaks its temp copy in `os.tmpdir()` (13 MB + 118 MB per run, never deleted) |
| B17-006 | MEDIUM | `require is not defined` (ESM) in `restoreDatabase` cleanup → 20 MB plaintext dump left next to the archive (or in the root, where it is listed as a restorable backup) |
| B17-007 | MEDIUM | `restore/complete` is not atomic: database already replaced (all sessions killed) when the files step fails; response says the restore failed |
| B17-008 | MEDIUM | `download-files` archives `process.cwd()/uploads` instead of `UPLOADS_DIR`; `download-data` dump lacks `--clean/--no-owner` and is written to the app directory |
| B17-009 | LOW | Restore depends on external `gunzip`/`tar` binaries although zlib/archiver are already used; on a Windows host every restore fails after the safety backup (`spawn gunzip ENOENT`, `tar: Cannot connect to C:`) |
| B17-010 | LOW | The running backup's own `backup_runs` rows are captured as `running` in the dump; after a restore the history shows phantom running runs and the `pre-restore` row is gone |
| B17-011 | LOW | Status/UX gaps: concurrent run → 500 instead of 409; `nextScheduled` always "tomorrow 02:00"; `/list` silently empty and `/health` green when `BACKUP_PATH` does not exist; cleanup leaves empty date directories; 0-byte `.sql` accepted as an upload; `restore-data`/`restore-files` have no typed confirmation |

## BUGs

```
BUG B17-001
Severity: CRITICAL
Feature: Database restore — backupService.restoreDatabase (/api/backups/restore/database, /restore/complete) and the upload route /api/backups/restore-data
Status: OPEN
Reproduction: docs/audit/wip/scripts/p17-e-partial.sh (fixtures built from the good archive dl-db-backup-2026-09-10T20-50-42-649Z.sql.gz):
  (a) p17-copyerror.sql.gz — first COPY row of vehicles has id "NOTANINT" → POST /api/backups/restore/database {filename, confirmFilename} → 200 {"success":true,...}; SQL: vehicles 0 rows (was 665), apk_date_changes/fines COPY also failed (FK), rest restored.
  (b) p17-half.sql — plain dump cut at 50 % of the lines (e.g. an incomplete download) → 200 success; SQL: vehicles 0, reservations 0, users 0, session 0, customers 348, every sequence at 1; POST /api/login → 401, after 5 attempts 429 "Account temporarily locked"; no admin exists, no restart happens → application unusable.
  (c) p17-empty.sql.gz — schema-only dump of a DB created by startup-migration.js (no FKs) → 200 success; DROP TABLE failed on dependent FKs so the data stayed, but all sequences were reset to 1 (vehicles_id_seq.last_value=1, min(id)=2) and backup_runs/session were emptied → later inserts hit duplicate keys.
  Direct reproduction without the app: psql -U postgres -h localhost lvs_audit_bk_other -f p17-copyerror.sql → 7 "ERROR:" lines, exit code 0; with -v ON_ERROR_STOP=1 → exit code 3 at line 14948.
Expected: a restore that hits any SQL error (or a dump that does not end with the completion marker) aborts, leaves the database as it was (or restores the safety backup automatically), and returns an error naming the failing statement.
Actual: psql is run as `psql <DATABASE_URL> -f <file>` without ON_ERROR_STOP and without --single-transaction (backupService.ts:798-823; routes/backups.ts:283-295 with `2>&1` so stderr is not even inspected). psql continues after every error and exits 0, so the route answers 200 "Database restore completed successfully". The pre-restore safety backup exists on disk but can only be applied with psql on the server — the app itself has no "undo" and, in case (b), no user can log in to trigger anything.
Root cause: server/backupService.ts:798-801 (spawn('psql', [url, '-f', file])) and server/routes/backups.ts:283-286 (execAsync(`psql "${url}" -f "${file}" 2>&1`)); no `-v ON_ERROR_STOP=1`, no `--single-transaction`, no check of the "PostgreSQL database dump complete" marker before psql (verifyDatabaseBackup is only used after creating a backup, not before restoring; the restore-data probe only looks at the first 4 KB).
Affected files: server/backupService.ts, server/routes/backups.ts, server/backupVerification.ts (unused for restore)
Affected data: every table; sequences; sessions; users (lock-out)
Security impact: an operator-supplied archive is executed statement by statement with the app's DB credentials (superuser `postgres` here); errors are swallowed, so a hostile or damaged file can leave a half-loaded database that still says "success".
Business impact: a bad archive (incomplete download, disk error, wrong schema version) destroys the live data set with a green result; recovery needs shell + psql access, which the Coolify operator does not have in the app.
Fix: run psql with `-v ON_ERROR_STOP=1 --single-transaction` (the dump is a single pg_dump plain script, so one transaction works; drop `\restrict` compatibility issues by using `pg_restore -Fc` in the long run), fail the request on non-zero exit and include the first ERROR line; before dropping anything run verifyDatabaseBackup (completion marker + gunzip) on the file to be restored, including uploads; on failure automatically re-apply the safety backup or at least state its filename and that the DB is now partial.
Regression test: vitest against a scratch DB: restore the copyerror fixture → expect 500 with "invalid input syntax" and unchanged row counts; restore the half fixture → 500, users count unchanged; good archive → 200 and counts equal the dump.
```

```
BUG B17-002
Severity: HIGH
Feature: Files restore — backupService.restoreFiles (/api/backups/restore/files, /restore/complete) and /api/backups/restore-files (upload)
Status: OPEN
Reproduction: code + archive evidence (runtime extraction impossible on this Windows host, see B17-009; deliberately not forced because the target is the repo's own uploads/):
  - tar -tzf files-backup-2026-09-10T20-50-44-059Z.tar.gz → all 197 entries are `uploads/<...>` (archiver name `uploads/…`, backupService.ts:352).
  - restoreFiles extracts with `tar -xzf <file> -C ${targetPath || process.cwd()} --overwrite` (backupService.ts:927-934); the routes never pass targetPath (routes/backups.ts:896-921). restore-files: `tar -xzf "${req.file.path}" -C "${process.cwd()}"` (routes/backups.ts:481).
  - On :5002 process.cwd() = C:\Users\kees lam\Desktop\LVStest-main\LVStest-main while UPLOADS_DIR = C:\…\audit-uploads-bk (the tar failed with `Cannot connect to C:` but the -C argument in the error message is the repo directory: files/p17/restore-log.jsonl).
  - The safety backup taken immediately before (takeSafetyBackup('files')) archives getUploadsDir() (backupService.ts:348) — a different directory than the one the extraction overwrites.
Expected: files are restored into getUploadsDir() (the directory the app serves and backs up); a deleted document is back after the restore.
Actual: with UPLOADS_DIR set (DEPLOYMENT_CONFIG.md:13/29 documents it as the intended production setting; the code comment at backupService.ts:848-855 claims the paths match), extraction lands in <cwd>/uploads: deleted documents are not recovered, the served directory is unchanged, and in a container <cwd>/uploads is ephemeral. Without UPLOADS_DIR the paths coincide by accident.
Root cause: server/backupService.ts:927 (`const extractPath = targetPath || process.cwd()`), server/routes/backups.ts:481 and :356; archive entries carry the fixed prefix `uploads/` regardless of the real directory name.
Affected files: server/backupService.ts, server/routes/backups.ts
Affected data: all uploaded documents/contracts/licences/photos/templates
Security impact: `--overwrite` into the application directory with archive-controlled paths under `uploads/` (BUG-069 covers the traversal/RCE angle for restore-code; here it is the same primitive for the "safe" restore).
Business impact: the documented files-recovery procedure does not recover files in the documented deployment layout; the operator sees "Files restore completed successfully".
Fix: extract with `--strip-components=1 -C getUploadsDir()` (or archive with an empty prefix), verify entries stay inside the target (reject `..`/absolute), and assert extractPath === dirname of the safety backup source.
Regression test: set UPLOADS_DIR to a temp dir, delete one file, call restoreFiles(latest) → file present again in UPLOADS_DIR and nothing written under process.cwd()/uploads.
```

```
BUG B17-003
Severity: HIGH
Feature: Database restore — dump with database-level statements
Status: OPEN
Reproduction: p17-connect.sql.gz = `pg_dump --create --clean --if-exists --no-owner --no-privileges lvs_audit_bk_other | gzip` (contains `DROP DATABASE IF EXISTS lvs_audit_bk_other;`, `CREATE DATABASE lvs_audit_bk_other …;`, `\connect lvs_audit_bk_other`). Copied into BACKUP_PATH root, mutations applied (vehicle AU-174f-X, marker setting), then `node p17-restore.cjs database p17-connect.sql.gz` → 200 {"success":true,...,"safetyBackupFilename":"db-backup-2026-09-10T21-02-28-848Z.sql.gz"} in 8 206 ms; caller's session still valid; lvs_audit_bk unchanged (mutations still there), lvs_audit_bk_other dropped and recreated with the dump's content (its marker row present, the target's not).
Expected: a dump that switches databases or contains CREATE/DROP DATABASE is rejected before anything runs (or the restore is confined to the configured database).
Actual: psql executes `\connect` and continues in the other database; DROP DATABASE succeeded with the app's credentials; the API reports success and the operator believes the restore happened. Combined with B17-001 any error (e.g. "database is being accessed by other users") is swallowed as well.
Root cause: server/backupService.ts:798-801 and server/routes/backups.ts:283-286 hand the whole file to psql with meta-commands enabled; no scan for `\connect`, `\!`, `\i`, `CREATE DATABASE`, `DROP DATABASE`, `ALTER SYSTEM`.
Affected files: server/backupService.ts, server/routes/backups.ts
Affected data: any database the app's DB role may drop (here the superuser `postgres`: including `lvstest`/`lvs_audit` on the same server)
Security impact: an uploaded "backup" can drop or overwrite other databases on the server and run psql meta-commands (`\!` executes shell commands — not exercised) with the app's DB credentials; only MANAGE_BACKUPS is required.
Business impact: "restore succeeded" with nothing restored is the worst possible outcome during an incident.
Fix: refuse files containing `\connect`, `\!`, `\i`, `\copy … PROGRAM`, `CREATE|DROP DATABASE`, `ALTER SYSTEM`; run psql with `--set=ON_ERROR_STOP=1` and a least-privilege role; prefer `pg_restore` custom format which cannot carry meta-commands; after restore compare a table checksum/row count with the dump.
Regression test: restoring a `--create` dump must return 4xx and leave both databases untouched.
```

```
BUG B17-004
Severity: HIGH
Feature: POST /api/backups/upload
Status: OPEN
Reproduction: node docs/audit/wip/scripts/p17-11-uploads.cjs — uploads of small.sql, db-backup-2026-09-10T20-50-42-649Z.sql.gz, marker.tar.gz, big.sql.gz (200 MB) all → 200 "backup uploaded successfully"; files appeared as `C:\…\LVStest-main\LVStest-main\backups\uploaded-database-2026-09-10T21-06-08-351Z-db-backup-….sql.gz` etc. (process.cwd()/backups), nothing in BACKUP_PATH; `GET /api/backups/list` → no `uploaded-*` entry; `POST /api/backups/restore/database` with the uploaded name → 404 "Backup file not found"; `GET /api/backups/download/database/<name>` → 404.
Expected: uploads go to the same directory the service lists/restores from (resolveBackupPath: BACKUP_PATH → setting → cwd/backups).
Actual: the route hardcodes `path.join(process.cwd(), 'backups')` (routes/backups.ts:798-811), so with BACKUP_PATH set (the production layout the rest of the service was rewritten for) an uploaded off-box backup can never be restored through the UI, and it sits on ephemeral container storage. The response even returns a manifest with `checksum:"uploaded"` that nothing writes to disk.
Root cause: server/routes/backups.ts:798 (`const backupDir = path.join(process.cwd(), 'backups')`)
Affected files: server/routes/backups.ts
Affected data: uploaded backup archives (the off-box copies the safety model depends on)
Security impact: none new (BUG-076 covers the filename); the 1 GB limit lets a MANAGE_BACKUPS user fill the application directory instead of the backup volume.
Business impact: the "upload a backup and restore it" recovery path is broken end-to-end in the intended deployment.
Fix: resolve the directory via backupService (expose resolveBackupPath / getBackupPathInfo) and write there; write the manifest sidecar with a real sha256 so uploaded files get checksum verification too.
Regression test: with BACKUP_PATH set to a temp dir, upload → file exists under BACKUP_PATH, appears in /list, restore returns 200.
```

```
BUG B17-005
Severity: MEDIUM
Feature: Backup creation temp files
Status: OPEN
Reproduction: after every `POST /api/backups/run` (and every safety backup) `%TEMP%\db-backup-<stamp>.sql.gz` (13 MB) and `%TEMP%\files-backup-<stamp>.tar.gz` (118 MB) remain. On this host before cleanup: 149 `db-backup-*.sql.gz` (312 MB) and 9 `files-backup-*.tar.gz` (1 012 MB) dating back to 2026-08-27; 38 of them from this session's :5002 runs (removed by me at the end, the older ones left).
Expected: temp files are removed after the copy to the backup directory (or the backup is written directly to the destination).
Actual: createDatabaseBackup/createFilesBackup write to `join(tmpdir(), filename)` (backupService.ts:234, :332), copyFileSync to the destination (:126) and never unlink the temp file. Every restore adds two more (safety backup). restore-data's `restore-<ts>.sql` is removed correctly.
Root cause: server/backupService.ts:118-133 (saveToLocalFilesystem copies, never deletes), :234/:332
Affected files: server/backupService.ts
Affected data: none directly; disk space (≈130 MB/day at one run per day, ×2 per restore attempt)
Security impact: a second, unprotected copy of every dump (session ids, hashes, SMTP password) lives in the world-readable temp directory of the host/container for ever.
Business impact: in a container /tmp is in the writable layer; after a few months the layer fills, at which point backups themselves start failing (EPERM/ENOSPC) — the classic "backups silently stopped" incident the scheduler comment describes.
Fix: unlink the temp file in a finally block (or stream straight to the destination and verify there); add a startup sweep for stale `db-backup-*`/`files-backup-*` in tmpdir.
Regression test: after runBackup() tmpdir contains no db-backup-*/files-backup-* file.
```

```
BUG B17-006
Severity: MEDIUM
Feature: backupService.restoreDatabase cleanup of the decompressed dump
Status: OPEN
Reproduction: any successful /api/backups/restore/database. Server log: `Error cleaning up uncompressed file: ReferenceError: require is not defined at BackupService.restoreDatabase (server/backupService.ts:838:11)`. Disk afterwards: `audit-backups/database/2026/09/10/db-backup-2026-09-10T20-50-42-649Z.sql` (20 111 676 B plain SQL) next to the archive; for archives restored from the root directory the `.sql` lands in the root and `GET /api/backups/list` returns it as an extra "uploaded" database backup (observed: p17-trunc50.sql, p17-corrupt.sql, p17-sqlerror.sql, p17-copyerror.sql — created even when the restore failed at gunzip). The first failed attempt also left a 0-byte `.sql`.
Expected: the temporary decompressed file is deleted after psql finishes, and it is never written into the backup directory.
Actual: `uncompressedFile = tempFile.replace('.gz', '')` (backupService.ts:760) writes the plaintext dump beside the backup; the cleanup uses `require('fs').unlinkSync` (:829, :838) in an ES module (package.json `"type":"module"`, esbuild `--format=esm`), which throws and is swallowed — the file stays for ever, also in production builds.
Root cause: server/backupService.ts:760, :829, :838
Affected files: server/backupService.ts
Affected data: backup directory (plaintext dumps accumulate, 20 MB each here)
Security impact: an uncompressed copy of the database (sessions, password hashes, SMTP password) without checksum protection, listed as a restorable "uploaded" backup, on the persistent backup volume.
Business impact: backup volume grows; operators see unexplained `.sql` entries; retention never deletes root files.
Fix: import unlinkSync from 'fs' at the top; decompress into tmpdir (or pipe gunzip → psql via stdin) and unlink in finally.
Regression test: after restoreDatabase() no `*.sql` exists under the backup path and tmpdir.
```

```
BUG B17-007
Severity: MEDIUM
Feature: POST /api/backups/restore/complete
Status: OPEN
Reproduction: node p17-restore.cjs complete db-backup-2026-09-10T20-50-42-649Z.sql.gz files-backup-p17-marker.tar.gz (after p17-mutate.cjs 4d) → 500 {"error":"Complete restore failed: Files restore failed with code 2 …"} in 12 348 ms. DB afterwards: vehicles 665, AUDIT-P17-4d rows gone, session table replaced (caller logged out) — the database half had already been applied.
Expected: either both halves succeed, or nothing is changed (or the response states exactly which half was applied and how to undo it).
Actual: restoreComplete runs restoreDatabase then restoreFiles sequentially (backupService.ts:998-1001); a failure in the second step is reported as a total failure without mentioning that the database was replaced and every user was logged out; the two safety backup filenames are not returned on the error path either.
Root cause: server/backupService.ts:994-1009, server/routes/backups.ts:987-992
Affected files: server/backupService.ts, server/routes/backups.ts
Affected data: database (replaced), sessions
Security impact: none
Business impact: the operator believes nothing happened and may retry with a different pair or restore "back" from the wrong file; meanwhile the live data set is the old one.
Fix: validate/extract the files archive to a staging directory first (and run the psql pre-checks) before touching the DB; on partial failure return 207-style detail `{databaseRestored:true, filesRestored:false, databaseSafetyBackupFilename, filesSafetyBackupFilename}`.
Regression test: complete restore with a valid DB archive and a broken tar → DB unchanged (or response states databaseRestored:true).
```

```
BUG B17-008
Severity: MEDIUM
Feature: GET /api/backups/download-files and GET /api/backups/download-data
Status: OPEN
Reproduction: node p17-d-downloads.cjs. download-files → 500 on this host, error body shows the command `tar -czf "…\temp\car-rental-files-2026-09-10.tar.gz" -C "C:\…\LVStest-main\LVStest-main" uploads` (routes/backups.ts:406 `path.join(process.cwd(), 'uploads')`, :427) — the repo's uploads/, while the app serves and backs up UPLOADS_DIR=…\audit-uploads-bk. download-data → 200, 20 087 186 B: no `DROP TABLE IF EXISTS`, `OWNER TO` present (47 COPY blocks), contains the clear-text SMTP password; written first to `<cwd>/temp/car-rental-data-<date>.sql`.
Expected: the "download files" button exports the directory the app actually uses; the data export is restorable with the same tooling as the automated backups (clean, owner-less).
Actual: download-files ignores getUploadsDir() (the very bug the getUploadsDir() comment in shared/paths.ts describes as fixed) → the export can be empty or stale; download-data produces a non-clean dump whose OWNER TO statements fail on a different role (errors swallowed, B17-001) and whose plain-text temp copy sits in the application directory during the download (three 0-byte leftovers from failed pg_dump runs are still in repo/temp/, see BUG-075 below).
Root cause: server/routes/backups.ts:406, :427 (uploads path), :95 (pg_dump without flags), :83 (temp under cwd)
Affected files: server/routes/backups.ts
Affected data: uploads export; data export
Security impact: unencrypted full dump in <cwd>/temp; BUG-010 secret in the export.
Business impact: an operator relying on "Download files" for an off-box copy gets the wrong directory.
Fix: use getUploadsDir() with `-C dirname(uploadsDir) basename(uploadsDir)`; reuse createDatabaseBackup() for download-data (same flags, tmpdir, gzip) or stream pg_dump directly to the response.
Regression test: with UPLOADS_DIR set, download-files tar listing equals the files under UPLOADS_DIR.
```

```
BUG B17-009
Severity: LOW
Feature: Restore tooling dependencies (gunzip, tar) — platform portability
Status: OPEN
Reproduction: restore/database on this host → 500 `{"error":"spawn gunzip ENOENT"}` after the safety backup (Git-for-Windows ships `usr/bin/gunzip` as a shell script, not an .exe; `gzip.exe` exists). restore/files, restore-files, download-files, download-code → 500 `tar (child): Cannot connect to C: resolve failed` (GNU tar treats `C:\path` as `host:path`; needs `--force-local`). restore-data works because it uses zlib.
Expected: restore works wherever backup works (backup uses zlib + archiver, no external binaries besides pg_dump).
Actual: three different decompression strategies (zlib in restore-data, external gunzip in restoreDatabase, external tar in files paths); the failure is detected only after the 1–13 s safety backup, which also leaks temp files (B17-005) and a 0-byte `.sql` (B17-006). Production runs in Linux containers (Coolify), where gunzip/tar exist — hence LOW — but the Dockerfile does not declare them as dependencies either (the pg_dump ENOENT history in backup_runs shows tooling gaps do happen).
Root cause: server/backupService.ts:763 (spawn('gunzip')), :930 (spawn('tar')); routes/backups.ts:356, :427, :481 (exec tar)
Affected files: server/backupService.ts, server/routes/backups.ts, Dockerfile (missing explicit deps)
Affected data: none
Security impact: none
Business impact: a Windows-hosted instance (the dev/test setup used here) cannot restore at all; error surfaces late.
Fix: use zlib.createGunzip() (pipe into psql stdin) and the `tar` npm package already implied by archiver (or `tar-fs`) for extraction; check tool availability at startup and expose it in /api/backups/health.
Regression test: unit test that restoreDatabase does not spawn gunzip; health endpoint reports `restoreToolsOk`.
```

```
BUG B17-010
Severity: LOW
Feature: backup_runs history across a restore
Status: OPEN
Reproduction: any restore of an archive produced by runBackup. The dump taken by run 287/288 contains its own rows with status 'running' and no filename; after `restore/database` those rows come back as `287 database running`, `288 files running` for ever (observed after every restore in this phase), the `pre-restore` row (289) written by takeSafetyBackup is lost (documented at backupService.ts:659-669), and /api/backups/health.lastSuccessAt regresses to the dump's last success (20:50:18 after a restore at 23:04).
Expected: run history reflects reality after a restore (the safety backup is known, no phantom running runs).
Actual: history is part of the restored data set; the service never reconciles it.
Root cause: backup_runs is dumped with everything else (server/backupService.ts:239-246, no `--exclude-table-data=backup_runs`); no post-restore fix-up in restoreDatabase (:702-846)
Affected files: server/backupService.ts
Affected data: backup_runs
Security impact: none
Business impact: the health tile/last-backup box lies for up to a day after a restore; the safety backup is only discoverable in the response toast.
Fix: exclude backup_runs data from the dump (or mark rows `status='running'` as `failed:"interrupted by restore"` after restore) and re-insert the pre-restore row after psql finishes.
Regression test: after restoreDatabase(), no backup_runs row has status 'running' and the pre-restore row exists.
```

```
BUG B17-011
Severity: LOW
Feature: Backup status/UX details (bundle)
Status: OPEN
Reproduction: (a) two simultaneous POST /api/backups/run → second gets 500 {"error":"Backup is already running"} (p17-9-concurrent-backup.cjs); (b) GET /api/backups/status at 22:50 local → nextScheduled "2026-09-11T00:00:00.000Z" — computed as "tomorrow 02:00" unconditionally (backupService.ts:217-223; between 00:00 and 02:00 it is a day late; BackupScheduler.getStatus :96-112 double-adds); (c) BACKUP_PATH directory renamed away → /api/backups/health 200 `stale:false, lastError:null`, /api/backups/list → [] (5c); (d) POST /api/backups/cleanup leaves empty `database/2025/05/01`-style directories; (e) POST /api/backups/upload accepts a 0-byte `empty.sql` → 200; (f) /api/backups/restore-data and /restore-files drop/overwrite everything without the typed-filename confirmation that /restore/database and /restore/complete require (routes/backups.ts:173-331 vs :848-862).
Expected: 409 for the busy case; a real next-run time; health red when the backup path is missing or empty; no empty dirs; reject empty uploads; same confirmation on all destructive paths.
Actual: as above.
Root cause: server/routes/backups.ts:656-661, :739-750, :753-843; server/backupService.ts:217-223, :1113; server/backupScheduler.ts:96-112
Affected files: server/routes/backups.ts, server/backupService.ts, server/backupScheduler.ts, client/src/components/dialogs/backup-dialog.tsx
Affected data: none
Security impact: (f) lowers the bar for an accidental full-database replacement from a single click.
Business impact: misleading status; one-click destructive upload restore.
Fix: 409 + Retry-After; compute next cron occurrence via node-cron/cron-parser; existence check in health; rmdir empty date dirs; reject size 0; require `confirm` form field on the upload restores.
Regression test: per item.
```

## Re-confirmed existing bugs (new evidence only)

- **BUG-069** (`tar -xzf` over `process.cwd()`): not executed. New evidence that the same primitive is used by the *non*-code restores: `restore/files` and `restore-files` both run tar with `-C process.cwd()` (B17-002), so the RCE surface is not limited to `restore-code`.
- **BUG-075** (`download-data` leaks `DATABASE_URL`): on `:5002` pg_dump exists so the route returned 200; the repo's `temp/` still holds three 0-byte `car-rental-data-2026-08-22/23/09-09.sql` files from earlier failed runs — the shell redirect creates the file before `pg_dump` fails and the error path never deletes it (routes/backups.ts:95, 110-116), so every failure leaves an artefact in the app directory; the successful run's file was removed.
- **BUG-076** (upload `originalname` traversal): upload of `db-backup-2026-09-10T20-50-42-649Z.sql.gz` produced `uploaded-database-<ts>-db-backup-2026-09-10T20-50-42-649Z.sql.gz` — basename behaviour unchanged; the real problem with this route is B17-004.
- **BUG-097** (filename filter misses backslash): `GET /api/backups/download/database/..%5c..%5cpackage.json` → 400 `Invalid filename` (`..` rejected first), unchanged.
- **BUG-062** (default admin re-created after restore): the re-creation only happens at process start (`server/index.ts:21` → initAdmin). In this phase no restart occurred, so after the `p17-half.sql` restore the `users` table stayed empty and nobody could log in (4e-6); with a restart the admin/admin123 account would have re-appeared — i.e. BUG-062 is currently the only way back into the app after a bad restore.
- **BUG-010** (SMTP password in clear): present in every automated dump (`COPY public.app_settings`) and in the `download-data` export; anyone holding a backup file holds the SMTP credentials.
- **BUG-057** (stack trace in error responses, dev-gated): `POST /api/backups/upload` with `evil.exe` → 500 `{"error":"Server Error","message":"This file type is not permitted for security reasons","stack":"Error: … at <anonymous> (C:\\Users\\kees lam\\…"}`; also the 500s the writer loop received during a restore carried `stack` (4g). Same dev-mode handler.

## Cleanup done

- Scratch databases `lvs_audit_bk_other` and `lvs_audit_bk_empty` dropped (`pg_database` now lists only `lvs_audit_bk`).
- `lvs_audit_bk` final state = the good backup `db-backup-2026-09-10T20-50-42-649Z.sql.gz` restored through the app: 47 tables, 665 vehicles / 348 customers / 2125 reservations / 23 users / 8 portal users, no AUDIT-P17 rows, SMTP setting intact, `backup_runs` 286 rows (max id 309, synthetic retention rows deleted; rows 287/288 remain `running`, see B17-010).
- `icacls` deny ACE removed from `audit-backups\database\2026\09\10` (0 deny entries); `backup_settings.localPath` restored to `C:\…\LVStest-main\backups`.
- `gunzip.exe` shim removed from `%USERPROFILE%\.local\bin`; the C# source stays in `files/p17/gunzip.cs` for reproducibility.
- Removed from `audit-backups`: all `p17-*` fixtures (root), `uploaded-old.sql.gz`, `files-backup-p17-marker.tar.gz`, the tamper pair, the orphaned plaintext `db-backup-…42-649Z.sql`, the synthetic old date directories (`database/2025`, `database/2026/06|08`, `files/2026/06|08`).
- Removed the 5 `uploaded-*` files the upload test created in the repo's `backups/`; `audit-uploads-bk/temp` is empty; repo `uploads/` untouched.
- Removed the 38 temp archives this session's `:5002` runs leaked into `%TEMP%` (124 older leftovers from earlier sessions left in place as they are not mine — see B17-005).
- Left in `audit-backups` (1.6 GB, all real, all listed by the app): 30 `db-backup-2026-09-10T20-50-16…21-07-54.sql.gz` (13.0 MB each, with manifests) and 11 `files-backup-2026-09-10T20-50-18…21-07-55.tar.gz` (117.8 MB each, with manifests) under `database/2026/09/10` and `files/2026/09/10`.
- Nothing committed; no application code modified.

## One-line answer

Recovery works for a byte-perfect archive of the same database on a Linux-like host (data, sequences, users, settings all correct, everyone logged out); it does **not** protect you when the archive is damaged, incomplete, from another database or when files must come back — those cases return "success" with lost data, silently restore elsewhere, or never touch `UPLOADS_DIR`.
