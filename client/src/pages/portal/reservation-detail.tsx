import { useQuery } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { useTranslation } from "react-i18next";
import type { PortalReservationDto } from "@shared/portal-types";
import { portalQueryFn } from "@/lib/portal-api";
import { usePortalAuth } from "@/hooks/use-portal-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatPortalDate } from "@/components/portal/reservation-card";
import { ChangeDriverDialog } from "@/components/portal/change-driver-dialog";

type Detail = PortalReservationDto & {
  driverHistory: Array<{ id: number; driverId: number | null; driverName: string | null; assignedFrom: string; assignedUntil: string | null; note: string | null }>;
};

export default function PortalReservationDetailPage() {
  const { t } = useTranslation("portal");
  const { id } = useParams<{ id: string }>();
  const { me } = usePortalAuth();
  const url = `/api/portal/reservations/${id}`;
  const { data: r, isLoading } = useQuery<Detail>({ queryKey: ["portal", url], queryFn: portalQueryFn });
  if (isLoading || !r) return null;

  const canChangeDriver = me?.role === "admin" && me.settings.canManageDrivers && ["booked", "picked_up"].includes(r.status);
  const row = (label: string, value: string | number | null | undefined) => value ? (
    <div className="grid grid-cols-3 gap-2 text-sm"><dt className="text-muted-foreground">{label}</dt><dd className="col-span-2">{value}</dd></div>
  ) : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">{t("reservations.detailTitle")} #{r.id}</h1>
        <Link href="/portaal/reserveringen"><Button variant="ghost" size="sm">←</Button></Link>
      </div>
      <Card>
        <CardContent className="p-4 space-y-2">
          <dl className="space-y-1">
            {row(t("fields.vehicle"), r.vehicle ? `${r.vehicle.brand} ${r.vehicle.model} (${r.vehicle.licensePlate})` : null)}
            {row(t("fields.period"), `${formatPortalDate(r.startDate)} – ${r.endDate ? formatPortalDate(r.endDate) : t("overview.openEnded")}`)}
            {row(t("fields.status"), t(`reservations.status.${r.status}`, { defaultValue: r.status }))}
            {row(t("fields.driver"), r.driver?.displayName)}
            {row(t("fields.contractNumber"), r.contractNumber)}
            {row(t("fields.pickupMileage"), r.pickupMileage)}
            {row(t("fields.returnMileage"), r.returnMileage)}
            {me?.settings.showPrices && row(t("fields.price"), r.totalPrice ? `€ ${r.totalPrice}` : null)}
          </dl>
          {canChangeDriver && <ChangeDriverDialog reservation={r} />}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">{t("reservations.driverHistory")}</CardTitle></CardHeader>
        <CardContent className="p-4 pt-0">
          <ul className="space-y-1 text-sm">
            {r.driverHistory.map((h) => (
              <li key={h.id} className="flex justify-between gap-2">
                <span>{h.driverName ?? "—"}{h.note ? <span className="text-muted-foreground"> · {h.note}</span> : null}</span>
                <span className="text-muted-foreground">
                  {new Date(h.assignedFrom).toLocaleDateString()} – {h.assignedUntil ? new Date(h.assignedUntil).toLocaleDateString() : t("reservations.current")}
                </span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
