/**
 * Sub-project C, Task 5 (besluiten B-33, B-39; spec
 * docs/superpowers/specs/2026-10-09-terugdraaien-prullenbak-design.md §3) -
 * what every cancel and delete confirmation shares for a rental that has been
 * picked up:
 *
 *  - `PickedUpWarning`: the warning box with the pickup date and the contract
 *    number and the tick (`checkbox-confirm-picked-up`) that unlocks the confirm
 *    button of the dialog it sits in;
 *  - `cancelRightFor`: the permissions the opener needs - for a picked-up row
 *    BOTH `manage_reservations` and the new right `cancel_picked_up_rental`,
 *    `manage_reservations` for every other row, exactly the guards of the routes
 *    behind them;
 *  - `pickedUpRefusalOf` / `isPickedUpRightRefusal`: how a screen that did not
 *    know the row had been picked up (the list was stale) learns it from the
 *    server. The client branches on the stable `code`, never on the English
 *    `message`.
 */
import { useTranslation } from "react-i18next";
import { AlertTriangle } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { UserPermission } from "@shared/schema";
import { PICKED_UP_CODES, isPickedUpRental } from "@shared/picked-up-cancellation";
import { formatDutchDate } from "@shared/booking-warnings";

/** What the warning needs to say which rental it is about. */
export interface PickedUpFacts {
  actualPickupDate: string | null | undefined;
  contractNumber: string | null | undefined;
}

interface PickedUpWarningProps extends PickedUpFacts {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}

/**
 * "Deze huur is al opgehaald op <datum> met contract <nr>." plus the tick the
 * employee has to give. The surrounding dialog keeps its confirm button disabled
 * until `checked`; this component only shows the question.
 */
export function PickedUpWarning({ actualPickupDate, contractNumber, checked, onCheckedChange }: PickedUpWarningProps) {
  const { t } = useTranslation("reservations");
  return (
    <div
      className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
      data-testid="warning-picked-up"
    >
      <div className="flex items-start gap-2">
        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
        <div className="space-y-2">
          <p className="font-medium">
            {t("pickedUpWarning.text", {
              date: formatDutchDate(actualPickupDate) || "—",
              contract: contractNumber || "—",
            })}
          </p>
          <p>{t("pickedUpWarning.vehicleNote")}</p>
          <div className="flex items-center gap-2">
            <Checkbox
              id="confirm-picked-up"
              data-testid="checkbox-confirm-picked-up"
              checked={checked}
              onCheckedChange={(next) => onCheckedChange(next === true)}
            />
            <Label htmlFor="confirm-picked-up" className="font-normal">
              {t("pickedUpWarning.confirmLabel")}
            </Label>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * The permissions for an opener that cancels or deletes this row: when the rental
 * has been picked up the new right ON TOP OF `manage_reservations` (the routes
 * check both), `manage_reservations` alone for every other row. Feed it to
 * `RequiresPermission allOf={...}`: an account holding only the new right then
 * sees the greyed opener with the reason, not a generic English 403 after a click.
 */
export function cancelRightFor(reservation: { status?: unknown; type?: unknown } | null | undefined): string[] {
  return isPickedUpRental(reservation)
    ? [UserPermission.MANAGE_RESERVATIONS, UserPermission.CANCEL_PICKED_UP_RENTAL]
    : [UserPermission.MANAGE_RESERVATIONS];
}

function codeOf(error: unknown): string | undefined {
  return error && typeof error === "object" ? (error as { code?: string }).code : undefined;
}

/**
 * A 409 `PICKED_UP_CONFIRMATION_REQUIRED` as the facts to show, or `null` for
 * anything else. `apiRequest` merges the body of a refused call onto the Error it
 * throws, so `code`, `actualPickupDate` and `contractNumber` are fields of it.
 */
export function pickedUpRefusalOf(error: unknown): { actualPickupDate: string | null; contractNumber: string | null } | null {
  if (codeOf(error) !== PICKED_UP_CODES.CONFIRMATION_REQUIRED) return null;
  const body = error as { actualPickupDate?: string | null; contractNumber?: string | null };
  return { actualPickupDate: body.actualPickupDate ?? null, contractNumber: body.contractNumber ?? null };
}

/** A 403 `PICKED_UP_RIGHT_REQUIRED`: the account lacks `cancel_picked_up_rental`. */
export function isPickedUpRightRefusal(error: unknown): boolean {
  return codeOf(error) === PICKED_UP_CODES.RIGHT_REQUIRED;
}
