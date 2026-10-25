/**
 * Voertuigtransporten: swaps, tows, repossessions and other vehicle moves, with toll and
 * billing. Known gap kept as it is: the period and vehicle of the filter bar do not apply
 * (the pane says so); the type and status selects do. Ticked rows can be printed alone.
 * Rights: report right + vehicles or reservations (GET /api/transports accepts either family).
 */
import { useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Car, DollarSign, FileText } from "lucide-react";
import type { VehicleTransport } from "@shared/schema";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ReportSection } from "@/components/reports/kit/report-section";
import { Checkbox } from "@/components/ui/checkbox";
import { Price } from "@/components/ui/price";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ReportTable, type ReportTableColumn, type ReportTableView } from "@/components/reports/kit/report-table";
import { EntityLink } from "@/components/reports/entity-link";
import { useReportPrint } from "@/components/reports/kit/report-print";
import { formatCurrency, formatDate, formatLicensePlate, sumMoney } from "@/lib/format-utils";
import { useReportBaseData } from "../report-base-data";
import { CategoryIgnoredNote } from "./report-base-status";
import { tablePrintSection } from "./table-print";

export function TransportsReport() {
  const { t } = useTranslation("reports");
  const base = useReportBaseData();
  const { transports, vehicles } = base;
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [view, setView] = useState<ReportTableView<VehicleTransport> | null>(null);

  const typeLabels: Record<string, string> = useMemo(() => ({
    swap: t("reportsPage.transportsTab.transportTypes.swap"),
    tow: t("reportsPage.transportsTab.transportTypes.tow"),
    repossession: t("reportsPage.transportsTab.transportTypes.repossession"),
    delivery: t("reportsPage.transportsTab.transportTypes.delivery"),
    other: t("reportsPage.transportsTab.transportTypes.other"),
  }), [t]);

  const rows = useMemo(() => transports.filter((tr) => {
    if (typeFilter !== "all" && tr.transportType !== typeFilter) return false;
    if (statusFilter !== "all" && tr.status !== statusFilter) return false;
    return true;
  }), [transports, typeFilter, statusFilter]);

  const totalToll = sumMoney(rows.filter((tr) => tr.tollCost), (tr) => Number(tr.tollCost));
  const pendingBilling = sumMoney(rows.filter((tr) => tr.billable && !tr.invoiced), (tr) => Number(tr.billableAmount || 0));

  // The columns that are printed and searched; the checkbox column comes in front of them on screen.
  const columns = useMemo<ReportTableColumn<VehicleTransport>[]>(() => {
    const vehicleName = (tr: VehicleTransport) => {
      const vehicle = tr.vehicle || vehicles.find((v) => v.id === tr.vehicleId);
      return vehicle ? `${vehicle.brand} ${vehicle.model} (${formatLicensePlate(vehicle.licensePlate)})` : t("reportsPage.common.unknown");
    };
    const route = (tr: VehicleTransport) => [tr.originCity, tr.destinationCity].filter(Boolean).join(" → ") || "-";
    const toll = (tr: VehicleTransport) => (tr.tollCost ? formatCurrency(Number(tr.tollCost)) : "-");
    const billing = (tr: VehicleTransport) => (tr.billable
      ? `${tr.billableAmount ? formatCurrency(Number(tr.billableAmount)) : "-"} (${tr.invoiced ? t("reportsPage.transportsTab.invoiced") : t("reportsPage.transportsTab.notInvoiced")})`
      : t("reportsPage.transportsTab.notBillable"));
    const status = (tr: VehicleTransport) => tr.status.replace(/_/g, " ");
    const type = (tr: VehicleTransport) => typeLabels[tr.transportType] || tr.transportType;
    return [
      { id: "vehicle", label: t("reportsPage.common.vehicle"), cell: (tr) => <span className="font-medium"><EntityLink kind="vehicle" id={tr.vehicleId} label={vehicleName(tr)} /></span>, text: vehicleName, sortValue: vehicleName },
      { id: "type", label: t("common:fields.type"), cell: (tr) => <Badge variant="outline">{type(tr)}</Badge>, text: type, sortValue: type },
      { id: "route", label: t("reportsPage.transportsTab.route"), cell: route, text: route },
      { id: "date", label: t("common:fields.date"), cell: (tr) => formatDate(tr.scheduledDate), text: (tr) => formatDate(tr.scheduledDate), sortValue: (tr) => (tr.scheduledDate ? new Date(tr.scheduledDate).getTime() : null) },
      { id: "toll", label: t("reportsPage.transportsTab.tollCost"), cell: toll, text: toll, sortValue: (tr) => Number(tr.tollCost || 0) },
      { id: "billing", label: t("reportsPage.transportsTab.billing"), cell: billing, text: billing },
      { id: "status", label: t("common:fields.status"), cell: (tr) => <span className="capitalize">{status(tr)}</span>, text: status, sortValue: status },
    ];
  }, [t, vehicles, typeLabels]);

  const screenColumns = useMemo<ReportTableColumn<VehicleTransport>[]>(() => [
    {
      id: "select", label: "", text: () => "",
      cell: (tr) => (
        <Checkbox
          checked={selectedIds.includes(tr.id)}
          onCheckedChange={(checked) => setSelectedIds((prev) => (checked ? [...prev, tr.id] : prev.filter((id) => id !== tr.id)))}
          aria-label={t("reportsPage.reports.selectRow")}
          data-testid={`checkbox-select-transport-report-${tr.id}`}
        />
      ),
    },
    ...columns,
  ], [columns, selectedIds, t]);

  const selected = rows.filter((tr) => selectedIds.includes(tr.id));
  // "Alleen aangevinkte" prints in the order of the table on screen (sorted and searched); ticked rows
  // the search hides come last.
  const onScreen = view ? [...view.all, ...rows.filter((tr) => !view.all.includes(tr))] : rows;
  const selectedInScreenOrder = onScreen.filter((tr) => selectedIds.includes(tr.id));
  useReportPrint([
    {
      kind: "tiles",
      tiles: [
        { label: t("reportsPage.transportsTab.totalTollCost"), value: formatCurrency(totalToll) },
        { label: t("reportsPage.transportsTab.pendingBilling"), value: formatCurrency(pendingBilling) },
        { label: t("reportsPage.transportsTab.transportsListed"), value: String(rows.length) },
      ],
    },
    tablePrintSection({ id: "transports", columns, rows, view, selected: selectedInScreenOrder }),
  ]);

  const tile = (label: string, value: ReactNode, icon: ReactNode, tone: string) => (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-500">{label}</p>
            <p className="text-2xl font-bold">{value}</p>
          </div>
          <div className={`flex h-12 w-12 items-center justify-center rounded-full ${tone}`}>{icon}</div>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      <CategoryIgnoredNote category={base.selectedCategory} scope={t("reportsPage.filters.categoryScopeTab")} />
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {tile(t("reportsPage.transportsTab.totalTollCost"), <Price value={totalToll} />, <DollarSign className="h-6 w-6 text-blue-600" />, "bg-blue-100")}
        {tile(t("reportsPage.transportsTab.pendingBilling"), <Price value={pendingBilling} />, <FileText className="h-6 w-6 text-amber-600" />, "bg-amber-100")}
        {tile(t("reportsPage.transportsTab.transportsListed"), rows.length, <Car className="h-6 w-6 text-purple-600" />, "bg-purple-100")}
      </div>

      <ReportSection
        testId="card-transports-report"
        title={t("reportsPage.transportsTab.cardTitle")}
        description={t("reportsPage.transportsTab.cardDesc")}
        bodyClassName="space-y-2"
      >
            <div className="flex flex-wrap items-center gap-2">
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-[150px]" data-testid="select-report-transport-type">
                  <SelectValue placeholder={t("reportsPage.transportsTab.allTypesPlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("reportsPage.transportsTab.allTypesOption")}</SelectItem>
                  {Object.entries(typeLabels).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[150px]" data-testid="select-report-transport-status">
                  <SelectValue placeholder={t("reportsPage.transportsTab.allStatusesPlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("reportsPage.vehiclesTab.allStatuses")}</SelectItem>
                  <SelectItem value="scheduled">{t("reportsPage.transportsTab.scheduled")}</SelectItem>
                  <SelectItem value="in_progress">{t("reportsPage.transportsTab.inProgress")}</SelectItem>
                  <SelectItem value="completed">{t("common:status.completed")}</SelectItem>
                  <SelectItem value="cancelled">{t("common:status.cancelled")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={rows.length > 0 && selected.length === rows.length}
              onCheckedChange={(checked) => setSelectedIds(checked ? rows.map((tr) => tr.id) : [])}
              data-testid="checkbox-select-all-transports-report"
            />
            {t("reportsPage.reports.selectAll")}
            {selected.length > 0 && <span className="text-muted-foreground">({selected.length})</span>}
          </label>
          <ReportTable
            rows={rows}
            columns={screenColumns}
            rowKey={(tr) => tr.id}
            testId="transports-table"
            resetKey={`${typeFilter}|${statusFilter}`}
            onView={setView}
          />
      </ReportSection>
    </div>
  );
}
