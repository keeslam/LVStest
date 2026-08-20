import { db } from '../../db';
import { activeSessions } from '../../../shared/schema';
import { eq, and, lt } from 'drizzle-orm';
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
          lt(now, activeSessions.expiresAt)
        )
      );
  } catch (error) {
    console.error('Error getting user sessions:', error);
    return [];
  }
}

/**
 * Revoke a specific session
 */
export async function revokeSession(sessionId: string): Promise<boolean> {
  try {
    const result = await db
      .delete(activeSessions)
      .where(eq(activeSessions.sessionId, sessionId));
    
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
    if (exceptSessionId) {
      // Get all sessions for this user
      const allSessions = await db
        .select()
        .from(activeSessions)
        .where(eq(activeSessions.userId, userId));
      
      // Delete all sessions except the current one
      let deletedCount = 0;
      for (const session of allSessions) {
        if (session.sessionId !== exceptSessionId) {
          await db
            .delete(activeSessions)
            .where(eq(activeSessions.id, session.id));
          deletedCount++;
        }
      }
      
      return deletedCount;
    } else {
      // Delete all sessions for the user
      await db.delete(activeSessions).where(eq(activeSessions.userId, userId));
      return 0;
    }
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
