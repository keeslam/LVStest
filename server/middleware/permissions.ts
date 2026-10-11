import { Request, Response, NextFunction } from 'express';
import { UserRole } from '../../shared/schema.js';
import { AuditLogger } from '../utils/security/auditLogger.js';

/**
 * D14: a refused attempt is written to the audit log (action `access.denied`,
 * status failure) so an administrator can be told at the next login who tried
 * what they may not do. The same user refused on the same path again within
 * five minutes is not written again - a screen that retries or polls a refused
 * request must not fill the log. The window lives in this process only; after
 * a restart the first refusal is simply recorded again.
 */
export const ACCESS_DENIED_ACTION = 'access.denied';
export const ACCESS_DENIED_DEDUPE_MS = 5 * 60 * 1000;
const recentlyDenied = new Map<string, number>();

export interface AccessDeniedAttempt {
  userId: number;
  username: string;
  method: string;
  path: string;
  required: readonly string[];
  /** Set when the no-access page reported the refusal (POST /api/access-denied). */
  page?: string;
  ipAddress?: string;
  userAgent?: string;
}

/** Returns true when a row was written, false when the attempt fell inside the dedupe window. */
export async function recordAccessDenied(attempt: AccessDeniedAttempt): Promise<boolean> {
  const now = Date.now();
  const key = `${attempt.userId}|${attempt.path}`;
  const last = recentlyDenied.get(key);
  if (last !== undefined && now - last < ACCESS_DENIED_DEDUPE_MS) return false;
  recentlyDenied.set(key, now);
  if (recentlyDenied.size > 2000) {
    for (const [k, at] of recentlyDenied) {
      if (now - at >= ACCESS_DENIED_DEDUPE_MS) recentlyDenied.delete(k);
    }
  }
  await AuditLogger.log({
    userId: attempt.userId,
    username: attempt.username,
    action: ACCESS_DENIED_ACTION,
    details: {
      method: attempt.method,
      path: attempt.path,
      required: [...attempt.required],
      ...(attempt.page ? { page: attempt.page } : {}),
    },
    ipAddress: attempt.ipAddress,
    userAgent: attempt.userAgent,
    status: 'failure',
  });
  return true;
}

// Check if user has specific permission(s) - supports multiple permissions (OR logic)
// NOTE: This middleware assumes authentication has already been verified upstream via requireAuth
export const hasPermission = (...permissions: string[]) => {
  // Named on purpose: server/__tests__/fix-i-permission-matrix.test.ts walks the
  // router stack at runtime and recognises the guard by this name, which is what
  // makes "every route is gated unless it is on the public allowlist" testable.
  return async function hasPermissionMiddleware(req: Request, res: Response, next: NextFunction) {
    // Trust that req.user exists if authentication middleware was applied upstream
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    
    // Admin role always has all permissions
    if (req.user.role === UserRole.ADMIN) {
      return next();
    }
    
    const userPermissions = req.user.permissions || [];
    const hasRequiredPermission = permissions.some(permission => 
      userPermissions.includes(permission)
    );
    
    if (!hasRequiredPermission) {
      // D14 (pattern: fiscalGuard in routes/fiscal.ts): note the refusal, then
      // answer as before. A failure to write it is only logged and never
      // changes the 403.
      try {
        await recordAccessDenied({
          userId: req.user.id,
          username: req.user.username,
          method: req.method,
          path: req.originalUrl.split('?')[0],
          required: permissions,
          ipAddress: req.ip,
          userAgent: req.get('user-agent') || undefined,
        });
      } catch (error) {
        console.error('[access-denied] could not record a refused attempt:', error);
      }
      return res.status(403).json({ 
        message: `Not authorized. One of these permissions required: ${permissions.join(', ')}` 
      });
    }
    
    next();
  };
};

// Check for admin role
export const requireAdmin = (req: Request, res: Response, next: NextFunction) => {
  if (!req.isAuthenticated || !req.isAuthenticated()) {
    return res.status(401).json({ message: "Not authenticated" });
  }
  
  if (req.user?.role !== UserRole.ADMIN) {
    return res.status(403).json({ message: "Not authorized. Admin access required." });
  }
  
  next();
};
