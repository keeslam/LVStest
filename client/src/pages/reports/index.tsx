import { useTranslation } from "react-i18next";
import { UserPermission } from "@shared/schema";
import { useHasPermission } from "@/hooks/use-has-permission";
import { FiscalReportTab } from "@/components/fiscal/fiscal-report-tab";
import { useFiscalPermissions } from "@/components/fiscal/use-fiscal-permissions";
import { ReportsShell } from "./reports-shell";

/**
 * Reports Page - Generate and display reports for the car rental business
 * This page focuses on operational aspects rather than revenue
 *
 * A-R-1: "Fiscale check bekijken" opens this screen too. Someone who holds that right
 * but none of the report rights gets the fiscal check alone: every other tab reads
 * data that right does not cover, and a page full of refused queries would only show
 * error toasts.
 */
export default function ReportsPage() {
  const canViewReports = useHasPermission(UserPermission.VIEW_REPORTS, UserPermission.MANAGE_REPORTS);
  const { canView: canViewFiscalOnly } = useFiscalPermissions();
  if (!canViewReports && canViewFiscalOnly) return <FiscalOnlyReportsPage />;
  return <FullReportsPage />;
}

function FiscalOnlyReportsPage() {
  const { t } = useTranslation("reports");
  return (
    <div className="space-y-4 p-4">
      <h1 className="text-2xl font-semibold">{t('reportsPage.tabs.fiscal')}</h1>
      <FiscalReportTab />
    </div>
  );
}

function FullReportsPage() {
  return <ReportsShell />;
}
