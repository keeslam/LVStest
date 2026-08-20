import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';
import { db } from '../../db';
import { loginAttempts } from '../../../shared/schema';
import { eq, and, gte, sql } from 'drizzle-orm';

/**
 * General API rate limiter - 1000 requests per 15 minutes per IP
 * Only applies to unauthenticated requests (public endpoints)
 * Authenticated users bypass this limiter to prevent shared IP issues
 */
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // Limit each IP to 1000 requests per windowMs (~66 per minute)
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  skip: (req) => {
    // Skip rate limiting for authenticated users
    // This prevents issues with multiple users on same IP (office networks)
    return req.isAuthenticated && req.isAuthenticated();
  },
});

/**
 * Strict rate limiter for login attempts - 5 attempts per 15 minutes per IP
 */
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 login requests per windowMs
  message: 'Too many login attempts from this IP, please try again after 15 minutes.',
  skipSuccessfulRequests: true, // Don't count successful logins
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Check if user account should be locked due to failed login attempts
 */
export async function checkAccountLockout(
  username: string,
  ipAddress: string
): Promise<{ locked: boolean; remainingTime?: number; attemptsCount?: number }> {
  try {
    // Count failed attempts in last 15 minutes
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);

    const failedAttempts = await db
      .select()
      .from(loginAttempts)
      .where(
        and(
          eq(loginAttempts.username, username),
          eq(loginAttempts.success, false),
          gte(loginAttempts.attemptedAt, fifteenMinutesAgo)
        )
      );

    const failedCount = failedAttempts.length;

    // Lock account after 5 failed attempts
    if (failedCount >= 5) {
      // Find the oldest failed attempt to calculate remaining lockout time
      const oldestAttempt = failedAttempts.sort((a, b) => 
        new Date(a.attemptedAt).getTime() - new Date(b.attemptedAt).getTime()
      )[0];

      const lockoutEndTime = new Date(oldestAttempt.attemptedAt).getTime() + 15 * 60 * 1000;
      const remainingTime = Math.max(0, lockoutEndTime - Date.now());

      return {
        locked: true,
        remainingTime: Math.ceil(remainingTime / 1000), // in seconds
        attemptsCount: failedCount,
      };
    }

    return {
      locked: false,
      attemptsCount: failedCount,
    };
  } catch (error) {
    console.error('Error checking account lockout:', error);
    return { locked: false };
  }
}

/**
 * Record a login attempt (success or failure)
 */
export async function recordLoginAttempt(
  username: string,
  ipAddress: string,
  userAgent: string | undefined,
  success: boolean,
  failureReason?: string
): Promise<void> {
  try {
    await db.insert(loginAttempts).values({
      username,
      ipAddress,
      userAgent: userAgent || 'unknown',
      success,
      failureReason: failureReason || null,
    });
  } catch (error) {
    console.error('Error recording login attempt:', error);
  }
}

/**
 * Clear failed login attempts for a user (after successful login)
 */
export async function clearFailedAttempts(username: string): Promise<void> {
  try {
    // Delete old failed attempts
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
    await db
      .delete(loginAttempts)
      .where(
        and(
          eq(loginAttempts.username, username),
          eq(loginAttempts.success, false),
          gte(loginAttempts.attemptedAt, fifteenMinutesAgo)
        )
      );
  } catch (error) {
    console.error('Error clearing failed attempts:', error);
  }
}

/**
 * Middleware to check for account lockout before login
 */
export async function checkLockoutMiddleware(
  req: Request & { user?: any },
  res: Response,
  next: Function
): Promise<void> {
  const { username } = req.body;
  if (!username) {
    return next();
  }

  const ipAddress = req.ip || req.socket.remoteAddress || 'unknown';
  const lockStatus = await checkAccountLockout(username, ipAddress);

  if (lockStatus.locked) {
    const minutes = Math.ceil((lockStatus.remainingTime || 0) / 60);
    res.status(429).json({
      message: `Account temporarily locked due to too many failed login attempts. Please try again in ${minutes} minute(s).`,
      remainingTime: lockStatus.remainingTime,
      attemptsCount: lockStatus.attemptsCount,
    });
    return;
  }

  next();
}
