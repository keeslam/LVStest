import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiRequest } from "@/lib/queryClient";
import { AccountsTable } from "@/components/portal-admin/accounts-table";
import { CustomersOverviewTable } from "@/components/portal-admin/customers-overview-table";
import { OnlineVehiclesTable } from "@/components/portal-admin/online-vehicles-table";
import { ActivityTable } from "@/components/portal-admin/activity-table";

export default function PortalAdminPage() {
  const { t } = useTranslation("portal");
  const queryClient = useQueryClient();

  // Opening this page means staff have seen what customers did: clear the badge.
  useEffect(() => {
    apiRequest("POST", "/api/portal-admin/notifications/mark-read")
      .then(() => queryClient.invalidateQueries({ queryKey: ["/api/portal-admin/unread-count"] }))
      .catch(() => undefined);
  }, [queryClient]);

  return (
    <div className="space-y-4 p-4">
      <h1 className="text-2xl font-semibold">{t("admin.pageTitle")}</h1>
      <Tabs defaultValue="customers">
        <TabsList>
          <TabsTrigger value="customers">{t("admin.tabs.customers")}</TabsTrigger>
          <TabsTrigger value="accounts">{t("admin.tabs.accounts")}</TabsTrigger>
          <TabsTrigger value="vehicles">{t("admin.tabs.vehicles")}</TabsTrigger>
          <TabsTrigger value="activity">{t("admin.tabs.activity")}</TabsTrigger>
        </TabsList>
        <TabsContent value="customers" className="mt-4"><CustomersOverviewTable /></TabsContent>
        <TabsContent value="accounts" className="mt-4"><AccountsTable /></TabsContent>
        <TabsContent value="vehicles" className="mt-4"><OnlineVehiclesTable /></TabsContent>
        <TabsContent value="activity" className="mt-4"><ActivityTable limit={200} /></TabsContent>
      </Tabs>
    </div>
  );
}
