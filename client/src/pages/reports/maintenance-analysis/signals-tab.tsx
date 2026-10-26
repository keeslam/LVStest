/**
 * Onderhoudsanalyse, tab Signalen: cars that ask for attention, each with its reason in plain
 * Dutch — much more expensive than the same type (admin: in the same km band), costs rising three
 * full months in a row, or the same kind of repair again within 90 days. A line opens the car's
 * cost lines (for a repeated repair: only that category).
 */
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import type { TFunction } from "i18next";
import { SIGNAL_RISING_MONTHS, type MaintenanceSignal, type MaintenanceSignals } from "@shared/maintenance-analysis";
import { QueryErrorState } from "@/components/ui/query-error-state";
import { ReportTable, type ReportTableColumn, type ReportTableView } from "@/components/reports/kit/report-table";
import { useReportPrint } from "@/components/reports/kit/report-print";
import { EntityLink } from "@/components/reports/entity-link";
import { formatExpenseCategory, formatLicensePlate } from "@/lib/format-utils";
import { formatDateNl } from "@/lib/format-date-nl";
import { tablePrintSection } from "../legacy/table-print";
import { ANALYSIS_ENDPOINT, brandText, noRows, typeText, useAnalysisParams, useMoneyText } from "./analysis-context";
import { useAnalysisDrill } from "./analysis-rows";
import { AnalysisPanel } from "./analysis-panel";
import { AnalysisCsvButton } from "./analysis-csv";
import { monthLabel } from "./trends-tab";

export const signalKey = (s: MaintenanceSignal) => (s.kind === "repeated" ? `${s.kind}-${s.vehicleId}-${s.category}` : `${s.kind}-${s.vehicleId}`);

const day = (ymd: string) => formatDateNl(`${ymd}T12:00:00`, "dd-MM-yyyy");

/** The reason of a signal in plain Dutch (or the user's language). */
export function signalReason(s: MaintenanceSignal, t: TFunction, money: (n: number | null | undefined, perKm?: boolean) => string): string {
  const group = `${brandText(t, s.brand)} ${typeText(t, s.brand, s.model)}`;
  switch (s.kind) {
    case "aboveGroup": {
      const perKm = s.basis === "km";
      const opts = {
        percent: s.percent, comparables: s.comparables, group, band: s.band ?? "",
        value: money(s.value, perKm), average: money(s.average, perKm),
      };
      return t(perKm ? "maintenanceAnalysis.signals.reasons.aboveGroupKm" : "maintenanceAnalysis.signals.reasons.aboveGroupMonth", opts);
    }
    case "rising":
      return t("maintenanceAnalysis.signals.reasons.rising", {
        months: SIGNAL_RISING_MONTHS,
        list: s.months.map((m) => `${monthLabel(m.month)} ${money(m.amount)}`).join(" → "),
      });
    case "repeated":
      return t("maintenanceAnalysis.signals.reasons.repeated", {
        category: formatExpenseCategory(s.category) || s.categoryLabel,
        days: s.days, first: day(s.firstDate), second: day(s.secondDate),
      });
  }
}

export function SignalsTab() {
  const { t } = useTranslation("reports");
  const k = (key: string) => t(`maintenanceAnalysis.${key}`);
  const params = useAnalysisParams();
  const money = useMoneyText();
  const drill = useAnalysisDrill();
  const [view, setView] = useState<ReportTableView<MaintenanceSignal> | null>(null);
  const { data, isLoading, isError, error, refetch } = useQuery<MaintenanceSignals>({ queryKey: [`${ANALYSIS_ENDPOINT}/signals`, params] });
  const signals = data?.signals ?? noRows<MaintenanceSignal>();

  const columns = useMemo<ReportTableColumn<MaintenanceSignal>[]>(() => {
    const c = (key: string) => t(`maintenanceAnalysis.columns.${key}`);
    const kind = (s: MaintenanceSignal) => t(`maintenanceAnalysis.signals.kinds.${s.kind}`);
    const plate = (s: MaintenanceSignal) => formatLicensePlate(s.licensePlate);
    const type = (s: MaintenanceSignal) => typeText(t, s.brand, s.model);
    const reason = (s: MaintenanceSignal) => signalReason(s, t, money);
    return [
      { id: "kind", label: c("signal"), cell: (s) => <span className="font-medium">{kind(s)}</span>, text: kind, sortValue: kind },
      { id: "plate", label: c("licensePlate"), interactive: true, cell: (s) => <EntityLink kind="vehicle" id={s.vehicleId} label={plate(s)} />, text: plate, sortValue: (s) => s.licensePlate },
      { id: "brand", label: c("brand"), cell: (s) => brandText(t, s.brand), text: (s) => brandText(t, s.brand), sortValue: (s) => brandText(t, s.brand) },
      { id: "model", label: c("model"), cell: type, text: type, sortValue: type },
      { id: "reason", label: c("reason"), cell: reason, text: reason },
    ];
  }, [t, money]);

  useReportPrint(data ? [tablePrintSection({ id: "ma-signals", title: k("signals.title"), columns, rows: signals, view })] : null);

  if (isLoading) return <p className="text-sm text-muted-foreground">{t("reportKit.loading")}</p>;
  if (isError || !data) return <QueryErrorState error={error} onRetry={() => { void refetch(); }} />;

  return (
    <AnalysisPanel title={k("signals.title")} description={k("signals.description")}>
      {signals.length === 0 && <p className="text-sm text-muted-foreground" data-testid="ma-signals-none">{k("signals.none")}</p>}
      <ReportTable
        rows={signals}
        columns={columns}
        rowKey={signalKey}
        testId="ma-signals-table"
        onView={setView}
        toolbar={<AnalysisCsvButton columns={columns} rows={signals} view={view} name="onderhoud-signalen" testId="button-ma-signals-csv" />}
        onRowClick={(s) => drill({
          title: `${k("rows.title")} · ${formatLicensePlate(s.licensePlate)}`,
          drill: "vehicle",
          key: String(s.vehicleId),
          // Rising and repeated open what the signal looked at: its months, or its two dates (and category).
          ...(s.kind === "rising" ? { extra: { from: s.drillFrom, to: s.drillTo } } : {}),
          ...(s.kind === "repeated" ? { extra: { from: s.drillFrom, to: s.drillTo, category: s.category } } : {}),
        })}
      />
    </AnalysisPanel>
  );
}
