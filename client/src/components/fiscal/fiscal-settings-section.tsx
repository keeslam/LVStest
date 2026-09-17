import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useFiscalPermissions } from "./use-fiscal-permissions";
import { ConfigurationPanel } from "./configuration-panel";
import { ReviewQueue } from "./review-queue";
import { AuditLogPanel } from "./audit-log-panel";

/**
 * The fiscal mobility check inside the app settings, under Klantenportaal
 * (besluit F-13): the global configuration, the review queue and the audit
 * log. Which tabs appear follows the user's rights; the server enforces them.
 */
export function FiscalSettingsSection() {
  const { t } = useTranslation("fiscal");
  const { canView, canReview, canAudit } = useFiscalPermissions();
  const [tab, setTab] = useState("configuration");
  if (!canView) return null;

  return (
    <Card data-testid="fiscal-settings-section">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{t("settings.title")}</CardTitle>
        <CardDescription>{t("settings.description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="configuration">{t("tabs.configuration")}</TabsTrigger>
            {canReview && <TabsTrigger value="review">{t("tabs.review")}</TabsTrigger>}
            {canAudit && <TabsTrigger value="audit">{t("tabs.audit")}</TabsTrigger>}
          </TabsList>
          <TabsContent value="configuration" className="mt-4"><ConfigurationPanel /></TabsContent>
          {canReview && <TabsContent value="review" className="mt-4"><ReviewQueue /></TabsContent>}
          {canAudit && <TabsContent value="audit" className="mt-4"><AuditLogPanel /></TabsContent>}
        </Tabs>
      </CardContent>
    </Card>
  );
}
