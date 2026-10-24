/**
 * Task 7 (rapporten fase 1): the kilometre history of one vehicle. Used in the
 * vehicle screen (tab "Km-historie") and in Rapporten > Voertuigen; both are
 * admin only, like GET /api/mileage-history/:vehicleId itself.
 */
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery } from "@tanstack/react-query";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Ban, FileDown, Printer, RotateCcw } from "lucide-react";
import { MILEAGE_SOURCES, type AnalysedRow, type MileageSource } from "@shared/mileage-history";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { HtmlPreviewDialog } from "@/components/documents/html-preview-dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { apiRequest, invalidateByPrefix } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { downloadCsv, csvDateTime, csvNumber } from "@/lib/csv";
import { formatDateNl, formatDateRangeNl, formatDateTimeNl } from "@/lib/format-date-nl";
import { officeToday } from "@/lib/office-date";
import { formatLicensePlate } from "@/lib/format-utils";
import {
  formatKm,
  mileageChartPoints,
  mileageHistoryHtml,
  type MileageHistoryLabels,
  type MileageHistoryResponse,
} from "@/lib/mileage-history-print";

type Filter = "all" | "warnings";

const tileClass =
  "rounded-lg border bg-card p-4 text-left shadow-sm transition hover:border-primary/50 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function MileageHistoryPanel({ vehicleId, defaultFrom, defaultTo }: {
  vehicleId: number;
  defaultFrom?: string;
  defaultTo?: string;
}) {
  const { t } = useTranslation("vehicles");
  const today = officeToday();
  const [from, setFrom] = useState(defaultFrom ?? `${today.slice(0, 4)}-01-01`);
  const [to, setTo] = useState(defaultTo ?? today);
  const [filter, setFilter] = useState<Filter>("all");
  const [printHtml, setPrintHtml] = useState<string | null>(null);
  // A reading to void (or make valid again), waiting for the admin to confirm.
  const [toggleRow, setToggleRow] = useState<AnalysedRow | null>(null);
  const { toast } = useToast();
  const toggleVoided = useMutation({
    mutationFn: async (r: AnalysedRow) => {
      await apiRequest("POST", `/api/mileage-history/readings/${r.id}/${r.voided ? "unvoid" : "void"}`);
    },
    onSuccess: () => { void invalidateByPrefix("/api/mileage-history/"); },
    onError: () => { toast({ title: t("mileageHistory.voidFailed"), variant: "destructive" }); },
    onSettled: () => setToggleRow(null),
  });

  const validPeriod = /^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to) && from <= to;
  const { data, isLoading, isError } = useQuery<MileageHistoryResponse>({
    queryKey: [`/api/mileage-history/${vehicleId}?from=${from}&to=${to}`],
    enabled: validPeriod,
  });

  const labels: MileageHistoryLabels = useMemo(() => ({
    title: t("mileageHistory.title"),
    period: t("mileageHistory.period"),
    drivenKm: t("mileageHistory.tiles.drivenKm"),
    avgPerMonth: t("mileageHistory.tiles.avgPerMonth"),
    freeKm: t("mileageHistory.tiles.freeKm"),
    overFreeKm: t("mileageHistory.tiles.overFreeKm"),
    warnings: t("mileageHistory.tiles.warnings"),
    chart: t("mileageHistory.chartTitle"),
    date: t("mileageHistory.columns.date"),
    mileage: t("mileageHistory.columns.mileage"),
    driven: t("mileageHistory.columns.driven"),
    source: t("mileageHistory.columns.source"),
    actor: t("mileageHistory.columns.actor"),
    warning: t("mileageHistory.columns.warning"),
    voided: t("mileageHistory.voided"),
    empty: t("mileageHistory.empty"),
    sources: Object.fromEntries(MILEAGE_SOURCES.map((s) => [s, t(`mileageHistory.sources.${s}`)])) as Record<MileageSource, string>,
    warningTypes: { decrease: t("mileageHistory.warningTypes.decrease"), jump: t("mileageHistory.warningTypes.jump") },
  }), [t]);

  const rows = data?.rows ?? [];
  const visibleRows = filter === "warnings" ? rows.filter((r) => !r.voided && r.warning) : rows;
  const chartData = useMemo(() => mileageChartPoints(rows), [rows]);
  const summary = data?.summary;

  const sourceLabel = (s: string) => labels.sources[s as MileageSource] ?? s;
  const warningText = (r: AnalysedRow) => (r.voided ? labels.voided : r.warning ? labels.warningTypes[r.warning] : "");

  const handleCsv = () => {
    if (!data) return;
    downloadCsv(
      `km-historie-${data.vehicle.licensePlate}`,
      [labels.date, labels.mileage, labels.driven, labels.source, labels.actor, labels.warning],
      data.rows.map((r) => [
        csvDateTime(r.recordedAt),
        csvNumber(r.mileage, 0),
        csvNumber(r.drivenSincePrevious, 0),
        sourceLabel(r.source),
        r.actorName ?? "",
        warningText(r),
      ]),
    );
  };

  const handlePrint = () => {
    if (!data) return;
    setPrintHtml(mileageHistoryHtml(data, labels, { from, to }));
  };

  const freeTile = summary?.freeKm == null
    ? t("mileageHistory.tiles.noFreeKm")
    : formatKm(summary.freeKm);

  return (
    <div className="space-y-6" data-testid="mileage-history-panel">
      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-1">
          <label className="text-sm font-medium" htmlFor={`mileage-from-${vehicleId}`}>{t("mileageHistory.from")}</label>
          <Input id={`mileage-from-${vehicleId}`} type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-44" data-testid="input-mileage-from" />
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium" htmlFor={`mileage-to-${vehicleId}`}>{t("mileageHistory.to")}</label>
          <Input id={`mileage-to-${vehicleId}`} type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-44" data-testid="input-mileage-to" />
        </div>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" onClick={handlePrint} disabled={!data} data-testid="button-mileage-print">
            <Printer className="mr-2 h-4 w-4" />{t("mileageHistory.print")}
          </Button>
          <Button variant="outline" size="sm" onClick={handleCsv} disabled={!data} data-testid="button-mileage-csv">
            <FileDown className="mr-2 h-4 w-4" />{t("mileageHistory.csv")}
          </Button>
        </div>
      </div>

      {!validPeriod ? (
        <p className="text-sm text-red-600">{t("mileageHistory.invalidPeriod")}</p>
      ) : isLoading ? (
        <p className="text-sm text-gray-500">{t("mileageHistory.loading")}</p>
      ) : isError || !data ? (
        <p className="text-sm text-red-600">{t("mileageHistory.error")}</p>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <button type="button" className={tileClass} onClick={() => setFilter("all")} aria-pressed={filter === "all"} title={t("mileageHistory.tiles.showAll")} data-testid="mileage-tile-driven">
              <div className="text-sm text-gray-500">{labels.drivenKm}</div>
              <div className="text-2xl font-bold">{formatKm(summary!.drivenKm)}</div>
              <div className="text-xs text-gray-500">{t("mileageHistory.tiles.readings", { n: summary!.readings })}</div>
            </button>
            <button type="button" className={tileClass} onClick={() => setFilter("all")} title={t("mileageHistory.tiles.showAll")} data-testid="mileage-tile-average">
              <div className="text-sm text-gray-500">{labels.avgPerMonth}</div>
              <div className="text-2xl font-bold">{formatKm(summary!.avgPerMonth)}</div>
            </button>
            <button type="button" className={tileClass} onClick={() => setFilter("all")} title={t("mileageHistory.tiles.showAll")} data-testid="mileage-tile-free">
              <div className="text-sm text-gray-500">{labels.freeKm}</div>
              <div className="text-2xl font-bold">{freeTile}</div>
              {summary!.overFreeKm != null && summary!.overFreeKm > 0 && (
                <div className="text-xs font-medium text-amber-700">{labels.overFreeKm}: {formatKm(summary!.overFreeKm)}</div>
              )}
            </button>
            <button
              type="button"
              className={`${tileClass} ${filter === "warnings" ? "border-amber-400 ring-1 ring-amber-300" : ""}`}
              onClick={() => setFilter("warnings")}
              aria-pressed={filter === "warnings"}
              title={t("mileageHistory.tiles.showWarnings")}
              data-testid="mileage-tile-warnings"
            >
              <div className="text-sm text-gray-500">{labels.warnings}</div>
              <div className={`text-2xl font-bold ${summary!.warnings > 0 ? "text-amber-700" : ""}`}>{summary!.warnings}</div>
            </button>
          </div>

          {summary!.periodFrom && summary!.periodTo && (
            <p className="text-xs text-gray-500" data-testid="mileage-effective-period">
              {t("mileageHistory.effectivePeriod", { period: formatDateRangeNl(summary!.periodFrom, summary!.periodTo) })}
            </p>
          )}

          {rows.length === 0 ? (
            <p className="text-sm text-gray-500" data-testid="mileage-empty">{labels.empty}</p>
          ) : (
            <>
              <div>
                <h3 className="mb-2 text-sm font-medium">{labels.chart}</h3>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis
                        dataKey="time"
                        type="number"
                        scale="time"
                        domain={["dataMin", "dataMax"]}
                        tickFormatter={(v) => formatDateNl(Number(v), "dd-MM-yyyy")}
                      />
                      <YAxis domain={["auto", "auto"]} tickFormatter={(v) => Number(v).toLocaleString("nl-NL")} />
                      <Tooltip
                        labelFormatter={(v) => formatDateTimeNl(Number(v))}
                        formatter={(v: number) => [formatKm(Number(v)), labels.mileage]}
                      />
                      <Line type="monotone" dataKey="mileage" stroke="#2563eb" dot />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {filter === "warnings" && (
                <div className="flex items-center gap-2 text-sm">
                  <Badge variant="outline" className="border-amber-300 text-amber-700">{t("mileageHistory.filterWarnings")}</Badge>
                  <Button variant="link" size="sm" className="h-auto p-0" onClick={() => setFilter("all")} data-testid="button-mileage-show-all">
                    {t("mileageHistory.showAll")}
                  </Button>
                </div>
              )}

              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{labels.date}</TableHead>
                      <TableHead className="text-right">{labels.mileage}</TableHead>
                      <TableHead className="text-right">{labels.driven}</TableHead>
                      <TableHead>{labels.source}</TableHead>
                      <TableHead>{labels.actor}</TableHead>
                      <TableHead>{labels.warning}</TableHead>
                      <TableHead className="w-10"><span className="sr-only">{t("mileageHistory.actions")}</span></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visibleRows.length === 0 ? (
                      <TableRow><TableCell colSpan={7} className="text-center text-gray-500">{t("mileageHistory.noWarnings")}</TableCell></TableRow>
                    ) : visibleRows.map((r) => (
                      <TableRow key={r.id} className={r.voided ? "text-gray-400" : r.warning ? "bg-amber-50" : ""} data-testid={`mileage-row-${r.id}`}>
                        <TableCell className={r.voided ? "line-through" : ""}>{formatDateTimeNl(r.recordedAt)}</TableCell>
                        <TableCell className={`text-right ${r.voided ? "line-through" : ""}`}>{formatKm(r.mileage)}</TableCell>
                        <TableCell className="text-right">{r.drivenSincePrevious == null ? "–" : formatKm(r.drivenSincePrevious)}</TableCell>
                        <TableCell>{sourceLabel(r.source)}</TableCell>
                        <TableCell>{r.actorName ?? "–"}</TableCell>
                        <TableCell>
                          {r.voided ? (
                            <Badge variant="outline" className="text-gray-500">{labels.voided}</Badge>
                          ) : r.warning ? (
                            <Badge variant="outline" className="border-amber-300 text-amber-700" data-testid={`mileage-warning-${r.warning}`}>
                              {labels.warningTypes[r.warning]}
                            </Badge>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            title={r.voided ? t("mileageHistory.unvoidAction") : t("mileageHistory.voidAction")}
                            aria-label={r.voided ? t("mileageHistory.unvoidAction") : t("mileageHistory.voidAction")}
                            onClick={() => setToggleRow(r)}
                            data-testid={`button-${r.voided ? "unvoid" : "void"}-reading-${r.id}`}
                          >
                            {r.voided ? <RotateCcw className="h-4 w-4" /> : <Ban className="h-4 w-4" />}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </>
      )}

      <HtmlPreviewDialog
        open={printHtml !== null}
        onOpenChange={(open) => { if (!open) setPrintHtml(null); }}
        html={printHtml}
        title={data ? `${labels.title} ${formatLicensePlate(data.vehicle.licensePlate)}` : labels.title}
        reportName="mileage-history"
      />
      <AlertDialog open={toggleRow !== null} onOpenChange={(open) => { if (!open && !toggleVoided.isPending) setToggleRow(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {toggleRow?.voided ? t("mileageHistory.unvoidConfirmTitle") : t("mileageHistory.voidConfirmTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {toggleRow && t(toggleRow.voided ? "mileageHistory.unvoidConfirmText" : "mileageHistory.voidConfirmText", {
                mileage: formatKm(toggleRow.mileage),
                date: formatDateTimeNl(toggleRow.recordedAt),
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={toggleVoided.isPending}>{t("mileageHistory.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              disabled={toggleVoided.isPending}
              onClick={(e) => { e.preventDefault(); if (toggleRow) toggleVoided.mutate(toggleRow); }}
              data-testid="button-confirm-reading-voided"
            >
              {toggleRow?.voided ? t("mileageHistory.unvoidAction") : t("mileageHistory.voidAction")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
