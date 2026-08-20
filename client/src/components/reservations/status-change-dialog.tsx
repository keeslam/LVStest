import { useState } from "react";
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
    licensePlate?: string;
    currentMileage?: number;
    departureMileage?: number;
    returnMileage?: number;
  };
  customer?: {
    id: number;
    name?: string;
    firstName?: string;
    lastName?: string;
    companyName?: string;
    phone?: string;
    email?: string;
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

const formatDisplayLicensePlate = (licensePlate?: string) => {
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
        title: "Reservation reverted",
        description: "The reservation is back to Booked. Pickup data was cleared.",
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
        title: "Revert failed",
        description: error?.message || "Could not revert the reservation status.",
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
          <DialogTitle>Revert Reservation to Booked</DialogTitle>
          <DialogDescription>
            This will undo the pickup and put the reservation back to the Booked state.
          </DialogDescription>
        </DialogHeader>

        {(vehicle || customer) && (
          <div className="bg-muted/50 rounded-md p-3 space-y-2">
            {vehicle && (
              <div className="space-y-1">
                <h3 className="font-medium text-sm">Vehicle</h3>
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
                  <div>
                    <span className="text-muted-foreground mr-1">License:</span>
                    <span className="font-medium">
                      {formatDisplayLicensePlate(vehicle.licensePlate)}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground mr-1">Vehicle:</span>
                    <span className="font-medium">
                      {vehicle.brand} {vehicle.model}
                    </span>
                  </div>
                  {pickupMileage !== undefined && pickupMileage !== null && (
                    <div>
                      <span className="text-muted-foreground mr-1">At pickup:</span>
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
                <h3 className="font-medium text-sm">Customer</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-1 text-sm">
                  {(customer.name || customer.firstName || customer.lastName) && (
                    <div>
                      <span className="text-muted-foreground mr-1">Name:</span>
                      <span className="font-medium">
                        {customer.name ||
                          [customer.firstName, customer.lastName].filter(Boolean).join(" ")}
                      </span>
                    </div>
                  )}
                  {customer.companyName && (
                    <div>
                      <span className="text-muted-foreground mr-1">Company:</span>
                      <span className="font-medium">{customer.companyName}</span>
                    </div>
                  )}
                  {customer.phone && (
                    <div>
                      <span className="text-muted-foreground mr-1">Phone:</span>
                      <span className="font-medium">{customer.phone}</span>
                    </div>
                  )}
                  {customer.email && (
                    <div>
                      <span className="text-muted-foreground mr-1">Email:</span>
                      <span className="font-medium">{customer.email}</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="flex items-center gap-2 text-sm">
          <span>Current status:</span>
          <Badge className={getStatusBadgeClass(initialStatus)}>
            {formatReservationStatus(initialStatus)}
          </Badge>
        </div>

        {!canRevert ? (
          <div className="flex items-start gap-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <AlertTriangle className="h-5 w-5 mt-0.5 shrink-0" />
            <div>
              <p className="font-medium">This action is only available for picked-up reservations.</p>
              <p className="text-amber-800/80 mt-1">
                You can only revert a reservation that is currently in the Picked Up state.
              </p>
            </div>
          </div>
        ) : !confirmed ? (
          <div className="rounded-md border bg-white p-3 text-sm space-y-2">
            <p className="font-medium">Are you sure you want to revert this reservation back to Booked?</p>
            <p className="text-muted-foreground">
              The contract number, pickup mileage and fuel level at pickup will be cleared. The
              actual pickup date will also be removed. This cannot be undone.
            </p>
          </div>
        ) : (
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900">
            <p className="font-medium">Please confirm one more time.</p>
            <p className="text-red-800/80 mt-1">
              Clicking <span className="font-semibold">Yes, revert</span> will immediately undo
              the pickup.
            </p>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" type="button" onClick={() => handleClose(false)}>
            Cancel
          </Button>
          {canRevert && !confirmed && (
            <Button
              type="button"
              variant="destructive"
              onClick={() => setConfirmed(true)}
              data-testid="button-revert-to-booked"
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              Revert to Booked
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
                  Reverting...
                </>
              ) : (
                <>
                  <RotateCcw className="mr-2 h-4 w-4" />
                  Yes, revert
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
