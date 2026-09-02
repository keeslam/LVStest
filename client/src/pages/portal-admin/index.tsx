import { useTranslation } from "react-i18next";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AccountsTable } from "@/components/portal-admin/accounts-table";
import { OnlineVehiclesTable } from "@/components/portal-admin/online-vehicles-table";
import { ActivityTable } from "@/components/portal-admin/activity-table";

export default function PortalAdminPage() {
  const { t } = useTranslation("portal");
  return (
    <div className="space-y-4 p-4">
      <h1 className="text-2xl font-semibold">{t("admin.pageTitle")}</h1>
      <Tabs defaultValue="accounts">
        <TabsList>
          <TabsTrigger value="accounts">{t("admin.tabs.accounts")}</TabsTrigger>
          <TabsTrigger value="vehicles">{t("admin.tabs.vehicles")}</TabsTrigger>
          <TabsTrigger value="activity">{t("admin.tabs.activity")}</TabsTrigger>
        </TabsList>
        <TabsContent value="accounts" className="mt-4"><AccountsTable /></TabsContent>
        <TabsContent value="vehicles" className="mt-4"><OnlineVehiclesTable /></TabsContent>
        <TabsContent value="activity" className="mt-4"><ActivityTable limit={200} /></TabsContent>
      </Tabs>
    </div>
  );
}
