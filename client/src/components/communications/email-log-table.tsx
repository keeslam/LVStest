import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { Download, Search, X } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SortableHead, nextSort, type SortState } from "@/components/ui/sortable-head";
import { TablePager } from "@/components/ui/table-pager";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useGlobalDialog } from "@/contexts/GlobalDialogContext";
import { formatDateTimeNl } from "@/lib/format-date-nl";
import { formatLicensePlate } from "@/lib/format-utils";
import { officeToday } from "@/lib/office-date";
import { csvDateTime, downloadCsv } from "@/lib/csv";
import { useToast } from "@/hooks/use-toast";
import type { EmailLogRow, EmailLogStatus } from "./email-log-detail-dialog";
import { EmailFailureReasons } from "./email-failure-reasons";

/**
 * The E-maillogboek as a table (Kees, 2026-10-24): search, filters, sortable
 * columns and pages, all done by the server (GET /api/email-logs/search), so
 * 10,000 rows cost the browser no more than 50. The CSV holds every row that
 * matches, not only the page on screen.
 */
export type EmailLogTableRow = EmailLogRow & { vehicles: Array<{ id: number; licensePlate: string }> };
interface EmailLogPage { rows: EmailLogTableRow[]; total: number; page: number; pageSize: number }

type SortKey = "sentAt" | "subject" | "recipient" | "status";
type Period = "all" | "today" | "week" | "month" | "year" | "custom";
const KINDS = ["apk", "maintenance", "custom", "gps", "documents", "fine_linked", "other"] as const;
const ALL = "all";

/** yyyy-mm-dd plus or minus whole days, on the calendar (no time zone can shift it). */
function shiftDate(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** The from/to of a quick period, in the office's calendar; the week starts on Monday. */
export function periodRange(period: Period, today: string = officeToday()): { from: string; to: string } | null {
  switch (period) {
    case "today": return { from: today, to: today };
    case "week": {
      const weekday = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7;
      return { from: shiftDate(today, -weekday), to: today };
    }
    case "month": return { from: `${today.slice(0, 7)}-01`, to: today };
    case "year": return { from: `${today.slice(0, 4)}-01-01`, to: today };
    default: return null;
  }
}

export function EmailLogTable({ statusOf, kindLabel, onOpenDetail }: {
  statusOf: (row: EmailLogRow) => EmailLogStatus;
  kindLabel: (template: string) => string;
  onOpenDetail: (row: EmailLogRow) => void;
}) {
  const { t } = useTranslation(["notifications", "common"]);
  const h = (key: string, options?: Record<string, unknown>) => t(`notifications:customerCommunications.history.table.${key}`, options);
  const { openVehicleDialog } = useGlobalDialog();
  const { toast } = useToast();

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>(ALL);
  const [kind, setKind] = useState<string>(ALL);
  const [scope, setScope] = useState<string>(ALL);
  const [period, setPeriod] = useState<Period>("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [sort, setSort] = useState<SortState<SortKey>>({ key: "sentAt", dir: "desc" });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [exporting, setExporting] = useState(false);
  const q = useDebouncedValue(search.trim());

  const range = period === "custom" ? { from: customFrom, to: customTo } : periodRange(period);
  const filters: Record<string, string> = {};
  if (q) filters.q = q;
  if (status !== ALL) filters.status = status;
  if (kind !== ALL) filters.kind = kind;
  if (scope !== ALL) filters.scope = scope;
  if (range?.from) filters.from = range.from;
  if (range?.to) filters.to = range.to;
  const selection = JSON.stringify(filters);
  useEffect(() => { setPage(1); }, [selection, sort.key, sort.dir, pageSize]);

  const { data, isLoading, isError, isFetching } = useQuery<EmailLogPage>({
    queryKey: ["/api/email-logs/search", { ...filters, sort: sort.key, dir: sort.dir, page, pageSize }],
    placeholderData: keepPreviousData,
    staleTime: 0,
  });
  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const filtered = Object.keys(filters).length > 0;

  const clearFilters = () => {
    setSearch(""); setStatus(ALL); setKind(ALL); setScope(ALL); setPeriod("all"); setCustomFrom(""); setCustomTo("");
  };

  const exportCsv = async () => {
    setExporting(true);
    try {
      const params = new URLSearchParams({ ...filters, sort: sort.key, dir: sort.dir });
      const response = await fetch(`/api/email-logs/export?${params}`, { credentials: "include" });
      if (!response.ok) throw new Error(String(response.status));
      const result: { rows: EmailLogTableRow[]; truncated: boolean } = await response.json();
      downloadCsv(h("csvSubject"), [
        h("csv.sentAt"), h("csv.kind"), h("csv.subject"), h("csv.recipient"), h("csv.recipients"),
        h("csv.sent"), h("csv.failed"), h("csv.plates"), h("csv.status"), h("csv.reason"),
      ], result.rows.map((row) => [
        csvDateTime(row.sentAt), row.recipient ? kindLabel(row.template) : `${t("notifications:customerCommunications.history.runKind")} · ${kindLabel(row.template)}`,
        row.subject, row.recipient ?? "", row.recipients, row.emailsSent, row.emailsFailed,
        row.vehicles.map((v) => formatLicensePlate(v.licensePlate)).join(", "),
        t(`notifications:customerCommunications.history.statusLabels.${statusOf(row)}`), row.failureReason ?? "",
      ]));
      if (result.truncated) toast({ title: h("exportTruncated") });
    } catch {
      toast({ title: h("exportFailed"), variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  const head = (key: SortKey, label: string, className?: string) =>
    <SortableHead label={label} sortKey={key} sort={sort} onSort={(k) => setSort(nextSort(sort, k, (c) => (c === "sentAt" ? "desc" : "asc")))} testId={`sort-email-log-${key}`} className={className} />;

  return (
    <div className="space-y-3" data-testid="email-log-table">
      <div className="flex flex-wrap items-end gap-2">
        <div className="relative min-w-[14rem] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={h("searchPlaceholder")} className="pl-8" aria-label={h("searchPlaceholder")} data-testid="email-log-search" />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-[10.5rem]" aria-label={h("statusFilter")} data-testid="email-log-filter-status"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{h("statusAll")}</SelectItem>
            {(["sent", "failed", "partial"] as const).map((s) => (
              <SelectItem key={s} value={s}>{t(`notifications:customerCommunications.history.statusLabels.${s}`)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={kind} onValueChange={setKind}>
          <SelectTrigger className="w-[12rem]" aria-label={h("kindFilter")} data-testid="email-log-filter-kind"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{h("kindAll")}</SelectItem>
            {KINDS.map((k) => <SelectItem key={k} value={k}>{kindLabel(k)}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={scope} onValueChange={setScope}>
          <SelectTrigger className="w-[11rem]" aria-label={h("scopeFilter")} data-testid="email-log-filter-scope"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{h("scopeAll")}</SelectItem>
            <SelectItem value="mails">{h("scopeMails")}</SelectItem>
            <SelectItem value="runs">{h("scopeRuns")}</SelectItem>
          </SelectContent>
        </Select>
        <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
          <SelectTrigger className="w-[10.5rem]" aria-label={h("periodFilter")} data-testid="email-log-filter-period"><SelectValue /></SelectTrigger>
          <SelectContent>
            {(["all", "today", "week", "month", "year", "custom"] as const).map((p) => (
              <SelectItem key={p} value={p}>{h(`period.${p}`)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {period === "custom" && (
          <>
            <label className="text-xs text-muted-foreground">{h("from")}
              <Input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="h-10 w-[9.5rem]" data-testid="email-log-from" />
            </label>
            <label className="text-xs text-muted-foreground">{h("to")}
              <Input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="h-10 w-[9.5rem]" data-testid="email-log-to" />
            </label>
          </>
        )}
        {filtered && (
          <Button variant="ghost" onClick={clearFilters} data-testid="email-log-clear-filters"><X className="mr-1 h-4 w-4" />{h("clearFilters")}</Button>
        )}
        <Button variant="outline" onClick={exportCsv} disabled={exporting || total === 0} className="ml-auto" data-testid="email-log-export">
          <Download className="mr-1 h-4 w-4" />{exporting ? h("exporting") : h("export")}
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground" data-testid="email-log-loading">{t("notifications:customerCommunications.history.loading")}</p>
      ) : isError ? (
        <p className="text-sm text-destructive" data-testid="email-log-error">{t("notifications:customerCommunications.history.loadError")}</p>
      ) : total === 0 ? (
        <div className="rounded-md border bg-muted/30 p-8 text-center text-sm text-muted-foreground" data-testid="email-log-empty">
          {filtered ? h("noMatches") : (
            <>
              <p className="font-medium text-foreground">{t("notifications:customerCommunications.history.emptyTitle")}</p>
              <p>{t("notifications:customerCommunications.history.emptyDescription")}</p>
            </>
          )}
        </div>
      ) : (
        <>
          <div className={`overflow-x-auto rounded-md border ${isFetching ? "opacity-70" : ""}`}>
            <Table className="min-w-[60rem] table-fixed">
              <TableHeader className="sticky top-0 z-10 bg-background">
                <TableRow>
                  {head("sentAt", h("columns.sentAt"), "w-[12.5rem]")}
                  {head("subject", h("columns.subject"))}
                  {head("recipient", h("columns.recipient"), "w-[14rem]")}
                  <TableHead className="w-[8rem]">{h("columns.plates")}</TableHead>
                  {head("status", h("columns.status"), "w-[8.5rem]")}
                  <TableHead className="w-[6rem]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data?.rows ?? []).map((row) => {
                  const rowStatus = statusOf(row);
                  return (
                    <TableRow key={row.id} data-testid="email-log-row">
                      <TableCell className="text-sm">{formatDateTimeNl(row.sentAt)}</TableCell>
                      <TableCell>
                        <div className="truncate font-medium" title={row.subject}>{row.subject}</div>
                        <div className="truncate text-xs text-muted-foreground">
                          {row.recipient ? kindLabel(row.template) : `${t("notifications:customerCommunications.history.runKind")} · ${kindLabel(row.template)}`}
                        </div>
                        {row.failureReason && (
                          <div className="mt-1 text-xs" data-testid="email-log-reason"><EmailFailureReasons reason={row.failureReason} /></div>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        {row.recipient ? (
                          <span className="block truncate" title={row.recipient}>{row.recipient}</span>
                        ) : (
                          <>
                            <div>{t("notifications:customerCommunications.history.recipientsCount", { count: row.recipients })}</div>
                            <div className="text-xs text-muted-foreground">{t("notifications:customerCommunications.history.roundCounts", { sent: row.emailsSent, failed: row.emailsFailed })}</div>
                          </>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        <div className="flex flex-wrap gap-1">
                          {row.vehicles.slice(0, 3).map((v) => (
                            <button key={v.id} type="button" onClick={() => openVehicleDialog(v.id)} className="rounded bg-yellow-100 px-1.5 py-0.5 font-mono text-xs text-yellow-900 hover:bg-yellow-200" data-testid={`email-log-plate-${v.id}`}>
                              {formatLicensePlate(v.licensePlate)}
                            </button>
                          ))}
                          {row.vehicles.length > 3 && <span className="text-xs text-muted-foreground">+{row.vehicles.length - 3}</span>}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={rowStatus === "sent" ? "default" : "destructive"} data-testid="email-log-status">
                          {t(`notifications:customerCommunications.history.statusLabels.${rowStatus}`)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => onOpenDetail(row)} data-testid={`button-email-log-detail-${row.id}`}>
                          {t("notifications:customerCommunications.history.detailButton")}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
            <span data-testid="email-log-total">{h("total", { count: total })}</span>
            <TablePager page={page} pageCount={pageCount} pageSize={pageSize} total={total} setPage={setPage} setPageSize={setPageSize} testId="email-log" />
          </div>
        </>
      )}
    </div>
  );
}
