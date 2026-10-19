/**
 * Punt 1 (Kees, 2026-10-19) — the "Extra kosten" block of the return dialog.
 *
 *  - Kilometres: driven above (days × free km per day) times the price per
 *    km, from the vehicle or its type default (shared/km-allowance.ts). The
 *    amount is a proposal: the employee can change it; once changed, it is no
 *    longer recalculated when the readings change.
 *  - Fuel: an amount the employee types; pickup and return level are shown.
 *  - A late return is not charged.
 * The amounts are stored apart from the rental price (totalPrice stays).
 */
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Receipt } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatFuelLevel } from "@/lib/format-utils";
import {
  KM_ALLOWANCE_KEY,
  extraKmSettlement,
  kmAllowanceFromSetting,
  kmRateForVehicle,
  type ExtraKmSettlement,
} from "@shared/km-allowance";

export interface ReturnExtraCostsValue {
  fuelCost: string;
  extraKmCost: string;
  /** True once the employee typed in the km amount; the proposal then stops following the readings. */
  extraKmCostEdited: boolean;
  /** The settlement the proposal came from, or null when there is none. */
  settlement: ExtraKmSettlement | null;
}

export const EMPTY_RETURN_EXTRA_COSTS: ReturnExtraCostsValue = { fuelCost: "", extraKmCost: "", extraKmCostEdited: false, settlement: null };

const euros = (n: number) => n.toFixed(2).replace(".", ",");

interface Props {
  reservation: {
    actualPickupDate?: string | null;
    startDate?: string | null;
    pickupMileage?: number | null;
    fuelLevelPickup?: string | null;
    vehicle?: { vehicleType?: string | null; freeKmPerDay?: number | null; extraKmPrice?: string | number | null } | null;
  };
  returnMileage: string;
  returnDate: string;
  fuelLevelReturn: string;
  value: ReturnExtraCostsValue;
  onChange: (value: ReturnExtraCostsValue) => void;
}

export function ReturnExtraCosts({ reservation, returnMileage, returnDate, fuelLevelReturn, value, onChange }: Props) {
  const { t } = useTranslation(["reservations", "common"]);
  const { data: setting } = useQuery<{ value?: unknown } | null>({ queryKey: [`/api/app-settings/key/${KM_ALLOWANCE_KEY}`] });

  const rate = kmRateForVehicle(reservation.vehicle, kmAllowanceFromSetting(setting?.value));
  const mileage = returnMileage.trim() === "" ? null : Number(returnMileage);
  const settlement = extraKmSettlement({
    pickupDate: reservation.actualPickupDate || reservation.startDate,
    returnDate,
    pickupMileage: reservation.pickupMileage,
    returnMileage: mileage != null && Number.isFinite(mileage) ? mileage : null,
    rate,
  });

  // Keep the proposal in step with the readings until the employee changes the amount.
  const proposal = settlement && settlement.cost > 0 ? euros(settlement.cost) : "";
  const settlementKey = settlement ? `${settlement.extraKm}|${settlement.cost}` : "none";
  useEffect(() => {
    const sameSettlement = (value.settlement ? `${value.settlement.extraKm}|${value.settlement.cost}` : "none") === settlementKey;
    if (value.extraKmCostEdited) {
      if (!sameSettlement) onChange({ ...value, settlement });
      return;
    }
    if (!sameSettlement || value.extraKmCost !== proposal) onChange({ ...value, settlement, extraKmCost: proposal });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settlementKey, proposal, value.extraKmCostEdited]);

  return (
    <div className="border rounded-lg p-4 bg-amber-50/60 space-y-4" data-testid="return-extra-costs">
      <h3 className="font-semibold text-base flex items-center gap-2">
        <Receipt className="h-4 w-4" />
        {t("pickupReturn.return.extraCosts.title")}
      </h3>

      <div className="space-y-2">
        <Label htmlFor="extraKmCost">{t("pickupReturn.return.extraCosts.kmLabel")}</Label>
        <Input
          id="extraKmCost"
          inputMode="decimal"
          className="bg-white max-w-[12rem]"
          placeholder="0,00"
          value={value.extraKmCost}
          onChange={(e) => onChange({ ...value, extraKmCost: e.target.value, extraKmCostEdited: true })}
          data-testid="input-extra-km-cost"
        />
        <p className="text-xs text-muted-foreground" data-testid="text-extra-km-explanation">
          {settlement
            ? t("pickupReturn.return.extraCosts.kmExplanation", {
                driven: settlement.driven,
                days: settlement.days,
                free: settlement.freeKm,
                extra: settlement.extraKm,
                price: euros(rate.pricePerKm ?? 0),
              })
            : rate.freeKmPerDay == null || rate.pricePerKm == null
              ? t("pickupReturn.return.extraCosts.kmNoRate")
              : t("pickupReturn.return.extraCosts.kmNoReading")}
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="fuelCost">{t("pickupReturn.return.extraCosts.fuelLabel")}</Label>
        <Input
          id="fuelCost"
          inputMode="decimal"
          className="bg-white max-w-[12rem]"
          placeholder="0,00"
          value={value.fuelCost}
          onChange={(e) => onChange({ ...value, fuelCost: e.target.value })}
          data-testid="input-fuel-cost"
        />
        <p className="text-xs text-muted-foreground">
          {t("pickupReturn.return.extraCosts.fuelLevels", {
            pickup: reservation.fuelLevelPickup ? formatFuelLevel(reservation.fuelLevelPickup) : "—",
            return: fuelLevelReturn ? formatFuelLevel(fuelLevelReturn) : "—",
          })}
        </p>
      </div>
    </div>
  );
}
