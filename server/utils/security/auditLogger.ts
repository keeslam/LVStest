import type { Request } from 'express';
import { db } from '../../db';
import { auditLogs } from '../../../shared/schema';

export type AuditAction =
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
  | 'system.backup';

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
  private static getClientIp(req: Request): string {
    const forwarded = req.get('x-forwarded-for');
    if (forwarded) {
      return forwarded.split(',')[0].trim();
    }
    return req.ip || req.socket.remoteAddress || 'unknown';
  }
}
