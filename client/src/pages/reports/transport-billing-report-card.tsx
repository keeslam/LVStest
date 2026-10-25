/**
 * Rapporten fase 2, onderdeel 3: the transport billing report on Rapporten >
 * Financieel. Tiles (still to invoice, invoiced, toll, still to invoice over all
 * periods), a month chart, a table per transport type and the rows behind a
 * tile. Needs only the report permission, like the Financieel tab.
 */
import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import {
  TRANSPORT_BILLING_CARD_TILES,
  type TransportBillingRow,
  type TransportBillingSort,
  type TransportBillingSummary,
  type TransportBillingTile,
} from "@shared/reports/transport-billing-report";
import { UserPermission } from "@shared/schema";
import { ReportSection } from "@/components/reports/kit/report-section";
import { useReportPrint } from "@/components/reports/kit/report-print";
import { chartSvgFromRef } from "@/lib/report-document-print";
import { DrillLineButton, compactSections, drillLineTestId, textTablePrintSection } from "@/components/reports/kit/report-breakdown-table";
import { useReportPeriod } from "./report-filters";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ReportTiles, tilesPrintSection, type ReportTile } from "@/components/reports/kit/report-tiles";
import { ReportMonthChart } from "@/components/reports/kit/report-month-chart";
import { ReportDetailDialog, type ReportColumn, type ReportDrillTarget } from "@/components/reports/kit/report-detail-dialog";
import { EntityLink } from "@/components/reports/entity-link";
import { useHasPermission } from "@/hooks/use-has-permission";
import { formatCurrency, formatLicensePlate } from "@/lib/format-utils";
import { formatDateNl } from "@/lib/format-date-nl";
import { csvDate, csvNumber } from "@/lib/csv";

const ENDPOINT = "/api/reports/transport-billing";

const TILE_TONE: Partial<Record<TransportBillingTile, ReportTile<TransportBillingTile>["tone"]>> = {
  notInvoiced: "amber",
  invoiced: "green",
  openAllTime: "red",
};

export function TransportBillingReportCard(props: { from?: string; to?: string; vehicleId?: string }) {
  const { from, to, vehicleId } = useReportPeriod(props);
  const { t } = useTranslation("reports");
  const monthChartRef = useRef<HTMLDivElement>(null);
  const allowed = useHasPermission(UserPermission.VIEW_REPORTS, UserPermission.MANAGE_REPORTS);
  const [openTile, setOpenTile] = useState<TransportBillingTile | null>(null);
  const [shownTile, setShownTile] = useState<TransportBillingTile>("notInvoiced");
  // A tile alone, or narrowed to one breakdown line or one month.
  const [narrow, setNarrow] = useState<{ drill?: ReportDrillTarget; month?: string }>({});
  const open = (tile: TransportBillingTile, by: { drill?: ReportDrillTarget; month?: string } = {}) => {
    setShownTile(tile);
    setNarrow(by);
    setOpenTile(tile);
  };

  const params = useMemo<Record<string, string>>(
    () => ({ from, to, ...(vehicleId && vehicleId !== "all" ? { vehicleId } : {}) }),
    [from, to, vehicleId],
  );
  // The "all periods" tile opens its list without a period.
  const listParams = useMemo<Record<string, string>>(
    () => (shownTile === "openAllTime" ? (vehicleId && vehicleId !== "all" ? { vehicleId } : {}) : params),
    [shownTile, params, vehicleId],
  );
  const { data, isLoading, isError } = useQuery<TransportBillingSummary>({
    queryKey: [`${ENDPOINT}/summary`, params],
    enabled: allowed,
  });

  const columns = useMemo<Array<ReportColumn<TransportBillingRow, TransportBillingSort>>>(() => {
    const day = (v: string | null) => (v ? formatDateNl(v, "short") : "");
    const euro = (v: number | null) => (v === null ? "" : formatCurrency(v));
    const type = (v: string) => t(`delivery:transportDialog.typeLabels.${v}`, { defaultValue: v });
    const status = (v: string) => t(`moneyReports.transport.statuses.${v}`, { defaultValue: v });
    const plate = (r: TransportBillingRow) => (r.licensePlate ? formatLicensePlate(r.licensePlate) : "");
    const c = (key: string) => t(`moneyReports.transport.columns.${key}`);
    return [
      { id: "date", label: c("date"), sortKey: "date", cell: (r) => day(r.date), csv: (r) => csvDate(r.date) },
      { id: "type", label: c("type"), sortKey: "transportType", cell: (r) => type(r.transportType), csv: (r) => type(r.transportType) },
      { id: "status", label: c("status"), sortKey: "status", cell: (r) => status(r.status), csv: (r) => status(r.status) },
      { id: "licensePlate", label: c("licensePlate"), cell: (r) => <EntityLink kind="vehicle" id={r.vehicleId} label={plate(r)} />, csv: plate },
      { id: "customer", label: c("customer"), cell: (r) => <EntityLink kind="customer" id={r.customerId} label={r.customerName ?? ""} />, csv: (r) => r.customerName ?? "" },
      {
        id: "billableAmount",
        label: c("billableAmount"),
        sortKey: "amount",
        align: "right",
        cell: (r) => (r.billable && r.billableAmount === null
          ? <span className="italic text-amber-700">{t("moneyReports.transport.amountMissing")}</span>
          : euro(r.billableAmount)),
        csv: (r) => csvNumber(r.billableAmount),
        print: (r) => (r.billable && r.billableAmount === null ? t("moneyReports.transport.amountMissing") : euro(r.billableAmount)),
      },
      { id: "tollCost", label: c("tollCost"), sortKey: "tollCost", align: "right", cell: (r) => euro(r.tollCost), csv: (r) => csvNumber(r.tollCost), print: (r) => euro(r.tollCost) },
      { id: "invoicedDate", label: c("invoicedDate"), cell: (r) => day(r.invoicedDate), csv: (r) => csvDate(r.invoicedDate) },
      { id: "distanceKm", label: c("distanceKm"), align: "right", cell: (r) => (r.distanceKm === null ? "" : r.distanceKm.toLocaleString("nl-NL")), csv: (r) => csvNumber(r.distanceKm) },
    ];
  }, [t]);


  const tiles: Array<ReportTile<TransportBillingTile>> = TRANSPORT_BILLING_CARD_TILES.map((id) => {
    const total = data?.tiles?.[id];
    const amount = formatCurrency(total?.amount ?? 0);
    const missing = id === "notInvoiced" ? (data?.missingAmount ?? 0) : 0;
    return {
      id,
      label: t(`moneyReports.transport.tiles.${id}`),
      value: (total?.count ?? 0).toLocaleString("nl-NL"),
      hint: missing > 0 ? `${amount} · ${t("moneyReports.transport.missingAmount", { n: missing })}` : amount,
      tone: TILE_TONE[id],
    };
  });

  const series = [
    { key: "notInvoiced" as const, label: t("moneyReports.transport.series.notInvoiced"), color: "#f59e0b" },
    { key: "invoiced" as const, label: t("moneyReports.transport.series.invoiced"), color: "#16a34a" },
    { key: "toll" as const, label: t("moneyReports.transport.series.toll"), color: "#6b7280" },
  ];

  // A type line opens the (hidden) "all" tile: its count. The amounts open the tile they add up to.
  const openType = (tile: "all" | "notInvoiced" | "toll", type: string) =>
    open(tile, { drill: { name: "type", key: type, label: t(`delivery:transportDialog.typeLabels.${type}`, { defaultValue: type }) } });

  useReportPrint(allowed && data ? compactSections([
    tilesPrintSection(tiles),
    { kind: "chart", title: t("moneyReports.transport.byMonth"), getSvg: () => chartSvgFromRef(monthChartRef) },
    textTablePrintSection(
      "transport-billing-by-type",
      t("moneyReports.transport.byType"),
      ["type", "count", "billable", "notInvoiced", "toll"].map((k) => t(`moneyReports.transport.typeColumns.${k}`)),
      (data.byType ?? []).map((row) => [
        t(`delivery:transportDialog.typeLabels.${row.type}`, { defaultValue: row.type }),
        row.count.toLocaleString("nl-NL"), formatCurrency(row.billable), formatCurrency(row.notInvoiced), formatCurrency(row.toll),
      ]),
    ),
  ]) : null);

  if (!allowed) return null;

  return (
    <ReportSection testId="card-transport-billing-report" title={t("moneyReports.transport.title")} description={t("moneyReports.transport.description")}>
        {isLoading ? (
          <p className="text-sm text-muted-foreground" data-testid="transport-billing-report-loading">{t("reportKit.loading")}</p>
        ) : isError || !data ? (
          <p className="text-sm text-destructive" data-testid="transport-billing-report-error">{t("reportKit.loadFailed")}</p>
        ) : (
          <>
            <ReportTiles
              tiles={tiles}
              testIdPrefix="transport-billing"
              onOpen={(id) => open(id)}
            />
            <div className="space-y-2">
              <h4 className="text-sm font-medium">{t("moneyReports.transport.byMonth")}</h4>
              <ReportMonthChart data={data.byMonth ?? []} series={series} money testId="transport-billing-month-chart" chartRef={monthChartRef} onPointClick={(p) => open(p.series, { month: p.month })} />
            </div>
            <div className="space-y-2" data-testid="transport-billing-by-type">
              <h4 className="text-sm font-medium">{t("moneyReports.transport.byType")}</h4>
              {(data.byType ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground" data-testid="transport-billing-by-type-empty">{t("reportKit.noData")}</p>
              ) : (
                <div className="overflow-x-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("moneyReports.transport.typeColumns.type")}</TableHead>
                        <TableHead className="text-right">{t("moneyReports.transport.typeColumns.count")}</TableHead>
                        <TableHead className="text-right">{t("moneyReports.transport.typeColumns.billable")}</TableHead>
                        <TableHead className="text-right">{t("moneyReports.transport.typeColumns.notInvoiced")}</TableHead>
                        <TableHead className="text-right">{t("moneyReports.transport.typeColumns.toll")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(data.byType ?? []).map((row) => (
                        <TableRow key={row.type} data-testid="transport-billing-by-type-row" className="cursor-pointer" onClick={() => openType("all", row.type)}>
                          <TableCell>
                            <DrillLineButton onClick={() => openType("all", row.type)} testId={drillLineTestId("transport-billing-by-type", row.type)}>
                              {t(`delivery:transportDialog.typeLabels.${row.type}`, { defaultValue: row.type })}
                            </DrillLineButton>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{row.count.toLocaleString("nl-NL")}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatCurrency(row.billable)}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            <DrillLineButton onClick={() => openType("notInvoiced", row.type)} testId={`transport-billing-by-type-row-${row.type}-notInvoiced`}>{formatCurrency(row.notInvoiced)}</DrillLineButton>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            <DrillLineButton onClick={() => openType("toll", row.type)} testId={`transport-billing-by-type-row-${row.type}-toll`}>{formatCurrency(row.toll)}</DrillLineButton>
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
      <ReportDetailDialog<TransportBillingRow, TransportBillingSort>
        open={openTile !== null}
        onOpenChange={(o) => { if (!o) setOpenTile(null); }}
        title={t(`moneyReports.transport.tiles.${shownTile}`)}
        description={t("moneyReports.transport.title")}
        endpoint={ENDPOINT}
        params={listParams}
        tile={shownTile}
        drill={narrow.drill}
        month={narrow.month}
        columns={columns}
        defaultSort={{ key: "date", dir: "desc" }}
        rowKey={(r) => r.id}
        csvSubject={t("moneyReports.transport.csvSubject")}
        reportName="transport-billing"
        testId="transport-billing-report"
      />
    </ReportSection>
  );
}
