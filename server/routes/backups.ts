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
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);
      
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
      
      // Use pg_dump to export the database
      await execAsync(`pg_dump "${databaseUrl}" > "${filepath}"`);
      
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
      console.error("Error downloading app data:", error);
      res.status(500).json({ 
        error: "Failed to download app data",
        details: error instanceof Error ? error.message : "Unknown error"
      });
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

  // Restore app data from uploaded SQL file
  app.post("/api/backups/restore-data", hasPermission(UserPermission.MANAGE_BACKUPS), backupUpload.single('backup'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No backup file uploaded' });
      }

      // Post-upload validation - verify file content matches backup type
      const fileValidation = await validateAfterUpload(
        req.file.path,
        req.file.originalname,
        req.file.mimetype,
        'backup'
      );
      if (!fileValidation.valid) {
        return res.status(400).json({ error: fileValidation.error });
      }

      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const os = await import('os');
      const execAsync = promisify(exec);

      const databaseUrl = process.env.DATABASE_URL;
      if (!databaseUrl) {
        throw new Error('DATABASE_URL not configured');
      }

      console.log('🔄 Starting database restore from:', req.file.path);
      console.log('📊 File size:', req.file.size, 'bytes');

      // The scheduled backups are written as .sql.gz, and .gz is an accepted
      // upload extension, but psql cannot read gzip. Restoring one used to drop
      // every table and only then fail on the binary, leaving an empty database
      // with nothing to roll back to. Decompress first, and verify the result
      // actually looks like a dump *before* anything is dropped.
      let restoreFilePath = req.file.path;
      let decompressedPath: string | null = null;

      const header = Buffer.alloc(2);
      const fd = await fs.promises.open(req.file.path, 'r');
      try {
        await fd.read(header, 0, 2, 0);
      } finally {
        await fd.close();
      }

      if (header[0] === 0x1f && header[1] === 0x8b) {
        const { createGunzip } = await import('zlib');
        const { pipeline } = await import('stream/promises');
        decompressedPath = path.join(os.tmpdir(), `restore-${Date.now()}.sql`);
        console.log('📦 Backup is gzipped — decompressing before restore');
        await pipeline(
          fs.createReadStream(req.file.path),
          createGunzip(),
          fs.createWriteStream(decompressedPath)
        );
        restoreFilePath = decompressedPath;
      }

      // Refuse anything that is not recognisably a SQL dump, while the existing
      // data is still intact.
      const probe = await fs.promises.readFile(restoreFilePath, { encoding: 'utf8', flag: 'r' })
        .then(text => text.slice(0, 4096))
        .catch(() => '');
      if (!/PostgreSQL database dump|CREATE TABLE|SET statement_timeout|INSERT INTO|COPY /i.test(probe)) {
        if (decompressedPath) {
          try { await fs.promises.unlink(decompressedPath); } catch {}
        }
        return res.status(400).json({
          error: 'That file does not look like a PostgreSQL dump, so the restore was cancelled. Nothing was changed.',
        });
      }

      // This route drops every table and restores over it, bypassing
      // backupService.restoreDatabase entirely - it has its own destructive
      // path, so it needs its own safety net. Take and verify a fresh backup
      // of the CURRENT database before anything is dropped. If this can't be
      // done, refuse to restore rather than proceed with no way back.
      const safety = await backupService.takeSafetyBackup('database');

      // Step 1: Drop all tables with CASCADE to remove dependencies
      console.log('🗑️ Dropping all existing tables...');
      const dropTablesQuery = `
        DO $$ DECLARE
          r RECORD;
        BEGIN
          FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP
            EXECUTE 'DROP TABLE IF EXISTS public.' || quote_ident(r.tablename) || ' CASCADE';
          END LOOP;
        END $$;
      `;
      
      // Write query to a temp file to avoid shell escaping issues with $$
      const dropScriptPath = path.join(os.tmpdir(), `drop-tables-${Date.now()}.sql`);
      await fs.promises.writeFile(dropScriptPath, dropTablesQuery);
      
      try {
        await execAsync(`psql "${databaseUrl}" -f "${dropScriptPath}"`);
        console.log('✅ All tables dropped');
      } finally {
        // Clean up temp file
        try {
          await fs.promises.unlink(dropScriptPath);
        } catch (e) {
          // Ignore cleanup errors
        }
      }

      // Step 2: Restore database using psql
      console.log('📥 Restoring database from backup...');
      const { stdout, stderr } = await execAsync(
        `psql "${databaseUrl}" -f "${restoreFilePath}" 2>&1`,
        { maxBuffer: 10 * 1024 * 1024 } // 10MB buffer for large restores
      );

      if (stdout) {
        console.log('📝 psql stdout:', stdout.substring(0, 1000)); // Log first 1000 chars
      }
      if (stderr) {
        console.log('⚠️ psql stderr:', stderr.substring(0, 1000));
      }

      console.log('✅ Database restore completed successfully');

      // Clean up uploaded file
      try {
        await fs.promises.unlink(req.file.path);
        if (decompressedPath) await fs.promises.unlink(decompressedPath);
      } catch (cleanupError) {
        console.error('Error cleaning up uploaded file:', cleanupError);
      }

      res.json({
        success: true,
        message: 'Database restored successfully. Please refresh your browser and log in again.',
        safetyBackupFilename: safety.filename,
      });
    } catch (error) {
      // Clean up file on error
      if (req.file) {
        try {
          await fs.promises.unlink(req.file.path);
        } catch (cleanupError) {
          console.error('Error cleaning up uploaded file:', cleanupError);
        }
      }

      console.error("❌ Error restoring app data:", error);
      // Surface the real reason (e.g. "Refusing to restore: ...") as `error`,
      // not a fixed generic string - both restore-data and restore-files are
      // read by client code that only looks at error.error, so a fixed string
      // here silently swallowed the safety-backup guard's refusal message and
      // made it indistinguishable from any other failure.
      res.status(500).json({
        error: error instanceof Error ? error.message : "Failed to restore app data",
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Restore app code from uploaded tar.gz file
  app.post("/api/backups/restore-code", hasPermission(UserPermission.MANAGE_BACKUPS), backupUpload.single('backup'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No backup file uploaded' });
      }

      // Post-upload validation - verify file content matches backup type
      const fileValidation = await validateAfterUpload(
        req.file.path,
        req.file.originalname,
        req.file.mimetype,
        'backup'
      );
      if (!fileValidation.valid) {
        return res.status(400).json({ error: fileValidation.error });
      }

      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);

      // Extract tar.gz to current directory (will overwrite existing files)
      await execAsync(`tar -xzf "${req.file.path}" -C "${process.cwd()}"`);

      // Clean up uploaded file
      try {
        await fs.promises.unlink(req.file.path);
      } catch (cleanupError) {
        console.error('Error cleaning up uploaded file:', cleanupError);
      }

      res.json({
        success: true,
        message: 'Code restored successfully. The application will restart automatically.',
      });

      // Restart the application after a short delay
      setTimeout(() => {
        process.exit(0); // PM2 or the process manager will restart the app
      }, 2000);
    } catch (error) {
      // Clean up file on error
      if (req.file) {
        try {
          await fs.promises.unlink(req.file.path);
        } catch (cleanupError) {
          console.error('Error cleaning up uploaded file:', cleanupError);
        }
      }
      
      console.error("Error restoring app code:", error);
      res.status(500).json({ 
        error: "Failed to restore app code",
        details: error instanceof Error ? error.message : "Unknown error"
      });
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
      
      const uploadsDir = path.join(process.cwd(), 'uploads');
      
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
      await execAsync(`tar -czf "${filepath}" -C "${process.cwd()}" uploads`);
      
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

  // Restore uploaded files from tar.gz archive
  app.post("/api/backups/restore-files", hasPermission(UserPermission.MANAGE_BACKUPS), backupUpload.single('backup'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No backup file uploaded' });
      }

      // Post-upload validation - verify file content matches backup type
      const fileValidation = await validateAfterUpload(
        req.file.path,
        req.file.originalname,
        req.file.mimetype,
        'backup'
      );
      if (!fileValidation.valid) {
        return res.status(400).json({ error: fileValidation.error });
      }

      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);

      // This route extracts straight over uploads/, bypassing
      // backupService.restoreFiles entirely - it has its own destructive
      // path, so it needs its own safety net. Take and verify a fresh backup
      // of the CURRENT uploads/ before anything is overwritten. If this can't
      // be done, refuse to restore rather than proceed with no way back.
      const safety = await backupService.takeSafetyBackup('files');

      // Extract tar.gz to current directory (will restore uploads folder)
      await execAsync(`tar -xzf "${req.file.path}" -C "${process.cwd()}"`);

      // Clean up uploaded file
      try {
        await fs.promises.unlink(req.file.path);
      } catch (cleanupError) {
        console.error('Error cleaning up uploaded file:', cleanupError);
      }

      res.json({
        success: true,
        message: 'All uploaded files have been restored successfully.',
        safetyBackupFilename: safety.filename,
      });
    } catch (error) {
      // Clean up file on error
      if (req.file) {
        try {
          await fs.promises.unlink(req.file.path);
        } catch (cleanupError) {
          console.error('Error cleaning up uploaded file:', cleanupError);
        }
      }

      console.error("Error restoring uploaded files:", error);
      // Surface the real reason (e.g. "Refusing to restore: ...") as `error`,
      // not a fixed generic string - see the matching comment in
      // /api/backups/restore-data's catch block above.
      res.status(500).json({
        error: error instanceof Error ? error.message : "Failed to restore uploaded files",
        details: error instanceof Error ? error.message : "Unknown error"
      });
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

      // Security: prevent directory traversal
      if (filename.includes('..') || filename.includes('/')) {
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
      res.json({
        lastSuccessAt,
        ageHours,
        stale: ageHours === null || ageHours > 48,
        lastError: status.lastError ?? null,
        backupPath: pathInfo.path,
        backupPathFromEnv: pathInfo.fromEnv,
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
      console.error("Error running backup:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to run backup" 
      });
    }
  });

  // Download backup file
  app.get("/api/backups/download/:type/:filename", hasPermission(UserPermission.MANAGE_BACKUPS), async (req, res) => {
    try {
      const { type, filename } = req.params;

      if (!['database', 'files'].includes(type)) {
        return res.status(400).json({ error: "Invalid backup type" });
      }

      // Security: prevent directory traversal (see /api/backups/download/:filename above)
      if (filename.includes('..') || filename.includes('/')) {
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

      // Security: prevent directory traversal (see /api/backups/download/:filename above)
      if (filename.includes('..') || filename.includes('/')) {
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

      // Create backup directory if it doesn't exist
      const backupDir = path.join(process.cwd(), 'backups');
      if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
      }

      // Generate a unique filename with timestamp
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const originalName = file.originalname.replace(/\.[^/.]+$/, ""); // Remove extension
      const extension = file.originalname.substring(file.originalname.lastIndexOf('.'));
      const newFilename = `uploaded-${backupType}-${timestamp}-${originalName}${extension}`;
      const destinationPath = path.join(backupDir, newFilename);

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
      res.status(500).json({
        error: error instanceof Error ? error.message : "Failed to restore database"
      });
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
        message: "Files restore completed successfully",
        safetyBackupFilename: result.safetyBackupFilename,
      });
    } catch (error) {
      console.error("Error restoring files:", error);
      res.status(500).json({
        error: error instanceof Error ? error.message : "Failed to restore files"
      });
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
        databaseSafetyBackupFilename: result.databaseSafetyBackupFilename,
        filesSafetyBackupFilename: result.filesSafetyBackupFilename,
      });
    } catch (error) {
      console.error("Error performing complete restore:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to perform complete restore" 
      });
    }
  });
}
