/**
 * Rapporten herontwerp deel 1, Task 7: the key numbers of the Overzicht tab and the counts
 * in the report list. Each hook asks the SAME query (key and params) as the card of that
 * report, so TanStack Query serves both from one request. `enabled` is false when the
 * report is not visible to the user: then nothing is fetched.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { addMonths, differenceInDays, format, parseISO } from "date-fns";
import type { Vehicle } from "@shared/schema";
import type { FineReportSummary } from "@shared/reports/fines-report";
import { OCCUPANCY_MAX_DAYS, type OccupancySummary } from "@shared/reports/occupancy-report";
import { DEFAULT_OUTLOOK_HORIZON, type MaintenanceOutlookSummary } from "@shared/reports/maintenance-outlook-report";
import type { InboxItemReportSummary } from "@shared/reports/invoice-inbox-report";
import type { DeliveryReportSummary } from "@shared/reports/delivery-report";
import type { PortalRequestReportSummary } from "@shared/reports/portal-requests-report";
import { officeToday } from "@/lib/office-date";
import { useReportFilters, useReportPeriod, useReportRange } from "./report-filters";

export interface Metric<T> {
  /** null while loading, on an error and while the query is off. */
  value: T | null;
  loading: boolean;
}

const metric = <T,>(value: T | null | undefined, isLoading: boolean): Metric<T> => ({ value: value ?? null, loading: isLoading });

/** Total revenue minus costs of the period (same query as the vehicle-financials report). */
export function useMarginMetric(enabled: boolean): Metric<number> {
  const { from, to, vehicleId } = useReportFilters();
  const vehicleParam = vehicleId && vehicleId !== "all" ? `&vehicleId=${vehicleId}` : "";
  const { data, isLoading } = useQuery<{ totals?: { margin: number } }>({
    queryKey: [`/api/reports/vehicle-financials?from=${from}&to=${to}${vehicleParam}`],
    enabled,
  });
  return metric(data?.totals?.margin, enabled && isLoading);
}

/** Average occupancy of the period in percent (null without data or for a period the server refuses). */
export function useOccupancyMetric(enabled: boolean): Metric<number> & { tooLong: boolean } {
  const { from, to, vehicleId } = useReportRange({});
  const today = officeToday();
  const periodFrom = from ?? `${today.slice(0, 4)}-01-01`;
  const periodTo = to ?? today;
  const days = Math.round((Date.parse(`${periodTo}T00:00:00Z`) - Date.parse(`${periodFrom}T00:00:00Z`)) / 86_400_000) + 1;
  const tooLong = days > OCCUPANCY_MAX_DAYS;
  const vehicle = vehicleId && vehicleId !== "all" ? vehicleId : undefined;
  const params = useMemo<Record<string, string>>(
    () => ({ from: periodFrom, to: periodTo, ...(vehicle ? { vehicleId: vehicle } : {}) }),
    [periodFrom, periodTo, vehicle],
  );
  const { data, isLoading } = useQuery<OccupancySummary>({
    queryKey: ["/api/reports/occupancy/summary", params],
    enabled: enabled && !tooLong,
  });
  return { ...metric(data?.avgPct, enabled && !tooLong && isLoading), tooLong };
}

/** New fines (not yet linked). */
export function useFinesOpenMetric(enabled: boolean): Metric<number> {
  const { from, to, vehicleId } = useReportPeriod({});
  const params = useMemo<Record<string, string>>(
    () => ({ from, to, ...(vehicleId && vehicleId !== "all" ? { vehicleId } : {}) }),
    [from, to, vehicleId],
  );
  const { data, isLoading } = useQuery<FineReportSummary>({ queryKey: ["/api/reports/fines/summary", params], enabled });
  return metric(data?.tiles?.new?.count, enabled && isLoading);
}

/** Vehicles whose APK date has passed (the "verlopen" count of the APK report; same /api/vehicles list). */
export function useApkOverdueMetric(enabled: boolean): Metric<number> {
  const { data, isLoading } = useQuery<Vehicle[]>({ queryKey: ["/api/vehicles"], enabled });
  const value = useMemo(() => {
    if (!data) return null;
    const now = new Date();
    return data.filter((v) => v.apkDate && differenceInDays(new Date(v.apkDate), now) < 0).length;
  }, [data]);
  return metric(value, enabled && isLoading);
}

/** Maintenance (APK or service) that is already overdue. */
export function useMaintenanceOverdueMetric(enabled: boolean): Metric<number> {
  const { vehicleId } = useReportRange({});
  const from = officeToday();
  const to = format(addMonths(parseISO(from), DEFAULT_OUTLOOK_HORIZON), "yyyy-MM-dd");
  const vehicle = vehicleId && vehicleId !== "all" ? vehicleId : undefined;
  const params = useMemo<Record<string, string>>(
    () => ({ from, to, ...(vehicle ? { vehicleId: vehicle } : {}) }),
    [from, to, vehicle],
  );
  const { data, isLoading } = useQuery<MaintenanceOutlookSummary>({ queryKey: ["/api/reports/maintenance-outlook/summary", params], enabled });
  return metric(data?.tiles?.overdue?.count, enabled && isLoading);
}

/** Invoices from the mailbox that wait for a person. No vehicle in the params, like the card. */
export function useInvoicesWaitingMetric(enabled: boolean): Metric<number> {
  const { from, to } = useReportRange({});
  const params = useMemo<Record<string, string>>(() => ({ ...(from ? { from } : {}), ...(to ? { to } : {}) }), [from, to]);
  const { data, isLoading } = useQuery<InboxItemReportSummary>({ queryKey: ["/api/reports/invoice-inbox-items/summary", params], enabled });
  return metric(data?.tiles?.waiting?.count, enabled && isLoading);
}

/** Transports delivered after the planned day. */
export function useDeliveriesLateMetric(enabled: boolean): Metric<number> {
  const { from, to, vehicleId } = useReportRange({});
  const params = useMemo<Record<string, string>>(
    () => ({ ...(from ? { from } : {}), ...(to ? { to } : {}), ...(vehicleId && vehicleId !== "all" ? { vehicleId } : {}) }),
    [from, to, vehicleId],
  );
  const { data, isLoading } = useQuery<DeliveryReportSummary>({ queryKey: ["/api/reports/deliveries/summary", params], enabled });
  return metric(data?.tiles?.late?.count, enabled && isLoading);
}

/** Open portal requests (tile "open": new or in progress, created in the period). No vehicle, like the card. */
export function usePortalOpenMetric(enabled: boolean): Metric<number> {
  const { from, to } = useReportRange({});
  const params = useMemo<Record<string, string>>(() => ({ ...(from ? { from } : {}), ...(to ? { to } : {}) }), [from, to]);
  const { data, isLoading } = useQuery<PortalRequestReportSummary>({ queryKey: ["/api/reports/portal-requests/summary", params], enabled });
  return metric(data?.tiles?.open?.count, enabled && isLoading);
}
