import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useHasPermission } from "@/hooks/use-has-permission";
import { UserPermission } from "@shared/schema";
import type { PortalAccountRow } from "@/components/portal-admin/account-dialog";

export function useCanViewPortal(): boolean {
  return useHasPermission(UserPermission.VIEW_PORTAL, UserPermission.MANAGE_PORTAL);
}

/**
 * All portal accounts, cached once, so lists can show "this customer / driver /
 * e-mail address already has a portal login" without a request per row.
 */
export function usePortalAccounts() {
  const canView = useCanViewPortal();
  const { data = [] } = useQuery<PortalAccountRow[]>({
    queryKey: ["/api/portal-admin/accounts"],
    queryFn: async () => (await apiRequest("GET", "/api/portal-admin/accounts")).json(),
    enabled: canView,
    staleTime: 60_000,
  });
  const norm = (e: string | null | undefined) => (e ?? "").trim().toLowerCase();
  return {
    accounts: data,
    forCustomer: (customerId: number) => data.filter((a) => a.customerId === customerId),
    forDriver: (driverId: number, email?: string | null) => data.find((a) => a.driverId === driverId) ?? (email ? data.find((a) => norm(a.email) === norm(email)) : undefined),
    byEmail: (email: string | null | undefined) => (email ? data.find((a) => norm(a.email) === norm(email)) : undefined),
  };
}
