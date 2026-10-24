/**
 * Rapporten fase 2, onderdeel 1: the fines report on Rapporten > Financieel.
 * Tiles per step (new, linked, cancelled, old statuses, total), the average
 * time from receipt to linking, a stacked month chart, three top lists and the
 * rows behind a tile. Only shown to someone who may open the fines.
 */
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { FINE_REPORT_TILES, type FineReportRow, type FineReportSort, type FineReportSummary, type FineReportTile } from "@shared/reports/fines-report";
import { isLegacyFineStatus } from "@shared/fines";
import { UserPermission } from "@shared/schema";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ReportTiles, type ReportTile } from "@/components/reports/kit/report-tiles";
import { ReportMonthChart } from "@/components/reports/kit/report-month-chart";
import { ReportBreakdownTable } from "@/components/reports/kit/report-breakdown-table";
import { ReportDetailDialog, type ReportColumn } from "@/components/reports/kit/report-detail-dialog";
import { useHasPermission } from "@/hooks/use-has-permission";
import { formatCurrency, formatLicensePlate } from "@/lib/format-utils";
import { formatDateNl } from "@/lib/format-date-nl";
import { csvDate, csvDateTime, csvNumber } from "@/lib/csv";

const ENDPOINT = "/api/reports/fines";

const TILE_TONE: Partial<Record<FineReportTile, ReportTile<FineReportTile>["tone"]>> = {
  new: "amber",
  linked: "green",
};

export function FinesReportCard({ from, to, vehicleId }: { from: string; to: string; vehicleId?: string }) {
  const { t } = useTranslation("reports");
  const allowed = useHasPermission(UserPermission.VIEW_FINES, UserPermission.MANAGE_FINES);
  const [openTile, setOpenTile] = useState<FineReportTile | null>(null);
  const [shownTile, setShownTile] = useState<FineReportTile>("total");

  const params = useMemo<Record<string, string>>(
    () => ({ from, to, ...(vehicleId && vehicleId !== "all" ? { vehicleId } : {}) }),
    [from, to, vehicleId],
  );
  const { data, isLoading, isError } = useQuery<FineReportSummary>({
    queryKey: [`${ENDPOINT}/summary`, params],
    enabled: allowed,
  });

  const columns = useMemo<Array<ReportColumn<FineReportRow, FineReportSort>>>(() => {
    const status = (s: string) => t(`moneyReports.fines.statuses.${s}`, { defaultValue: s });
    const day = (v: string | null) => (v ? formatDateNl(v, "short") : "");
    return [
      { id: "offenceAt", label: t("moneyReports.fines.columns.offenceAt"), sortKey: "offenceAt", cell: (r) => day(r.offenceAt), csv: (r) => csvDateTime(r.offenceAt) },
      { id: "receivedAt", label: t("moneyReports.fines.columns.receivedAt"), cell: (r) => day(r.receivedAt), csv: (r) => csvDate(r.receivedAt) },
      { id: "licensePlate", label: t("moneyReports.fines.columns.licensePlate"), sortKey: "licensePlate", cell: (r) => formatLicensePlate(r.licensePlate), csv: (r) => formatLicensePlate(r.licensePlate) },
      { id: "description", label: t("moneyReports.fines.columns.description"), cell: (r) => r.description, csv: (r) => r.description },
      { id: "reference", label: t("moneyReports.fines.columns.reference"), cell: (r) => r.reference ?? "", csv: (r) => r.reference ?? "" },
      {
        id: "status", label: t("moneyReports.fines.columns.status"), sortKey: "status",
        cell: (r) => (
          <span className="inline-flex items-center gap-2">
            {status(r.status)}
            {isLegacyFineStatus(r.status) && <Badge variant="outline" className="text-amber-700 border-amber-300">{t("moneyReports.fines.legacyBadge")}</Badge>}
          </span>
        ),
        csv: (r) => status(r.status),
      },
      { id: "amount", label: t("moneyReports.fines.columns.amount"), sortKey: "amount", align: "right", cell: (r) => formatCurrency(r.amount), csv: (r) => csvNumber(r.amount), print: (r) => formatCurrency(r.amount) },
      { id: "customer", label: t("moneyReports.fines.columns.customer"), sortKey: "customer", cell: (r) => r.customerName ?? "", csv: (r) => r.customerName ?? "" },
      { id: "driver", label: t("moneyReports.fines.columns.driver"), cell: (r) => r.driverName ?? "", csv: (r) => r.driverName ?? "" },
    ];
  }, [t]);

  if (!allowed) return null;

  const tiles: Array<ReportTile<FineReportTile>> = FINE_REPORT_TILES.map((id) => {
    const total = data?.tiles[id];
    const count = (total?.count ?? 0).toLocaleString("nl-NL");
    const amount = formatCurrency(total?.amount ?? 0);
    return {
      id,
      label: t(`moneyReports.fines.tiles.${id}`),
      value: id === "total" ? amount : count,
      hint: id === "total" ? t("reportKit.rowsCount", { count: total?.count ?? 0 }) : amount,
      tone: TILE_TONE[id],
    };
  });

  const series = (["new", "linked", "legacy", "cancelled"] as const).map((key) => ({
    key,
    label: t(`moneyReports.fines.tiles.${key}`),
    color: { new: "#f59e0b", linked: "#16a34a", legacy: "#6b7280", cancelled: "#ef4444" }[key],
  }));
  const notLinked = t("moneyReports.fines.notLinked");

  return (
    <Card data-testid="card-fines-report">
      <CardHeader>
        <CardTitle>{t("moneyReports.fines.title")}</CardTitle>
        <CardDescription>{t("moneyReports.fines.description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {isLoading ? (
          <p className="text-sm text-muted-foreground" data-testid="fines-report-loading">{t("reportKit.loading")}</p>
        ) : isError || !data ? (
          <p className="text-sm text-destructive" data-testid="fines-report-error">{t("reportKit.loadFailed")}</p>
        ) : (
          <>
            <ReportTiles
              tiles={tiles}
              testIdPrefix="fines"
              onOpen={(id) => { setShownTile(id); setOpenTile(id); }}
            />
            <p className="text-sm text-muted-foreground" data-testid="fines-avg-days">
              {data.avgDaysToLink === null
                ? t("moneyReports.fines.avgDaysToLinkNone")
                : t("moneyReports.fines.avgDaysToLink", { days: data.avgDaysToLink.toLocaleString("nl-NL") })}
            </p>
            <div className="space-y-2">
              <h4 className="text-sm font-medium">{t("moneyReports.fines.byMonth")}</h4>
              <ReportMonthChart data={data.byMonth as unknown as Array<{ month: string } & Record<string, number>>} series={series} money stacked testId="fines-month-chart" />
            </div>
            <div className="grid gap-6 lg:grid-cols-3">
              <ReportBreakdownTable title={t("moneyReports.fines.byCustomer")} rows={data.byCustomer} nullLabel={notLinked} money testId="fines-by-customer" />
              <ReportBreakdownTable title={t("moneyReports.fines.byVehicle")} rows={data.byVehicle} nullLabel={notLinked} money testId="fines-by-vehicle" />
              <ReportBreakdownTable title={t("moneyReports.fines.byDriver")} rows={data.byDriver} nullLabel={notLinked} money testId="fines-by-driver" />
            </div>
          </>
        )}
      </CardContent>
      <ReportDetailDialog<FineReportRow, FineReportSort>
        open={openTile !== null}
        onOpenChange={(o) => { if (!o) setOpenTile(null); }}
        title={t(`moneyReports.fines.tiles.${shownTile}`)}
        description={t("moneyReports.fines.title")}
        endpoint={ENDPOINT}
        params={params}
        tile={shownTile}
        columns={columns}
        defaultSort={{ key: "offenceAt", dir: "desc" }}
        rowKey={(r) => r.id}
        csvSubject={t("moneyReports.fines.csvSubject")}
        reportName="fines"
        testId="fines-report"
      />
    </Card>
  );
}
