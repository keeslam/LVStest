import { useTranslation } from "react-i18next";
import { AlertCircle, Check, Info, MapPin, Store, Truck } from "lucide-react";
import type { PortalMe, PortalReservationDto } from "@shared/portal-types";
import { Button } from "@/components/ui/button";
import { daysUntil } from "./ui";
import { formatPortalDate } from "./reservation-card";

interface Props {
  reservation: Pick<PortalReservationDto, "id" | "status" | "startDate" | "endDate" | "startTime" | "endTime" | "actualPickupDate" | "actualReturnDate" | "handover">;
  info: PortalMe["info"];
  /** May the account ask for an extension / an early return (feature switches and role). */
  canExtend: boolean;
  canReturnEarly: boolean;
  onExtend: () => void;
  onReturnEarly: () => void;
}

type Kind = "pickup" | "return";

/**
 * How the rental starts and ends, as two steps on a line: pickup (collected at our shop, or brought to a place agreed with
 * the office) and return (brought back to our shop, or collected from the customer). The shop's address and
 * opening hours only appear for a step that happens at the shop; for the other steps the place where the car was
 * brought or collected is named instead, in the future tense before it happens and in the past tense after.
 * The step that is up next carries the countdown, the instructions and the buttons.
 */
export function HandoverBlock({ reservation: r, info, canExtend, canReturnEarly, onExtend, onReturnEarly }: Props) {
  const { t } = useTranslation("portal");
  if (!["booked", "picked_up", "returned", "completed"].includes(r.status)) return null;

  const pickupDone = r.status !== "booked";
  const returnDone = r.status === "returned" || r.status === "completed";
  const active: Kind | null = r.status === "booked" ? "pickup" : r.status === "picked_up" ? "return" : null;
  const lateBy = active === "return" ? daysUntil(r.endDate) : null;
  const late = lateBy !== null && lateBy < 0;

  const steps: Array<{ kind: Kind; done: boolean }> = [{ kind: "pickup", done: pickupDone }, { kind: "return", done: returnDone }];
  const anyShopStepToCome = steps.some((s) => !s.done && (s.kind === "pickup" ? r.handover.pickup.method === "shop" : r.handover.return.method === "shop"));

  const countdownFor = (date: string | null, kind: Kind): string | null => {
    const left = daysUntil(date);
    if (left === null) return null;
    if (left === 0) return t("handover.today");
    if (left === 1) return t("handover.tomorrow");
    if (left > 1) return t(kind === "pickup" ? "handover.pickupIn" : "handover.returnIn", { count: left });
    return kind === "return" ? t("handover.daysLate", { count: -left }) : null;
  };

  return (
    <div className={`rounded-xl border p-3 text-sm ${late ? "border-[#f3c1c1] bg-[#fcebeb] text-[#791f1f]" : "border-[#dfe2ff] bg-[#f6f7ff] text-[#1a1d62]"}`}
      data-testid="handover-block" data-state={late ? "late" : active ?? "done"}>
      <ol className="space-y-0">
        {steps.map(({ kind, done }, index) => {
          const isPickup = kind === "pickup";
          const away = isPickup ? r.handover.pickup.method === "delivery" : r.handover.return.method === "collection";
          const location = isPickup ? r.handover.pickup.location : r.handover.return.location;
          const isActive = active === kind;
          const plannedDate = isPickup ? r.startDate : r.endDate;
          const time = isPickup ? r.startTime : r.endTime;
          const doneDate = isPickup ? r.actualPickupDate ?? r.startDate : r.actualReturnDate ?? r.endDate;
          const countdown = isActive ? countdownFor(plannedDate, kind) : null;
          const label = t(`handover.${kind}.${away ? "away" : "shop"}${done ? "Done" : "Todo"}`);
          const last = index === steps.length - 1;
          return (
            <li key={kind} className="relative flex gap-3 pb-3 last:pb-0" data-testid={`handover-step-${kind}`} data-done={done} data-active={isActive}>
              {!last && <span className={`absolute left-[0.95rem] top-8 h-[calc(100%-1.75rem)] w-px ${done ? "bg-[#9fd9bd]" : "bg-[#c7cbf5]"}`} aria-hidden="true" />}
              <span className={`relative z-10 mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${done ? "bg-[#e1f5ee] text-[#085041]" : isActive ? (late ? "bg-[#791f1f] text-white" : "bg-[#1a1d62] text-white") : "bg-white text-[#64748b] ring-1 ring-[#c7cbf5]"}`}>
                {done ? <Check className="h-4 w-4" /> : away ? <Truck className="h-4 w-4" /> : <Store className="h-4 w-4" />}
              </span>
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                  <span className={`text-xs font-semibold uppercase tracking-wide ${done ? "text-[#64748b]" : ""}`}>{t(isPickup ? "handover.pickupTitle" : "handover.returnTitle")}</span>
                  {countdown && <span className="rounded-full bg-white/80 px-2 py-0.5 text-xs font-semibold" data-testid="handover-countdown">{countdown}</span>}
                </div>
                <div className={done ? "text-[#334155]" : "font-medium"} data-testid={`handover-what-${kind}`}>
                  {label}
                  {/* The place: the shop only when it happens at the shop, otherwise where it was or will be brought or collected. */}
                  {away
                    ? <> <strong>{location ?? t("handover.locationToBeAgreed")}</strong></>
                    : null}
                </div>
                <div className={`text-xs ${done ? "text-[#64748b]" : ""}`} data-testid={`handover-when-${kind}`}>
                  {done
                    ? t("handover.on", { date: formatPortalDate(doneDate) })
                    : plannedDate
                      ? `${formatPortalDate(plannedDate)}${time ? ` · ${t("handover.at", { time })}` : ` · ${t("handover.timeByArrangement")}`}`
                      : t("handover.noEndDate")}
                </div>

                {!away && (
                  <div className="space-y-0.5 text-xs" data-testid={`handover-shop-${kind}`}>
                    <div className="flex items-start gap-1.5"><MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span>{info.pickupAddress}</span></div>
                    {!done && <div className="pl-5 opacity-80">{info.openingHours}</div>}
                  </div>
                )}

                {late && isActive && (
                  <div className="flex items-start gap-2 font-medium" data-testid="handover-late">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>{t("handover.lateText")}</span>
                  </div>
                )}
                {!done && isPickup && info.pickupInstructions && <p className="flex items-start gap-1.5 text-xs"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />{info.pickupInstructions}</p>}
                {!done && !isPickup && info.returnInstructions && <p className="flex items-start gap-1.5 text-xs" data-testid="handover-return-instructions"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />{info.returnInstructions}</p>}

                {isActive && !isPickup && (canExtend || canReturnEarly) && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {canExtend && <Button size="sm" variant={late ? "default" : "outline"} className={late ? "" : "bg-white"} onClick={onExtend} data-testid="button-handover-extend">{t("requests.form.extend")}</Button>}
                    {canReturnEarly && !late && <Button size="sm" variant="outline" className="bg-white" onClick={onReturnEarly} data-testid="button-handover-early-return">{t("requests.form.earlyReturn")}</Button>}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      {anyShopStepToCome && info.deliveryNote && <p className="mt-2 border-t border-[#dfe2ff] pt-2 text-xs opacity-80" data-testid="handover-delivery-note">{info.deliveryNote}</p>}
    </div>
  );
}
