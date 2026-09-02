import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import type { DateRange } from "react-day-picker";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatLicensePlate } from "@/lib/format-utils";

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
  expenses: number;
  expensesByCategory: Record<string, number>;
  margin: number;
}
interface VehicleFinancialsReport {
  rows: VehicleFinancialRow[];
  totals: { rentals: number; rentalDays: number; revenue: number; expenses: number; margin: number };
}
interface MileagePerMonthReport {
  months: { month: string; km: number; vehicles: number }[];
  rows: { vehicleId: number; licensePlate: string; brand: string; model: string; km: number; readings: number; firstReading: string | null; lastReading: string | null; sparse: boolean }[];
  totalKm: number;
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
  const { data: mileage, isLoading: loadingMileage } = useQuery<MileagePerMonthReport>({
    queryKey: [`/api/reports/mileage-per-month?from=${from}&to=${to}${vehicleParam}`],
  });

  const activeRows = useMemo(() => (financials?.rows || []).filter(r => r.rentals > 0 || r.expenses > 0), [financials]);
  const chartRows = useMemo(() => activeRows.slice(0, 15).map(r => ({
    name: formatLicensePlate(r.licensePlate),
    revenue: r.revenue,
    expenses: r.expenses,
    margin: r.margin,
  })), [activeRows]);
  const mileageChart = useMemo(() => (mileage?.months || []).map(m => ({ name: m.month, km: m.km })), [mileage]);
  const mileageRows = useMemo(() => (mileage?.rows || []).filter(r => r.km > 0 || !r.sparse).slice(0, 50), [mileage]);

  const marginPct = (row: { revenue: number; margin: number }) =>
    row.revenue > 0 ? `${Math.round((row.margin / row.revenue) * 100)}%` : "–";

  return (
    <div className="space-y-6" data-testid="financial-tab">
      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
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
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-gray-500">{t('financialTab.summary.km')}</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold" data-testid="text-financial-km">{(mileage?.totalKm || 0).toLocaleString()} km</div>
            <p className="text-xs text-gray-500">{t('financialTab.summary.kmHint')}</p></CardContent>
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
        <CardHeader>
          <CardTitle>{t('financialTab.table.title')}</CardTitle>
          <CardDescription>{t('financialTab.table.description')}</CardDescription>
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
                    <TableCell className="text-right">{formatCurrency(row.revenue)}</TableCell>
                    <TableCell className="text-right">{row.rentalDays > 0 ? formatCurrency(row.revenue / row.rentalDays) : "–"}</TableCell>
                    <TableCell className="text-right text-gray-500">{row.dailyPrice != null ? formatCurrency(row.dailyPrice) : "–"}</TableCell>
                    <TableCell className="text-right text-red-600" title={Object.entries(row.expensesByCategory).map(([c, a]) => `${c}: ${formatCurrency(a)}`).join("\n")}>{formatCurrency(row.expenses)}</TableCell>
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
                    <TableCell className="text-right">{formatCurrency(financials.totals.revenue)}</TableCell>
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

      {/* Kilometres per month */}
      <Card>
        <CardHeader>
          <CardTitle>{t('financialTab.mileage.title')}</CardTitle>
          <CardDescription>{t('financialTab.mileage.description')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="h-64">
            {loadingMileage ? (
              <p className="text-sm text-gray-500">{t('financialTab.loading')}</p>
            ) : mileageChart.length === 0 ? (
              <p className="text-sm text-gray-500">{t('financialTab.noData')}</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={mileageChart} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis tickFormatter={(value) => `${Number(value).toLocaleString()} km`} />
                  <Tooltip formatter={(value: number) => [`${Number(value).toLocaleString()} km`, t('financialTab.mileage.km')]} />
                  <Bar dataKey="km" name={t('financialTab.mileage.km')} fill="#2563eb" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('financialTab.table.vehicle')}</TableHead>
                  <TableHead className="text-right">{t('financialTab.mileage.km')}</TableHead>
                  <TableHead className="text-right">{t('financialTab.mileage.readings')}</TableHead>
                  <TableHead>{t('financialTab.mileage.period')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mileageRows.length === 0 ? (
                  <TableRow><TableCell colSpan={4} className="text-center text-gray-500">{t('financialTab.noData')}</TableCell></TableRow>
                ) : mileageRows.map(row => (
                  <TableRow key={row.vehicleId} data-testid={`row-mileage-${row.vehicleId}`}>
                    <TableCell>
                      <div className="font-medium">{formatLicensePlate(row.licensePlate)}</div>
                      <div className="text-xs text-gray-500">{row.brand} {row.model}</div>
                    </TableCell>
                    <TableCell className="text-right">{row.km.toLocaleString()} km</TableCell>
                    <TableCell className="text-right">
                      {row.readings}
                      {row.sparse && <Badge variant="outline" className="ml-2 text-amber-700 border-amber-300">{t('financialTab.mileage.sparse')}</Badge>}
                    </TableCell>
                    <TableCell className="text-gray-500">{row.firstReading && row.lastReading ? `${row.firstReading} – ${row.lastReading}` : "–"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
