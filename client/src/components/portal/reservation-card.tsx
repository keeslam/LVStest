import { useTranslation } from "react-i18next";
import { CalendarDays, ChevronRight, AlertCircle, Car } from "lucide-react";
import type { PortalReservationDto } from "@shared/portal-types";
import { usePortalDialogs } from "@/hooks/use-portal-dialogs";
import { Avatar, ListCard, Plate, StatusBadge, daysUntil, toneFor } from "@/components/portal/ui";

export function formatPortalDate(value: string | null | undefined): string {
  if (!value) return "";
  const [y, m, d] = value.split("-");
  return y && m && d ? `${d}-${m}-${y}` : value;
}

/** One reservation in a list: vehicle, plate, period, driver, and a hint about what is coming up. */
export function ReservationCard({ reservation, showPrice }: { reservation: PortalReservationDto; showPrice: boolean }) {
  const { t } = useTranslation("portal");
  const { openReservation } = usePortalDialogs();
  const r = reservation;
  const endIn = daysUntil(r.endDate);
  const startIn = daysUntil(r.startDate);
  const overdue = r.status === "picked_up" && endIn !== null && endIn < 0;
  const hint = r.status === "booked" && startIn !== null && startIn >= 0
    ? t(startIn === 0 ? "overview.pickupToday" : "overview.pickupIn", { count: startIn })
    : r.status === "picked_up" && endIn !== null && endIn >= 0 && endIn <= 7
      ? t(endIn === 0 ? "overview.returnToday" : "overview.returnIn", { count: endIn })
      : null;

  return (
    <ListCard tone={overdue ? "red" : toneFor("reservation", r.status)} onClick={() => openReservation(r.id)} testId={`portal-reservation-${r.id}`}>
      <div className="flex min-w-0 items-center gap-3">
        <span className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#eef0fb] text-[#1a1d62] sm:flex"><Car className="h-5 w-5" /></span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="truncate font-semibold text-[#0f172a]">
              {r.vehicle ? `${r.vehicle.brand} ${r.vehicle.model}` : t("reservations.spareFor", { id: r.replacementForReservationId })}
            </span>
            {r.vehicle && <Plate value={r.vehicle.licensePlate} />}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#64748b] sm:text-sm">
            <span className="inline-flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" />{formatPortalDate(r.startDate)} – {r.endDate ? formatPortalDate(r.endDate) : t("overview.openEnded")}</span>
            {r.driver && <span className="inline-flex items-center gap-1.5"><Avatar name={r.driver.displayName} />{r.driver.displayName}</span>}
            {showPrice && r.totalPrice && <span>€ {r.totalPrice}</span>}
          </div>
          {(overdue || hint) && (
            <div className={`mt-1 inline-flex items-center gap-1 text-xs font-medium ${overdue ? "text-[#a32d2d]" : "text-[#185fa5]"}`}>
              {overdue ? <><AlertCircle className="h-3.5 w-3.5" />{t("overview.overdue")}</> : hint}
            </div>
          )}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <StatusBadge kind="reservation" status={r.status} label={t(`reservations.status.${r.status}`, { defaultValue: r.status })} />
        <ChevronRight className="h-4 w-4 text-[#94a3b8]" />
      </div>
    </ListCard>
  );
}
