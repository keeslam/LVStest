/**
 * besluiten.md **B-03** — "blokkeren, alleen een beheerder kan forceren".
 *
 * `decideHandover()` has refused a handover of a vehicle in the workshop since
 * FIX-H, with a message that ends "…or have an administrator force the handover
 * with a reason." PHASE 57 went looking for that control and there was none:
 * no force button, no reason field, in any handover screen. The refusal
 * promised a way out that did not exist, and the only real option was to clear
 * the workshop flag by hand — which is precisely what B-03 set out to stop.
 *
 * This is that control. A non-administrator sees the refusal and nothing else.
 * An administrator gets a reason field; the reason is required (the server
 * refuses `WORKSHOP_OVERRIDE_REASON_REQUIRED` without one) and is written into
 * the reservation note by `decideHandover()`.
 *
 * The refusal is shown in Dutch, keyed off the `reason` code the server sends
 * (`IN_WORKSHOP`, `NEEDS_FIXING`, `NOT_FOR_RENTAL`); the server's own English
 * sentence is only the fallback for a code we do not know.
 */
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";
import { UserRole } from "@shared/schema";

export interface WorkshopRefusal {
  /** `VEHICLE_IN_WORKSHOP`'s `reason`: IN_WORKSHOP | NEEDS_FIXING | NOT_FOR_RENTAL. */
  reason?: string | null;
  /** What the server said, used when `reason` is a code we do not know. */
  message?: string | null;
}

interface WorkshopBlockedDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  refusal: WorkshopRefusal | null;
  /** Sends the very same handover again, forced, with this reason. */
  onForce: (reason: string) => void;
  isForcing?: boolean;
  /** What the server said about a *failed* force attempt, if anything. */
  overrideError?: string | null;
}

/** B-03 records *why*; a blank or one-letter "reason" is not one. */
const MIN_REASON_LENGTH = 3;

export function WorkshopBlockedDialog({
  open,
  onOpenChange,
  refusal,
  onForce,
  isForcing = false,
  overrideError,
}: WorkshopBlockedDialogProps) {
  const { t } = useTranslation(["reservations", "common"]);
  const { user } = useAuth();
  const isAdmin = user?.role === UserRole.ADMIN;
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (open) setReason("");
  }, [open]);

  const code = refusal?.reason ?? "";
  const explanation = t(`pickupReturn.workshopBlocked.reasons.${code}`, {
    defaultValue: refusal?.message || t('pickupReturn.workshopBlocked.reasons.IN_WORKSHOP'),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]" data-testid="dialog-workshop-blocked">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            {t('pickupReturn.workshopBlocked.title')}
          </DialogTitle>
          <DialogDescription data-testid="workshop-blocked">{explanation}</DialogDescription>
        </DialogHeader>

        {isAdmin ? (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              {t('pickupReturn.workshopBlocked.adminHint')}
            </p>
            <Label htmlFor="workshop-override-reason">
              {t('pickupReturn.workshopBlocked.reasonLabel')}
            </Label>
            <Textarea
              id="workshop-override-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder={t('pickupReturn.workshopBlocked.reasonPlaceholder')}
              data-testid="input-workshop-reason"
            />
            {overrideError && (
              <p className="text-sm text-red-600" data-testid="workshop-override-error">
                {overrideError}
              </p>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground" data-testid="workshop-blocked-no-override">
            {t('pickupReturn.workshopBlocked.notAdminHint')}
          </p>
        )}

        <DialogFooter className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isForcing}
            data-testid="button-workshop-blocked-close"
          >
            {t('pickupReturn.workshopBlocked.closeButton')}
          </Button>
          {isAdmin && (
            <Button
              variant="destructive"
              disabled={isForcing || reason.trim().length < MIN_REASON_LENGTH}
              onClick={() => onForce(reason.trim())}
              data-testid="button-force-handover"
            >
              {isForcing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('pickupReturn.workshopBlocked.forcingButton')}
                </>
              ) : (
                t('pickupReturn.workshopBlocked.forceButton')
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
