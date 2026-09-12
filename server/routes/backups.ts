import { storage } from "../storage";
import path from "path";
import fs from "fs";
import { UserPermission } from "../../shared/schema";
import { backupService } from "../backupService";
import { hasPermission } from "../middleware/permissions.js";
import { getUploadsDir } from "../../shared/paths";
import { validateAfterUpload } from "../utils/security/fileUploadSecurity";
import type { Express } from "express";
import type { RouteDeps } from "./deps";
import { spawn } from "child_process";
import { sanitizeFilename } from "../utils/security/fileUploadSecurity";
import {
  inspectDump, dumpTargetsForeignDatabase, runPsqlRestore, inspectFilesArchive,
  extractFilesArchive, makeRestoreTempDir, safeUnlink, gunzipTo, isGzip,
  restoreToolsAvailable, RestoreFailedError,
} from "../restoreSafety";

/**
 * BUG-075/BUG-197: a restore that fails must say so, and must say WHY, without
 * ever handing the client a connection string. The guards in restoreSafety
 * raise messages written to be read by an operator ("Refusing to restore: the
 * dump does not end with ..."); psql failures arrive as RestoreFailedError
 * carrying psql's own first ERROR: line. Anything else is reported as a
 * generic failure and logged in full on the server.
 */
function restoreErrorMessage(error: unknown): string {
  if (error instanceof RestoreFailedError) return error.message;
  const message = error instanceof Error ? error.message : '';
  if (/^Refusing to restore/.test(message) || /^Complete restore failed/.test(message)) {
    // Still belt-and-braces: never let a connection string through, whatever
    // an underlying library decided to put in its message.
    return message.replace(/postgres(?:ql)?:\/\/\S+/gi, '[database connection]');
  }
  return 'The restore failed. Nothing was changed, or the server log explains what was. Check the server log for details.';
}

/**
 * BUG-097 hardening. `filename` must be exactly its own basename on both
 * POSIX and Win32 separators, must not be a relative-directory token, and must
 * not be absolute. Replaces the `includes('..') || includes('/')` blacklist,
 * which missed the backslash — harmless on the Linux deployment today, but a
 * blacklist where an allowlist belongs.
 */
export function isPlainFilename(filename: string): boolean {
  if (!filename || filename === '.' || filename === '..') return false;
  if (filename.includes('\0')) return false;
  if (path.posix.basename(filename) !== filename) return false;
  if (path.win32.basename(filename) !== filename) return false;
  if (path.posix.isAbsolute(filename) || path.win32.isAbsolute(filename)) return false;
  return true;
}

/**
 * BUG-075: runs pg_dump without ever putting the connection string in a shell
 * command, and without the password in argv. Errors carry the exit code and
 * pg_dump's own stderr — never the command line, never the credentials.
 */
export async function runPgDump(databaseUrl: string, outputPath: string): Promise<void> {
  const url = new URL(databaseUrl);
  const args = [
    "--host", url.hostname,
    "--port", url.port || "5432",
    "--username", decodeURIComponent(url.username),
    "--dbname", url.pathname.replace(/^\//, ""),
    "--no-password",
    // BUG-209: without --clean/--if-exists the downloaded dump cannot be
    // restored over a populated database (every CREATE TABLE fails), and
    // without --no-owner/--no-privileges it fails on any host where the
    // original role does not exist. The scheduled backups already pass these.
    "--clean",
    "--if-exists",
    "--no-owner",
    "--no-privileges",
  ];
  const env = { ...process.env } as NodeJS.ProcessEnv;
  if (url.password) env.PGPASSWORD = decodeURIComponent(url.password);

  await new Promise<void>((resolve, reject) => {
    const out = fs.createWriteStream(outputPath);
    const child = spawn("pg_dump", args, { env });
    let stderr = "";
    child.stdout.pipe(out);
    child.stderr.on("data", (chunk) => { stderr += String(chunk); });
    const failed = (message: string) => {
      out.end();
      // Never leave a half-written dump behind for someone to download.
      try { fs.unlinkSync(outputPath); } catch { /* nothing to remove */ }
      reject(new Error(message));
    };
    child.on("error", (err) => failed(`pg_dump could not be started: ${err.message}`));
    child.on("close", (code) => {
      if (code === 0) { out.end(); return resolve(); }
      failed(`pg_dump exited with code ${code}: ${stderr.trim().slice(0, 500)}`);
    });
  });
}

// Moved verbatim out of server/routes.ts (registerRoutes) - see git history for context.
export function registerBackupRoutes(app: Express, deps: RouteDeps): void {
  const { upload, backupUpload, uploadsDir } = deps;


  // ==================== BACKUP SETTINGS ROUTES ====================
  
  // Get backup settings
  app.get("/api/backup-settings", hasPermission(UserPermission.MANAGE_BACKUPS), async (req, res) => {
    try {
      const settings = await storage.getBackupSettings();
      if (!settings) {
        return res.status(404).json({ error: "No backup settings found" });
      }
      res.json(settings);
    } catch (error) {
      console.error("Error getting backup settings:", error);
      res.status(500).json({ error: "Failed to get backup settings" });
    }
  });

  // Create or update backup settings
  app.post("/api/backup-settings", hasPermission(UserPermission.MANAGE_BACKUPS), async (req, res) => {
    try {
      const currentUser = req.user as any;
      const settingsData = {
        ...req.body,
        createdBy: currentUser?.username || 'system',
        updatedBy: currentUser?.username || 'system'
      };

      const settings = await storage.createBackupSettings(settingsData);
      res.json(settings);
    } catch (error) {
      console.error("Error creating backup settings:", error);
      res.status(500).json({ error: "Failed to create backup settings" });
    }
  });

  // Update backup settings
  app.put("/api/backup-settings/:id", hasPermission(UserPermission.MANAGE_BACKUPS), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const currentUser = req.user as any;
      const settingsData = {
        ...req.body,
        updatedBy: currentUser?.username || 'system'
      };

      const settings = await storage.updateBackupSettings(id, settingsData);
      if (!settings) {
        return res.status(404).json({ error: "Backup settings not found" });
      }
      res.json(settings);
    } catch (error) {
      console.error("Error updating backup settings:", error);
      res.status(500).json({ error: "Failed to update backup settings" });
    }
  });

  // ==================== BACKUP ROUTES ====================
  
  // Simple download app data (database only)
  app.get("/api/backups/download-data", hasPermission(UserPermission.MANAGE_BACKUPS), async (req, res) => {
    try {
      const timestamp = new Date().toISOString().split('T')[0];
      const filename = `car-rental-data-${timestamp}.sql`;
      const filepath = path.join(process.cwd(), 'temp', filename);

      // Create temp directory if it doesn't exist
      await fs.promises.mkdir(path.join(process.cwd(), 'temp'), { recursive: true });

      // Export database using pg_dump
      const databaseUrl = process.env.DATABASE_URL;
      if (!databaseUrl) {
        throw new Error('DATABASE_URL not configured');
      }

      // BUG-075: this used to be exec(`pg_dump "${DATABASE_URL}" > …`), whose
      // failure message is the whole command line — user, password, host and
      // database — and that message was handed back to the client as `details`.
      // spawn() with an argument array keeps the URL out of any shell string,
      // and the password travels in PGPASSWORD instead of argv.
      await runPgDump(databaseUrl, filepath);

      // Send file
      res.download(filepath, filename, async (err) => {
        // Clean up temp file after download
        try {
          await fs.promises.unlink(filepath);
        } catch (cleanupError) {
          console.error('Error cleaning up temp file:', cleanupError);
        }
        
        if (err) {
          console.error('Error sending file:', err);
        }
      });
    } catch (error) {
      // BUG-075: the detail is for the container log, never for the client —
      // it is the one place the connection string can still surface.
      console.error("Error downloading app data:", error);
      res.status(500).json({ error: "Failed to download app data" });
    }
  });

  // Simple download app code (source files)
  app.get("/api/backups/download-code", hasPermission(UserPermission.MANAGE_BACKUPS), async (req, res) => {
    try {
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);
      
      const timestamp = new Date().toISOString().split('T')[0];
      const filename = `car-rental-code-${timestamp}.tar.gz`;
      const filepath = path.join(process.cwd(), 'temp', filename);
      
      // Create temp directory if it doesn't exist
      await fs.promises.mkdir(path.join(process.cwd(), 'temp'), { recursive: true });
      
      // Create tar.gz of source code excluding node_modules, .git, temp, backups, uploads
      const excludes = [
        '--exclude=node_modules',
        '--exclude=.git',
        '--exclude=temp',
        '--exclude=backups',
        '--exclude=uploads',
        '--exclude=*.log',
        '--exclude=.env',
        '--exclude=.env.*',
        '--exclude=cookies.txt',
        '--exclude=dist',
        '--exclude=build'
      ].join(' ');
      
      await execAsync(`tar -czf "${filepath}" ${excludes} -C "${process.cwd()}" .`);
      
      // Send file
      res.download(filepath, filename, async (err) => {
        // Clean up temp file after download
        try {
          await fs.promises.unlink(filepath);
        } catch (cleanupError) {
          console.error('Error cleaning up temp file:', cleanupError);
        }
        
        if (err) {
          console.error('Error sending file:', err);
        }
      });
    } catch (error) {
      console.error("Error downloading app code:", error);
      res.status(500).json({ 
        error: "Failed to download app code",
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  /**
   * Restore the database from an UPLOADED dump.
   *
   * This route has its own destructive path — it drops every table and
   * restores over the result, bypassing backupService.restoreDatabase — so it
   * needs the same guarantees, not a weaker copy of them (BUG-197, BUG-199,
   * BUG-221f).
   */
  app.post("/api/backups/restore-data", hasPermission(UserPermission.MANAGE_BACKUPS), backupUpload.single('backup'), async (req, res) => {
    const cleanupUpload = async () => {
      if (req.file?.path) {
        try { await fs.promises.unlink(req.file.path); } catch { /* already gone */ }
      }
    };
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No backup file uploaded' });
      }

      // BUG-221(f): /restore/database and /restore/complete require the
      // operator to type the exact filename before replacing everything; these
      // upload routes dropped the whole database on a single click. Same rail.
      const { confirm } = req.body ?? {};
      if (confirm !== req.file.originalname) {
        await cleanupUpload();
        return res.status(400).json({
          error: 'Confirmation does not match. Send `confirm` with the exact name of the file you are uploading to confirm this restore.',
        });
      }

      // BUG-221(e): a zero-byte upload is never a backup.
      if (!req.file.size) {
        await cleanupUpload();
        return res.status(400).json({ error: 'That file is empty, so the restore was cancelled. Nothing was changed.' });
      }

      // Post-upload validation - verify file content matches backup type
      const fileValidation = await validateAfterUpload(
        req.file.path,
        req.file.originalname,
        req.file.mimetype,
        'backup'
      );
      if (!fileValidation.valid) {
        await cleanupUpload();
        return res.status(400).json({ error: fileValidation.error });
      }

      const databaseUrl = process.env.DATABASE_URL;
      if (!databaseUrl) {
        await cleanupUpload();
        return res.status(500).json({ error: 'The database connection is not configured; nothing was changed.' });
      }

      console.log('Starting database restore from an uploaded file, size:', req.file.size, 'bytes');

      // --- verify the archive end to end BEFORE anything is dropped ---------
      // BUG-197: the old check read the first 4 KB and looked for something
      // dump-shaped. A download truncated at 50 % passes that test, and
      // restoring it emptied users, vehicles, reservations and session while
      // answering 200 "Database restored successfully". inspectDump() reads
      // the whole file and insists on the pg_dump completion marker.
      const inspection = await inspectDump(req.file.path);
      if (!inspection.ok) {
        await cleanupUpload();
        return res.status(400).json({ error: `Refusing to restore: ${inspection.reason}.` });
      }
      // BUG-199: a dump carrying \connect restores into — and first drops —
      // another database while this one is left untouched and the API says
      // "success". inspectDump already refuses \connect; this names the
      // database so the operator understands why.
      const foreign = dumpTargetsForeignDatabase(inspection, databaseUrl);
      if (foreign) {
        await cleanupUpload();
        return res.status(400).json({ error: `Refusing to restore: ${foreign}.` });
      }

      // Take and verify a backup of the CURRENT database before dropping it.
      // Throws "Refusing to restore: ..." if that cannot be done.
      const safety = await backupService.takeSafetyBackup('database');

      const tempDir = makeRestoreTempDir();
      let sqlFile = req.file.path;
      try {
        if (isGzip(req.file.path)) {
          // zlib, not an external gunzip (BUG-219), and into a private temp
          // directory rather than beside the archive (BUG-207).
          sqlFile = path.join(tempDir, 'restore.sql');
          await gunzipTo(req.file.path, sqlFile);
        }

        // Drop every table first: an uploaded dump is not necessarily a
        // --clean dump, so without this the restore would collide with the
        // existing schema. The drop and the restore run as one psql
        // invocation inside a single transaction, so if the restore fails the
        // drop is rolled back with it — which is the whole of BUG-197.
        const dropAndRestore = path.join(tempDir, 'drop-and-restore.sql');
        const dropStatements = [
          'DO $$ DECLARE r RECORD;',
          "BEGIN FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP",
          "  EXECUTE 'DROP TABLE IF EXISTS public.' || quote_ident(r.tablename) || ' CASCADE';",
          'END LOOP; END $$;',
          '',
        ].join('\n');
        await fs.promises.writeFile(dropAndRestore, dropStatements + await fs.promises.readFile(sqlFile, 'utf8'));

        await runPsqlRestore(databaseUrl, dropAndRestore);
        console.log('Database restore completed successfully');

        await cleanupUpload();
        return res.json({
          success: true,
          message: 'Database restored successfully. Please refresh your browser and log in again.',
          safetyBackupFilename: safety.filename,
        });
      } finally {
        // BUG-206/BUG-207: nothing is left behind, on any path.
        safeUnlink(sqlFile === req.file.path ? null : sqlFile);
        safeUnlink(path.join(tempDir, 'drop-and-restore.sql'));
        try { fs.rmdirSync(tempDir); } catch { /* not empty, or already gone */ }
      }
    } catch (error) {
      await cleanupUpload();
      console.error("Error restoring app data:", error);
      // The message is the guard's own refusal ("Refusing to restore: ...") or
      // psql's first ERROR: line — never error.message from a connection
      // attempt, which is where the connection string used to surface.
      return res.status(500).json({ error: restoreErrorMessage(error) });
    }
  });

  /**
   * Restore the application's source code from an uploaded archive.
   *
   * BUG-069: this was `tar -xzf <uploaded file> -C <cwd>`, which trusts every
   * path inside an operator-supplied archive and writes it over the running
   * application — an authenticated remote code execution primitive, followed
   * by process.exit(0) to make the new code run. Extraction now goes through
   * the `tar` npm package with a per-entry filter, so an entry with `..` or an
   * absolute path is dropped instead of honoured.
   */
  app.post("/api/backups/restore-code", hasPermission(UserPermission.MANAGE_BACKUPS), backupUpload.single('backup'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No backup file uploaded' });
      }

      const { confirm } = req.body ?? {};
      if (confirm !== req.file.originalname) {
        try { await fs.promises.unlink(req.file.path); } catch {}
        return res.status(400).json({
          error: 'Confirmation does not match. Send `confirm` with the exact name of the file you are uploading to confirm this restore.',
        });
      }

      const fileValidation = await validateAfterUpload(
        req.file.path,
        req.file.originalname,
        req.file.mimetype,
        'backup'
      );
      if (!fileValidation.valid) {
        try { await fs.promises.unlink(req.file.path); } catch {}
        return res.status(400).json({ error: fileValidation.error });
      }

      const tarModule = await import('tar');
      let rejected = 0;
      await tarModule.x({
        file: req.file.path,
        cwd: process.cwd(),
        preservePaths: false,
        filter: (entryPath: string) => {
          const p = String(entryPath).replace(/\\/g, '/');
          const unsafe =
            p.startsWith('/') || /^[A-Za-z]:/.test(p) || p.split('/').some((seg) => seg === '..');
          if (unsafe) {
            rejected += 1;
            console.error(`Refused code-restore entry outside the application directory: ${p.slice(0, 200)}`);
          }
          return !unsafe;
        },
      } as any);

      try { await fs.promises.unlink(req.file.path); } catch {}

      res.json({
        success: true,
        message: 'Code restored successfully. The application will restart automatically.',
        rejectedEntries: rejected,
      });

      // Restart the application after a short delay
      setTimeout(() => {
        process.exit(0); // PM2 or the process manager will restart the app
      }, 2000);
    } catch (error) {
      if (req.file) {
        try { await fs.promises.unlink(req.file.path); } catch {}
      }
      console.error("Error restoring app code:", error);
      res.status(500).json({ error: restoreErrorMessage(error) });
    }
  });

  // Download uploaded files (uploads directory)
  app.get("/api/backups/download-files", hasPermission(UserPermission.MANAGE_BACKUPS), async (req, res) => {
    try {
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);
      
      const timestamp = new Date().toISOString().split('T')[0];
      const filename = `car-rental-files-${timestamp}.tar.gz`;
      const filepath = path.join(process.cwd(), 'temp', filename);
      
      // Create temp directory if it doesn't exist
      await fs.promises.mkdir(path.join(process.cwd(), 'temp'), { recursive: true });
      
      // BUG-209/FIX-B: this archived cwd/uploads while every upload route
      // writes to getUploadsDir(). With UPLOADS_DIR set the download was an
      // archive of an empty or stale tree, reported as a successful backup.
      const uploadsDir = getUploadsDir();
      
      // Check if uploads directory exists
      try {
        await fs.promises.access(uploadsDir);
      } catch {
        // If uploads directory doesn't exist, create an empty archive
        await execAsync(`tar -czf "${filepath}" -T /dev/null`);
        return res.download(filepath, filename, async (err) => {
          try {
            await fs.promises.unlink(filepath);
          } catch (cleanupError) {
            console.error('Error cleaning up temp file:', cleanupError);
          }
          if (err) {
            console.error('Error sending file:', err);
          }
        });
      }
      
      // Create tar.gz of uploads directory
      await execAsync(`tar -czf "${filepath}" -C "${path.dirname(uploadsDir)}" "${path.basename(uploadsDir)}"`);
      
      // Send file
      res.download(filepath, filename, async (err) => {
        // Clean up temp file after download
        try {
          await fs.promises.unlink(filepath);
        } catch (cleanupError) {
          console.error('Error cleaning up temp file:', cleanupError);
        }
        
        if (err) {
          console.error('Error sending file:', err);
        }
      });
    } catch (error) {
      console.error("Error downloading uploaded files:", error);
      res.status(500).json({ 
        error: "Failed to download uploaded files",
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  /**
   * Restore uploaded files from an UPLOADED tar.gz archive.
   *
   * BUG-198: this extracted into process.cwd() while the safety backup it had
   * just taken archived getUploadsDir() — so with UPLOADS_DIR set (the
   * documented production configuration) it restored nothing into the served
   * directory, overwrote the application directory instead, and reported
   * success. BUG-069: `tar -xzf … -C cwd` honours every path in an
   * operator-supplied archive.
   */
  app.post("/api/backups/restore-files", hasPermission(UserPermission.MANAGE_BACKUPS), backupUpload.single('backup'), async (req, res) => {
    const cleanupUpload = async () => {
      if (req.file?.path) {
        try { await fs.promises.unlink(req.file.path); } catch { /* already gone */ }
      }
    };
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No backup file uploaded' });
      }

      // BUG-221(f): the same typed confirmation the non-upload restore routes require.
      const { confirm } = req.body ?? {};
      if (confirm !== req.file.originalname) {
        await cleanupUpload();
        return res.status(400).json({
          error: 'Confirmation does not match. Send `confirm` with the exact name of the file you are uploading to confirm this restore.',
        });
      }

      // BUG-221(e): a zero-byte upload is never a backup.
      if (!req.file.size) {
        await cleanupUpload();
        return res.status(400).json({ error: 'That file is empty, so the restore was cancelled. Nothing was changed.' });
      }

      const fileValidation = await validateAfterUpload(
        req.file.path,
        req.file.originalname,
        req.file.mimetype,
        'backup'
      );
      if (!fileValidation.valid) {
        await cleanupUpload();
        return res.status(400).json({ error: fileValidation.error });
      }

      // --- verify the archive BEFORE anything is overwritten ---------------
      const archive = await inspectFilesArchive(req.file.path);
      if (!archive.ok) {
        if (archive.rejected.length) {
          console.error(`Refused archive entries: ${archive.rejected.slice(0, 10).join(', ')}`);
        }
        await cleanupUpload();
        return res.status(400).json({ error: `Refusing to restore: ${archive.reason}.` });
      }

      // Take and verify a backup of the CURRENT uploads directory first.
      const safety = await backupService.takeSafetyBackup('files');

      // BUG-198: into the uploads directory the application actually serves
      // and backs up — the same directory the safety backup above archived —
      // never into process.cwd().
      const target = getUploadsDir();
      await fs.promises.mkdir(target, { recursive: true });
      const filesWritten = await extractFilesArchive(req.file.path, target);

      await cleanupUpload();
      res.json({
        success: true,
        message: `All uploaded files have been restored successfully (${filesWritten} files).`,
        filesWritten,
        restoredTo: target,
        safetyBackupFilename: safety.filename,
      });
    } catch (error) {
      await cleanupUpload();
      console.error("Error restoring uploaded files:", error);
      res.status(500).json({ error: restoreErrorMessage(error) });
    }
  });

  // List available backups
  app.get("/api/backups/list", hasPermission(UserPermission.MANAGE_BACKUPS), async (req, res) => {
    try {
      const type = req.query.type as 'database' | 'files' | undefined;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
      
      const backups = await backupService.listBackups(type);
      
      // Limit results if specified
      const limitedBackups = limit ? backups.slice(0, limit) : backups;
      
      res.json(limitedBackups);
    } catch (error) {
      console.error("Error listing backups:", error);
      res.status(500).json({ 
        error: "Failed to list backups",
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Download a specific backup file. The UI (admin/backup.tsx and
  // backup-dialog.tsx) only knows the filename, not the type, so this
  // delegates to backupService.downloadBackup - which resolves the backup
  // directory the same way createDatabaseBackup/createFilesBackup do
  // (BACKUP_PATH first, see resolveBackupPath) - rather than re-deriving the
  // path here a third time. Previously this route read only
  // backupSettings.localPath and never consulted BACKUP_PATH, so every
  // automated backup 404'd once BACKUP_PATH was set, which is the only
  // protection this design offers against losing the server itself.
  app.get("/api/backups/download/:filename", hasPermission(UserPermission.MANAGE_BACKUPS), async (req, res) => {
    try {
      const { filename } = req.params;

      // BUG-097 hardening: an includes() blacklist that happened to miss the
      // backslash. A basename comparison is an allowlist by construction: any
      // filename that is not already its own basename is rejected, whatever
      // the separator or encoding.
      if (!isPlainFilename(filename)) {
        return res.status(400).json({ error: 'Invalid filename' });
      }

      // This service generates filenames as db-backup-*.sql.gz and
      // files-backup-*.tar.gz, so the type can usually be inferred; try the
      // inferred type first and fall back to the other so a differently
      // named or hand-uploaded backup can still be found.
      const inferredType: 'database' | 'files' = filename.startsWith('files-backup-') ? 'files' : 'database';
      const otherType: 'database' | 'files' = inferredType === 'database' ? 'files' : 'database';

      let result = await backupService.downloadBackup(filename, inferredType);
      if (!result) {
        result = await backupService.downloadBackup(filename, otherType);
      }

      if (!result) {
        return res.status(404).json({ error: 'Backup file not found' });
      }

      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Type', result.contentType);
      // 'error' fires asynchronously mid-stream (e.g. retention cleanup
      // pruning the file while it's being sent), after this try/catch has
      // already returned - an unhandled stream error here would otherwise
      // crash the process. Headers may already be flushed by the time it
      // fires, so only attempt a JSON error response if they haven't been.
      result.stream.on('error', (streamError) => {
        console.error('Error streaming backup download:', streamError);
        if (!res.headersSent) {
          res.status(500).json({ error: 'Failed to download backup' });
        } else {
          res.destroy(streamError instanceof Error ? streamError : undefined);
        }
      });
      result.stream.pipe(res);
    } catch (error) {
      console.error("Error downloading backup:", error);
      res.status(500).json({
        error: "Failed to download backup",
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Get backup status
  app.get("/api/backups/status", hasPermission(UserPermission.MANAGE_BACKUPS), async (req, res) => {
    try {
      const status = await backupService.getStatus();
      res.json(status);
    } catch (error) {
      console.error("Error getting backup status:", error);
      res.status(500).json({ error: "Failed to get backup status" });
    }
  });

  // Get backup health (staleness) for UI warnings
  app.get("/api/backups/health", hasPermission(UserPermission.MANAGE_BACKUPS), async (req, res) => {
    try {
      // Use the OLDER of the two required types' last success: a healthy
      // database backup must not mask a files backup that has been failing
      // every night (or vice versa). If either type has never succeeded this
      // is undefined, which correctly reports as stale/overdue.
      const last = await backupService.getOldestLastSuccessfulRun();
      const status = await backupService.getStatus();
      const pathInfo = await backupService.getBackupPathInfo();
      const lastSuccessAt = last?.finishedAt ? new Date(last.finishedAt).toISOString() : null;
      const ageHours = lastSuccessAt
        ? Math.round((Date.now() - new Date(lastSuccessAt).getTime()) / 3600000)
        : null;

      // BUG-221(c): renaming or unmounting the backup directory made health
      // answer 200 with stale:false and lastError:null while /list returned an
      // empty array — the entire history gone without a single warning. The
      // directory's existence, and whether it actually holds anything, is part
      // of the health answer.
      const backupPathExists = fs.existsSync(pathInfo.path);
      const backupCount = backupPathExists ? (await backupService.listBackups()).length : 0;
      const backupPathError = !backupPathExists
        ? `The backup directory ${pathInfo.path} does not exist.`
        : backupCount === 0 ? `No backups were found in ${pathInfo.path}.` : null;

      // BUG-219: restore depends on psql/pg_dump being startable. Finding that
      // out during an emergency, after a minute-long safety backup, is too late.
      const tools = await restoreToolsAvailable();

      res.json({
        lastSuccessAt,
        ageHours,
        stale: ageHours === null || ageHours > 48 || !backupPathExists || backupCount === 0,
        // A real failed run still wins the lastError slot, because a backup
        // that failed is more urgent than a directory that is merely empty —
        // but the path problem gets its own field so the UI can show both,
        // and so neither can hide the other.
        lastError: status.lastError ?? backupPathError,
        backupPathError,
        backupPath: pathInfo.path,
        backupPathExists,
        backupCount,
        backupPathFromEnv: pathInfo.fromEnv,
        restoreToolsOk: tools.ok,
        restoreToolsMissing: tools.missing,
      });
    } catch (error) {
      console.error('Error reading backup health:', error);
      res.status(500).json({ message: 'Error reading backup health' });
    }
  });

  // List available backups
  app.get("/api/backups", hasPermission(UserPermission.MANAGE_BACKUPS), async (req, res) => {
    try {
      const type = req.query.type as 'database' | 'files' | undefined;
      const backups = await backupService.listBackups(type);
      res.json(backups);
    } catch (error) {
      console.error("Error listing backups:", error);
      res.status(500).json({ error: "Failed to list backups" });
    }
  });

  // Run backup manually
  app.post("/api/backups/run", hasPermission(UserPermission.MANAGE_BACKUPS), async (req, res) => {
    try {
      const result = await backupService.runBackup();
      res.json({
        success: true,
        message: "Backup completed successfully",
        backups: result
      });
    } catch (error) {
      // BUG-221(a): a second "Back up now" while one is running is not a
      // server error, it is a conflict — and the caller can be told when to
      // try again instead of being left to guess.
      if (error instanceof Error && /already running/i.test(error.message)) {
        res.setHeader('Retry-After', '60');
        return res.status(409).json({
          error: "A backup is already running. Wait for it to finish before starting another.",
          retryAfterSeconds: 60,
        });
      }
      console.error("Error running backup:", error);
      res.status(500).json({ error: "The backup failed. Check the server log for details." });
    }
  });

  // Download backup file
  app.get("/api/backups/download/:type/:filename", hasPermission(UserPermission.MANAGE_BACKUPS), async (req, res) => {
    try {
      const { type, filename } = req.params;

      if (!['database', 'files'].includes(type)) {
        return res.status(400).json({ error: "Invalid backup type" });
      }

      // BUG-097 hardening (see /api/backups/download/:filename above).
      if (!isPlainFilename(filename)) {
        return res.status(400).json({ error: 'Invalid filename' });
      }

      // Use BackupService to download from either storage type
      const result = await backupService.downloadBackup(filename, type as 'database' | 'files');
      
      if (!result) {
        return res.status(404).json({ error: "Backup file not found" });
      }

      // Set download headers
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Type', result.contentType);

      // 'error' fires asynchronously mid-stream (e.g. retention cleanup
      // pruning the file while it's being sent), after this try/catch has
      // already returned - an unhandled stream error here would otherwise
      // crash the process. Headers may already be flushed by the time it
      // fires, so only attempt a JSON error response if they haven't been.
      result.stream.on('error', (streamError) => {
        console.error('Error streaming backup download:', streamError);
        if (!res.headersSent) {
          res.status(500).json({ error: 'Failed to download backup' });
        } else {
          res.destroy(streamError instanceof Error ? streamError : undefined);
        }
      });

      // Stream the file
      result.stream.pipe(res);

    } catch (error) {
      console.error("Error downloading backup:", error);
      res.status(500).json({ error: "Failed to download backup" });
    }
  });

  // Delete backup file
  app.delete("/api/backups/:type/:filename", hasPermission(UserPermission.MANAGE_BACKUPS), async (req, res) => {
    try {
      const { type, filename } = req.params;

      if (!['database', 'files'].includes(type)) {
        return res.status(400).json({ error: "Invalid backup type" });
      }

      // BUG-097 hardening (see /api/backups/download/:filename above).
      if (!isPlainFilename(filename)) {
        return res.status(400).json({ error: 'Invalid filename' });
      }

      await backupService.deleteBackup(filename, type as 'database' | 'files');
      
      res.json({
        success: true,
        message: "Backup deleted successfully"
      });
    } catch (error) {
      console.error("Error deleting backup:", error);
      res.status(500).json({ error: "Failed to delete backup" });
    }
  });

  // Cleanup old backups
  app.post("/api/backups/cleanup", hasPermission(UserPermission.MANAGE_BACKUPS), async (req, res) => {
    try {
      await backupService.cleanupOldBackups();
      res.json({
        success: true,
        message: "Old backups cleaned up successfully"
      });
    } catch (error) {
      console.error("Error cleaning up backups:", error);
      res.status(500).json({ error: "Failed to cleanup old backups" });
    }
  });

  // Upload backup file
  app.post("/api/backups/upload", hasPermission(UserPermission.MANAGE_BACKUPS), backupUpload.single('backup'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No backup file provided" });
      }

      const file = req.file;
      const backupType = req.body.type; // 'database' or 'files'

      // BUG-221(e): a zero-byte file was accepted with 200 and then listed as
      // a restorable backup.
      if (!file.size) {
        fs.unlinkSync(file.path);
        return res.status(400).json({ error: "That file is empty. A backup of zero bytes is not a backup." });
      }

      // Post-upload validation - verify file content matches backup type
      const fileValidation = await validateAfterUpload(
        file.path,
        file.originalname,
        file.mimetype,
        'backup'
      );
      if (!fileValidation.valid) {
        return res.status(400).json({ error: fileValidation.error });
      }

      // Validate backup type
      if (!backupType || !['database', 'files'].includes(backupType)) {
        fs.unlinkSync(file.path);
        return res.status(400).json({ error: "Invalid or missing backup type. Must be 'database' or 'files'" });
      }

      // Validate file extension based on type
      const validExtensions = {
        database: ['.sql', '.sql.gz'],
        files: ['.tar.gz', '.tgz']
      };

      const fileExtension = file.originalname.toLowerCase();
      const isValidExtension = validExtensions[backupType as keyof typeof validExtensions].some(ext => 
        fileExtension.endsWith(ext)
      );

      if (!isValidExtension) {
        fs.unlinkSync(file.path);
        return res.status(400).json({ 
          error: `Invalid file extension for ${backupType} backup. Expected: ${validExtensions[backupType as keyof typeof validExtensions].join(', ')}`
        });
      }

      // BUG-200/FIX-B: this used to be path.join(process.cwd(), 'backups'),
      // which is neither BACKUP_PATH nor the configured localPath — so the
      // uploaded file was written somewhere listBackups() never looks, and was
      // then invisible in /api/backups and un-restorable. One owner.
      const backupDir = await backupService.resolveBackupDirectory();
      if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
      }

      // Generate a unique filename with timestamp.
      // BUG-076 hardening: the original name is reduced to its basename and
      // sanitised before it becomes part of a path. busboy already strips the
      // directory part of Content-Disposition in this multer version, so this
      // is not an open hole today — but the protection then comes from a
      // library detail rather than from our own code, and the containment
      // assertion below is what actually guarantees it.
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const safeOriginal = sanitizeFilename(path.basename(file.originalname));
      const originalName = safeOriginal.replace(/\.[^/.]+$/, ""); // Remove extension
      const extension = safeOriginal.substring(safeOriginal.lastIndexOf('.'));
      const newFilename = `uploaded-${backupType}-${timestamp}-${originalName}${extension}`;
      const destinationPath = path.join(backupDir, newFilename);
      if (path.dirname(path.resolve(destinationPath)) !== path.resolve(backupDir)) {
        fs.unlinkSync(file.path);
        return res.status(400).json({ error: "Invalid backup filename" });
      }

      // Move the uploaded file to backups directory
      fs.renameSync(file.path, destinationPath);

      // Create manifest entry
      const manifest = {
        timestamp: new Date().toISOString(),
        type: backupType,
        filename: newFilename,
        size: fs.statSync(destinationPath).size,
        checksum: 'uploaded', // We could calculate actual checksum if needed
        metadata: {
          uploaded: true,
          originalName: file.originalname
        }
      };

      res.json({
        success: true,
        message: `${backupType} backup uploaded successfully`,
        backup: manifest
      });

    } catch (error) {
      // Clean up file on error
      if (req.file?.path && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      console.error("Error uploading backup:", error);
      res.status(500).json({ 
        error: "Failed to upload backup",
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // ==================== BACKUP RESTORE ROUTES ====================
  
  // Restore database from backup
  app.post("/api/backups/restore/database", hasPermission(UserPermission.MANAGE_BACKUPS), async (req, res) => {
    try {
      const { filename, confirmFilename } = req.body ?? {};

      if (!filename) {
        return res.status(400).json({ error: "Backup filename is required" });
      }

      // Restoring overwrites live data. Require the caller to type/echo the
      // exact backup filename before any destructive work begins.
      if (confirmFilename !== filename) {
        return res.status(400).json({
          error: 'Confirmation does not match. Type the exact backup filename to confirm this restore.',
        });
      }

      // Validation: check if backup exists
      const backups = await backupService.listBackups('database');
      const backupExists = backups.some(backup => backup.filename === filename);
      
      if (!backupExists) {
        return res.status(404).json({ error: "Backup file not found" });
      }

      // Run restore
      const result = await backupService.restoreDatabase(filename);

      // The safety backup's own backup_runs row was recorded before the
      // restore ran, but a successful restore's --clean dump drops and
      // recreates every table, including backup_runs - so that row is gone
      // by the time this response is built. The file itself is still on disk
      // and findable via listBackups; surface its name here so the operator
      // isn't left guessing which file is their way back.
      res.json({
        success: true,
        message: "Database restore completed successfully",
        warning: "Please restart the application for changes to take full effect",
        safetyBackupFilename: result.safetyBackupFilename,
      });
    } catch (error) {
      console.error("Error restoring database:", error);
      // BUG-197: the body used to be {} — a 500 with nothing in it, which the
      // UI could only render as a shrug. A refused archive says exactly what
      // was wrong with it and that nothing was changed; a psql failure carries
      // psql's own first ERROR: line. Never the connection string (BUG-075).
      const refused = error instanceof Error && /^Refusing to restore/.test(error.message);
      res.status(refused ? 400 : 500).json({ error: restoreErrorMessage(error) });
    }
  });

  // Restore files from backup
  app.post("/api/backups/restore/files", hasPermission(UserPermission.MANAGE_BACKUPS), async (req, res) => {
    try {
      // targetPath is intentionally NOT accepted from the request body.
      // restoreFiles archives getUploadsDir() for its safety backup but would
      // extract into targetPath if given one - an unvalidated caller-supplied
      // path would let the safety net be taken over uploads/ while the
      // destructive tar --overwrite lands somewhere else entirely, defeating
      // the guard on exactly the path it exists to protect. Nothing in the UI
      // sends targetPath; restoreFiles(filename) always extracts to its
      // default (process.cwd()), matching where it archives from.
      const { filename } = req.body;

      if (!filename) {
        return res.status(400).json({ error: "Backup filename is required" });
      }

      // Validation: check if backup exists
      const backups = await backupService.listBackups('files');
      const backupExists = backups.some(backup => backup.filename === filename);

      if (!backupExists) {
        return res.status(404).json({ error: "Backup file not found" });
      }

      // Run restore
      const result = await backupService.restoreFiles(filename);

      res.json({
        success: true,
        message: `Files restore completed successfully (${result.filesWritten} files)`,
        filesWritten: result.filesWritten,
        safetyBackupFilename: result.safetyBackupFilename,
      });
    } catch (error) {
      console.error("Error restoring files:", error);
      const refused = error instanceof Error && /^Refusing to restore/.test(error.message);
      res.status(refused ? 400 : 500).json({ error: restoreErrorMessage(error) });
    }
  });

  // Complete system restore (database + files)
  app.post("/api/backups/restore/complete", hasPermission(UserPermission.MANAGE_BACKUPS), async (req, res) => {
    try {
      const { databaseBackup, filesBackup, confirmDatabaseBackup, confirmFilesBackup } = req.body ?? {};

      if (!databaseBackup || !filesBackup) {
        return res.status(400).json({
          error: "Both database and files backup filenames are required"
        });
      }

      // This is the most destructive restore path (database + files). Require
      // the caller to type/echo both exact filenames before any destructive
      // work begins.
      if (confirmDatabaseBackup !== databaseBackup || confirmFilesBackup !== filesBackup) {
        return res.status(400).json({
          error: 'Confirmation does not match. Type the exact database and files backup filenames to confirm this restore.',
        });
      }

      // Validation: check if both backups exist
      const [databaseBackups, filesBackups] = await Promise.all([
        backupService.listBackups('database'),
        backupService.listBackups('files')
      ]);
      
      const dbBackupExists = databaseBackups.some(backup => backup.filename === databaseBackup);
      const filesBackupExists = filesBackups.some(backup => backup.filename === filesBackup);
      
      if (!dbBackupExists) {
        return res.status(404).json({ error: "Database backup file not found" });
      }
      
      if (!filesBackupExists) {
        return res.status(404).json({ error: "Files backup file not found" });
      }

      // Run complete restore
      const result = await backupService.restoreComplete(databaseBackup, filesBackup);

      // The database safety backup's own backup_runs row is dropped by the
      // --clean dump this restore just applied - the file survives on disk,
      // but the in-app trail doesn't. Surface both filenames here so the
      // operator knows their way back without having to guess.
      res.json({
        success: true,
        message: "Complete system restore finished successfully!",
        warning: "IMPORTANT: Please restart the application to ensure all changes take effect",
        databaseRestored: result.databaseRestored,
        filesRestored: result.filesRestored,
        databaseSafetyBackupFilename: result.databaseSafetyBackupFilename,
        filesSafetyBackupFilename: result.filesSafetyBackupFilename,
      });
    } catch (error) {
      console.error("Error performing complete restore:", error);
      // BUG-208: a failure here is not a flat "it failed" — by the time the
      // second half fails the first one has already been applied and everyone
      // may already be logged out. Say which half landed.
      const partial = error as { databaseRestored?: boolean; filesRestored?: boolean; databaseSafetyBackupFilename?: string; filesSafetyBackupFilename?: string };
      const refused = error instanceof Error && /^Refusing to restore/.test(error.message);
      res.status(refused ? 400 : 500).json({
        error: restoreErrorMessage(error),
        databaseRestored: partial?.databaseRestored ?? false,
        filesRestored: partial?.filesRestored ?? false,
        databaseSafetyBackupFilename: partial?.databaseSafetyBackupFilename,
        filesSafetyBackupFilename: partial?.filesSafetyBackupFilename,
      });
    }
  });
}
