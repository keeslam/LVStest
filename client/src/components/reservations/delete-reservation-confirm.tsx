/**
 * Sub-project C, Task 5 (besluiten B-33, B-39) - the confirmation every
 * "verwijderen" of a reservation goes through.
 *
 * For an ordinary row it is the plain confirm dialog it always was. For a rental
 * that has been picked up it adds the warning "Deze huur is al opgehaald op
 * <datum> met contract <nr>." with a tick, keeps the confirm button disabled until
 * the box is ticked and hands `confirmPickedUp: true` on - which the server
 * insists on (`DELETE /api/reservations/:id?confirmPickedUp=true`).
 *
 * The caller decides what happens with the answer. When its request is refused with
 * 409 PICKED_UP_CONFIRMATION_REQUIRED (the screen did not know the row had been
 * picked up) it patches its row with what the server said and opens this dialog
 * again; `pickedUpRefusalOf` reads that answer.
 */
import { useEffect, useState } from "react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { isPickedUpRental } from "@shared/picked-up-cancellation";
import { PickedUpWarning, type PickedUpFacts } from "@/components/reservations/picked-up-cancellation";

export interface ConfirmDeleteReservationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The row being deleted; `null` while nothing is chosen. */
  reservation: ({ status?: unknown; type?: unknown } & Partial<PickedUpFacts>) | null | undefined;
  title: string;
  description: string;
  confirmLabel?: string;
  /** Called once, on confirm; `confirmPickedUp` is true only for a picked-up rental whose box was ticked. */
  onConfirm: (options: { confirmPickedUp: boolean }) => void;
  onCancel?: () => void;
  isLoading?: boolean;
}

export function ConfirmDeleteReservationDialog({
  open,
  onOpenChange,
  reservation,
  title,
  description,
  confirmLabel,
  onConfirm,
  onCancel,
  isLoading,
}: ConfirmDeleteReservationDialogProps) {
  const pickedUp = isPickedUpRental(reservation);
  const [ticked, setTicked] = useState(false);

  // A fresh question every time: a tick given for one rental never carries over to the next.
  useEffect(() => {
    if (!open) setTicked(false);
  }, [open]);

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      variant="danger"
      confirmLabel={confirmLabel}
      confirmDisabled={pickedUp && !ticked}
      isLoading={isLoading}
      onConfirm={() => onConfirm({ confirmPickedUp: pickedUp && ticked })}
      onCancel={onCancel}
    >
      {pickedUp && (
        <PickedUpWarning
          actualPickupDate={reservation?.actualPickupDate}
          contractNumber={reservation?.contractNumber}
          checked={ticked}
          onCheckedChange={setTicked}
        />
      )}
    </ConfirmDialog>
  );
}
