/**
 * Rapporten herontwerp deel 3, Task 3: the Kolommen button of a fixed report. Which columns a user
 * hides and which extra fields (plate, make, model of the car; customer name) a user adds is kept
 * per user in the user setting `report_columns`: `{ [reportId]: { hidden: string[]; extra: string[] } }`.
 * "Terug naar standaard" removes the report's key. Ids that a report no longer has are ignored.
 *
 * Works for every column type with an `id` and a `label` (ReportTable and ReportDetailDialog
 * columns), so the screen, CSV and print all use the `columns` this hook returns.
 */
import { createElement, useCallback, useEffect, useMemo, useRef, useSyncExternalStore, type ReactNode } from "react";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
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

// ---- Choices made in this session ----
// One store per QueryClient (so every list on the page, and the extra-field fetch, see the same
// choice). A session choice wins over the loaded value: `null` = reset, absent = nothing chosen.
type SessionChoices = Map<string, ReportColumnsChoice | null>;
interface SessionStore { choices: SessionChoices; listeners: Set<() => void> }
const sessionStores = new WeakMap<QueryClient, SessionStore>();

function sessionStore(client: QueryClient): SessionStore {
  let store = sessionStores.get(client);
  if (!store) {
    store = { choices: new Map(), listeners: new Set() };
    sessionStores.set(client, store);
  }
  return store;
}

function setSessionChoice(client: QueryClient, reportId: string, choice: ReportColumnsChoice | null) {
  const store = sessionStore(client);
  store.choices = new Map(store.choices).set(reportId, choice);
  store.listeners.forEach((l) => l());
}

/**
 * The choice of one report as shown: the choice made in this session, else the loaded one.
 * Used for the columns on screen and for deciding which extra-field lists to fetch.
 */
export function useEffectiveReportColumnsChoice(reportId: string) {
  const queryClient = useQueryClient();
  const store = sessionStore(queryClient);
  const subscribe = useCallback((listener: () => void) => {
    store.listeners.add(listener);
    return () => { store.listeners.delete(listener); };
  }, [store]);
  const choices = useSyncExternalStore(subscribe, () => store.choices, () => store.choices);
  const query = useQuery<SettingData>({ queryKey: REPORT_COLUMNS_QUERY_KEY });
  const server = asReportColumnsSetting(query.data?.value);
  const choice: ReportColumnsChoice | undefined = choices.has(reportId) ? choices.get(reportId) ?? undefined : server[reportId];
  return { choice, status: query.status };
}

/**
 * The choice of one report, and a writer that never loses the user's other choices:
 * - every write merges into the newest loaded value (the query cache, updated at once), so two
 *   lists on one page cannot overwrite each other;
 * - a write made while the setting loads waits for it;
 * - after a failed load nothing is written (it would replace every other report's choice with
 *   only this one): the choice then holds for this session only.
 */
export function useReportColumnsChoice(reportId: string) {
  const queryClient = useQueryClient();
  const { choice, status } = useEffectiveReportColumnsChoice(reportId);
  const dirty = useRef(false);

  const write = useCallback(() => {
    const own = sessionStore(queryClient).choices.get(reportId);
    const cached = queryClient.getQueryData<SettingData>(REPORT_COLUMNS_QUERY_KEY);
    const next = { ...asReportColumnsSetting(cached?.value) };
    if (own) next[reportId] = own;
    else delete next[reportId];
    queryClient.setQueryData<SettingData>(REPORT_COLUMNS_QUERY_KEY, (old) => ({ ...(old ?? {}), value: next }));
    void apiRequest("PUT", `/api/user-settings/${REPORT_COLUMNS_KEY}`, { value: next })
      .catch(() => invalidateByPrefix("/api/user-settings"));
  }, [queryClient, reportId]);

  const latestStatus = useRef(status);
  latestStatus.current = status;

  useEffect(() => {
    if (status === "success" && dirty.current) {
      dirty.current = false;
      write();
    }
  }, [status, write]);

  const set = useCallback((next: ReportColumnsChoice | null) => {
    setSessionChoice(queryClient, reportId, next);
    if (latestStatus.current === "success") write();
    else if (latestStatus.current === "pending") dirty.current = true;
    // status "error": keep it for this session only.
  }, [queryClient, reportId, write]);

  return { choice, ready: status !== "pending", set };
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

  // Never an empty table: when every own column is hidden (an old choice), show them all,
  // and the menu shows them ticked (what is really on screen).
  const hidden = useMemo(() => {
    const ids = new Set(hiddenKey ? hiddenKey.split("\u0001") : []);
    return baseColumns.every((c) => ids.has(c.id)) ? new Set<string>() : ids;
  }, [baseColumns, hiddenKey]);

  const columns = useMemo(() => {
    const extra = new Set(extraKey ? extraKey.split("\u0001") : []);
    return [...baseColumns.filter((c) => !hidden.has(c.id)), ...extras.filter((c) => extra.has(c.id))];
  }, [baseColumns, extras, hidden, extraKey]);

  const menu = createElement(ReportColumnsMenu, {
    reportId,
    columns: baseColumns.map((c) => ({ id: c.id, label: c.label })),
    extras: extras.map((c) => ({ id: c.id, label: c.label })),
    value: choice ? { hidden: baseColumns.filter((c) => hidden.has(c.id)).map((c) => c.id), extra: choice.extra } : null,
    onChange: set,
  });

  return { columns, menu };
}

const NO_EXTRAS: ColumnLike[] = [];
