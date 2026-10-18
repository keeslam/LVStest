import type { Express, RequestHandler } from 'express';
import { auditMutations } from './audit';
import { hasPermission } from './permissions';
import { UserPermission } from '../../shared/schema';
import notificationRoutes from '../routes/notifications';
import vehiclesWithReservationsRoutes from '../routes/vehicles-with-reservations';
import filteredVehiclesRoutes from '../routes/filtered-vehicles';
import emailTemplatesRoutes from '../routes/email-templates';
import emailLogsRoutes from '../routes/email-logs';
import apkDateChangesRoutes from '../routes/apk-date-changes';
import contractSignaturesRoutes from '../routes/contract-signatures';

/**
 * The staff routers that are `Router` objects rather than `register*()`
 * functions, mounted together with the activity-log middleware.
 *
 * These used to be mounted in server/index.ts *before* `registerRoutes()`,
 * while `auditMutations` was registered inside `registerRoutes()`. Express
 * runs middleware in registration order, so an e-mail template saved or an
 * APK date confirmed through one of these routers never reached the audit
 * middleware and left no "who did this" row. Mounting the middleware here,
 * ahead of every router, closes that gap; the test harness
 * (server/__tests__/helpers/app.ts) calls the same function so it cannot
 * drift from production again.
 *
 * Must run after `setupAuth()` (the middleware needs `req.user`) and after the
 * portal routes (the portal keeps its own activity log).
 */
export function mountStaffRouters(app: Express, requireAuth: RequestHandler): void {
  app.use(auditMutations);

  app.use('/api/notifications', requireAuth, hasPermission(UserPermission.MANAGE_NOTIFICATIONS), notificationRoutes);
  app.use('/api/vehicles/with-reservations', requireAuth, hasPermission(UserPermission.VIEW_VEHICLES, UserPermission.MANAGE_VEHICLES, UserPermission.VIEW_RESERVATIONS, UserPermission.MANAGE_RESERVATIONS), vehiclesWithReservationsRoutes);
  app.use('/api/vehicles/filtered', requireAuth, hasPermission(UserPermission.VIEW_VEHICLES, UserPermission.MANAGE_VEHICLES), filteredVehiclesRoutes);
  app.use('/api/email-templates', requireAuth, hasPermission(UserPermission.MANAGE_EMAIL_TEMPLATES), emailTemplatesRoutes);
  app.use('/api/email-logs', requireAuth, hasPermission(UserPermission.MANAGE_EMAIL_TEMPLATES), emailLogsRoutes);
  app.use('/api/apk-date-changes', requireAuth, hasPermission(UserPermission.VIEW_VEHICLES, UserPermission.MANAGE_VEHICLES), apkDateChangesRoutes);
  app.use('/api/contract-signatures', requireAuth, hasPermission(UserPermission.VIEW_DOCUMENTS, UserPermission.MANAGE_DOCUMENTS), contractSignaturesRoutes);
}
