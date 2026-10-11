import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ReservationForm } from "@/components/reservations/reservation-form";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useUnsavedChangesGuard } from "@/hooks/use-unsaved-changes-guard";
import { PlusCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ReservationAddDialogProps {
  initialVehicleId?: string;
  initialCustomerId?: string;
  initialStartDate?: string;
  children?: React.ReactNode;
  onSuccess?: (reservation: any) => void;
  // Optional controlled-mode props. When provided, the dialog open state is owned by
  // the parent (recommended when this component would otherwise unmount during a
  // refetch — e.g. when rendered inside a TanStack Table cell).
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function ReservationAddDialog({ 
  initialVehicleId, 
  initialCustomerId, 
  initialStartDate,
  children,
  onSuccess,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
}: ReservationAddDialogProps) {
  const { t } = useTranslation("reservations");
  const isControlled = controlledOpen !== undefined;
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = isControlled ? controlledOpen : uncontrolledOpen;
  const setOpen = useCallback((next: boolean) => {
    if (isControlled) {
      controlledOnOpenChange?.(next);
    } else {
      setUncontrolledOpen(next);
    }
  }, [isControlled, controlledOnOpenChange]);
  const [isInPreviewMode, setIsInPreviewMode] = useState(false);
  // FIX-Q (BUG-225): once anything has been typed, closing the dialog (Escape, the X, a click next to
  // it, Annuleren) asks "Wijzigingen verwerpen?" instead of throwing the form away - the shared guard.
  // A clean form closes at once. Saving and the pickup/return flow close the dialog directly.
  const closeDialog = () => {
    setIsInPreviewMode(false);
    setOpen(false);
  };
  const guard = useUnsavedChangesGuard({ close: closeDialog, open: () => setOpen(true) });
  const { toast } = useToast();

  const handleOpenChange = (newOpen: boolean) => {
    // Defense-in-depth: block any close requested while a nested dialog is open
    // (e.g. Quick Add Driver, Add Customer). This prevents an outside-click or stray
    // close event from a child portal from collapsing the parent reservation dialog.
    if (!newOpen) {
      const openDialogs = document.querySelectorAll('[role="dialog"][data-state="open"]');
      if (openDialogs.length > 1) {
        return;
      }
    }

    if (!newOpen && isInPreviewMode) {
      toast({
        title: t('addDialog.previewInProgressTitle'),
        description: t('addDialog.previewInProgressDescription'),
        variant: "default",
      });
      return;
    }

    if (newOpen) {
      setOpen(true);
      return;
    }
    guard.requestClose();
  };
  
  // Custom trigger or default "New Reservation" button
  const trigger = children || (
    <Button data-testid="button-new-reservation">
      <PlusCircle className="mr-2 h-4 w-4" />
      {t('addDialog.newReservation')}
    </Button>
  );

  return (
    <>
    <Dialog 
      open={open} 
      onOpenChange={handleOpenChange}
    >
      {!isControlled && (
        <DialogTrigger asChild>
          {trigger}
        </DialogTrigger>
      )}
      <DialogContent 
        className="max-w-4xl max-h-[90vh] overflow-y-auto"
        onPointerDownOutside={(e) => {
          // Prevent closing when the click target is inside another open dialog/popover
          // (e.g. the Quick Add Driver dialog, customer search, etc.) — those are portaled
          // outside this dialog so Radix considers them "outside" clicks.
          const target = e.target as HTMLElement | null;
          if (target && target.closest('[role="dialog"], [data-radix-popper-content-wrapper]')) {
            e.preventDefault();
          }
        }}
        onInteractOutside={(e) => {
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
          <DialogTitle>{t('addDialog.newReservation')}</DialogTitle>
          <DialogDescription>
            {t('addDialog.description')}
          </DialogDescription>
        </DialogHeader>
        <div className="mt-4">
          <ReservationForm 
            onDirtyChange={guard.setDirty}
            initialVehicleId={initialVehicleId}
            initialCustomerId={initialCustomerId}
            initialStartDate={initialStartDate}
            onPreviewModeChange={setIsInPreviewMode}
            onSuccess={(reservation) => {
              setIsInPreviewMode(false);
              setOpen(false);
              if (onSuccess) {
                onSuccess(reservation);
              }
            }}
            onCancel={guard.requestClose}
          />
        </div>
      </DialogContent>
    </Dialog>
    <ConfirmDialog {...guard.confirmProps} />
    </>
  );
}