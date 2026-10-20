/**
 * Punt 16 / OPT-009 (Kees, 2026-10-20) — "Voorstel": the three free cars that
 * fit best as a replacement, with the reason and a one-click "Kiezen". The
 * order is shared/spare-suggestion.ts (same type, then same make and model);
 * an APK running out in the period is shown in red, not hidden.
 */
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatLicensePlate } from "@/lib/format-utils";
import { formatDutchDate } from "@shared/booking-warnings";
import { rankSpareCandidates, type SpareVehicleLike } from "@shared/spare-suggestion";

type OriginalVehicle = Omit<SpareVehicleLike, "id" | "licensePlate"> & { id?: number };

interface Props<T extends SpareVehicleLike> {
  /**
   * The car being replaced. Reservation lists embed a slim vehicle (plate, make,
   * model; no type), so when the type is missing and the id is known, the full
   * vehicle is fetched here.
   */
  original: OriginalVehicle | null | undefined;
  candidates: T[];
  endDate: string | null | undefined;
  /** The car chosen right now in this row; marked instead of offered. */
  selectedId?: number | null;
  /** Cars already chosen in other rows of the same dialog; never suggested again. */
  takenIds?: number[];
  onPick: (vehicleId: number) => void;
  disabled?: boolean;
  testId?: string;
}

export function SpareSuggestions<T extends SpareVehicleLike>({ original, candidates, endDate, selectedId, takenIds = [], onPick, disabled, testId = "spare-suggestions" }: Props<T>) {
  const { t } = useTranslation("reservations");
  const needsFull = !!original?.id && !original?.vehicleType;
  const { data: fullOriginal } = useQuery<OriginalVehicle>({ queryKey: [`/api/vehicles/${original?.id}`], enabled: needsFull });
  original = needsFull && fullOriginal ? { ...original, ...fullOriginal } : original;
  const taken = new Set(takenIds.filter((id) => id !== selectedId));
  const top = rankSpareCandidates(original, candidates.filter((c) => !taken.has(c.id)), endDate).slice(0, 3);
  if (top.length === 0) return null;
  const originalKnown = !!(original?.vehicleType || original?.brand);

  return (
    <div className="rounded-md border border-blue-200 bg-blue-50/60 p-2 space-y-1.5" data-testid={testId}>
      <p className="text-xs font-semibold text-blue-800 flex items-center gap-1">
        <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
        {t("spareSuggestions.title")}
      </p>
      <ul className="space-y-1">
        {top.map((s) => {
          const chosen = s.vehicle.id === selectedId;
          const reason = !s.sameType
            ? t("spareSuggestions.otherType")
            : s.sameModel ? t("spareSuggestions.sameModel") : s.sameBrand ? t("spareSuggestions.sameBrand") : t("spareSuggestions.sameType");
          return (
            <li key={s.vehicle.id} className="flex items-center gap-2 text-sm" data-testid={`${testId}-${s.vehicle.id}`}>
              <div className="min-w-0 flex-1">
                <span className="font-medium">{formatLicensePlate(s.vehicle.licensePlate)}</span>
                <span className="text-gray-600"> {[s.vehicle.brand, s.vehicle.model].filter(Boolean).join(" ")}</span>
                <span className="ml-1 inline-flex flex-wrap gap-1 align-middle">
                  {/* Without a known original there is nothing to compare: no reason label. */}
                  {originalKnown && (
                    <Badge variant="outline" className={`px-1.5 py-0 text-[11px] font-medium ${s.sameType ? "border-green-300 text-green-700" : "border-amber-300 text-amber-700"}`}>
                      {reason}
                    </Badge>
                  )}
                  {s.apkWarning && (
                    <Badge className="bg-red-100 text-red-700 hover:bg-red-100 px-1.5 py-0 text-[11px] font-medium" data-testid={`${testId}-apk-${s.vehicle.id}`}>
                      {t("spareSuggestions.apkWarning", { date: formatDutchDate(s.vehicle.apkDate?.slice(0, 10)) })}
                    </Badge>
                  )}
                </span>
              </div>
              <Button
                type="button"
                size="sm"
                variant={chosen ? "secondary" : "outline"}
                className="h-7 shrink-0"
                disabled={disabled || chosen}
                onClick={() => onPick(s.vehicle.id)}
                data-testid={`${testId}-pick-${s.vehicle.id}`}
              >
                {chosen ? t("spareSuggestions.chosen") : t("spareSuggestions.pick")}
              </Button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
