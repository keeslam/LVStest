import { useTranslation } from "react-i18next";
import { CalendarDays, Gauge, ShieldAlert, Wrench, TriangleAlert, Phone } from "lucide-react";
import type { PortalMyVehicleDto, PortalVehicleMaintenanceDto } from "@shared/portal-types";
import { Button } from "@/components/ui/button";
import { usePortalAuth } from "@/hooks/use-portal-auth";
import { usePortalDialogs } from "@/hooks/use-portal-dialogs";
import { formatLicensePlate } from "@/lib/format-utils";
import { DriverChip, Plate, daysUntil } from "./ui";
import { formatPortalDate } from "./reservation-card";

/** "Onderhoud gepland op …" plus the change button or the 48-hour phone hint; shared by the card and the reservation dialog. */
export function MaintenanceLine({ maintenance: m, serviceDue, canRequest }: { maintenance: PortalVehicleMaintenanceDto | null; serviceDue: "due" | "soon" | null; canRequest: boolean }) {
  const { t } = useTranslation("portal");
  const { me } = usePortalAuth();
  const { openNewRequest, openRequest } = usePortalDialogs();
  if (!m && !serviceDue) return null;
  const tone = m?.status === "out" ? "border-[#c8ebdc] bg-[#e1f5ee] text-[#085041]" : m || serviceDue === "soon" ? "border-[#f4d7a8] bg-[#faeeda] text-[#633806]" : "border-[#f3c1c1] bg-[#fcebeb] text-[#791f1f]";
  const text = m
    ? m.status === "in" ? t("vehicles.maintenanceIn", { date: formatPortalDate(m.startDate) })
      : m.status === "out" ? t("vehicles.maintenanceOut", { date: formatPortalDate(m.endDate ?? m.startDate) })
      : t("vehicles.maintenanceScheduled", { date: formatPortalDate(m.startDate) })
    : t(serviceDue === "due" ? "vehicles.serviceDue" : "vehicles.serviceSoon");
  return (
    <div className={`rounded-xl border p-3 text-sm ${tone}`} data-testid="maintenance-line">
      <div className="flex items-start gap-2"><Wrench className="mt-0.5 h-4 w-4 shrink-0" /><span>{text}</span></div>
      {m?.replacement && <div className="mt-1 pl-6 text-xs">{t("vehicles.replacement", { car: `${formatLicensePlate(m.replacement.licensePlate)} ${m.replacement.brand} ${m.replacement.model}` })}</div>}
      {m && m.status === "scheduled" && canRequest && (
        <div className="mt-2 pl-6">
          {m.openChangeRequestId
            ? <button type="button" className="text-xs underline" onClick={() => openRequest(m.openChangeRequestId!)}>{t("vehicles.changePending", { id: m.openChangeRequestId })}</button>
            : m.canRequestChange
              ? <Button size="sm" variant="outline" onClick={() => openNewRequest({ type: "maintenance_change", blockId: m.blockId, blockDate: m.startDate })} data-testid="button-change-maintenance"><CalendarDays className="mr-1 h-4 w-4" />{t("vehicles.changeMaintenance")}</Button>
              : <span className="inline-flex items-center gap-1 text-xs"><Phone className="h-3.5 w-3.5" />{t("vehicles.changeTooLate", { phone: me?.info.phone ?? "" })}</span>}
        </div>
      )}
    </div>
  );
}

/** One vehicle the customer has on the road. */
export function VehicleCard({ item }: { item: PortalMyVehicleDto }) {
  const { t } = useTranslation("portal");
  const { me } = usePortalAuth();
  const { openReservation, openNewRequest, openRequest } = usePortalDialogs();
  const canRequest = Boolean(me?.settings.canSubmitRequests);
  const apkIn = daysUntil(item.vehicle.apkDate);
  const apkTone = apkIn === null ? "text-[#64748b]" : apkIn < 0 ? "text-[#a32d2d]" : apkIn <= 30 ? "text-[#8a5a0b]" : "text-[#085041]";
  const apkText = item.vehicle.apkDate
    ? apkIn !== null && apkIn < 0 ? t("vehicles.apkExpired", { date: formatPortalDate(item.vehicle.apkDate) })
      : apkIn !== null && apkIn <= 30 ? t("vehicles.apkSoon", { date: formatPortalDate(item.vehicle.apkDate) })
      : `${t("vehicles.apk")} ${formatPortalDate(item.vehicle.apkDate)}`
    : null;
  return (
    <article className="rounded-2xl border border-[#e6e8f0] bg-white p-4 shadow-sm" data-testid={`vehicle-card-${item.vehicle.id}`}>
      <button type="button" className="flex w-full items-start justify-between gap-3 text-left" onClick={() => openReservation(item.reservationId)}>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2"><Plate value={item.vehicle.licensePlate} /><span className="font-semibold text-[#1a1d62]">{item.vehicle.brand} {item.vehicle.model}</span></div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#64748b]">
            <span className="inline-flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" />{formatPortalDate(item.startDate)} – {item.endDate ? formatPortalDate(item.endDate) : t("overview.openEnded")}</span>
            <DriverChip name={item.driver?.displayName} />
          </div>
        </div>
      </button>
      <dl className="mt-3 grid gap-1 text-sm sm:grid-cols-2">
        {apkText && <div className={`inline-flex items-center gap-1.5 ${apkTone}`}><ShieldAlert className="h-4 w-4" />{apkText}</div>}
        <div className="inline-flex items-center gap-1.5 text-[#334155]"><Gauge className="h-4 w-4" />{item.lastReportedMileage ? t("vehicles.mileageAt", { value: item.lastReportedMileage.value.toLocaleString("nl-NL"), date: formatPortalDate(item.lastReportedMileage.at.slice(0, 10)) }) : t("vehicles.noMileage")}</div>
      </dl>
      <div className="mt-3"><MaintenanceLine maintenance={item.maintenance} serviceDue={item.serviceDue} canRequest={canRequest} /></div>
      {canRequest && (
        <div className="mt-3 flex flex-wrap gap-2">
          {item.openMaintenanceRequestId
            ? <Button size="sm" variant="outline" onClick={() => openRequest(item.openMaintenanceRequestId!)} data-testid="button-view-maintenance-request"><Wrench className="mr-1 h-4 w-4" />{t("vehicles.requestPending", { id: item.openMaintenanceRequestId })}</Button>
            : <Button size="sm" variant="outline" onClick={() => openNewRequest({ type: "maintenance", reservationId: item.reservationId })} data-testid="button-report-maintenance"><Wrench className="mr-1 h-4 w-4" />{t("requests.form.reportMaintenance")}</Button>}
          <Button size="sm" variant="outline" onClick={() => openNewRequest({ type: "damage", reservationId: item.reservationId })} data-testid="button-report-damage"><TriangleAlert className="mr-1 h-4 w-4" />{t("requests.type.damage")}</Button>
          <Button size="sm" variant="outline" onClick={() => openNewRequest({ type: "mileage", reservationId: item.reservationId })} data-testid="button-report-mileage"><Gauge className="mr-1 h-4 w-4" />{t("requests.form.reportMileage")}</Button>
        </div>
      )}
    </article>
  );
}
