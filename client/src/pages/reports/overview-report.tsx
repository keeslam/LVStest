/**
 * Rapporten herontwerp deel 1, Task 7: the Overzicht tab. Eight key numbers; each is a button that
 * opens the report behind it. A tile shows only when its report is visible to the user, and
 * only then does it ask the server (the same summary queries as the report cards).
 */
import { useTranslation } from "react-i18next";
import { useReportPrint } from "@/components/reports/kit/report-print";
import { tilesPrintSection, type ReportTile, type ReportTileTone } from "@/components/reports/kit/report-tiles";
import { formatCurrency } from "@/lib/format-utils";
import { cn } from "@/lib/utils";
import {
  useApkOverdueMetric, useDeliveriesLateMetric, useFinesOpenMetric, useInvoicesWaitingMetric,
  useMaintenanceOverdueMetric, useMarginMetric, useOccupancyMetric, usePortalOpenMetric,
} from "./report-metrics";
import type { ReportTabId } from "./report-registry";

export const OVERVIEW_TILE_IDS = [
  "margin", "occupancy", "finesOpen", "apkOverdue", "maintenanceOverdue", "invoicesWaiting", "deliveriesLate", "portalOpen",
] as const;
export type OverviewTileId = (typeof OVERVIEW_TILE_IDS)[number];

/** The report id each tile opens. */
export const OVERVIEW_TILE_REPORT: Record<OverviewTileId, string> = {
  margin: "vehicle-financials",
  occupancy: "occupancy",
  finesOpen: "fines",
  apkOverdue: "apk-overview",
  maintenanceOverdue: "maintenance-outlook",
  invoicesWaiting: "invoice-inbox-items",
  deliveriesLate: "deliveries",
  portalOpen: "portal-requests",
};

interface OverviewReportProps {
  /** Ids of the reports the user may see. */
  shown: ReadonlySet<string>;
  tabOf(reportId: string): ReportTabId | undefined;
  onOpen(tab: ReportTabId, reportId: string): void;
}

const DASH = "–";
const n = (v: number | null) => (v === null ? DASH : v.toLocaleString("nl-NL"));

const TONE_CLASS: Record<ReportTileTone, string> = {
  default: "text-foreground",
  green: "text-green-600",
  red: "text-red-600",
  amber: "text-amber-600",
};

export function OverviewReport({ shown, tabOf, onOpen }: OverviewReportProps) {
  const { t } = useTranslation("reports");
  const on = (id: OverviewTileId) => shown.has(OVERVIEW_TILE_REPORT[id]);

  const margin = useMarginMetric(on("margin"));
  const occupancy = useOccupancyMetric(on("occupancy"));
  const fines = useFinesOpenMetric(on("finesOpen"));
  const apk = useApkOverdueMetric(on("apkOverdue"));
  const maintenance = useMaintenanceOverdueMetric(on("maintenanceOverdue"));
  const invoices = useInvoicesWaitingMetric(on("invoicesWaiting"));
  const deliveries = useDeliveriesLateMetric(on("deliveriesLate"));
  const portal = usePortalOpenMetric(on("portalOpen"));

  const alert = (v: number | null): ReportTileTone => (v ? "red" : "default");
  const all: Array<{ id: OverviewTileId; value: string; tone: ReportTileTone; hint?: string }> = [
    { id: "margin", value: margin.value === null ? DASH : formatCurrency(margin.value), tone: margin.value !== null && margin.value < 0 ? "red" : "default" },
    {
      id: "occupancy",
      value: occupancy.value === null ? DASH : `${occupancy.value.toLocaleString("nl-NL")}%`,
      tone: "default",
      ...(occupancy.tooLong ? { hint: t("reportsPage.overview.periodTooLong") } : {}),
    },
    { id: "finesOpen", value: n(fines.value), tone: alert(fines.value) },
    { id: "apkOverdue", value: n(apk.value), tone: alert(apk.value) },
    { id: "maintenanceOverdue", value: n(maintenance.value), tone: alert(maintenance.value) },
    { id: "invoicesWaiting", value: n(invoices.value), tone: alert(invoices.value) },
    { id: "deliveriesLate", value: n(deliveries.value), tone: alert(deliveries.value) },
    { id: "portalOpen", value: n(portal.value), tone: alert(portal.value) },
  ];
  const tiles = all.filter((tile) => on(tile.id));

  useReportPrint(tiles.length > 0
    ? [tilesPrintSection(tiles.map((tile): ReportTile<string> => ({
      id: tile.id, label: t(`reportsPage.overview.tiles.${tile.id}`), value: tile.value, ...(tile.hint ? { hint: tile.hint } : {}),
    })))]
    : null);

  if (tiles.length === 0) {
    return <p className="text-sm text-muted-foreground" data-testid="overview-empty">{t("reportsPage.overview.empty")}</p>;
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4" data-testid="overview-tiles">
      {tiles.map((tile) => {
        const reportId = OVERVIEW_TILE_REPORT[tile.id];
        return (
          <button
            key={tile.id}
            type="button"
            onClick={() => { const tab = tabOf(reportId); if (tab) onOpen(tab, reportId); }}
            className="rounded-lg border bg-card text-left shadow-sm transition hover:border-primary/50 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            data-testid={`overview-tile-${tile.id}`}
          >
            <div className="p-4">
              <p className={cn("text-2xl font-bold", TONE_CLASS[tile.tone])} data-testid={`overview-tile-${tile.id}-value`}>{tile.value}</p>
              <p className="text-sm text-muted-foreground">{t(`reportsPage.overview.tiles.${tile.id}`)}</p>
              {tile.hint && <p className="mt-1 text-xs text-muted-foreground">{tile.hint}</p>}
            </div>
          </button>
        );
      })}
    </div>
  );
}
