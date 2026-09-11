import { db, pool } from '../../db';
import { activeSessions } from '../../../shared/schema';
import { eq, and, lt, gt } from 'drizzle-orm';
import type { Request } from 'express';

/**
 * Create or update active session tracking
 */
export async function trackSession(
  sessionId: string,
  userId: number,
  username: string,
  req: Request,
  expiresAt: Date
): Promise<void> {
  try {
    const ipAddress = getClientIp(req);
    const userAgent = req.get('user-agent') || 'unknown';

    // Check if session already exists
    const existing = await db
      .select()
      .from(activeSessions)
      .where(eq(activeSessions.sessionId, sessionId))
      .limit(1);

    if (existing.length > 0) {
      // Update existing session
      await db
        .update(activeSessions)
        .set({
          lastActivity: new Date(),
          expiresAt,
        })
        .where(eq(activeSessions.sessionId, sessionId));
    } else {
      // Create new session
      await db.insert(activeSessions).values({
        sessionId,
        userId,
        username,
        ipAddress,
        userAgent,
        expiresAt,
      });
    }
  } catch (error) {
    console.error('Error tracking session:', error);
  }
}

/**
 * Update session last activity timestamp
 */
export async function updateSessionActivity(sessionId: string): Promise<void> {
  try {
    await db
      .update(activeSessions)
      .set({ lastActivity: new Date() })
      .where(eq(activeSessions.sessionId, sessionId));
  } catch (error) {
    console.error('Error updating session activity:', error);
  }
}

/**
 * Get all active sessions for a user
 */
export async function getUserActiveSessions(userId: number) {
  try {
    const now = new Date();
    return await db
      .select()
      .from(activeSessions)
      .where(
        and(
          eq(activeSessions.userId, userId),
          gt(activeSessions.expiresAt, now)
        )
      );
  } catch (error) {
    console.error('Error getting user sessions:', error);
    return [];
  }
}

/**
 * BUG-091 / BUG-095 — deleting the `active_sessions` row only removed this
 * server's *bookkeeping*; the session itself lives in the connect-pg-simple
 * `session` table, and until that row is gone the cookie still works. Every
 * revocation therefore has to clear both.
 *
 * Staff sessions serialise `passport.user` as the bare numeric user id
 * (server/auth.ts), which is what lets us find a user's rows in the store.
 */
async function deleteSessionRows(sessionIds: string[]): Promise<void> {
  if (sessionIds.length === 0) return;
  try {
    await pool.query('delete from session where sid = any($1::text[])', [sessionIds]);
  } catch (error) {
    // The store table may not exist yet on a first run; the tracking rows are
    // already gone, so this is worth logging and not worth failing over.
    console.error('Error deleting session store rows:', error);
  }
}

/**
 * Revoke a specific session
 */
export async function revokeSession(sessionId: string): Promise<boolean> {
  try {
    await db.delete(activeSessions).where(eq(activeSessions.sessionId, sessionId));
    await deleteSessionRows([sessionId]);
    return true;
  } catch (error) {
    console.error('Error revoking session:', error);
    return false;
  }
}

/**
 * Revoke all sessions for a user except the current one
 */
export async function revokeUserSessions(
  userId: number,
  exceptSessionId?: string
): Promise<number> {
  try {
    const allSessions = await db
      .select()
      .from(activeSessions)
      .where(eq(activeSessions.userId, userId));

    const doomed = allSessions
      .map((row) => row.sessionId)
      .filter((sessionId) => sessionId !== exceptSessionId);

    for (const session of allSessions) {
      if (session.sessionId !== exceptSessionId) {
        await db.delete(activeSessions).where(eq(activeSessions.id, session.id));
      }
    }

    // BUG-091: and out of the session store itself, so the cookies those
    // browsers still hold cannot be loaded any more.
    await deleteSessionRows(doomed);

    // Any store row for this user that was never tracked (a session predating
    // trackSession, or one whose tracking row was pruned) goes as well.
    try {
      await pool.query(
        `delete from session
           where sess -> 'passport' ->> 'user' = $1
             and ($2::text is null or sid <> $2)`,
        [String(userId), exceptSessionId ?? null],
      );
    } catch (error) {
      console.error('Error clearing untracked session rows:', error);
    }

    return doomed.length;
  } catch (error) {
    console.error('Error revoking user sessions:', error);
    return 0;
  }
}

/**
 * Clean up expired sessions
 */
export async function cleanExpiredSessions(): Promise<number> {
  try {
    const now = new Date();
    
    // Clean up activeSessions table (custom session tracking)
    await db
      .delete(activeSessions)
      .where(lt(activeSessions.expiresAt, now));
    
    // Clean up main session table (express-session storage)
    // This is critical for preventing session table bloat in production
    const result = await db.execute(
      `DELETE FROM session WHERE expire < NOW()`
    );
    
    const deletedCount = result.rowCount || 0;
    
    if (deletedCount > 0) {
      console.log(`🧹 Cleaned up ${deletedCount} expired sessions from database`);
    }
    
    return deletedCount;
  } catch (error) {
    console.error('Error cleaning expired sessions:', error);
    return 0;
  }
}

/**
 * Extract client IP from request
 */
function getClientIp(req: Request): string {
  const forwarded = req.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || req.socket.remoteAddress || 'unknown';
}

/**
 * Schedule periodic cleanup of expired sessions
 */
export function startSessionCleanupScheduler(intervalMinutes: number = 60): NodeJS.Timeout {
  return setInterval(async () => {
    const count = await cleanExpiredSessions();
    console.log(`Cleaned up ${count} expired sessions`);
  }, intervalMinutes * 60 * 1000);
}
