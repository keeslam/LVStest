import { useTranslation } from "react-i18next";
import { CalendarDays, ChevronRight } from "lucide-react";
import type { PortalDriverDto, PortalReservationDto } from "@shared/portal-types";
import { usePortalDialogs } from "@/hooks/use-portal-dialogs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatPortalDate } from "./reservation-card";
import { Plate, StatusBadge, toneFor, toneClasses } from "./ui";

/** A driver's reservations that are not running right now: what is coming and what is done. */
export function driverHistory(reservations: PortalReservationDto[], driverId: number) {
  const mine = reservations.filter((r) => r.driver?.id === driverId && r.status !== "picked_up" && r.status !== "cancelled");
  return {
    upcoming: mine.filter((r) => r.status === "booked").sort((a, b) => a.startDate.localeCompare(b.startDate)),
    past: mine.filter((r) => r.status !== "booked").sort((a, b) => b.startDate.localeCompare(a.startDate)),
  };
}

export function DriverHistoryDialog({ driver, reservations, open, onOpenChange }: { driver: PortalDriverDto; reservations: PortalReservationDto[]; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { t } = useTranslation("portal");
  const { openReservation } = usePortalDialogs();
  const { upcoming, past } = driverHistory(reservations, driver.id);
  const row = (r: PortalReservationDto) => {
    const c = toneClasses(toneFor("reservation", r.status));
    return (
      <button key={r.id} type="button" onClick={() => { onOpenChange(false); openReservation(r.id); }}
        className={`flex w-full items-center justify-between gap-2 rounded-xl border border-[#e6e8f0] border-l-[5px] ${c.border} bg-white px-3 py-2.5 text-left text-sm hover:bg-[#f8f9ff]`} data-testid={`driver-history-${r.id}`}>
        <span className="flex min-w-0 items-center gap-2">
          {r.vehicle && <Plate value={r.vehicle.licensePlate} />}
          <span className="min-w-0">
            <span className="block truncate font-medium text-[#0f172a]">{r.vehicle ? `${r.vehicle.brand} ${r.vehicle.model}` : `#${r.id}`}</span>
            <span className="flex items-center gap-1 text-xs text-[#64748b]"><CalendarDays className="h-3 w-3" />{formatPortalDate(r.startDate)} – {r.endDate ? formatPortalDate(r.endDate) : t("overview.openEnded")}</span>
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <StatusBadge kind="reservation" status={r.status} label={t(`reservations.status.${r.status}`, { defaultValue: r.status })} />
          <ChevronRight className="h-4 w-4 text-[#94a3b8]" />
        </span>
      </button>
    );
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] max-w-lg flex-col" data-testid="driver-history-dialog">
        <DialogHeader><DialogTitle>{t("drivers.historyTitle", { name: driver.displayName })}</DialogTitle></DialogHeader>
        <div className="min-h-0 flex-1 space-y-4 overflow-auto">
          {upcoming.length > 0 && (
            <section className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-[#2a2f9c]">{t("drivers.upcomingSection")} <span className="ml-1 rounded-full bg-[#eef0fb] px-2 py-0.5 normal-case tracking-normal">{upcoming.length}</span></h3>
              {upcoming.map(row)}
            </section>
          )}
          {past.length > 0 && (
            <section className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-[#2a2f9c]">{t("drivers.pastSection")} <span className="ml-1 rounded-full bg-[#eef0fb] px-2 py-0.5 normal-case tracking-normal">{past.length}</span></h3>
              {past.map(row)}
            </section>
          )}
          {upcoming.length === 0 && past.length === 0 && <p className="py-6 text-center text-sm text-[#64748b]">{t("drivers.noHistory")}</p>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
