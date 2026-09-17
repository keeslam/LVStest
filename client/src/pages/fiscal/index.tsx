import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useFiscalPermissions } from "@/components/fiscal/use-fiscal-permissions";
import { OverviewPanel } from "@/components/fiscal/overview-panel";
import { ConfigurationPanel } from "@/components/fiscal/configuration-panel";
import { ReviewQueue } from "@/components/fiscal/review-queue";
import { AuditLogPanel } from "@/components/fiscal/audit-log-panel";

/**
 * Fiscaal: the staff side of the fiscal mobility check. Which tabs appear
 * follows the user's rights; the server enforces them regardless.
 */
export default function FiscalPage() {
  const { t } = useTranslation("fiscal");
  const { canReview, canAudit } = useFiscalPermissions();
  const [tab, setTab] = useState("overview");

  return (
    <div className="space-y-4 p-4">
      <div>
        <h1 className="text-2xl font-semibold">{t("page.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("page.subtitle")}</p>
      </div>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="overview">{t("tabs.overview")}</TabsTrigger>
          <TabsTrigger value="configuration">{t("tabs.configuration")}</TabsTrigger>
          {canReview && <TabsTrigger value="review">{t("tabs.review")}</TabsTrigger>}
          {canAudit && <TabsTrigger value="audit">{t("tabs.audit")}</TabsTrigger>}
        </TabsList>
        <TabsContent value="overview" className="mt-4"><OverviewPanel /></TabsContent>
        <TabsContent value="configuration" className="mt-4"><ConfigurationPanel /></TabsContent>
        {canReview && <TabsContent value="review" className="mt-4"><ReviewQueue /></TabsContent>}
        {canAudit && <TabsContent value="audit" className="mt-4"><AuditLogPanel /></TabsContent>}
      </Tabs>
    </div>
  );
}
