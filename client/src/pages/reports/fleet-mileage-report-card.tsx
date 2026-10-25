/**
 * Rapporten fase 3, onderdeel 8: the fleet mileage report on Rapporten > Voertuigen (admin only).
 * Tiles (cars that drove, warning readings, cars with too few readings), a chart of km per month
 * and the list behind each tile. The km come from the same function as the km panel of a vehicle.
 *
 * Only an admin gets the card and the requests: the server refuses everyone else (requireAdmin),
 * and the card does not even ask. The list has one column per month of the summary.
 */
import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  FLEET_MILEAGE_TILES,
  type FleetMileageRow,
  type FleetMileageSort,
  type FleetMileageSummary,
  type FleetMileageTile,
  type FleetMileageVehicleRow,
  type FleetMileageWarningRow,
} from "@shared/reports/fleet-mileage-report";
import { UserPermission, UserRole } from "@shared/schema";
import { ReportSection } from "@/components/reports/kit/report-section";
import { useReportPrint } from "@/components/reports/kit/report-print";
import { chartSvgFromRef } from "@/lib/report-document-print";
import { compactSections } from "@/components/reports/kit/report-breakdown-table";
import { useReportRange } from "./report-filters";
import { ReportTiles, tilesPrintSection, useCompareTile, type BetterDir, type ReportTile } from "@/components/reports/kit/report-tiles";
import { previousOf, useComparedSummary } from "@/components/reports/kit/use-compared";
import { ReportMonthChart } from "@/components/reports/kit/report-month-chart";
import { ReportDetailDialog, type ReportColumn } from "@/components/reports/kit/report-detail-dialog";
import { EntityLink } from "@/components/reports/entity-link";
import { useAuth } from "@/hooks/use-auth";
import { useHasPermission } from "@/hooks/use-has-permission";
import { formatLicensePlate } from "@/lib/format-utils";
import { formatDateNl } from "@/lib/format-date-nl";
import { csvNumber } from "@/lib/csv";

const ENDPOINT = "/api/reports/fleet-mileage";

const TILE_TONE: Partial<Record<FleetMileageTile, ReportTile<FleetMileageTile>["tone"]>> = {
  warnings: "amber",
};

/** Fewer warnings and fewer cars with too few readings is better; driven stays neutral. */
const MILEAGE_BETTER: Partial<Record<FleetMileageTile, BetterDir>> = { warnings: "down", sparse: "down" };

const n = (v: number) => v.toLocaleString("nl-NL");
const kmText = (v: number | null) => (v === null ? "" : n(v));
const monthLabel = (month: string) => formatDateNl(`${month}-01T12:00:00`, "MMM yyyy");
const instantText = (iso: string | null) => (iso ? formatDateNl(iso, "medium") : "");

type Column = ReportColumn<FleetMileageRow, FleetMileageSort>;

export function FleetMileageReportCard(props: { from?: string; to?: string; vehicleId?: string }) {
  const { from, to, vehicleId } = useReportRange(props);
  const { t } = useTranslation("reports");
  const monthChartRef = useRef<HTMLDivElement>(null);
  const k = (key: string, opts?: Record<string, unknown>) => t(`fleetReports.mileage.${key}`, opts);
  const { user } = useAuth();
  const isAdmin = user?.role === UserRole.ADMIN;
  const canReports = useHasPermission(UserPermission.VIEW_REPORTS, UserPermission.MANAGE_REPORTS);
  const allowed = isAdmin && canReports;

  const [openTile, setOpenTile] = useState<FleetMileageTile | null>(null);
  const [shown, setShown] = useState<FleetMileageTile>("driven");

  const vehicle = vehicleId && vehicleId !== "all" ? vehicleId : undefined;
  const params = useMemo<Record<string, string>>(
    () => ({ ...(from ? { from } : {}), ...(to ? { to } : {}), ...(vehicle ? { vehicleId: vehicle } : {}) }),
    [from, to, vehicle],
  );

  const { data, isLoading, isError, previous, compareRange } = useComparedSummary<FleetMileageSummary>(`${ENDPOINT}/summary`, params, { enabled: allowed });
  const compareTile = useCompareTile();

  const months = useMemo(() => (data?.byMonth ?? []).map((m) => m.month), [data]);

  const vehicleColumns = useMemo<Column[]>(() => {
    const c = (key: string) => t(`fleetReports.mileage.columns.${key}`);
    const veh = (r: FleetMileageRow): FleetMileageVehicleRow | null => (r.kind === "vehicle" ? r : null);
    const plate = (r: FleetMileageRow) => formatLicensePlate(r.licensePlate);
    const brandModel = (r: FleetMileageRow) => {
      const v = veh(r);
      return v ? [v.brand, v.model].filter(Boolean).join(" ") : "";
    };
    const km = (id: string, label: string, value: (v: FleetMileageVehicleRow) => number | null, sortKey?: FleetMileageSort): Column => ({
      id, label, sortKey, align: "right",
      cell: (r) => { const v = veh(r); return v ? kmText(value(v)) : ""; },
      csv: (r) => { const v = veh(r); return v ? csvNumber(value(v), 0) : ""; },
      print: (r) => { const v = veh(r); return v ? kmText(value(v)) : ""; },
    });
    const when = (id: string, label: string, value: (v: FleetMileageVehicleRow) => string | null): Column => ({
      id, label,
      cell: (r) => { const v = veh(r); return v ? instantText(value(v)) : ""; },
      csv: (r) => { const v = veh(r); return v ? instantText(value(v)) : ""; },
    });
    return [
      { id: "licensePlate", label: c("licensePlate"), sortKey: "licensePlate", cell: (r) => <EntityLink kind="vehicle" id={r.vehicleId} label={plate(r)} />, csv: plate },
      { id: "brandModel", label: c("brandModel"), cell: brandModel, csv: brandModel },
      km("km", c("km"), (v) => v.drivenKm, "km"),
      km("avgPerMonth", c("avgPerMonth"), (v) => v.avgPerMonth),
      km("freeKm", c("freeKm"), (v) => v.freeKm),
      km("overFreeKm", c("overFreeKm"), (v) => v.overFreeKm),
      km("readings", c("readings"), (v) => v.readings),
      km("warnings", c("warnings"), (v) => v.warnings, "warnings"),
      when("firstReading", c("firstReading"), (v) => v.firstReading),
      when("lastReading", c("lastReading"), (v) => v.lastReading),
      ...months.map((month): Column => ({
        id: `month-${month}`,
        label: monthLabel(month),
        align: "right",
        cell: (r) => { const v = veh(r); return v ? n(v.kmByMonth[month] ?? 0) : ""; },
        csv: (r) => { const v = veh(r); return v ? csvNumber(v.kmByMonth[month] ?? 0, 0) : ""; },
        print: (r) => { const v = veh(r); return v ? n(v.kmByMonth[month] ?? 0) : ""; },
      })),
    ];
  }, [t, months]);

  const warningColumns = useMemo<Column[]>(() => {
    const c = (key: string) => t(`fleetReports.mileage.columns.${key}`);
    const warn = (r: FleetMileageRow): FleetMileageWarningRow | null => (r.kind === "warning" ? r : null);
    const plate = (r: FleetMileageRow) => formatLicensePlate(r.licensePlate);
    const text = (value: (w: FleetMileageWarningRow) => string): ((r: FleetMileageRow) => string) =>
      (r) => { const w = warn(r); return w ? value(w) : ""; };
    const km = (id: string, label: string, value: (w: FleetMileageWarningRow) => number | null): Column => ({
      id, label, align: "right",
      cell: (r) => { const w = warn(r); return w ? kmText(value(w)) : ""; },
      csv: (r) => { const w = warn(r); return w ? csvNumber(value(w), 0) : ""; },
      print: (r) => { const w = warn(r); return w ? kmText(value(w)) : ""; },
    });
    const dateTime = text((w) => formatDateNl(w.recordedAt, "medium"));
    const warning = text((w) => t(`vehicles:mileageHistory.warningTypes.${w.warning}`));
    const source = text((w) => t(`vehicles:mileageHistory.sources.${w.source}`));
    const actor = text((w) => w.actorName ?? "");
    return [
      { id: "recordedAt", label: c("recordedAt"), sortKey: "date", cell: dateTime, csv: dateTime },
      { id: "licensePlate", label: c("licensePlate"), sortKey: "licensePlate", cell: (r) => <EntityLink kind="vehicle" id={r.vehicleId} label={plate(r)} />, csv: plate },
      km("mileage", c("mileage"), (w) => w.mileage),
      km("drivenSincePrevious", c("drivenSincePrevious"), (w) => w.drivenSincePrevious),
      { id: "warning", label: c("warning"), cell: warning, csv: warning },
      { id: "source", label: c("source"), cell: source, csv: source },
      { id: "actor", label: c("actor"), cell: actor, csv: actor },
    ];
  }, [t]);


  const open = (tile: FleetMileageTile) => {
    setShown(tile);
    setOpenTile(tile);
  };

  const tiles: Array<ReportTile<FleetMileageTile>> = FLEET_MILEAGE_TILES.map((id) => {
    const total = data?.tiles?.[id];
    return compareTile({
      id,
      label: k(`tiles.${id}`),
      value: n(total?.count ?? 0),
      hint: id === "driven" ? k("tileHint", { km: n(total?.amount ?? 0) }) : undefined,
      tone: TILE_TONE[id],
    }, {
      current: total?.count ?? 0,
      previous: previousOf(previous, (s) => s.tiles?.[id]?.count ?? 0),
      better: MILEAGE_BETTER[id],
    });
  });

  const isWarnings = shown === "warnings";

  useReportPrint(allowed && data ? compactSections([
    tilesPrintSection(tiles),
    { kind: "chart", title: k("byMonth"), getSvg: () => chartSvgFromRef(monthChartRef) },
  ]) : null);

  if (!allowed) return null;

  return (
    <ReportSection testId="card-fleet-mileage-report" title={k("title")} description={k("description")}>
        {isLoading ? (
          <p className="text-sm text-muted-foreground" data-testid="fleet-mileage-loading">{t("reportKit.loading")}</p>
        ) : isError || !data ? (
          <p className="text-sm text-destructive" data-testid="fleet-mileage-error">{t("reportKit.loadFailed")}</p>
        ) : (
          <>
            <ReportTiles tiles={tiles} testIdPrefix="fleet-mileage" onOpen={open} />
            <div className="space-y-2">
              <h4 className="text-sm font-medium">{k("byMonth")}</h4>
              <ReportMonthChart
                data={data.byMonth ?? []}
                series={[{ key: "km", label: k("kmSeries"), color: "#2563eb" }]}
                testId="fleet-mileage-month-chart"
                chartRef={monthChartRef}
                previousData={previous?.byMonth}
                period={params}
                compareRange={compareRange}
              />
            </div>
          </>
        )}
      <ReportDetailDialog<FleetMileageRow, FleetMileageSort>
        open={openTile !== null}
        onOpenChange={(o) => { if (!o) setOpenTile(null); }}
        title={`${k("title")} · ${k(`tiles.${shown}`)}`}
        description={k("description")}
        endpoint={ENDPOINT}
        params={params}
        tile={shown}
        columns={isWarnings ? warningColumns : vehicleColumns}
        defaultSort={isWarnings ? { key: "date", dir: "desc" } : shown === "driven" ? { key: "km", dir: "desc" } : { key: "licensePlate", dir: "asc" }}
        rowKey={(r) => r.id}
        csvSubject={k("csvSubject")}
        reportName="fleet-mileage"
        testId="fleet-mileage"
      />
    </ReportSection>
  );
}
