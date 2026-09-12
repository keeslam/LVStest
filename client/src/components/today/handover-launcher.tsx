/**
 * OPT-001 — the bridge between a "Vandaag" row and the real handover dialog.
 *
 * The board's rows are deliberately thin (a few fields, not a whole
 * reservation) — that is the whole point of the endpoint. `PickupDialog` and
 * `ReturnDialog` want the full row, so one row-sized `GET /api/reservations/:id`
 * is fetched at the moment the employee presses the button, and only then.
 *
 * Deliberately *not* a second implementation of the handover: these are the
 * same two dialogs the scan panel, the calendar and the reservation view open,
 * so besluiten B-16's "gaat de huur eerder in?" question and B-03's workshop
 * refusal come along unchanged.
 */
import { useQuery } from "@tanstack/react-query";
import type { Reservation } from "@shared/schema";
import type { HandoverKind } from "@/lib/handover-choice";
import { PickupDialog, ReturnDialog } from "@/components/reservations/pickup-return-dialogs";

export interface HandoverRequest {
  reservationId: number;
  kind: HandoverKind;
}

interface HandoverLauncherProps {
  request: HandoverRequest | null;
  onClose: () => void;
  onSuccess?: () => void;
}

export function HandoverLauncher({ request, onClose, onSuccess }: HandoverLauncherProps) {
  const { data: reservation } = useQuery<Reservation>({
    queryKey: [`/api/reservations/${request?.reservationId}`],
    enabled: !!request?.reservationId,
  });

  if (!request || !reservation) return null;

  const commonProps = {
    open: true,
    onOpenChange: (open: boolean) => {
      if (!open) onClose();
    },
    reservation,
    onSuccess: () => {
      onSuccess?.();
      onClose();
    },
  };

  return request.kind === "return" ? (
    <ReturnDialog {...commonProps} />
  ) : (
    <PickupDialog {...commonProps} />
  );
}
