import { useTranslation } from "react-i18next";
import { AlertCircle, CalendarClock, Info, MapPin, Truck, Clock } from "lucide-react";
import type { PortalMe, PortalReservationDto } from "@shared/portal-types";
import { Button } from "@/components/ui/button";
import { daysUntil } from "./ui";
import { formatPortalDate } from "./reservation-card";

interface Props {
  reservation: Pick<PortalReservationDto, "id" | "status" | "startDate" | "endDate" | "startTime" | "endTime" | "handover">;
  info: PortalMe["info"];
  /** May the account ask for an extension / an early return (feature switches and role). */
  canExtend: boolean;
  canReturnEarly: boolean;
  onExtend: () => void;
  onReturnEarly: () => void;
}

/**
 * "Ophalen" before a rental starts, "Inleveren" while it runs: when, where, how, and what to do about it. The place
 * depends on the reservation: at our shop (address and opening hours) or at a place agreed with the office (we bring
 * or collect the car there; the shop's opening hours do not apply). The return instructions go with every return.
 */
export function HandoverBlock({ reservation: r, info, canExtend, canReturnEarly, onExtend, onReturnEarly }: Props) {
  const { t } = useTranslation("portal");
  if (r.status !== "booked" && r.status !== "picked_up") return null;

  const isPickup = r.status === "booked";
  const date = isPickup ? r.startDate : r.endDate;
  const time = isPickup ? r.startTime : r.endTime;
  const away = isPickup ? r.handover.pickup.method === "delivery" : r.handover.return.method === "collection";
  const location = isPickup ? r.handover.pickup.location : r.handover.return.location;
  const left = daysUntil(date);
  const late = !isPickup && left !== null && left < 0;
  const countdown =
    left === null ? null
    : left === 0 ? t("handover.today")
    : left === 1 ? t("handover.tomorrow")
    : left > 1 ? t(isPickup ? "handover.pickupIn" : "handover.returnIn", { count: left })
    : t("handover.daysLate", { count: -left });

  const tone = late ? "border-[#f3c1c1] bg-[#fcebeb] text-[#791f1f]" : "border-[#dfe2ff] bg-[#eef0fb] text-[#1a1d62]";
  const shopLine = (
    <>
      <div className="flex items-start gap-2"><MapPin className="mt-0.5 h-4 w-4 shrink-0" /><span>{info.pickupAddress}</span></div>
      <div className="flex items-start gap-2"><Clock className="mt-0.5 h-4 w-4 shrink-0" /><span>{info.openingHours}</span></div>
    </>
  );

  return (
    <div className={`space-y-2 rounded-xl border p-3 text-sm ${tone}`} data-testid="handover-block" data-state={late ? "late" : isPickup ? "pickup" : "return"}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 font-semibold">
          {away ? <Truck className="h-4 w-4" /> : <CalendarClock className="h-4 w-4" />}
          {t(isPickup ? "handover.pickupTitle" : "handover.returnTitle")}
        </div>
        {countdown && <span className="rounded-full bg-white/70 px-2 py-0.5 text-xs font-semibold" data-testid="handover-countdown">{countdown}</span>}
      </div>

      <div className="font-medium" data-testid="handover-when">
        {date
          ? `${formatPortalDate(date)}${time ? ` · ${t("handover.at", { time })}` : ` · ${t("handover.timeByArrangement")}`}`
          : t("handover.noEndDate")}
      </div>

      {late && (
        <div className="flex items-start gap-2 font-medium" data-testid="handover-late">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>{t("handover.lateText")}</span>
        </div>
      )}

      {away ? (
        <div className="flex items-start gap-2" data-testid="handover-away">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{t(isPickup ? "handover.weBring" : "handover.weCollect")} <strong>{location ?? t("handover.locationToBeAgreed")}</strong></span>
        </div>
      ) : (
        <div data-testid="handover-shop">
          <p className="mb-0.5">{t(isPickup ? "handover.atOurShopPickup" : "handover.atOurShopReturn")}</p>
          {shopLine}
        </div>
      )}

      {isPickup && info.pickupInstructions && <p className="flex items-start gap-2 text-xs"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />{info.pickupInstructions}</p>}
      {!isPickup && info.returnInstructions && <p className="flex items-start gap-2 text-xs" data-testid="handover-return-instructions"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />{info.returnInstructions}</p>}
      {!away && info.deliveryNote && <p className="text-xs opacity-80" data-testid="handover-delivery-note">{info.deliveryNote}</p>}

      {!isPickup && (canExtend || canReturnEarly) && (
        <div className="flex flex-wrap gap-2 pt-1">
          {canExtend && <Button size="sm" variant={late ? "default" : "outline"} className={late ? "" : "bg-white"} onClick={onExtend} data-testid="button-handover-extend">{t("requests.form.extend")}</Button>}
          {canReturnEarly && !late && <Button size="sm" variant="outline" className="bg-white" onClick={onReturnEarly} data-testid="button-handover-early-return">{t("requests.form.earlyReturn")}</Button>}
        </div>
      )}
    </div>
  );
}
