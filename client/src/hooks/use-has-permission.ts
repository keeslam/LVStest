import { useAuth } from "@/hooks/use-auth";
import { UserPermission, UserRole } from "@shared/schema";

/**
 * Client-side mirror of the server's `hasPermission(...)` OR logic
 * (server/middleware/permissions.ts): true for role `admin`, which bypasses
 * every check server-side, else true when the signed-in user holds at least
 * one of the given permissions.
 *
 * Use this to gate a query with `enabled` before firing a request the server
 * would refuse anyway — see the four findings in
 * .superpowers/sdd/2026-09-20-e2e-browser-tests/task-6-report.md
 * ("Findings for the owner"), which is what pulled this out of
 * `useCanViewPortal` into a shared, generic hook.
 */
export function useHasPermission(...anyOf: string[]): boolean {
  const { user } = useAuth();
  if (user?.role === UserRole.ADMIN) return true;
  const perms = (user?.permissions as string[] | undefined) ?? [];
  return anyOf.some((permission) => perms.includes(permission));
}

/**
 * AND counterpart to `useHasPermission`'s OR logic — Task 3
 * (docs/superpowers/specs/2026-09-21-toegang-design.md, §4):
 * `RequiresPermission`'s `allOf` prop, for a control whose action needs
 * several rights together server-side (e.g. the dashboard's
 * APK-report-upload tile: `POST /api/documents` needs MANAGE_DOCUMENTS,
 * the `PATCH /api/vehicles/:id` that follows it needs MANAGE_VEHICLES — both
 * are required, not either). Role `admin` still bypasses every check; an
 * empty list is trivially satisfied (nothing to require).
 */
export function useHasAllPermissions(...allOf: string[]): boolean {
  const { user } = useAuth();
  if (user?.role === UserRole.ADMIN) return true;
  const perms = (user?.permissions as string[] | undefined) ?? [];
  return allOf.every((permission) => perms.includes(permission));
}

/**
 * Task 2 fix round 1 (docs/superpowers/specs/2026-09-21-toegang-design.md,
 * §2) — `client/src/components/ui/notification-center.tsx` and
 * `client/src/components/notifications/notification-center-dialog.tsx` are
 * two halves of the same always-mounted header widget
 * (MainLayout -> NotificationCenter -> NotificationCenterDialog) that fire
 * an otherwise-identical set of unconditional queries. Both files declared
 * the same four `useHasPermission(...)` gates side by side; extracted here
 * once so they can never drift apart on which permissions gate which query.
 *
 * `notification-center-dialog.tsx` additionally gates its own `/api/customers`
 * query (VIEW_CUSTOMERS/MANAGE_CUSTOMERS) - that one is NOT duplicated
 * (`notification-center.tsx` has no customers query), so it stays a local
 * `useHasPermission(...)` call in that file rather than joining this hook.
 */
export function useNotificationDataPermissions() {
  const canViewVehicles = useHasPermission(UserPermission.VIEW_VEHICLES, UserPermission.MANAGE_VEHICLES);
  const canViewReservations = useHasPermission(UserPermission.VIEW_RESERVATIONS, UserPermission.MANAGE_RESERVATIONS);
  // GET /api/reservations/upcoming-maintenance additionally accepts
  // MANAGE_MAINTENANCE (server/routes.ts:2659) — wider than the other two
  // reservation-guarded queries.
  const canViewUpcomingMaintenance = useHasPermission(
    UserPermission.VIEW_RESERVATIONS,
    UserPermission.MANAGE_RESERVATIONS,
    UserPermission.MANAGE_MAINTENANCE,
  );
  // Finding 1 (task-6-report.md): the server guards /api/custom-notifications*
  // with MANAGE_NOTIFICATIONS alone.
  const canViewNotifications = useHasPermission(UserPermission.MANAGE_NOTIFICATIONS);

  return { canViewVehicles, canViewReservations, canViewUpcomingMaintenance, canViewNotifications };
}
