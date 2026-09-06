import { useQuery } from "@tanstack/react-query";
import type { PortalFineDto } from "@shared/fines";
import { FineRow } from "./rows";
import { useTranslation } from "react-i18next";
import type { PortalReservationDto } from "@shared/portal-types";
import { portalQueryFn } from "@/lib/portal-api";
import { usePortalAuth } from "@/hooks/use-portal-auth";
import { usePortalDialogs } from "@/hooks/use-portal-dialogs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, MapPin, Clock, Info, ShieldAlert, Wrench, Gauge } from "lucide-react";
import { daysUntil } from "./ui";
import { formatPortalDate } from "@/components/portal/reservation-card";
import { ChangeDriverDialog } from "@/components/portal/change-driver-dialog";
import { Plate, StatusBadge } from "./ui";

type Detail = PortalReservationDto & {
  driverHistory: Array<{ id: number; driverId: number | null; driverName: string | null; assignedFrom: string; assignedUntil: string | null; note: string | null }>;
};

export function DetailRow({ label, value }: { label: string; value: string | number | null | undefined }) {
  if (value === null || value === undefined || value === "") return null;
  return <div className="grid gap-0.5 text-sm sm:grid-cols-3 sm:gap-2"><dt className="text-muted-foreground">{label}</dt><dd className="sm:col-span-2">{value}</dd></div>;
}

/** One reservation: details, driver history, and the actions the customer may take. */
export function ReservationDialog({ id, onClose }: { id: number | null; onClose: () => void }) {
  const { t } = useTranslation("portal");
  const { me } = usePortalAuth();
  const { openNewRequest } = usePortalDialogs();
  const url = `/api/portal/reservations/${id}`;
  const { data: r, isLoading, isError } = useQuery<Detail>({ queryKey: ["portal", url], queryFn: portalQueryFn, enabled: id !== null });
  const canChangeDriver = Boolean(r && me?.role === "admin" && me.settings.canManageDrivers && ["booked", "picked_up"].includes(r.status));
  const { data: fines = [] } = useQuery<PortalFineDto[]>({ queryKey: ["portal", "/api/portal/fines"], queryFn: portalQueryFn, enabled: id !== null && Boolean(me?.settings.canViewFines) });
  const linkedFines = fines.filter((f) => f.reservationId === id);
  const canRequest = Boolean(r && me?.settings.canSubmitRequests && ["booked", "picked_up"].includes(r.status));
  const apkIn = r?.vehicle?.apkDate ? daysUntil(r.vehicle.apkDate) : null;
  const apkWarning = r?.status === "picked_up" && apkIn !== null && apkIn <= 30;

  return (
    <Dialog open={id !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl" data-testid="portal-reservation-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {t("reservations.detailTitle")} #{id}
            {r && <StatusBadge kind="reservation" status={r.status} label={t(`reservations.status.${r.status}`, { defaultValue: r.status })} />}
          </DialogTitle>
        </DialogHeader>
        {isError ? <p className="p-6 text-center text-sm text-muted-foreground">{t("errors.PORTAL_NOT_FOUND")}</p> : isLoading || !r ? <div className="flex justify-center p-6"><Loader2 className="h-5 w-5 animate-spin" /></div> : (
          <div className="space-y-4">
            <dl className="space-y-1">
              {r.vehicle && <div className="grid gap-0.5 text-sm sm:grid-cols-3 sm:gap-2"><dt className="text-muted-foreground">{t("fields.vehicle")}</dt><dd className="flex flex-wrap items-center gap-2 sm:col-span-2">{r.vehicle.brand} {r.vehicle.model} <Plate value={r.vehicle.licensePlate} /></dd></div>}
              <DetailRow label={t("fields.period")} value={`${formatPortalDate(r.startDate)} – ${r.endDate ? formatPortalDate(r.endDate) : t("overview.openEnded")}`} />
              <DetailRow label={t("fields.driver")} value={r.driver?.displayName} />
              <DetailRow label={t("fields.contractNumber")} value={r.contractNumber} />
              <DetailRow label={t("fields.pickupMileage")} value={r.pickupMileage} />
              <DetailRow label={t("fields.returnMileage")} value={r.returnMileage} />
              {me?.settings.showPrices && <DetailRow label={t("fields.price")} value={r.totalPrice ? `€ ${r.totalPrice}` : null} />}
            </dl>
            {/* What the customer should know: pickup details before, APK/service warnings while on the road. */}
            {r.status === "booked" && me?.info && (
              <div className="rounded-xl border border-[#dfe2ff] bg-[#eef0fb] p-3 text-sm text-[#1a1d62]" data-testid="pickup-info">
                <div className="mb-1 flex items-center gap-2 font-semibold"><Info className="h-4 w-4" />{t("reservations.pickupInfo")}</div>
                <div className="flex items-start gap-2"><MapPin className="mt-0.5 h-4 w-4 shrink-0" /><span>{me.info.pickupAddress}</span></div>
                <div className="flex items-start gap-2"><Clock className="mt-0.5 h-4 w-4 shrink-0" /><span>{me.info.openingHours}{r.startTime ? ` · ${t("reservations.pickupAt", { time: r.startTime })}` : ""}</span></div>
                {me.info.pickupInstructions && <p className="mt-1 text-xs text-[#2a2f9c]">{me.info.pickupInstructions}</p>}
              </div>
            )}
            {(apkWarning || r.serviceDue) && (
              <div className="space-y-1" data-testid="vehicle-alerts">
                {apkWarning && <div className={`flex items-start gap-2 rounded-xl border p-3 text-sm ${apkIn! < 0 ? "border-[#f3c1c1] bg-[#fcebeb] text-[#791f1f]" : "border-[#f4d7a8] bg-[#faeeda] text-[#633806]"}`}><ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" /><span>{apkIn! < 0 ? t("reservations.apkExpired", { date: formatPortalDate(r.vehicle!.apkDate) }) : t("reservations.apkDue", { date: formatPortalDate(r.vehicle!.apkDate), days: apkIn })}</span></div>}
                {r.serviceDue && <div className={`flex items-start gap-2 rounded-xl border p-3 text-sm ${r.serviceDue === "due" ? "border-[#f3c1c1] bg-[#fcebeb] text-[#791f1f]" : "border-[#f4d7a8] bg-[#faeeda] text-[#633806]"}`}><Wrench className="mt-0.5 h-4 w-4 shrink-0" /><span>{t(r.serviceDue === "due" ? "reservations.serviceDue" : "reservations.serviceSoon")}</span></div>}
              </div>
            )}
            <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap">
              {canChangeDriver && <ChangeDriverDialog reservation={r} />}
              {canRequest && r.status === "picked_up" && (<>
                <Button size="sm" variant="outline" onClick={() => openNewRequest({ type: "maintenance", reservationId: r.id })} data-testid="button-request-maintenance"><Wrench className="mr-1 h-4 w-4" />{t("requests.form.reportMaintenance")}</Button>
                <Button size="sm" variant="outline" onClick={() => openNewRequest({ type: "mileage", reservationId: r.id })} data-testid="button-request-mileage"><Gauge className="mr-1 h-4 w-4" />{t("requests.form.reportMileage")}</Button>
                <Button size="sm" variant="outline" onClick={() => openNewRequest({ type: "damage", reservationId: r.id })} data-testid="button-request-damage">{t("requests.type.damage")}</Button>
              </>)}
              {canRequest && (<>
                <Button size="sm" variant="outline" onClick={() => openNewRequest({ type: "extension", reservationId: r.id })} data-testid="button-request-extension">{t("requests.form.extend")}</Button>
                {me?.settings.canReturn && <Button size="sm" variant="outline" onClick={() => openNewRequest({ type: "early_return", reservationId: r.id })} data-testid="button-request-early-return">{t("requests.form.earlyReturn")}</Button>}
              </>)}
            </div>
            {me?.settings.canViewFines && linkedFines.length > 0 && (
              <div>
                <h3 className="mb-1 text-sm font-semibold">{t("reservations.fines", { count: linkedFines.length })}</h3>
                <div className="space-y-2" data-testid="reservation-fines">{linkedFines.map((f) => <FineRow key={f.id} fine={f} />)}</div>
              </div>
            )}
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
