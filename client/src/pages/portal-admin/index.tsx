import { useEffect } from "react";
import { useSearch } from "wouter";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { UserPlus, Loader2, ScanSearch } from "lucide-react";
import type { PortalDashboard } from "@shared/portal-types";
import { apiRequest } from "@/lib/queryClient";
import { useGlobalDialog, type PortalListKind } from "@/contexts/GlobalDialogContext";
import { Button } from "@/components/ui/button";
import { AccountDialog } from "@/components/portal-admin/account-dialog";
import { useCanManagePortal } from "@/components/portal-admin/accounts-table";
import { useCanViewFines, useCanManageFines } from "@/components/fines/fines-table";
import { DASHBOARD_KEY, DashboardTiles, AttentionPanel, NotificationsPanel, UpcomingPanel, CustomersPanel } from "@/components/portal-admin/dashboard-panels";

const LIST_KINDS: PortalListKind[] = ["customers", "accounts", "requests", "fines", "vehicles", "activity", "blacklist"];

/**
 * Klantenportaal: one dashboard page. Every list and detail is a dialog from
 * GlobalDialogContext, so ?fine=<id> / ?request=<id> (notification links) open
 * the detail dialog here and ?tab=<kind>[&plate=] opens the list dialog.
 */
export default function PortalAdminPage() {
  const { t } = useTranslation("portal");
  const { openFineDialog, openPortalRequestDialog, openPortalListDialog, openFineImportDialog } = useGlobalDialog();
  const canViewFines = useCanViewFines();
  const canManage = useCanManagePortal();
  const canManageFines = useCanManageFines();
  const params = new URLSearchParams(useSearch());
  const { data, isLoading } = useQuery<PortalDashboard>({
    queryKey: DASHBOARD_KEY,
    queryFn: async () => (await apiRequest("GET", DASHBOARD_KEY[0])).json(),
    refetchInterval: 60_000,
  });

  useEffect(() => {
    const fine = params.get("fine");
    if (fine) openFineDialog(Number(fine));
    const request = params.get("request");
    if (request) openPortalRequestDialog(Number(request));
    const tab = params.get("tab") as PortalListKind | null;
    if (tab && LIST_KINDS.includes(tab)) openPortalListDialog(tab, { plate: params.get("plate") ?? undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{t("admin.pageTitle")}</h1>
          <p className="text-sm text-muted-foreground">{t("admin.pageSubtitle")}</p>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:flex">
          {canManageFines && (
            <Button size="sm" variant="outline" onClick={openFineImportDialog} data-testid="button-import-fines"><ScanSearch className="mr-1.5 h-4 w-4" />{t("admin.fines.import.button")}</Button>
          )}
          {canManage && (
            <AccountDialog>
              <Button size="sm" data-testid="button-invite-portal-account"><UserPlus className="mr-1.5 h-4 w-4" />{t("admin.dashboard.inviteAccount")}</Button>
            </AccountDialog>
          )}
        </div>
      </div>

      {isLoading || !data ? (
        <div className="flex items-center gap-2 py-12 justify-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
      ) : (<>
        <DashboardTiles counts={data.counts} canViewFines={canViewFines} />
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <AttentionPanel attention={data.attention} canViewFines={canViewFines} />
          <NotificationsPanel notifications={data.notifications} unread={data.counts.unreadNotifications} />
          <UpcomingPanel upcoming={data.upcoming} />
          <CustomersPanel />
        </div>
      </>)}
    </div>
  );
}
