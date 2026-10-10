/**
 * A failed backup run is stored as free English text (pg_dump's own words, a
 * Node errno, ...). The screens must not show that text: it is English, it is
 * technical, and it can carry a path. This maps it to a small closed set of
 * stable codes; the client turns the code into Dutch or English (A-2-7,
 * A-17-3). Server messages stay English, the client never matches on them.
 */
export type BackupErrorCode =
  | "TOOL_MISSING"
  | "DATABASE_UNREACHABLE"
  | "DISK_FULL"
  | "PERMISSION_DENIED"
  | "BACKUP_DIR_MISSING"
  | "NO_BACKUPS"
  | "UNKNOWN";

export function classifyBackupError(message: string | null | undefined): BackupErrorCode {
  const text = String(message ?? "");
  if (/\b(pg_dump|pg_restore|psql|tar)\b/i.test(text) && /(ENOENT|not found|could not be started|executable)/i.test(text)) {
    return "TOOL_MISSING";
  }
  if (/(ENOSPC|no space left)/i.test(text)) return "DISK_FULL";
  if (/(ECONNREFUSED|could not connect|connection refused|authentication failed|timeout expired)/i.test(text)) {
    return "DATABASE_UNREACHABLE";
  }
  if (/(EACCES|EPERM|permission denied)/i.test(text)) return "PERMISSION_DENIED";
  return "UNKNOWN";
}
