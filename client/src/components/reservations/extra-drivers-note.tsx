import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useState } from "react";
import { ChevronDown, ChevronRight, History, Users } from "lucide-react";
import type { DriverHistoryRow } from "@shared/portal-types";
import { formatDateTime } from "@/lib/format-utils";

/**
 * Other drivers the customer put on this car in the portal (Kees, 2026-10-18). Read-only here: the
 * contract and this screen keep the main driver; the customer's admin adds and removes extra drivers.
 */
export function ExtraDriversNote({ reservationId }: { reservationId: number | null | undefined }) {
  const { t } = useTranslation("reservations");
  const { data = [] } = useQuery<Array<{ id: number; displayName: string }>>({
    queryKey: [`/api/reservations/${reservationId}/extra-drivers`],
    enabled: Boolean(reservationId),
  });
  if (data.length === 0) return null;
  return (
    <div className="mt-2 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-sm text-amber-900" data-testid="extra-drivers-note">
      <Users className="mt-0.5 h-4 w-4 shrink-0" />
      <span><span className="font-medium">{t("extraDrivers.label")}:</span> {data.map((d) => d.displayName).join(", ")}<span className="block text-xs text-amber-800">{t("extraDrivers.hint")}</span></span>
    </div>
  );
}

/**
 * Who drove this reservation and when (Kees, 2026-10-19): every main and extra driver with the period
 * and who set it, the office or the customer in the portal. Read-only; folded until opened.
 */
export function DriverHistoryPanel({ reservationId }: { reservationId: number | null | undefined }) {
  const { t } = useTranslation("reservations");
  const [open, setOpen] = useState(false);
  const { data = [] } = useQuery<DriverHistoryRow[]>({
    queryKey: [`/api/reservations/${reservationId}/driver-history`],
    enabled: Boolean(reservationId),
  });
  if (data.length === 0) return null;
  const by = (r: DriverHistoryRow) => r.setBy.kind === "system" ? t("driverHistory.bySystem")
    : t(r.setBy.kind === "portal" ? "driverHistory.byPortal" : "driverHistory.byStaff", { name: r.setBy.name ?? "" });
  return (
    <div className="mt-2 rounded-md border text-sm" data-testid="driver-history-panel">
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center gap-2 px-2 py-1.5 text-left font-medium hover:bg-muted/50" data-testid="button-driver-history">
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}<History className="h-4 w-4" />{t("driverHistory.title", { count: data.length })}
      </button>
      {open && (
        <ul className="divide-y border-t">
          {data.map((r) => (
            <li key={r.id} className="flex flex-wrap items-baseline justify-between gap-x-3 px-2 py-1.5" data-testid={`driver-history-${r.id}`}>
              <span>
                <span className="font-medium">{r.driverName ?? t("driverHistory.noDriver")}</span>
                <span className={`ml-2 rounded px-1.5 py-0.5 text-[10px] font-medium ${r.isExtra ? "bg-amber-100 text-amber-900" : "bg-blue-100 text-blue-900"}`}>{r.isExtra ? t("driverHistory.extra") : t("driverHistory.main")}</span>
                <span className="block text-xs text-muted-foreground">{by(r)}{r.note ? ` · ${r.note}` : ""}</span>
              </span>
              <span className="whitespace-nowrap text-xs text-muted-foreground">{formatDateTime(r.from)} – {r.until ? formatDateTime(r.until) : t("driverHistory.now")}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
