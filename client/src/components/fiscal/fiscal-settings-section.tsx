import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { NoDataAccess } from "@/components/ui/no-data-access";
import { UserPermission } from "@shared/schema";
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
  const { canView, hasAnyRight, canReview, canAudit } = useFiscalPermissions();
  const [tab, setTab] = useState("configuration");
  if (!hasAnyRight) return null;

  // Each tab follows the right its own requests need: the configuration reads
  // view_fiscal routes, the queue manage_fiscal_review, the log the audit right.
  // A tab the account may not load is not offered (it would open on a 403 and
  // the red "could not load" toast), and the first one it may open is the start.
  const tabs = [canView && "configuration", canReview && "review", canAudit && "audit"].filter(
    (name): name is "configuration" | "review" | "audit" => !!name,
  );
  const active = tabs.includes(tab as (typeof tabs)[number]) ? tab : tabs[0];

  return (
    <Card data-testid="fiscal-settings-section">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{t("settings.title")}</CardTitle>
        <CardDescription>{t("settings.description")}</CardDescription>
      </CardHeader>
      <CardContent>
        {tabs.length === 0 ? (
          // Only write rights (configure, approve, publish): every read they need is view_fiscal.
          <NoDataAccess permission={UserPermission.VIEW_FISCAL} />
        ) : (
          <Tabs value={active} onValueChange={setTab}>
            <TabsList>
              {canView && <TabsTrigger value="configuration">{t("tabs.configuration")}</TabsTrigger>}
              {canReview && <TabsTrigger value="review">{t("tabs.review")}</TabsTrigger>}
              {canAudit && <TabsTrigger value="audit">{t("tabs.audit")}</TabsTrigger>}
            </TabsList>
            {canView && <TabsContent value="configuration" className="mt-4"><ConfigurationPanel /></TabsContent>}
            {canReview && <TabsContent value="review" className="mt-4"><ReviewQueue /></TabsContent>}
            {canAudit && <TabsContent value="audit" className="mt-4"><AuditLogPanel /></TabsContent>}
          </Tabs>
        )}
      </CardContent>
    </Card>
  );
}
