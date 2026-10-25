/**
 * Rapporten fase 5, onderdeel 13: deliveries and collections on Rapporten > Kantoor.
 * Source: the transports of type delivery and repossession (not cancelled). Needs the report
 * permission and the transports permission family, like GET /api/transports. Follows the
 * vehicle filter. "Too late" only counts what was not finished on the planned day.
 */
import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import {
  DELIVERY_REPORT_TILES,
  type DeliveryReportRow, type DeliveryReportSort, type DeliveryReportSummary, type DeliveryReportTile,
} from "@shared/reports/delivery-report";
import { UserPermission } from "@shared/schema";
import { ReportSection } from "@/components/reports/kit/report-section";
import { useReportPrint } from "@/components/reports/kit/report-print";
import { chartSvgFromRef } from "@/lib/report-document-print";
import { DrillLineButton, compactSections, drillLineTestId, textTablePrintSection } from "@/components/reports/kit/report-breakdown-table";
import { useReportRange } from "./report-filters";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ReportTiles, tilesPrintSection, type ReportTile } from "@/components/reports/kit/report-tiles";
import { ReportMonthChart } from "@/components/reports/kit/report-month-chart";
import { ReportDetailDialog, type ReportColumn, type ReportDrillTarget } from "@/components/reports/kit/report-detail-dialog";
import { useHasPermission } from "@/hooks/use-has-permission";
import { formatLicensePlate } from "@/lib/format-utils";
import { formatDateNl } from "@/lib/format-date-nl";
import { csvDate, csvNumber } from "@/lib/csv";

const ENDPOINT = "/api/reports/deliveries";

const TILE_TONE: Partial<Record<DeliveryReportTile, ReportTile<DeliveryReportTile>["tone"]>> = {
  onTime: "green",
  late: "red",
  open: "amber",
};

const n0 = (n: number) => n.toLocaleString("nl-NL", { maximumFractionDigits: 0 });
const n1 = (n: number) => n.toLocaleString("nl-NL", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export function DeliveryReportCard(props: { from?: string; to?: string; vehicleId?: string }) {
  const { from, to, vehicleId } = useReportRange(props);
  const { t } = useTranslation(["reports", "delivery"]);
  const monthChartRef = useRef<HTMLDivElement>(null);
  const allowedReports = useHasPermission(UserPermission.VIEW_REPORTS, UserPermission.MANAGE_REPORTS);
  const allowedSource = useHasPermission(
    UserPermission.VIEW_VEHICLES, UserPermission.MANAGE_VEHICLES,
    UserPermission.VIEW_RESERVATIONS, UserPermission.MANAGE_RESERVATIONS,
  );
  const allowed = allowedReports && allowedSource;
  const [openTile, setOpenTile] = useState<DeliveryReportTile | null>(null);
  const [shownTile, setShownTile] = useState<DeliveryReportTile>("all");
  // A tile alone, or narrowed to one breakdown line or one month.
  const [narrow, setNarrow] = useState<{ drill?: ReportDrillTarget; month?: string }>({});
  const open = (tile: DeliveryReportTile, by: { drill?: ReportDrillTarget; month?: string } = {}) => {
    setShownTile(tile);
    setNarrow(by);
    setOpenTile(tile);
  };

  const params = useMemo<Record<string, string>>(
    () => ({
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
      ...(vehicleId && vehicleId !== "all" ? { vehicleId } : {}),
    }),
    [from, to, vehicleId],
  );
  const { data, isLoading, isError } = useQuery<DeliveryReportSummary>({
    queryKey: [`${ENDPOINT}/summary`, params],
    enabled: allowed,
  });

  const tileLabel = (id: string) => t(`reports:officeReports.delivery.tiles.${id}`);
  const typeLabel = (type: string) => t(`delivery:transportDialog.typeLabels.${type}`, { defaultValue: type });
  const statusLabel = (status: string) => t(`reports:moneyReports.transport.statuses.${status}`, { defaultValue: status });
  const punctualityLabel = (p: string) => t(`reports:officeReports.delivery.punctuality.${p}`, { defaultValue: p });

  const columns = useMemo<Array<ReportColumn<DeliveryReportRow, DeliveryReportSort>>>(() => {
    const label = (id: string) => t(`reports:officeReports.delivery.columns.${id}`);
    const day = (v: string | null) => (v ? formatDateNl(v, "short") : "");
    const plate = (r: DeliveryReportRow) => {
      if (!r.licensePlate) return "";
      const base = formatLicensePlate(r.licensePlate);
      return r.isExternalVehicle ? `${base} (${t("reports:officeReports.delivery.external")})` : base;
    };
    return [
      { id: "scheduledDate", label: label("scheduledDate"), sortKey: "scheduledDate", cell: (r) => day(r.scheduledDate), csv: (r) => csvDate(r.scheduledDate) },
      { id: "completedDate", label: label("completedDate"), sortKey: "completedDate", cell: (r) => day(r.completedDate), csv: (r) => csvDate(r.completedDate) },
      { id: "type", label: label("type"), sortKey: "transportType", cell: (r) => typeLabel(r.transportType), csv: (r) => typeLabel(r.transportType) },
      { id: "status", label: label("status"), cell: (r) => statusLabel(r.status), csv: (r) => statusLabel(r.status) },
      { id: "licensePlate", label: label("licensePlate"), cell: (r) => plate(r), csv: (r) => plate(r) },
      { id: "customer", label: label("customer"), cell: (r) => r.customerName ?? "", csv: (r) => r.customerName ?? "" },
      { id: "driver", label: label("driver"), sortKey: "driver", cell: (r) => r.driverName ?? "", csv: (r) => r.driverName ?? "" },
      {
        id: "distanceKm", label: label("distanceKm"), sortKey: "distanceKm", align: "right",
        cell: (r) => (r.distanceKm === null ? "" : n1(r.distanceKm)),
        csv: (r) => (r.distanceKm === null ? "" : csvNumber(r.distanceKm, 1)),
      },
      {
        id: "daysLate", label: label("daysLate"), sortKey: "daysLate", align: "right",
        cell: (r) => (r.daysLate === null ? "" : n0(r.daysLate)),
        csv: (r) => (r.daysLate === null ? "" : csvNumber(r.daysLate, 0)),
      },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t]);


  const tiles: Array<ReportTile<DeliveryReportTile>> = DELIVERY_REPORT_TILES.map((id) => ({
    id,
    label: tileLabel(id),
    value: n0(data?.tiles?.[id]?.count ?? 0),
    hint: t("reports:officeReports.delivery.kmHint", { km: n1(data?.tiles?.[id]?.amount ?? 0) }),
    tone: TILE_TONE[id],
  }));
  const series = [
    { key: "onTime" as const, label: punctualityLabel("onTime"), color: "#16a34a" },
    { key: "late" as const, label: punctualityLabel("late"), color: "#dc2626" },
    { key: "open" as const, label: punctualityLabel("open"), color: "#3b82f6" },
    { key: "undated" as const, label: punctualityLabel("undated"), color: "#9ca3af" },
  ];
  const col = (id: string) => t(`reports:officeReports.delivery.columns.${id}`);
  const byType = data?.byType ?? [];
  const byDriver = data?.byDriver ?? [];
  // A line counts the trips of the period: the "all" tile narrowed to it has exactly as many rows.
  const openType = (type: string) => open("all", { drill: { name: "type", key: type, label: typeLabel(type) } });
  const openDriver = (driver: string | null) =>
    open("all", { drill: { name: "driver", key: driver, label: driver ?? t("reports:officeReports.delivery.unknownDriver") } });

  useReportPrint(allowed && data ? compactSections([
    tilesPrintSection(tiles),
    { kind: "chart", title: t("reports:officeReports.delivery.byMonth"), getSvg: () => chartSvgFromRef(monthChartRef) },
    textTablePrintSection(
      "delivery-by-type",
      t("reports:officeReports.delivery.byType"),
      [col("type"), col("total"), punctualityLabel("onTime"), punctualityLabel("late"), punctualityLabel("open"), col("km")],
      byType.map((row) => [typeLabel(row.type), n0(row.total), n0(row.onTime), n0(row.late), n0(row.open), n1(row.km)]),
    ),
    textTablePrintSection(
      "delivery-by-driver",
      t("reports:officeReports.delivery.byDriver"),
      [col("driver"), col("trips"), punctualityLabel("onTime"), punctualityLabel("late"), col("km")],
      byDriver.map((row) => [row.driver ?? t("reports:officeReports.delivery.unknownDriver"), n0(row.trips), n0(row.onTime), n0(row.late), n1(row.km)]),
    ),
  ]) : null);

  if (!allowed) return null;

  return (
    <ReportSection testId="card-delivery-report" title={t("reports:officeReports.delivery.title")} description={t("reports:officeReports.delivery.description")}>
        {isLoading ? (
          <p className="text-sm text-muted-foreground" data-testid="delivery-loading">{t("reports:reportKit.loading")}</p>
        ) : isError || !data ? (
          <p className="text-sm text-destructive" data-testid="delivery-error">{t("reports:reportKit.loadFailed")}</p>
        ) : (
          <>
            <ReportTiles
              tiles={tiles}
              testIdPrefix="delivery"
              onOpen={(id) => open(id)}
            />
            <div className="flex flex-wrap gap-x-8 gap-y-1 text-sm">
              <p data-testid="delivery-on-time-pct">
                <span className="text-muted-foreground">{t("reports:officeReports.delivery.onTimePct")}: </span>
                <span className="font-medium">
                  {data.onTimePct === null || data.onTimePct === undefined
                    ? t("reports:officeReports.delivery.none")
                    : t("reports:officeReports.delivery.pctValue", { pct: data.onTimePct.toLocaleString("nl-NL", { maximumFractionDigits: 1 }) })}
                </span>
              </p>
              <p data-testid="delivery-avg-km">
                <span className="text-muted-foreground">{t("reports:officeReports.delivery.avgKm")}: </span>
                <span className="font-medium">
                  {data.avgKmPerTrip === null || data.avgKmPerTrip === undefined
                    ? t("reports:officeReports.delivery.none")
                    : t("reports:officeReports.delivery.avgKmValue", { km: n1(data.avgKmPerTrip) })}
                </span>
              </p>
            </div>
            <div className="space-y-2">
              <h4 className="text-sm font-medium">{t("reports:officeReports.delivery.byMonth")}</h4>
              <ReportMonthChart data={data.byMonth ?? []} series={series} stacked testId="delivery-month-chart" chartRef={monthChartRef} onPointClick={(p) => open(p.series, { month: p.month })} />
            </div>
            <div className="space-y-2" data-testid="delivery-by-type">
              <h4 className="text-sm font-medium">{t("reports:officeReports.delivery.byType")}</h4>
              {byType.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("reports:reportKit.noData")}</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{col("type")}</TableHead>
                      <TableHead className="text-right">{col("total")}</TableHead>
                      <TableHead className="text-right">{punctualityLabel("onTime")}</TableHead>
                      <TableHead className="text-right">{punctualityLabel("late")}</TableHead>
                      <TableHead className="text-right">{punctualityLabel("open")}</TableHead>
                      <TableHead className="text-right">{col("km")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {byType.map((row) => (
                      <TableRow key={row.type} data-testid="delivery-by-type-row" className="cursor-pointer" onClick={() => openType(row.type)}>
                        <TableCell>
                          <DrillLineButton onClick={() => openType(row.type)} testId={drillLineTestId("delivery-by-type", row.type)}>{typeLabel(row.type)}</DrillLineButton>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{n0(row.total)}</TableCell>
                        <TableCell className="text-right tabular-nums">{n0(row.onTime)}</TableCell>
                        <TableCell className="text-right tabular-nums">{n0(row.late)}</TableCell>
                        <TableCell className="text-right tabular-nums">{n0(row.open)}</TableCell>
                        <TableCell className="text-right tabular-nums">{n1(row.km)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
            <div className="space-y-2" data-testid="delivery-by-driver">
              <h4 className="text-sm font-medium">{t("reports:officeReports.delivery.byDriver")}</h4>
              {byDriver.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("reports:reportKit.noData")}</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{col("driver")}</TableHead>
                      <TableHead className="text-right">{col("trips")}</TableHead>
                      <TableHead className="text-right">{punctualityLabel("onTime")}</TableHead>
                      <TableHead className="text-right">{punctualityLabel("late")}</TableHead>
                      <TableHead className="text-right">{col("km")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {byDriver.map((row) => (
                      <TableRow key={row.driver ?? "unknown"} data-testid="delivery-by-driver-row" className="cursor-pointer" onClick={() => openDriver(row.driver)}>
                        <TableCell className={row.driver === null ? "italic text-muted-foreground" : undefined}>
                          <DrillLineButton onClick={() => openDriver(row.driver)} testId={drillLineTestId("delivery-by-driver", row.driver)}>
                            {row.driver ?? t("reports:officeReports.delivery.unknownDriver")}
                          </DrillLineButton>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{n0(row.trips)}</TableCell>
                        <TableCell className="text-right tabular-nums">{n0(row.onTime)}</TableCell>
                        <TableCell className="text-right tabular-nums">{n0(row.late)}</TableCell>
                        <TableCell className="text-right tabular-nums">{n1(row.km)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </>
        )}
      <ReportDetailDialog<DeliveryReportRow, DeliveryReportSort>
        open={openTile !== null}
        onOpenChange={(o) => { if (!o) setOpenTile(null); }}
        title={tileLabel(shownTile)}
        description={t("reports:officeReports.delivery.title")}
        endpoint={ENDPOINT}
        params={params}
        tile={shownTile}
        drill={narrow.drill}
        month={narrow.month}
        columns={columns}
        defaultSort={{ key: "scheduledDate", dir: shownTile === "open" ? "asc" : "desc" }}
        rowKey={(r) => r.id}
        csvSubject={t("reports:officeReports.delivery.csvSubject")}
        reportName="deliveries"
        testId="delivery-report"
      />
    </ReportSection>
  );
}
