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
