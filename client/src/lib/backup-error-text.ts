/**
 * Backup failures reach the client as a stable code (the server's own text is
 * English, technical and can carry a path, so no screen shows it). This turns
 * the code into a Dutch/English phrase, e.g. "het back-upprogramma ... is niet
 * gevonden op de server", for use inside a sentence (A-2-7, A-17-3).
 */
type Translate = (key: string) => string;

const KNOWN = new Set([
  "TOOL_MISSING",
  "DATABASE_UNREACHABLE",
  "DISK_FULL",
  "PERMISSION_DENIED",
  "BACKUP_DIR_MISSING",
  "NO_BACKUPS",
  "UNKNOWN",
]);

/** Phrase for a reason code from /api/backups/health, /status or a failed run. Unknown codes read as UNKNOWN. */
export function backupErrorReason(code: string | null | undefined, t: Translate): string {
  const key = code && KNOWN.has(code) ? code : "UNKNOWN";
  return t(`backup.errorByCode.${key}`);
}

export function isKnownBackupReason(code: unknown): code is string {
  return typeof code === "string" && code !== "UNKNOWN" && KNOWN.has(code);
}
