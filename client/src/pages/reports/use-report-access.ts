import { useMemo } from "react";
import { UserRole } from "@shared/schema";
import { useAuth } from "@/hooks/use-auth";
import { useFiscalPermissions } from "@/components/fiscal/use-fiscal-permissions";
import type { ReportAccess } from "./report-registry";

/** What the signed-in user may see on the reports page (admin, rights, fiscal right). */
export function useReportAccess(): ReportAccess {
  const { user } = useAuth();
  const { canView: canViewFiscal } = useFiscalPermissions();
  const isAdmin = user?.role === UserRole.ADMIN;
  const permissionKey = ((user?.permissions as string[] | undefined) ?? []).join(",");
  return useMemo<ReportAccess>(() => {
    const granted = permissionKey ? permissionKey.split(",") : [];
    return { isAdmin, canViewFiscal, has: (perm: string) => isAdmin || granted.includes(perm) };
  }, [isAdmin, canViewFiscal, permissionKey]);
}
