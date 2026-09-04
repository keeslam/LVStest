import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { PortalReservationDto } from "@shared/portal-types";
import { portalQueryFn } from "@/lib/portal-api";
import { usePortalAuth } from "@/hooks/use-portal-auth";
import { usePortalDialogs } from "@/hooks/use-portal-dialogs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { formatPortalDate } from "@/components/portal/reservation-card";
import { ChangeDriverDialog } from "@/components/portal/change-driver-dialog";

type Detail = PortalReservationDto & {
  driverHistory: Array<{ id: number; driverId: number | null; driverName: string | null; assignedFrom: string; assignedUntil: string | null; note: string | null }>;
};

export function DetailRow({ label, value }: { label: string; value: string | number | null | undefined }) {
  if (value === null || value === undefined || value === "") return null;
  return <div className="grid grid-cols-3 gap-2 text-sm"><dt className="text-muted-foreground">{label}</dt><dd className="col-span-2">{value}</dd></div>;
}

/** One reservation: details, driver history, and the actions the customer may take. */
export function ReservationDialog({ id, onClose }: { id: number | null; onClose: () => void }) {
  const { t } = useTranslation("portal");
  const { me } = usePortalAuth();
  const { openNewRequest } = usePortalDialogs();
  const url = `/api/portal/reservations/${id}`;
  const { data: r, isLoading, isError } = useQuery<Detail>({ queryKey: ["portal", url], queryFn: portalQueryFn, enabled: id !== null });
  const canChangeDriver = Boolean(r && me?.role === "admin" && me.settings.canManageDrivers && ["booked", "picked_up"].includes(r.status));
  const canRequest = Boolean(r && me?.settings.canSubmitRequests && ["booked", "picked_up"].includes(r.status));

  return (
    <Dialog open={id !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl" data-testid="portal-reservation-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {t("reservations.detailTitle")} #{id}
            {r && <Badge variant="outline">{t(`reservations.status.${r.status}`, { defaultValue: r.status })}</Badge>}
          </DialogTitle>
        </DialogHeader>
        {isError ? <p className="p-6 text-center text-sm text-muted-foreground">{t("errors.PORTAL_NOT_FOUND")}</p> : isLoading || !r ? <div className="flex justify-center p-6"><Loader2 className="h-5 w-5 animate-spin" /></div> : (
          <div className="space-y-4">
            <dl className="space-y-1">
              <DetailRow label={t("fields.vehicle")} value={r.vehicle ? `${r.vehicle.brand} ${r.vehicle.model} (${r.vehicle.licensePlate})` : null} />
              <DetailRow label={t("fields.period")} value={`${formatPortalDate(r.startDate)} – ${r.endDate ? formatPortalDate(r.endDate) : t("overview.openEnded")}`} />
              <DetailRow label={t("fields.driver")} value={r.driver?.displayName} />
              <DetailRow label={t("fields.contractNumber")} value={r.contractNumber} />
              <DetailRow label={t("fields.pickupMileage")} value={r.pickupMileage} />
              <DetailRow label={t("fields.returnMileage")} value={r.returnMileage} />
              {me?.settings.showPrices && <DetailRow label={t("fields.price")} value={r.totalPrice ? `€ ${r.totalPrice}` : null} />}
            </dl>
            <div className="flex flex-wrap gap-2">
              {canChangeDriver && <ChangeDriverDialog reservation={r} />}
              {canRequest && (<>
                <Button size="sm" variant="outline" onClick={() => openNewRequest({ type: "extension", reservationId: r.id })} data-testid="button-request-extension">{t("requests.form.extend")}</Button>
                {me?.settings.canReturn && <Button size="sm" variant="outline" onClick={() => openNewRequest({ type: "early_return", reservationId: r.id })} data-testid="button-request-early-return">{t("requests.form.earlyReturn")}</Button>}
              </>)}
            </div>
            <div>
              <h3 className="mb-1 text-sm font-semibold">{t("reservations.driverHistory")}</h3>
              <ul className="space-y-1 rounded-md border p-3 text-sm">
                {r.driverHistory.length === 0 && <li className="text-muted-foreground">—</li>}
                {r.driverHistory.map((h) => (
                  <li key={h.id} className="flex justify-between gap-2">
                    <span>{h.driverName ?? "—"}{h.note ? <span className="text-muted-foreground"> · {h.note}</span> : null}</span>
                    <span className="text-muted-foreground">
                      {new Date(h.assignedFrom).toLocaleDateString()} – {h.assignedUntil ? new Date(h.assignedUntil).toLocaleDateString() : t("reservations.current")}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
