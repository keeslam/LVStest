import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AccountsTable, useCanManagePortal } from "@/components/portal-admin/accounts-table";
import { CustomerPortalSettingsForm } from "@/components/portal-admin/customer-portal-settings-form";
import { ActivityTable } from "@/components/portal-admin/activity-table";
import { RequestsTable } from "@/components/portal-admin/requests-table";
import { FinesTable, useCanViewFines } from "@/components/fines/fines-table";

export function CustomerPortalTab({ customerId }: { customerId: number }) {
  const { t } = useTranslation("portal");
  const canManage = useCanManagePortal();
  const canViewFines = useCanViewFines();
  return (
    <div className="space-y-6">
      <Card><CardContent className="p-4"><AccountsTable customerId={customerId} /></CardContent></Card>
      <Card><CardContent className="p-4"><CustomerPortalSettingsForm customerId={customerId} readOnly={!canManage} /></CardContent></Card>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">{t("admin.requests.title")}</CardTitle></CardHeader>
        <CardContent className="p-4 pt-0"><RequestsTable customerId={customerId} /></CardContent>
      </Card>
      {canViewFines && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">{t("admin.fines.title")}</CardTitle></CardHeader>
          <CardContent className="p-4 pt-0"><FinesTable customerId={customerId} /></CardContent>
        </Card>
      )}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">{t("admin.activity.title")}</CardTitle></CardHeader>
        <CardContent className="p-4 pt-0"><ActivityTable customerId={customerId} /></CardContent>
      </Card>
    </div>
  );
}
