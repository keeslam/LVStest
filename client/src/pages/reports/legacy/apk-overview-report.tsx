/**
 * APK-keuring overzicht: the APK status of every vehicle, four counts and a table with a
 * status filter. Does not read the expense category (a note says so once one is chosen).
 * Rights: report right + vehicles; it reads only the fleet.
 */
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ReportSection } from "@/components/reports/kit/report-section";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ReportTable, type ReportTableColumn, type ReportTableView } from "@/components/reports/kit/report-table";
import { useReportPrint } from "@/components/reports/kit/report-print";
import { formatDate, formatLicensePlate } from "@/lib/format-utils";
import { useReportBaseData, type ApkRow } from "../report-base-data";
import { CategoryIgnoredNote, ReportBaseStatus } from "./report-base-status";
import { tablePrintSection } from "./table-print";

export function ApkOverviewReport() {
  const { t } = useTranslation("reports");
  const base = useReportBaseData();
  const [status, setStatus] = useState("all");
  const [view, setView] = useState<ReportTableView<ApkRow> | null>(null);
  const list = base.apkStatusList;

  const count = (s: ApkRow["apkStatus"]) => list.filter((v) => v.apkStatus === s).length;
  const tiles = [
    { label: t("reportsPage.vehiclesTab.validApkStat"), value: String(count("valid")), className: "bg-slate-50" },
    { label: t("reportsPage.vehiclesTab.apkExpiring2to3Stat"), value: String(count("expiring_2to3_months")), className: "bg-yellow-50" },
    { label: t("reportsPage.vehiclesTab.apkExpiring30Stat"), value: String(count("expiring_soon")), className: "bg-amber-50" },
    { label: t("reportsPage.vehiclesTab.expiredApkStat"), value: String(count("expired")), className: "bg-red-50" },
  ];

  const rows = useMemo(() => list.filter((v) => status === "all" || v.apkStatus === status), [list, status]);

  const columns = useMemo<ReportTableColumn<ApkRow>[]>(() => {
    const statusOf = (v: ApkRow): { text: string; className: string } => {
      const days = v.daysUntilExpiry;
      if (days === null) return { text: t("reportsPage.common.notSet"), className: "bg-slate-100 text-slate-800" };
      if (days < 0) return { text: t("reportsPage.common.expired"), className: "bg-red-100 text-red-800" };
      if (days <= 30) return { text: t("reportsPage.common.expiresIn", { count: days }), className: "bg-amber-100 text-amber-800" };
      if (days <= 90) return { text: t("reportsPage.common.expiresIn", { count: days }), className: "bg-yellow-100 text-yellow-800" };
      return { text: t("reportsPage.common.valid"), className: "bg-green-100 text-green-800" };
    };
    const apkDate = (v: ApkRow) => (v.apkDate ? formatDate(v.apkDate) : t("reportsPage.common.notSet"));
    return [
      { id: "vehicle", label: t("reportsPage.common.vehicle"), cell: (v) => `${v.brand} ${v.model}`, text: (v) => `${v.brand} ${v.model}`, sortValue: (v) => `${v.brand} ${v.model}` },
      { id: "plate", label: t("reportsPage.common.licensePlate"), cell: (v) => formatLicensePlate(v.licensePlate), text: (v) => formatLicensePlate(v.licensePlate), sortValue: (v) => v.licensePlate },
      { id: "apkDate", label: t("reportsPage.vehiclesTab.apkExpiry"), cell: apkDate, text: apkDate, sortValue: (v) => (v.apkDate ? new Date(v.apkDate).getTime() : null) },
      {
        id: "status", label: t("common:fields.status"), align: "right",
        cell: (v) => { const s = statusOf(v); return <span className={`rounded-full px-2 py-1 text-xs ${s.className}`}>{s.text}</span>; },
        text: (v) => statusOf(v).text,
        sortValue: (v) => v.daysUntilExpiry,
      },
    ];
  }, [t]);

  useReportPrint([
    { kind: "tiles", tiles: tiles.map(({ label, value }) => ({ label, value })) },
    tablePrintSection({ id: "apk-overview", columns, rows, view }),
  ]);

  return (
    <div className="space-y-6">
      <ReportBaseStatus base={base} />
      <CategoryIgnoredNote category={base.selectedCategory} scope={t("reportsPage.filters.categoryScopeApkWarranty")} />
      <ReportSection
        testId="card-apk-overview-report"
        title={t("reportsPage.vehiclesTab.apkOverviewTitle")}
        description={t("reportsPage.vehiclesTab.apkOverviewDesc")}
        bodyClassName="space-y-4"
      >
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            {tiles.map((tile) => (
              <div key={tile.label} className={`flex flex-col rounded-md p-4 ${tile.className}`}>
                <span className="text-sm text-muted-foreground">{tile.label}</span>
                <span className="text-2xl font-bold">{tile.value}</span>
              </div>
            ))}
          </div>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-[220px]" data-testid="select-apk-status">
              <SelectValue placeholder={t("reportsPage.vehiclesTab.filterByStatusPlaceholder")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("reportsPage.vehiclesTab.allStatuses")}</SelectItem>
              <SelectItem value="expired">{t("reportsPage.common.expired")}</SelectItem>
              <SelectItem value="expiring_soon">{t("reportsPage.vehiclesTab.expiringSoon30")}</SelectItem>
              <SelectItem value="expiring_2to3_months">{t("reportsPage.vehiclesTab.expiring2to3Months")}</SelectItem>
              <SelectItem value="valid">{t("reportsPage.common.valid")}</SelectItem>
            </SelectContent>
          </Select>
          <ReportTable
            rows={rows}
            columns={columns}
            rowKey={(v) => v.id}
            searchPlaceholder={t("reportsPage.vehiclesTab.searchByPlateBrandModel")}
            testId="apk-overview-table"
            resetKey={status}
            onView={setView}
          />
      </ReportSection>
    </div>
  );
}
