import { useTranslation } from "react-i18next";
import { Card, CardContent } from "@/components/ui/card";
import { AccountsTable, useCanManagePortal } from "@/components/portal-admin/accounts-table";
import { CustomerPortalSettingsForm } from "@/components/portal-admin/customer-portal-settings-form";
import { ActivityTable } from "@/components/portal-admin/activity-table";
import { RequestsTable } from "@/components/portal-admin/requests-table";
import { FinesTable, useCanViewFines } from "@/components/fines/fines-table";
import { PreviewSection } from "@/components/portal-admin/preview";

/**
 * "Portaal" tab in the customer dialog. Each list shows its first rows only;
 * "Alles bekijken en zoeken" opens the full list with search and filters.
 */
export function CustomerPortalTab({ customerId }: { customerId: number }) {
  const { t } = useTranslation("portal");
  const canManage = useCanManagePortal();
  const canViewFines = useCanViewFines();
  return (
    <div className="space-y-6">
      <PreviewSection title={t("admin.accounts.title")} testId="section-accounts" render={(preview) => <AccountsTable customerId={customerId} preview={preview} />} />
      <Card><CardContent className="p-4"><CustomerPortalSettingsForm customerId={customerId} readOnly={!canManage} /></CardContent></Card>
      <PreviewSection title={t("admin.requests.title")} testId="section-requests" render={(preview) => <RequestsTable customerId={customerId} preview={preview} />} />
      {canViewFines && <PreviewSection title={t("admin.fines.title")} testId="section-fines" render={(preview) => <FinesTable customerId={customerId} preview={preview} />} />}
      <PreviewSection title={t("admin.activity.title")} testId="section-activity" render={(preview) => <ActivityTable customerId={customerId} limit={preview ? 50 : 500} preview={preview} />} />
    </div>
  );
}
