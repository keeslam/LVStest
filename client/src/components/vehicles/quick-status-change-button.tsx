import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { StatusChangeDialog } from "@/components/reservations/status-change-dialog";
import { Reservation } from "@shared/schema";
import { RotateCcw } from "lucide-react";

interface QuickStatusChangeButtonProps {
  vehicleId: number;
}

export function QuickStatusChangeButton({ vehicleId }: QuickStatusChangeButtonProps) {
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [selectedReservation, setSelectedReservation] = useState<Reservation | null>(null);
  
  // Query to get active reservations for this vehicle
  const vehicleReservationsQueryKey = [`/api/reservations/vehicle/${vehicleId}`];
  
  const { data: reservations } = useQuery<Reservation[]>({
    queryKey: vehicleReservationsQueryKey,
  });
  
  // The status dialog now only reverts picked_up reservations back to booked,
  // so we only surface picked_up reservations here.
  const activeReservations = reservations?.filter(
    (res) => res.status === "picked_up"
  );
  
  // Sort by nearest start date
  const sortedReservations = activeReservations?.sort((a, b) => {
    const dateA = a.startDate ? new Date(a.startDate).getTime() : 0;
    const dateB = b.startDate ? new Date(b.startDate).getTime() : 0;
    return dateA - dateB;
  });
  
  // Take the first active reservation if available
  const nextReservation = sortedReservations && sortedReservations.length > 0 
    ? sortedReservations[0] 
    : null;
  
  // Handle button click to open status dialog with this reservation
  const handleStatusChange = () => {
    if (nextReservation) {
      setSelectedReservation(nextReservation);
      setStatusDialogOpen(true);
    }
  };
  
  // Don't show the button if there are no active reservations
  if (!nextReservation) {
    return null;
  }
  
  return (
    <>
      <Button
        variant="outline"
        onClick={handleStatusChange}
        className="flex items-center"
      >
        <RotateCcw className="h-4 w-4 mr-2" />
        Revert Pickup to Booked
      </Button>
      
      {selectedReservation && (
        <StatusChangeDialog
          open={statusDialogOpen}
          onOpenChange={setStatusDialogOpen}
          reservationId={selectedReservation.id}
          initialStatus={selectedReservation.status || "booked"}
          vehicle={selectedReservation.vehicle}
          customer={selectedReservation.customer}
          initialFuelData={{
            fuelLevelPickup: selectedReservation.fuelLevelPickup,
            fuelLevelReturn: selectedReservation.fuelLevelReturn,
            fuelCost: selectedReservation.fuelCost ? Number(selectedReservation.fuelCost) : null,
            fuelCardNumber: selectedReservation.fuelCardNumber,
            fuelNotes: selectedReservation.fuelNotes,
          }}
          onStatusChanged={() => {
            // This will be called after the status is changed successfully
            setSelectedReservation(null);
          }}
        />
      )}
    </>
  );
}