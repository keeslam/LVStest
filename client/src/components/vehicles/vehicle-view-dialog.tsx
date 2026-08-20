import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { VehicleDetails } from "@/components/vehicles/vehicle-details";
import { Vehicle } from "@shared/schema";
import { Loader2, Car } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { formatLicensePlate } from "@/lib/format-utils";

interface VehicleViewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vehicleId: number | null;
}

export function VehicleViewDialog({
  open,
  onOpenChange,
  vehicleId
}: VehicleViewDialogProps) {
  // Fetch vehicle data for the dialog title
  const { data: vehicle, isLoading, error } = useQuery<Vehicle>({
    queryKey: [`/api/vehicles/${vehicleId}`],
    enabled: open && vehicleId !== null,
  });

  // Always render the Dialog component to prevent unmounting issues
  // The open prop controls visibility
  return (
    <Dialog open={open && vehicleId !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Car className="h-5 w-5 text-blue-500" />
            {isLoading ? (
              <span className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading Vehicle Details...
              </span>
            ) : error ? (
              "Vehicle Details"
            ) : vehicle ? (
              `Vehicle Details - ${vehicle.brand} ${vehicle.model} (${vehicle.licensePlate ? formatLicensePlate(vehicle.licensePlate) : 'No License Plate'})`
            ) : (
              "Vehicle Details"
            )}
          </DialogTitle>
          <DialogDescription>
            View complete vehicle information, reservations, expenses, and documents
          </DialogDescription>
        </DialogHeader>
        
        <div className="flex-1 overflow-auto">
          {isLoading ? (
            <div className="flex justify-center items-center py-12">
              <div className="flex items-center gap-2">
                <Loader2 className="h-6 w-6 animate-spin" />
                <span>Loading vehicle details...</span>
              </div>
            </div>
          ) : error ? (
            <Alert className="bg-red-50 border-red-200">
              <AlertDescription className="text-red-700">
                Failed to load vehicle details. Please try again.
              </AlertDescription>
            </Alert>
          ) : vehicleId ? (
            <VehicleDetails 
              vehicleId={vehicleId} 
              inDialogContext={true}
              onClose={() => onOpenChange(false)}
            />
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}