import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { PortalReservationDto } from "@shared/portal-types";
import { portalQueryFn } from "@/lib/portal-api";
import { usePortalAuth } from "@/hooks/use-portal-auth";
import { ReservationCard } from "@/components/portal/reservation-card";

export default function PortalOverviewPage() {
  const { t } = useTranslation("portal");
  const { me } = usePortalAuth();
  const { data = [] } = useQuery<PortalReservationDto[]>({ queryKey: ["portal", "/api/portal/reservations"], queryFn: portalQueryFn });
  const showPrice = Boolean(me?.settings.showPrices);
  const current = data.filter((r) => r.status === "picked_up");
  const upcoming = data.filter((r) => r.status === "booked");

  return (
    <div className="space-y-6" data-testid="portal-overview">
      <section>
        <h2 className="mb-2 text-base font-semibold">{t("overview.currentRentals")}</h2>
        {current.length === 0 ? <p className="text-sm text-muted-foreground">{t("overview.none")}</p>
          : <div className="space-y-2">{current.map((r) => <ReservationCard key={r.id} reservation={r} showPrice={showPrice} />)}</div>}
      </section>
      <section>
        <h2 className="mb-2 text-base font-semibold">{t("overview.upcoming")}</h2>
        {upcoming.length === 0 ? <p className="text-sm text-muted-foreground">{t("overview.none")}</p>
          : <div className="space-y-2">{upcoming.map((r) => <ReservationCard key={r.id} reservation={r} showPrice={showPrice} />)}</div>}
      </section>
    </div>
  );
}
