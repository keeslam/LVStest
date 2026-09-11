import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';
import { db } from '../../db';
import { loginAttempts } from '../../../shared/schema';
import { eq, and, sql } from 'drizzle-orm';

/** How long a burst of failures keeps an account locked. */
export const LOCKOUT_WINDOW_MINUTES = 15;
/** Failures inside the window that lock the account. */
export const LOCKOUT_THRESHOLD = 5;

/**
 * General API rate limiter.
 *
 * BUG-074 — this used to `skip()` authenticated requests, but it was mounted
 * *before* `setupAuth()`, so `req.isAuthenticated` did not exist yet and the
 * skip could never fire: every user behind one office IP shared a single
 * 1000/15min bucket. It is now mounted after the session middleware
 * (server/index.ts) and keyed per user, falling back to the IP for anonymous
 * traffic — so one busy colleague can no longer lock out the office, and an
 * authenticated user still has a finite budget.
 */
/** Exported so the keying rule itself is testable (BUG-074). */
export function apiLimiterKey(req: Request & { user?: { id?: number } }): string {
  const userId = req.user?.id;
  if (typeof userId === 'number') return `user:${userId}`;
  return `ip:${req.ip || req.socket?.remoteAddress || 'unknown'}`;
}

export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // per user (or per IP when anonymous)
  message: 'Too many requests, please try again later.',
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  keyGenerator: apiLimiterKey,
});

/**
 * BUG-092 / BUG-105 — every auth route shared ONE limiter instance, so the
 * staff login, the portal login, the portal password reset and the portal
 * activation all drew from the same 5/15min counter; and because that instance
 * carries `skipSuccessfulRequests`, `/api/portal/forgot` — which answers 200
 * unconditionally, on purpose, so it cannot be used to enumerate addresses —
 * was effectively not limited at all.
 *
 * Each realm gets its own instance. `skipSuccessfulRequests` is a per-route
 * decision, not a global one.
 */
function createAuthLimiter(options: { max: number; skipSuccessfulRequests: boolean; message: string }) {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    max: options.max,
    message: options.message,
    skipSuccessfulRequests: options.skipSuccessfulRequests,
    standardHeaders: true,
    legacyHeaders: false,
  });
}

/** Staff login. A successful login does not consume budget. */
export const loginLimiter = createAuthLimiter({
  max: 5,
  skipSuccessfulRequests: true,
  message: 'Too many login attempts from this IP, please try again after 15 minutes.',
});

/** Portal login — its own bucket, so portal traffic cannot lock staff out. */
export const portalLoginLimiter = createAuthLimiter({
  max: 5,
  skipSuccessfulRequests: true,
  message: 'Too many login attempts, please try again after 15 minutes.',
});

/**
 * Portal password reset. `skipSuccessfulRequests: false` on purpose: this route
 * answers 200 whatever happens, so counting only failures counts nothing.
 */
export const portalForgotLimiter = createAuthLimiter({
  max: 10,
  skipSuccessfulRequests: false,
  message: 'Too many requests, please try again after 15 minutes.',
});

/** Portal invite/activation — its own bucket again. */
export const portalActivateLimiter = createAuthLimiter({
  max: 10,
  skipSuccessfulRequests: false,
  message: 'Too many requests, please try again after 15 minutes.',
});

/**
 * BUG-008 — the lockout lasted 135 minutes instead of 15.
 *
 * `login_attempts.attempted_at` is `timestamp` *without* time zone and the
 * Postgres session is not on UTC, so a value written by `now()` and read back
 * through the driver came out shifted by the server's offset: the code compared
 * that shifted value with `Date.now()` and concluded the oldest failure was
 * hours old (or hours in the future). Doing the arithmetic **inside the
 * database**, where both the write and the read use the same frame, removes the
 * conversion entirely — and needs no column-type migration, which §1.2 of the
 * remediation plan does not allow.
 */
export async function checkAccountLockout(
  username: string,
  _ipAddress: string
): Promise<{ locked: boolean; remainingTime?: number; attemptsCount?: number }> {
  try {
    const [row] = await db
      .select({
        failedCount: sql<number>`count(*)::int`,
        remainingSeconds: sql<number>`
          coalesce(
            ceil(
              extract(epoch from (min(${loginAttempts.attemptedAt}) + interval '${sql.raw(String(LOCKOUT_WINDOW_MINUTES))} minutes' - now()))
            ),
            0
          )::int`,
      })
      .from(loginAttempts)
      .where(
        and(
          eq(loginAttempts.username, username),
          eq(loginAttempts.success, false),
          sql`${loginAttempts.attemptedAt} > now() - interval '${sql.raw(String(LOCKOUT_WINDOW_MINUTES))} minutes'`,
        ),
      );

    const failedCount = Number(row?.failedCount ?? 0);

    if (failedCount >= LOCKOUT_THRESHOLD) {
      return {
        locked: true,
        remainingTime: Math.max(0, Number(row?.remainingSeconds ?? 0)),
        attemptsCount: failedCount,
      };
    }

    return { locked: false, attemptsCount: failedCount };
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

export interface LoginAttemptReservation {
  /** The provisional failure row; delete it when the login turns out to succeed. */
  attemptId: number | null;
  locked: boolean;
  remainingTime?: number;
  attemptsCount?: number;
}

/**
 * BUG-161 — the lockout did not throttle a *concurrent* burst.
 *
 * The old order was: count failures, then run the password comparison, then
 * record the failure. Thirty parallel guesses all counted zero failures, so all
 * thirty ran a full scrypt comparison before any of them was recorded — the
 * lockout only ever stopped a *sequential* attacker.
 *
 * Record first, decide after: the insert and the count happen in one
 * transaction, so each concurrent request sees the rows the ones before it
 * wrote. After the threshold the request is refused *before* the password is
 * ever compared.
 */
export async function reserveLoginAttempt(
  username: string,
  ipAddress: string,
  userAgent: string | undefined,
): Promise<LoginAttemptReservation> {
  try {
    return await db.transaction(async (tx) => {
      const [inserted] = await tx
        .insert(loginAttempts)
        .values({
          username,
          ipAddress,
          userAgent: userAgent || 'unknown',
          success: false,
          failureReason: 'in_progress',
        })
        .returning({ id: loginAttempts.id });

      const [row] = await tx
        .select({
          failedCount: sql<number>`count(*)::int`,
          remainingSeconds: sql<number>`
            coalesce(
              ceil(
                extract(epoch from (min(${loginAttempts.attemptedAt}) + interval '${sql.raw(String(LOCKOUT_WINDOW_MINUTES))} minutes' - now()))
              ),
              0
            )::int`,
        })
        .from(loginAttempts)
        .where(
          and(
            eq(loginAttempts.username, username),
            eq(loginAttempts.success, false),
            sql`${loginAttempts.attemptedAt} > now() - interval '${sql.raw(String(LOCKOUT_WINDOW_MINUTES))} minutes'`,
          ),
        );

      const failedCount = Number(row?.failedCount ?? 0);
      return {
        attemptId: inserted?.id ?? null,
        // This request's own row is already counted, so the threshold is
        // crossed on the attempt *after* LOCKOUT_THRESHOLD failures.
        locked: failedCount > LOCKOUT_THRESHOLD,
        remainingTime: Math.max(0, Number(row?.remainingSeconds ?? 0)),
        attemptsCount: failedCount,
      };
    });
  } catch (error) {
    console.error('Error reserving login attempt:', error);
    // Never lock everyone out because the bookkeeping failed.
    return { attemptId: null, locked: false };
  }
}

/** Turns the provisional row into a recorded failure with its real reason. */
export async function settleLoginAttempt(
  attemptId: number | null,
  outcome: { success: boolean; failureReason?: string },
): Promise<void> {
  if (attemptId === null) return;
  try {
    await db
      .update(loginAttempts)
      .set({ success: outcome.success, failureReason: outcome.success ? null : outcome.failureReason ?? 'invalid_credentials' })
      .where(eq(loginAttempts.id, attemptId));
  } catch (error) {
    console.error('Error settling login attempt:', error);
  }
}

/**
 * Clear failed login attempts for a user (after successful login)
 */
export async function clearFailedAttempts(username: string): Promise<void> {
  try {
    await db
      .delete(loginAttempts)
      .where(
        and(
          eq(loginAttempts.username, username),
          eq(loginAttempts.success, false),
          sql`${loginAttempts.attemptedAt} > now() - interval '${sql.raw(String(LOCKOUT_WINDOW_MINUTES))} minutes'`,
        ),
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
