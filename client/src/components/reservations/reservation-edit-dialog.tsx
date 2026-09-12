import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ReservationForm } from "@/components/reservations/reservation-form";
import { Reservation } from "@shared/schema";
import { Skeleton } from "@/components/ui/skeleton";
import { createDirtyCloseGuard } from "@/components/dialogs/dirty-close-guard";
import { useToast } from "@/hooks/use-toast";

interface ReservationEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reservationId: number | null;
  onSuccess?: (reservation: Reservation) => void;
}

export function ReservationEditDialog({ 
  open, 
  onOpenChange, 
  reservationId,
  onSuccess 
}: ReservationEditDialogProps) {
  const { t } = useTranslation("reservations");
  const { toast } = useToast();
  const [initialData, setInitialData] = useState<Reservation | null>(null);

  // BUG-225, one dialog further: the add dialog has protected typed-in data
  // since wave 9, the edit dialog did not — and an edit is the case where the
  // typing is on top of a real reservation. Same rule, same helper: an
  // accidental click on the backdrop is not a decision, the X and Sluiten are.
  const isFormDirtyRef = useRef(false);
  const handleDirtyChange = useCallback((dirty: boolean) => {
    isFormDirtyRef.current = dirty;
  }, []);
  const keepOpenBecauseDirty = createDirtyCloseGuard({
    isDirty: () => isFormDirtyRef.current,
    onBlocked: () =>
      toast({
        title: t('editDialog.unsavedChangesTitle'),
        description: t('editDialog.unsavedChangesDescription'),
      }),
  });

  // A fresh dialog starts clean: the ref outlives the form when the dialog is
  // reopened for another reservation.
  useEffect(() => {
    if (!open) isFormDirtyRef.current = false;
  }, [open, reservationId]);
  
  // Fetch reservation data
  const { data: reservation, isLoading, error } = useQuery<Reservation>({
    queryKey: [`/api/reservations/${reservationId}`],
    enabled: !!reservationId && open,
  });
  
  useEffect(() => {
    if (reservation) {
      setInitialData(reservation);
    }
  }, [reservation]);

  const handleSuccess = (updatedReservation: Reservation) => {
    onSuccess?.(updatedReservation);
    onOpenChange(false);
  };

  // Always render the Dialog component to prevent unmounting issues during data loading
  // The open prop controls visibility
  return (
    <Dialog open={open && !!reservationId} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-4xl max-h-[90vh] overflow-y-auto"
        data-testid="dialog-reservation-edit"
        onPointerDownOutside={(e) => {
          // BUG-225: once anything has been typed, a click next to the dialog
          // no longer throws the edit away.
          if (keepOpenBecauseDirty(e)) return;
          // Prevent closing when the click target is inside another open dialog/popover
          // (e.g. Quick Add Driver, customer search). Those are portaled outside this
          // dialog so Radix would otherwise treat them as outside clicks.
          const target = e.target as HTMLElement | null;
          if (target && target.closest('[role="dialog"], [data-radix-popper-content-wrapper]')) {
            e.preventDefault();
          }
        }}
        onInteractOutside={(e) => {
          if (keepOpenBecauseDirty(e)) return;
          const target = e.target as HTMLElement | null;
          if (target && target.closest('[role="dialog"], [data-radix-popper-content-wrapper]')) {
            e.preventDefault();
          }
        }}
        onEscapeKeyDown={(e) => {
          const openDialogs = document.querySelectorAll('[role="dialog"][data-state="open"]');
          if (openDialogs.length > 1) {
            e.preventDefault();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>{t('editDialog.title')}</DialogTitle>
          <DialogDescription>
            {t('editDialog.description')}
          </DialogDescription>
          <p className="text-gray-500">{t('editDialog.reservationHash', { id: reservationId })}</p>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-6">
            <Skeleton className="h-8 w-3/12" />
            <div className="space-y-3">
              <Skeleton className="h-[500px] w-full" />
            </div>
          </div>
        ) : error || !reservation ? (
          <div className="bg-red-50 border border-red-200 p-4 rounded-md">
            <h3 className="text-lg font-semibold text-red-800">{t('editDialog.errorTitle')}</h3>
            <p className="text-red-600">{t('editDialog.failedToLoad', { error: (error as Error)?.message || '' })}</p>
          </div>
        ) : (
          initialData && (
            <ReservationForm
              editMode={true}
              initialData={initialData}
              onSuccess={handleSuccess}
              onDirtyChange={handleDirtyChange}
              // Inside a dialog "Sluiten" closes the dialog; without this the form navigates to the calendar page.
              onCancel={() => onOpenChange(false)}
            />
          )
        )}
      </DialogContent>
    </Dialog>
  );
}