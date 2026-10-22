/** B-65: an active account nobody used for more than this many days is "slapend" (dormant). */
export const DORMANT_AFTER_DAYS = 90;

const DAY = 86_400_000;

/**
 * Dormant: still active, but no login for more than 90 days. An account that never logged in
 * counts from the day it was made, so a fresh account is not dormant on day one.
 */
export function isDormant(
  user: { active?: boolean | null; lastLoginAt?: string | Date | null; createdAt?: string | Date | null },
  now: Date = new Date(),
): boolean {
  if (user.active === false) return false;
  const since = user.lastLoginAt ?? user.createdAt;
  if (!since) return false;
  return now.getTime() - new Date(since).getTime() > DORMANT_AFTER_DAYS * DAY;
}

/** A short, recognisable name for a browser user-agent: "Chrome op Windows", "Safari op iPhone". */
export function deviceLabel(userAgent: string | null | undefined): { browser: string; os: string } {
  const ua = userAgent ?? "";
  const browser =
    /Edg\//.test(ua) ? "Edge"
    : /OPR\/|Opera/.test(ua) ? "Opera"
    : /Firefox\//.test(ua) ? "Firefox"
    : /Chrome\//.test(ua) ? "Chrome"
    : /Safari\//.test(ua) ? "Safari"
    : "";
  const os =
    /iPhone/.test(ua) ? "iPhone"
    : /iPad/.test(ua) ? "iPad"
    : /Android/.test(ua) ? "Android"
    : /Windows/.test(ua) ? "Windows"
    : /Mac OS X|Macintosh/.test(ua) ? "macOS"
    : /Linux/.test(ua) ? "Linux"
    : "";
  return { browser, os };
}
