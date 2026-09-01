import { useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, invalidateByPrefix } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { formatReservationStatus } from "@/lib/format-utils";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Loader2, RotateCcw } from "lucide-react";

interface StatusChangeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reservationId: number;
  initialStatus: string;
  startDate?: string;
  contractNumber?: string | null;
  vehicle?: {
    id: number;
    brand: string;
    model: string;
    licensePlate?: string | null;
    currentMileage?: number | null;
    departureMileage?: number | null;
    returnMileage?: number | null;
  };
  customer?: {
    id: number;
    name?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    companyName?: string | null;
    phone?: string | null;
    email?: string | null;
  };
  initialFuelData?: {
    fuelLevelPickup?: string | null;
    fuelLevelReturn?: string | null;
    fuelCost?: number | null;
    fuelCardNumber?: string | null;
    fuelNotes?: string | null;
  };
  pickupMileage?: number | null;
  returnMileage?: number | null;
  onStatusChanged?: () => void | Promise<void>;
}

const formatDisplayLicensePlate = (licensePlate?: string | null) => {
  if (!licensePlate) return "";
  return licensePlate.replace(/-/g, "");
};

const getStatusBadgeClass = (status: string) => {
  switch (status) {
    case "booked":
      return "bg-blue-100 text-blue-800 border-blue-200";
    case "picked_up":
      return "bg-emerald-100 text-emerald-800 border-emerald-200";
    case "completed":
      return "bg-gray-100 text-gray-800 border-gray-200";
    case "cancelled":
      return "bg-red-100 text-red-800 border-red-200";
    default:
      return "bg-gray-100 text-gray-800";
  }
};

export function StatusChangeDialog({
  open,
  onOpenChange,
  reservationId,
  initialStatus,
  vehicle,
  customer,
  pickupMileage,
  onStatusChanged,
}: StatusChangeDialogProps) {
  const { t } = useTranslation("reservations");
  const { toast } = useToast();
  const [confirmed, setConfirmed] = useState(false);

  const canRevert = initialStatus === "picked_up";

  const revertMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest(
        "PATCH",
        `/api/reservations/${reservationId}/status`,
        { status: "booked" },
      );
      return res.json();
    },
    onSuccess: async () => {
      toast({
        title: t('statusChangeDialog.toasts.successTitle'),
        description: t('statusChangeDialog.toasts.successDescription'),
      });
      await invalidateByPrefix("/api/reservations");
      await invalidateByPrefix("/api/vehicles");
      setConfirmed(false);
      if (onStatusChanged) {
        await onStatusChanged();
      }
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast({
        title: t('statusChangeDialog.toasts.failedTitle'),
        description: error?.message || t('statusChangeDialog.toasts.failedFallback'),
        variant: "destructive",
      });
    },
  });

  const handleClose = (next: boolean) => {
    if (!next) setConfirmed(false);
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose} key={`revert-${reservationId}`}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{t('statusChangeDialog.title')}</DialogTitle>
          <DialogDescription>
            {t('statusChangeDialog.description')}
          </DialogDescription>
        </DialogHeader>

        {(vehicle || customer) && (
          <div className="bg-muted/50 rounded-md p-3 space-y-2">
            {vehicle && (
              <div className="space-y-1">
                <h3 className="font-medium text-sm">{t('statusChangeDialog.vehicleLabel')}</h3>
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
                  <div>
                    <span className="text-muted-foreground mr-1">{t('statusChangeDialog.licenseLabel')}</span>
                    <span className="font-medium">
                      {formatDisplayLicensePlate(vehicle.licensePlate)}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground mr-1">{t('statusChangeDialog.vehicleColonLabel')}</span>
                    <span className="font-medium">
                      {vehicle.brand} {vehicle.model}
                    </span>
                  </div>
                  {pickupMileage !== undefined && pickupMileage !== null && (
                    <div>
                      <span className="text-muted-foreground mr-1">{t('statusChangeDialog.atPickupLabel')}</span>
                      <span className="font-medium">
                        {pickupMileage.toLocaleString()} km
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {customer && (
              <div className="space-y-1">
                <h3 className="font-medium text-sm">{t('statusChangeDialog.customerLabel')}</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-1 text-sm">
                  {(customer.name || customer.firstName || customer.lastName) && (
                    <div>
                      <span className="text-muted-foreground mr-1">{t('statusChangeDialog.nameLabel')}</span>
                      <span className="font-medium">
                        {customer.name ||
                          [customer.firstName, customer.lastName].filter(Boolean).join(" ")}
                      </span>
                    </div>
                  )}
                  {customer.companyName && (
                    <div>
                      <span className="text-muted-foreground mr-1">{t('statusChangeDialog.companyLabel')}</span>
                      <span className="font-medium">{customer.companyName}</span>
                    </div>
                  )}
                  {customer.phone && (
                    <div>
                      <span className="text-muted-foreground mr-1">{t('statusChangeDialog.phoneLabel')}</span>
                      <span className="font-medium">{customer.phone}</span>
                    </div>
                  )}
                  {customer.email && (
                    <div>
                      <span className="text-muted-foreground mr-1">{t('statusChangeDialog.emailLabel')}</span>
                      <span className="font-medium">{customer.email}</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="flex items-center gap-2 text-sm">
          <span>{t('statusChangeDialog.currentStatusLabel')}</span>
          <Badge className={getStatusBadgeClass(initialStatus)}>
            {formatReservationStatus(initialStatus)}
          </Badge>
        </div>

        {!canRevert ? (
          <div className="flex items-start gap-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <AlertTriangle className="h-5 w-5 mt-0.5 shrink-0" />
            <div>
              <p className="font-medium">{t('statusChangeDialog.notPickedUpTitle')}</p>
              <p className="text-amber-800/80 mt-1">
                {t('statusChangeDialog.notPickedUpHint')}
              </p>
            </div>
          </div>
        ) : !confirmed ? (
          <div className="rounded-md border bg-white p-3 text-sm space-y-2">
            <p className="font-medium">{t('statusChangeDialog.confirmTitle')}</p>
            <p className="text-muted-foreground">
              {t('statusChangeDialog.confirmHint')}
            </p>
          </div>
        ) : (
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900">
            <p className="font-medium">{t('statusChangeDialog.finalConfirmTitle')}</p>
            <p className="text-red-800/80 mt-1">
              <Trans
                i18nKey="statusChangeDialog.finalConfirmHint"
                ns="reservations"
                components={{ 1: <span className="font-semibold" /> }}
              />
            </p>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" type="button" onClick={() => handleClose(false)}>
            {t('statusChangeDialog.cancelButton')}
          </Button>
          {canRevert && !confirmed && (
            <Button
              type="button"
              variant="destructive"
              onClick={() => setConfirmed(true)}
              data-testid="button-revert-to-booked"
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              {t('statusChangeDialog.revertToBookedButton')}
            </Button>
          )}
          {canRevert && confirmed && (
            <Button
              type="button"
              variant="destructive"
              disabled={revertMutation.isPending}
              onClick={() => revertMutation.mutate()}
              data-testid="button-confirm-revert"
            >
              {revertMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('statusChangeDialog.revertingButton')}
                </>
              ) : (
                <>
                  <RotateCcw className="mr-2 h-4 w-4" />
                  {t('statusChangeDialog.confirmRevertButton')}
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
