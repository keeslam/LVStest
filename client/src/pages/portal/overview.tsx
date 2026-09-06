import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Car, CalendarClock, Inbox, Receipt, Plus, UserPlus, FileText, CalendarDays } from "lucide-react";
import type { PortalReservationDto } from "@shared/portal-types";
import type { PortalFineDto } from "@shared/fines";
import type { PortalRequestDto } from "@shared/portal-requests";
import { portalQueryFn } from "@/lib/portal-api";
import { usePortalAuth } from "@/hooks/use-portal-auth";
import { usePortalDialogs } from "@/hooks/use-portal-dialogs";
import { Button } from "@/components/ui/button";
import { ReservationCard } from "@/components/portal/reservation-card";
import { DriverFormDialog } from "@/components/portal/driver-form-dialog";
import { EmptyState, Section, Tile, btnPrimary, btnSecondary } from "@/components/portal/ui";

/** The customer's dashboard: what is on the road, what is coming, what needs their attention. */
export default function PortalOverviewPage() {
  const { t } = useTranslation("portal");
  const { me } = usePortalAuth();
  const { openNewRequest, openList } = usePortalDialogs();
  const { data: reservations = [] } = useQuery<PortalReservationDto[]>({ queryKey: ["portal", "/api/portal/reservations"], queryFn: portalQueryFn });
  const { data: fines = [] } = useQuery<PortalFineDto[]>({ queryKey: ["portal", "/api/portal/fines"], queryFn: portalQueryFn, enabled: Boolean(me?.settings.canViewFines) });
  const { data: requests = [] } = useQuery<PortalRequestDto[]>({ queryKey: ["portal", "/api/portal/requests"], queryFn: portalQueryFn, enabled: Boolean(me?.settings.canSubmitRequests) });
  const showPrice = Boolean(me?.settings.showPrices);
  const current = reservations.filter((r) => r.status === "picked_up");
  const upcoming = reservations.filter((r) => r.status === "booked");
  const openFines = fines.filter((f) => f.status !== "paid" && f.status !== "cancelled");
  const openRequests = requests.filter((r) => r.status === "new" || r.status === "in_progress");
  const canManageDrivers = Boolean(me?.role === "admin" && me.settings.canManageDrivers);

  return (
    <div className="space-y-6" data-testid="portal-overview">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile tone="green" icon={<Car className="h-5 w-5" />} value={current.length} label={t("overview.tiles.current")} onClick={() => openList("current")} testId="tile-current" />
        <Tile tone="blue" icon={<CalendarClock className="h-5 w-5" />} value={upcoming.length} label={t("overview.tiles.upcoming")} onClick={() => openList("upcoming")} testId="tile-upcoming" />
        {me?.settings.canSubmitRequests && <Tile tone="amber" icon={<Inbox className="h-5 w-5" />} value={openRequests.length} label={t("overview.tiles.requests")} onClick={() => openList("requests")} testId="tile-requests" />}
        {me?.settings.canViewFines && <Tile tone="red" icon={<Receipt className="h-5 w-5" />} value={openFines.length} label={t("overview.tiles.fines")} onClick={() => openList("fines")} testId="tile-fines" />}
      </div>

      <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap">
        {me?.settings.canSubmitRequests && <Button className={btnPrimary} onClick={() => openNewRequest()} data-testid="quick-new-request"><Plus className="mr-1.5 h-4 w-4" />{t("requests.new")}</Button>}
        {canManageDrivers && <DriverFormDialog><Button variant="outline" className={btnSecondary}><UserPlus className="mr-1.5 h-4 w-4" />{t("actions.addDriver")}</Button></DriverFormDialog>}
        {me?.settings.canViewContracts && <Button variant="outline" className={btnSecondary} onClick={() => openList("documents")}><FileText className="mr-1.5 h-4 w-4" />{t("tabs.documents")}</Button>}
      </div>

      <Section title={t("overview.currentRentals")} count={current.length}>
        {current.length === 0
          ? <EmptyState icon={<Car className="h-6 w-6" />} text={t("overview.noneCurrent")} />
          : <div className="space-y-2">{current.map((r) => <ReservationCard key={r.id} reservation={r} showPrice={showPrice} />)}</div>}
      </Section>
      <Section title={t("overview.upcoming")} count={upcoming.length}>
        {upcoming.length === 0
          ? <EmptyState icon={<CalendarDays className="h-6 w-6" />} text={t("overview.noneUpcoming")} />
          : <div className="space-y-2">{upcoming.map((r) => <ReservationCard key={r.id} reservation={r} showPrice={showPrice} />)}</div>}
      </Section>
    </div>
  );
}
