/**
 * Onderhoudsanalyse (Kees, 2026-10-26): the window behind "Onderhoudsanalyse" on the reports page.
 *
 * It has its own filter (period presets and Vergelijk met as on the reports page, plus category,
 * brand, type, build year, km band for an admin and supplier) and six tabs: Overzicht, Merken en
 * typen, Voertuigen, Leveranciers, Trends, Signalen. Every tab reads one part of
 * GET /api/reports/maintenance-analysis/* with the same filter; every number opens its cost lines
 * (GET .../rows). Km data (per km, km bands) is for admins only; the server leaves it out for
 * everyone else and refuses a km-band filter.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MAINTENANCE_EXPENSE_CATEGORIES } from "@shared/expense-categories";
import { formatExpenseCategory } from "@/lib/format-utils";
import { PrintButtonInner, ReportPrintProvider } from "@/components/reports/kit/report-print";
import { ReportFiltersProvider, presetRange } from "./report-filters";
import { officeToday } from "@/lib/office-date";
import { AnalysisProvider } from "./maintenance-analysis/analysis-context";
import { AnalysisFilterBar } from "./maintenance-analysis/analysis-filter-bar";
import { AnalysisDrillProvider } from "./maintenance-analysis/analysis-rows";
import { OverviewTab } from "./maintenance-analysis/overview-tab";
import { BrandsTab } from "./maintenance-analysis/brands-tab";
import { VehiclesTab } from "./maintenance-analysis/vehicles-tab";
import { SuppliersTab } from "./maintenance-analysis/suppliers-tab";
import { TrendsTab } from "./maintenance-analysis/trends-tab";
import { SignalsTab } from "./maintenance-analysis/signals-tab";

export const MAINTENANCE_ANALYSIS_TABS = ["overview", "brands", "vehicles", "suppliers", "trends", "signals"] as const;
export type MaintenanceAnalysisTab = (typeof MAINTENANCE_ANALYSIS_TABS)[number];

export default function MaintenanceCostsPage() {
  // The window starts on this year, the server's default period.
  const [initial] = useState(() => ({ ...presetRange("thisYear", officeToday()), preset: "thisYear" as const }));
  return (
    <ReportFiltersProvider initial={initial}>
      <AnalysisProvider>
        <AnalysisDrillProvider>
          <MaintenanceAnalysisWindow />
        </AnalysisDrillProvider>
      </AnalysisProvider>
    </ReportFiltersProvider>
  );
}

function MaintenanceAnalysisWindow() {
  const { t } = useTranslation("reports");
  const [tab, setTab] = useState<MaintenanceAnalysisTab>("overview");
  const categories = MAINTENANCE_EXPENSE_CATEGORIES.map((c) => formatExpenseCategory(c)).join(", ");
  const title = `${t("maintenanceCostsPage.pageTitle")} · ${t(`maintenanceAnalysis.tabs.${tab}`)}`;

  return (
    <div className="space-y-4 p-6" data-testid="maintenance-analysis-window">
      <p className="text-sm text-muted-foreground" data-testid="maintenance-costs-scope-note">
        {t("maintenanceAnalysis.scopeNote", { categories })}
      </p>
      <AnalysisFilterBar />
      <Tabs value={tab} onValueChange={(v) => setTab(v as MaintenanceAnalysisTab)} className="space-y-4">
        <TabsList className="flex h-auto w-full flex-wrap justify-start">
          {MAINTENANCE_ANALYSIS_TABS.map((id) => (
            <TabsTrigger key={id} value={id} data-testid={`tab-ma-${id}`}>{t(`maintenanceAnalysis.tabs.${id}`)}</TabsTrigger>
          ))}
        </TabsList>
        {MAINTENANCE_ANALYSIS_TABS.map((id) => (
          <TabsContent key={id} value={id} className="space-y-4" data-testid={`tab-content-ma-${id}`}>
            {/* Every tab registers its own print; Afdrukken prints the tab that is open. */}
            <ReportPrintProvider>
              <div className="flex justify-end">
                <PrintButtonInner title={title} />
              </div>
              <TabBody tab={id} />
            </ReportPrintProvider>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

function TabBody({ tab }: { tab: MaintenanceAnalysisTab }) {
  switch (tab) {
    case "overview": return <OverviewTab />;
    case "brands": return <BrandsTab />;
    case "vehicles": return <VehiclesTab />;
    case "suppliers": return <SuppliersTab />;
    case "trends": return <TrendsTab />;
    case "signals": return <SignalsTab />;
  }
}
