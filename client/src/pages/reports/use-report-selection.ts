import { useCallback } from "react";
import { useSearch } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest, invalidateByPrefix } from "@/lib/queryClient";
import {
  REPORTS, REPORT_TABS, visibleReports, visibleTabs,
  type ReportAccess, type ReportDef, type ReportTabId,
} from "./report-registry";

export const REPORTS_LAST_SELECTED_KEY = "reports_last_selected";

type LastSelected = Record<string, string>;

function asLastSelected(value: unknown): LastSelected {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as LastSelected) : {};
}

/**
 * Current tab + report, kept in `?tab=&report=` and remembered per tab in the
 * user setting `reports_last_selected`. Unknown or forbidden ids fall back to
 * the remembered report, then to the first visible one.
 */
export function useReportSelection(access: ReportAccess, reports: ReportDef[] = REPORTS) {
  const search = useSearch();
  const { data } = useQuery<{ value?: unknown } | null>({
    queryKey: [`/api/user-settings/${REPORTS_LAST_SELECTED_KEY}`],
  });
  const last = asLastSelected(data?.value);

  const shown = visibleReports(access, reports);
  const tabs = visibleTabs(access, reports);
  const params = new URLSearchParams(search);

  const urlTab = params.get("tab") as ReportTabId | null;
  const tab: ReportTabId = urlTab && tabs.includes(urlTab) ? urlTab : (tabs[0] ?? REPORT_TABS[0]);

  const inTab = shown.filter((r) => r.tab === tab);
  const pick = (id: string | null | undefined) => inTab.find((r) => r.id === id)?.id;
  const reportId = pick(params.get("report")) ?? pick(last[tab]) ?? inTab[0]?.id ?? "";

  const select = useCallback((nextTab: ReportTabId, nextReport?: string) => {
    const nextInTab = shown.filter((r) => r.tab === nextTab);
    const id = nextInTab.find((r) => r.id === nextReport)?.id
      ?? nextInTab.find((r) => r.id === last[nextTab])?.id
      ?? nextInTab[0]?.id
      ?? "";
    const next = new URLSearchParams(window.location.search);
    next.set("tab", nextTab);
    if (id) next.set("report", id); else next.delete("report");
    window.history.replaceState(window.history.state, "", `${window.location.pathname}?${next.toString()}${window.location.hash}`);
    if (id && last[nextTab] !== id) {
      const value = { ...last, [nextTab]: id };
      void apiRequest("PUT", `/api/user-settings/${REPORTS_LAST_SELECTED_KEY}`, { value })
        .then(() => invalidateByPrefix("/api/user-settings"))
        .catch(() => { /* remembering is a convenience; the URL already holds the choice */ });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reports, access, JSON.stringify(last)]);

  return { tab, reportId, select };
}
