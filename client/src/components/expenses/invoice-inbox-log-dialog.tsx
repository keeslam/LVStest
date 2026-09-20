import { useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import { FileText, ScrollText } from "lucide-react";
import { UserPermission, UserRole } from "@shared/schema";
import type { InboxLogRow, InboxRunRow, InboxStatus, ReviewReason } from "@shared/invoice-inbox";
import { apiRequest } from "@/lib/queryClient";
import { formatCurrency } from "@/lib/format-utils";
import { formatDateNl } from "@/lib/format-date-nl";
import { displayLicensePlate } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const PAGE_SIZE = 50;
/** "Alles" in the status select: no filter rather than a status of its own. */
const ANY_STATUS = "all";

type LogKind = "invoices" | "other";
type LogTab = LogKind | "runs";

interface LogPage { items: InboxLogRow[]; total: number }
interface RunPage { runs: InboxRunRow[]; total: number }

/** Short enough for a dense table, through the house date helper. */
const dateTime = (iso: string | null) => (iso ? formatDateNl(iso, "dd-MM-yyyy HH:mm") : "-");
/** A run of a few seconds is the normal case; minutes matter when it is not. */
const duration = (run: InboxRunRow) => {
  const seconds = Math.max(0, Math.round((new Date(run.finishedAt).getTime() - new Date(run.startedAt).getTime()) / 1000));
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
};

/** Green booked, amber waiting, grey dismissed — the badge is the whole "Resultaat" column. */
const RESULT_BADGE: Record<InboxStatus, { variant: "success" | "secondary" | "outline"; className?: string }> = {
  booked: { variant: "success" },
  review: { variant: "outline", className: "border-transparent bg-amber-100 text-amber-800 hover:bg-amber-200/80" },
  dismissed: { variant: "secondary" },
};

/** Long subjects and file names may not stretch the dialog; the full text is in the tooltip. */
function Truncated({ text }: { text: string | null }) {
  if (!text) return <>-</>;
  return <span className="block max-w-[18rem] truncate" title={text}>{text}</span>;
}

export function InvoiceInboxLogButton() {
  const { t } = useTranslation("expenses");
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<LogTab>("invoices");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState(ANY_STATUS);
  const [activeOnly, setActiveOnly] = useState(true);
  const q = useDebouncedValue(search);

  // The server decides; this only hides what a click would be refused for.
  const canManageExpenses = user?.role === UserRole.ADMIN
    || ((user?.permissions as string[] | null | undefined) ?? []).includes(UserPermission.MANAGE_EXPENSES);

  const kind: LogKind = tab === "other" ? "other" : "invoices";
  // The "Overige mail" tab has no status select, so it carries no status either.
  const statusFilter = tab === "invoices" && status !== ANY_STATUS ? status : "";

  const logQuery = useInfiniteQuery({
    queryKey: ["/api/expenses/inbox/log", kind, q, statusFilter],
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams({ kind, limit: String(PAGE_SIZE), offset: String(pageParam) });
      if (q.trim()) params.set("q", q.trim());
      if (statusFilter) params.set("status", statusFilter);
      return (await apiRequest("GET", `/api/expenses/inbox/log?${params}`)).json() as Promise<LogPage>;
    },
    // The next page starts after what is on screen, so a row that arrived in
    // the meantime cannot make the log skip one.
    getNextPageParam: (last, pages) => {
      const loaded = pages.reduce((n, page) => n + page.items.length, 0);
      return loaded < last.total ? loaded : undefined;
    },
    enabled: open && tab !== "runs",
  });

  const runsQuery = useInfiniteQuery({
    queryKey: ["/api/expenses/inbox/runs", activeOnly],
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams({ activeOnly: String(activeOnly), limit: String(PAGE_SIZE), offset: String(pageParam) });
      return (await apiRequest("GET", `/api/expenses/inbox/runs?${params}`)).json() as Promise<RunPage>;
    },
    getNextPageParam: (last, pages) => {
      const loaded = pages.reduce((n, page) => n + page.runs.length, 0);
      return loaded < last.total ? loaded : undefined;
    },
    enabled: open && tab === "runs",
  });

  const rows = logQuery.data?.pages.flatMap((page) => page.items) ?? [];
  const runs = runsQuery.data?.pages.flatMap((page) => page.runs) ?? [];

  const searchField = (
    <Input
      value={search}
      onChange={(e) => setSearch(e.target.value)}
      placeholder={t("invoiceInbox.log.searchPlaceholder")}
      aria-label={t("invoiceInbox.log.searchLabel")}
      className="max-w-md"
      data-testid="input-invoice-inbox-log-search"
    />
  );

  /** "Meer laden", the empty and loading states, and "x van y getoond". */
  const footer = (shown: number, total: number, query: typeof logQuery | typeof runsQuery, testId: string) => (
    <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
      <span className="text-xs text-muted-foreground">{t("invoiceInbox.log.shown", { shown, total })}</span>
      {query.hasNextPage && (
        <Button variant="outline" size="sm" onClick={() => query.fetchNextPage()} disabled={query.isFetchingNextPage} data-testid={testId}>
          {t("invoiceInbox.log.loadMore")}
        </Button>
      )}
    </div>
  );

  const resultBadge = (row: InboxLogRow) => (
    <>
      <Badge variant={RESULT_BADGE[row.status]?.variant ?? "secondary"} className={RESULT_BADGE[row.status]?.className}>
        {t(`invoiceInbox.tabs.${row.status as InboxStatus}`)}
      </Badge>
      {row.status === "review" && row.reviewReason && (
        <span className="ml-1.5 text-xs text-muted-foreground">{t(`invoiceInbox.reasons.${row.reviewReason as ReviewReason}`)}</span>
      )}
      {row.errorMessage && <div className="text-xs text-red-600"><Truncated text={row.errorMessage} /></div>}
    </>
  );

  const rowActions = (row: InboxLogRow) => (
    <div className="flex justify-end gap-1.5">
      {row.hasFile && canManageExpenses && (
        <Button asChild variant="outline" size="sm">
          <a href={`/api/expenses/inbox/items/${row.id}/file`} target="_blank" rel="noreferrer" data-testid={`link-invoice-inbox-log-file-${row.id}`}>
            <FileText className="mr-1.5 h-4 w-4" />{t("invoiceInbox.log.openFile")}
          </a>
        </Button>
      )}
      {row.status === "review" && canManageExpenses && (
        <Button asChild variant="ghost" size="sm">
          <Link href="/expenses?inbox=1" data-testid={`link-invoice-inbox-log-review-${row.id}`}>{t("invoiceInbox.log.toReview")}</Link>
        </Button>
      )}
    </div>
  );

  const logPanel = (forKind: LogKind) => (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        {searchField}
        {forKind === "invoices" && (
          <div>
            <Label htmlFor="invoice-inbox-log-status" className="text-xs">{t("invoiceInbox.log.statusLabel")}</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger id="invoice-inbox-log-status" className="w-44" data-testid="select-invoice-inbox-log-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY_STATUS}>{t("invoiceInbox.log.statusAll")}</SelectItem>
                <SelectItem value="booked">{t("invoiceInbox.tabs.booked")}</SelectItem>
                <SelectItem value="review">{t("invoiceInbox.tabs.review")}</SelectItem>
                <SelectItem value="dismissed">{t("invoiceInbox.tabs.dismissed")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {logQuery.isPending ? (
        <p className="py-4 text-center text-sm text-muted-foreground">{t("invoiceInbox.log.loading")}</p>
      ) : rows.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">{t(`invoiceInbox.log.empty.${forKind}`)}</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("invoiceInbox.columns.received")}</TableHead>
                <TableHead>{t("invoiceInbox.columns.sender")}</TableHead>
                <TableHead>{t("invoiceInbox.log.columns.subject")}</TableHead>
                <TableHead>{t("invoiceInbox.log.columns.attachment")}</TableHead>
                {forKind === "invoices" ? (
                  <>
                    <TableHead>{t("invoiceInbox.log.columns.result")}</TableHead>
                    <TableHead>{t("invoiceInbox.columns.vehicle")}</TableHead>
                    <TableHead>{t("invoiceInbox.log.columns.invoiceNumber")}</TableHead>
                    <TableHead className="text-right">{t("invoiceInbox.columns.total")}</TableHead>
                    <TableHead className="w-44"></TableHead>
                  </>
                ) : (
                  <>
                    <TableHead>{t("invoiceInbox.columns.reason")}</TableHead>
                    <TableHead>{t("invoiceInbox.log.columns.status")}</TableHead>
                  </>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id} data-testid={`row-invoice-inbox-log-${row.id}`}>
                  <TableCell className="whitespace-nowrap">{dateTime(row.receivedAt)}</TableCell>
                  <TableCell><Truncated text={row.fromAddress ?? t("invoiceInbox.manualScan")} /></TableCell>
                  <TableCell><Truncated text={row.subject} /></TableCell>
                  <TableCell><Truncated text={row.attachmentName} /></TableCell>
                  {forKind === "invoices" ? (
                    <>
                      <TableCell>{resultBadge(row)}</TableCell>
                      <TableCell className="whitespace-nowrap">{row.vehiclePlate ? displayLicensePlate(row.vehiclePlate) : "-"}</TableCell>
                      <TableCell>{row.invoiceNumber || "-"}</TableCell>
                      <TableCell className="text-right">{row.totalAmount === null ? "-" : formatCurrency(row.totalAmount)}</TableCell>
                      <TableCell>{rowActions(row)}</TableCell>
                    </>
                  ) : (
                    <>
                      <TableCell>{row.reviewReason ? t(`invoiceInbox.reasons.${row.reviewReason as ReviewReason}`) : "-"}</TableCell>
                      <TableCell>{t(`invoiceInbox.tabs.${row.status as InboxStatus}`)}</TableCell>
                    </>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {footer(rows.length, logQuery.data?.pages.at(-1)?.total ?? rows.length, logQuery, "button-invoice-inbox-log-more")}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {/* Always enabled: the log is worth reading also when the mailbox is switched off. */}
        <Button variant="outline" data-testid="button-invoice-inbox-log">
          <ScrollText className="mr-1.5 h-4 w-4" />{t("invoiceInbox.log.title")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-6xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("invoiceInbox.log.title")}</DialogTitle>
          <DialogDescription>{t("invoiceInbox.log.description")}</DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as LogTab)}>
          <TabsList>
            <TabsTrigger value="invoices" data-testid="tab-invoice-inbox-log-invoices">{t("invoiceInbox.log.tabs.invoices")}</TabsTrigger>
            <TabsTrigger value="other" data-testid="tab-invoice-inbox-log-other">{t("invoiceInbox.log.tabs.other")}</TabsTrigger>
            <TabsTrigger value="runs" data-testid="tab-invoice-inbox-log-runs">{t("invoiceInbox.log.tabs.runs")}</TabsTrigger>
          </TabsList>

          <TabsContent value="invoices" className="mt-4">{logPanel("invoices")}</TabsContent>
          <TabsContent value="other" className="mt-4">{logPanel("other")}</TabsContent>

          <TabsContent value="runs" className="mt-4">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Switch id="invoice-inbox-log-active" checked={activeOnly} onCheckedChange={setActiveOnly} data-testid="switch-invoice-inbox-log-active" />
                <Label htmlFor="invoice-inbox-log-active" className="text-sm">{t("invoiceInbox.log.activeOnly")}</Label>
              </div>

              {runsQuery.isPending ? (
                <p className="py-4 text-center text-sm text-muted-foreground">{t("invoiceInbox.log.loading")}</p>
              ) : runs.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">{t("invoiceInbox.log.empty.runs")}</p>
              ) : (
                <div className="overflow-x-auto rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("invoiceInbox.log.columns.startedAt")}</TableHead>
                        <TableHead>{t("invoiceInbox.log.columns.duration")}</TableHead>
                        <TableHead>{t("invoiceInbox.log.columns.trigger")}</TableHead>
                        <TableHead className="text-right">{t("invoiceInbox.log.columns.mails")}</TableHead>
                        <TableHead className="text-right">{t("invoiceInbox.log.columns.attachments")}</TableHead>
                        <TableHead className="text-right">{t("invoiceInbox.tabs.booked")}</TableHead>
                        <TableHead className="text-right">{t("invoiceInbox.tabs.review")}</TableHead>
                        <TableHead className="text-right">{t("invoiceInbox.log.columns.skipped")}</TableHead>
                        <TableHead className="text-right">{t("invoiceInbox.log.columns.failed")}</TableHead>
                        <TableHead>{t("invoiceInbox.log.columns.errors")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {runs.map((run) => (
                        <TableRow key={run.id} data-testid={`row-invoice-inbox-log-run-${run.id}`}>
                          <TableCell className="whitespace-nowrap">{dateTime(run.startedAt)}</TableCell>
                          <TableCell className="whitespace-nowrap">{duration(run)}</TableCell>
                          <TableCell>
                            {run.trigger === "manual"
                              ? t("invoiceInbox.log.triggerManual", { user: run.triggeredBy ?? "-" })
                              : t("invoiceInbox.log.triggerScheduler")}
                          </TableCell>
                          <TableCell className="text-right">{run.mails}</TableCell>
                          <TableCell className="text-right">{run.attachments}</TableCell>
                          <TableCell className="text-right">{run.booked}</TableCell>
                          <TableCell className="text-right">{run.review}</TableCell>
                          <TableCell className="text-right">{run.skipped}</TableCell>
                          <TableCell className="text-right">{run.failed}</TableCell>
                          <TableCell className="text-xs text-red-600">
                            {run.errors.length === 0 ? <span className="text-muted-foreground">-</span> : <Truncated text={run.errors.join(" | ")} />}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              {footer(runs.length, runsQuery.data?.pages.at(-1)?.total ?? runs.length, runsQuery, "button-invoice-inbox-log-runs-more")}
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
