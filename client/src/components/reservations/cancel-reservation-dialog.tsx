/**
 * besluiten.md **B-04** (OPT-028, BUG-112) — "vragen wat er mee moet, daarna
 * uitvoeren".
 *
 * Phase 34 built the server half and nothing ever called it. Until this
 * dialog, cancelling meant opening the edit form and picking *Geannuleerd*
 * from the status list: the rental closed and the transport, the replacement
 * reservation, the placeholder and the driver assignment all stayed open,
 * without a word. PHASE 57 reproduced exactly that at the desk.
 *
 * So: read `GET /:id/cancel-impact`, show what hangs off the rental, ask per
 * kind whether it goes along, and hand the answers to the endpoint that has
 * been waiting for them — `PATCH /:id/status` with `cascade`. Everything the
 * employee leaves unticked stays exactly as it was, which is the half of the
 * decision that is easy to lose.
 *
 * Sub-project C, Task 5 (besluiten B-33, B-39): a rental that has been picked up
 * gets one more question first - the warning "Deze huur is al opgehaald op <datum>
 * met contract <nr>." and a tick. The dialog reads the row itself to know; when
 * the row was picked up after that read (a stale screen) the server answers 409
 * PICKED_UP_CONFIRMATION_REQUIRED and the warning appears with the server's facts.
 */
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertTriangle, Loader2, XCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, invalidateByPrefix } from "@/lib/queryClient";
import { formatDutchDate } from "@shared/booking-warnings";
import { isPickedUpRental } from "@shared/picked-up-cancellation";
import type { Reservation } from "@shared/schema";
import {
  PickedUpWarning, isPickedUpRightRefusal, pickedUpRefusalOf, type PickedUpFacts,
} from "@/components/reservations/picked-up-cancellation";

/** The four kinds `getReservationCancelImpact()` reports, in the order it reports them. */
export const CANCEL_CASCADE_KINDS = ["transports", "spares", "placeholders", "drivers"] as const;
export type CancelCascadeKind = (typeof CANCEL_CASCADE_KINDS)[number];

export interface CancelImpact {
  transports: Array<{ id: number; scheduledDate: string | null; status: string | null; transportType: string | null }>;
  spares: Array<{ id: number; vehicleId: number | null; startDate: string | null; endDate: string | null; status: string | null }>;
  placeholders: Array<{ id: number; startDate: string | null; endDate: string | null; status: string | null }>;
  drivers: Array<{ id: number; driverId: number | null; assignedFrom: string | null }>;
}

interface CancelReservationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reservationId: number;
  onSuccess?: () => void;
}

const emptyCascade: Record<CancelCascadeKind, boolean> = {
  transports: false,
  spares: false,
  placeholders: false,
  drivers: false,
};

export function CancelReservationDialog({
  open,
  onOpenChange,
  reservationId,
  onSuccess,
}: CancelReservationDialogProps) {
  const { t } = useTranslation(["reservations", "common"]);
  const { toast } = useToast();
  // Default: leave everything standing. Cancelling the rental is the one thing
  // the employee came here to do; every extra close is a deliberate tick.
  const [cascade, setCascade] = useState<Record<CancelCascadeKind, boolean>>(emptyCascade);
  // B-33: the tick for a picked-up rental, and what the server told us when it
  // refused a cancellation this screen did not know needed one.
  const [pickedUpTicked, setPickedUpTicked] = useState(false);
  const [serverFacts, setServerFacts] = useState<PickedUpFacts | null>(null);

  useEffect(() => {
    if (open) {
      setCascade(emptyCascade);
      setPickedUpTicked(false);
      setServerFacts(null);
    }
  }, [open, reservationId]);

  // The same key the reservation view dialog reads, so it is usually already cached.
  const { data: reservation } = useQuery<Reservation>({
    queryKey: [`/api/reservations/${reservationId}`],
    enabled: open && reservationId > 0,
  });
  const pickedUp = serverFacts !== null || isPickedUpRental(reservation);
  const pickedUpFacts: PickedUpFacts = serverFacts ?? {
    actualPickupDate: reservation?.actualPickupDate,
    contractNumber: reservation?.contractNumber,
  };

  const { data: impact, isLoading } = useQuery<CancelImpact>({
    queryKey: [`/api/reservations/${reservationId}/cancel-impact`],
    enabled: open && reservationId > 0,
  });

  const lines: Record<CancelCascadeKind, string[]> = {
    transports: (impact?.transports ?? []).map((transport) =>
      t('cancelDialog.lines.transport', {
        id: transport.id,
        date: formatDutchDate(transport.scheduledDate) || '—',
      }),
    ),
    spares: (impact?.spares ?? []).map((spare) =>
      t('cancelDialog.lines.spare', {
        id: spare.id,
        start: formatDutchDate(spare.startDate) || '—',
        end: formatDutchDate(spare.endDate) || t('cancelDialog.openEnded'),
      }),
    ),
    placeholders: (impact?.placeholders ?? []).map((placeholder) =>
      t('cancelDialog.lines.placeholder', {
        id: placeholder.id,
        start: formatDutchDate(placeholder.startDate) || '—',
        end: formatDutchDate(placeholder.endDate) || t('cancelDialog.openEnded'),
      }),
    ),
    drivers: (impact?.drivers ?? []).map((driver) =>
      t('cancelDialog.lines.driver', {
        id: driver.driverId ?? driver.id,
        from: formatDutchDate(driver.assignedFrom) || '—',
      }),
    ),
  };

  const attachedKinds = CANCEL_CASCADE_KINDS.filter((kind) => lines[kind].length > 0);

  const cancelMutation = useMutation({
    mutationFn: async () => {
      // The endpoint phase 34 built, at last with a caller. It cancels the
      // rental and closes precisely the kinds flagged here.
      const response = await apiRequest("PATCH", `/api/reservations/${reservationId}/status`, {
        status: "cancelled",
        cascade: {
          transports: cascade.transports,
          spares: cascade.spares,
          placeholders: cascade.placeholders,
          drivers: cascade.drivers,
        },
        // Only ever sent for a rental that has been picked up and whose box was ticked.
        ...(pickedUp && pickedUpTicked ? { confirmPickedUp: true } : {}),
      });
      return await response.json();
    },
    onSuccess: async () => {
      await invalidateByPrefix("/api/reservations");
      await invalidateByPrefix("/api/vehicles");
      await invalidateByPrefix("/api/transports");
      toast({
        title: t('cancelDialog.toasts.cancelledTitle'),
        description: t('cancelDialog.toasts.cancelledDescription', { id: reservationId }),
      });
      onOpenChange(false);
      onSuccess?.();
    },
    onError: (error: any) => {
      // 409: the row had been picked up after this screen read it. Not a failure -
      // ask the question, with the date and the contract the server named.
      const refusal = pickedUpRefusalOf(error);
      if (refusal) {
        setServerFacts(refusal);
        setPickedUpTicked(false);
        return;
      }
      toast({
        variant: "destructive",
        title: t('cancelDialog.toasts.failedTitle'),
        // By code, never the English message of a known refusal.
        description: isPickedUpRightRefusal(error)
          ? t('pickedUpWarning.rightRequired')
          : error?.message || t('cancelDialog.toasts.failedDescription'),
      });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]" data-testid="dialog-cancel-reservation">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <XCircle className="h-5 w-5 text-red-600" />
            {t('cancelDialog.title')}
          </DialogTitle>
          <DialogDescription>
            {t('cancelDialog.description', { id: reservationId })}
          </DialogDescription>
        </DialogHeader>

        {pickedUp && (
          <PickedUpWarning
            actualPickupDate={pickedUpFacts.actualPickupDate}
            contractNumber={pickedUpFacts.contractNumber}
            checked={pickedUpTicked}
            onCheckedChange={setPickedUpTicked}
          />
        )}

        <div
          className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"
          data-testid="cancel-impact-list"
        >
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <div className="w-full space-y-3">
              {isLoading ? (
                <p className="flex items-center gap-2">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  {t('cancelDialog.checkingImpact')}
                </p>
              ) : attachedKinds.length === 0 ? (
                <p>{t('cancelDialog.nothingAttached')}</p>
              ) : (
                <>
                  <p className="font-medium">{t('cancelDialog.attachedTitle')}</p>
                  {attachedKinds.map((kind) => (
                    <div key={kind} className="space-y-1" data-testid={`cancel-impact-${kind}`}>
                      <ul className="list-disc pl-4">
                        {lines[kind].map((line) => (
                          <li key={line}>{line}</li>
                        ))}
                      </ul>
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id={`cancel-cascade-${kind}`}
                          data-testid={`cancel-cascade-${kind}`}
                          checked={cascade[kind]}
                          onCheckedChange={(next) =>
                            setCascade((current) => ({ ...current, [kind]: next === true }))
                          }
                        />
                        <Label htmlFor={`cancel-cascade-${kind}`} className="font-normal">
                          {t(`cancelDialog.cascadeLabels.${kind}`)}
                        </Label>
                      </div>
                    </div>
                  ))}
                  <p className="text-amber-800/80">{t('cancelDialog.keepHint')}</p>
                </>
              )}
            </div>
          </div>
        </div>

        <DialogFooter className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={cancelMutation.isPending}
            data-testid="button-abort-cancel-reservation"
          >
            {t('cancelDialog.abortButton')}
          </Button>
          <Button
            variant="destructive"
            onClick={() => cancelMutation.mutate()}
            disabled={cancelMutation.isPending || (pickedUp && !pickedUpTicked)}
            data-testid="button-confirm-cancel-reservation"
          >
            {cancelMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t('cancelDialog.cancellingButton')}
              </>
            ) : (
              t('cancelDialog.confirmButton')
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
