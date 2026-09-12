import { spawn } from 'child_process';
import { createReadStream, createWriteStream, existsSync, readFileSync, writeFileSync, copyFileSync, readdirSync, statSync, unlinkSync, rmdirSync } from 'fs';
import { readdir, stat, mkdir, unlink } from 'fs/promises';
import { pipeline } from 'stream/promises';
import { join, dirname, resolve } from 'path';
import { tmpdir } from 'os';
import { createGzip } from 'zlib';
import { createHash } from 'crypto';
import archiver from 'archiver';
import { eq, and, desc } from 'drizzle-orm';
import { db } from './db';
import { backupSettings, backupRuns, type BackupRun } from '@shared/schema';
import { getUploadsDir, getBackupPathFromEnv } from '@shared/paths';
import { verifyDatabaseBackup, verifyFilesBackup } from './backupVerification';
import {
  inspectDump, dumpTargetsForeignDatabase, databaseNameFromUrl, runPsqlRestore,
  inspectFilesArchive, extractFilesArchive, makeRestoreTempDir, safeUnlink,
  backupTempDir, cleanupStaleTempFiles, gunzipTo, isGzip, pgTool, restoreToolsAvailable,
} from './restoreSafety';

export interface BackupManifest {
  timestamp: string;
  /** Filename-safe variant of the timestamp (colons and dots replaced). */
  filenameStamp?: string;
  type: 'database' | 'files';
  filename: string;
  size: number;
  checksum: string;
  metadata?: {
    dbVersion?: string;
    fileCount?: number;
    compressedSize?: number;
    uploaded?: boolean;
  };
}

export interface BackupStatus {
  lastRun?: string;
  lastSuccess?: string;
  lastError?: string;
  isRunning: boolean;
  nextScheduled?: string;
}

export class BackupService {
  private isRunning = false;
  private defaultBackupPath = join(process.cwd(), 'backups'); // Default backup path relative to project

  /**
   * Where backups are written.
   *
   * BACKUP_PATH wins so the deployment's mounted volume cannot be overridden
   * by a stale database row. Previously this came only from backupSettings,
   * defaulting to the application directory, which a container wipes on every
   * redeploy.
   */
  resolveBackupPath(settings: { localPath?: string | null } | null): string {
    return getBackupPathFromEnv() || settings?.localPath || join(process.cwd(), 'backups');
  }

  /**
   * Resolved backup path plus whether it came from BACKUP_PATH, so operators
   * can tell a correctly-mounted volume from a silent fallback onto ephemeral
   * container storage (the original 10-month bug: backups succeeded, verified
   * green, and vanished on the next redeploy). Surfaced via /api/backups/health
   * and logged once at scheduler startup - never a hard failure, since an
   * unset BACKUP_PATH is expected and fine in local development.
   */
  async getBackupPathInfo(): Promise<{ path: string; fromEnv: boolean }> {
    const settings = await this.getBackupSettings();
    return { path: this.resolveBackupPath(settings), fromEnv: !!getBackupPathFromEnv() };
  }

  /**
   * BUG-200/FIX-B: the upload route used to write into
   * path.join(process.cwd(), 'backups'), which is neither BACKUP_PATH nor the
   * configured localPath. An uploaded backup therefore landed where nothing
   * looked for it: /api/backups never listed it and every restore of it 404'd.
   * One owner for "where do backups live", shared with the routes.
   */
  async resolveBackupDirectory(): Promise<string> {
    return this.resolveBackupPath(await this.getBackupSettings());
  }

  // Get backup settings from database
  private async getBackupSettings() {
    try {
      const settings = await db.select().from(backupSettings).limit(1);
      
      // If no settings exist, create default settings for local filesystem storage
      if (!settings || settings.length === 0) {
        console.log('No backup settings found, creating default settings for local filesystem...');
        const defaultSettings = await db.insert(backupSettings).values({
          storageType: 'local_filesystem',
          localPath: this.defaultBackupPath,
          enableAutoBackup: true,
          backupSchedule: '0 2 * * *', // 2:00 AM daily
          retentionDays: 30,
          settings: {},
          createdBy: 'system',
          updatedBy: 'system'
        }).returning();
        
        console.log('✅ Default backup settings created for local filesystem storage');
        return defaultSettings[0];
      }
      
      return settings[0];
    } catch (error) {
      console.error('Error fetching backup settings:', error);
      return null;
    }
  }

  // Ensure backup directory exists
  private async ensureBackupDirectory(basePath: string): Promise<string> {
    const year = new Date().getFullYear();
    const month = String(new Date().getMonth() + 1).padStart(2, '0');
    const day = String(new Date().getDate()).padStart(2, '0');
    
    const fullPath = join(basePath, year.toString(), month, day);
    
    try {
      await mkdir(fullPath, { recursive: true });
      console.log(`✅ Backup directory created/verified: ${fullPath}`);
      return fullPath;
    } catch (error) {
      console.error(`Error creating backup directory ${fullPath}:`, error);
      throw error;
    }
  }

  // Save backup to local filesystem
  private async saveToLocalFilesystem(tempFile: string, filename: string, type: 'database' | 'files', backupPath: string): Promise<void> {
    try {
      // Ensure directory exists
      const typeDir = join(backupPath, type);
      const fullPath = await this.ensureBackupDirectory(typeDir);
      
      // Copy file to backup location
      const destFile = join(fullPath, filename);
      copyFileSync(tempFile, destFile);
      
      console.log(`✅ Backup saved to local filesystem: ${destFile}`);
    } catch (error) {
      console.error('Error saving backup to local filesystem:', error);
      throw error;
    }
  }

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

  /**
   * The OLDER of the two required backup types' last verified success.
   *
   * A working database backup must not mask a files backup that has been
   * failing every night (or vice versa) - staleness and catch-up need to
   * react to whichever type is actually behind. If either type has never
   * succeeded, this returns undefined so callers treat it as stale/overdue,
   * exactly as if nothing had ever succeeded.
   */
  async getOldestLastSuccessfulRun(): Promise<BackupRun | undefined> {
    const [dbLast, filesLast] = await Promise.all([
      this.getLastSuccessfulRun('database'),
      this.getLastSuccessfulRun('files'),
    ]);
    if (!dbLast?.finishedAt || !filesLast?.finishedAt) return undefined;
    return new Date(dbLast.finishedAt) < new Date(filesLast.finishedAt) ? dbLast : filesLast;
  }

  // Current backup status, read from run history rather than a temp file.
  async getStatus(): Promise<BackupStatus> {
    try {
      const lastSuccess = await this.getLastSuccessfulRun();
      const [lastFailure] = await db.select().from(backupRuns)
        .where(eq(backupRuns.status, 'failed'))
        .orderBy(desc(backupRuns.finishedAt))
        .limit(1);

      // Only report an error while it is the most recent event: a single
      // transient failure that a later success has already superseded must
      // not pin the red "last backup error" box forever, which trains users
      // to ignore the one signal this system was built to be believed.
      const failureIsCurrent = !!lastFailure?.finishedAt
        && (!lastSuccess?.finishedAt || new Date(lastFailure.finishedAt) > new Date(lastSuccess.finishedAt));

      return {
        isRunning: this.isRunning,
        nextScheduled: this.getNextScheduledTime(),
        lastSuccess: lastSuccess?.finishedAt?.toISOString(),
        lastError: failureIsCurrent
          ? `${lastFailure!.finishedAt?.toISOString() ?? ''}: ${lastFailure!.error ?? 'unknown error'}`
          : undefined,
      };
    } catch (error) {
      console.error('Error reading backup status:', error);
      return { isRunning: this.isRunning, nextScheduled: this.getNextScheduledTime() };
    }
  }

  /**
   * BUG-221(b): this said "tomorrow at 02:00" unconditionally, so between
   * midnight and 02:00 — the window in which an operator is most likely to be
   * watching — it was a full day out. The schedule really is 02:00 local time
   * daily (see BackupScheduler), so the next run is today at 02:00 when that is
   * still ahead of us, and tomorrow at 02:00 otherwise.
   */
  private getNextScheduledTime(): string {
    const next = new Date();
    next.setHours(2, 0, 0, 0);
    if (next.getTime() <= Date.now()) next.setDate(next.getDate() + 1);
    return next.toISOString();
  }

  // Create database backup
  async createDatabaseBackup(): Promise<BackupManifest> {
    // Keep these separate: the filename needs a path-safe stamp, but the
    // manifest needs a parseable date. Storing the path-safe form as the
    // timestamp is what produced "Invalid Date" throughout the UI and broke
    // the newest-first sort, which compared NaN values.
    const startedAtIso = new Date().toISOString();
    const filenameStamp = startedAtIso.replace(/[:.]/g, '-');
    const filename = `db-backup-${filenameStamp}.sql.gz`;
    const tempFile = join(backupTempDir(), filename);
    
    console.log('Creating database backup...');
    
    // Create pg_dump command
    // BUG-220: backup_runs is dumped with everything else, so restoring an
    // archive resurrects the two `running` rows that were open while it was
    // being written — ghost runs that never finish — and wipes the pre-restore
    // row that records the way back. Its *schema* is still dumped; only its
    // data is excluded, and restoreDatabase reconciles the table afterwards.
    // BUG-219: pgTool() lets a host that keeps the client binaries outside
    // PATH say so, instead of failing with a bare ENOENT after a minute.
    const pgDumpProcess = spawn(pgTool('pg_dump'), [
      process.env.DATABASE_URL!,
      '--verbose',
      '--clean',
      '--if-exists',
      '--no-owner',
      '--no-privileges',
      '--exclude-table-data=backup_runs'
    ]);

    // Create gzip stream
    const gzip = createGzip({ level: 9 });
    const writeStream = createWriteStream(tempFile);

    // Handle errors
    pgDumpProcess.stderr.on('data', (data) => {
      console.log(`pg_dump: ${data}`);
    });

    const pgDumpExited = new Promise<void>((resolve, reject) => {
      pgDumpProcess.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'ENOENT') {
          reject(new Error('pg_dump executable not found on PATH. Install the PostgreSQL client tools (postgresql-client) on this host to enable database backups.'));
        } else {
          reject(err);
        }
      });
      pgDumpProcess.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`pg_dump failed with code ${code}`));
        }
      });
    });

    // Wait for the gzip output to be fully flushed to disk, not just for
    // pg_dump to exit. Measuring the file while the stream was still writing
    // recorded a partial size in the manifest (a 21KB dump reported as 10
    // bytes) and could just as easily have checksummed a truncated file,
    // which would make a good backup fail its integrity check on restore.
    await Promise.all([
      pipeline(pgDumpProcess.stdout, gzip, writeStream),
      pgDumpExited,
    ]);

    // Calculate file stats
    const fileStats = await stat(tempFile);
    const checksum = await this.calculateChecksum(tempFile);

    // Create manifest
    const manifest: BackupManifest = {
      timestamp: startedAtIso,
      filenameStamp,
      type: 'database',
      filename,
      size: fileStats.size,
      checksum,
      metadata: {
        compressedSize: fileStats.size
      }
    };

    // Get backup settings and resolve where to write the backup
    const settings = await this.getBackupSettings();
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
    } finally {
      // BUG-206: every backup left its 13 MB temp copy in os.tmpdir() for ever
      // (149 of them, 312 MB, on the audit host). In a container /tmp is the
      // writable layer, so this is what eventually makes the backups themselves
      // start failing. The copy in the backup directory is the one that counts.
      safeUnlink(tempFile);
    }

    return manifest;
  }

  // Create files backup
  async createFilesBackup(): Promise<BackupManifest> {
    // Keep these separate: the filename needs a path-safe stamp, but the
    // manifest needs a parseable date. Storing the path-safe form as the
    // timestamp is what produced "Invalid Date" throughout the UI and broke
    // the newest-first sort, which compared NaN values.
    const startedAtIso = new Date().toISOString();
    const filenameStamp = startedAtIso.replace(/[:.]/g, '-');
    const filename = `files-backup-${filenameStamp}.tar.gz`;
    const tempFile = join(backupTempDir(), filename);
    
    console.log('Creating files backup...');

    // Create archive
    const archive = archiver('tar', {
      gzip: true,
      gzipOptions: {
        level: 9
      }
    });

    const writeStream = createWriteStream(tempFile);
    archive.pipe(writeStream);

    // Add uploads directory if it exists (contains all user-uploaded files and templates)
    const uploadsDir = getUploadsDir();
    let fileCount = 0;
    
    if (existsSync(uploadsDir)) {
      fileCount = await this.addDirectoryToArchive(archive, uploadsDir, 'uploads');
      console.log(`📦 Added uploads directory to backup (${fileCount} files)`);
    } else {
      console.warn('⚠️ uploads directory not found, creating empty backup');
    }

    // Note: We do NOT backup source code (shared/, server/, client/) as it's in version control
    // Only user data (uploads/) is backed up

    // Finalize archive
    await archive.finalize();

    // Wait for write stream to finish
    await new Promise<void>((resolve) => {
      writeStream.on('close', resolve);
    });

    // Calculate file stats
    const fileStats = await stat(tempFile);
    const checksum = await this.calculateChecksum(tempFile);

    // Create manifest
    const manifest: BackupManifest = {
      timestamp: startedAtIso,
      filenameStamp,
      type: 'files',
      filename,
      size: fileStats.size,
      checksum,
      metadata: {
        fileCount,
        compressedSize: fileStats.size
      }
    };

    // Get backup settings and resolve where to write the backup
    const settings = await this.getBackupSettings();
    const backupPath = this.resolveBackupPath(settings);

    try {
      await this.saveToLocalFilesystem(tempFile, filename, 'files', backupPath);

      const typeDir = join(backupPath, 'files');
      const fullPath = await this.ensureBackupDirectory(typeDir);
      const manifestPath = join(fullPath, `${filename}.manifest.json`);
      writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

      console.log(`✅ Files backup saved: ${filename} (${fileStats.size} bytes, ${fileCount} files) in ${fullPath}`);
      // BUG-206: see createDatabaseBackup — the 118 MB temp archive used to
      // stay in os.tmpdir() for ever.
      safeUnlink(tempFile);
    } catch (error) {
      const errorMessage = `Failed to save files backup to ${backupPath}: ${error instanceof Error ? error.message : String(error)}`;
      console.error(`❌ ${errorMessage}`);
      safeUnlink(tempFile);
      throw new Error(errorMessage);
    }

    return manifest;
  }

  // Helper function to find a file in date-structured directory
  private findFileInDateStructure(basePath: string, filename: string): string[] {
    const paths: string[] = [];
    
    if (!existsSync(basePath)) {
      return paths;
    }
    
    const currentYear = new Date().getFullYear();
    const years = [currentYear, currentYear - 1]; // Check current and previous year
    
    for (const year of years) {
      const yearPath = join(basePath, String(year));
      if (!existsSync(yearPath)) continue;
      
      const months = readdirSync(yearPath);
      for (const month of months) {
        const monthPath = join(yearPath, month);
        if (!existsSync(monthPath)) continue;
        
        const days = readdirSync(monthPath);
        for (const day of days) {
          const dayPath = join(monthPath, day);
          const filePath = join(dayPath, filename);
          if (existsSync(filePath)) {
            paths.push(filePath);
          }
        }
      }
    }
    
    return paths;
  }

  // Add directory to archive recursively
  private async addDirectoryToArchive(archive: archiver.Archiver, dirPath: string, baseName: string): Promise<number> {
    let fileCount = 0;
    
    try {
      const items = await readdir(dirPath);
      
      for (const item of items) {
        const itemPath = join(dirPath, item);
        const itemStat = await stat(itemPath);
        
        if (itemStat.isDirectory()) {
          fileCount += await this.addDirectoryToArchive(archive, itemPath, `${baseName}/${item}`);
        } else {
          archive.file(itemPath, { name: `${baseName}/${item}` });
          fileCount++;
        }
      }
    } catch (error) {
      console.error(`Error adding directory ${dirPath} to archive:`, error);
    }
    
    return fileCount;
  }

  // Calculate file checksum
  private async calculateChecksum(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = createHash('sha256');
      const stream = createReadStream(filePath);
      
      stream.on('data', (data) => hash.update(data));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', reject);
    });
  }

  // Run complete backup
  async runBackup(triggerLabel?: string): Promise<{ database: BackupManifest; files: BackupManifest }> {
    if (this.isRunning) {
      throw new Error('Backup is already running');
    }

    this.isRunning = true;
    const trigger = triggerLabel ?? 'manual';
    const dbRunId = await this.startRun('database', trigger);
    const filesRunId = await this.startRun('files', trigger);

    try {
      console.log('Starting backup process...');

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

      const filesBackup = await this.createFilesBackup();
      const filesPath = await this.locateBackupFile('files', filesBackup.filename);
      const filesCheck = await verifyFilesBackup(filesPath, filesBackup.checksum, getUploadsDir(), filesBackup.metadata?.fileCount ?? 0);
      await this.finishRun(filesRunId, {
        status: filesCheck.ok ? 'success' : 'failed',
        filename: filesBackup.filename,
        sizeBytes: filesBackup.size,
        checksum: filesBackup.checksum,
        verified: filesCheck.ok,
        error: filesCheck.ok ? undefined : filesCheck.reason,
      });
      if (!filesCheck.ok) throw new Error(`Files backup failed verification: ${filesCheck.reason}`);

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
  }

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
      let entryStat;
      try {
        entryStat = statSync(full);
      } catch {
        continue; // dangling symlink or removed mid-walk — skip, don't abort the whole search
      }
      if (entryStat.isDirectory()) {
        const hit = this.findFileRecursive(full, filename);
        if (hit) return hit;
      } else if (entry === filename) {
        return full;
      }
    }
    return null;
  }

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

  // List available backups
  async listBackups(type?: 'database' | 'files'): Promise<BackupManifest[]> {
    try {
      // Get backup settings and resolve where backups are stored
      const settings = await this.getBackupSettings();
      const backupPath = this.resolveBackupPath(settings);

      const backupTypes = type ? [type] : ['database', 'files'];
      const manifests: BackupManifest[] = [];

      // List from local filesystem
      for (const backupType of backupTypes) {
        // Check root backups directory for uploaded files (no manifest)
        const rootFiles = existsSync(backupPath) ? readdirSync(backupPath) : [];
        for (const file of rootFiles) {
          const filePath = join(backupPath, file);
          const fileStat = statSync(filePath);

          if (fileStat.isFile()) {
            const isDatabase = backupType === 'database' && (file.endsWith('.sql') || file.endsWith('.sql.gz'));
            const isFiles = backupType === 'files' && (file.endsWith('.tar.gz') || file.endsWith('.tgz'));

            if (isDatabase || isFiles) {
              // Create manifest for uploaded backup without manifest
              manifests.push({
                timestamp: fileStat.mtime.toISOString(),
                type: backupType,
                filename: file,
                size: fileStat.size,
                checksum: 'uploaded',
                metadata: { uploaded: true }
              });
            }
          }
        }

        // Check organized structure for created backups (with manifests)
        const typeDir = join(backupPath, backupType);
        if (existsSync(typeDir)) {
          this.scanDirectoryForManifests(typeDir, manifests);
        }
      }

      // Sort by timestamp (newest first)
      return manifests.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    } catch (error) {
      console.error('Error listing backups:', error);
      return [];
    }
  }

  // Recursively scan directory for manifest files
  private scanDirectoryForManifests(dir: string, manifests: BackupManifest[]): void {
    try {
      const items = readdirSync(dir);
      
      for (const item of items) {
        const itemPath = join(dir, item);
        const itemStat = statSync(itemPath);
        
        if (itemStat.isDirectory()) {
          this.scanDirectoryForManifests(itemPath, manifests);
        } else if (item.endsWith('.manifest.json')) {
          try {
            const manifestContent = readFileSync(itemPath, 'utf8');
            const manifest = JSON.parse(manifestContent);
            const backupFile = itemPath.replace(/\.manifest\.json$/, '');
            manifest.timestamp = this.manifestTime(manifest, backupFile).toISOString();
            manifests.push(manifest);
          } catch (error) {
            console.error(`Error reading manifest ${itemPath}:`, error);
          }
        }
      }
    } catch (error) {
      console.error(`Error scanning directory ${dir}:`, error);
    }
  }

  /**
   * Take, verify, and record a safety backup of current state before a
   * destructive restore. Shared by every restore path in this service
   * (restoreDatabase, restoreFiles, restoreComplete) AND by the upload-based
   * restore-data/restore-files routes in routes.ts, which bypass this class's
   * own restore*() methods entirely and call this directly. Throws
   * "Refusing to restore: ..." if the backup can't be taken or fails
   * verification, so a restore never proceeds without a verified, recorded
   * way back. Returns the safety backup's manifest (callers surface its
   * filename to the operator, since a database restore's --clean dump wipes
   * the backup_runs row that recorded it here).
   */
  async takeSafetyBackup(type: 'database' | 'files'): Promise<BackupManifest> {
    const label = type === 'database' ? 'state' : 'files';
    console.log(`Taking safety backup of current ${label} before restore...`);
    try {
      const safety = type === 'database'
        ? await this.createDatabaseBackup()
        : await this.createFilesBackup();
      const safetyPath = await this.locateBackupFile(type, safety.filename);
      const check = type === 'database'
        ? await verifyDatabaseBackup(safetyPath, safety.checksum)
        : await verifyFilesBackup(safetyPath, safety.checksum, getUploadsDir(), safety.metadata?.fileCount ?? 0);
      if (!check.ok) {
        throw new Error(`safety backup failed verification: ${check.reason}`);
      }
      const runId = await this.startRun(type, 'pre-restore');
      await this.finishRun(runId, {
        status: 'success', filename: safety.filename, sizeBytes: safety.size,
        checksum: safety.checksum, verified: true,
      });
      console.log(`Safety backup written and verified: ${safety.filename}`);
      return safety;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Refusing to restore: could not take a verified safety backup of the current ${type === 'database' ? 'data' : 'files'} first (${message}). ` +
        `Restoring now would overwrite live data with no way back.`
      );
    }
  }

  /**
   * Locate a backup file on disk: directly in the backup root (an uploaded
   * copy) or inside the dated year/month/day structure (a created one).
   */
  private locateRestoreSource(backupPath: string, type: 'database' | 'files', backupFilename: string): string {
    const candidates = [
      join(backupPath, backupFilename),
      join(backupPath, type, backupFilename),
      ...this.findFileInDateStructure(join(backupPath, type), backupFilename),
    ];
    const found = candidates.find(existsSync);
    if (!found) throw new Error(`Backup file not found in local filesystem: ${backupFilename}`);
    console.log(`Found backup file at: ${found}`);
    return found;
  }

  /**
   * Checksum check against the manifest, when there is one. A missing manifest
   * is tolerated (older or uploaded backups may not have one); a mismatch is
   * not, and must abort before anything destructive runs.
   */
  private async assertChecksumMatches(backupFilename: string, type: 'database' | 'files', filePath: string): Promise<void> {
    const manifest = await this.getBackupManifest(backupFilename, type).catch(() => null);
    if (!manifest) {
      console.warn('Could not verify backup integrity (manifest may be missing)');
      return;
    }
    if (manifest.checksum && manifest.checksum !== 'uploaded') {
      const actual = await this.calculateChecksum(filePath);
      if (actual !== manifest.checksum) {
        throw new Error('Backup file integrity check failed - checksum mismatch. Nothing was changed.');
      }
    }
  }

  /**
   * BUG-220: a restored dump used to bring back its own backup_runs rows —
   * including the two that were still 'running' while it was being written,
   * which then sat there for ever — and it wiped the pre-restore row that
   * records the operator's way back. The dump no longer carries backup_runs
   * data (--exclude-table-data), so this rewrites the history to match
   * reality: any stale 'running' row is closed as interrupted, and the
   * pre-restore row is written again now that psql has finished.
   */
  private async reconcileRunHistoryAfterRestore(safetyBackupFilename?: string): Promise<void> {
    try {
      await db.update(backupRuns)
        .set({ status: 'failed', finishedAt: new Date(), error: 'interrupted by a database restore' })
        .where(eq(backupRuns.status, 'running'));
      if (safetyBackupFilename) {
        const runId = await this.startRun('database', 'pre-restore');
        await this.finishRun(runId, { status: 'success', filename: safetyBackupFilename, verified: true });
      }
    } catch (error) {
      // Never fail a successful restore because the bookkeeping could not be
      // written; the restore itself already happened.
      console.error('Could not reconcile backup_runs after the restore:', error instanceof Error ? error.message : error);
    }
  }

  /**
   * Restore the database from a backup.
   *
   * BUG-197 (CRITICAL) is the reason this reads the way it does. The order is
   * deliberate and each step exists because the old one did not have it:
   *
   *   1. locate and checksum the archive;
   *   2. read it end to end and prove it is a COMPLETE dump that cannot leave
   *      this database — before anything is dropped. A download cut in half
   *      looks perfectly healthy in its first 4 KB, which is all the old sniff
   *      inspected, and restoring it emptied users/vehicles/reservations and
   *      reset every sequence to 1 while answering 200 "success";
   *   3. refuse an archive aimed at a different database (BUG-199);
   *   4. only then take the safety backup — it costs up to a minute and two
   *      large files, and it used to be spent before discovering the archive
   *      was unusable (BUG-219);
   *   5. decompress with zlib into a private temp directory, never beside the
   *      archive on the backup volume (BUG-207);
   *   6. run psql with ON_ERROR_STOP inside a single transaction, so a bad
   *      statement rolls the whole thing back instead of being skipped;
   *   7. reconcile backup_runs (BUG-220);
   *   8. remove every temp file in a finally (BUG-206, BUG-207).
   */
  async restoreDatabase(backupFilename: string, opts?: { skipSafetyBackup?: boolean }): Promise<{ safetyBackupFilename?: string }> {
    console.log(`Starting database restore from: ${backupFilename}`);

    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error('DATABASE_URL is not configured; refusing to restore.');

    const settings = await this.getBackupSettings();
    const backupPath = this.resolveBackupPath(settings);
    const sourceFile = this.locateRestoreSource(backupPath, 'database', backupFilename);

    await this.assertChecksumMatches(backupFilename, 'database', sourceFile);

    // --- verify BEFORE anything is touched -----------------------------------
    const inspection = await inspectDump(sourceFile);
    if (!inspection.ok) {
      throw new Error(`Refusing to restore: ${inspection.reason}.`);
    }
    const foreign = dumpTargetsForeignDatabase(inspection, databaseUrl);
    if (foreign) {
      throw new Error(`Refusing to restore: ${foreign}.`);
    }
    console.log(
      `Archive verified: ${inspection.bytes} bytes of SQL, ends with the pg_dump completion marker, ` +
      `targets ${databaseNameFromUrl(databaseUrl)}`
    );

    // --- only now is it worth taking the safety backup -----------------------
    let safetyBackupFilename: string | undefined;
    if (!opts?.skipSafetyBackup) {
      const safety = await this.takeSafetyBackup('database');
      safetyBackupFilename = safety.filename;
    }

    const tempDir = makeRestoreTempDir();
    let sqlFile = sourceFile;
    try {
      if (isGzip(sourceFile)) {
        // BUG-207: this used to write the plain dump next to the archive with
        // `tempFile.replace('.gz','')` — a 20 MB unprotected copy of the whole
        // database that listBackups() then offered as a restorable backup —
        // and the cleanup that should have removed it used `require` inside an
        // ES module, so it threw and was swallowed.
        sqlFile = join(tempDir, 'restore.sql');
        console.log('Archive is gzipped - decompressing with zlib');
        await gunzipTo(sourceFile, sqlFile);
      }

      console.log('WARNING: Database restore will disconnect all users');
      await runPsqlRestore(databaseUrl, sqlFile);
      console.log('Database restore completed successfully');

      await this.reconcileRunHistoryAfterRestore(safetyBackupFilename);
    } finally {
      // BUG-206/BUG-207: never leave a plaintext dump behind, on any path.
      safeUnlink(sqlFile === sourceFile ? null : sqlFile);
      try { rmdirSync(tempDir); } catch { /* not empty, or already gone */ }
    }

    return { safetyBackupFilename };
  }

  /**
   * Restore uploaded files from a backup.
   *
   * BUG-198: this extracted into `targetPath || process.cwd()` while the
   * safety backup it had just taken archived `getUploadsDir()` — two different
   * directories the moment UPLOADS_DIR is set, which is the documented
   * production configuration. The result was a restore that restored nothing,
   * reported "Files restore completed successfully", and overwrote the
   * application directory instead.
   *
   * BUG-069/BUG-219: extraction went through `spawn('tar', ['-xzf', …,
   * '--overwrite'])`, which trusts every path in the archive (an authenticated
   * write-anywhere primitive) and does not exist on a Windows host. It now
   * runs through the `tar` npm package, after a listing pass that refuses the
   * archive outright if any entry could land outside the uploads directory.
   *
   * targetPath stays an internal parameter for tests; no route passes it.
   */
  async restoreFiles(backupFilename: string, targetPath?: string, opts?: { skipSafetyBackup?: boolean }): Promise<{ safetyBackupFilename?: string; filesWritten: number }> {
    console.log(`Starting files restore from: ${backupFilename}`);

    const settings = await this.getBackupSettings();
    const backupPath = this.resolveBackupPath(settings);
    const sourceFile = this.locateRestoreSource(backupPath, 'files', backupFilename);

    await this.assertChecksumMatches(backupFilename, 'files', sourceFile);

    // --- verify the archive BEFORE overwriting anything ----------------------
    const archive = await inspectFilesArchive(sourceFile);
    if (!archive.ok) {
      if (archive.rejected.length) {
        console.error(`Refused archive entries: ${archive.rejected.slice(0, 10).join(', ')}`);
      }
      throw new Error(`Refusing to restore: ${archive.reason}.`);
    }

    // The extraction target MUST be the directory the safety backup archives
    // from, or the verified safety net protects a directory the restore does
    // not touch.
    const extractPath = targetPath ?? getUploadsDir();
    if (resolve(extractPath) !== resolve(getUploadsDir())) {
      throw new Error(
        `Refusing to restore: the extraction target ${extractPath} is not the uploads directory ${getUploadsDir()}.`
      );
    }

    let safetyBackupFilename: string | undefined;
    if (!opts?.skipSafetyBackup) {
      const safety = await this.takeSafetyBackup('files');
      safetyBackupFilename = safety.filename;
    }

    await mkdir(extractPath, { recursive: true });
    console.log(`Extracting ${archive.entries} files to: ${extractPath}`);
    const filesWritten = await extractFilesArchive(sourceFile, extractPath);
    console.log(`Files restore completed successfully (${filesWritten} files)`);

    return { safetyBackupFilename, filesWritten };
  }

  /**
   * Complete system restore (database + files).
   *
   * BUG-208: this ran the database half and then the files half. When the
   * files half failed the response said the whole restore had failed — while
   * the database had already been replaced and everyone was logged out, with
   * no mention of which half had landed or of the two safety backups.
   *
   * The files archive is now verified FIRST, so the commonest failure (a bad
   * or hostile files archive) is discovered while the database is still
   * untouched. The outcome is reported per half rather than as one flat
   * boolean, because after the database has been replaced "it failed" is not
   * a true answer.
   */
  async restoreComplete(databaseBackup: string, filesBackup: string, opts?: { skipSafetyBackup?: boolean }): Promise<{
    databaseRestored: boolean;
    filesRestored: boolean;
    databaseSafetyBackupFilename?: string;
    filesSafetyBackupFilename?: string;
    error?: string;
  }> {
    console.log('Starting complete system restore...');
    console.log(`Database backup: ${databaseBackup}`);
    console.log(`Files backup: ${filesBackup}`);

    const settings = await this.getBackupSettings();
    const backupPath = this.resolveBackupPath(settings);

    // Stage 1 - verify BOTH archives before either half is applied.
    const filesSource = this.locateRestoreSource(backupPath, 'files', filesBackup);
    const filesCheck = await inspectFilesArchive(filesSource);
    if (!filesCheck.ok) {
      throw new Error(`Refusing to restore: the files archive is unusable - ${filesCheck.reason}.`);
    }
    const dbSource = this.locateRestoreSource(backupPath, 'database', databaseBackup);
    const dbCheck = await inspectDump(dbSource);
    if (!dbCheck.ok) {
      throw new Error(`Refusing to restore: the database archive is unusable - ${dbCheck.reason}.`);
    }
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error('DATABASE_URL is not configured; refusing to restore.');
    const foreign = dumpTargetsForeignDatabase(dbCheck, databaseUrl);
    if (foreign) throw new Error(`Refusing to restore: ${foreign}.`);

    // Stage 2 - safety backups of both halves.
    let databaseSafetyBackupFilename: string | undefined;
    let filesSafetyBackupFilename: string | undefined;
    if (!opts?.skipSafetyBackup) {
      databaseSafetyBackupFilename = (await this.takeSafetyBackup('database')).filename;
      filesSafetyBackupFilename = (await this.takeSafetyBackup('files')).filename;
    }

    // Stage 3 - apply. Files first: they are reversible from the safety
    // archive without anyone being logged out, and the database half is the
    // one that ends every session.
    let filesRestored = false;
    let databaseRestored = false;
    try {
      await this.restoreFiles(filesBackup, undefined, { skipSafetyBackup: true });
      filesRestored = true;
      await this.restoreDatabase(databaseBackup, { skipSafetyBackup: true });
      databaseRestored = true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('Complete restore failed:', message);
      const applied = [filesRestored ? 'the files' : null, databaseRestored ? 'the database' : null]
        .filter(Boolean).join(' and ');
      throw Object.assign(
        new Error(
          `Complete restore failed: ${message}` +
          (applied ? ` IMPORTANT: ${applied} ${applied.includes('and') ? 'have' : 'has'} already been replaced.` : ' Nothing was changed.') +
          (databaseSafetyBackupFilename ? ` Safety backups: ${databaseSafetyBackupFilename}, ${filesSafetyBackupFilename}.` : '')
        ),
        { databaseRestored, filesRestored, databaseSafetyBackupFilename, filesSafetyBackupFilename },
      );
    }

    console.log('Complete system restore finished successfully!');
    console.log('IMPORTANT: Please restart the application to ensure all changes take effect.');
    return { databaseRestored, filesRestored, databaseSafetyBackupFilename, filesSafetyBackupFilename };
  }


  // Helper method to get backup manifest from the local filesystem
  private async getBackupManifest(filename: string, type: 'database' | 'files'): Promise<BackupManifest | null> {
    try {
      const settings = await this.getBackupSettings();
      const backupPath = this.resolveBackupPath(settings);

      // Locate the backup file the same way restore does: directly in the
      // root backups directory (uploaded backup), or in the organized
      // year/month/day structure (created backup).
      const candidates = [
        join(backupPath, filename),
        join(backupPath, type, filename),
        ...this.findFileInDateStructure(join(backupPath, type), filename)
      ];
      const backupFilePath = candidates.find(existsSync);
      if (!backupFilePath) return null;

      const manifestPath = `${backupFilePath}.manifest.json`;
      if (!existsSync(manifestPath)) return null;

      return JSON.parse(readFileSync(manifestPath, 'utf8'));
    } catch (error) {
      console.error('Error getting backup manifest:', error);
      return null;
    }
  }

  // Download backup file
  async downloadBackup(filename: string, type: 'database' | 'files'): Promise<{ stream: NodeJS.ReadableStream, contentType: string } | null> {
    try {
      const settings = await this.getBackupSettings();
      const backupPath = this.resolveBackupPath(settings);

      // Download from local filesystem
      let filePath: string | null = null;

      // Check root backup directory first (uploaded files)
      const rootFilePath = join(backupPath, filename);
      if (existsSync(rootFilePath)) {
        filePath = rootFilePath;
      } else {
        // Search in date-organized structure
        const foundPaths = this.findFileInDateStructure(join(backupPath, type), filename);
        if (foundPaths.length > 0) {
          filePath = foundPaths[0];
        }
      }

      if (!filePath || !existsSync(filePath)) {
        console.error(`Backup file not found in local filesystem: ${filename}`);
        return null;
      }

      const stream = createReadStream(filePath);
      return {
        stream,
        contentType: 'application/gzip'
      };
    } catch (error) {
      console.error(`Error downloading backup ${filename}:`, error);
      return null;
    }
  }

  // Delete backup file
  // Returns true if a backup file was actually found and deleted, false if it
  // could not be located (e.g. it predates findFileInDateStructure's two-year
  // lookback). Callers must not report a deletion that didn't happen.
  async deleteBackup(filename: string, type: 'database' | 'files'): Promise<boolean> {
    try {
      const settings = await this.getBackupSettings();
      const backupPath = this.resolveBackupPath(settings);

      // Delete from local filesystem
      let filePath: string | null = null;
      let manifestPath: string | null = null;

      // Check root backup directory first (uploaded files)
      const rootFilePath = join(backupPath, filename);
      if (existsSync(rootFilePath)) {
        filePath = rootFilePath;
      } else {
        // Search in date-organized structure
        const foundPaths = this.findFileInDateStructure(join(backupPath, type), filename);
        if (foundPaths.length > 0) {
          filePath = foundPaths[0];
          // Look for manifest in the same directory
          const dir = dirname(filePath);
          const potentialManifest = join(dir, `${filename}.manifest.json`);
          if (existsSync(potentialManifest)) {
            manifestPath = potentialManifest;
          }
        }
      }

      if (!filePath || !existsSync(filePath)) {
        return false;
      }

      await unlink(filePath);
      console.log(`Deleted backup file from local filesystem: ${filePath}`);

      if (manifestPath && existsSync(manifestPath)) {
        await unlink(manifestPath);
        console.log(`Deleted manifest file from local filesystem: ${manifestPath}`);
      }

      return true;
    } catch (error) {
      console.error(`Error deleting backup ${filename}:`, error);
      throw error;
    }
  }

  // Cleanup old backups based on retention policy
  async cleanupOldBackups(): Promise<void> {
    console.log('Cleaning up old backups...');

    const now = new Date();
    const backups = await this.listBackups();

    // Never delete the newest backup of each type, regardless of age.
    // Retention must never be able to leave the system with nothing.
    //
    // Computed over the non-uploaded subset only: uploaded entries are always
    // skipped below regardless of age, so if they were allowed to occupy the
    // "newest" slot, an operator's recently-uploaded copy could shield itself
    // (already immune) while leaving the newest *created* backup - the one
    // this rail actually exists to protect - unprotected and deletable.
    //
    // getTimeSafe treats an unparseable timestamp as -Infinity so it can
    // never win the "newest" comparison and can never block a valid
    // timestamp from replacing it. Without this, a backup with a corrupt
    // timestamp encountered first would keep the map slot forever, because
    // `validMs > NaN` is always false - shielding an entry that's already
    // immune (it's never selected as "shouldDelete" source of truth for
    // comparison here anyway) while the genuinely newest parseable entry
    // loses its protection.
    const getTimeSafe = (backup: BackupManifest): number => {
      const t = new Date(backup.timestamp).getTime();
      return Number.isNaN(t) ? -Infinity : t;
    };
    const newestByType = new Map<'database' | 'files', BackupManifest>();
    for (const backup of backups) {
      if (backup.checksum === 'uploaded') continue;
      const current = newestByType.get(backup.type);
      if (!current || getTimeSafe(backup) > getTimeSafe(current)) {
        newestByType.set(backup.type, backup);
      }
    }

    const toDelete: BackupManifest[] = [];

    for (const backup of backups) {
      // listBackups synthesizes an entry (checksum: 'uploaded') for every
      // loose file sitting in the root of the backup directory, using the
      // file's mtime as its timestamp. Those are manually kept copies - the
      // one thing this deployment's off-box safety model depends on - and
      // retention must never touch them, regardless of age.
      if (backup.checksum === 'uploaded') continue;

      // Never delete the newest backup of each type.
      if (newestByType.get(backup.type) === backup) continue;

      const backupDate = new Date(backup.timestamp);
      const daysOld = Math.floor((now.getTime() - backupDate.getTime()) / (1000 * 60 * 60 * 24));

      let shouldDelete = false;

      // Retention policy: 14 days for daily, 8 weeks for weekly, 12 months for monthly
      if (daysOld > 365) {
        // Older than 1 year - delete all
        shouldDelete = true;
      } else if (daysOld > 56) {
        // Older than 8 weeks - keep only monthly (first of month)
        shouldDelete = backupDate.getDate() !== 1;
      } else if (daysOld > 14) {
        // Older than 2 weeks - keep only weekly (Sundays)
        shouldDelete = backupDate.getDay() !== 0;
      }

      if (shouldDelete) {
        toDelete.push(backup);
      }
    }

    // Delete old backups from the local filesystem, counting only what was
    // actually removed. findFileInDateStructure only searches the current
    // and previous calendar year, so a backup older than that is listed but
    // unreachable - claiming it was deleted would hide that it wasn't.
    let deletedCount = 0;
    for (const backup of toDelete) {
      try {
        const deleted = await this.deleteBackup(backup.filename, backup.type);
        if (deleted) {
          deletedCount++;
          console.log(`Deleted old backup: ${backup.filename}`);

          // Keep the backup_runs history row rather than deleting it - it's
          // tiny and answers "was this machine backing up in March?" long
          // after the file itself is gone. Mark it pruned instead.
          await db.update(backupRuns)
            .set({ filePruned: true })
            .where(eq(backupRuns.filename, backup.filename));
        } else {
          console.warn(`Could not find old backup to delete (outside the lookup window?): ${backup.filename}`);
        }
      } catch (error) {
        console.error(`Error deleting ${backup.filename}:`, error);
      }
    }

    // BUG-221(d): retention removed the files but left the year/month/day
    // directories behind for ever, so the backup volume slowly filled with
    // empty folders and an operator browsing it could not tell which dates
    // still held anything.
    const cleanupSettings = await this.getBackupSettings();
    const removedDirs = this.pruneEmptyDateDirectories(this.resolveBackupPath(cleanupSettings));

    console.log(`Cleanup completed. Deleted ${deletedCount} old backups` +
      (removedDirs ? ` and ${removedDirs} empty date folder(s).` : '.'));
  }

  /**
   * Removes now-empty year/month/day folders under the backup root. Never
   * touches the backup root itself or the type directories (database/, files/),
   * which the writers recreate and which an operator expects to see.
   */
  private pruneEmptyDateDirectories(backupPath: string): number {
    let removed = 0;
    const prune = (dir: string, depth: number): boolean => {
      if (!existsSync(dir)) return false;
      let entries: string[];
      try { entries = readdirSync(dir); } catch { return false; }
      for (const entry of entries) {
        const full = join(dir, entry);
        try {
          if (statSync(full).isDirectory()) prune(full, depth + 1);
        } catch { /* vanished mid-walk */ }
      }
      if (depth < 2) return false;
      try {
        if (readdirSync(dir).length === 0) {
          rmdirSync(dir);
          removed += 1;
          return true;
        }
      } catch { /* not empty, or in use */ }
      return false;
    };
    for (const type of ['database', 'files']) {
      prune(join(backupPath, type), 1);
    }
    return removed;
  }
}

// Single shared instance. `runBackup`'s re-entrancy guard (`isRunning`,
// above) is an instance field - two separate `BackupService` objects can't
// see each other's in-flight run. Previously routes.ts and backupScheduler.ts
// each constructed their own, so the "Back up now" button and status/health
// endpoints were blind to a scheduler-initiated run (cron or boot catch-up),
// letting a manual click start a second, concurrent backup. The constructor
// only initializes plain fields (no DB/filesystem work), so eager
// construction here is safe and runs at import time like any other module
// singleton.
export const backupService = new BackupService();