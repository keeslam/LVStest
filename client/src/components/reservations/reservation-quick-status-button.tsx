import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { RequiresPermission } from "@/components/ui/requires-permission";
import { StatusChangeDialog } from "@/components/reservations/status-change-dialog";
import { Reservation, UserPermission } from "@shared/schema";
import { RotateCcw } from "lucide-react";

interface ReservationQuickStatusButtonProps {
  reservation: Reservation;
  size?: "sm" | "icon" | "default";
  variant?: "outline" | "ghost" | "default";
  withText?: boolean;
  className?: string;
  onStatusChanged?: () => void;
}

export function ReservationQuickStatusButton({
  reservation,
  size = "icon", 
  variant = "ghost",
  withText = false,
  className = "",
  onStatusChanged,
}: ReservationQuickStatusButtonProps) {
  const { t } = useTranslation("reservations");
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);

  // Extract the necessary information
  const { id, status, vehicle, customer } = reservation;

  // This dialog is only used to revert a picked-up reservation back to booked.
  // Hide the button for any other status.
  if (status !== "picked_up") {
    return null;
  }

  return (
    <>
      <RequiresPermission anyOf={[UserPermission.MANAGE_RESERVATIONS]}>
        <Button
          variant={variant}
          size={size}
          onClick={() => setStatusDialogOpen(true)}
          className={`text-primary-600 hover:text-primary-800 ${className}`}
          title={t('quickStatusButton.revertToBooked')}
          data-testid={`button-quick-status-${id}`}
        >
          <RotateCcw className="h-4 w-4" />
          {withText && <span className="ml-2">{t('quickStatusButton.revertToBooked')}</span>}
        </Button>
      </RequiresPermission>

      <StatusChangeDialog
        open={statusDialogOpen}
        onOpenChange={setStatusDialogOpen}
        reservationId={id}
        initialStatus={status || "booked"}
        vehicle={vehicle}
        customer={customer}
        initialFuelData={{
          fuelLevelPickup: reservation.fuelLevelPickup,
          fuelLevelReturn: reservation.fuelLevelReturn,
          fuelCost: reservation.fuelCost ? Number(reservation.fuelCost) : null,
          fuelCardNumber: reservation.fuelCardNumber,
          fuelNotes: reservation.fuelNotes,
        }}
        onStatusChanged={onStatusChanged}
      />
    </>
  );
}