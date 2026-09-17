import { useAuth } from "@/hooks/use-auth";
import { UserPermission, UserRole } from "@shared/schema";

/**
 * The six fiscal rights, read the way the server reads them: an administrator
 * has them all, anyone else exactly what is ticked. The server decides; this
 * only hides what a click would be refused for.
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
  const canView = has(UserPermission.VIEW_FISCAL) || canReview || canConfigure || canApprove || canPublish || canAudit;
  return { isAdmin, canView, canReview, canConfigure, canApprove, canPublish, canAudit, userId: user?.id ?? null };
}
