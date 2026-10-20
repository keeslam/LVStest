import type { Request } from 'express';
import { db } from '../../db';
import { auditLogs } from '../../../shared/schema';

export type AuditAction = KnownAuditAction | (string & {});

// The mutation middleware derives names like 'transport.update' from the URL,
// so the union documents the well-known ones without limiting the set.
type KnownAuditAction =
  | 'user.login'
  | 'user.logout'
  | 'user.login.failed'
  | 'user.reauthenticate'
  | 'user.reauthenticate.failed'
  | 'user.create'
  | 'user.update'
  | 'user.delete'
  | 'user.permission.change'
  | 'vehicle.create'
  | 'vehicle.update'
  | 'vehicle.delete'
  // BUG-147: a restore was recorded as `vehicle.update` purely because this
  // union had no word for it, so it could not be searched or reported on.
  | 'vehicle.restore'
  // Punt 7: out of the fleet instead of deleted, and back.
  | 'vehicle.out-of-fleet'
  | 'vehicle.back-in-fleet'
  | 'customer.restore'
  // BUG-152: the reservation sub-actions the middleware now emits.
  | 'reservation.pickup'
  | 'reservation.return'
  | 'reservation.status'
  // Sub-project C: an undone pickup, return or cancellation; details carry the plan.
  | 'reservation.revert'
  // Punt 9: pickup on an expired licence after the "Rijbewijs gecontroleerd" tick.
  | 'reservation.license-checked'
  | 'customer.create'
  | 'customer.update'
  | 'customer.delete'
  | 'reservation.create'
  | 'reservation.update'
  | 'reservation.delete'
  | 'document.upload'
  | 'document.delete'
  | 'expense.create'
  | 'expense.update'
  | 'expense.delete'
  | 'session.revoke'
  | 'password.change'
  | 'system.backup'
  // Background jobs that change data without a user behind them. One row per
  // run, so "why did this APK date / notification / fine appear overnight"
  // has an answer in the same log as the staff actions.
  | 'system.apk-scan'
  | 'system.service-due-scan'
  | 'system.fiscal-nightly'
  | 'system.cjib-import'
  | 'system.invoice-inbox-import';

interface AuditLogData {
  userId?: number;
  username?: string;
  action: AuditAction;
  resourceType?: string;
  resourceId?: string;
  details?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  status?: 'success' | 'failure';
}

export class AuditLogger {
  /**
   * Log an audit event
   */
  static async log(data: AuditLogData): Promise<void> {
    try {
      await db.insert(auditLogs).values({
        userId: data.userId || null,
        username: data.username || 'system',
        action: data.action,
        resourceType: data.resourceType || null,
        resourceId: data.resourceId || null,
        details: data.details || null,
        ipAddress: data.ipAddress || null,
        userAgent: data.userAgent || null,
        status: data.status || 'success',
      });
    } catch (error) {
      // Don't throw - logging should not break the application
      console.error('Failed to create audit log:', error);
    }
  }

  /**
   * Several rows in one statement: the client reports screens and dialogs in
   * batches, and forty inserts for one request would be forty round trips.
   */
  static async logMany(rows: AuditLogData[]): Promise<void> {
    if (rows.length === 0) return;
    try {
      await db.insert(auditLogs).values(rows.map((data) => ({
        userId: data.userId || null,
        username: data.username || 'system',
        action: data.action,
        resourceType: data.resourceType || null,
        resourceId: data.resourceId || null,
        details: data.details || null,
        ipAddress: data.ipAddress || null,
        userAgent: data.userAgent || null,
        status: data.status || 'success',
      })));
    } catch (error) {
      console.error('Failed to create audit log batch:', error);
    }
  }

  /**
   * One row for a background run (scheduler, poller): no user, no request.
   * `details` carries the counts and, capped, the ids the run touched.
   */
  static async system(
    action: AuditAction,
    details: Record<string, any>,
    status: 'success' | 'failure' = 'success',
  ): Promise<void> {
    await this.log({ username: 'system', action, resourceType: 'system', details, status });
  }

  /**
   * Log from Express request with user context
   */
  static async logFromRequest(
    req: Request & { user?: any },
    action: AuditAction,
    resourceType?: string,
    resourceId?: string | number,
    details?: Record<string, any>,
    status: 'success' | 'failure' = 'success'
  ): Promise<void> {
    const ipAddress = this.getClientIp(req);
    const userAgent = req.get('user-agent');

    await this.log({
      userId: req.user?.id,
      username: req.user?.username,
      action,
      resourceType,
      resourceId: resourceId?.toString(),
      details,
      ipAddress,
      userAgent,
      status,
    });
  }

  /**
   * Extract client IP address from request
   */
  static getClientIp(req: Request): string {
    const forwarded = req.get('x-forwarded-for');
    if (forwarded) {
      return forwarded.split(',')[0].trim();
    }
    return req.ip || req.socket.remoteAddress || 'unknown';
  }
}
