/**
 * Klantreserveringen in deze periode: every reservation of the period that has started
 * already (a booking that starts later is not listed), newest first. No longer only 10.
 * Rights: report right + customers + reservations. The vehicle column needs the vehicles
 * right and otherwise reads "Onbekend voertuig", as before.
 */
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Reservation } from "@shared/schema";
import { ReportTable, type ReportTableColumn, type ReportTableView } from "@/components/reports/kit/report-table";
import { EntityLink } from "@/components/reports/entity-link";
import { ReportSection } from "@/components/reports/kit/report-section";
import { useReportPrint } from "@/components/reports/kit/report-print";
import { formatDate, formatLicensePlate, formatReservationStatus } from "@/lib/format-utils";
import { useReportBaseData } from "../report-base-data";
import { useReportFilters } from "../report-filters";
import { ReportBaseStatus } from "./report-base-status";
import { tablePrintSection } from "./table-print";
import { useReportColumns } from "@/components/reports/kit/use-report-columns";
import { useReportExtraColumns, type ReportLinks } from "@/components/reports/kit/report-extra-columns";

const RESERVATION_LINKS: ReportLinks<Reservation> = { vehicleId: (r) => r.vehicleId, customerId: (r) => r.customerId };

export function RecentCustomerReservationsReport() {
  const { t } = useTranslation("reports");
  const base = useReportBaseData();
  const { from, to, vehicleId } = useReportFilters();
  const [view, setView] = useState<ReportTableView<Reservation> | null>(null);
  const { vehicles, customers, recentCustomerReservations: rows } = base;

  const baseColumns = useMemo<ReportTableColumn<Reservation>[]>(() => {
    const customerName = (r: Reservation) => customers.find((c) => c.id === r.customerId)?.name || t("reportsPage.common.unknown");
    const vehicleName = (r: Reservation) => {
      const vehicle = vehicles.find((v) => v.id === r.vehicleId);
      return vehicle ? `${vehicle.brand} ${vehicle.model} (${formatLicensePlate(vehicle.licensePlate)})` : t("reportsPage.common.unknownVehicle");
    };
    const endDate = (r: Reservation) => (r.endDate ? formatDate(r.endDate) : t("reportsPage.customersTab.openEnded"));
    return [
      { id: "customer", label: t("reportsPage.common.customer"), cell: (r) => <EntityLink kind="customer" id={r.customerId} label={customerName(r)} />, text: customerName, sortValue: customerName },
      { id: "vehicle", label: t("reportsPage.common.vehicle"), cell: (r) => <EntityLink kind="vehicle" id={r.vehicleId} label={vehicleName(r)} />, text: vehicleName, sortValue: vehicleName },
      { id: "start", label: t("common:fields.startDate"), cell: (r) => <EntityLink kind="reservation" id={r.id} label={formatDate(r.startDate)} />, text: (r) => formatDate(r.startDate), sortValue: (r) => new Date(r.startDate).getTime() },
      { id: "end", label: t("common:fields.endDate"), cell: endDate, text: endDate, sortValue: (r) => (r.endDate ? new Date(r.endDate).getTime() : null) },
      { id: "status", label: t("common:fields.status"), cell: (r) => formatReservationStatus(r.status), text: (r) => formatReservationStatus(r.status), sortValue: (r) => formatReservationStatus(r.status) },
    ];
  }, [t, vehicles, customers]);
  // Kolommen: hide/show columns and the extra fields of the linked car/customer (per user).
  const extraColumns = useReportExtraColumns("customer-reservations", RESERVATION_LINKS);
  const { columns, menu } = useReportColumns("customer-reservations", baseColumns, extraColumns);

  useReportPrint([tablePrintSection({ id: "customer-reservations", columns, rows, view })]);

  return (
    <div className="space-y-6">
      <ReportBaseStatus base={base} />
      <ReportSection testId="card-customer-reservations-report" title={t("reportsPage.reports.customerReservations")} description={t("reportsPage.reports.customerReservationsDesc")}>
          <ReportTable
            rows={rows}
            columns={columns}
            rowKey={(r) => r.id}
            testId="customer-recent-reservations"
            resetKey={`${from}|${to}|${vehicleId}`}
            onView={setView}
            toolbar={menu}
          />
        </ReportSection>
    </div>
  );
}
