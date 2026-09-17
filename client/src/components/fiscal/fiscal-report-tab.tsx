import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { USAGE_PERIOD_DERIVATION_START } from "@shared/fiscal-types";
import { dateLabelNl, formatEuro, monthLabelNl } from "@shared/fiscal-format";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import type { FiscalReport } from "./types";

interface CustomerOption {
  id: number;
  name: string;
}

/** The years the report can show: from the first year periods are derived up to next year. */
function reportYears(): number[] {
  const first = Number(USAGE_PERIOD_DERIVATION_START.slice(0, 4));
  const last = Math.max(first, new Date().getFullYear()) + 1;
  const years: number[] = [];
  for (let y = first; y <= last; y++) years.push(y);
  return years;
}

function reportUrl(year: number, customerId: number | null, csv: boolean): string {
  const params = new URLSearchParams({ year: String(year) });
  if (customerId !== null) params.set("customerId", String(customerId));
  return `/api/fiscal/reports/monthly${csv ? ".csv" : ""}?${params.toString()}`;
}

/** The "Fiscaal" tab of the reports page: the year per customer, car and calendar month, with a CSV export (stap 6). */
export function FiscalReportTab() {
  const { t } = useTranslation("fiscal");
  const years = reportYears();
  const [year, setYear] = useState<number>(years.includes(new Date().getFullYear()) ? new Date().getFullYear() : years[0]);
  const [customerId, setCustomerId] = useState<number | null>(null);
  const { data: customers = [] } = useQuery<CustomerOption[]>({ queryKey: ["/api/customers"] });
  const { data: report, isLoading, error } = useQuery<FiscalReport>({ queryKey: [reportUrl(year, customerId, false)] });

  const stateTone: Record<string, string> = { final: "bg-emerald-100 text-emerald-900", settled: "bg-slate-100 text-slate-800", provisional: "bg-amber-100 text-amber-900" };

  return (
    <div className="space-y-4" data-testid="fiscal-report-tab">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{t("report.title")}</CardTitle>
          <CardDescription>{t("report.intro")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground" htmlFor="fiscal-report-year">{t("report.year")}</label>
            <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
              <SelectTrigger id="fiscal-report-year" className="w-28" data-testid="fiscal-report-year"><SelectValue /></SelectTrigger>
              <SelectContent>
                {years.map((y) => (
                  <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground" htmlFor="fiscal-report-customer">{t("report.customer")}</label>
            <Select value={customerId === null ? "all" : String(customerId)} onValueChange={(v) => setCustomerId(v === "all" ? null : Number(v))}>
              <SelectTrigger id="fiscal-report-customer" className="w-64" data-testid="fiscal-report-customer"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("report.allCustomers")}</SelectItem>
                {customers.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button asChild variant="outline" size="sm">
            <a href={reportUrl(year, customerId, true)} data-testid="fiscal-report-csv">
              <Download className="mr-2 h-4 w-4" />
              {t("report.csv")}
            </a>
          </Button>
        </CardContent>
      </Card>

      {isLoading && <p className="text-sm text-muted-foreground">{t("common.loading")}</p>}
      {error && <p className="text-sm text-destructive">{t("common.error", { message: (error as Error).message })}</p>}

      {report && (
        <>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{t("report.totals.title", { year: report.year })}</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm md:grid-cols-3" data-testid="fiscal-report-totals">
                <dt className="text-muted-foreground">{t("report.totals.amount")}</dt>
                <dd className="font-semibold" data-testid="fiscal-report-total">{report.totals.amount ? formatEuro(report.totals.amount) : "—"}</dd>
                <dt className="text-muted-foreground">{t("report.totals.settled")}</dt>
                <dd>{report.totals.settled ? formatEuro(report.totals.settled) : "—"}</dd>
                <dt className="text-muted-foreground">{t("report.totals.provisional")}</dt>
                <dd>{report.totals.provisional ? formatEuro(report.totals.provisional) : "—"}</dd>
                <dt className="text-muted-foreground">{t("report.totals.chargedMonths")}</dt>
                <dd>{report.totals.chargedMonths}</dd>
                <dt className="text-muted-foreground">{t("report.totals.periods")}</dt>
                <dd>{report.totals.periods}</dd>
                <dt className="text-muted-foreground">{t("report.totals.unassessed")}</dt>
                <dd data-testid="fiscal-report-unassessed">{report.totals.unassessedPeriods}</dd>
              </dl>
            </CardContent>
          </Card>

          {customerId === null && report.byCustomer.length > 1 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{t("report.byCustomer")}</CardTitle>
              </CardHeader>
              <CardContent>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-muted-foreground">
                      <th className="py-1 pr-2 font-normal">{t("report.columns.customer")}</th>
                      <th className="py-1 pr-2 font-normal">{t("report.totals.periods")}</th>
                      <th className="py-1 pr-2 font-normal">{t("report.totals.chargedMonths")}</th>
                      <th className="py-1 pr-2 font-normal">{t("report.totals.settled")}</th>
                      <th className="py-1 pr-2 font-normal">{t("report.totals.provisional")}</th>
                      <th className="py-1 font-normal">{t("report.totals.amount")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.byCustomer.map((c) => (
                      <tr key={c.customerId} className="border-t" data-testid={`fiscal-report-customer-${c.customerId}`}>
                        <td className="py-1 pr-2">{c.customerName}</td>
                        <td className="py-1 pr-2">{c.periods}</td>
                        <td className="py-1 pr-2">{c.chargedMonths}</td>
                        <td className="py-1 pr-2">{c.settled ? formatEuro(c.settled) : "—"}</td>
                        <td className="py-1 pr-2">{c.provisional ? formatEuro(c.provisional) : "—"}</td>
                        <td className="py-1 font-medium">{c.amount ? formatEuro(c.amount) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardContent className="pt-4">
              {report.rows.length === 0 && <p className="text-sm text-muted-foreground">{t("report.empty")}</p>}
              {report.rows.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm" data-testid="fiscal-report-rows">
                    <thead>
                      <tr className="text-left text-muted-foreground">
                        <th className="py-1 pr-2 font-normal">{t("report.columns.customer")}</th>
                        <th className="py-1 pr-2 font-normal">{t("report.columns.plate")}</th>
                        <th className="py-1 pr-2 font-normal">{t("report.columns.period")}</th>
                        <th className="py-1 pr-2 font-normal">{t("report.columns.month")}</th>
                        <th className="py-1 pr-2 font-normal">{t("report.columns.days")}</th>
                        <th className="py-1 pr-2 font-normal">{t("report.columns.reason")}</th>
                        <th className="py-1 pr-2 font-normal">{t("report.columns.amount")}</th>
                        <th className="py-1 pr-2 font-normal">{t("report.columns.state")}</th>
                        <th className="py-1 font-normal">{t("report.columns.status")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.rows.map((r) => (
                        <tr key={`${r.usagePeriodId}-${r.month}`} className="border-t" data-testid={`fiscal-report-row-${r.usagePeriodId}-${r.month}`}>
                          <td className="py-1 pr-2">{r.customerName}</td>
                          <td className="py-1 pr-2 font-mono">{r.licensePlate ?? "—"}</td>
                          <td className="py-1 pr-2 whitespace-nowrap">
                            {dateLabelNl(r.periodStart)} t/m {r.periodEnd ? dateLabelNl(r.periodEnd) : t("report.open")}
                            <a href={`/api/fiscal/assessments/${r.assessmentId}/pdf`} target="_blank" rel="noreferrer" className="ml-2 text-xs underline">{t("report.pdf")}</a>
                          </td>
                          <td className="py-1 pr-2 whitespace-nowrap">{monthLabelNl(r.month)}</td>
                          <td className="py-1 pr-2">{r.days}</td>
                          <td className="py-1 pr-2">{r.reasonLabel}</td>
                          <td className="py-1 pr-2 whitespace-nowrap">{r.amount ? formatEuro(r.amount) : "—"}</td>
                          <td className="py-1 pr-2"><span className={`rounded px-1.5 py-0.5 text-xs ${stateTone[r.state]}`}>{t(`report.state.${r.state}`)}</span></td>
                          <td className="py-1">{r.statusLabel}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
          <p className="text-xs text-muted-foreground">{t("common.disclaimer")}</p>
        </>
      )}
    </div>
  );
}
