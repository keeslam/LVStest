import { useState, useRef, useCallback } from "react";
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
import { PickupDialog, ReturnDialog } from "@/components/reservations/pickup-return-dialogs";
import { PlusCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { Reservation } from "@shared/schema";

interface ReservationAddDialogProps {
  initialVehicleId?: string;
  initialCustomerId?: string;
  initialStartDate?: string;
  children?: React.ReactNode;
  onSuccess?: (reservation: any) => void;
  // Optional callback to delegate pickup dialog to parent (page-level)
  // This is needed when this dialog is rendered in a context where it gets unmounted
  // on data refetch (e.g., inside a table row that re-renders after reservation creation)
  onStartPickupFlow?: (reservation: Reservation) => void;
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
  onStartPickupFlow,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
}: ReservationAddDialogProps) {
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
  const [isPickupReturnDialogOpen, setIsPickupReturnDialogOpen] = useState(false);
  // Use ref for synchronous access in event handlers (React state updates are async)
  const isPickupReturnDialogOpenRef = useRef(false);
  const { toast } = useToast();

  // Lift pickup/return dialog state up to this level to render outside parent Dialog
  const [pickupDialogOpen, setPickupDialogOpen] = useState(false);
  const [returnDialogOpen, setReturnDialogOpen] = useState(false);
  const [pendingDialogReservation, setPendingDialogReservation] = useState<Reservation | null>(null);

  // Use refs to persist values across potential re-renders
  const pendingDialogReservationRef = useRef<Reservation | null>(null);
  const pickupDialogOpenRef = useRef(false);

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

    // Don't close if pickup/return dialog is open (check both state and ref for sync issues)
    if (!newOpen && (isPickupReturnDialogOpen || isPickupReturnDialogOpenRef.current)) {
      return;
    }

    if (!newOpen && isInPreviewMode) {
      toast({
        title: "Preview in Progress",
        description: "Please finalize the reservation or click 'Back to Edit' before closing.",
        variant: "default",
      });
      return;
    }

    setOpen(newOpen);

    if (!newOpen) {
      setIsInPreviewMode(false);
    }
  };
  
  // Handler for pickup/return dialog changes - updates both state and ref
  const handlePickupReturnDialogChange = (isOpen: boolean) => {
    isPickupReturnDialogOpenRef.current = isOpen;
    setIsPickupReturnDialogOpen(isOpen);
  };

  // Handler to trigger pickup dialog from ReservationForm - this receives the reservation data
  // Strategy: If parent provides onStartPickupFlow callback, delegate to it (page-level dialog)
  // Otherwise, try to render pickup dialog locally (works when dialog is stable)
  const handleTriggerPickupDialog = useCallback((reservation: Reservation) => {
    // If parent provides a page-level pickup flow handler, use it instead
    // (e.g. when this dialog might be unmounted by a refetch).
    if (onStartPickupFlow) {
      onStartPickupFlow(reservation);
      setOpen(false);
      return;
    }

    // Inline path: render PickupDialog as a sibling of the parent Dialog so it
    // stacks on top while the New Reservation dialog stays visible underneath.
    isPickupReturnDialogOpenRef.current = true;
    setIsPickupReturnDialogOpen(true);
    pendingDialogReservationRef.current = reservation;
    pickupDialogOpenRef.current = true;
    setPendingDialogReservation(reservation);
    setPickupDialogOpen(true);
  }, [onStartPickupFlow, setOpen]);

  // Handler to trigger return dialog from ReservationForm
  const handleTriggerReturnDialog = useCallback((reservation: Reservation) => {
    isPickupReturnDialogOpenRef.current = true;
    setIsPickupReturnDialogOpen(true);
    setPendingDialogReservation(reservation);
    setReturnDialogOpen(true);
  }, []);

  // Custom trigger or default "New Reservation" button
  const trigger = children || (
    <Button data-testid="button-new-reservation">
      <PlusCircle className="mr-2 h-4 w-4" />
      New Reservation
    </Button>
  );

  return (
    <>
    <Dialog 
      open={open} 
      onOpenChange={handleOpenChange}
      modal={!pickupDialogOpen && !returnDialogOpen}
    >
      {!isControlled && (
        <DialogTrigger asChild>
          {trigger}
        </DialogTrigger>
      )}
      <DialogContent 
        className="max-w-4xl max-h-[90vh] overflow-y-auto"
        onPointerDownOutside={(e) => {
          // Prevent closing when clicking on nested dialog overlays (use ref for sync access)
          if (isPickupReturnDialogOpen || isPickupReturnDialogOpenRef.current) {
            e.preventDefault();
            return;
          }
          // Prevent closing when the click target is inside another open dialog/popover
          // (e.g. the Quick Add Driver dialog, customer search, etc.) — those are portaled
          // outside this dialog so Radix considers them "outside" clicks.
          const target = e.target as HTMLElement | null;
          if (target && target.closest('[role="dialog"], [data-radix-popper-content-wrapper]')) {
            e.preventDefault();
          }
        }}
        onInteractOutside={(e) => {
          if (isPickupReturnDialogOpen || isPickupReturnDialogOpenRef.current) {
            e.preventDefault();
            return;
          }
          const target = e.target as HTMLElement | null;
          if (target && target.closest('[role="dialog"], [data-radix-popper-content-wrapper]')) {
            e.preventDefault();
          }
        }}
        onEscapeKeyDown={(e) => {
          if (isPickupReturnDialogOpen || isPickupReturnDialogOpenRef.current) {
            e.preventDefault();
            return;
          }
          const openDialogs = document.querySelectorAll('[role="dialog"][data-state="open"]');
          if (openDialogs.length > 1) {
            e.preventDefault();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>New Reservation</DialogTitle>
          <DialogDescription>
            Create a new reservation by selecting a vehicle and customer
          </DialogDescription>
        </DialogHeader>
        <div className="mt-4">
          <ReservationForm 
            initialVehicleId={initialVehicleId}
            initialCustomerId={initialCustomerId}
            initialStartDate={initialStartDate}
            onPreviewModeChange={setIsInPreviewMode}
            onPickupReturnDialogChange={handlePickupReturnDialogChange}
            onTriggerPickupDialog={handleTriggerPickupDialog}
            onTriggerReturnDialog={handleTriggerReturnDialog}
            onSuccess={(reservation) => {
              setIsInPreviewMode(false);
              isPickupReturnDialogOpenRef.current = false;
              setIsPickupReturnDialogOpen(false);
              setOpen(false);
              if (onSuccess) {
                onSuccess(reservation);
              }
            }}
            onCancel={() => {
              setIsInPreviewMode(false);
              isPickupReturnDialogOpenRef.current = false;
              setIsPickupReturnDialogOpen(false);
              setOpen(false);
            }}
          />
        </div>
      </DialogContent>
    </Dialog>
    
    {/* Render pickup/return dialogs OUTSIDE the parent Dialog to avoid focus/portal conflicts */}
    {/* Use ref fallback if state was reset due to component re-render */}
    {(pendingDialogReservation || pendingDialogReservationRef.current) && (
      <PickupDialog
        open={pickupDialogOpen || pickupDialogOpenRef.current}
        onOpenChange={(dialogOpen) => {
          setPickupDialogOpen(dialogOpen);
          pickupDialogOpenRef.current = dialogOpen;
          if (!dialogOpen) {
            // Dialog closed/cancelled
            setPendingDialogReservation(null);
            pendingDialogReservationRef.current = null;
            isPickupReturnDialogOpenRef.current = false;
            setIsPickupReturnDialogOpen(false);
          }
        }}
        reservation={(pendingDialogReservation || pendingDialogReservationRef.current)!}
        onSuccess={async () => {
          setPickupDialogOpen(false);
          pickupDialogOpenRef.current = false;
          isPickupReturnDialogOpenRef.current = false;
          setIsPickupReturnDialogOpen(false);
          
          // Close the parent dialog as well - pickup workflow is complete
          setOpen(false);
          
          // Fetch updated reservation and call success callback
          const reservationToUse = pendingDialogReservation || pendingDialogReservationRef.current;
          if (onSuccess && reservationToUse) {
            try {
              const response = await fetch(`/api/reservations/${reservationToUse.id}`, { credentials: 'include' });
              if (response.ok) {
                const updatedReservation = await response.json();
                onSuccess(updatedReservation);
              }
            } catch (e) {
              console.error('Failed to fetch updated reservation:', e);
            }
          }
          
          setPendingDialogReservation(null);
          pendingDialogReservationRef.current = null;
        }}
      />
    )}
    
    {(pendingDialogReservation || pendingDialogReservationRef.current) && (
      <ReturnDialog
        open={returnDialogOpen}
        onOpenChange={(dialogOpen) => {
          setReturnDialogOpen(dialogOpen);
          if (!dialogOpen) {
            // Dialog closed/cancelled
            setPendingDialogReservation(null);
            pendingDialogReservationRef.current = null;
            isPickupReturnDialogOpenRef.current = false;
            setIsPickupReturnDialogOpen(false);
          }
        }}
        reservation={(pendingDialogReservation || pendingDialogReservationRef.current)!}
        onSuccess={async () => {
          setReturnDialogOpen(false);
          isPickupReturnDialogOpenRef.current = false;
          setIsPickupReturnDialogOpen(false);
          
          // Close the parent dialog as well - return workflow is complete
          setOpen(false);
          
          // Fetch updated reservation and call success callback
          const reservationToUse = pendingDialogReservation || pendingDialogReservationRef.current;
          if (onSuccess && reservationToUse) {
            try {
              const response = await fetch(`/api/reservations/${reservationToUse.id}`, { credentials: 'include' });
              if (response.ok) {
                const updatedReservation = await response.json();
                onSuccess(updatedReservation);
              }
            } catch (e) {
              console.error('Failed to fetch updated reservation:', e);
            }
          }
          
          setPendingDialogReservation(null);
          pendingDialogReservationRef.current = null;
        }}
      />
    )}
    </>
  );
}