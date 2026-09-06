import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, Search } from "lucide-react";
import type { PortalReservationDto } from "@shared/portal-types";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { formatPortalDate as formatDate } from "./reservation-card";
import { DriverChip, Plate } from "./ui";

/** Rows shown before the customer has to type. */
const MAX_SHOWN = 6;

/**
 * Picks one of the customer's own reservations for a damage, maintenance,
 * extension or mileage request. Search matches the plate (with or without
 * dashes), the brand/model, the driver and the reservation number; the list
 * is right under the box so it works inside a dialog and on a phone.
 */
export function ReservationPicker({ reservations, value, onChange, testId = "reservation-picker" }: {
  reservations: PortalReservationDto[]; value: number | null; onChange: (id: number | null) => void; testId?: string;
}) {
  const { t } = useTranslation("portal");
  const [query, setQuery] = useState("");
  const flat = (v: string) => v.replace(/[-\s]/g, "").toLowerCase();
  const q = query.trim().toLowerCase(), qFlat = flat(q);
  const matches = useMemo(() => {
    if (!q) return reservations;
    return reservations.filter((r) => {
      const text = [r.id, r.vehicle?.licensePlate, r.vehicle?.brand, r.vehicle?.model, r.driver?.displayName].filter(Boolean).join(" ").toLowerCase();
      return text.includes(q) || flat(text).includes(qFlat);
    });
  }, [reservations, q, qFlat]);
  const selected = value !== null ? reservations.find((r) => r.id === value) : undefined;
  const shown = matches.slice(0, MAX_SHOWN);
  const period = (r: PortalReservationDto) => `${formatDate(r.startDate)} – ${r.endDate ? formatDate(r.endDate) : t("overview.openEnded")}`;

  if (selected) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-md border bg-[#f8fafc] px-3 py-2 text-sm" data-testid={`${testId}-selected`}>
        <span className="flex min-w-0 items-center gap-2">
          <Check className="h-4 w-4 shrink-0 text-[#1d9e75]" />
          {selected.vehicle ? <Plate value={selected.vehicle.licensePlate} /> : <span>#{selected.id}</span>}
          <span className="truncate">{selected.vehicle ? `${selected.vehicle.brand} ${selected.vehicle.model}` : ""} <span className="text-xs text-[#64748b]">{period(selected)}</span></span>
        </span>
        <Button type="button" size="sm" variant="ghost" onClick={() => { onChange(null); setQuery(""); }} data-testid={`${testId}-change`}>{t("actions.change")}</Button>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {reservations.length > 1 && (
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94a3b8]" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("requests.form.searchReservation")} className="bg-white pl-9" autoFocus data-testid={`${testId}-search`} />
        </div>
      )}
      <ul className="max-h-64 divide-y overflow-y-auto rounded-md border bg-white" role="listbox" data-testid={`${testId}-list`}>
        {shown.length === 0 && <li className="px-3 py-3 text-sm text-[#64748b]">{reservations.length === 0 ? t("requests.form.noReservations") : t("requests.form.noReservationMatch")}</li>}
        {shown.map((r) => (
          <li key={r.id}>
            <button type="button" role="option" aria-selected={false} onClick={() => onChange(r.id)} className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-[#f1f5f9] focus:bg-[#f1f5f9] focus:outline-none" data-testid={`${testId}-option-${r.id}`}>
              {r.vehicle ? <Plate value={r.vehicle.licensePlate} /> : <span className="font-mono text-xs">#{r.id}</span>}
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-[#1a1d62]">{r.vehicle ? `${r.vehicle.brand} ${r.vehicle.model}` : `#${r.id}`}</span>
                <span className="block truncate text-xs text-[#64748b]">{period(r)}{r.driver ? <> · <DriverChip name={r.driver.displayName} /></> : null}</span>
              </span>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${r.status === "picked_up" ? "bg-[#e1f5ee] text-[#085041]" : "bg-[#e6f1fb] text-[#0c447c]"}`}>{t(`reservations.status.${r.status}`)}</span>
            </button>
          </li>
        ))}
      </ul>
      {matches.length > shown.length && <p className="text-xs text-[#64748b]">{t("requests.form.moreReservations", { shown: shown.length, total: matches.length })}</p>}
    </div>
  );
}
