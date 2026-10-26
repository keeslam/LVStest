/**
 * Onderhoudsanalyse, tab Leveranciers: costs per supplier (chart and table; costs without a
 * supplier are "Onbekend"), the workshop downtime per car and the ten largest repairs.
 * A supplier, a bar or a downtime line opens the cost lines behind it.
 */
import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { REPORT_DRILL_NULL_KEY } from "@shared/report-kit";
import type { MaintenanceCostRow, MaintenanceSuppliers } from "@shared/maintenance-analysis";
import { QueryErrorState } from "@/components/ui/query-error-state";
import { ReportTable, type ReportTableColumn, type ReportTableView } from "@/components/reports/kit/report-table";
import { compactSections } from "@/components/reports/kit/report-breakdown-table";
import { useReportPrint } from "@/components/reports/kit/report-print";
import { EntityLink } from "@/components/reports/entity-link";
import { chartSvgFromRef } from "@/lib/report-document-print";
import { formatExpenseCategory, formatLicensePlate } from "@/lib/format-utils";
import { formatDateNl } from "@/lib/format-date-nl";
import { tablePrintSection } from "../legacy/table-print";
import { ANALYSIS_ENDPOINT, brandText, countText, noRows, typeText, useAnalysisParams, useMoneyText } from "./analysis-context";
import { AnalysisChart } from "./analysis-chart";
import { useAnalysisDrill } from "./analysis-rows";
import { AnalysisPanel } from "./analysis-panel";
import { AnalysisCsvButton } from "./analysis-csv";

type SupplierLine = MaintenanceSuppliers["suppliers"][number];
type DowntimeLine = MaintenanceSuppliers["downtime"][number];

const supplierId = (s: SupplierLine) => s.key ?? REPORT_DRILL_NULL_KEY;

export function SuppliersTab() {
  const { t } = useTranslation("reports");
  const k = (key: string) => t(`maintenanceAnalysis.${key}`);
  const params = useAnalysisParams();
  const money = useMoneyText();
  const drill = useAnalysisDrill();
  const chartRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<ReportTableView<SupplierLine> | null>(null);
  const [downtimeView, setDowntimeView] = useState<ReportTableView<DowntimeLine> | null>(null);
  const [repairsView, setRepairsView] = useState<ReportTableView<MaintenanceCostRow> | null>(null);
  const { data, isLoading, isError, error, refetch } = useQuery<MaintenanceSuppliers>({ queryKey: [`${ANALYSIS_ENDPOINT}/suppliers`, params] });

  const name = (s: SupplierLine) => (s.key === null ? k("unknownSupplier") : s.supplier);
  const suppliers = data?.suppliers ?? noRows<SupplierLine>();
  const downtime = data?.downtime ?? noRows<DowntimeLine>();
  const repairs = data?.topRepairs ?? noRows<MaintenanceCostRow>();
  const rowsTitle = k("rows.title");
  const openSupplier = (key: string, label: string) => drill({ title: `${rowsTitle} · ${label}`, drill: "supplier", key });

  const columns = useMemo<ReportTableColumn<SupplierLine>[]>(() => {
    const c = (key: string) => t(`maintenanceAnalysis.columns.${key}`);
    const label = (s: SupplierLine) => (s.key === null ? t("maintenanceAnalysis.unknownSupplier") : s.supplier);
    return [
      { id: "supplier", label: c("supplier"), cell: label, text: label, sortValue: label },
      { id: "count", label: c("count"), cell: (r) => countText(r.count), text: (r) => countText(r.count), sortValue: (r) => r.count, align: "right" },
      { id: "total", label: c("total"), cell: (r) => money(r.total), text: (r) => money(r.total), sortValue: (r) => r.total, align: "right" },
      { id: "avg", label: c("avg"), cell: (r) => money(r.avg), text: (r) => money(r.avg), sortValue: (r) => r.avg, align: "right" },
    ];
  }, [t, money]);

  const downtimeColumns = useMemo<ReportTableColumn<DowntimeLine>[]>(() => {
    const c = (key: string) => t(`maintenanceAnalysis.columns.${key}`);
    const plate = (r: DowntimeLine) => formatLicensePlate(r.plate);
    const type = (r: DowntimeLine) => typeText(t, r.brand, r.model);
    return [
      { id: "plate", label: c("licensePlate"), interactive: true, cell: (r) => <EntityLink kind="vehicle" id={r.vehicleId} label={plate(r)} />, text: plate, sortValue: (r) => r.plate },
      { id: "brand", label: c("brand"), cell: (r) => brandText(t, r.brand), text: (r) => brandText(t, r.brand), sortValue: (r) => brandText(t, r.brand) },
      { id: "model", label: c("model"), cell: type, text: type, sortValue: type },
      { id: "visits", label: c("visits"), cell: (r) => countText(r.visits), text: (r) => countText(r.visits), sortValue: (r) => r.visits, align: "right" },
      { id: "days", label: c("days"), cell: (r) => countText(r.days), text: (r) => countText(r.days), sortValue: (r) => r.days, align: "right" },
    ];
  }, [t]);

  const repairColumns = useMemo<ReportTableColumn<MaintenanceCostRow>[]>(() => {
    const c = (key: string) => t(`maintenanceAnalysis.columns.${key}`);
    const plate = (r: MaintenanceCostRow) => formatLicensePlate(r.licensePlate);
    const date = (r: MaintenanceCostRow) => formatDateNl(`${r.date}T12:00:00`, "dd-MM-yyyy");
    const category = (r: MaintenanceCostRow) => formatExpenseCategory(r.category) || r.categoryLabel;
    const supplier = (r: MaintenanceCostRow) => (r.supplierKey === null ? t("maintenanceAnalysis.unknownSupplier") : r.supplier);
    return [
      { id: "date", label: c("date"), cell: date, text: date, sortValue: (r) => r.date },
      { id: "plate", label: c("licensePlate"), interactive: true, cell: (r) => <EntityLink kind="vehicle" id={r.vehicleId} label={plate(r)} />, text: plate, sortValue: (r) => r.licensePlate },
      { id: "category", label: c("category"), cell: category, text: category, sortValue: category },
      { id: "supplier", label: c("supplier"), cell: supplier, text: supplier, sortValue: supplier },
      { id: "description", label: c("description"), cell: (r) => r.description ?? "", text: (r) => r.description ?? "" },
      { id: "amount", label: c("amount"), cell: (r) => money(r.amount), text: (r) => money(r.amount), sortValue: (r) => r.amount, align: "right" },
    ];
  }, [t, money]);

  const points = useMemo(() => suppliers.map((s) => ({
    key: supplierId(s),
    label: s.key === null ? t("maintenanceAnalysis.unknownSupplier") : s.supplier,
    values: { amount: s.total, count: s.count },
  })), [suppliers, t]);

  useReportPrint(data ? compactSections([
    { kind: "chart", title: k("suppliers.chartTitle"), getSvg: () => chartSvgFromRef(chartRef) },
    tablePrintSection({ id: "ma-suppliers", title: k("suppliers.title"), columns, rows: suppliers, view }),
    tablePrintSection({ id: "ma-downtime", title: k("suppliers.downtimeTitle"), columns: downtimeColumns, rows: downtime, view: downtimeView }),
    tablePrintSection({ id: "ma-top-repairs", title: k("suppliers.topRepairsTitle"), columns: repairColumns, rows: repairs, view: repairsView }),
  ]) : null);

  if (isLoading) return <p className="text-sm text-muted-foreground">{t("reportKit.loading")}</p>;
  if (isError || !data) return <QueryErrorState error={error} onRetry={() => { void refetch(); }} />;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <AnalysisPanel title={k("suppliers.chartTitle")} description={k("overview.clickHint")}>
          <AnalysisChart
            points={points}
            metrics={["amount", "count"]}
            kinds={["bar", "pie"]}
            defaultKind="bar"
            testId="ma-supplier-chart"
            chartRef={chartRef}
            onPointClick={(key) => {
              const s = suppliers.find((x) => supplierId(x) === key);
              openSupplier(key, s ? name(s) : key);
            }}
          />
        </AnalysisPanel>
        <AnalysisPanel title={k("suppliers.title")} description={k("overview.clickHint")}>
          <ReportTable
            rows={suppliers}
            columns={columns}
            rowKey={supplierId}
            defaultSort={{ id: "total", dir: "desc" }}
            testId="ma-suppliers-table"
            onView={setView}
            toolbar={<AnalysisCsvButton columns={columns} rows={suppliers} view={view} name="onderhoud-leveranciers" testId="button-ma-suppliers-csv" />}
            onRowClick={(s) => openSupplier(supplierId(s), name(s))}
          />
        </AnalysisPanel>
      </div>
      <AnalysisPanel title={k("suppliers.downtimeTitle")} description={k("suppliers.downtimeDesc")}>
        <ReportTable
          rows={downtime}
          columns={downtimeColumns}
          rowKey={(r) => r.vehicleId}
          defaultSort={{ id: "days", dir: "desc" }}
          testId="ma-downtime-table"
          onView={setDowntimeView}
          toolbar={<AnalysisCsvButton columns={downtimeColumns} rows={downtime} view={downtimeView} name="onderhoud-stilstand" testId="button-ma-downtime-csv" />}
          onRowClick={(r) => drill({ title: `${rowsTitle} · ${formatLicensePlate(r.plate)}`, drill: "vehicle", key: String(r.vehicleId) })}
        />
      </AnalysisPanel>
      <AnalysisPanel title={k("suppliers.topRepairsTitle")}>
        <ReportTable
          rows={repairs}
          columns={repairColumns}
          rowKey={(r) => r.id}
          defaultSort={{ id: "amount", dir: "desc" }}
          testId="ma-top-repairs-table"
          onView={setRepairsView}
          toolbar={<AnalysisCsvButton columns={repairColumns} rows={repairs} view={repairsView} name="onderhoud-grootste-reparaties" testId="button-ma-top-repairs-csv" />}
        />
      </AnalysisPanel>
    </div>
  );
}
