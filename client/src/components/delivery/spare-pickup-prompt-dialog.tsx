import { useState } from "react";
import { useTranslation } from "react-i18next";
import { invalidateRelatedQueries } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { PickupDialog, ReturnDialog } from "@/components/reservations/pickup-return-dialogs";
import { VehicleTransport } from "@shared/schema";
import { formatLicensePlate } from "@/lib/format-utils";

interface SparePickupPromptDialogProps {
  // Rendered (open) whenever this is non-null. Caller controls when that is —
  // right after a spare gets assigned, or when completing a transport that still
  // has one pending — both share this one dialog and its two actions.
  transport: VehicleTransport | null;
  onClose: () => void;
  // Called after either action resolves, so a caller that needs to keep going
  // afterward (e.g. dashboard.tsx completing the transport) can do so regardless of
  // which button was pressed — "Later" is a legitimate choice, not a cancellation.
  onResolved?: (acted: boolean) => void;
  description?: string;
  // 'pickup' hands off to PickupDialog (spare reservation booked -> picked_up);
  // 'return' hands off to ReturnDialog (picked_up -> returned). Same prompt shape,
  // same "now or later" reasoning — only which real dialog and which reservation
  // status is expected differs.
  mode?: "pickup" | "return";
}

// "Marking picked up"/"marking returned" for a replacement vehicle IS a real vehicle
// handover, so it goes through the same PickupDialog/ReturnDialog (contract number,
// mileage, fuel, damage check) as any other pickup/return — not a bare status toggle.
// This component is a small prompt ("now or later") that, on "now", hands off to that
// real dialog against the spare reservation created when the replacement vehicle was
// assigned.
export function SparePickupPromptDialog({ transport, onClose, onResolved, description, mode = "pickup" }: SparePickupPromptDialogProps) {
  const { t } = useTranslation(["delivery", "reservations", "common"]);
  const { toast } = useToast();
  // Radix's AlertDialogAction closes the dialog itself on click (same as Cancel),
  // which nulls the parent's `transport` state via onOpenChange around the same
  // time — captured into local state synchronously on click so the real dialog
  // below doesn't depend on the prop surviving that race.
  const [pendingTransport, setPendingTransport] = useState<VehicleTransport | null>(null);

  // The real PickupDialog/ReturnDialog's own POST /api/reservations/:id/pickup or
  // /return already updated the spare reservation's status by the time this fires —
  // getTransportSpareStatus reads that status live, so there's nothing left to
  // record here beyond refreshing the cache.
  const handleSuccess = (vehicleId: number | null) => {
    invalidateRelatedQueries('transports', { vehicleId: vehicleId ?? undefined });
    toast({
      title: t(mode === "return" ? 'dashboardPage.spareReturnedTitle' : 'dashboardPage.sparePickedUpTitle'),
      description: t(mode === "return" ? 'dashboardPage.spareReturnedDescription' : 'dashboardPage.sparePickedUpDescription'),
    });
    setPendingTransport(null);
    onClose();
    onResolved?.(true);
  };

  const vehicleLabel = transport?.relatedVehicle
    ? `${transport.relatedVehicle.brand} ${transport.relatedVehicle.model} (${formatLicensePlate(transport.relatedVehicle.licensePlate)})`
    : "";

  if (pendingTransport?.spareReservation) {
    const commonProps = {
      open: true,
      onOpenChange: (open: boolean) => {
        if (!open) {
          // User backed out of the real form — don't record anything.
          setPendingTransport(null);
          onClose();
        }
      },
      reservation: pendingTransport.spareReservation,
      onSuccess: () => handleSuccess(pendingTransport.vehicleId),
    };
    return mode === "return" ? <ReturnDialog {...commonProps} /> : <PickupDialog {...commonProps} />;
  }

  const failTitleKey = mode === "return" ? 'dashboardPage.spareReturnFailedTitle' : 'dashboardPage.sparePickupFailedTitle';
  const failDescKey = mode === "return" ? 'dashboardPage.spareReturnFailedDescription' : 'dashboardPage.sparePickupFailedDescription';
  const promptTitleKey = mode === "return" ? 'dashboardPage.spareReturnPromptTitle' : 'dashboardPage.sparePickupPromptTitle';
  const promptDescKey = mode === "return" ? 'dashboardPage.spareReturnPromptDescription' : 'dashboardPage.sparePickupPromptDescription';
  const laterKey = mode === "return" ? 'dashboardPage.spareReturnLaterButton' : 'dashboardPage.sparePickupLaterButton';
  const nowKey = mode === "return" ? 'dashboardPage.spareReturnNowButton' : 'dashboardPage.sparePickupNowButton';

  return (
    <AlertDialog open={!!transport} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t(promptTitleKey)}</AlertDialogTitle>
          <AlertDialogDescription>
            {description || t(promptDescKey, { vehicle: vehicleLabel })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel
            onClick={() => {
              onClose();
              onResolved?.(false);
            }}
            data-testid="button-spare-pickup-later"
          >
            {t(laterKey)}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              if (!transport) return;
              if (!transport.spareReservation) {
                toast({
                  title: t(failTitleKey),
                  description: t(failDescKey),
                  variant: "destructive",
                });
                return;
              }
              setPendingTransport(transport);
            }}
            data-testid="button-spare-pickup-now"
          >
            {t(nowKey)}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
