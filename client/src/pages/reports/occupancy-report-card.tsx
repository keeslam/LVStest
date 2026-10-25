/**
 * Rapporten fase 3, onderdeel 6: the occupancy report on Rapporten > Voertuigen.
 * Period tiles (cars with at least one day rented / replacement / workshop /
 * available, vehicle-days as hint), the average occupancy, and the calendar. A
 * click on a day shows that day's tiles; a tile opens the list per vehicle for
 * that one day. Occupied = rentals only; workshop and replacement stay apart.
 *
 * Needs the report right and the reservations right (like the server routes):
 * without them no card and no request. A period over OCCUPANCY_MAX_DAYS is not
 * asked for (the server would refuse it), the card says to pick a shorter one.
 */
import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import {
  OCCUPANCY_MAX_DAYS,
  OCCUPANCY_TILES,
  type OccupancyRow,
  type OccupancySort,
  type OccupancySummary,
  type OccupancyTile,
} from "@shared/reports/occupancy-report";
import { UserPermission } from "@shared/schema";
import { ReportSection } from "@/components/reports/kit/report-section";
import { useReportPrint } from "@/components/reports/kit/report-print";
import { chartSvgFromRef } from "@/lib/report-document-print";
import { compactSections } from "@/components/reports/kit/report-breakdown-table";
import { useReportRange } from "./report-filters";
import { ReportTiles, tilesPrintSection, type ReportTile } from "@/components/reports/kit/report-tiles";
import { ReportDetailDialog, type ReportColumn } from "@/components/reports/kit/report-detail-dialog";
import { EntityLink } from "@/components/reports/entity-link";
import { useHasPermission } from "@/hooks/use-has-permission";
import { formatLicensePlate } from "@/lib/format-utils";
import { formatDateNl } from "@/lib/format-date-nl";
import { csvNumber } from "@/lib/csv";
import { officeToday } from "@/lib/office-date";
import { OccupancyHeatmap } from "./occupancy-heatmap";

const ENDPOINT = "/api/reports/occupancy";

const TILE_TONE: Partial<Record<OccupancyTile, ReportTile<OccupancyTile>["tone"]>> = {
  rented: "green",
  workshop: "amber",
};

/** Days from `from` to `to`, both included, counted on the calendar (as the server does). */
function periodDays(from: string, to: string): number {
  const ms = (day: string) => Date.parse(`${day}T00:00:00Z`);
  return Math.round((ms(to) - ms(from)) / 86_400_000) + 1;
}

const pctText = (pct: number | null) => (pct === null ? "–" : `${pct.toLocaleString("nl-NL")}%`);

export function OccupancyReportCard(props: { from?: string; to?: string; vehicleId?: string }) {
  const { from, to, vehicleId } = useReportRange(props);
  const { t } = useTranslation("reports");
  const linesRef = useRef<HTMLDivElement>(null);
  const k = (key: string, opts?: Record<string, unknown>) => t(`fleetReports.occupancy.${key}`, opts);
  const canReports = useHasPermission(UserPermission.VIEW_REPORTS, UserPermission.MANAGE_REPORTS);
  const canReservations = useHasPermission(UserPermission.VIEW_RESERVATIONS, UserPermission.MANAGE_RESERVATIONS);
  const allowed = canReports && canReservations;

  // Without a period the server's default: this year up to the office's today.
  const today = officeToday();
  const periodFrom = from ?? `${today.slice(0, 4)}-01-01`;
  const periodTo = to ?? today;
  const tooLong = periodDays(periodFrom, periodTo) > OCCUPANCY_MAX_DAYS;
  const vehicle = vehicleId && vehicleId !== "all" ? vehicleId : undefined;

  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [openTile, setOpenTile] = useState<OccupancyTile | null>(null);
  const [shown, setShown] = useState<{ tile: OccupancyTile; day: string | null }>({ tile: "rented", day: null });

  const params = useMemo<Record<string, string>>(
    () => ({ from: periodFrom, to: periodTo, ...(vehicle ? { vehicleId: vehicle } : {}) }),
    [periodFrom, periodTo, vehicle],
  );
  const listParams = useMemo<Record<string, string>>(
    () => (shown.day ? { from: shown.day, to: shown.day, ...(vehicle ? { vehicleId: vehicle } : {}) } : params),
    [shown.day, params, vehicle],
  );

  const { data, isLoading, isError } = useQuery<OccupancySummary>({
    queryKey: [`${ENDPOINT}/summary`, params],
    enabled: allowed && !tooLong,
  });

  // A day from another period (or vehicle) is no longer on the calendar.
  const days = data?.days ?? [];
  const day = selectedDay ? days.find((d) => d.date === selectedDay) ?? null : null;

  const columns = useMemo<Array<ReportColumn<OccupancyRow, OccupancySort>>>(() => {
    const c = (key: string) => t(`fleetReports.occupancy.columns.${key}`);
    const plate = (r: OccupancyRow) => formatLicensePlate(r.licensePlate);
    const brandModel = (r: OccupancyRow) => [r.brand, r.model].filter(Boolean).join(" ");
    const n = (v: number) => v.toLocaleString("nl-NL");
    return [
      { id: "licensePlate", label: c("licensePlate"), sortKey: "licensePlate", cell: (r) => <EntityLink kind="vehicle" id={r.vehicleId} label={plate(r)} />, csv: plate },
      { id: "brandModel", label: c("brandModel"), cell: brandModel, csv: brandModel },
      { id: "fleetDays", label: c("fleetDays"), align: "right", cell: (r) => n(r.fleetDays), csv: (r) => csvNumber(r.fleetDays, 0), print: (r) => n(r.fleetDays) },
      { id: "rentedDays", label: c("rentedDays"), align: "right", cell: (r) => n(r.rentedDays), csv: (r) => csvNumber(r.rentedDays, 0), print: (r) => n(r.rentedDays) },
      { id: "workshopDays", label: c("workshopDays"), align: "right", cell: (r) => n(r.workshopDays), csv: (r) => csvNumber(r.workshopDays, 0), print: (r) => n(r.workshopDays) },
      { id: "replacementDays", label: c("replacementDays"), align: "right", cell: (r) => n(r.replacementDays), csv: (r) => csvNumber(r.replacementDays, 0), print: (r) => n(r.replacementDays) },
      { id: "availableDays", label: c("availableDays"), align: "right", cell: (r) => n(r.availableDays), csv: (r) => csvNumber(r.availableDays, 0), print: (r) => n(r.availableDays) },
      { id: "pct", label: c("pct"), sortKey: "pct", align: "right", cell: (r) => pctText(r.pct), csv: (r) => csvNumber(r.pct, 1), print: (r) => pctText(r.pct) },
    ];
  }, [t]);


  const periodTiles: Array<ReportTile<OccupancyTile>> = OCCUPANCY_TILES.map((id) => {
    const total = data?.tiles?.[id];
    return {
      id,
      label: k(`tiles.${id}`),
      value: (total?.count ?? 0).toLocaleString("nl-NL"),
      hint: k("tileHint", { count: total?.amount ?? 0 }),
      tone: TILE_TONE[id],
    };
  });
  const dayTiles: Array<ReportTile<OccupancyTile>> = day
    ? OCCUPANCY_TILES.map((id) => ({ id, label: k(`tiles.${id}`), value: day[id].toLocaleString("nl-NL"), tone: TILE_TONE[id] }))
    : [];

  const open = (tile: OccupancyTile, onDay: string | null) => {
    setShown({ tile, day: onDay });
    setOpenTile(tile);
  };

  const dialogTitle = shown.day
    ? `${k(`tiles.${shown.tile}`)} · ${formatDateNl(shown.day, "medium")}`
    : k(`tiles.${shown.tile}`);

  useReportPrint(allowed && data && !tooLong ? compactSections([
    tilesPrintSection(periodTiles),
    { kind: "note", text: k("avgPct", { pct: pctText(data.avgPct ?? null) }) },
    { kind: "chart", title: k("title"), getSvg: () => chartSvgFromRef(linesRef) },
  ]) : null);

  if (!allowed) return null;

  return (
    <ReportSection testId="card-occupancy-report" title={k("title")} description={k("description")}>
        {tooLong ? (
          <p className="text-sm text-muted-foreground" data-testid="occupancy-period-too-long">
            {t("reportKit.periodTooLong", { days: OCCUPANCY_MAX_DAYS })}
          </p>
        ) : isLoading ? (
          <p className="text-sm text-muted-foreground" data-testid="occupancy-report-loading">{t("reportKit.loading")}</p>
        ) : isError || !data ? (
          <p className="text-sm text-destructive" data-testid="occupancy-report-error">{t("reportKit.loadFailed")}</p>
        ) : (
          <>
            <ReportTiles tiles={periodTiles} testIdPrefix="occupancy" onOpen={(id) => open(id, null)} />
            <p className="text-sm" data-testid="occupancy-avg-pct">{k("avgPct", { pct: pctText(data.avgPct ?? null) })}</p>
            <OccupancyHeatmap linesRef={linesRef} days={days} selectedDay={day?.date ?? null} onSelectDay={setSelectedDay} />
            {day && (
              <div className="space-y-2" data-testid="occupancy-day-detail">
                <h4 className="text-sm font-medium">
                  {k("dayTitle", { date: formatDateNl(day.date, "long"), fleet: day.fleet, pct: pctText(day.pct) })}
                </h4>
                <ReportTiles tiles={dayTiles} testIdPrefix="occupancy-day" onOpen={(id) => open(id, day.date)} />
              </div>
            )}
          </>
        )}
      <ReportDetailDialog<OccupancyRow, OccupancySort>
        open={openTile !== null}
        onOpenChange={(o) => { if (!o) setOpenTile(null); }}
        title={dialogTitle}
        description={k("title")}
        endpoint={ENDPOINT}
        params={listParams}
        tile={shown.tile}
        columns={columns}
        defaultSort={{ key: "licensePlate", dir: "asc" }}
        rowKey={(r) => r.vehicleId}
        csvSubject={k("csvSubject")}
        reportName="occupancy"
        testId="occupancy-report"
      />
    </ReportSection>
  );
}
