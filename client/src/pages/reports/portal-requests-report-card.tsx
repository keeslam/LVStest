/**
 * Rapporten fase 4, onderdeel 10: the portal requests report on Rapporten > Portaal.
 * Tiles per state, the median reply time, a stacked month chart, a type x status table and
 * the requests handled per staff member. Needs the report permission AND the portal
 * permission; ignores the page's vehicle filter (requests are seldom about one car).
 */
import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import {
  PORTAL_REQUEST_REPORT_TILES, PORTAL_STALE_DAYS,
  type PortalRequestReportRow, type PortalRequestReportSort, type PortalRequestReportSummary, type PortalRequestReportTile,
} from "@shared/reports/portal-requests-report";
import { UserPermission } from "@shared/schema";
import { ReportSection } from "@/components/reports/kit/report-section";
import { useReportPrint } from "@/components/reports/kit/report-print";
import { chartSvgFromRef } from "@/lib/report-document-print";
import { compactSections, breakdownPrintSection, textTablePrintSection, useBreakdownHeader } from "@/components/reports/kit/report-breakdown-table";
import { useReportRange } from "./report-filters";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ReportTiles, tilesPrintSection, type ReportTile } from "@/components/reports/kit/report-tiles";
import { ReportMonthChart } from "@/components/reports/kit/report-month-chart";
import { ReportBreakdownTable } from "@/components/reports/kit/report-breakdown-table";
import { ReportDetailDialog, type ReportColumn } from "@/components/reports/kit/report-detail-dialog";
import { useHasPermission } from "@/hooks/use-has-permission";
import { formatDateTime } from "@/lib/format-utils";
import { csvDateTime, csvNumber } from "@/lib/csv";

const ENDPOINT = "/api/reports/portal-requests";

const TILE_TONE: Partial<Record<PortalRequestReportTile, ReportTile<PortalRequestReportTile>["tone"]>> = {
  open: "amber",
  done: "green",
  rejected: "red",
  stale: "red",
};

export function PortalRequestsReportCard(props: { from?: string; to?: string; vehicleId?: string }) {
  const { from, to, vehicleId } = useReportRange(props);
  const { t } = useTranslation(["reports", "portal"]);
  const monthChartRef = useRef<HTMLDivElement>(null);
  const header = useBreakdownHeader();
  const allowedReports = useHasPermission(UserPermission.VIEW_REPORTS, UserPermission.MANAGE_REPORTS);
  const allowedPortal = useHasPermission(UserPermission.VIEW_PORTAL, UserPermission.MANAGE_PORTAL);
  const allowed = allowedReports && allowedPortal;
  const [openTile, setOpenTile] = useState<PortalRequestReportTile | null>(null);
  const [shownTile, setShownTile] = useState<PortalRequestReportTile>("all");

  // No vehicleId on purpose: the portal report ignores the vehicle filter.
  const params = useMemo<Record<string, string>>(
    () => ({ ...(from ? { from } : {}), ...(to ? { to } : {}) }),
    [from, to],
  );
  const { data, isLoading, isError } = useQuery<PortalRequestReportSummary>({
    queryKey: [`${ENDPOINT}/summary`, params],
    enabled: allowed,
  });

  const tileLabel = (id: PortalRequestReportTile) => t(`reports:portalReports.requests.tiles.${id}`, { days: PORTAL_STALE_DAYS });
  const typeLabel = (type: string) => t(`portal:admin.requests.type.${type}`, { defaultValue: type });
  const statusLabel = (status: string) => t(`portal:admin.requests.status.${status}`, { defaultValue: status });

  const columns = useMemo<Array<ReportColumn<PortalRequestReportRow, PortalRequestReportSort>>>(() => {
    const label = (id: string) => t(`reports:portalReports.requests.columns.${id}`);
    const name = (r: PortalRequestReportRow) => r.customerName ?? t("reports:reportKit.noCustomer");
    const num = (n: number | null, decimals: number) => (n === null ? "" : n.toLocaleString("nl-NL", { maximumFractionDigits: decimals }));
    return [
      { id: "id", label: label("number"), cell: (r) => `#${r.id}`, csv: (r) => r.id },
      { id: "createdAt", label: label("createdAt"), sortKey: "createdAt", cell: (r) => formatDateTime(r.createdAt), csv: (r) => csvDateTime(r.createdAt) },
      {
        id: "type", label: label("type"), sortKey: "type",
        cell: (r) => typeLabel(r.type), csv: (r) => typeLabel(r.type),
      },
      {
        id: "status", label: label("status"), sortKey: "status",
        cell: (r) => statusLabel(r.status), csv: (r) => statusLabel(r.status),
      },
      {
        id: "customer", label: label("customer"), sortKey: "customer",
        cell: (r) => (r.customerName === null ? <span className="italic text-muted-foreground">{name(r)}</span> : name(r)),
        csv: (r) => name(r),
        print: (r) => name(r),
      },
      { id: "handledBy", label: label("handledBy"), cell: (r) => r.handledBy ?? "", csv: (r) => r.handledBy ?? "" },
      { id: "repliedAt", label: label("repliedAt"), cell: (r) => (r.repliedAt ? formatDateTime(r.repliedAt) : ""), csv: (r) => csvDateTime(r.repliedAt) },
      {
        id: "replyHours", label: label("replyHours"), sortKey: "replyHours", align: "right",
        cell: (r) => num(r.replyHours, 1), csv: (r) => (r.replyHours === null ? "" : csvNumber(r.replyHours, 1)),
        print: (r) => num(r.replyHours, 1),
      },
      {
        id: "openDays", label: label("openDays"), align: "right",
        cell: (r) => num(r.openDays, 0), csv: (r) => (r.openDays === null ? "" : csvNumber(r.openDays, 0)),
        print: (r) => num(r.openDays, 0),
      },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t]);


  const tiles: Array<ReportTile<PortalRequestReportTile>> = PORTAL_REQUEST_REPORT_TILES.map((id) => ({
    id,
    label: tileLabel(id),
    value: (data?.tiles?.[id]?.count ?? 0).toLocaleString("nl-NL"),
    tone: TILE_TONE[id],
  }));

  const median = (hours: number | null | undefined): string => {
    if (hours === null || hours === undefined) return t("reports:portalReports.requests.noReplies");
    if (hours < 48) return t("reports:portalReports.requests.medianHours", { hours: hours.toLocaleString("nl-NL", { maximumFractionDigits: 1 }) });
    return t("reports:portalReports.requests.medianDays", { days: (hours / 24).toLocaleString("nl-NL", { maximumFractionDigits: 1 }) });
  };
  const series = [
    { key: "new" as const, label: statusLabel("new"), color: "#3b82f6" },
    { key: "inProgress" as const, label: statusLabel("in_progress"), color: "#f59e0b" },
    { key: "done" as const, label: statusLabel("done"), color: "#16a34a" },
    { key: "rejected" as const, label: statusLabel("rejected"), color: "#dc2626" },
  ];
  const count = (n: number) => n.toLocaleString("nl-NL");
  const byType = data?.byType ?? [];

  useReportPrint(allowed && data ? compactSections([
    tilesPrintSection(tiles),
    { kind: "note", text: t("reports:portalReports.requests.median", { value: median(data.medianReplyHours) }) },
    { kind: "chart", title: t("reports:portalReports.requests.byMonth"), getSvg: () => chartSvgFromRef(monthChartRef) },
    textTablePrintSection(
      "portal-requests-by-type",
      t("reports:portalReports.requests.byType"),
      [t("reports:portalReports.requests.columns.type"), t("reports:portalReports.requests.columns.total"), t("reports:portalReports.requests.columns.open"), statusLabel("done"), statusLabel("rejected")],
      byType.map((row) => [typeLabel(row.type), count(row.total), count(row.open), count(row.done), count(row.rejected)]),
    ),
    breakdownPrintSection({ id: "portal-requests-by-handler", title: t("reports:portalReports.requests.byHandler"), rows: data.byHandler ?? [], nullLabel: t("reports:portalReports.requests.unknownHandler"), hideAmount: true, header }),
  ]) : null);

  if (!allowed) return null;

  return (
    <ReportSection testId="card-portal-requests-report" title={t("reports:portalReports.requests.title")} description={t("reports:portalReports.requests.description")}>
        {vehicleId && vehicleId !== "all" && (
          <p className="text-sm text-muted-foreground" data-testid="portal-vehicle-filter-ignored">{t("reports:portalReports.vehicleFilterIgnored")}</p>
        )}
        {isLoading ? (
          <p className="text-sm text-muted-foreground" data-testid="portal-requests-loading">{t("reports:reportKit.loading")}</p>
        ) : isError || !data ? (
          <p className="text-sm text-destructive" data-testid="portal-requests-error">{t("reports:reportKit.loadFailed")}</p>
        ) : (
          <>
            <ReportTiles
              tiles={tiles}
              testIdPrefix="portal-requests"
              onOpen={(id) => { setShownTile(id); setOpenTile(id); }}
            />
            <p className="text-sm" data-testid="portal-requests-median">
              {t("reports:portalReports.requests.median", { value: median(data.medianReplyHours) })}
            </p>
            <div className="space-y-2">
              <h4 className="text-sm font-medium">{t("reports:portalReports.requests.byMonth")}</h4>
              <ReportMonthChart data={data.byMonth ?? []} series={series} stacked testId="portal-requests-month-chart" chartRef={monthChartRef} />
            </div>
            <div className="space-y-2" data-testid="portal-requests-by-type">
              <h4 className="text-sm font-medium">{t("reports:portalReports.requests.byType")}</h4>
              {byType.length === 0 ? (
                <p className="text-sm text-muted-foreground" data-testid="portal-requests-by-type-empty">{t("reports:reportKit.noData")}</p>
              ) : (
                <div className="overflow-x-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("reports:portalReports.requests.columns.type")}</TableHead>
                        <TableHead className="text-right">{t("reports:portalReports.requests.columns.total")}</TableHead>
                        <TableHead className="text-right">{t("reports:portalReports.requests.columns.open")}</TableHead>
                        <TableHead className="text-right">{statusLabel("done")}</TableHead>
                        <TableHead className="text-right">{statusLabel("rejected")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {byType.map((row) => (
                        <TableRow key={row.type} data-testid="portal-requests-by-type-row">
                          <TableCell>{typeLabel(row.type)}</TableCell>
                          <TableCell className="text-right tabular-nums">{count(row.total)}</TableCell>
                          <TableCell className="text-right tabular-nums">{count(row.open)}</TableCell>
                          <TableCell className="text-right tabular-nums">{count(row.done)}</TableCell>
                          <TableCell className="text-right tabular-nums">{count(row.rejected)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
            <ReportBreakdownTable
              title={t("reports:portalReports.requests.byHandler")}
              rows={data.byHandler ?? []}
              nullLabel={t("reports:portalReports.requests.unknownHandler")}
              hideAmount
              testId="portal-requests-by-handler"
            />
          </>
        )}
      <ReportDetailDialog<PortalRequestReportRow, PortalRequestReportSort>
        open={openTile !== null}
        onOpenChange={(o) => { if (!o) setOpenTile(null); }}
        title={tileLabel(shownTile)}
        description={t("reports:portalReports.requests.title")}
        endpoint={ENDPOINT}
        params={params}
        tile={shownTile}
        columns={columns}
        defaultSort={shownTile === "stale" ? { key: "createdAt", dir: "asc" } : { key: "createdAt", dir: "desc" }}
        rowKey={(r) => r.id}
        csvSubject={t("reports:portalReports.requests.csvSubject")}
        reportName="portal-requests"
        testId="portal-requests-report"
      />
    </ReportSection>
  );
}
