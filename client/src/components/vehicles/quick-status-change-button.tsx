import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { RequiresPermission } from "@/components/ui/requires-permission";
import { RevertHandoverDialog } from "@/components/reservations/revert-handover-dialog";
import { Reservation, UserPermission } from "@shared/schema";
import { RotateCcw } from "lucide-react";

interface QuickStatusChangeButtonProps {
  vehicleId: number;
}

/**
 * Vehicle details: undo the pickup of the rental this vehicle is out on
 * (sub-project C, Task 4). One button, one dialog with a preview and a
 * confirm; needs `revert_handover` (visible and disabled without it).
 */
export function QuickStatusChangeButton({ vehicleId }: QuickStatusChangeButtonProps) {
  const { t } = useTranslation("reservations");
  const [revertDialogOpen, setRevertDialogOpen] = useState(false);

  // Query to get the reservations of this vehicle
  const vehicleReservationsQueryKey = [`/api/reservations/vehicle/${vehicleId}`];

  const { data: reservations } = useQuery<Reservation[]>({
    queryKey: vehicleReservationsQueryKey,
  });

  // Only a picked-up rental has a pickup to undo from here.
  const pickedUpReservations = reservations?.filter((res) => res.status === "picked_up");

  // The one whose period starts first
  const pickedUp = pickedUpReservations && pickedUpReservations.length > 0
    ? [...pickedUpReservations].sort((a, b) => {
        const dateA = a.startDate ? new Date(a.startDate).getTime() : 0;
        const dateB = b.startDate ? new Date(b.startDate).getTime() : 0;
        return dateA - dateB;
      })[0]
    : null;

  // Don't show the button if the vehicle is not out on a rental
  if (!pickedUp) {
    return null;
  }

  return (
    <>
      <RequiresPermission anyOf={[UserPermission.REVERT_HANDOVER]}>
        <Button
          variant="outline"
          onClick={() => setRevertDialogOpen(true)}
          className="flex items-center"
          data-testid="button-revert-handover"
        >
          <RotateCcw className="h-4 w-4 mr-2" />
          {t('revertHandover.opener.handover')}
        </Button>
      </RequiresPermission>

      <RevertHandoverDialog
        open={revertDialogOpen}
        onOpenChange={setRevertDialogOpen}
        reservationId={pickedUp.id}
      />
    </>
  );
}
