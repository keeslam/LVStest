import { useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import { ArrowRight, FileText, ScrollText } from "lucide-react";
import { UserPermission, UserRole } from "@shared/schema";
import type { InboxLogRow, InboxRunRow, InboxStatus, ReviewReason } from "@shared/invoice-inbox";
import { apiRequest } from "@/lib/queryClient";
import { formatCurrency } from "@/lib/format-utils";
import { formatDateNl } from "@/lib/format-date-nl";
import { cn, displayLicensePlate } from "@/lib/utils";
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

/**
 * One line that may not stretch its column; the full text sits in the
 * tooltip. `className` sets its own max-width (and any text styling) per call
 * site, since the dialog packs several of these into narrow, fixed-width
 * columns (see the 2026-09-20 layout fix: the table used to spill past the
 * dialog at 1280-1440px, hiding whole columns and actions off-screen).
 */
function Truncated({ text, className }: { text: string | null; className?: string }) {
  if (!text) return <>-</>;
  return <span className={cn("block truncate", className ?? "max-w-[18rem]")} title={text}>{text}</span>;
}

/** Compact header/cell padding for this dense table (default shadcn padding alone did not fit at 1280px). */
const HEAD_CLS = "h-9 px-3 py-2";
const CELL_CLS = "px-3 py-2 align-top";

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

  /** "Meer laden", the empty and loading states, and "x van y getoond". Stays pinned under the scrolling table. */
  const footer = (shown: number, total: number, query: typeof logQuery | typeof runsQuery, testId: string) => (
    <div className="flex flex-shrink-0 flex-wrap items-center justify-between gap-2 pt-2">
      <span className="text-xs text-muted-foreground">{t("invoiceInbox.log.shown", { shown, total })}</span>
      {query.hasNextPage && (
        <Button variant="outline" size="sm" onClick={() => query.fetchNextPage()} disabled={query.isFetchingNextPage} data-testid={testId}>
          {t("invoiceInbox.log.loadMore")}
        </Button>
      )}
    </div>
  );

  /** "Resultaat": badge on top, the review reason and any error message stacked underneath it, not beside it. */
  const resultBadge = (row: InboxLogRow) => (
    <div className="max-w-[152px]">
      <Badge variant={RESULT_BADGE[row.status]?.variant ?? "secondary"} className={RESULT_BADGE[row.status]?.className}>
        {t(`invoiceInbox.tabs.${row.status as InboxStatus}`)}
      </Badge>
      {row.status === "review" && row.reviewReason && (
        <Truncated text={t(`invoiceInbox.reasons.${row.reviewReason as ReviewReason}`)} className="mt-1 max-w-full text-xs text-muted-foreground" />
      )}
      {row.errorMessage && <Truncated text={row.errorMessage} className="mt-1 max-w-full text-xs text-red-600" />}
    </div>
  );

  /** Icon-only so two actions still fit a narrow column; the label survives as a tooltip and for screen readers. */
  const rowActions = (row: InboxLogRow) => (
    <div className="flex justify-end gap-1">
      {row.hasFile && canManageExpenses && (
        <Button asChild variant="outline" size="icon" className="h-8 w-8" title={t("invoiceInbox.log.openFile")}>
          <a href={`/api/expenses/inbox/items/${row.id}/file`} target="_blank" rel="noreferrer" data-testid={`link-invoice-inbox-log-file-${row.id}`}>
            <FileText className="h-4 w-4" />
            <span className="sr-only">{t("invoiceInbox.log.openFile")}</span>
          </a>
        </Button>
      )}
      {row.status === "review" && canManageExpenses && (
        <Button asChild variant="ghost" size="icon" className="h-8 w-8" title={t("invoiceInbox.log.toReview")}>
          <Link href="/expenses?inbox=1" data-testid={`link-invoice-inbox-log-review-${row.id}`}>
            <ArrowRight className="h-4 w-4" />
            <span className="sr-only">{t("invoiceInbox.log.toReview")}</span>
          </Link>
        </Button>
      )}
    </div>
  );

  /** Sender over subject, the attachment name (if any) below that in small muted text — one column instead of three. */
  const senderSubjectCell = (row: InboxLogRow) => (
    <div className="max-w-[280px] space-y-0.5">
      <Truncated text={row.fromAddress ?? t("invoiceInbox.manualScan")} className="max-w-full text-xs text-muted-foreground" />
      <Truncated text={row.subject} className="max-w-full text-sm font-medium text-foreground" />
      {row.attachmentName && <Truncated text={row.attachmentName} className="max-w-full text-xs text-muted-foreground" />}
    </div>
  );

  const logPanel = (forKind: LogKind) => (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-shrink-0 flex-wrap items-end gap-2">
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

      <div className="min-h-0 flex-1 overflow-auto rounded-lg border" data-testid="invoice-inbox-log-table-scroll">
        {logQuery.isPending ? (
          <p className="py-4 text-center text-sm text-muted-foreground">{t("invoiceInbox.log.loading")}</p>
        ) : rows.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">{t(`invoiceInbox.log.empty.${forKind}`)}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className={cn(HEAD_CLS, "w-[128px]")}>{t("invoiceInbox.columns.received")}</TableHead>
                <TableHead className={HEAD_CLS}>{t("invoiceInbox.log.columns.senderSubject")}</TableHead>
                {forKind === "invoices" ? (
                  <>
                    <TableHead className={cn(HEAD_CLS, "w-[168px]")}>{t("invoiceInbox.log.columns.result")}</TableHead>
                    <TableHead className={cn(HEAD_CLS, "w-[100px]")}>{t("invoiceInbox.columns.vehicle")}</TableHead>
                    <TableHead className={cn(HEAD_CLS, "w-[112px]")}>{t("invoiceInbox.log.columns.invoiceNumber")}</TableHead>
                    <TableHead className={cn(HEAD_CLS, "w-[100px] text-right")}>{t("invoiceInbox.columns.total")}</TableHead>
                    <TableHead className={cn(HEAD_CLS, "w-[76px]")}></TableHead>
                  </>
                ) : (
                  <>
                    <TableHead className={cn(HEAD_CLS, "w-[152px]")}>{t("invoiceInbox.columns.reason")}</TableHead>
                    <TableHead className={cn(HEAD_CLS, "w-[108px]")}>{t("invoiceInbox.log.columns.status")}</TableHead>
                  </>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id} data-testid={`row-invoice-inbox-log-${row.id}`}>
                  <TableCell className={cn(CELL_CLS, "whitespace-nowrap")}>{dateTime(row.receivedAt)}</TableCell>
                  <TableCell className={CELL_CLS}>{senderSubjectCell(row)}</TableCell>
                  {forKind === "invoices" ? (
                    <>
                      <TableCell className={CELL_CLS}>{resultBadge(row)}</TableCell>
                      <TableCell className={cn(CELL_CLS, "whitespace-nowrap")}>{row.vehiclePlate ? displayLicensePlate(row.vehiclePlate) : "-"}</TableCell>
                      <TableCell className={CELL_CLS}><Truncated text={row.invoiceNumber} className="max-w-[96px]" /></TableCell>
                      <TableCell className={cn(CELL_CLS, "whitespace-nowrap text-right")}>{row.totalAmount === null ? "-" : formatCurrency(row.totalAmount)}</TableCell>
                      <TableCell className={CELL_CLS}>{rowActions(row)}</TableCell>
                    </>
                  ) : (
                    <>
                      <TableCell className={CELL_CLS}>
                        {row.reviewReason ? <Truncated text={t(`invoiceInbox.reasons.${row.reviewReason as ReviewReason}`)} className="max-w-[140px]" /> : "-"}
                      </TableCell>
                      <TableCell className={CELL_CLS}>{t(`invoiceInbox.tabs.${row.status as InboxStatus}`)}</TableCell>
                    </>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

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
      {/*
        2026-09-20 layout fix: this used to be `max-w-6xl overflow-y-auto`,
        which both (a) capped the dialog well under 1280px so the nine-column
        Facturen table spilled off-screen (Kenteken/Factuurnr./Bedrag/actions
        were never visible without scrolling — reported in
        .superpowers/sdd/2026-09-20-invoice-inbox-log/e2e-report.md), and
        (b) scrolled the whole dialog as one block, so the tabs and search bar
        scrolled away with the rows. Now: as wide as the viewport reasonably
        allows (capped at 1400px so it doesn't stretch absurdly on a huge
        monitor), and a flex column so only the table area scrolls
        (`min-h-0 flex-1 overflow-auto` below) while the header, tabs and
        search/filter row stay put. Pattern matches other wide-table dialogs,
        e.g. client/src/components/fines/fine-import-dialog.tsx.
      */}
      <DialogContent className="flex h-[85vh] max-h-[85vh] w-[min(96vw,1400px)] max-w-[min(96vw,1400px)] flex-col overflow-hidden">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle>{t("invoiceInbox.log.title")}</DialogTitle>
          <DialogDescription>{t("invoiceInbox.log.description")}</DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as LogTab)} className="flex min-h-0 flex-1 flex-col">
          <TabsList className="flex-shrink-0">
            <TabsTrigger value="invoices" data-testid="tab-invoice-inbox-log-invoices">{t("invoiceInbox.log.tabs.invoices")}</TabsTrigger>
            <TabsTrigger value="other" data-testid="tab-invoice-inbox-log-other">{t("invoiceInbox.log.tabs.other")}</TabsTrigger>
            <TabsTrigger value="runs" data-testid="tab-invoice-inbox-log-runs">{t("invoiceInbox.log.tabs.runs")}</TabsTrigger>
          </TabsList>

          {/*
            Radix's TabsContent wrapper div itself stays mounted for every tab
            (only its CHILDREN unmount while inactive) and is hidden purely via
            the native `hidden` attribute (display: none from the UA
            stylesheet) — that empty wrapper is exactly why the same
            data-testid="invoice-inbox-log-table-scroll" is safe to reuse on
            all three tabs below: only one non-empty instance is ever mounted
            at a time. An unconditional `flex` class on this wrapper is an
            author-origin style that beats that UA default regardless of
            `hidden`, so all three (two empty, one with content) used to
            render as equal flex-1 siblings — the one with content was
            squeezed into a third of the available height, which is why the
            table only ever showed one clipped row. `data-[state=active]:flex`
            only turns display:flex on for the wrapper Radix has actually made
            active, leaving `hidden`'s own display:none in charge of the rest.
          */}
          <TabsContent value="invoices" className="mt-4 min-h-0 flex-1 flex-col data-[state=active]:flex">{logPanel("invoices")}</TabsContent>
          <TabsContent value="other" className="mt-4 min-h-0 flex-1 flex-col data-[state=active]:flex">{logPanel("other")}</TabsContent>

          <TabsContent value="runs" className="mt-4 min-h-0 flex-1 flex-col data-[state=active]:flex">
            <div className="flex min-h-0 flex-1 flex-col gap-3">
              <div className="flex flex-shrink-0 items-center gap-2">
                <Switch id="invoice-inbox-log-active" checked={activeOnly} onCheckedChange={setActiveOnly} data-testid="switch-invoice-inbox-log-active" />
                <Label htmlFor="invoice-inbox-log-active" className="text-sm">{t("invoiceInbox.log.activeOnly")}</Label>
              </div>

              <div className="min-h-0 flex-1 overflow-auto rounded-lg border" data-testid="invoice-inbox-log-table-scroll">
                {runsQuery.isPending ? (
                  <p className="py-4 text-center text-sm text-muted-foreground">{t("invoiceInbox.log.loading")}</p>
                ) : runs.length === 0 ? (
                  <p className="py-4 text-center text-sm text-muted-foreground">{t("invoiceInbox.log.empty.runs")}</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className={cn(HEAD_CLS, "w-[128px]")}>{t("invoiceInbox.log.columns.startedAt")}</TableHead>
                        <TableHead className={cn(HEAD_CLS, "w-[64px]")}>{t("invoiceInbox.log.columns.duration")}</TableHead>
                        <TableHead className={cn(HEAD_CLS, "w-[220px]")}>{t("invoiceInbox.log.columns.trigger")}</TableHead>
                        <TableHead className={cn(HEAD_CLS, "w-[60px] text-right")} title={t("invoiceInbox.log.columns.mails")}>{t("invoiceInbox.log.columns.mails")}</TableHead>
                        <TableHead className={cn(HEAD_CLS, "w-[76px] text-right")} title={t("invoiceInbox.log.columns.attachments")}>{t("invoiceInbox.log.columns.attachments")}</TableHead>
                        <TableHead className={cn(HEAD_CLS, "w-[74px] text-right")} title={t("invoiceInbox.tabs.booked")}>{t("invoiceInbox.tabs.booked")}</TableHead>
                        <TableHead className={cn(HEAD_CLS, "w-[112px] text-right")} title={t("invoiceInbox.tabs.review")}>{t("invoiceInbox.tabs.review")}</TableHead>
                        <TableHead className={cn(HEAD_CLS, "w-[102px] text-right")} title={t("invoiceInbox.log.columns.skipped")}>{t("invoiceInbox.log.columns.skipped")}</TableHead>
                        <TableHead className={cn(HEAD_CLS, "w-[72px] text-right")} title={t("invoiceInbox.log.columns.failed")}>{t("invoiceInbox.log.columns.failed")}</TableHead>
                        <TableHead className={HEAD_CLS}>{t("invoiceInbox.log.columns.errors")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {runs.map((run) => (
                        <TableRow key={run.id} data-testid={`row-invoice-inbox-log-run-${run.id}`}>
                          <TableCell className={cn(CELL_CLS, "whitespace-nowrap")}>{dateTime(run.startedAt)}</TableCell>
                          <TableCell className={cn(CELL_CLS, "whitespace-nowrap")}>{duration(run)}</TableCell>
                          <TableCell className={CELL_CLS}>
                            <Truncated
                              text={run.trigger === "manual" ? t("invoiceInbox.log.triggerManual", { user: run.triggeredBy ?? "-" }) : t("invoiceInbox.log.triggerScheduler")}
                              className="max-w-[208px]"
                            />
                          </TableCell>
                          <TableCell className={cn(CELL_CLS, "text-right")}>{run.mails}</TableCell>
                          <TableCell className={cn(CELL_CLS, "text-right")}>{run.attachments}</TableCell>
                          <TableCell className={cn(CELL_CLS, "text-right")}>{run.booked}</TableCell>
                          <TableCell className={cn(CELL_CLS, "text-right")}>{run.review}</TableCell>
                          <TableCell className={cn(CELL_CLS, "text-right")}>{run.skipped}</TableCell>
                          <TableCell className={cn(CELL_CLS, "text-right")}>{run.failed}</TableCell>
                          <TableCell className={cn(CELL_CLS, "text-xs text-red-600")}>
                            {run.errors.length === 0 ? (
                              <span className="text-muted-foreground">-</span>
                            ) : (
                              // Wraps instead of truncating: unlike the single-line fields
                              // above, an operator reading a failed run wants the error
                              // text itself, not just a tooltip promising it.
                              <div className="max-w-[240px] whitespace-normal break-words">{run.errors.join(" | ")}</div>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>

              {footer(runs.length, runsQuery.data?.pages.at(-1)?.total ?? runs.length, runsQuery, "button-invoice-inbox-log-runs-more")}
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
