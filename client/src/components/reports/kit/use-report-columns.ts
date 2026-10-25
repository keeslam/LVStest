/**
 * Rapporten herontwerp deel 3, Task 3: the Kolommen button of a fixed report. Which columns a user
 * hides and which extra fields (plate, make, model of the car; customer name) a user adds is kept
 * per user in the user setting `report_columns`: `{ [reportId]: { hidden: string[]; extra: string[] } }`.
 * "Terug naar standaard" removes the report's key. Ids that a report no longer has are ignored.
 *
 * Works for every column type with an `id` and a `label` (ReportTable and ReportDetailDialog
 * columns), so the screen, CSV and print all use the `columns` this hook returns.
 */
import { createElement, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest, invalidateByPrefix } from "@/lib/queryClient";
import { ReportColumnsMenu } from "./report-columns-menu";

export const REPORT_COLUMNS_KEY = "report_columns";
export const REPORT_COLUMNS_QUERY_KEY = [`/api/user-settings/${REPORT_COLUMNS_KEY}`];

export interface ReportColumnsChoice {
  hidden: string[];
  extra: string[];
}

export type ReportColumnsSetting = Record<string, ReportColumnsChoice>;

const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];

/** The stored value, made safe: anything that is not the expected shape is left out. */
export function asReportColumnsSetting(value: unknown): ReportColumnsSetting {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: ReportColumnsSetting = {};
  for (const [id, choice] of Object.entries(value as Record<string, unknown>)) {
    if (!choice || typeof choice !== "object" || Array.isArray(choice)) continue;
    const c = choice as { hidden?: unknown; extra?: unknown };
    out[id] = { hidden: strings(c.hidden), extra: strings(c.extra) };
  }
  return out;
}

type SettingData = { value?: unknown; source?: string } | null;

/**
 * The choice of one report, and a writer that is safe against a setting still loading and
 * against other reports writing the same setting: every write merges into the newest value
 * (the query cache, updated at once) and a write made while loading waits for the value.
 */
export function useReportColumnsChoice(reportId: string) {
  const queryClient = useQueryClient();
  const { data, status } = useQuery<SettingData>({ queryKey: REPORT_COLUMNS_QUERY_KEY });
  const ready = status !== "pending";
  // The choice made in this session for this report: wins over a (possibly stale) loaded value.
  // `undefined` = nothing chosen here, `null` = reset.
  const [own, setOwn] = useState<ReportColumnsChoice | null | undefined>(undefined);
  const written = useRef(own);
  const dirty = useRef(false);

  const server = asReportColumnsSetting(data?.value);
  const choice: ReportColumnsChoice | undefined = own === undefined ? server[reportId] : own ?? undefined;

  const write = useCallback(() => {
    const cached = queryClient.getQueryData<SettingData>(REPORT_COLUMNS_QUERY_KEY);
    const next = { ...asReportColumnsSetting(cached?.value) };
    if (written.current) next[reportId] = written.current;
    else delete next[reportId];
    queryClient.setQueryData<SettingData>(REPORT_COLUMNS_QUERY_KEY, (old) => ({ ...(old ?? {}), value: next }));
    void apiRequest("PUT", `/api/user-settings/${REPORT_COLUMNS_KEY}`, { value: next })
      .catch(() => invalidateByPrefix("/api/user-settings"));
  }, [queryClient, reportId]);

  const latestReady = useRef(ready);
  latestReady.current = ready;

  useEffect(() => {
    if (ready && dirty.current) {
      dirty.current = false;
      write();
    }
  }, [ready, write]);

  const set = useCallback((next: ReportColumnsChoice | null) => {
    written.current = next;
    setOwn(next);
    if (latestReady.current) write();
    else dirty.current = true;
  }, [write]);

  return { choice, ready, set };
}

interface ColumnLike { id: string; label: string }

/**
 * The columns a report shows, after the user's choice: the report's own columns minus the hidden
 * ones, then the extra fields that are switched on (in the order of `extras`). Unknown ids in the
 * stored choice do nothing. `menu` is the Kolommen button for next to the table.
 */
export function useReportColumns<C extends ColumnLike>(reportId: string, baseColumns: C[], extras: C[] = NO_EXTRAS as C[]): { columns: C[]; menu: ReactNode } {
  const { choice, set } = useReportColumnsChoice(reportId);
  const hiddenKey = (choice?.hidden ?? []).join("\u0001");
  const extraKey = (choice?.extra ?? []).join("\u0001");

  const columns = useMemo(() => {
    const hidden = new Set(hiddenKey ? hiddenKey.split("\u0001") : []);
    const extra = new Set(extraKey ? extraKey.split("\u0001") : []);
    const own = baseColumns.filter((c) => !hidden.has(c.id));
    // Never an empty table: when every own column is hidden (an old choice), show them all.
    const shownOwn = own.length > 0 ? own : baseColumns;
    return [...shownOwn, ...extras.filter((c) => extra.has(c.id))];
  }, [baseColumns, extras, hiddenKey, extraKey]);

  const menu = createElement(ReportColumnsMenu, {
    reportId,
    columns: baseColumns.map((c) => ({ id: c.id, label: c.label })),
    extras: extras.map((c) => ({ id: c.id, label: c.label })),
    value: choice ?? null,
    onChange: set,
  });

  return { columns, menu };
}

const NO_EXTRAS: ColumnLike[] = [];
