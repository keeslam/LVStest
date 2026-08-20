import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
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
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest , invalidateByPrefix } from "@/lib/queryClient";
import { AlertTriangle, Edit2, Save, X } from "lucide-react";
import type { Vehicle } from "@shared/schema";

interface VehicleRemarksWarningDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vehicle: Vehicle | null;
  onAcknowledge: () => void;
  onCancel?: () => void;
  context?: "reservation" | "pickup" | "view";
  onRemarksUpdated?: (updatedVehicle: Vehicle) => void;
}

export function VehicleRemarksWarningDialog({
  open,
  onOpenChange,
  vehicle,
  onAcknowledge,
  onCancel,
  context = "view",
  onRemarksUpdated,
}: VehicleRemarksWarningDialogProps) {
  const { toast } = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const [editedRemarks, setEditedRemarks] = useState("");

  useEffect(() => {
    if (vehicle?.remarks) {
      setEditedRemarks(vehicle.remarks);
    }
  }, [vehicle?.remarks]);

  useEffect(() => {
    if (!open) {
      setIsEditing(false);
    }
  }, [open]);

  const updateRemarksMutation = useMutation({
    mutationFn: async (remarks: string) => {
      if (!vehicle) throw new Error("No vehicle selected");
      const response = await apiRequest("PATCH", `/api/vehicles/${vehicle.id}`, { remarks });
      return response.json();
    },
    onSuccess: (updatedVehicle: Vehicle) => {
      toast({
        title: "Remarks Updated",
        description: "Vehicle remarks have been saved.",
      });
      invalidateByPrefix("/api/vehicles");
      invalidateByPrefix(`/api/vehicles/${vehicle?.id}`);
      setIsEditing(false);
      
      // Notify parent component of the update
      if (onRemarksUpdated && updatedVehicle) {
        onRemarksUpdated(updatedVehicle);
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update remarks",
        variant: "destructive",
      });
    },
  });

  const handleSaveRemarks = () => {
    updateRemarksMutation.mutate(editedRemarks);
  };

  const handleAcknowledge = () => {
    onAcknowledge();
    onOpenChange(false);
  };

  const handleCancel = () => {
    if (onCancel) {
      onCancel();
    }
    onOpenChange(false);
  };

  if (!vehicle) return null;

  const getContextMessage = () => {
    switch (context) {
      case "reservation":
        return "Please review the following remarks before creating this reservation:";
      case "pickup":
        return "IMPORTANT: Review these remarks before the vehicle goes out:";
      case "view":
      default:
        return "This vehicle has the following remarks:";
    }
  };

  const getTitle = () => {
    switch (context) {
      case "pickup":
        return "Vehicle Remarks - Pickup Warning";
      default:
        return "Vehicle Remarks Warning";
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-amber-600">
            <AlertTriangle className="h-5 w-5" />
            {getTitle()}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-base">
            <div className="space-y-3">
              <p className="font-medium text-foreground">
                {vehicle.brand} {vehicle.model} - {vehicle.licensePlate}
              </p>
              <p>{getContextMessage()}</p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="my-4">
          {isEditing ? (
            <div className="space-y-3">
              <Textarea
                value={editedRemarks}
                onChange={(e) => setEditedRemarks(e.target.value)}
                placeholder="Enter vehicle remarks..."
                className="min-h-[120px]"
                data-testid="textarea-edit-remarks"
              />
              <div className="flex gap-2 justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setIsEditing(false);
                    setEditedRemarks(vehicle.remarks || "");
                  }}
                  data-testid="button-cancel-edit-remarks"
                >
                  <X className="h-4 w-4 mr-1" />
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleSaveRemarks}
                  disabled={updateRemarksMutation.isPending}
                  data-testid="button-save-remarks"
                >
                  <Save className="h-4 w-4 mr-1" />
                  {updateRemarksMutation.isPending ? "Saving..." : "Save"}
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <p className="text-amber-900 whitespace-pre-wrap" data-testid="text-vehicle-remarks">
                  {vehicle.remarks || "No remarks"}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsEditing(true)}
                className="w-full"
                data-testid="button-edit-remarks"
              >
                <Edit2 className="h-4 w-4 mr-2" />
                Edit Remarks
              </Button>
            </div>
          )}
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel onClick={handleCancel} data-testid="button-cancel-remarks-warning">
            {context === "view" ? "Close" : "Cancel"}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleAcknowledge}
            className="bg-amber-600 hover:bg-amber-700"
            data-testid="button-acknowledge-remarks"
          >
            {context === "view" ? "I Understand" : "I Acknowledge & Proceed"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
