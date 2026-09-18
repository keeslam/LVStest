import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Inbox, Loader2, RefreshCw } from "lucide-react";
import type { Vehicle } from "@shared/schema";
import type { InboxStatus, InvoiceInboxRunSummary, ReviewReason } from "@shared/invoice-inbox";
import { apiRequest, invalidateByPrefix } from "@/lib/queryClient";
import { formatCurrency } from "@/lib/format-utils";
import { displayLicensePlate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { InvoiceReviewDialog, type InboxListItem } from "./invoice-review-dialog";

interface InboxStatusResponse {
  enabled: boolean;
  running: boolean;
  lastRun: InvoiceInboxRunSummary | null;
  scheduledMinutes: number | null;
  reviewCount: number;
  geminiConfigured: boolean;
}

const TABS: InboxStatus[] = ["review", "booked", "dismissed"];
const dateTime = (iso: string) => new Intl.DateTimeFormat("nl-NL", { dateStyle: "short", timeStyle: "short" }).format(new Date(iso));

/** Kosten page: invoices that arrived by e-mail — waiting for review, booked, dismissed. */
export function InvoiceInboxCard() {
  const { t } = useTranslation("expenses");
  const { toast } = useToast();
  const [tab, setTab] = useState<InboxStatus>("review");
  const [openItem, setOpenItem] = useState<InboxListItem | null>(null);

  const { data: status } = useQuery<InboxStatusResponse>({
    queryKey: ["/api/expenses/inbox/status"],
    queryFn: async () => (await apiRequest("GET", "/api/expenses/inbox/status")).json(),
    refetchInterval: 60_000,
  });
  const { data: items = [] } = useQuery<InboxListItem[]>({
    queryKey: ["/api/expenses/inbox/items", tab],
    queryFn: async () => (await apiRequest("GET", `/api/expenses/inbox/items?status=${tab}&limit=100`)).json(),
  });
  const { data: vehicles = [] } = useQuery<Vehicle[]>({
    queryKey: ["/api/vehicles"],
    queryFn: async () => (await apiRequest("GET", "/api/vehicles")).json(),
    enabled: openItem !== null,
  });

  const run = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/expenses/inbox/run")).json(),
    onSuccess: (s: InvoiceInboxRunSummary) => {
      invalidateByPrefix("/api/expenses");
      toast({
        title: t("invoiceInbox.runDone", { mails: s.mails, booked: s.booked, review: s.review }),
        description: s.errors.join("\n") || undefined,
        variant: s.errors.length ? "destructive" : "default",
      });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const lastRun = status?.lastRun;
  const lastRunText = !lastRun
    ? t("invoiceInbox.neverRun")
    : lastRun.errors.length && lastRun.mails === 0
      ? t("invoiceInbox.lastRunFailed", { error: lastRun.errors[0] })
      : t("invoiceInbox.lastRun", { time: dateTime(lastRun.finishedAt), booked: lastRun.booked, review: lastRun.review });

  return (
    <Card data-testid="card-invoice-inbox">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Inbox className="h-5 w-5" />
              {t("invoiceInbox.title")}
              {(status?.reviewCount ?? 0) > 0 && <Badge data-testid="badge-invoice-inbox-review">{status!.reviewCount}</Badge>}
            </CardTitle>
            <CardDescription>{t("invoiceInbox.description")}</CardDescription>
          </div>
          <div className="flex flex-col items-end gap-1">
            <Button variant="outline" size="sm" onClick={() => run.mutate()} disabled={run.isPending || !status?.enabled} data-testid="button-invoice-inbox-run">
              {run.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1.5 h-4 w-4" />}
              {t("invoiceInbox.fetchNow")}
            </Button>
            <span className={`text-xs ${lastRun?.errors.length ? "text-red-600" : "text-muted-foreground"}`}>{lastRunText}</span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {status && !status.enabled && <p className="text-sm text-muted-foreground">{t("invoiceInbox.disabledHint")}</p>}

        <Tabs value={tab} onValueChange={(v) => setTab(v as InboxStatus)}>
          <TabsList>
            {TABS.map((s) => <TabsTrigger key={s} value={s} data-testid={`tab-invoice-inbox-${s}`}>{t(`invoiceInbox.tabs.${s}`)}</TabsTrigger>)}
          </TabsList>
        </Tabs>

        {items.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">{t(`invoiceInbox.empty.${tab}`)}</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("invoiceInbox.columns.received")}</TableHead>
                  <TableHead>{t("invoiceInbox.columns.sender")}</TableHead>
                  <TableHead>{t("invoiceInbox.columns.vendor")}</TableHead>
                  <TableHead>{t("invoiceInbox.columns.invoiceNumber")}</TableHead>
                  <TableHead className="text-right">{t("invoiceInbox.columns.total")}</TableHead>
                  <TableHead>{tab === "review" ? t("invoiceInbox.columns.reason") : tab === "booked" ? t("invoiceInbox.columns.vehicle") : t("invoiceInbox.columns.note")}</TableHead>
                  <TableHead className="w-32"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.id} data-testid={`row-invoice-inbox-${item.id}`}>
                    <TableCell className="whitespace-nowrap">{dateTime(item.receivedAt)}</TableCell>
                    <TableCell>{item.fromAddress ?? t("invoiceInbox.manualScan")}</TableCell>
                    <TableCell>{item.parsed?.vendor || item.subject || "-"}</TableCell>
                    <TableCell>{item.parsed?.invoiceNumber || "-"}</TableCell>
                    <TableCell className="text-right">{item.parsed?.totalAmount ? formatCurrency(item.parsed.totalAmount) : "-"}</TableCell>
                    <TableCell>
                      {tab === "review" && item.reviewReason ? t(`invoiceInbox.reasons.${item.reviewReason as ReviewReason}`)
                        : tab === "booked" ? (item.vehiclePlate ? displayLicensePlate(item.vehiclePlate) : "-")
                        : item.note || "-"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant={tab === "review" ? "default" : "outline"} onClick={() => setOpenItem(item)}>
                        {tab === "review" ? t("invoiceInbox.reviewButton") : t("invoiceInbox.viewButton")}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      <InvoiceReviewDialog item={openItem} vehicles={vehicles} onClose={() => setOpenItem(null)} />
    </Card>
  );
}
