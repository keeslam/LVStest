/**
 * Garantiestatus overzicht: the warranty status of the vehicles with a warranty end date,
 * three counts and a table with a status filter. Does not read the expense category.
 * Rights: report right + vehicles; it reads only the fleet.
 */
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { differenceInDays } from "date-fns";
import { ReportSection } from "@/components/reports/kit/report-section";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ReportTable, type ReportTableColumn, type ReportTableView } from "@/components/reports/kit/report-table";
import { EntityLink } from "@/components/reports/entity-link";
import { useReportPrint } from "@/components/reports/kit/report-print";
import { formatDate, formatLicensePlate } from "@/lib/format-utils";
import { useReportBaseData, type WarrantyRow } from "../report-base-data";
import { CategoryIgnoredNote, ReportBaseStatus } from "./report-base-status";
import { tablePrintSection } from "./table-print";
import { useReportColumns } from "@/components/reports/kit/use-report-columns";

export function WarrantyReport() {
  const { t } = useTranslation("reports");
  const base = useReportBaseData();
  const [status, setStatus] = useState("all");
  const [view, setView] = useState<ReportTableView<WarrantyRow> | null>(null);
  const { vehicles, warrantyStatusList } = base;

  // The three counts, as before: by end date against today.
  const today = new Date();
  const withWarranty = vehicles.filter((v) => v.warrantyEndDate);
  const daysUntil = (d: string | Date) => differenceInDays(new Date(d), today);
  const expired = withWarranty.filter((v) => v.warrantyEndDate && new Date(v.warrantyEndDate) < today).length;
  const expiring = withWarranty.filter((v) => v.warrantyEndDate && daysUntil(v.warrantyEndDate) >= 0 && daysUntil(v.warrantyEndDate) <= 90).length;
  const valid = withWarranty.filter((v) => v.warrantyEndDate && daysUntil(v.warrantyEndDate) > 90).length;
  const tiles = [
    { label: t("reportsPage.vehiclesTab.validWarrantyStat"), value: String(valid), className: "bg-slate-50" },
    { label: t("reportsPage.vehiclesTab.warrantyExpiring90Stat"), value: String(expiring), className: "bg-amber-50" },
    { label: t("reportsPage.vehiclesTab.expiredWarrantyStat"), value: String(expired), className: "bg-red-50" },
  ];

  const rows = useMemo(() => warrantyStatusList.filter((v) => status === "all" || v.warrantyStatus === status), [warrantyStatusList, status]);

  const baseColumns = useMemo<ReportTableColumn<WarrantyRow>[]>(() => {
    const statusOf = (v: WarrantyRow): { text: string; className: string } => {
      const days = v.daysRemaining;
      if (days === null) return { text: t("reportsPage.common.notSet"), className: "bg-slate-100 text-slate-800" };
      if (days < 0) return { text: t("reportsPage.common.expiredAgo", { count: Math.abs(days) }), className: "bg-red-100 text-red-800" };
      if (days <= 90) return { text: t("reportsPage.common.expiresIn", { count: days }), className: "bg-amber-100 text-amber-800" };
      return { text: t("reportsPage.common.valid"), className: "bg-green-100 text-green-800" };
    };
    const endDate = (v: WarrantyRow) => (v.warrantyEndDate ? formatDate(v.warrantyEndDate) : t("reportsPage.common.notSet"));
    return [
      { id: "vehicle", label: t("reportsPage.common.vehicle"), cell: (v) => `${v.brand} ${v.model}`, text: (v) => `${v.brand} ${v.model}`, sortValue: (v) => `${v.brand} ${v.model}` },
      { id: "plate", label: t("reportsPage.common.licensePlate"), cell: (v) => <EntityLink kind="vehicle" id={v.id} label={formatLicensePlate(v.licensePlate)} />, text: (v) => formatLicensePlate(v.licensePlate), sortValue: (v) => v.licensePlate },
      { id: "endDate", label: t("reportsPage.vehiclesTab.warrantyEndDate"), cell: endDate, text: endDate, sortValue: (v) => (v.warrantyEndDate ? new Date(v.warrantyEndDate).getTime() : null) },
      {
        id: "status", label: t("common:fields.status"), align: "right",
        cell: (v) => { const s = statusOf(v); return <span className={`rounded-full px-2 py-1 text-xs ${s.className}`}>{s.text}</span>; },
        text: (v) => statusOf(v).text,
        sortValue: (v) => v.daysRemaining,
      },
    ];
  }, [t]);
  // Kolommen: hide/show columns (per user). The rows are the records themselves: no extra fields.
  const { columns, menu } = useReportColumns("warranty", baseColumns);

  useReportPrint([
    { kind: "tiles", tiles: tiles.map(({ label, value }) => ({ label, value })) },
    tablePrintSection({ id: "warranty", columns, rows, view }),
  ]);

  return (
    <div className="space-y-6">
      <ReportBaseStatus base={base} />
      <CategoryIgnoredNote category={base.selectedCategory} scope={t("reportsPage.filters.categoryScopeApkWarranty")} />
      <ReportSection
        testId="card-warranty-report"
        title={t("reportsPage.vehiclesTab.warrantyOverviewTitle")}
        description={t("reportsPage.vehiclesTab.warrantyOverviewDesc")}
        bodyClassName="space-y-4"
      >
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {tiles.map((tile) => (
              <div key={tile.label} className={`flex flex-col rounded-md p-4 ${tile.className}`}>
                <span className="text-sm text-muted-foreground">{tile.label}</span>
                <span className="text-2xl font-bold">{tile.value}</span>
              </div>
            ))}
          </div>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-[220px]" data-testid="select-warranty-status">
              <SelectValue placeholder={t("reportsPage.vehiclesTab.filterByStatusPlaceholder")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("reportsPage.vehiclesTab.allStatuses")}</SelectItem>
              <SelectItem value="expired">{t("reportsPage.common.expired")}</SelectItem>
              <SelectItem value="expiring_soon">{t("reportsPage.vehiclesTab.expiringSoon")}</SelectItem>
              <SelectItem value="valid">{t("reportsPage.common.valid")}</SelectItem>
            </SelectContent>
          </Select>
          <ReportTable
            rows={rows}
            columns={columns}
            rowKey={(v) => v.id}
            searchPlaceholder={t("reportsPage.vehiclesTab.searchByPlateBrandModel")}
            testId="warranty-table"
            resetKey={status}
            onView={setView}
            toolbar={menu}
          />
      </ReportSection>
    </div>
  );
}
