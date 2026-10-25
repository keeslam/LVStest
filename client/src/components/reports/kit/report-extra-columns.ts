/**
 * Rapporten herontwerp deel 3, Task 3: the extra fields of the Kolommen button. Only many-to-one
 * links: the car of a row (plate, make, model) and the customer of a row (name). A field is only
 * offered with the right to see that record (the same right as /api/vehicles and /api/customers);
 * the data comes from those (shared, cached) lists and is only fetched while an extra field of
 * that kind is switched on.
 */
import { createElement, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import type { TFunction } from "i18next";
import { UserPermission, type Customer, type Vehicle } from "@shared/schema";
import { useHasPermission } from "@/hooks/use-has-permission";
import { EntityLink } from "@/components/reports/entity-link";
import { formatLicensePlate } from "@/lib/format-utils";
import type { ReportTableColumn } from "./report-table";
import type { ReportColumn } from "./report-detail-dialog";
import { useEffectiveReportColumnsChoice } from "./use-report-columns";

type LinkId = number | null | undefined;

/** How a row names its car and its customer; leave one out when the row has no such link. */
export interface ReportLinks<R> {
  vehicleId?: (r: R) => LinkId;
  customerId?: (r: R) => LinkId;
}

/** What the user may see: the vehicles right and the customers right. */
export interface ReportExtrasAccess {
  vehicles: boolean;
  customers: boolean;
}

export const VEHICLE_EXTRA_IDS = ["vehicle.licensePlate", "vehicle.brand", "vehicle.model"] as const;
export const CUSTOMER_EXTRA_IDS = ["customer.name"] as const;

const textColumn = <R,>(id: string, label: string, text: (r: R) => string): ReportTableColumn<R> => ({
  id, label, cell: text, text, sortValue: (r) => text(r) || null,
});

/** Plate, make and model of the row's car; none without the vehicles right. */
export function vehicleExtras<R>(
  access: ReportExtrasAccess,
  vehiclesById: Map<number, Vehicle>,
  vehicleId: (r: R) => LinkId,
  t: TFunction,
): ReportTableColumn<R>[] {
  if (!access.vehicles) return [];
  const of = (r: R) => { const id = vehicleId(r); return id == null ? undefined : vehiclesById.get(id); };
  const plate = (r: R) => { const v = of(r); return v?.licensePlate ? formatLicensePlate(v.licensePlate) : ""; };
  return [
    { ...textColumn<R>("vehicle.licensePlate", t("reportKit.columns.plate"), plate), cell: (r) => (plate(r) ? createElement(EntityLink, { kind: "vehicle", id: vehicleId(r), label: plate(r) }) : "") },
    textColumn<R>("vehicle.brand", t("reportKit.columns.brand"), (r) => of(r)?.brand ?? ""),
    textColumn<R>("vehicle.model", t("reportKit.columns.model"), (r) => of(r)?.model ?? ""),
  ];
}

/** The name of the row's customer; none without the customers right. */
export function customerExtras<R>(
  access: ReportExtrasAccess,
  customersById: Map<number, Customer>,
  customerId: (r: R) => LinkId,
  t: TFunction,
): ReportTableColumn<R>[] {
  if (!access.customers) return [];
  const name = (r: R) => { const id = customerId(r); return (id == null ? undefined : customersById.get(id)?.name) ?? ""; };
  return [
    { ...textColumn<R>("customer.name", t("reportKit.columns.customerName"), name), cell: (r) => (name(r) ? createElement(EntityLink, { kind: "customer", id: customerId(r), label: name(r) }) : "") },
  ];
}

const NO_VEHICLES: Vehicle[] = [];
const NO_CUSTOMERS: Customer[] = [];

/**
 * The extra fields a report list may offer, for useReportColumns. The car and customer lists are
 * fetched only when the user has switched on an extra field of that kind for this report.
 */
export function useReportExtraColumns<R>(reportId: string, links: ReportLinks<R>): ReportTableColumn<R>[] {
  const { t } = useTranslation("reports");
  const access: ReportExtrasAccess = {
    vehicles: useHasPermission(UserPermission.VIEW_VEHICLES, UserPermission.MANAGE_VEHICLES),
    customers: useHasPermission(UserPermission.VIEW_CUSTOMERS, UserPermission.MANAGE_CUSTOMERS),
  };
  // The same choice the columns on screen come from (this session first, then the loaded one).
  const { choice } = useEffectiveReportColumnsChoice(reportId);
  const on = new Set(choice?.extra ?? []);
  const wantVehicles = !!links.vehicleId && access.vehicles && VEHICLE_EXTRA_IDS.some((id) => on.has(id));
  const wantCustomers = !!links.customerId && access.customers && CUSTOMER_EXTRA_IDS.some((id) => on.has(id));
  const { data: vehicles = NO_VEHICLES } = useQuery<Vehicle[]>({ queryKey: ["/api/vehicles"], enabled: wantVehicles });
  const { data: customers = NO_CUSTOMERS } = useQuery<Customer[]>({ queryKey: ["/api/customers"], enabled: wantCustomers });

  const { vehicleId, customerId } = links;
  const { vehicles: mayVehicles, customers: mayCustomers } = access;
  return useMemo(() => {
    const allowed = { vehicles: mayVehicles, customers: mayCustomers };
    return [
      ...(vehicleId ? vehicleExtras(allowed, new Map(vehicles.map((v) => [v.id, v])), vehicleId, t) : []),
      ...(customerId ? customerExtras(allowed, new Map(customers.map((c) => [c.id, c])), customerId, t) : []),
    ];
  }, [vehicleId, customerId, mayVehicles, mayCustomers, vehicles, customers, t]);
}

/** An extra field as a column of ReportDetailDialog (server-sorted lists: not sortable). */
export function toDetailColumn<R, S extends string>(c: ReportTableColumn<R>): ReportColumn<R, S> {
  return { id: c.id, label: c.label, cell: c.cell, csv: c.text, print: c.text };
}
