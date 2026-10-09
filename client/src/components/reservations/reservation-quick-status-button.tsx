import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { RequiresPermission } from "@/components/ui/requires-permission";
import { RevertHandoverDialog } from "@/components/reservations/revert-handover-dialog";
import { Reservation, UserPermission } from "@shared/schema";
import { RotateCcw } from "lucide-react";

interface ReservationQuickStatusButtonProps {
  reservation: Reservation;
  size?: "sm" | "icon" | "default";
  variant?: "outline" | "ghost" | "default";
  withText?: boolean;
  className?: string;
  onReverted?: () => void;
}

/**
 * The dashboard's way into the reversal dialog (sub-project C, Task 4): a
 * picked-up rental can be undone from here, with a preview and a confirm,
 * never with one click. Needs `revert_handover`; without it the button stays
 * visible, disabled, and names the right (B-27).
 */
export function ReservationQuickStatusButton({
  reservation,
  size = "icon",
  variant = "ghost",
  withText = false,
  className = "",
  onReverted,
}: ReservationQuickStatusButtonProps) {
  const { t } = useTranslation("reservations");
  const [revertDialogOpen, setRevertDialogOpen] = useState(false);

  const { id, status } = reservation;

  // The dashboard lists current rentals: only a picked-up one has a handover
  // to undo from here. Hide the button for any other status.
  if (status !== "picked_up") {
    return null;
  }

  return (
    <>
      <RequiresPermission anyOf={[UserPermission.REVERT_HANDOVER]}>
        <Button
          variant={variant}
          size={size}
          onClick={() => setRevertDialogOpen(true)}
          className={`text-primary-600 hover:text-primary-800 ${className}`}
          title={t('revertHandover.opener.handover')}
          data-testid={`button-revert-handover-${id}`}
        >
          <RotateCcw className="h-4 w-4" />
          {withText && <span className="ml-2">{t('revertHandover.opener.handover')}</span>}
        </Button>
      </RequiresPermission>

      <RevertHandoverDialog
        open={revertDialogOpen}
        onOpenChange={setRevertDialogOpen}
        reservationId={id}
        onReverted={() => onReverted?.()}
      />
    </>
  );
}
