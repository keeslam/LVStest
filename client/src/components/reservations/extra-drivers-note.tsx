import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Users } from "lucide-react";

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
