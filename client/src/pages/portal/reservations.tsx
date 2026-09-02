import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { PortalReservationDto } from "@shared/portal-types";
import { portalQueryFn } from "@/lib/portal-api";
import { usePortalAuth } from "@/hooks/use-portal-auth";
import { ReservationCard } from "@/components/portal/reservation-card";

export default function PortalReservationsPage() {
  const { t } = useTranslation("portal");
  const { me } = usePortalAuth();
  const { data = [], isLoading } = useQuery<PortalReservationDto[]>({ queryKey: ["portal", "/api/portal/reservations"], queryFn: portalQueryFn });
  if (isLoading) return null;
  return (
    <div className="space-y-2">
      <h1 className="text-lg font-semibold">{t("reservations.title")}</h1>
      {data.length === 0 && <p className="text-sm text-muted-foreground">{t("reservations.empty")}</p>}
      {data.map((r) => <ReservationCard key={r.id} reservation={r} showPrice={Boolean(me?.settings.showPrices)} />)}
    </div>
  );
}
