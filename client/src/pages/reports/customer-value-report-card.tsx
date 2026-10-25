/**
 * Rapporten fase 4, onderdeel 9: customer value at the top of Rapporten > Klanten.
 * Revenue, costs, late returns, cancellations and portal requests per customer, with a top 10
 * of best and most expensive customers. A money report: only the report permission (Kees),
 * no customer permission needed.
 */
import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import {
  CUSTOMER_VALUE_TILES, type CustomerValueRow, type CustomerValueSort, type CustomerValueSummary, type CustomerValueTile,
} from "@shared/reports/customer-value-report";
import { UserPermission } from "@shared/schema";
import { ReportSection } from "@/components/reports/kit/report-section";
import { useReportPrint } from "@/components/reports/kit/report-print";
import { chartSvgFromRef } from "@/lib/report-document-print";
import { compactSections } from "@/components/reports/kit/report-breakdown-table";
import { useReportRange } from "./report-filters";
import { ReportTiles, tilesPrintSection, type ReportTile } from "@/components/reports/kit/report-tiles";
import { ReportTopChart } from "@/components/reports/kit/report-top-chart";
import { ReportDetailDialog, type ReportColumn } from "@/components/reports/kit/report-detail-dialog";
import { useHasPermission } from "@/hooks/use-has-permission";
import { formatCurrency } from "@/lib/format-utils";
import { csvNumber } from "@/lib/csv";

const ENDPOINT = "/api/reports/customer-value";

const TILE_TONE: Partial<Record<CustomerValueTile, ReportTile<CustomerValueTile>["tone"]>> = {
  revenue: "green",
  costs: "red",
  late: "amber",
};

export function CustomerValueReportCard(props: { from?: string; to?: string; vehicleId?: string }) {
  const { from, to, vehicleId } = useReportRange(props);
  const { t } = useTranslation("reports");
  const revenueChartRef = useRef<HTMLDivElement>(null);
  const costsChartRef = useRef<HTMLDivElement>(null);
  const allowed = useHasPermission(UserPermission.VIEW_REPORTS, UserPermission.MANAGE_REPORTS);
  const [openTile, setOpenTile] = useState<CustomerValueTile | null>(null);
  const [shownTile, setShownTile] = useState<CustomerValueTile>("revenue");

  const params = useMemo<Record<string, string>>(
    () => ({
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
      ...(vehicleId && vehicleId !== "all" ? { vehicleId } : {}),
    }),
    [from, to, vehicleId],
  );
  const { data, isLoading, isError } = useQuery<CustomerValueSummary>({
    queryKey: [`${ENDPOINT}/summary`, params],
    enabled: allowed,
  });

  const columns = useMemo<Array<ReportColumn<CustomerValueRow, CustomerValueSort>>>(() => {
    const name = (r: CustomerValueRow) => r.customerName ?? t("reportKit.noCustomer");
    const count = (n: number) => n.toLocaleString("nl-NL");
    const col = (id: string, sortKey: CustomerValueSort | undefined, get: (r: CustomerValueRow) => number, money: boolean): ReportColumn<CustomerValueRow, CustomerValueSort> => ({
      id,
      label: t(`customerReports.value.columns.${id}`),
      sortKey,
      align: "right",
      cell: (r) => (money ? formatCurrency(get(r)) : count(get(r))),
      csv: (r) => csvNumber(get(r), money ? 2 : 0),
      print: (r) => (money ? formatCurrency(get(r)) : count(get(r))),
    });
    return [
      {
        id: "customer", label: t("customerReports.value.columns.customer"), sortKey: "customer",
        cell: (r) => (r.customerName === null ? <span className="italic text-muted-foreground">{name(r)}</span> : name(r)),
        csv: (r) => name(r),
        print: (r) => name(r),
      },
      col("rentals", "rentals", (r) => r.rentals, false),
      col("rentalDays", "rentalDays", (r) => r.rentalDays, false),
      col("revenue", "revenue", (r) => r.revenue, true),
      col("extraKmCost", undefined, (r) => r.extraKmCost, true),
      col("fuelCost", undefined, (r) => r.fuelCost, true),
      col("finesCount", undefined, (r) => r.finesCount, false),
      col("finesAmount", undefined, (r) => r.finesAmount, true),
      col("damageChecks", undefined, (r) => r.damageChecks, false),
      col("costs", "costs", (r) => r.costs, true),
      col("lateReturns", "lateReturns", (r) => r.lateReturns, false),
      col("cancellations", "cancellations", (r) => r.cancellations, false),
      col("portalRequests", "portalRequests", (r) => r.portalRequests, false),
    ];
  }, [t]);


  const tiles: Array<ReportTile<CustomerValueTile>> = CUSTOMER_VALUE_TILES.map((id) => {
    const total = data?.tiles?.[id];
    const amount = total?.amount ?? 0;
    return {
      id,
      label: t(`customerReports.value.tiles.${id}`),
      value: id === "revenue" || id === "costs" ? formatCurrency(amount) : amount.toLocaleString("nl-NL"),
      hint: t("customerReports.value.customersHint", { count: total?.count ?? 0 }),
      tone: TILE_TONE[id],
    };
  });
  const noCustomer = t("reportKit.noCustomer");

  useReportPrint(allowed && data ? compactSections([
    tilesPrintSection(tiles),
    { kind: "note", text: t("customerReports.value.costsNote") },
    (data.topRevenue ?? []).length > 0 && { kind: "chart", title: t("customerReports.value.topRevenue"), getSvg: () => chartSvgFromRef(revenueChartRef) },
    (data.topCosts ?? []).length > 0 && { kind: "chart", title: t("customerReports.value.topCosts"), getSvg: () => chartSvgFromRef(costsChartRef) },
  ]) : null);

  if (!allowed) return null;

  return (
    <ReportSection testId="card-customer-value-report" title={t("customerReports.value.title")} description={t("customerReports.value.description")}>
        {isLoading ? (
          <p className="text-sm text-muted-foreground" data-testid="customer-value-loading">{t("reportKit.loading")}</p>
        ) : isError || !data ? (
          <p className="text-sm text-destructive" data-testid="customer-value-error">{t("reportKit.loadFailed")}</p>
        ) : (
          <>
            <ReportTiles
              tiles={tiles}
              testIdPrefix="customer-value"
              onOpen={(id) => { setShownTile(id); setOpenTile(id); }}
            />
            <p className="text-sm text-muted-foreground" data-testid="customer-value-costs-note">{t("customerReports.value.costsNote")}</p>
            <div className="grid gap-6 lg:grid-cols-2">
              <div className="space-y-2">
                <h4 className="text-sm font-medium">{t("customerReports.value.topRevenue")}</h4>
                <ReportTopChart rows={data.topRevenue ?? []} nullLabel={noCustomer} money valueLabel={t("customerReports.value.columns.revenue")} color="#16a34a" testId="customer-value-top-revenue" chartRef={revenueChartRef} />
              </div>
              <div className="space-y-2">
                <h4 className="text-sm font-medium">{t("customerReports.value.topCosts")}</h4>
                <ReportTopChart rows={data.topCosts ?? []} nullLabel={noCustomer} money valueLabel={t("customerReports.value.columns.costs")} color="#dc2626" testId="customer-value-top-costs" chartRef={costsChartRef} />
              </div>
            </div>
          </>
        )}
      <ReportDetailDialog<CustomerValueRow, CustomerValueSort>
        open={openTile !== null}
        onOpenChange={(o) => { if (!o) setOpenTile(null); }}
        title={t(`customerReports.value.tiles.${shownTile}`)}
        description={t("customerReports.value.title")}
        endpoint={ENDPOINT}
        params={params}
        tile={shownTile}
        columns={columns}
        defaultSort={{ key: "amount", dir: "desc" }}
        rowKey={(r) => String(r.customerId ?? "none")}
        csvSubject={t("customerReports.value.csvSubject")}
        reportName="customer-value"
        testId="customer-value-report"
      />
    </ReportSection>
  );
}
