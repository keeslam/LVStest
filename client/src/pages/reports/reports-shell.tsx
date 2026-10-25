import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Building2, Calculator, Car, DollarSign, FileText, LayoutDashboard, Loader2, MessageSquare, TrendingUp, User, X,
  type LucideIcon,
} from "lucide-react";
import { UserRole } from "@shared/schema";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/hooks/use-auth";
import { useFiscalPermissions } from "@/components/fiscal/use-fiscal-permissions";
import ReportBuilderPage from "@/pages/reports/report-builder";
import MaintenanceCostsPage from "@/pages/reports/maintenance-costs";
import { ReportFiltersProvider } from "./report-filters";
import { ReportFilterBar } from "./report-filter-bar";
import { ReportNav } from "./report-nav";
import { ReportPane } from "./report-pane";
import { REPORTS, visibleReports, visibleTabs, type ReportAccess, type ReportTabId } from "./report-registry";
import { useReportSelection } from "./use-report-selection";

const TAB_ICONS: Record<ReportTabId, LucideIcon> = {
  overview: LayoutDashboard,
  expenses: DollarSign,
  vehicles: Car,
  customers: User,
  transports: FileText,
  financial: TrendingUp,
  fiscal: Calculator,
  portal: MessageSquare,
  office: Building2,
};

/** The reports page: filter bar, tabs, the list of reports of a tab and one report at a time. */
export function ReportsShell() {
  return (
    <ReportFiltersProvider>
      <ReportsShellInner />
    </ReportFiltersProvider>
  );
}

function ReportsShellInner() {
  const { t } = useTranslation("reports");
  const { user } = useAuth();
  const { canView: canViewFiscal } = useFiscalPermissions();
  const isAdmin = user?.role === UserRole.ADMIN;
  const permissionKey = ((user?.permissions as string[] | undefined) ?? []).join(",");

  const access = useMemo<ReportAccess>(() => {
    const granted = permissionKey ? permissionKey.split(",") : [];
    return { isAdmin, canViewFiscal, has: (perm: string) => isAdmin || granted.includes(perm) };
  }, [isAdmin, canViewFiscal, permissionKey]);

  const { tab, reportId, ready, select } = useReportSelection(access);
  const tabs = visibleTabs(access);
  const inTab = visibleReports(access).filter((r) => r.tab === tab);
  const active = REPORTS.find((r) => r.id === reportId && r.tab === tab);

  const [reportBuilderOpen, setReportBuilderOpen] = useState(false);
  const [maintenanceCostsOpen, setMaintenanceCostsOpen] = useState(false);

  return (
    <div className="container mx-auto space-y-4 pb-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t("reportsPage.header.title")}</h1>
        <p className="text-muted-foreground">{t("reportsPage.header.subtitle")}</p>
      </div>

      <ReportFilterBar
        showCategory={!!active?.usesCategory}
        onOpenReportBuilder={() => setReportBuilderOpen(true)}
        onOpenMaintenanceCosts={() => setMaintenanceCostsOpen(true)}
      />

      <Tabs value={tab} onValueChange={(value) => select(value as ReportTabId)} className="w-full">
        <TabsList className="flex h-auto w-full flex-wrap justify-start">
          {tabs.map((id) => {
            const Icon = TAB_ICONS[id];
            return (
              <TabsTrigger key={id} value={id} data-testid={`tab-report-${id}`}>
                <Icon className="mr-2 h-4 w-4" aria-hidden="true" />
                {t(`reportsPage.tabs.${id}`)}
              </TabsTrigger>
            );
          })}
        </TabsList>
      </Tabs>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-[240px_minmax(0,1fr)]">
        <aside>
          <ReportNav tab={tab} reports={inTab} selectedId={reportId} onSelect={(id) => select(tab, id)} />
        </aside>
        {active ? (
          <ReportPane key={active.id} def={active} />
        ) : !ready ? (
          <div role="status" className="flex items-center gap-2 text-sm text-muted-foreground" data-testid="report-pane-loading">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            {t("reportsPage.shell.loadingReport")}
          </div>
        ) : tabs.length === 0 ? (
          <p className="text-sm text-muted-foreground" data-testid="report-pane-empty">{t("reportsPage.shell.noReports")}</p>
        ) : null}
      </div>

      <Dialog open={reportBuilderOpen} onOpenChange={setReportBuilderOpen}>
        <DialogContent className="max-w-[95vw] w-full h-[95vh] max-h-[95vh] p-0">
          <DialogHeader className="px-6 py-4 border-b">
            <div className="flex items-center justify-between">
              <DialogTitle className="text-2xl">{t("reportBuilderPage.pageTitle")}</DialogTitle>
              <Button variant="ghost" size="icon" onClick={() => setReportBuilderOpen(false)} data-testid="button-close-report-builder">
                <X className="h-4 w-4" />
              </Button>
            </div>
          </DialogHeader>
          <div className="overflow-auto h-full">
            <ReportBuilderPage />
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={maintenanceCostsOpen} onOpenChange={setMaintenanceCostsOpen}>
        <DialogContent className="max-w-[95vw] w-full h-[95vh] max-h-[95vh] p-0">
          <DialogHeader className="px-6 py-4 border-b">
            <div className="flex items-center justify-between">
              <DialogTitle className="text-2xl">{t("maintenanceCostsPage.pageTitle")}</DialogTitle>
              <Button variant="ghost" size="icon" onClick={() => setMaintenanceCostsOpen(false)} data-testid="button-close-maintenance-costs">
                <X className="h-4 w-4" />
              </Button>
            </div>
          </DialogHeader>
          <div className="overflow-auto h-full">
            <MaintenanceCostsPage />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
