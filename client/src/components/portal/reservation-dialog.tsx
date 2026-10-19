import { useQuery } from "@tanstack/react-query";
import type { PortalFineDto } from "@shared/fines";
import { FineRow } from "./rows";
import { useTranslation } from "react-i18next";
import type { PortalReservationDto, PortalMyVehicleDto } from "@shared/portal-types";
import { portalQueryFn } from "@/lib/portal-api";
import { usePortalAuth } from "@/hooks/use-portal-auth";
import { usePortalDialogs } from "@/hooks/use-portal-dialogs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, MapPin, Clock, Info, ShieldAlert, Wrench, Gauge, XCircle } from "lucide-react";
import { formatPortalDateTimeMedium } from "@/lib/portal-format";
import { daysUntil } from "./ui";
import { formatPortalDate } from "@/components/portal/reservation-card";
import { ChangeDriverDialog } from "@/components/portal/change-driver-dialog";
import { MaintenanceLine } from "@/components/portal/vehicle-card";
import { Plate, StatusBadge } from "./ui";
import { vehicleName } from "@shared/vehicle-name";
import { HandoverBlock } from "./handover-block";
import { ReservationUploads } from "./reservation-uploads";
import { ExtraDrivers } from "./extra-drivers";

type Detail = PortalReservationDto & {
  driverHistory: Array<{ id: number; driverId: number | null; driverName: string | null; assignedFrom: string; assignedUntil: string | null; note: string | null }>;
};

export function DetailRow({ label, value, stacked }: { label: string; value: string | number | null | undefined; stacked?: boolean }) {
  if (value === null || value === undefined || value === "") return null;
  if (stacked) return <div className="text-sm"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="font-medium">{value}</dd></div>;
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
  const { data: mine = [] } = useQuery<PortalMyVehicleDto[]>({ queryKey: ["portal", "/api/portal/vehicles/mine"], queryFn: portalQueryFn, enabled: r?.status === "picked_up" });
  const myVehicle = mine.find((v) => v.reservationId === id);

  return (
    <Dialog open={id !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-5xl" data-testid="portal-reservation-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {t("reservations.detailTitle")} #{id}
            {r && <StatusBadge kind="reservation" status={r.status} label={t(`reservations.status.${r.status}`, { defaultValue: r.status })} />}
          </DialogTitle>
        </DialogHeader>
        {isError ? <p className="p-6 text-center text-sm text-muted-foreground">{t("errors.PORTAL_NOT_FOUND")}</p> : isLoading || !r ? <div className="flex justify-center p-6"><Loader2 className="h-5 w-5 animate-spin" /></div> : (
          <div className="space-y-4">
            <dl className="grid gap-x-6 gap-y-2 rounded-xl bg-muted/40 p-3 sm:grid-cols-2 lg:grid-cols-4">
              {r.vehicle && <div className="text-sm"><dt className="text-xs text-muted-foreground">{t("fields.vehicle")}</dt><dd className="flex flex-wrap items-center gap-x-2 font-medium">{vehicleName(r.vehicle.brand, r.vehicle.model)} <Plate value={r.vehicle.licensePlate} /></dd></div>}
              <DetailRow stacked label={t("fields.period")} value={`${formatPortalDate(r.startDate)} – ${r.endDate ? formatPortalDate(r.endDate) : t("overview.openEnded")}`} />
              <DetailRow stacked label={t("fields.driver")} value={r.driver?.displayName} />
              <DetailRow stacked label={t("fields.contractNumber")} value={r.contractNumber} />
              <DetailRow stacked label={t("fields.pickupMileage")} value={r.pickupMileage} />
              <DetailRow stacked label={t("fields.returnMileage")} value={r.returnMileage} />
              {me?.settings.showPrices && <DetailRow stacked label={t("fields.price")} value={r.totalPrice ? `€ ${r.totalPrice}` : null} />}
            </dl>
           <div className="grid gap-x-8 gap-y-4 lg:grid-cols-2 lg:items-start">
            {/* Where and when the car is collected or returned, what to do, and the way to extend or return early. */}
            {me?.info && (
              <HandoverBlock reservation={r} info={me.info}
                canExtend={canRequest} canReturnEarly={canRequest && Boolean(me.settings.canReturn)}
                onExtend={() => openNewRequest({ type: "extension", reservationId: r.id })}
                onReturnEarly={() => openNewRequest({ type: "early_return", reservationId: r.id })} />
            )}
           <div className="space-y-4">
            {(apkWarning || r.serviceDue || myVehicle?.maintenance) && (
              <div className="space-y-1" data-testid="vehicle-alerts">
                {apkWarning && <div className={`flex items-start gap-2 rounded-xl border p-3 text-sm ${apkIn! < 0 ? "border-[#f3c1c1] bg-[#fcebeb] text-[#791f1f]" : "border-[#f4d7a8] bg-[#faeeda] text-[#633806]"}`}><ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" /><span>{apkIn! < 0 ? t("reservations.apkExpired", { date: formatPortalDate(r.vehicle!.apkDate) }) : t("reservations.apkDue", { date: formatPortalDate(r.vehicle!.apkDate), days: apkIn })}</span></div>}
                <MaintenanceLine maintenance={myVehicle?.maintenance ?? null} serviceDue={r.serviceDue ?? null} canRequest={canRequest} />
              </div>
            )}
            <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap">
              {canChangeDriver && <ChangeDriverDialog reservation={r} />}
              {canRequest && r.status === "picked_up" && (<>
                <Button size="sm" variant="outline" onClick={() => openNewRequest({ type: "maintenance", reservationId: r.id })} data-testid="button-request-maintenance"><Wrench className="mr-1 h-4 w-4" />{t("requests.form.reportMaintenance")}</Button>
                <Button size="sm" variant="outline" onClick={() => openNewRequest({ type: "mileage", reservationId: r.id })} data-testid="button-request-mileage"><Gauge className="mr-1 h-4 w-4" />{t("requests.form.reportMileage")}</Button>
                <Button size="sm" variant="outline" onClick={() => openNewRequest({ type: "damage", reservationId: r.id })} data-testid="button-request-damage">{t("requests.type.damage")}</Button>
              </>)}
              {canRequest && r.status === "booked" && (<>
                <Button size="sm" variant="outline" onClick={() => openNewRequest({ type: "extension", reservationId: r.id })} data-testid="button-request-extension">{t("requests.form.extend")}</Button>
                {me?.settings.canReturn && <Button size="sm" variant="outline" onClick={() => openNewRequest({ type: "early_return", reservationId: r.id })} data-testid="button-request-early-return">{t("requests.form.earlyReturn")}</Button>}
                {/* Cancel (Kees, 2026-10-18): a request staff approve, until 48 hours before the start. */}
                {r.cancellation?.openRequestId
                  ? <span className="self-center text-xs text-[#64748b]" data-testid="cancel-pending">{t("requests.cancel.pending", { id: r.cancellation.openRequestId })}</span>
                  : r.cancellation?.allowed
                    ? <Button size="sm" variant="outline" className="text-[#a32d2d]" onClick={() => openNewRequest({ type: "cancellation", reservationId: r.id })} title={r.cancellation.deadline ? t("requests.cancel.until", { date: formatPortalDateTimeMedium(r.cancellation.deadline) }) : undefined} data-testid="button-request-cancellation"><XCircle className="mr-1 h-4 w-4" />{t("requests.cancel.button")}</Button>
                    : r.cancellation?.reason === "too_late" && <span className="self-center text-xs text-[#64748b]" data-testid="cancel-too-late">{t("requests.cancel.tooLate")}</span>}
              </>)}
            </div>
            {me?.settings.canViewFines && linkedFines.length > 0 && (
              <div>
                <h3 className="mb-1 text-sm font-semibold">{t("reservations.fines", { count: linkedFines.length })}</h3>
                <div className="space-y-2" data-testid="reservation-fines">{linkedFines.map((f) => <FineRow key={f.id} fine={f} />)}</div>
              </div>
            )}
            {/* Kees, 2026-10-18: a car shared by several drivers. */}
            {(r.status === "booked" || r.status === "picked_up") && <ExtraDrivers reservation={r} canEdit={canChangeDriver} />}
            {/* Kees, 2026-10-18: the customer adds a PDF or photo to the reservation themself. */}
            <ReservationUploads reservationId={r.id} canUpload={r.status !== "cancelled"} />
            {r.driverHistory.length > 0 && <div>
              <h3 className="mb-1 text-sm font-semibold">{t("reservations.driverHistory")}</h3>
              <ul className="space-y-1 rounded-md border p-3 text-sm">
                {r.driverHistory.map((h) => (
                  <li key={h.id} className="flex justify-between gap-2">
                    <span>{h.driverName ?? "—"}{h.note ? <span className="text-muted-foreground"> · {h.note}</span> : null}</span>
                    <span className="text-muted-foreground">
                      {formatPortalDate(h.assignedFrom)} – {h.assignedUntil ? formatPortalDate(h.assignedUntil) : t("reservations.current")}
                    </span>
                  </li>
                ))}
              </ul>
            </div>}
           </div>
           </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
