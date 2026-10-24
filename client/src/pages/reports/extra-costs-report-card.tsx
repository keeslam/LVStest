/**
 * Rapporten fase 2, onderdeel 2: the extra km and fuel report on Rapporten >
 * Financieel. Tiles (extra km costs, fuel costs, rentals with extra km), the
 * total of extra km driven, a stacked month chart, two top lists and the rows
 * behind a tile. Needs only the report permission, like the Financieel tab.
 */
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import {
  EXTRA_COSTS_TILES,
  type ExtraCostsRow,
  type ExtraCostsSort,
  type ExtraCostsSummary,
  type ExtraCostsTile,
} from "@shared/reports/extra-costs-report";
import { UserPermission } from "@shared/schema";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ReportTiles, type ReportTile } from "@/components/reports/kit/report-tiles";
import { ReportMonthChart } from "@/components/reports/kit/report-month-chart";
import { ReportBreakdownTable } from "@/components/reports/kit/report-breakdown-table";
import { ReportDetailDialog, type ReportColumn } from "@/components/reports/kit/report-detail-dialog";
import { useHasPermission } from "@/hooks/use-has-permission";
import { formatCurrency, formatLicensePlate } from "@/lib/format-utils";
import { formatDateNl } from "@/lib/format-date-nl";
import { csvDate, csvNumber } from "@/lib/csv";

const ENDPOINT = "/api/reports/extra-costs";

export function ExtraCostsReportCard({ from, to, vehicleId }: { from: string; to: string; vehicleId?: string }) {
  const { t } = useTranslation("reports");
  const allowed = useHasPermission(UserPermission.VIEW_REPORTS, UserPermission.MANAGE_REPORTS);
  const [openTile, setOpenTile] = useState<ExtraCostsTile | null>(null);
  const [shownTile, setShownTile] = useState<ExtraCostsTile>("extraKm");

  const params = useMemo<Record<string, string>>(
    () => ({ from, to, ...(vehicleId && vehicleId !== "all" ? { vehicleId } : {}) }),
    [from, to, vehicleId],
  );
  const { data, isLoading, isError } = useQuery<ExtraCostsSummary>({
    queryKey: [`${ENDPOINT}/summary`, params],
    enabled: allowed,
  });

  const columns = useMemo<Array<ReportColumn<ExtraCostsRow, ExtraCostsSort>>>(() => {
    const day = (v: string | null) => (v ? formatDateNl(v, "short") : "");
    const km = (v: number | null) => (v === null ? "" : v.toLocaleString("nl-NL"));
    const euro = (v: number | null) => (v === null ? "" : formatCurrency(v));
    const c = (key: string) => t(`moneyReports.extraCosts.columns.${key}`);
    return [
      { id: "reservation", label: c("reservation"), cell: (r) => `#${r.reservationId}`, csv: (r) => r.reservationId },
      { id: "startDate", label: c("startDate"), sortKey: "startDate", cell: (r) => day(r.startDate), csv: (r) => csvDate(r.startDate) },
      { id: "returnDate", label: c("returnDate"), cell: (r) => day(r.returnDate), csv: (r) => csvDate(r.returnDate) },
      { id: "licensePlate", label: c("licensePlate"), sortKey: "licensePlate", cell: (r) => formatLicensePlate(r.licensePlate), csv: (r) => formatLicensePlate(r.licensePlate) },
      { id: "customer", label: c("customer"), sortKey: "customer", cell: (r) => r.customerName ?? "", csv: (r) => r.customerName ?? "" },
      { id: "extraKm", label: c("extraKm"), sortKey: "extraKm", align: "right", cell: (r) => km(r.extraKm), csv: (r) => csvNumber(r.extraKm) },
      { id: "extraKmCost", label: c("extraKmCost"), sortKey: shownTile === "fuel" ? undefined : "amount", align: "right", cell: (r) => euro(r.extraKmCost), csv: (r) => csvNumber(r.extraKmCost), print: (r) => euro(r.extraKmCost) },
      { id: "fuelCost", label: c("fuelCost"), sortKey: "fuelCost", align: "right", cell: (r) => euro(r.fuelCost), csv: (r) => csvNumber(r.fuelCost), print: (r) => euro(r.fuelCost) },
    ];
  }, [t, shownTile]);

  if (!allowed) return null;

  const tiles: Array<ReportTile<ExtraCostsTile>> = EXTRA_COSTS_TILES.map((id) => {
    const total = data?.tiles[id];
    return {
      id,
      label: t(`moneyReports.extraCosts.tiles.${id}`),
      value: (total?.count ?? 0).toLocaleString("nl-NL"),
      hint: formatCurrency(total?.amount ?? 0),
      tone: id === "fuel" ? "amber" : undefined,
    };
  });

  const series = [
    { key: "extraKmCost", label: t("moneyReports.extraCosts.tiles.extraKm"), color: "#2563eb" },
    { key: "fuelCost", label: t("moneyReports.extraCosts.tiles.fuel"), color: "#f59e0b" },
  ];

  return (
    <Card data-testid="card-extra-costs-report">
      <CardHeader>
        <CardTitle>{t("moneyReports.extraCosts.title")}</CardTitle>
        <CardDescription>{t("moneyReports.extraCosts.description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {isLoading ? (
          <p className="text-sm text-muted-foreground" data-testid="extra-costs-report-loading">{t("reportKit.loading")}</p>
        ) : isError || !data ? (
          <p className="text-sm text-destructive" data-testid="extra-costs-report-error">{t("reportKit.loadFailed")}</p>
        ) : (
          <>
            <ReportTiles
              tiles={tiles}
              testIdPrefix="extra-costs"
              onOpen={(id) => { setShownTile(id); setOpenTile(id); }}
            />
            <p className="text-sm text-muted-foreground" data-testid="extra-costs-total-km">
              {t("moneyReports.extraCosts.totalExtraKm", { km: data.totalExtraKm.toLocaleString("nl-NL") })}
            </p>
            <div className="space-y-2">
              <h4 className="text-sm font-medium">{t("moneyReports.extraCosts.byMonth")}</h4>
              <ReportMonthChart data={data.byMonth as unknown as Array<{ month: string } & Record<string, number>>} series={series} money stacked testId="extra-costs-month-chart" />
            </div>
            <div className="grid gap-6 lg:grid-cols-2">
              <ReportBreakdownTable title={t("moneyReports.extraCosts.byCustomer")} rows={data.byCustomer} nullLabel={t("moneyReports.extraCosts.noCustomer")} money testId="extra-costs-by-customer" />
              <ReportBreakdownTable title={t("moneyReports.extraCosts.byVehicle")} rows={data.byVehicle} nullLabel={t("moneyReports.extraCosts.noCustomer")} money testId="extra-costs-by-vehicle" />
            </div>
          </>
        )}
      </CardContent>
      <ReportDetailDialog<ExtraCostsRow, ExtraCostsSort>
        open={openTile !== null}
        onOpenChange={(o) => { if (!o) setOpenTile(null); }}
        title={t(`moneyReports.extraCosts.tiles.${shownTile}`)}
        description={t("moneyReports.extraCosts.title")}
        endpoint={ENDPOINT}
        params={params}
        tile={shownTile}
        columns={columns}
        defaultSort={{ key: "startDate", dir: "desc" }}
        rowKey={(r) => r.reservationId}
        csvSubject={t("moneyReports.extraCosts.csvSubject")}
        reportName="extra-costs"
        testId="extra-costs-report"
      />
    </Card>
  );
}
