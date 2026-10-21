/**
 * Round 2 punt 11 (Kees, 2026-10-21) — Rapporten > Voertuigen: workshop downtime.
 * Per vehicle the visits in the chosen period, the days in the workshop, how many
 * were breakdowns and the costs linked to those visits; below it the same per
 * brand and model, so models that break down often stand out.
 */
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import type { DateRange } from "react-day-picker";
import { Download } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency, formatLicensePlate } from "@/lib/format-utils";
import { downloadCsv, csvNumber } from "@/lib/csv";
import type { DowntimeModelRow, DowntimeRow } from "@shared/workshop-visit";

const ymd = (d: Date | undefined, fallback: string) => (d ? format(d, "yyyy-MM-dd") : fallback);

export function WorkshopDowntimeCard({ dateRange }: { dateRange: DateRange }) {
  const { t } = useTranslation("reports");
  const from = ymd(dateRange.from, "2000-01-01");
  const to = ymd(dateRange.to, ymd(new Date(), "2050-12-31"));
  const { data, isLoading } = useQuery<{ rows: DowntimeRow[]; byModel: DowntimeModelRow[] }>({
    queryKey: [`/api/reports/workshop-downtime?from=${from}&to=${to}`],
  });
  const rows = data?.rows ?? [];
  const byModel = data?.byModel ?? [];

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
    <Card data-testid="report-workshop-downtime">
      <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
        <div>
          <CardTitle>{t("reportsPage.downtime.title")}</CardTitle>
          <CardDescription>{t("reportsPage.downtime.description")}</CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={exportCsv} disabled={rows.length === 0} data-testid="button-export-downtime">
          <Download className="h-4 w-4 mr-1" />
          CSV
        </Button>
      </CardHeader>
      <CardContent className="space-y-6">
        {!isLoading && rows.length === 0 ? (
          <p className="text-sm text-muted-foreground" data-testid="downtime-empty">{t("reportsPage.downtime.none")}</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("reportsPage.common.licensePlate")}</TableHead>
                    <TableHead>{t("reportsPage.downtime.brandModel")}</TableHead>
                    <TableHead className="text-right">{t("reportsPage.downtime.visits")}</TableHead>
                    <TableHead className="text-right">{t("reportsPage.downtime.days")}</TableHead>
                    <TableHead className="text-right">{t("reportsPage.downtime.breakdowns")}</TableHead>
                    <TableHead className="text-right">{t("reportsPage.downtime.costs")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.vehicleId} data-testid={`downtime-row-${r.vehicleId}`}>
                      <TableCell className="font-medium">{formatLicensePlate(r.licensePlate)}</TableCell>
                      <TableCell>{[r.brand, r.model].filter(Boolean).join(" ")}</TableCell>
                      <TableCell className="text-right">{r.visits}</TableCell>
                      <TableCell className="text-right">{r.days}</TableCell>
                      <TableCell className="text-right">{r.breakdowns}</TableCell>
                      <TableCell className="text-right">{formatCurrency(r.costs)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

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
      </CardContent>
    </Card>
  );
}
