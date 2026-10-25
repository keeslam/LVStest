/**
 * Rapporten fase 4, onderdeel 11: the waitlist report on Rapporten > Portaal.
 * Tiles per state, the average waiting time, a stacked month chart and a table per wanted
 * vehicle type (which type is missing). Needs the report permission AND the portal
 * permission; ignores the page's vehicle filter. Nothing in the app writes the waitlist yet,
 * so an all-zero summary shows an empty-state message instead of chart and table.
 */
import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  WAITLIST_REPORT_TILES,
  type WaitlistReportRow, type WaitlistReportSort, type WaitlistReportSummary, type WaitlistReportTile,
} from "@shared/reports/waitlist-report";
import { UserPermission } from "@shared/schema";
import { ReportSection } from "@/components/reports/kit/report-section";
import { useReportPrint } from "@/components/reports/kit/report-print";
import { chartSvgFromRef } from "@/lib/report-document-print";
import { DrillLineButton, compactSections, drillLineTestId, textTablePrintSection } from "@/components/reports/kit/report-breakdown-table";
import { useReportRange } from "./report-filters";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ReportTiles, tilesPrintSection, useCompareTile, type BetterDir, type ReportTile } from "@/components/reports/kit/report-tiles";
import { previousOf, useComparedSummary } from "@/components/reports/kit/use-compared";
import { ReportMonthChart } from "@/components/reports/kit/report-month-chart";
import { ReportDetailDialog, type ReportColumn, type ReportDrillTarget } from "@/components/reports/kit/report-detail-dialog";
import { EntityLink } from "@/components/reports/entity-link";
import { useHasPermission } from "@/hooks/use-has-permission";
import { formatDate, formatDateTime } from "@/lib/format-utils";
import { csvDate, csvDateTime, csvNumber } from "@/lib/csv";

const ENDPOINT = "/api/reports/waitlist";

const TILE_TONE: Partial<Record<WaitlistReportTile, ReportTile<WaitlistReportTile>["tone"]>> = {
  open: "amber",
  fulfilled: "green",
  cancelled: "red",
};

export function WaitlistReportCard(props: { from?: string; to?: string; vehicleId?: string }) {
  const { from, to, vehicleId } = useReportRange(props);
  const { t } = useTranslation("reports");
  const monthChartRef = useRef<HTMLDivElement>(null);
  const allowedReports = useHasPermission(UserPermission.VIEW_REPORTS, UserPermission.MANAGE_REPORTS);
  const allowedPortal = useHasPermission(UserPermission.VIEW_PORTAL, UserPermission.MANAGE_PORTAL);
  const allowed = allowedReports && allowedPortal;
  const [openTile, setOpenTile] = useState<WaitlistReportTile | null>(null);
  const [shownTile, setShownTile] = useState<WaitlistReportTile>("all");
  // A tile alone, or narrowed to one breakdown line or one month.
  const [narrow, setNarrow] = useState<{ drill?: ReportDrillTarget; month?: string }>({});
  const open = (tile: WaitlistReportTile, by: { drill?: ReportDrillTarget; month?: string } = {}) => {
    setShownTile(tile);
    setNarrow(by);
    setOpenTile(tile);
  };

  // No vehicleId on purpose: the waitlist report ignores the vehicle filter.
  const params = useMemo<Record<string, string>>(
    () => ({ ...(from ? { from } : {}), ...(to ? { to } : {}) }),
    [from, to],
  );
  const { data, isLoading, isError, previous, compareRange } = useComparedSummary<WaitlistReportSummary>(`${ENDPOINT}/summary`, params, { enabled: allowed });
  const compareTile = useCompareTile();

  const tileLabel = (id: WaitlistReportTile) => t(`portalReports.waitlist.tiles.${id}`);
  const statusLabel = (status: string) => t(`portalReports.waitlist.status.${status}`, { defaultValue: status });
  const priorityLabel = (priority: string) => t(`portalReports.waitlist.priority.${priority}`, { defaultValue: priority });
  const unknownType = t("portalReports.waitlist.unknownType");

  const columns = useMemo<Array<ReportColumn<WaitlistReportRow, WaitlistReportSort>>>(() => {
    const label = (id: string) => t(`portalReports.waitlist.columns.${id}`);
    const name = (r: WaitlistReportRow) => r.customerName ?? t("reportKit.noCustomer");
    const type = (r: WaitlistReportRow) => r.vehicleType ?? t("portalReports.waitlist.unknownType");
    const num = (n: number | null) => (n === null ? "" : n.toLocaleString("nl-NL", { maximumFractionDigits: 0 }));
    return [
      { id: "createdAt", label: label("createdAt"), sortKey: "createdAt", cell: (r) => formatDateTime(r.createdAt), csv: (r) => csvDateTime(r.createdAt) },
      {
        id: "customer", label: label("customer"), sortKey: "customer",
        cell: (r) => (r.customerName === null ? <span className="italic text-muted-foreground">{name(r)}</span> : <EntityLink kind="customer" id={r.customerId} label={name(r)} />),
        csv: (r) => name(r),
        print: (r) => name(r),
      },
      {
        id: "type", label: label("type"), sortKey: "vehicleType",
        cell: (r) => (r.vehicleType === null ? <span className="italic text-muted-foreground">{type(r)}</span> : type(r)),
        csv: (r) => type(r),
        print: (r) => type(r),
      },
      { id: "licensePlate", label: label("licensePlate"), cell: (r) => <EntityLink kind="vehicle" id={r.vehicleId} label={r.licensePlate ?? ""} />, csv: (r) => r.licensePlate ?? "" },
      {
        id: "preferredStart", label: label("preferredStart"), sortKey: "preferredStartDate",
        cell: (r) => formatDate(r.preferredStartDate), csv: (r) => csvDate(r.preferredStartDate),
      },
      {
        id: "preferredEnd", label: label("preferredEnd"),
        cell: (r) => (r.preferredEndDate ? formatDate(r.preferredEndDate) : ""), csv: (r) => csvDate(r.preferredEndDate),
      },
      {
        id: "duration", label: label("duration"), align: "right",
        cell: (r) => num(r.duration), csv: (r) => (r.duration === null ? "" : csvNumber(r.duration, 0)),
        print: (r) => num(r.duration),
      },
      { id: "priority", label: label("priority"), cell: (r) => priorityLabel(r.priority), csv: (r) => priorityLabel(r.priority) },
      { id: "status", label: label("status"), sortKey: "status", cell: (r) => statusLabel(r.status), csv: (r) => statusLabel(r.status) },
      {
        id: "fulfilledAt", label: label("fulfilledAt"),
        cell: (r) => (r.fulfilledAt ? formatDateTime(r.fulfilledAt) : ""), csv: (r) => csvDateTime(r.fulfilledAt),
      },
      {
        id: "daysToFulfil", label: label("daysToFulfil"), align: "right",
        cell: (r) => num(r.daysToFulfil), csv: (r) => (r.daysToFulfil === null ? "" : csvNumber(r.daysToFulfil, 0)),
        print: (r) => num(r.daysToFulfil),
      },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t]);


  // More wishes fulfilled is better; the other counts stay neutral.
  const tiles: Array<ReportTile<WaitlistReportTile>> = WAITLIST_REPORT_TILES.map((id) => compareTile({
    id,
    label: tileLabel(id),
    value: (data?.tiles?.[id]?.count ?? 0).toLocaleString("nl-NL"),
    tone: TILE_TONE[id],
  }, {
    current: data?.tiles?.[id]?.count ?? 0,
    previous: previousOf(previous, (s) => s.tiles?.[id]?.count ?? 0),
    better: id === "fulfilled" ? "up" : undefined,
  }));

  const avgDays = data?.avgDaysToFulfil;
  const avgText = avgDays === null || avgDays === undefined
    ? "–"
    : t("portalReports.waitlist.avgDaysValue", { count: avgDays, days: avgDays.toLocaleString("nl-NL", { maximumFractionDigits: 1 }) });
  const series = [
    { key: "open" as const, label: t("portalReports.waitlist.series.open"), color: "#f59e0b" },
    { key: "fulfilled" as const, label: t("portalReports.waitlist.series.fulfilled"), color: "#16a34a" },
    { key: "cancelled" as const, label: t("portalReports.waitlist.series.cancelled"), color: "#dc2626" },
  ];
  const count = (n: number) => n.toLocaleString("nl-NL");
  const byType = data?.byType ?? [];
  const openType = (type: string | null) => open("all", { drill: { name: "type", key: type, label: type ?? unknownType } });
  const isEmpty = data !== undefined && WAITLIST_REPORT_TILES.every((id) => (data.tiles?.[id]?.count ?? 0) === 0);

  useReportPrint(allowed && data && !isEmpty ? compactSections([
    tilesPrintSection(tiles),
    { kind: "note", text: t("portalReports.waitlist.avgDays", { value: avgText }) },
    { kind: "chart", title: t("portalReports.waitlist.byMonth"), getSvg: () => chartSvgFromRef(monthChartRef) },
    textTablePrintSection(
      "waitlist-by-type",
      t("portalReports.waitlist.byType"),
      ["type", "total", "fulfilled", "notFulfilled", "avgWait"].map((c) => t(`portalReports.waitlist.columns.${c}`)),
      byType.map((row) => [
        row.vehicleType ?? unknownType, count(row.total), count(row.fulfilled), count(row.notFulfilled),
        row.avgDaysToFulfil === null ? "–" : row.avgDaysToFulfil.toLocaleString("nl-NL", { maximumFractionDigits: 1 }),
      ]),
    ),
  ]) : null);

  if (!allowed) return null;

  return (
    <ReportSection testId="card-waitlist-report" title={t("portalReports.waitlist.title")} description={t("portalReports.waitlist.description")}>
        {vehicleId && vehicleId !== "all" && (
          <p className="text-sm text-muted-foreground" data-testid="waitlist-vehicle-filter-ignored">{t("portalReports.vehicleFilterIgnored")}</p>
        )}
        {isLoading ? (
          <p className="text-sm text-muted-foreground" data-testid="waitlist-loading">{t("reportKit.loading")}</p>
        ) : isError || !data ? (
          <p className="text-sm text-destructive" data-testid="waitlist-error">{t("reportKit.loadFailed")}</p>
        ) : (
          <>
            <ReportTiles
              tiles={tiles}
              testIdPrefix="waitlist"
              onOpen={(id) => open(id)}
            />
            {isEmpty ? (
              <p className="text-sm text-muted-foreground" data-testid="waitlist-empty">{t("portalReports.waitlist.empty")}</p>
            ) : (
              <>
                <p className="text-sm" data-testid="waitlist-avg-days">
                  {t("portalReports.waitlist.avgDays", { value: avgText })}
                </p>
                <div className="space-y-2">
                  <h4 className="text-sm font-medium">{t("portalReports.waitlist.byMonth")}</h4>
                  <ReportMonthChart data={data.byMonth ?? []} series={series} stacked testId="waitlist-month-chart" chartRef={monthChartRef} previousData={previous?.byMonth} period={params} compareRange={compareRange} onPointClick={(p) => open(p.series, { month: p.month })} />
                </div>
                <div className="space-y-2" data-testid="waitlist-by-type">
                  <h4 className="text-sm font-medium">{t("portalReports.waitlist.byType")}</h4>
                  {byType.length === 0 ? (
                    <p className="text-sm text-muted-foreground" data-testid="waitlist-by-type-empty">{t("reportKit.noData")}</p>
                  ) : (
                    <div className="overflow-x-auto rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>{t("portalReports.waitlist.columns.type")}</TableHead>
                            <TableHead className="text-right">{t("portalReports.waitlist.columns.total")}</TableHead>
                            <TableHead className="text-right">{t("portalReports.waitlist.columns.fulfilled")}</TableHead>
                            <TableHead className="text-right">{t("portalReports.waitlist.columns.notFulfilled")}</TableHead>
                            <TableHead className="text-right">{t("portalReports.waitlist.columns.avgWait")}</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {byType.map((row, i) => (
                            <TableRow key={`${row.vehicleType ?? "null"}-${i}`} data-testid="waitlist-by-type-row" className="cursor-pointer" onClick={() => openType(row.vehicleType)}>
                              <TableCell className={row.vehicleType === null ? "italic text-muted-foreground" : undefined}>
                                <DrillLineButton onClick={() => openType(row.vehicleType)} testId={drillLineTestId("waitlist-by-type", row.vehicleType)}>{row.vehicleType ?? unknownType}</DrillLineButton>
                              </TableCell>
                              <TableCell className="text-right tabular-nums">{count(row.total)}</TableCell>
                              <TableCell className="text-right tabular-nums">{count(row.fulfilled)}</TableCell>
                              <TableCell className="text-right tabular-nums">{count(row.notFulfilled)}</TableCell>
                              <TableCell className="text-right tabular-nums">
                                {row.avgDaysToFulfil === null ? "–" : row.avgDaysToFulfil.toLocaleString("nl-NL", { maximumFractionDigits: 1 })}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>
              </>
            )}
          </>
        )}
      <ReportDetailDialog<WaitlistReportRow, WaitlistReportSort>
        open={openTile !== null}
        onOpenChange={(o) => { if (!o) setOpenTile(null); }}
        title={tileLabel(shownTile)}
        description={t("portalReports.waitlist.title")}
        endpoint={ENDPOINT}
        params={params}
        tile={shownTile}
        drill={narrow.drill}
        month={narrow.month}
        columns={columns}
        defaultSort={{ key: "createdAt", dir: "desc" }}
        rowKey={(r) => r.id}
        csvSubject={t("portalReports.waitlist.csvSubject")}
        reportName="waitlist"
        testId="waitlist-report"
      />
    </ReportSection>
  );
}
