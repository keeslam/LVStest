/**
 * Rapporten fase 5, onderdeel 12 and 13: the invoice inbox on Rapporten > Kantoor.
 * Part 1: the pickup rounds (needs MANAGE_EXPENSES or MANAGE_SETTINGS, like the rounds log).
 * Part 2: the invoices the mailbox brought in (needs MANAGE_EXPENSES, like the invoice list).
 * Both also need the report permission. Neither follows the page's vehicle filter.
 * The rounds log is only kept for a number of days; the card says so when the period starts earlier.
 */
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import {
  INBOX_ITEM_REPORT_TILES, INBOX_RUN_REPORT_TILES,
  type InboxItemReportRow, type InboxItemReportSort, type InboxItemReportSummary, type InboxItemReportTile,
  type InboxRunReportRow, type InboxRunReportSort, type InboxRunReportSummary, type InboxRunReportTile,
} from "@shared/reports/invoice-inbox-report";
import type { ReportBreakdownRow } from "@shared/report-kit";
import { UserPermission } from "@shared/schema";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ReportTiles, type ReportTile } from "@/components/reports/kit/report-tiles";
import { ReportMonthChart } from "@/components/reports/kit/report-month-chart";
import { ReportBreakdownTable } from "@/components/reports/kit/report-breakdown-table";
import { ReportDetailDialog, type ReportColumn } from "@/components/reports/kit/report-detail-dialog";
import { useHasPermission } from "@/hooks/use-has-permission";
import { formatDate, formatDateTime, formatLicensePlate } from "@/lib/format-utils";
import { csvDateTime, csvNumber } from "@/lib/csv";

const RUNS_ENDPOINT = "/api/reports/invoice-inbox-runs";
const ITEMS_ENDPOINT = "/api/reports/invoice-inbox-items";

const RUN_TONE: Partial<Record<InboxRunReportTile, ReportTile<InboxRunReportTile>["tone"]>> = {
  booked: "green",
  review: "amber",
  failed: "red",
};
const ITEM_TONE: Partial<Record<InboxItemReportTile, ReportTile<InboxItemReportTile>["tone"]>> = {
  autoBooked: "green",
  waiting: "amber",
  flagged: "amber",
};

const n0 = (n: number) => n.toLocaleString("nl-NL", { maximumFractionDigits: 0 });

export function InvoiceInboxReportCard({ from, to, vehicleId }: { from?: string; to?: string; vehicleId?: string }) {
  const { t } = useTranslation(["reports", "expenses"]);
  const allowedReports = useHasPermission(UserPermission.VIEW_REPORTS, UserPermission.MANAGE_REPORTS);
  const sourceRuns = useHasPermission(UserPermission.MANAGE_EXPENSES, UserPermission.MANAGE_SETTINGS);
  const sourceItems = useHasPermission(UserPermission.MANAGE_EXPENSES);
  const allowedRuns = allowedReports && sourceRuns;
  const allowedItems = allowedReports && sourceItems;
  const [runsTile, setRunsTile] = useState<InboxRunReportTile | null>(null);
  const [shownRunsTile, setShownRunsTile] = useState<InboxRunReportTile>("runs");
  const [itemsTile, setItemsTile] = useState<InboxItemReportTile | null>(null);
  const [shownItemsTile, setShownItemsTile] = useState<InboxItemReportTile>("all");

  // No vehicleId on purpose: rounds have no vehicle and many invoices have none either.
  const params = useMemo<Record<string, string>>(
    () => ({ ...(from ? { from } : {}), ...(to ? { to } : {}) }),
    [from, to],
  );
  const runsQuery = useQuery<InboxRunReportSummary>({
    queryKey: [`${RUNS_ENDPOINT}/summary`, params],
    enabled: allowedRuns,
  });
  const itemsQuery = useQuery<InboxItemReportSummary>({
    queryKey: [`${ITEMS_ENDPOINT}/summary`, params],
    enabled: allowedItems,
  });

  const runLabel = (id: string) => t(`reports:officeReports.inbox.tiles.runs.${id}`);
  const itemLabel = (id: string) => t(`reports:officeReports.inbox.tiles.items.${id}`);
  const reasonLabel = (reason: string) => t(`expenses:invoiceInbox.reasons.${reason}`, { defaultValue: reason });
  const outcomeLabel = (outcome: string) => t(`reports:officeReports.inbox.outcome.${outcome}`, { defaultValue: outcome });

  const runColumns = useMemo<Array<ReportColumn<InboxRunReportRow, InboxRunReportSort>>>(() => {
    const label = (id: string) => t(`reports:officeReports.inbox.columns.runs.${id}`);
    const by = (r: InboxRunReportRow) => (r.trigger === "scheduler" ? t("reports:officeReports.inbox.scheduler") : (r.triggeredBy ?? ""));
    const count = (id: "mails" | "attachments" | "booked" | "review" | "skipped" | "failed"): ReportColumn<InboxRunReportRow, InboxRunReportSort> => ({
      id, label: label(id), sortKey: id, align: "right",
      cell: (r) => n0(r[id]), csv: (r) => csvNumber(r[id], 0), print: (r) => n0(r[id]),
    });
    return [
      {
        id: "startedAt", label: label("startedAt"), sortKey: "startedAt",
        cell: (r) => formatDateTime(r.startedAt), csv: (r) => csvDateTime(r.startedAt),
      },
      { id: "by", label: label("by"), cell: (r) => by(r), csv: (r) => by(r) },
      count("mails"), count("attachments"), count("booked"), count("review"), count("skipped"), count("failed"),
      {
        id: "errors", label: label("errors"),
        cell: (r) => (r.errors ?? []).join("; "), csv: (r) => (r.errors ?? []).join("; "),
      },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t]);

  const itemColumns = useMemo<Array<ReportColumn<InboxItemReportRow, InboxItemReportSort>>>(() => {
    const label = (id: string) => t(`reports:officeReports.inbox.columns.items.${id}`);
    const plate = (r: InboxItemReportRow) => (r.licensePlate ? formatLicensePlate(r.licensePlate) : "");
    const reason = (r: InboxItemReportRow) => (r.reviewReason ? reasonLabel(r.reviewReason) : "");
    return [
      {
        id: "receivedAt", label: label("receivedAt"), sortKey: "receivedAt",
        cell: (r) => formatDateTime(r.receivedAt), csv: (r) => csvDateTime(r.receivedAt),
      },
      { id: "from", label: label("from"), sortKey: "fromAddress", cell: (r) => r.fromAddress ?? "", csv: (r) => r.fromAddress ?? "" },
      { id: "subject", label: label("subject"), cell: (r) => r.subject ?? "", csv: (r) => r.subject ?? "" },
      { id: "attachment", label: label("attachment"), cell: (r) => r.attachmentName ?? "", csv: (r) => r.attachmentName ?? "" },
      { id: "outcome", label: label("outcome"), sortKey: "outcome", cell: (r) => outcomeLabel(r.outcome), csv: (r) => outcomeLabel(r.outcome) },
      { id: "reason", label: label("reason"), sortKey: "reviewReason", cell: (r) => reason(r), csv: (r) => reason(r) },
      { id: "licensePlate", label: label("licensePlate"), cell: (r) => plate(r), csv: (r) => plate(r) },
      { id: "handledBy", label: label("handledBy"), cell: (r) => r.handledBy ?? "", csv: (r) => r.handledBy ?? "" },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t]);

  if (!allowedRuns) return null;

  const runs = runsQuery.data;
  const items = itemsQuery.data;

  const runTiles: Array<ReportTile<InboxRunReportTile>> = INBOX_RUN_REPORT_TILES.map((id) => {
    const tile = runs?.tiles?.[id];
    return {
      id,
      label: runLabel(id),
      value: n0(tile?.amount ?? 0),
      hint: t("reports:officeReports.inbox.runsHint", { count: tile?.count ?? 0 }),
      tone: RUN_TONE[id],
    };
  });
  const itemTiles: Array<ReportTile<InboxItemReportTile>> = INBOX_ITEM_REPORT_TILES.map((id) => ({
    id,
    label: itemLabel(id),
    value: n0(items?.tiles?.[id]?.count ?? 0),
    tone: ITEM_TONE[id],
  }));

  const runSeries = [
    { key: "booked" as const, label: runLabel("booked"), color: "#16a34a" },
    { key: "review" as const, label: runLabel("review"), color: "#f59e0b" },
    { key: "skipped" as const, label: runLabel("skipped"), color: "#9ca3af" },
    { key: "failed" as const, label: runLabel("failed"), color: "#dc2626" },
  ];
  const itemSeries = [
    { key: "autoBooked" as const, label: outcomeLabel("autoBooked"), color: "#16a34a" },
    { key: "staffBooked" as const, label: outcomeLabel("staffBooked"), color: "#3b82f6" },
    { key: "waiting" as const, label: outcomeLabel("waiting"), color: "#f59e0b" },
    { key: "dismissed" as const, label: outcomeLabel("dismissed"), color: "#9ca3af" },
  ];
  const reasonRows: ReportBreakdownRow[] = (items?.byReason ?? []).map((r) => ({
    key: r.reason, label: reasonLabel(r.reason), count: r.count, amount: 0,
  }));

  // The run log is kept for a while only: warn when the period starts before the oldest kept day.
  const periodStart = from ?? `${new Date().getFullYear()}-01-01`;
  const showRetention = !!runs?.retentionCutoff && periodStart < runs.retentionCutoff;

  return (
    <Card data-testid="card-invoice-inbox-report">
      <CardHeader>
        <CardTitle>{t("reports:officeReports.inbox.title")}</CardTitle>
        <CardDescription>{t("reports:officeReports.inbox.description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-8">
        {vehicleId && vehicleId !== "all" && (
          <p className="text-sm text-muted-foreground" data-testid="invoice-inbox-vehicle-filter-ignored">{t("reports:officeReports.vehicleFilterIgnored")}</p>
        )}

        <section className="space-y-4" data-testid="invoice-inbox-runs">
          <h3 className="text-base font-semibold">{t("reports:officeReports.inbox.runsTitle")}</h3>
          {runsQuery.isLoading ? (
            <p className="text-sm text-muted-foreground" data-testid="invoice-inbox-runs-loading">{t("reports:reportKit.loading")}</p>
          ) : runsQuery.isError || !runs ? (
            <p className="text-sm text-destructive" data-testid="invoice-inbox-runs-error">{t("reports:reportKit.loadFailed")}</p>
          ) : (
            <>
              {showRetention && (
                <p className="text-sm text-muted-foreground" data-testid="invoice-inbox-retention">
                  {t("reports:officeReports.inbox.retention", { count: runs.retentionDays, date: formatDate(runs.retentionCutoff) })}
                </p>
              )}
              <ReportTiles
                tiles={runTiles}
                testIdPrefix="invoice-inbox-runs"
                onOpen={(id) => { setShownRunsTile(id); setRunsTile(id); }}
              />
              <div className="space-y-2">
                <h4 className="text-sm font-medium">{t("reports:officeReports.inbox.runsByMonth")}</h4>
                <ReportMonthChart data={runs.byMonth ?? []} series={runSeries} stacked testId="invoice-inbox-runs-month-chart" />
              </div>
            </>
          )}
        </section>

        {allowedItems && (
          <section className="space-y-4" data-testid="invoice-inbox-items">
            <h3 className="text-base font-semibold">{t("reports:officeReports.inbox.itemsTitle")}</h3>
            {itemsQuery.isLoading ? (
              <p className="text-sm text-muted-foreground" data-testid="invoice-inbox-items-loading">{t("reports:reportKit.loading")}</p>
            ) : itemsQuery.isError || !items ? (
              <p className="text-sm text-destructive" data-testid="invoice-inbox-items-error">{t("reports:reportKit.loadFailed")}</p>
            ) : (
              <>
                <ReportTiles
                  tiles={itemTiles}
                  testIdPrefix="invoice-inbox-items"
                  onOpen={(id) => { setShownItemsTile(id); setItemsTile(id); }}
                />
                <p className="text-sm text-muted-foreground" data-testid="invoice-inbox-reasons-note">{t("reports:officeReports.inbox.reasonsNote")}</p>
                <div className="space-y-2">
                  <h4 className="text-sm font-medium">{t("reports:officeReports.inbox.itemsByMonth")}</h4>
                  <ReportMonthChart data={items.byMonth ?? []} series={itemSeries} stacked testId="invoice-inbox-items-month-chart" />
                </div>
                {reasonRows.length === 0 ? (
                  <div className="space-y-2" data-testid="invoice-inbox-reasons">
                    <h4 className="text-sm font-medium">{t("reports:officeReports.inbox.reasons")}</h4>
                    <p className="text-sm text-muted-foreground" data-testid="invoice-inbox-reasons-empty">{t("reports:officeReports.inbox.reasonsEmpty")}</p>
                  </div>
                ) : (
                  <ReportBreakdownTable
                    title={t("reports:officeReports.inbox.reasons")}
                    rows={reasonRows}
                    nullLabel={t("reports:reportKit.noData")}
                    hideAmount
                    testId="invoice-inbox-reasons"
                  />
                )}
              </>
            )}
          </section>
        )}
      </CardContent>
      <ReportDetailDialog<InboxRunReportRow, InboxRunReportSort>
        open={runsTile !== null}
        onOpenChange={(o) => { if (!o) setRunsTile(null); }}
        title={runLabel(shownRunsTile)}
        description={t("reports:officeReports.inbox.runsTitle")}
        endpoint={RUNS_ENDPOINT}
        params={params}
        tile={shownRunsTile}
        columns={runColumns}
        defaultSort={{ key: "startedAt", dir: "desc" }}
        rowKey={(r) => r.id}
        csvSubject={t("reports:officeReports.inbox.csvSubjectRuns")}
        reportName="invoice-inbox-runs"
        testId="invoice-inbox-runs-report"
      />
      {allowedItems && (
        <ReportDetailDialog<InboxItemReportRow, InboxItemReportSort>
          open={itemsTile !== null}
          onOpenChange={(o) => { if (!o) setItemsTile(null); }}
          title={itemLabel(shownItemsTile)}
          description={t("reports:officeReports.inbox.itemsTitle")}
          endpoint={ITEMS_ENDPOINT}
          params={params}
          tile={shownItemsTile}
          columns={itemColumns}
          defaultSort={{ key: "receivedAt", dir: "desc" }}
          rowKey={(r) => r.id}
          csvSubject={t("reports:officeReports.inbox.csvSubjectItems")}
          reportName="invoice-inbox-items"
          testId="invoice-inbox-items-report"
        />
      )}
    </Card>
  );
}
