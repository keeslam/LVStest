import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest , invalidateByPrefix } from "@/lib/queryClient";
import { formatLicensePlate } from "@/lib/format-utils";

interface VehicleDeleteDialogProps {
  vehicleId: number;
  vehicleBrand: string;
  vehicleModel: string;
  vehicleLicensePlate: string;
  children?: React.ReactNode;
  onSuccess?: () => void;
  /**
   * Optional controlled mode. When `open`/`onOpenChange` are provided the
   * dialog renders without its own trigger and its open state is owned by the
   * parent (e.g. page-level state that survives table re-renders).
   */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function VehicleDeleteDialog({ 
  vehicleId, 
  vehicleBrand,
  vehicleModel,
  vehicleLicensePlate,
  children, 
  onSuccess,
  open: controlledOpen,
  onOpenChange,
}: VehicleDeleteDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen = (next: boolean) => {
    if (isControlled) {
      onOpenChange?.(next);
    } else {
      setInternalOpen(next);
    }
  };
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const deleteVehicleMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('DELETE', `/api/vehicles/${vehicleId}`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to delete vehicle');
      }
      
      // Handle 204 No Content or empty responses
      if (response.status === 204) {
        return null;
      }
      
      // Try to parse JSON, but handle empty responses gracefully
      try {
        return await response.json();
      } catch {
        return null;
      }
    },
    onSuccess: () => {
      // Refresh the vehicles list
      invalidateByPrefix("/api/vehicles");
      
      toast({
        title: "Vehicle deleted",
        description: `${vehicleBrand} ${vehicleModel} has been successfully deleted.`,
        variant: "default"
      });

      setOpen(false);
      
      if (onSuccess) {
        onSuccess();
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete vehicle",
        variant: "destructive"
      });
    }
  });

  const handleDelete = () => {
    deleteVehicleMutation.mutate();
  };

  // Custom trigger or default delete button
  const trigger = children || (
    <Button 
      variant="ghost" 
      size="sm" 
      className="text-red-500"
      data-testid={`button-delete-vehicle-${vehicleId}`}
    >
      <Trash2 className="h-4 w-4" />
    </Button>
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!isControlled && (
        <DialogTrigger asChild>
          {trigger}
        </DialogTrigger>
      )}
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Delete Vehicle</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete <strong>{vehicleBrand} {vehicleModel}</strong> with license plate <strong>{formatLicensePlate(vehicleLicensePlate)}</strong>? 
            This action cannot be undone and will remove all vehicle data and associated reservations.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex gap-2">
          <Button 
            variant="outline" 
            onClick={() => setOpen(false)}
            disabled={deleteVehicleMutation.isPending}
          >
            Cancel
          </Button>
          <Button 
            variant="destructive" 
            onClick={handleDelete}
            disabled={deleteVehicleMutation.isPending}
            data-testid={`button-confirm-delete-${vehicleId}`}
          >
            {deleteVehicleMutation.isPending ? "Deleting..." : "Delete Vehicle"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}