import path from 'path';

/**
 * Where user-uploaded files live.
 *
 * The backup service and the upload routes MUST both resolve the uploads
 * directory through this function. They previously disagreed — the routes
 * honoured UPLOADS_DIR while the backup hardcoded process.cwd()/uploads —
 * which meant setting that variable would silently move uploads while the
 * backup carried on archiving an empty directory, reporting success.
 *
 * FIX-B (BUG-026, BUG-029, BUG-085, BUG-169, BUG-198, BUG-200, BUG-209):
 * there used to be 79 hard `path.join(process.cwd(), 'uploads')` joins beside
 * the 21 callers of this helper. With UPLOADS_DIR set — the production and
 * Coolify shape — the filesystem silently split in two: the static mount
 * served a different tree than the one every upload route wrote to, driver
 * licences 403'd on every request, transport reports 404'd forever and file
 * restore extracted into the application directory. This module is now the
 * single owner: every read, write, delete, archive and static mount resolves
 * through `getUploadsDir()` / `resolveUploadsPath()`, and
 * `assertWithinUploads()` is the loud guard for anything that does not.
 *
 * Read on EVERY call rather than cached at import time, so a test can point
 * UPLOADS_DIR at a temp directory before building the app.
 */
export function getUploadsDir(): string {
  return process.env.UPLOADS_DIR || path.join(process.cwd(), 'uploads');
}

/** The uploads root, absolute and normalised — what containment is measured against. */
export function getUploadsRoot(): string {
  return path.resolve(getUploadsDir());
}

/**
 * True when `absPath` is the uploads root itself or sits underneath it.
 * Purely lexical: callers that must also survive a symlink pointing out of
 * the tree resolve with `fs.realpathSync()` first (BUG-098).
 */
export function isInsideUploads(absPath: string): boolean {
  const root = getUploadsRoot();
  const resolved = path.resolve(absPath);
  return resolved === root || resolved.startsWith(root + path.sep);
}

/**
 * The loud guard. Throws — rather than silently writing, reading or unlinking
 * outside the configured root — when a path escapes the uploads directory.
 * Every filesystem operation built from a database column or a request value
 * goes through this or through `resolveUploadsPath()`.
 */
export function assertWithinUploads(absPath: string, what = 'path'): string {
  const resolved = path.resolve(absPath);
  if (!isInsideUploads(resolved)) {
    throw new Error(
      `Refusing to use a ${what} outside the uploads directory: ${resolved} is not under ${getUploadsRoot()}`
    );
  }
  return resolved;
}

/**
 * `path.join(getUploadsDir(), ...segments)` with containment enforced, so a
 * '..' segment (from a request body, a filename, or a stored column) cannot
 * walk out of the tree. Use for writes and deletes, where the target does not
 * have to exist yet; use `resolveDocumentFilePath()` for reads of stored
 * document paths, which also has to cope with legacy cwd-relative rows.
 */
export function resolveUploadsPath(...segments: string[]): string {
  return assertWithinUploads(path.join(getUploadsDir(), ...segments));
}

/** Same, but returns null instead of throwing — for request-driven lookups. */
export function tryResolveUploadsPath(...segments: string[]): string | null {
  try {
    return resolveUploadsPath(...segments);
  } catch {
    return null;
  }
}

/**
 * The portable form of an absolute uploads path: relative to the uploads root,
 * with forward slashes, so the value stored in the database survives a move of
 * UPLOADS_DIR. Returns null when the path is not under the root.
 */
export function toUploadsRelative(absPath: string): string | null {
  const root = getUploadsRoot();
  const resolved = path.resolve(absPath);
  if (!isInsideUploads(resolved)) return null;
  if (resolved === root) return '';
  return path.relative(root, resolved).split(path.sep).join('/');
}

/**
 * Where backups are written. BACKUP_PATH points at the mounted persistent
 * volume in deployment; the caller falls back to the configured database
 * value, then to a local directory, when it is unset.
 */
export function getBackupPathFromEnv(): string | undefined {
  return process.env.BACKUP_PATH || undefined;
}
