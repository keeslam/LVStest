import { useEffect, useState } from "react";
import { useSearch } from "wouter";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiRequest } from "@/lib/queryClient";
import { useGlobalDialog } from "@/contexts/GlobalDialogContext";
import { AccountsTable } from "@/components/portal-admin/accounts-table";
import { CustomersOverviewTable } from "@/components/portal-admin/customers-overview-table";
import { OnlineVehiclesTable } from "@/components/portal-admin/online-vehicles-table";
import { ActivityTable } from "@/components/portal-admin/activity-table";
import { RequestsTable } from "@/components/portal-admin/requests-table";
import { FinesTable, useCanViewFines } from "@/components/fines/fines-table";

/**
 * Klantenportaal: the one staff page for the portal. Every detail is a dialog
 * from GlobalDialogContext, so ?fine=<id> and ?request=<id> (used in
 * notification links) open the dialog here; ?tab= and ?plate= preselect.
 */
export default function PortalAdminPage() {
  const { t } = useTranslation("portal");
  const queryClient = useQueryClient();
  const { openFineDialog, openPortalRequestDialog } = useGlobalDialog();
  const canViewFines = useCanViewFines();
  const params = new URLSearchParams(useSearch());
  const [tab, setTab] = useState(params.get("tab") ?? "customers");

  useEffect(() => {
    // Opening this page means staff have seen what customers did: clear the badge.
    apiRequest("POST", "/api/portal-admin/notifications/mark-read")
      .then(() => queryClient.invalidateQueries({ queryKey: ["/api/portal-admin/unread-count"] }))
      .catch(() => undefined);
    const fine = params.get("fine");
    if (fine) openFineDialog(Number(fine));
    const request = params.get("request");
    if (request) openPortalRequestDialog(Number(request));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-4 p-4">
      <h1 className="text-2xl font-semibold">{t("admin.pageTitle")}</h1>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="customers">{t("admin.tabs.customers")}</TabsTrigger>
          <TabsTrigger value="accounts">{t("admin.tabs.accounts")}</TabsTrigger>
          <TabsTrigger value="requests" data-testid="tab-requests">{t("admin.tabs.requests")}</TabsTrigger>
          {canViewFines && <TabsTrigger value="fines" data-testid="tab-fines">{t("admin.tabs.fines")}</TabsTrigger>}
          <TabsTrigger value="vehicles">{t("admin.tabs.vehicles")}</TabsTrigger>
          <TabsTrigger value="activity">{t("admin.tabs.activity")}</TabsTrigger>
        </TabsList>
        <TabsContent value="customers" className="mt-4"><CustomersOverviewTable /></TabsContent>
        <TabsContent value="accounts" className="mt-4"><AccountsTable /></TabsContent>
        <TabsContent value="requests" className="mt-4"><RequestsTable /></TabsContent>
        {canViewFines && <TabsContent value="fines" className="mt-4"><FinesTable initialPlate={params.get("plate") ?? undefined} /></TabsContent>}
        <TabsContent value="vehicles" className="mt-4"><OnlineVehiclesTable /></TabsContent>
        <TabsContent value="activity" className="mt-4"><ActivityTable limit={200} /></TabsContent>
      </Tabs>
    </div>
  );
}
