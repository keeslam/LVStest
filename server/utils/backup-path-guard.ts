import path from "path";

/**
 * Security review 2026-10-18 (Laag 8): where nightly backups may be written.
 *
 * `backup_settings.local_path` used to be saved as typed. Inside the application folder that could be
 * the folder the website is served from (dist/public, client, uploads), so a full database dump would
 * be one URL away. Allowed: empty (the default), the default `backups` folder, or an absolute path
 * outside the application folder (a mounted volume such as /data/backups). BACKUP_PATH in the
 * environment still wins over all of this (see backupService.resolveBackupPath).
 *
 * Returns why a path is refused, or null when it is fine.
 */
export function backupLocalPathProblem(value: unknown, appRoot = process.cwd()): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") return "The backup folder must be text";
  const raw = value.trim();
  if (raw === "") return null;
  if (!path.isAbsolute(raw)) return "The backup folder must be a full path";
  if (raw.split(/[\\/]+/).includes("..")) return "The backup folder may not contain '..'";
  const target = path.resolve(raw);
  const root = path.resolve(appRoot);
  const insideApp = (dir: string) => {
    const rel = path.relative(dir, target);
    return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
  };
  if (insideApp(root) && !insideApp(path.join(root, "backups"))) {
    return "Inside the application folder only the 'backups' folder may hold backups";
  }
  return null;
}
