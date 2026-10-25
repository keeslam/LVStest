import type { ComponentType } from "react";
import {
  useApkOverdueMetric, useDeliveriesLateMetric, useFinesOpenMetric, useInvoicesWaitingMetric,
  useMaintenanceOverdueMetric, usePortalOpenMetric, type Metric,
} from "./report-metrics";

/**
 * A small number next to a report in the list. The list shows only reports the user may see,
 * so the query is on; nothing is drawn while loading or when the count is 0.
 */
function makeBadge(id: string, useMetric: (enabled: boolean) => Metric<number>): ComponentType<{ inline?: boolean }> {
  function ReportBadge({ inline }: { inline?: boolean }) {
    const { value } = useMetric(true);
    if (!value || value <= 0) return null;
    // Inline: plain text for a select option, where a coloured pill cannot be drawn: "Bekeuringen (3)".
    if (inline) return <span data-testid={`report-nav-count-${id}`}>{`(${value.toLocaleString("nl-NL")})`}</span>;
    return (
      <span
        className="min-w-[1.5rem] rounded-full bg-red-100 px-2 py-0.5 text-center text-xs font-semibold text-red-700"
        data-testid={`report-nav-badge-${id}`}
      >
        {value.toLocaleString("nl-NL")}
      </span>
    );
  }
  return ReportBadge;
}

export const FinesBadge = makeBadge("fines", useFinesOpenMetric);
export const ApkOverviewBadge = makeBadge("apk-overview", useApkOverdueMetric);
export const MaintenanceOutlookBadge = makeBadge("maintenance-outlook", useMaintenanceOverdueMetric);
export const InvoiceInboxItemsBadge = makeBadge("invoice-inbox-items", useInvoicesWaitingMetric);
export const DeliveriesBadge = makeBadge("deliveries", useDeliveriesLateMetric);
export const PortalRequestsBadge = makeBadge("portal-requests", usePortalOpenMetric);
