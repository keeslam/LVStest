import { useAuth } from "@/hooks/use-auth";
import { UserPermission, UserRole } from "@shared/schema";

/**
 * The six fiscal rights, read the way the server reads them: an administrator
 * has them all, anyone else exactly what is ticked. The server decides; this
 * only hides what a click would be refused for.
 *
 * None of the six implies another (server/routes/fiscal.ts has no such rule),
 * and every fiscal GET - overview, configuration, definitions, rule versions,
 * assessments, monthly report, fiscal profile, usage period - is guarded by
 * view_fiscal alone. So:
 *   - `canView` is exactly view_fiscal (an administrator has it): the gate for
 *     anything that reads those routes;
 *   - `hasAnyRight` is "holds at least one of the six": only for deciding
 *     whether the fiscal settings have anything to offer, where each tab then
 *     follows its own right.
 */
export function useFiscalPermissions() {
  const { user } = useAuth();
  const isAdmin = user?.role === UserRole.ADMIN;
  const granted = (user?.permissions as string[] | null | undefined) ?? [];
  const has = (permission: string) => isAdmin || granted.includes(permission);
  const canReview = has(UserPermission.MANAGE_FISCAL_REVIEW);
  const canConfigure = has(UserPermission.MANAGE_FISCAL_CONFIGURATION);
  const canApprove = has(UserPermission.APPROVE_FISCAL_CONFIGURATION);
  const canPublish = has(UserPermission.PUBLISH_FISCAL_CONFIGURATION);
  const canAudit = has(UserPermission.VIEW_FISCAL_AUDIT_LOG);
  const canView = has(UserPermission.VIEW_FISCAL);
  const hasAnyRight = canView || canReview || canConfigure || canApprove || canPublish || canAudit;
  return { isAdmin, canView, hasAnyRight, canReview, canConfigure, canApprove, canPublish, canAudit, userId: user?.id ?? null };
}
