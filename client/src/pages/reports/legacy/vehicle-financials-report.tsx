/**
 * Kosten en opbrengst per voertuig (merged from the old Financieel tab): revenue, costs and
 * margin per vehicle from /api/reports/vehicle-financials, the top 10 on revenue in a chart,
 * a table with a total row and the CSV with every row.
 * Rights: the report right only (a money report; the server uses moneyReportGuards).
 */
import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ReportSection } from "@/components/reports/kit/report-section";
import { ReportTable, type ReportTableColumn, type ReportTableView } from "@/components/reports/kit/report-table";
import { EntityLink } from "@/components/reports/entity-link";
import { useReportPrint } from "@/components/reports/kit/report-print";
import { chartSvgFromRef } from "@/lib/report-document-print";
import { formatCurrency, formatExpenseCategory, formatLicensePlate } from "@/lib/format-utils";
import { downloadCsv, csvNumber } from "@/lib/csv";
import { useReportFilters } from "../report-filters";
import { tablePrintSection } from "./table-print";

// Mirrors server/utils/financial-reports.ts
interface VehicleFinancialRow {
  vehicleId: number;
  licensePlate: string;
  brand: string;
  model: string;
  dailyPrice: number | null;
  rentals: number;
  rentalDays: number;
  revenue: number;
  /** Punt 1: part of revenue that is extra costs settled at return. */
  extraCosts?: number;
  expenses: number;
  expensesByCategory: Record<string, number>;
  margin: number;
}
interface VehicleFinancialsReport {
  rows: VehicleFinancialRow[];
  totals: { rentals: number; rentalDays: number; revenue: number; extraCosts?: number; expenses: number; margin: number };
}

const marginPct = (row: { revenue: number; margin: number }) =>
  row.revenue > 0 ? `${Math.round((row.margin / row.revenue) * 100)}%` : "–";
const marginPctCsv = (row: { revenue: number; margin: number }) =>
  row.revenue > 0 ? String(Math.round((row.margin / row.revenue) * 100)) : "";
const perDayText = (r: { revenue: number; rentalDays: number }) => (r.rentalDays > 0 ? formatCurrency(r.revenue / r.rentalDays) : "–");

export function VehicleFinancialsReport() {
  const { t } = useTranslation("reports");
  const { from, to, vehicleId, category } = useReportFilters();
  const vehicleParam = vehicleId && vehicleId !== "all" ? `&vehicleId=${vehicleId}` : "";
  const chartRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<ReportTableView<VehicleFinancialRow> | null>(null);

  const { data: financials, isLoading } = useQuery<VehicleFinancialsReport>({
    queryKey: [`/api/reports/vehicle-financials?from=${from}&to=${to}${vehicleParam}`],
  });

  const activeRows = useMemo(() => (financials?.rows || []).filter((r) => r.rentals > 0 || r.expenses > 0), [financials]);
  const chartRows = useMemo(() => [...activeRows].sort((a, b) => b.revenue - a.revenue).slice(0, 10).map((r) => ({
    name: formatLicensePlate(r.licensePlate),
    revenue: r.revenue,
    expenses: r.expenses,
    margin: r.margin,
  })), [activeRows]);

  const columns = useMemo<ReportTableColumn<VehicleFinancialRow>[]>(() => [
    {
      id: "vehicle", label: t("financialTab.table.vehicle"),
      cell: (r) => (<><div className="font-medium"><EntityLink kind="vehicle" id={r.vehicleId} label={formatLicensePlate(r.licensePlate)} /></div><div className="text-xs text-gray-500">{r.brand} {r.model}</div></>),
      text: (r) => `${formatLicensePlate(r.licensePlate)} ${r.brand} ${r.model}`,
      sortValue: (r) => r.licensePlate,
    },
    { id: "rentals", label: t("financialTab.table.rentals"), cell: (r) => r.rentals, text: (r) => String(r.rentals), sortValue: (r) => r.rentals, align: "right" },
    { id: "rentalDays", label: t("financialTab.table.rentalDays"), cell: (r) => r.rentalDays, text: (r) => String(r.rentalDays), sortValue: (r) => r.rentalDays, align: "right" },
    {
      id: "revenue", label: t("financialTab.table.revenue"), align: "right", sortValue: (r) => r.revenue,
      cell: (r) => (
        <>
          {formatCurrency(r.revenue)}
          {(r.extraCosts ?? 0) > 0 && (
            <div className="text-xs text-gray-500" data-testid={`text-extra-costs-${r.vehicleId}`}>{t("financialTab.table.ofWhichExtra", { amount: formatCurrency(r.extraCosts ?? 0) })}</div>
          )}
        </>
      ),
      text: (r) => formatCurrency(r.revenue),
    },
    { id: "perDay", label: t("financialTab.table.perDay"), cell: perDayText, text: perDayText, sortValue: (r) => (r.rentalDays > 0 ? r.revenue / r.rentalDays : null), align: "right" },
    {
      id: "dailyPrice", label: t("financialTab.table.dailyPrice"), align: "right", sortValue: (r) => r.dailyPrice,
      cell: (r) => <span className="text-gray-500">{r.dailyPrice != null ? formatCurrency(r.dailyPrice) : "–"}</span>,
      text: (r) => (r.dailyPrice != null ? formatCurrency(r.dailyPrice) : "–"),
    },
    {
      id: "expenses", label: t("financialTab.table.expenses"), align: "right", sortValue: (r) => r.expenses,
      cell: (r) => (
        <span className="text-red-600" title={Object.entries(r.expensesByCategory).map(([c, a]) => `${formatExpenseCategory(c)}: ${formatCurrency(a)}`).join("\n")}>
          {formatCurrency(r.expenses)}
        </span>
      ),
      text: (r) => formatCurrency(r.expenses),
    },
    {
      id: "margin", label: t("financialTab.table.margin"), align: "right", sortValue: (r) => r.margin,
      cell: (r) => (
        <>
          <span className={r.margin >= 0 ? "font-medium text-green-600" : "font-medium text-red-600"}>{formatCurrency(r.margin)}</span>
          <span className="ml-2 text-xs text-gray-500">{marginPct(r)}</span>
        </>
      ),
      text: (r) => `${formatCurrency(r.margin)} ${marginPct(r)}`,
    },
  ], [t]);

  const tot = financials?.totals;
  const totals = tot && activeRows.length > 0 ? {
    vehicle: t("financialTab.table.total"),
    rentals: String(tot.rentals),
    rentalDays: String(tot.rentalDays),
    revenue: (tot.extraCosts ?? 0) > 0
      ? `${formatCurrency(tot.revenue)} (${t("financialTab.table.ofWhichExtra", { amount: formatCurrency(tot.extraCosts ?? 0) })})`
      : formatCurrency(tot.revenue),
    perDay: perDayText(tot),
    dailyPrice: "",
    expenses: formatCurrency(tot.expenses),
    margin: `${formatCurrency(tot.margin)} ${marginPct(tot)}`,
  } : undefined;

  const exportCsv = () => {
    if (!financials) return;
    const c = (key: string) => t(`financialTab.csv.${key}`);
    const header = ["licensePlate", "brand", "model", "rentals", "rentalDays", "revenue", "extraCosts", "perDay", "dailyPrice", "expenses", "margin", "marginPct"].map(c);
    const perDay = (r: { revenue: number; rentalDays: number }) => (r.rentalDays > 0 ? csvNumber(r.revenue / r.rentalDays) : "");
    const rows: (string | number)[][] = activeRows.map((r) => [
      formatLicensePlate(r.licensePlate), r.brand, r.model, r.rentals, r.rentalDays,
      csvNumber(r.revenue), csvNumber(r.extraCosts ?? 0), perDay(r), csvNumber(r.dailyPrice),
      csvNumber(r.expenses), csvNumber(r.margin), marginPctCsv(r),
    ]);
    const total = financials.totals;
    rows.push([
      t("financialTab.table.total"), "", "", total.rentals, total.rentalDays,
      csvNumber(total.revenue), csvNumber(total.extraCosts ?? 0), perDay(total), "",
      csvNumber(total.expenses), csvNumber(total.margin), marginPctCsv(total),
    ]);
    downloadCsv(t("financialTab.csv.subject"), header, rows);
  };

  useReportPrint([
    {
      kind: "tiles",
      tiles: [
        { label: t("financialTab.summary.revenue"), value: formatCurrency(tot?.revenue || 0) },
        { label: t("financialTab.summary.expenses"), value: formatCurrency(tot?.expenses || 0) },
        { label: t("financialTab.summary.margin"), value: `${formatCurrency(tot?.margin || 0)} (${tot ? marginPct(tot) : "–"})` },
      ],
    },
    { kind: "chart", title: t("financialTab.chart.title"), getSvg: () => chartSvgFromRef(chartRef) },
    tablePrintSection({ id: "vehicle-financials", columns, rows: activeRows, view, totals }),
  ]);

  return (
    <div className="space-y-6" data-testid="vehicle-financials-report">
      {category !== "all" && (
        <p className="text-sm text-muted-foreground" data-testid="financial-category-note">
          {t("reportsPage.filters.financialIgnoresCategory", { category: formatExpenseCategory(category) })}
        </p>
      )}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-gray-500">{t("financialTab.summary.revenue")}</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-financial-revenue">{formatCurrency(tot?.revenue || 0)}</div>
            <p className="text-xs text-gray-500">{t("financialTab.summary.rentals", { count: tot?.rentals || 0, days: tot?.rentalDays || 0 })}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-gray-500">{t("financialTab.summary.expenses")}</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold text-red-600" data-testid="text-financial-expenses">{formatCurrency(tot?.expenses || 0)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-gray-500">{t("financialTab.summary.margin")}</CardTitle></CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${(tot?.margin || 0) >= 0 ? "text-green-600" : "text-red-600"}`} data-testid="text-financial-margin">{formatCurrency(tot?.margin || 0)}</div>
            <p className="text-xs text-gray-500">{tot ? marginPct(tot) : "–"}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("financialTab.chart.title")}</CardTitle>
          <CardDescription>{t("financialTab.chart.description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div ref={chartRef} className="h-80">
            {isLoading ? (
              <p className="text-sm text-gray-500">{t("financialTab.loading")}</p>
            ) : chartRows.length === 0 ? (
              <p className="text-sm text-gray-500">{t("financialTab.noData")}</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartRows} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis tickFormatter={(value) => formatCurrency(value)} />
                  <Tooltip formatter={(value: number, key: string) => [formatCurrency(value), t(`financialTab.chart.${key}`)]} />
                  <Legend />
                  <Bar dataKey="revenue" name={t("financialTab.chart.revenue")} fill="#16a34a" />
                  <Bar dataKey="expenses" name={t("financialTab.chart.expenses")} fill="#ef4444" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </CardContent>
      </Card>

      <ReportSection
        testId="card-vehicle-financials-report"
        title={t("financialTab.table.title")}
        description={t("financialTab.table.description")}
      >
          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={exportCsv} disabled={activeRows.length === 0} data-testid="button-financial-csv">
              <Download className="mr-1 h-4 w-4" />
              {t("financialTab.csv.button")}
            </Button>
          </div>
          <ReportTable
            rows={activeRows}
            columns={columns}
            rowKey={(r) => r.vehicleId}
            totals={totals}
            testId="vehicle-financials-table"
            resetKey={`${from}|${to}|${vehicleId}`}
            onView={setView}
          />
      </ReportSection>
    </div>
  );
}
