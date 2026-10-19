import { VehicleAvailabilityWidget } from "@/components/dashboard/vehicle-availability-widget";
import { ApkExpirationWidget } from "@/components/dashboard/apk-expiration-widget";
import { WarrantyExpirationWidget } from "@/components/dashboard/warranty-expiration-widget";
import { SpareVehicleAssignmentsWidget } from "@/components/dashboard/spare-vehicle-assignments-widget";
import { OverdueReservationsWidget } from "@/components/dashboard/overdue-reservations-widget";
import { UpcomingReservations } from "@/components/dashboard/upcoming-reservations";
import { RecentExpenses } from "@/components/dashboard/recent-expenses";
import { ReservationCalendar } from "@/components/dashboard/reservation-calendar";
import { QuickActions } from "@/components/dashboard/quick-actions";
import { BackupStalenessBanner } from "@/components/backup/backup-staleness-banner";
import { AccessDeniedBanner } from "@/components/security/access-denied-banner";
import { DriverLicenseWidget } from "@/components/dashboard/driver-license-widget";
import { useQuery } from "@tanstack/react-query";
import { DASHBOARD_TILES_KEY, dashboardTilesFromSetting, type DashboardTileId } from "@shared/dashboard-tiles";

/** Kees 2026-10-19 — the tiles, in the order and selection set in App-instellingen > Dashboard. */
const TILE_COMPONENTS: Record<DashboardTileId, () => JSX.Element> = {
  availability: VehicleAvailabilityWidget,
  apk: ApkExpirationWidget,
  overdue: OverdueReservationsWidget,
  warranty: WarrantyExpirationWidget,
  licenses: DriverLicenseWidget,
};

/**
 * The tiles fill the row whatever the number chosen (Kees 2026-10-19: "ook meeschalen
 * als we er minder dan 4 geselecteerd hebben"). Literal class names, so Tailwind keeps them.
 */
export function tileGridClass(count: number): string {
  switch (count) {
    case 1: return "grid grid-cols-1 gap-6";
    case 2: return "grid grid-cols-1 md:grid-cols-2 gap-6";
    case 3: return "grid grid-cols-1 md:grid-cols-3 gap-6";
    case 4: return "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6";
    default: return "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6";
  }
}

export default function Dashboard() {
  const { data: tileSetting, isLoading: tilesLoading } = useQuery<{ value?: unknown } | null>({
    queryKey: [`/api/app-settings/key/${DASHBOARD_TILES_KEY}`],
  });
  const tiles = dashboardTilesFromSetting(tileSetting?.value).filter((tile) => tile.visible);

  return (
    <div className="space-y-6">
      {/* Backup Health */}
      <BackupStalenessBanner />

      {/* D14: refused attempts since the administrator's previous login */}
      <AccessDeniedBanner />

      {/* OPT-001 - the entry to the work-day screen, above everything else. */}

      {/* Quick Actions */}
      <QuickActions />
      
      {/* Dashboard Widgets */}
      {!tilesLoading && tiles.length > 0 && (
        <div className={tileGridClass(tiles.length)} data-testid="dashboard-tiles">
          {tiles.map((tile) => {
            const Tile = TILE_COMPONENTS[tile.id];
            return <div key={tile.id} data-testid={`dashboard-tile-${tile.id}`}><Tile /></div>;
          })}
        </div>
      )}
      
      {/* Spare Vehicles and Expenses */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SpareVehicleAssignmentsWidget />
        <RecentExpenses />
      </div>
      
      {/* Upcoming Reservations */}
      <UpcomingReservations />
      
      {/* Calendar */}
      <ReservationCalendar />
    </div>
  );
}
