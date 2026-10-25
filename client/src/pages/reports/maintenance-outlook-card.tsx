/**
 * Rapporten fase 3, onderdeel 7: the maintenance and APK outlook on Rapporten > Voertuigen.
 * The horizon (1/2/3/6/12 months, default 3) is the period: from = the office's today,
 * to = from + N months; the filter bar's period does not apply here. Tiles per kind,
 * a block with what is already overdue, and the coming weeks with the license plates.
 *
 * Needs the report right and the vehicles right (like the server routes). The km
 * columns are for admins only: the server sends null for everyone else, and the
 * card does not show those columns at all.
 */
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { addDays, addMonths, format, getISOWeek, parseISO } from "date-fns";
import {
  DEFAULT_OUTLOOK_HORIZON,
  MAINTENANCE_OUTLOOK_HORIZONS,
  MAINTENANCE_OUTLOOK_TILES,
  type MaintenanceOutlookRow,
  type MaintenanceOutlookSort,
  type MaintenanceOutlookSummary,
  type MaintenanceOutlookTile,
} from "@shared/reports/maintenance-outlook-report";
import { UserPermission, UserRole } from "@shared/schema";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ReportSection } from "@/components/reports/kit/report-section";
import { useReportPrint } from "@/components/reports/kit/report-print";
import { compactSections, textTablePrintSection } from "@/components/reports/kit/report-breakdown-table";
import { useReportRange } from "./report-filters";
import { ReportTiles, tilesPrintSection, type ReportTile } from "@/components/reports/kit/report-tiles";
import { ReportDetailDialog, type ReportColumn } from "@/components/reports/kit/report-detail-dialog";
import { EntityLink } from "@/components/reports/entity-link";
import { useAuth } from "@/hooks/use-auth";
import { useHasPermission } from "@/hooks/use-has-permission";
import { formatLicensePlate } from "@/lib/format-utils";
import { formatDateNl } from "@/lib/format-date-nl";
import { csvNumber } from "@/lib/csv";
import { officeToday } from "@/lib/office-date";

const ENDPOINT = "/api/reports/maintenance-outlook";

const TILE_TONE: Partial<Record<MaintenanceOutlookTile, ReportTile<MaintenanceOutlookTile>["tone"]>> = {
  overdue: "red",
};

const n = (v: number) => v.toLocaleString("nl-NL");
const kmText = (v: number | null) => (v === null ? "" : n(v));

export function MaintenanceOutlookCard(props: { vehicleId?: string }) {
  const { vehicleId } = useReportRange(props);
  const { t } = useTranslation("reports");
  const k = (key: string, opts?: Record<string, unknown>) => t(`fleetReports.outlook.${key}`, opts);
  const { user } = useAuth();
  const isAdmin = user?.role === UserRole.ADMIN;
  const canReports = useHasPermission(UserPermission.VIEW_REPORTS, UserPermission.MANAGE_REPORTS);
  const canVehicles = useHasPermission(UserPermission.VIEW_VEHICLES, UserPermission.MANAGE_VEHICLES);
  const allowed = canReports && canVehicles;

  const [horizon, setHorizon] = useState<number>(DEFAULT_OUTLOOK_HORIZON);
  const [openTile, setOpenTile] = useState<MaintenanceOutlookTile | null>(null);
  const [shown, setShown] = useState<MaintenanceOutlookTile>("all");

  const from = officeToday();
  const to = format(addMonths(parseISO(from), horizon), "yyyy-MM-dd");
  const vehicle = vehicleId && vehicleId !== "all" ? vehicleId : undefined;
  const params = useMemo<Record<string, string>>(
    () => ({ from, to, ...(vehicle ? { vehicleId: vehicle } : {}) }),
    [from, to, vehicle],
  );

  const { data, isLoading, isError } = useQuery<MaintenanceOutlookSummary>({
    queryKey: [`${ENDPOINT}/summary`, params],
    enabled: allowed,
  });

  const columns = useMemo<Array<ReportColumn<MaintenanceOutlookRow, MaintenanceOutlookSort>>>(() => {
    const c = (key: string) => t(`fleetReports.outlook.columns.${key}`);
    const plate = (r: MaintenanceOutlookRow) => formatLicensePlate(r.licensePlate);
    const brandModel = (r: MaintenanceOutlookRow) => [r.brand, r.model].filter(Boolean).join(" ");
    const kind = (r: MaintenanceOutlookRow) => t(`fleetReports.outlook.kinds.${r.kind}`);
    const due = (r: MaintenanceOutlookRow) => formatDateNl(r.dueDate, "medium");
    const basis = (r: MaintenanceOutlookRow) => {
      const text = t(`fleetReports.outlook.basis.${r.basis}`);
      return r.basis === "months" && r.tooFewReadings ? `${text} (${t("fleetReports.outlook.tooFewReadings")})` : text;
    };
    const base: Array<ReportColumn<MaintenanceOutlookRow, MaintenanceOutlookSort>> = [
      { id: "licensePlate", label: c("licensePlate"), sortKey: "licensePlate", cell: (r) => <EntityLink kind="vehicle" id={r.vehicleId} label={plate(r)} />, csv: plate },
      { id: "brandModel", label: c("brandModel"), cell: brandModel, csv: brandModel },
      { id: "kind", label: c("kind"), sortKey: "kind", cell: kind, csv: kind },
      { id: "dueDate", label: c("dueDate"), sortKey: "dueDate", cell: due, csv: (r) => r.dueDate, print: due },
      { id: "basis", label: c("basis"), cell: basis, csv: basis },
    ];
    if (!isAdmin) return base;
    const km = (id: string, value: (r: MaintenanceOutlookRow) => number | null, decimals = 0) => ({
      id, label: c(id), align: "right" as const,
      cell: (r: MaintenanceOutlookRow) => kmText(value(r)),
      csv: (r: MaintenanceOutlookRow) => csvNumber(value(r), decimals),
      print: (r: MaintenanceOutlookRow) => kmText(value(r)),
    });
    return [
      ...base,
      km("currentMileage", (r) => r.currentMileage),
      km("kmUntilService", (r) => r.kmUntilService),
      km("kmPerDay", (r) => r.kmPerDay, 1),
    ];
  }, [t, isAdmin]);


  const open = (tile: MaintenanceOutlookTile) => {
    setShown(tile);
    setOpenTile(tile);
  };

  const tiles: Array<ReportTile<MaintenanceOutlookTile>> = MAINTENANCE_OUTLOOK_TILES.map((id) => ({
    id,
    label: k(`tiles.${id}`),
    value: n(data?.tiles?.[id]?.count ?? 0),
    tone: TILE_TONE[id],
  }));
  const weeks = data?.byWeek ?? [];
  const overdueCount = data?.tiles?.overdue?.count ?? 0;

  useReportPrint(allowed && data ? compactSections([
    tilesPrintSection(tiles),
    textTablePrintSection(
      "maintenance-outlook-weeks",
      undefined,
      [k("columns.licensePlate"), k("columns.kind"), k("columns.dueDate")],
      weeks.flatMap((w) => w.items.map((item) => [
        formatLicensePlate(item.licensePlate), k(`kinds.${item.kind}`), formatDateNl(item.dueDate, "medium"),
      ])),
    ),
  ]) : null);

  if (!allowed) return null;

  return (
    <ReportSection testId="card-maintenance-outlook" title={k("title")} description={k("description")}>
        <div className="flex items-center gap-2">
          <label htmlFor="outlook-horizon" className="text-sm font-medium">{k("horizon")}</label>
          <select
            id="outlook-horizon"
            className="h-9 rounded-md border bg-background px-3 text-sm"
            value={horizon}
            onChange={(e) => setHorizon(Number(e.target.value))}
            data-testid="select-outlook-horizon"
          >
            {MAINTENANCE_OUTLOOK_HORIZONS.map((months) => (
              <option key={months} value={months}>{k("horizonOption", { count: months })}</option>
            ))}
          </select>
        </div>
        {isLoading ? (
          <p className="text-sm text-muted-foreground" data-testid="outlook-loading">{t("reportKit.loading")}</p>
        ) : isError || !data ? (
          <p className="text-sm text-destructive" data-testid="outlook-error">{t("reportKit.loadFailed")}</p>
        ) : (
          <>
            <ReportTiles tiles={tiles} testIdPrefix="outlook" onOpen={open} />
            {overdueCount > 0 && (
              <div
                className="flex items-center justify-between rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
                data-testid="outlook-overdue"
              >
                <span>{k("overdue", { count: overdueCount })}</span>
                <Button type="button" variant="outline" size="sm" onClick={() => open("overdue")} data-testid="button-outlook-overdue">
                  {k("overdueOpen")}
                </Button>
              </div>
            )}
            {weeks.length === 0 ? (
              <p className="text-sm text-muted-foreground" data-testid="outlook-no-weeks">{k("noWeeks")}</p>
            ) : (
              <div className="space-y-3">
                {weeks.map((w) => {
                  const start = parseISO(w.weekStart);
                  return (
                    <div key={w.weekStart} className="rounded-md border p-3" data-testid={`outlook-week-${w.weekStart}`}>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h4 className="text-sm font-medium">
                          {k("weekLabel", {
                            week: getISOWeek(start),
                            from: formatDateNl(w.weekStart, "medium"),
                            to: formatDateNl(format(addDays(start, 6), "yyyy-MM-dd"), "medium"),
                          })}
                        </h4>
                        <span className="text-xs text-muted-foreground">
                          {k("tiles.apk")} {w.apk} · {k("tiles.service")} {w.service}
                        </span>
                      </div>
                      <ul className="mt-2 flex flex-wrap gap-2">
                        {w.items.map((item) => (
                          <li key={`${item.vehicleId}-${item.kind}`} className="flex items-center gap-1 text-sm">
                            <Badge variant={item.kind === "apk" ? "secondary" : "outline"}>{k(`kinds.${item.kind}`)}</Badge>
                            <span>{formatLicensePlate(item.licensePlate)}</span>
                            <span className="text-muted-foreground">{formatDateNl(item.dueDate, "short")}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      <ReportDetailDialog<MaintenanceOutlookRow, MaintenanceOutlookSort>
        open={openTile !== null}
        onOpenChange={(o) => { if (!o) setOpenTile(null); }}
        title={`${k("title")} · ${k(`tiles.${shown}`)}`}
        description={k("description")}
        endpoint={ENDPOINT}
        params={params}
        tile={shown}
        columns={columns}
        defaultSort={{ key: "dueDate", dir: "asc" }}
        rowKey={(r) => r.id}
        csvSubject={k("csvSubject")}
        reportName="maintenance-outlook"
        testId="maintenance-outlook"
      />
    </ReportSection>
  );
}
