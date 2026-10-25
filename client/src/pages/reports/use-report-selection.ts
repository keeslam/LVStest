import { useCallback, useEffect, useRef } from "react";
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
 *
 * `ready` is false while the setting loads; until then the report id comes from
 * the URL only (or "") so the shell can wait instead of flashing the first report.
 */
export function useReportSelection(access: ReportAccess, reports: ReportDef[] = REPORTS) {
  const search = useSearch();
  const { data, status } = useQuery<{ value?: unknown } | null>({
    queryKey: [`/api/user-settings/${REPORTS_LAST_SELECTED_KEY}`],
  });
  const ready = status !== "pending";
  const serverLast = asLastSelected(data?.value);
  // Choices made in this session; they win over the (possibly stale) loaded value.
  const written = useRef<LastSelected>({});
  const dirty = useRef(false);
  const last: LastSelected = { ...serverLast, ...written.current };

  const shown = visibleReports(access, reports);
  const tabs = visibleTabs(access, reports);
  const params = new URLSearchParams(search);

  const urlTab = params.get("tab") as ReportTabId | null;
  const tab: ReportTabId = urlTab && tabs.includes(urlTab) ? urlTab : (tabs[0] ?? REPORT_TABS[0]);

  const inTab = shown.filter((r) => r.tab === tab);
  const pick = (id: string | null | undefined) => inTab.find((r) => r.id === id)?.id;
  const reportId = ready
    ? (pick(params.get("report")) ?? pick(last[tab]) ?? inTab[0]?.id ?? "")
    : (pick(params.get("report")) ?? "");

  const put = useCallback((value: LastSelected) => {
    void apiRequest("PUT", `/api/user-settings/${REPORTS_LAST_SELECTED_KEY}`, { value })
      .then(() => invalidateByPrefix("/api/user-settings"))
      .catch(() => { /* remembering is a convenience; the URL already holds the choice */ });
  }, []);

  // Latest render values for the stable select().
  const latest = useRef({ shown, ready, serverLast });
  latest.current = { shown, ready, serverLast };

  // A choice made while loading is written once the setting has arrived, merged into it.
  useEffect(() => {
    if (ready && dirty.current) {
      dirty.current = false;
      put({ ...latest.current.serverLast, ...written.current });
    }
  }, [ready, put]);

  const select = useCallback((nextTab: ReportTabId, nextReport?: string) => {
    const { shown: now, ready: isReady, serverLast: server } = latest.current;
    const current = { ...server, ...written.current };
    const nextInTab = now.filter((r) => r.tab === nextTab);
    const id = nextInTab.find((r) => r.id === nextReport)?.id
      ?? (isReady ? nextInTab.find((r) => r.id === current[nextTab])?.id : undefined)
      ?? nextInTab[0]?.id
      ?? "";
    const next = new URLSearchParams(window.location.search);
    next.set("tab", nextTab);
    if (id) next.set("report", id); else next.delete("report");
    window.history.replaceState(window.history.state, "", `${window.location.pathname}?${next.toString()}${window.location.hash}`);
    if (!id || !nextReport || current[nextTab] === id) return;
    written.current = { ...written.current, [nextTab]: id };
    if (isReady) put({ ...server, ...written.current });
    else dirty.current = true;
  }, [put]);

  return { tab, reportId, ready, select };
}
