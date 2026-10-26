import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Building2, Calculator, Car, DollarSign, FileText, LayoutDashboard, Loader2, MessageSquare, TrendingUp, User,
  type LucideIcon,
} from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import ReportBuilderPage from "@/pages/reports/report-builder";
import MaintenanceCostsPage from "@/pages/reports/maintenance-costs";
import { ReportFiltersProvider } from "./report-filters";
import { ReportFilterBar } from "./report-filter-bar";
import { ReportNav } from "./report-nav";
import { ReportPane } from "./report-pane";
import { invalidateByPrefix, queryClient } from "@/lib/queryClient";
import { ReportListContext, useReportList, visibleReports, visibleTabs, type ReportTabId } from "./report-registry";
import { ReportBuilderOpenerContext, SAVED_REPORT_PREFIX, type SavedReport } from "./saved-report-view";
import { useReportAccess } from "./use-report-access";
import { ReportSelectionContext, useReportSelection } from "./use-report-selection";

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
  const access = useReportAccess();

  // The fixed reports plus the saved builder reports on a tab: one list for the tabs, the list and the URL.
  const reportList = useReportList(access);
  const { reports } = reportList;
  const selection = useReportSelection(access, reports, reportList.savedLoading);
  const { tab, reportId, ready, select } = selection;
  const tabs = visibleTabs(access, reports);
  const inTab = visibleReports(access, reports).filter((r) => r.tab === tab);
  const active = reports.find((r) => r.id === reportId && r.tab === tab);

  const [reportBuilderOpen, setReportBuilderOpen] = useState(false);
  // The saved report the builder opens on (Bewerken on a saved report), or none.
  const [builderEditId, setBuilderEditId] = useState<number | undefined>(undefined);
  const openBuilder = useCallback((editReportId?: number) => {
    setBuilderEditId(editReportId);
    setReportBuilderOpen(true);
  }, []);
  // A saved report that was edited in the builder: after closing it, it is selected on the tab it sits on now.
  const [reselect, setReselect] = useState<{ tab: ReportTabId; id: string } | null>(null);
  const setBuilderOpen = (open: boolean) => {
    setReportBuilderOpen(open);
    // Saved, changed or deleted in the builder: the tabs show the saved reports as they are now.
    if (!open) {
      const editedId = builderEditId;
      void Promise.resolve(invalidateByPrefix("/api/reports/saved")).then(() => {
        if (editedId === undefined) return;
        const fresh = queryClient.getQueryData<SavedReport[]>(["/api/reports/saved"]);
        const tab = fresh?.find((r) => r.id === editedId)?.configuration?.tab;
        if (tab) setReselect({ tab: tab as ReportTabId, id: `${SAVED_REPORT_PREFIX}${editedId}` });
      });
    }
  };
  // Waits until the list the shell shows has the report on its new tab, then selects it.
  useEffect(() => {
    if (!reselect) return;
    if (reports.some((r) => r.id === reselect.id && r.tab === reselect.tab && r.visible(access))) {
      select(reselect.tab, reselect.id);
      setReselect(null);
    }
  }, [reselect, reports, access, select]);
  const [maintenanceCostsOpen, setMaintenanceCostsOpen] = useState(false);

  // Overzicht is one item: no list, the tiles get the whole width.
  const showList = tab !== "overview";

  return (
    <ReportListContext.Provider value={reportList}>
    <ReportBuilderOpenerContext.Provider value={openBuilder}>
    <ReportSelectionContext.Provider value={selection}>
    <div className="container mx-auto space-y-4 pb-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t("reportsPage.header.title")}</h1>
        <p className="text-muted-foreground">{t("reportsPage.header.subtitle")}</p>
      </div>

      <ReportFilterBar
        showCategory={!!active?.usesCategory}
        onOpenReportBuilder={() => openBuilder()}
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

      <div
        className={showList ? "grid grid-cols-1 gap-6 md:grid-cols-[240px_minmax(0,1fr)]" : "grid grid-cols-1 gap-6"}
        data-testid="reports-layout"
      >
        {showList && (
          <aside>
            <ReportNav tab={tab} reports={inTab} selectedId={reportId} onSelect={(id) => select(tab, id)} />
          </aside>
        )}
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

      <Dialog open={reportBuilderOpen} onOpenChange={setBuilderOpen}>
        <DialogContent className="flex max-w-[95vw] w-full h-[95vh] max-h-[95vh] flex-col gap-0 p-0">
          <DialogHeader className="px-6 py-4 border-b">
            <DialogTitle className="text-2xl">{t("reportBuilderPage.pageTitle")}</DialogTitle>
          </DialogHeader>
          {/* A flex column: the body takes the rest of the height and scrolls to its very bottom. */}
          <div className="min-h-0 flex-1 overflow-auto">
            <ReportBuilderPage key={builderEditId ?? "new"} editReportId={builderEditId} />
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={maintenanceCostsOpen} onOpenChange={setMaintenanceCostsOpen}>
        <DialogContent className="flex max-w-[95vw] w-full h-[95vh] max-h-[95vh] flex-col gap-0 p-0">
          <DialogHeader className="px-6 py-4 border-b">
            <DialogTitle className="text-2xl">{t("maintenanceCostsPage.pageTitle")}</DialogTitle>
          </DialogHeader>
          {/* A flex column: the body takes the rest of the height and scrolls to its very bottom. */}
          <div className="min-h-0 flex-1 overflow-auto">
            <MaintenanceCostsPage />
          </div>
        </DialogContent>
      </Dialog>
    </div>
    </ReportSelectionContext.Provider>
    </ReportBuilderOpenerContext.Provider>
    </ReportListContext.Provider>
  );
}
