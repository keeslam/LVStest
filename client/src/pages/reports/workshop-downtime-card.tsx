/**
 * Round 2 punt 11 (Kees, 2026-10-21) — Rapporten > Voertuigen: workshop downtime.
 * Per vehicle the visits in the chosen period, the days in the workshop, how many
 * were breakdowns and the costs linked to those visits; below it the same per
 * brand and model, so models that break down often stand out.
 */
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { format, endOfDay, parseISO } from "date-fns";
import type { DateRange } from "react-day-picker";
import { Download } from "lucide-react";
import { ReportSection } from "@/components/reports/kit/report-section";
import { ReportTable, type ReportTableColumn, type ReportTableView } from "@/components/reports/kit/report-table";
import { useReportPrint } from "@/components/reports/kit/report-print";
import { compactSections, textTablePrintSection } from "@/components/reports/kit/report-breakdown-table";
import { useOptionalReportFilters } from "./report-filters";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency, formatLicensePlate } from "@/lib/format-utils";
import { downloadCsv, csvNumber } from "@/lib/csv";
import type { DowntimeModelRow, DowntimeRow } from "@shared/workshop-visit";

const ymd = (d: Date | undefined, fallback: string) => (d ? format(d, "yyyy-MM-dd") : fallback);

export function WorkshopDowntimeCard({ dateRange }: { dateRange?: DateRange }) {
  const { t } = useTranslation("reports");
  const filters = useOptionalReportFilters();
  // The prop overrides; otherwise the filter bar of the report screen.
  const range: DateRange = dateRange ?? (filters ? { from: parseISO(filters.from), to: endOfDay(parseISO(filters.to)) } : { from: undefined });
  const from = ymd(range.from, "2000-01-01");
  const to = ymd(range.to, ymd(new Date(), "2050-12-31"));
  const { data, isLoading } = useQuery<{ rows: DowntimeRow[]; byModel: DowntimeModelRow[] }>({
    queryKey: [`/api/reports/workshop-downtime?from=${from}&to=${to}`],
  });
  const rows = data?.rows ?? [];
  const byModel = data?.byModel ?? [];

  const columns = useMemo<ReportTableColumn<DowntimeRow>[]>(() => [
    {
      id: "licensePlate", label: t("reportsPage.common.licensePlate"),
      cell: (r) => <span className="font-medium">{formatLicensePlate(r.licensePlate)}</span>,
      text: (r) => formatLicensePlate(r.licensePlate), sortValue: (r) => r.licensePlate,
    },
    {
      id: "brandModel", label: t("reportsPage.downtime.brandModel"),
      cell: (r) => [r.brand, r.model].filter(Boolean).join(" "),
      text: (r) => [r.brand, r.model].filter(Boolean).join(" "), sortValue: (r) => [r.brand, r.model].filter(Boolean).join(" "),
    },
    { id: "visits", label: t("reportsPage.downtime.visits"), align: "right", cell: (r) => r.visits, text: (r) => String(r.visits), sortValue: (r) => r.visits },
    { id: "days", label: t("reportsPage.downtime.days"), align: "right", cell: (r) => r.days, text: (r) => String(r.days), sortValue: (r) => r.days },
    { id: "breakdowns", label: t("reportsPage.downtime.breakdowns"), align: "right", cell: (r) => r.breakdowns, text: (r) => String(r.breakdowns), sortValue: (r) => r.breakdowns },
    { id: "costs", label: t("reportsPage.downtime.costs"), align: "right", cell: (r) => formatCurrency(r.costs), text: (r) => formatCurrency(r.costs), sortValue: (r) => r.costs },
  ], [t]);
  const [view, setView] = useState<ReportTableView<DowntimeRow> | null>(null);

  useReportPrint(rows.length > 0 ? compactSections([
    {
      kind: "table",
      id: "downtime-rows",
      title: t("reportsPage.downtime.title"),
      header: columns.map((c) => c.label),
      allRows: () => ({ rows: (view?.all ?? rows).map((r) => columns.map((c) => c.text(r))), truncated: false }),
      pageRows: view ? view.page.map((r) => columns.map((c) => c.text(r))) : undefined,
    },
    textTablePrintSection(
      "downtime-by-model",
      t("reportsPage.downtime.perModel"),
      [t("reportsPage.downtime.brandModel"), t("reportsPage.downtime.vehicles"), t("reportsPage.downtime.visits"), t("reportsPage.downtime.days"), t("reportsPage.downtime.breakdowns"), t("reportsPage.downtime.costs")],
      byModel.map((m) => [[m.brand, m.model].filter(Boolean).join(" ") || "-", String(m.vehicles), String(m.visits), String(m.days), String(m.breakdowns), formatCurrency(m.costs)]),
    ),
  ]) : null);

  const exportCsv = () =>
    downloadCsv(
      t("reportsPage.downtime.csvSubject"),
      [
        t("reportsPage.common.licensePlate"), t("reportsPage.downtime.brand"), t("reportsPage.downtime.model"),
        t("reportsPage.downtime.visits"), t("reportsPage.downtime.days"), t("reportsPage.downtime.breakdowns"), t("reportsPage.downtime.costs"),
      ],
      rows.map((r) => [formatLicensePlate(r.licensePlate), r.brand, r.model, r.visits, r.days, r.breakdowns, csvNumber(r.costs)]),
    );

  return (
    <ReportSection testId="report-workshop-downtime" title={t("reportsPage.downtime.title")} description={t("reportsPage.downtime.description")}>
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={exportCsv} disabled={rows.length === 0} data-testid="button-export-downtime">
          <Download className="h-4 w-4 mr-1" />
          CSV
        </Button>
      </div>
      {!isLoading && rows.length === 0 ? (
        <p className="text-sm text-muted-foreground" data-testid="downtime-empty">{t("reportsPage.downtime.none")}</p>
      ) : (
        <>
          <ReportTable rows={rows} columns={columns} rowKey={(r) => r.vehicleId} testId="downtime" resetKey={`${from}|${to}`} onView={setView} />

          <div>
            <h4 className="mb-2 text-sm font-semibold">{t("reportsPage.downtime.perModel")}</h4>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("reportsPage.downtime.brandModel")}</TableHead>
                    <TableHead className="text-right">{t("reportsPage.downtime.vehicles")}</TableHead>
                    <TableHead className="text-right">{t("reportsPage.downtime.visits")}</TableHead>
                    <TableHead className="text-right">{t("reportsPage.downtime.days")}</TableHead>
                    <TableHead className="text-right">{t("reportsPage.downtime.breakdowns")}</TableHead>
                    <TableHead className="text-right">{t("reportsPage.downtime.costs")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {byModel.map((m) => (
                    <TableRow key={`${m.brand}-${m.model}`}>
                      <TableCell>{[m.brand, m.model].filter(Boolean).join(" ") || "-"}</TableCell>
                      <TableCell className="text-right">{m.vehicles}</TableCell>
                      <TableCell className="text-right">{m.visits}</TableCell>
                      <TableCell className="text-right">{m.days}</TableCell>
                      <TableCell className="text-right">{m.breakdowns}</TableCell>
                      <TableCell className="text-right">{formatCurrency(m.costs)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </>
      )}
    </ReportSection>
  );
}
