import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import type { DateRange } from "react-day-picker";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency, formatLicensePlate, formatExpenseCategory } from "@/lib/format-utils";
import { downloadCsv, csvNumber } from "@/lib/csv";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { FinesReportCard } from "./fines-report-card";
import { ExtraCostsReportCard } from "./extra-costs-report-card";
import { TransportBillingReportCard } from "./transport-billing-report-card";

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

interface FinancialTabProps {
  dateRange: DateRange;
  /** "all" or a vehicle id as string (same contract as the other report tabs) */
  selectedVehicle: string;
}

const ymd = (d: Date | undefined, fallback: string) => (d ? format(d, "yyyy-MM-dd") : fallback);

export function FinancialTab({ dateRange, selectedVehicle }: FinancialTabProps) {
  const { t } = useTranslation("reports");
  const from = ymd(dateRange.from, "2000-01-01");
  const to = ymd(dateRange.to, "2050-12-31");
  const vehicleParam = selectedVehicle && selectedVehicle !== "all" ? `&vehicleId=${selectedVehicle}` : "";

  const { data: financials, isLoading: loadingFinancials } = useQuery<VehicleFinancialsReport>({
    queryKey: [`/api/reports/vehicle-financials?from=${from}&to=${to}${vehicleParam}`],
  });

  const activeRows = useMemo(() => (financials?.rows || []).filter(r => r.rentals > 0 || r.expenses > 0), [financials]);
  const chartRows = useMemo(() => activeRows.slice(0, 15).map(r => ({
    name: formatLicensePlate(r.licensePlate),
    revenue: r.revenue,
    expenses: r.expenses,
    margin: r.margin,
  })), [activeRows]);

  const marginPct = (row: { revenue: number; margin: number }) =>
    row.revenue > 0 ? `${Math.round((row.margin / row.revenue) * 100)}%` : "–";

  const marginPctCsv = (row: { revenue: number; margin: number }) =>
    row.revenue > 0 ? String(Math.round((row.margin / row.revenue) * 100)) : "";

  const exportCsv = () => {
    if (!financials) return;
    const c = (key: string) => t(`financialTab.csv.${key}`);
    const header = ["licensePlate", "brand", "model", "rentals", "rentalDays", "revenue", "extraCosts", "perDay", "dailyPrice", "expenses", "margin", "marginPct"].map(c);
    const perDay = (r: { revenue: number; rentalDays: number }) => (r.rentalDays > 0 ? csvNumber(r.revenue / r.rentalDays) : "");
    const rows = activeRows.map(r => [
      formatLicensePlate(r.licensePlate), r.brand, r.model, r.rentals, r.rentalDays,
      csvNumber(r.revenue), csvNumber(r.extraCosts ?? 0), perDay(r), csvNumber(r.dailyPrice),
      csvNumber(r.expenses), csvNumber(r.margin), marginPctCsv(r),
    ]);
    const tot = financials.totals;
    rows.push([
      t('financialTab.table.total'), "", "", tot.rentals, tot.rentalDays,
      csvNumber(tot.revenue), csvNumber(tot.extraCosts ?? 0), perDay(tot), "",
      csvNumber(tot.expenses), csvNumber(tot.margin), marginPctCsv(tot),
    ]);
    downloadCsv(t('financialTab.csv.subject'), header, rows);
  };

  return (
    <div className="space-y-6" data-testid="financial-tab">
      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-gray-500">{t('financialTab.summary.revenue')}</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold" data-testid="text-financial-revenue">{formatCurrency(financials?.totals.revenue || 0)}</div>
            <p className="text-xs text-gray-500">{t('financialTab.summary.rentals', { count: financials?.totals.rentals || 0, days: financials?.totals.rentalDays || 0 })}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-gray-500">{t('financialTab.summary.expenses')}</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold text-red-600" data-testid="text-financial-expenses">{formatCurrency(financials?.totals.expenses || 0)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-gray-500">{t('financialTab.summary.margin')}</CardTitle></CardHeader>
          <CardContent><div className={`text-2xl font-bold ${(financials?.totals.margin || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`} data-testid="text-financial-margin">{formatCurrency(financials?.totals.margin || 0)}</div>
            <p className="text-xs text-gray-500">{financials ? marginPct(financials.totals) : "–"}</p></CardContent>
        </Card>
      </div>

      {/* Revenue vs expenses chart */}
      <Card>
        <CardHeader>
          <CardTitle>{t('financialTab.chart.title')}</CardTitle>
          <CardDescription>{t('financialTab.chart.description')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-80">
            {loadingFinancials ? (
              <p className="text-sm text-gray-500">{t('financialTab.loading')}</p>
            ) : chartRows.length === 0 ? (
              <p className="text-sm text-gray-500">{t('financialTab.noData')}</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartRows} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis tickFormatter={(value) => formatCurrency(value)} />
                  <Tooltip formatter={(value: number, key: string) => [formatCurrency(value), t(`financialTab.chart.${key}`)]} />
                  <Legend />
                  <Bar dataKey="revenue" name={t('financialTab.chart.revenue')} fill="#16a34a" />
                  <Bar dataKey="expenses" name={t('financialTab.chart.expenses')} fill="#ef4444" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Per-vehicle table */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
          <div className="space-y-1.5">
            <CardTitle>{t('financialTab.table.title')}</CardTitle>
            <CardDescription>{t('financialTab.table.description')}</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={activeRows.length === 0} data-testid="button-financial-csv">
            <Download className="h-4 w-4 mr-1" />
            {t('financialTab.csv.button')}
          </Button>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('financialTab.table.vehicle')}</TableHead>
                  <TableHead className="text-right">{t('financialTab.table.rentals')}</TableHead>
                  <TableHead className="text-right">{t('financialTab.table.rentalDays')}</TableHead>
                  <TableHead className="text-right">{t('financialTab.table.revenue')}</TableHead>
                  <TableHead className="text-right">{t('financialTab.table.perDay')}</TableHead>
                  <TableHead className="text-right">{t('financialTab.table.dailyPrice')}</TableHead>
                  <TableHead className="text-right">{t('financialTab.table.expenses')}</TableHead>
                  <TableHead className="text-right">{t('financialTab.table.margin')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activeRows.length === 0 ? (
                  <TableRow><TableCell colSpan={8} className="text-center text-gray-500">{t('financialTab.noData')}</TableCell></TableRow>
                ) : activeRows.map(row => (
                  <TableRow key={row.vehicleId} data-testid={`row-financial-${row.vehicleId}`}>
                    <TableCell>
                      <div className="font-medium">{formatLicensePlate(row.licensePlate)}</div>
                      <div className="text-xs text-gray-500">{row.brand} {row.model}</div>
                    </TableCell>
                    <TableCell className="text-right">{row.rentals}</TableCell>
                    <TableCell className="text-right">{row.rentalDays}</TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(row.revenue)}
                      {(row.extraCosts ?? 0) > 0 && (
                        <div className="text-xs text-gray-500" data-testid={`text-extra-costs-${row.vehicleId}`}>{t('financialTab.table.ofWhichExtra', { amount: formatCurrency(row.extraCosts ?? 0) })}</div>
                      )}
                    </TableCell>
                    <TableCell className="text-right">{row.rentalDays > 0 ? formatCurrency(row.revenue / row.rentalDays) : "–"}</TableCell>
                    <TableCell className="text-right text-gray-500">{row.dailyPrice != null ? formatCurrency(row.dailyPrice) : "–"}</TableCell>
                    <TableCell className="text-right text-red-600" title={Object.entries(row.expensesByCategory).map(([c, a]) => `${formatExpenseCategory(c)}: ${formatCurrency(a)}`).join("\n")}>{formatCurrency(row.expenses)}</TableCell>
                    <TableCell className="text-right">
                      <span className={row.margin >= 0 ? "text-green-600 font-medium" : "text-red-600 font-medium"}>{formatCurrency(row.margin)}</span>
                      <span className="ml-2 text-xs text-gray-500">{marginPct(row)}</span>
                    </TableCell>
                  </TableRow>
                ))}
                {financials && activeRows.length > 0 && (
                  <TableRow className="font-semibold bg-gray-50">
                    <TableCell>{t('financialTab.table.total')}</TableCell>
                    <TableCell className="text-right">{financials.totals.rentals}</TableCell>
                    <TableCell className="text-right">{financials.totals.rentalDays}</TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(financials.totals.revenue)}
                      {(financials.totals.extraCosts ?? 0) > 0 && (
                        <div className="text-xs text-gray-500 font-normal">{t('financialTab.table.ofWhichExtra', { amount: formatCurrency(financials.totals.extraCosts ?? 0) })}</div>
                      )}
                    </TableCell>
                    <TableCell className="text-right">{financials.totals.rentalDays > 0 ? formatCurrency(financials.totals.revenue / financials.totals.rentalDays) : "–"}</TableCell>
                    <TableCell />
                    <TableCell className="text-right text-red-600">{formatCurrency(financials.totals.expenses)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(financials.totals.margin)} <span className="ml-2 text-xs text-gray-500">{marginPct(financials.totals)}</span></TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Fines (needs the fines permission; the card checks it itself) */}
      <FinesReportCard from={from} to={to} vehicleId={selectedVehicle} />

      {/* Extra km and fuel (needs a reservations permission; the card checks it itself) */}
      <ExtraCostsReportCard from={from} to={to} vehicleId={selectedVehicle} />

      {/* Transport billing (needs a vehicles or reservations permission; the card checks it itself) */}
      <TransportBillingReportCard from={from} to={to} vehicleId={selectedVehicle} />

    </div>
  );
}
