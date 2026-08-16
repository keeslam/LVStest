import { spawn } from 'child_process';
import { createReadStream, createWriteStream, existsSync, readFileSync, writeFileSync, copyFileSync, readdirSync, statSync } from 'fs';
import { readdir, stat, mkdir, unlink } from 'fs/promises';
import { pipeline } from 'stream/promises';
import { join, dirname } from 'path';
import { createGzip } from 'zlib';
import { createHash } from 'crypto';
import archiver from 'archiver';
import { ObjectStorageService } from './objectStorage';
import { db } from './db';
import { backupSettings } from '@shared/schema';

export interface BackupManifest {
  timestamp: string;
  type: 'database' | 'files';
  filename: string;
  size: number;
  checksum: string;
  metadata?: {
    dbVersion?: string;
    fileCount?: number;
    compressedSize?: number;
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
  private objectStorage: ObjectStorageService;
  private isRunning = false;
  private statusFile = '/tmp/backup-status.json';
  private defaultBackupPath = join(process.cwd(), 'backups'); // Default backup path relative to project

  constructor() {
    this.objectStorage = new ObjectStorageService();
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

  // Get current backup status
  getStatus(): BackupStatus {
    try {
      if (existsSync(this.statusFile)) {
        const data = JSON.parse(readFileSync(this.statusFile, 'utf8'));
        return { ...data, isRunning: this.isRunning };
      }
    } catch (error) {
      console.error('Error reading backup status:', error);
    }

    return {
      isRunning: this.isRunning,
      nextScheduled: this.getNextScheduledTime()
    };
  }

  // Update backup status
  private updateStatus(updates: Partial<BackupStatus>): void {
    try {
      const currentStatus = this.getStatus();
      const newStatus = { ...currentStatus, ...updates };
      writeFileSync(this.statusFile, JSON.stringify(newStatus, null, 2));
    } catch (error) {
      console.error('Error updating backup status:', error);
    }
  }

  // Get next scheduled backup time (2:00 AM tomorrow)
  private getNextScheduledTime(): string {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(2, 0, 0, 0);
    return tomorrow.toISOString();
  }

  // Create database backup
  async createDatabaseBackup(): Promise<BackupManifest> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `db-backup-${timestamp}.sql.gz`;
    const tempFile = `/tmp/${filename}`;
    
    console.log('Creating database backup...');
    
    // Create pg_dump command
    const pgDumpProcess = spawn('pg_dump', [
      process.env.DATABASE_URL!,
      '--verbose',
      '--clean',
      '--if-exists',
      '--no-owner',
      '--no-privileges'
    ]);

    // Create gzip stream
    const gzip = createGzip({ level: 9 });
    const writeStream = createWriteStream(tempFile);

    // Handle errors
    pgDumpProcess.stderr.on('data', (data) => {
      console.log(`pg_dump: ${data}`);
    });

    const pgDumpExited = new Promise<void>((resolve, reject) => {
      pgDumpProcess.on('error', reject);
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
      timestamp,
      type: 'database',
      filename,
      size: fileStats.size,
      checksum,
      metadata: {
        compressedSize: fileStats.size
      }
    };

    // Get backup settings to determine storage type
    const settings = await this.getBackupSettings();
    const storageType = settings?.storageType || 'local_filesystem';
    const backupPath = settings?.localPath || this.defaultBackupPath;
    
    try {
      if (storageType === 'object_storage') {
        // Try to upload to object storage
        try {
          const privatePath = this.objectStorage.getPrivateObjectDir();
          const backupPath = `${privatePath}/backups/database/${new Date().getFullYear()}/${String(new Date().getMonth() + 1).padStart(2, '0')}/${String(new Date().getDate()).padStart(2, '0')}/${filename}`;
          
          const readStream = createReadStream(tempFile);
          await this.objectStorage.uploadStream(backupPath, readStream, 'application/gzip');

          // Upload manifest
          const manifestPath = `${privatePath}/backups/database/${new Date().getFullYear()}/${String(new Date().getMonth() + 1).padStart(2, '0')}/${String(new Date().getDate()).padStart(2, '0')}/${filename}.manifest.json`;
          await this.objectStorage.uploadBuffer(manifestPath, Buffer.from(JSON.stringify(manifest, null, 2)), 'application/json');
          
          console.log(`✅ Database backup uploaded to object storage: ${filename} (${fileStats.size} bytes)`);
        } catch (objectStorageError) {
          // Fallback to local filesystem if object storage fails
          console.warn('⚠️ Object storage failed, falling back to local filesystem:', objectStorageError);
          await this.saveToLocalFilesystem(tempFile, filename, 'database', backupPath);
          
          // Also save manifest
          const typeDir = join(backupPath, 'database');
          const fullPath = await this.ensureBackupDirectory(typeDir);
          const manifestPath = join(fullPath, `${filename}.manifest.json`);
          writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
          
          console.log(`✅ Database backup saved to local filesystem (fallback): ${filename} (${fileStats.size} bytes)`);
        }
      } else {
        // Use local filesystem storage
        await this.saveToLocalFilesystem(tempFile, filename, 'database', backupPath);
        
        // Also save manifest
        const typeDir = join(backupPath, 'database');
        const fullPath = await this.ensureBackupDirectory(typeDir);
        const manifestPath = join(fullPath, `${filename}.manifest.json`);
        writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
        
        console.log(`✅ Database backup saved to local filesystem: ${filename} (${fileStats.size} bytes)`);
      }
    } catch (error) {
      // If both attempts fail, throw a clear error
      const errorMessage = `Failed to save database backup. Tried path: ${backupPath}. Error: ${error instanceof Error ? error.message : String(error)}`;
      console.error(`❌ ${errorMessage}`);
      throw new Error(errorMessage);
    }

    return manifest;
  }

  // Create files backup
  async createFilesBackup(): Promise<BackupManifest> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `files-backup-${timestamp}.tar.gz`;
    const tempFile = `/tmp/${filename}`;
    
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
    const uploadsDir = join(process.cwd(), 'uploads');
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
      timestamp,
      type: 'files',
      filename,
      size: fileStats.size,
      checksum,
      metadata: {
        fileCount,
        compressedSize: fileStats.size
      }
    };

    // Get backup settings to determine storage type
    const settings = await this.getBackupSettings();
    const storageType = settings?.storageType || 'local_filesystem';
    const backupPath = settings?.localPath || this.defaultBackupPath;
    
    try {
      if (storageType === 'object_storage') {
        // Try to upload to object storage
        try {
          const privatePath = this.objectStorage.getPrivateObjectDir();
          const backupPath = `${privatePath}/backups/files/${new Date().getFullYear()}/${String(new Date().getMonth() + 1).padStart(2, '0')}/${String(new Date().getDate()).padStart(2, '0')}/${filename}`;
          
          const readStream = createReadStream(tempFile);
          await this.objectStorage.uploadStream(backupPath, readStream, 'application/gzip');

          // Upload manifest
          const manifestPath = `${privatePath}/backups/files/${new Date().getFullYear()}/${String(new Date().getMonth() + 1).padStart(2, '0')}/${String(new Date().getDate()).padStart(2, '0')}/${filename}.manifest.json`;
          await this.objectStorage.uploadBuffer(manifestPath, Buffer.from(JSON.stringify(manifest, null, 2)), 'application/json');
          
          console.log(`✅ Files backup uploaded to object storage: ${filename} (${fileStats.size} bytes, ${fileCount} files)`);
        } catch (objectStorageError) {
          // Fallback to local filesystem if object storage fails
          console.warn('⚠️ Object storage failed, falling back to local filesystem:', objectStorageError);
          await this.saveToLocalFilesystem(tempFile, filename, 'files', backupPath);
          
          // Also save manifest
          const typeDir = join(backupPath, 'files');
          const fullPath = await this.ensureBackupDirectory(typeDir);
          const manifestPath = join(fullPath, `${filename}.manifest.json`);
          writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
          
          console.log(`✅ Files backup saved to local filesystem (fallback): ${filename} (${fileStats.size} bytes, ${fileCount} files)`);
        }
      } else {
        // Use local filesystem storage
        await this.saveToLocalFilesystem(tempFile, filename, 'files', backupPath);
        
        // Also save manifest
        const typeDir = join(backupPath, 'files');
        const fullPath = await this.ensureBackupDirectory(typeDir);
        const manifestPath = join(fullPath, `${filename}.manifest.json`);
        writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
        
        console.log(`✅ Files backup saved to local filesystem: ${filename} (${fileStats.size} bytes, ${fileCount} files)`);
      }
    } catch (error) {
      // If both attempts fail, throw a clear error
      const errorMessage = `Failed to save files backup. Tried path: ${backupPath}. Error: ${error instanceof Error ? error.message : String(error)}`;
      console.error(`❌ ${errorMessage}`);
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
  async runBackup(): Promise<{ database: BackupManifest; files: BackupManifest }> {
    if (this.isRunning) {
      throw new Error('Backup is already running');
    }

    this.isRunning = true;
    const startTime = new Date().toISOString();
    
    try {
      this.updateStatus({
        lastRun: startTime,
        isRunning: true,
        nextScheduled: this.getNextScheduledTime()
      });

      console.log('Starting backup process...');

      // Create both backups
      const [databaseBackup, filesBackup] = await Promise.all([
        this.createDatabaseBackup(),
        this.createFilesBackup()
      ]);

      // Update status file
      const endTime = new Date().toISOString();
      await this.updateStatusFile(startTime, endTime, { database: databaseBackup, files: filesBackup });

      this.updateStatus({
        lastSuccess: endTime,
        isRunning: false
      });

      console.log('Backup completed successfully');
      return { database: databaseBackup, files: filesBackup };

    } catch (error) {
      const errorTime = new Date().toISOString();
      console.error('Backup failed:', error);
      
      this.updateStatus({
        lastError: `${errorTime}: ${error instanceof Error ? error.message : String(error)}`,
        isRunning: false
      });

      throw error;
    } finally {
      this.isRunning = false;
    }
  }

  // Update status file in object storage
  private async updateStatusFile(startTime: string, endTime: string, backups: { database: BackupManifest; files: BackupManifest }): Promise<void> {
    try {
      const privatePath = this.objectStorage.getPrivateObjectDir();
      const statusPath = `${privatePath}/backups/status/last.json`;
      
      const status = {
        startTime,
        endTime,
        duration: new Date(endTime).getTime() - new Date(startTime).getTime(),
        backups,
        success: true
      };

      await this.objectStorage.uploadBuffer(statusPath, Buffer.from(JSON.stringify(status, null, 2)), 'application/json');
    } catch (error) {
      console.error('Error updating status file in object storage:', error);
    }
  }

  // List available backups
  async listBackups(type?: 'database' | 'files'): Promise<BackupManifest[]> {
    try {
      // Get backup settings to determine storage type
      const settings = await this.getBackupSettings();
      const storageType = settings?.storageType || 'local_filesystem';
      const backupPath = settings?.localPath || this.defaultBackupPath;
      
      const backupTypes = type ? [type] : ['database', 'files'];
      const manifests: BackupManifest[] = [];

      if (storageType === 'object_storage') {
        // List from object storage
        const privatePath = this.objectStorage.getPrivateObjectDir();
        
        for (const backupType of backupTypes) {
          const prefix = `${privatePath}/backups/${backupType}/`;
          const files = await this.objectStorage.listFiles(prefix);
          
          for (const file of files) {
            if (file.name.endsWith('.manifest.json')) {
              try {
                const buffer = await file.download();
                const manifest = JSON.parse(buffer[0].toString('utf8'));
                manifests.push(manifest);
              } catch (error) {
                console.error(`Error reading manifest ${file.name}:`, error);
              }
            }
          }
        }
      } else {
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

  // Restore database from backup
  async restoreDatabase(backupFilename: string): Promise<void> {
    console.log(`Starting database restore from: ${backupFilename}`);
    
    // Get backup settings to determine storage type
    const settings = await this.getBackupSettings();
    const storageType = settings?.storageType || 'local_filesystem';
    const backupPath = settings?.localPath || this.defaultBackupPath;
    
    let tempFile = `/tmp/restore-${Date.now()}-${backupFilename}`;
    
    try {
      if (storageType === 'object_storage') {
        // Download from object storage
        const privatePath = this.objectStorage.getPrivateObjectDir();
        const remotePath = await this.findBackupPath(backupFilename, 'database');
        
        if (!remotePath) {
          throw new Error(`Backup file not found in object storage: ${backupFilename}`);
        }

        const files = await this.objectStorage.listFiles(remotePath);
        const backupFile = files.find(f => f.name.endsWith(backupFilename));
        
        if (!backupFile) {
          throw new Error(`Could not download backup from object storage: ${backupFilename}`);
        }

        const [buffer] = await backupFile.download();
        writeFileSync(tempFile, buffer);
      } else {
        // Use local filesystem - find the backup file
        const localBackupPath = join(backupPath, backupFilename);
        
        if (existsSync(localBackupPath)) {
          // File is directly in backups directory (uploaded backup)
          tempFile = localBackupPath;
        } else {
          // Try to find in organized structure (created backup)
          const searchPaths = [
            join(backupPath, 'database', backupFilename),
            ...this.findFileInDateStructure(join(backupPath, 'database'), backupFilename)
          ];
          
          let found = false;
          for (const path of searchPaths) {
            if (existsSync(path)) {
              tempFile = path;
              found = true;
              break;
            }
          }
          
          if (!found) {
            throw new Error(`Backup file not found in local filesystem: ${backupFilename}`);
          }
        }
        
        console.log(`Found backup file at: ${tempFile}`);
      }
    } catch (error) {
      throw new Error(`Failed to locate backup file: ${error instanceof Error ? error.message : String(error)}`);
    }

    const isTemporaryFile = tempFile.startsWith('/tmp/');
    let uncompressedFile = tempFile;
    
    try {
      // Decompress if needed
      if (tempFile.endsWith('.gz')) {
        uncompressedFile = tempFile.replace('.gz', '');
        console.log(`Decompressing ${tempFile} to ${uncompressedFile}`);
        
        const gunzipProcess = spawn('gunzip', ['-c', tempFile]);
        const writeStream = createWriteStream(uncompressedFile);
        
        gunzipProcess.stdout.pipe(writeStream);
        
        await new Promise<void>((resolve, reject) => {
          gunzipProcess.on('close', (code) => {
            if (code === 0) {
              resolve();
            } else {
              reject(new Error(`Decompression failed with code ${code}`));
            }
          });
          gunzipProcess.on('error', reject);
        });
      }
      
      // Verify backup integrity (skip for uploaded backups without manifest)
      try {
        const manifest = await this.getBackupManifest(backupFilename, 'database');
        if (manifest?.checksum && manifest.checksum !== 'uploaded') {
          const actualChecksum = await this.calculateChecksum(tempFile);
          if (actualChecksum !== manifest.checksum) {
            throw new Error('Backup file integrity check failed - checksum mismatch');
          }
        }
      } catch (error) {
        console.warn('Could not verify backup integrity (manifest may be missing):', error);
      }

      // Stop application connections (in production, you'd want more sophisticated handling)
      console.log('WARNING: Database restore will disconnect all users');
      
      // Import database
      const psqlProcess = spawn('psql', [
        process.env.DATABASE_URL!,
        '-f', uncompressedFile
      ]);

      let stderr = '';
      psqlProcess.stderr.on('data', (data) => {
        stderr += data.toString();
        console.log(`psql restore: ${data}`);
      });

      psqlProcess.stdout.on('data', (data) => {
        console.log(`psql restore: ${data}`);
      });

      // Wait for completion
      await new Promise<void>((resolve, reject) => {
        psqlProcess.on('close', (code) => {
          if (code === 0) {
            console.log('Database restore completed successfully');
            resolve();
          } else {
            reject(new Error(`Database restore failed with code ${code}. Error: ${stderr}`));
          }
        });
      });

    } finally {
      // Cleanup temp files (but not the original backup file)
      if (isTemporaryFile && existsSync(tempFile)) {
        try {
          require('fs').unlinkSync(tempFile);
        } catch (error) {
          console.error('Error cleaning up temp restore file:', error);
        }
      }
      
      // Cleanup uncompressed file if it was created
      if (uncompressedFile !== tempFile && existsSync(uncompressedFile)) {
        try {
          require('fs').unlinkSync(uncompressedFile);
        } catch (error) {
          console.error('Error cleaning up uncompressed file:', error);
        }
      }
    }
  }

  // Restore files from backup
  async restoreFiles(backupFilename: string, targetPath?: string): Promise<void> {
    console.log(`Starting files restore from: ${backupFilename}`);
    
    // Get backup settings to determine storage type
    const settings = await this.getBackupSettings();
    const storageType = settings?.storageType || 'local_filesystem';
    const backupPath = settings?.localPath || this.defaultBackupPath;
    
    let tempFile = `/tmp/restore-${Date.now()}-${backupFilename}`;
    
    try {
      if (storageType === 'object_storage') {
        // Download from object storage
        const remotePath = await this.findBackupPath(backupFilename, 'files');
        
        if (!remotePath) {
          throw new Error(`Backup file not found in object storage: ${backupFilename}`);
        }

        const files = await this.objectStorage.listFiles(remotePath);
        const backupFile = files.find(f => f.name.endsWith(backupFilename));
        
        if (!backupFile) {
          throw new Error(`Could not download backup from object storage: ${backupFilename}`);
        }

        const [buffer] = await backupFile.download();
        writeFileSync(tempFile, buffer);
      } else {
        // Use local filesystem - find the backup file
        const localBackupPath = join(backupPath, backupFilename);
        
        if (existsSync(localBackupPath)) {
          // File is directly in backups directory (uploaded backup)
          tempFile = localBackupPath;
        } else {
          // Try to find in organized structure (created backup)
          const searchPaths = [
            join(backupPath, 'files', backupFilename),
            ...this.findFileInDateStructure(join(backupPath, 'files'), backupFilename)
          ];
          
          let found = false;
          for (const path of searchPaths) {
            if (existsSync(path)) {
              tempFile = path;
              found = true;
              break;
            }
          }
          
          if (!found) {
            throw new Error(`Backup file not found in local filesystem: ${backupFilename}`);
          }
        }
        
        console.log(`Found backup file at: ${tempFile}`);
      }
    } catch (error) {
      throw new Error(`Failed to locate backup file: ${error instanceof Error ? error.message : String(error)}`);
    }

    const isTemporaryFile = tempFile.startsWith('/tmp/');
    
    try {
      // Verify backup integrity (skip for uploaded backups without manifest)
      try {
        const manifest = await this.getBackupManifest(backupFilename, 'files');
        if (manifest?.checksum && manifest.checksum !== 'uploaded') {
          const actualChecksum = await this.calculateChecksum(tempFile);
          if (actualChecksum !== manifest.checksum) {
            throw new Error('Backup file integrity check failed - checksum mismatch');
          }
        }
      } catch (error) {
        console.warn('Could not verify backup integrity (manifest may be missing):', error);
      }

      // Extract files
      const extractPath = targetPath || process.cwd();
      console.log(`Extracting files to: ${extractPath}`);
      
      const tarProcess = spawn('tar', [
        '-xzf', tempFile,
        '-C', extractPath,
        '--overwrite'
      ]);

      let stderr = '';
      tarProcess.stderr.on('data', (data) => {
        stderr += data.toString();
        console.log(`tar restore: ${data}`);
      });

      tarProcess.stdout.on('data', (data) => {
        console.log(`tar restore: ${data}`);
      });

      // Wait for completion
      await new Promise<void>((resolve, reject) => {
        tarProcess.on('close', (code) => {
          if (code === 0) {
            console.log('Files restore completed successfully');
            resolve();
          } else {
            reject(new Error(`Files restore failed with code ${code}. Error: ${stderr}`));
          }
        });
      });

    } finally {
      // Cleanup temp files (but not the original backup file)
      if (isTemporaryFile && existsSync(tempFile)) {
        try {
          require('fs').unlinkSync(tempFile);
        } catch (error) {
          console.error('Error cleaning up temp restore file:', error);
        }
      }
    }
  }

  // Complete system restore (database + files)
  async restoreComplete(databaseBackup: string, filesBackup: string): Promise<void> {
    console.log('Starting complete system restore...');
    console.log(`Database backup: ${databaseBackup}`);
    console.log(`Files backup: ${filesBackup}`);
    
    try {
      // Restore database first
      await this.restoreDatabase(databaseBackup);
      
      // Then restore files
      await this.restoreFiles(filesBackup);
      
      console.log('Complete system restore finished successfully!');
      console.log('IMPORTANT: Please restart the application to ensure all changes take effect.');
      
    } catch (error) {
      console.error('Complete restore failed:', error);
      throw new Error(`Complete restore failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Helper method to find backup path in object storage
  private async findBackupPath(filename: string, type: 'database' | 'files'): Promise<string | null> {
    try {
      const privatePath = this.objectStorage.getPrivateObjectDir();
      const basePrefix = `${privatePath}/backups/${type}/`;
      
      // Search through year/month/day structure
      const files = await this.objectStorage.listFiles(basePrefix);
      
      for (const file of files) {
        if (file.name.endsWith(filename)) {
          return file.name.substring(0, file.name.lastIndexOf('/') + 1);
        }
      }
      
      return null;
    } catch (error) {
      console.error('Error finding backup path:', error);
      return null;
    }
  }

  // Helper method to get backup manifest
  private async getBackupManifest(filename: string, type: 'database' | 'files'): Promise<BackupManifest | null> {
    try {
      const backupPath = await this.findBackupPath(filename, type);
      if (!backupPath) return null;

      const manifestPath = `${backupPath}${filename}.manifest.json`;
      const files = await this.objectStorage.listFiles(manifestPath);
      
      if (files.length === 0) return null;
      
      const [buffer] = await files[0].download();
      return JSON.parse(buffer.toString('utf8'));
    } catch (error) {
      console.error('Error getting backup manifest:', error);
      return null;
    }
  }

  // Download backup file
  async downloadBackup(filename: string, type: 'database' | 'files'): Promise<{ stream: NodeJS.ReadableStream, contentType: string } | null> {
    try {
      const settings = await this.getBackupSettings();
      const storageType = settings?.storageType || 'local_filesystem';
      const backupPath = settings?.localPath || this.defaultBackupPath;

      if (storageType === 'object_storage') {
        // Download from object storage
        const privatePath = this.objectStorage.getPrivateObjectDir();
        const files = await this.objectStorage.listFiles(`${privatePath}/backups/${type}/`);
        
        const backupFile = files.find(file => file.name.includes(filename));
        if (!backupFile) {
          console.error(`Backup file not found in object storage: ${filename}`);
          return null;
        }

        const [buffer] = await backupFile.download();
        const { Readable } = require('stream');
        const stream = Readable.from(buffer);
        
        return {
          stream,
          contentType: 'application/gzip'
        };
      } else {
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
      }
    } catch (error) {
      console.error(`Error downloading backup ${filename}:`, error);
      return null;
    }
  }

  // Delete backup file
  async deleteBackup(filename: string, type: 'database' | 'files'): Promise<void> {
    try {
      const settings = await this.getBackupSettings();
      const storageType = settings?.storageType || 'local_filesystem';
      const backupPath = settings?.localPath || this.defaultBackupPath;

      if (storageType === 'object_storage') {
        // Delete from object storage
        const privatePath = this.objectStorage.getPrivateObjectDir();
        const files = await this.objectStorage.listFiles(`${privatePath}/backups/${type}/`);
        
        // Find and delete the backup file and its manifest
        const filesToDelete = files.filter(file => file.name.includes(filename));
        
        for (const file of filesToDelete) {
          await this.objectStorage.deleteFile(file.name);
          console.log(`Deleted backup file from object storage: ${file.name}`);
        }
      } else {
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
        
        if (filePath && existsSync(filePath)) {
          await unlink(filePath);
          console.log(`Deleted backup file from local filesystem: ${filePath}`);
        }
        
        if (manifestPath && existsSync(manifestPath)) {
          await unlink(manifestPath);
          console.log(`Deleted manifest file from local filesystem: ${manifestPath}`);
        }
      }
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
    const toDelete: string[] = [];

    for (const backup of backups) {
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
        const privatePath = this.objectStorage.getPrivateObjectDir();
        const year = backupDate.getFullYear();
        const month = String(backupDate.getMonth() + 1).padStart(2, '0');
        const day = String(backupDate.getDate()).padStart(2, '0');
        
        toDelete.push(`${privatePath}/backups/${backup.type}/${year}/${month}/${day}/${backup.filename}`);
        toDelete.push(`${privatePath}/backups/${backup.type}/${year}/${month}/${day}/${backup.filename}.manifest.json`);
      }
    }

    // Delete old backups
    for (const path of toDelete) {
      try {
        await this.objectStorage.deleteFile(path);
        console.log(`Deleted old backup: ${path}`);
      } catch (error) {
        console.error(`Error deleting ${path}:`, error);
      }
    }

    console.log(`Cleanup completed. Deleted ${toDelete.length / 2} old backups.`);
  }
}