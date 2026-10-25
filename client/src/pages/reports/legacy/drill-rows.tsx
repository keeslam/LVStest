/**
 * Rapporten herontwerp deel 1b, Task 2: the rows behind a number of a browser-computed report.
 * A report keeps `useLegacyDrill()`; a tile, a chart bar or a table line calls `open` with the
 * costs and/or reservations it adds up, and `LegacyRowsDialog` shows them (ReportRowsDialog:
 * table, CSV, Afdrukken). The columns are the ones of "Kosten in periode" and "Reserveringen
 * van klanten".
 */
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Customer, Expense, Reservation, Vehicle } from "@shared/schema";
import { Price } from "@/components/ui/price";
import { ReportRowsDialog, csvSlug, rowsPart } from "@/components/reports/kit/report-rows-dialog";
import { EntityLink } from "@/components/reports/entity-link";
import type { ReportTableColumn } from "@/components/reports/kit/report-table";
import { formatCurrency, formatDate, formatExpenseCategory, formatLicensePlate, formatReservationStatus } from "@/lib/format-utils";

export interface LegacyDrill {
  title: string;
  expenses?: Expense[];
  reservations?: Reservation[];
}

/** The open drill of a report; `open` keeps the arrays it is given (no copy). */
export function useLegacyDrill() {
  const [drill, setDrill] = useState<LegacyDrill | null>(null);
  const open = useCallback((next: LegacyDrill) => setDrill(next), []);
  const close = useCallback(() => setDrill(null), []);
  return { drill, open, close };
}

/** The same cost can be counted under two reservations of one car; a list shows it once. */
export const uniqueExpenses = (expenses: Expense[]): Expense[] => {
  const seen = new Set<number>();
  return expenses.filter((e) => (seen.has(e.id) ? false : (seen.add(e.id), true)));
};

/** "<number> · <line>": what was clicked, in the dialog title. */
export const drillTitleOf = (...parts: Array<string | undefined>) => parts.filter(Boolean).join(" · ");

function useVehicleName(vehicles: Vehicle[]) {
  const { t } = useTranslation("reports");
  return useMemo(() => {
    const byId = new Map(vehicles.map((v) => [v.id, v]));
    return (vehicleId: number | null) => {
      const vehicle = vehicleId == null ? undefined : byId.get(vehicleId);
      return vehicle ? `${vehicle.brand} ${vehicle.model} (${formatLicensePlate(vehicle.licensePlate)})` : t("reportsPage.common.unknownVehicle");
    };
  }, [vehicles, t]);
}

export function useExpenseRowColumns(vehicles: Vehicle[]): ReportTableColumn<Expense>[] {
  const { t } = useTranslation("reports");
  const vehicleName = useVehicleName(vehicles);
  return useMemo<ReportTableColumn<Expense>[]>(() => [
    { id: "date", label: t("common:fields.date"), cell: (e) => formatDate(e.date), text: (e) => formatDate(e.date), sortValue: (e) => new Date(e.date).getTime() },
    { id: "vehicle", label: t("reportsPage.common.vehicle"), cell: (e) => <EntityLink kind="vehicle" id={e.vehicleId} label={vehicleName(e.vehicleId)} />, text: (e) => vehicleName(e.vehicleId), sortValue: (e) => vehicleName(e.vehicleId) },
    { id: "category", label: t("reportsPage.common.category"), cell: (e) => formatExpenseCategory(e.category), text: (e) => formatExpenseCategory(e.category), sortValue: (e) => formatExpenseCategory(e.category) },
    { id: "description", label: t("common:fields.description"), cell: (e) => e.description, text: (e) => e.description ?? "" },
    { id: "amount", label: t("common:fields.amount"), cell: (e) => <Price value={Number(e.amount)} />, text: (e) => formatCurrency(Number(e.amount)), sortValue: (e) => Number(e.amount), align: "right" },
  ], [t, vehicleName]);
}

export function useReservationRowColumns(vehicles: Vehicle[], customers: Customer[]): ReportTableColumn<Reservation>[] {
  const { t } = useTranslation("reports");
  const vehicleName = useVehicleName(vehicles);
  return useMemo<ReportTableColumn<Reservation>[]>(() => {
    const byId = new Map(customers.map((c) => [c.id, c]));
    const customerName = (r: Reservation) => (r.customerId != null && byId.get(r.customerId)?.name) || t("reportsPage.common.unknown");
    const endDate = (r: Reservation) => (r.endDate ? formatDate(r.endDate) : t("reportsPage.customersTab.openEnded"));
    return [
      { id: "customer", label: t("reportsPage.common.customer"), cell: (r) => <EntityLink kind="customer" id={r.customerId} label={customerName(r)} />, text: customerName, sortValue: customerName },
      { id: "vehicle", label: t("reportsPage.common.vehicle"), cell: (r) => <EntityLink kind="vehicle" id={r.vehicleId} label={vehicleName(r.vehicleId)} />, text: (r) => vehicleName(r.vehicleId), sortValue: (r) => vehicleName(r.vehicleId) },
      { id: "start", label: t("common:fields.startDate"), cell: (r) => <EntityLink kind="reservation" id={r.id} label={formatDate(r.startDate)} />, text: (r) => formatDate(r.startDate), sortValue: (r) => new Date(r.startDate).getTime() },
      { id: "end", label: t("common:fields.endDate"), cell: endDate, text: endDate, sortValue: (r) => (r.endDate ? new Date(r.endDate).getTime() : null) },
      { id: "status", label: t("common:fields.status"), cell: (r) => formatReservationStatus(r.status), text: (r) => formatReservationStatus(r.status), sortValue: (r) => formatReservationStatus(r.status) },
    ];
  }, [t, vehicleName, customers]);
}

/** The dialog of `useLegacyDrill`: costs, reservations, or reservations with their costs under them. */
export function LegacyRowsDialog({ drill, onClose, vehicles, customers }: {
  drill: LegacyDrill | null;
  onClose: () => void;
  vehicles: Vehicle[];
  customers: Customer[];
}) {
  const { t } = useTranslation("reports");
  const expenseColumns = useExpenseRowColumns(vehicles);
  const reservationColumns = useReservationRowColumns(vehicles, customers);
  const title = drill?.title ?? "";
  const slug = csvSlug(title);
  const more = useMemo(() => (drill?.reservations && drill.expenses
    ? [rowsPart({ title: t("expenseChart.expenses"), rows: drill.expenses, columns: expenseColumns, csvName: `${slug}-${csvSlug(t("expenseChart.expenses"))}` })]
    : undefined), [drill, expenseColumns, slug, t]);

  if (drill?.reservations) {
    return (
      <ReportRowsDialog<Reservation>
        open
        onOpenChange={(o) => { if (!o) onClose(); }}
        title={title}
        rows={drill.reservations}
        columns={reservationColumns}
        rowsTitle={more ? t("reportsPage.common.reservations") : undefined}
        csvName={more ? `${slug}-${csvSlug(t("reportsPage.common.reservations"))}` : slug}
        more={more}
        testId="legacy-rows"
      />
    );
  }
  return (
    <ReportRowsDialog<Expense>
      open={drill !== null}
      onOpenChange={(o) => { if (!o) onClose(); }}
      title={title}
      rows={drill?.expenses ?? NO_EXPENSES}
      columns={expenseColumns}
      csvName={slug}
      testId="legacy-rows"
    />
  );
}

const NO_EXPENSES: Expense[] = [];
