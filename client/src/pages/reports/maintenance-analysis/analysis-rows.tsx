/**
 * Onderhoudsanalyse: the cost lines behind a number. Every tab calls `useAnalysisDrill().open(...)`
 * with a title and the drill (category, brand, model, supplier, vehicle, month, kmBand) and its key;
 * the one dialog of the window asks GET /rows with the window's filter plus that drill and shows the
 * lines in a ReportRowsDialog (search, sort, CSV, Afdrukken). `extra` narrows further, e.g. the
 * brand and type of a km-band cell.
 */
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import type { MaintenanceAnalysisDrill, MaintenanceCostRow, MaintenanceRows } from "@shared/maintenance-analysis";
import { ReportRowsDialog } from "@/components/reports/kit/report-rows-dialog";
import type { ReportTableColumn } from "@/components/reports/kit/report-table";
import type { ReportLinks } from "@/components/reports/kit/report-extra-columns";
import { EntityLink } from "@/components/reports/entity-link";
import { formatExpenseCategory, formatLicensePlate } from "@/lib/format-utils";
import { formatDateNl } from "@/lib/format-date-nl";
import { ANALYSIS_ENDPOINT, brandText, noRows, typeText, useAnalysis, useAnalysisParams, useMoneyText } from "./analysis-context";

export interface AnalysisDrill {
  title: string;
  drill?: MaintenanceAnalysisDrill;
  key?: string;
  /** More filters for this drill only (brand and type of a km-band cell). */
  extra?: Record<string, string>;
}

const DrillContext = createContext<((drill: AnalysisDrill) => void) | null>(null);

export function useAnalysisDrill(): (drill: AnalysisDrill) => void {
  const open = useContext(DrillContext);
  if (!open) throw new Error("useAnalysisDrill must be used inside AnalysisDrillProvider");
  return open;
}

const ROW_LINKS: ReportLinks<MaintenanceCostRow> = { vehicleId: (r) => r.vehicleId };

export function AnalysisDrillProvider({ children }: { children?: ReactNode }) {
  const [drill, setDrill] = useState<AnalysisDrill | null>(null);
  const open = useCallback((d: AnalysisDrill) => setDrill(d), []);
  return (
    <DrillContext.Provider value={open}>
      {children}
      {drill && <AnalysisRowsDialog drill={drill} onClose={() => setDrill(null)} />}
    </DrillContext.Provider>
  );
}

function AnalysisRowsDialog({ drill, onClose }: { drill: AnalysisDrill; onClose: () => void }) {
  const { t } = useTranslation("reports");
  const k = (key: string) => t(`maintenanceAnalysis.${key}`);
  const base = useAnalysisParams();
  const { isAdmin } = useAnalysis();
  const money = useMoneyText();
  const params = useMemo(() => ({
    ...base,
    ...drill.extra,
    ...(drill.drill ? { drill: drill.drill, key: drill.key ?? "" } : {}),
  }), [base, drill]);
  const { data, isLoading, isError } = useQuery<MaintenanceRows>({ queryKey: [`${ANALYSIS_ENDPOINT}/rows`, params] });

  const columns = useMemo<ReportTableColumn<MaintenanceCostRow>[]>(() => {
    const c = (key: string) => t(`maintenanceAnalysis.columns.${key}`);
    const plate = (r: MaintenanceCostRow) => formatLicensePlate(r.licensePlate);
    const type = (r: MaintenanceCostRow) => typeText(t, r.brand, r.model);
    const category = (r: MaintenanceCostRow) => formatExpenseCategory(r.category) || r.categoryLabel;
    const date = (r: MaintenanceCostRow) => formatDateNl(`${r.date}T12:00:00`, "dd-MM-yyyy");
    const list: ReportTableColumn<MaintenanceCostRow>[] = [
      { id: "date", label: c("date"), cell: date, text: date, sortValue: (r) => r.date },
      { id: "plate", label: c("licensePlate"), interactive: true, cell: (r) => <EntityLink kind="vehicle" id={r.vehicleId} label={plate(r)} />, text: plate, sortValue: (r) => r.licensePlate },
      { id: "brand", label: c("brand"), cell: (r) => brandText(t, r.brand), text: (r) => brandText(t, r.brand), sortValue: (r) => brandText(t, r.brand) },
      { id: "model", label: c("model"), cell: type, text: type, sortValue: type },
      { id: "category", label: c("category"), cell: category, text: category, sortValue: category },
      { id: "supplier", label: c("supplier"), cell: (r) => r.supplier, text: (r) => r.supplier, sortValue: (r) => r.supplier },
      { id: "description", label: c("description"), cell: (r) => r.description ?? "", text: (r) => r.description ?? "" },
      { id: "amount", label: c("amount"), cell: (r) => money(r.amount), text: (r) => money(r.amount), sortValue: (r) => r.amount, align: "right" },
    ];
    if (isAdmin) {
      const km = (r: MaintenanceCostRow) => (r.km == null ? "" : r.km.toLocaleString("nl-NL"));
      list.push({ id: "km", label: c("km"), cell: km, text: km, sortValue: (r) => r.km ?? null, align: "right" });
    }
    return list;
  }, [t, isAdmin, money]);

  const description = isLoading
    ? k("rows.loading")
    : isError
      ? t("reportKit.loadFailed")
      : t("maintenanceAnalysis.rows.summary", { lines: data?.total ?? 0, amount: money(data?.amount ?? 0) });

  return (
    <ReportRowsDialog
      open
      onOpenChange={(o) => { if (!o) onClose(); }}
      title={drill.title}
      description={description}
      rows={data?.rows ?? noRows<MaintenanceCostRow>()}
      columns={columns}
      rowKey={(r) => r.id}
      csvName={k("rows.csv")}
      columnsId="maintenance-analysis-rows"
      links={ROW_LINKS}
      testId="ma-rows"
    />
  );
}
