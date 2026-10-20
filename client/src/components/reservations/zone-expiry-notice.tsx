/**
 * Round 2 punt 9 (Kees, 2026-10-20) — the low-emission-zone or Move IZI end date of
 * the chosen car, when it lies before or inside the rental. A warning only: saving
 * and handing over stay allowed (like the B-09 maintenance banner).
 */
import { useTranslation } from "react-i18next";
import { AlertTriangle } from "lucide-react";
import { formatDutchDate } from "@shared/booking-warnings";
import { zoneRentalWarnings, type ZoneVehicleLike } from "@shared/zone-expiry";

export function ZoneExpiryNotice({
  vehicle,
  startDate,
  endDate,
  testId = "warning-zone-expiry",
}: {
  vehicle: ZoneVehicleLike | null | undefined;
  startDate: string | null | undefined;
  endDate: string | null | undefined;
  testId?: string;
}) {
  const { t } = useTranslation("reservations");
  const warnings = zoneRentalWarnings(vehicle, startDate, endDate);
  if (warnings.length === 0) return null;
  return (
    <div
      className="mt-2 p-3 bg-amber-50 border border-amber-400 rounded-md text-amber-900 text-sm space-y-1"
      data-testid={testId}
      role="status"
    >
      {warnings.map((w) => (
        <div key={w.kind} className="flex items-start gap-2" data-testid={`${testId}-${w.kind}`}>
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
          <span>
            {t(`form.zoneWarning.${w.state}`, {
              what: t(`form.zoneWarning.${w.kind}`),
              date: formatDutchDate(w.date),
            })}
          </span>
        </div>
      ))}
    </div>
  );
}
