import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiRequest, invalidateRelatedQueries , invalidateByPrefix } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Reservation, Vehicle } from "@shared/schema";
import { formatLicensePlate } from "@/lib/format-utils";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { VehicleSelector } from "@/components/ui/vehicle-selector";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Car, AlertTriangle } from "lucide-react";

const spareVehicleSchema = z.object({
  spareVehicleId: z.string().min(1, "Please select a spare vehicle"),
  startDate: z.string().min(1, "Start date is required"),
  endDate: z.string().optional(),
});

type SpareVehicleFormData = z.infer<typeof spareVehicleSchema>;

interface SpareVehicleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  originalReservation?: Reservation;
  onSuccess?: () => void;
}

export function SpareVehicleDialog({
  open,
  onOpenChange,
  originalReservation,
  onSuccess,
}: SpareVehicleDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<SpareVehicleFormData>({
    resolver: zodResolver(spareVehicleSchema),
    defaultValues: {
      spareVehicleId: "",
      startDate: "",
      endDate: "",
    },
  });

  // Set default dates when reservation changes
  useEffect(() => {
    if (originalReservation && open) {
      form.setValue("startDate", originalReservation.startDate);
      form.setValue("endDate", originalReservation.endDate || "");
    }
  }, [originalReservation, open, form]);

  // Fetch available spare vehicles
  const { data: availableVehicles, isLoading: isLoadingVehicles } = useQuery<Vehicle[]>({
    queryKey: [
      "/api/spare-vehicles/available",
      form.watch("startDate"),
      form.watch("endDate"),
      originalReservation?.vehicleId,
    ],
    queryFn: async () => {
      const startDate = form.getValues("startDate");
      const endDate = form.getValues("endDate");
      
      if (!startDate) return [];
      
      // Backend requires both startDate and endDate - use startDate as endDate if not provided for single-day availability
      const effectiveEndDate = endDate || startDate;
      
      const params = new URLSearchParams({
        startDate,
        endDate: effectiveEndDate,
        excludeVehicleId: originalReservation?.vehicleId?.toString() || "",
      });
      
      const response = await fetch(`/api/spare-vehicles/available?${params}`);
      if (!response.ok) {
        throw new Error("Failed to fetch available vehicles");
      }
      return response.json();
    },
    enabled: !!originalReservation && open && !!form.watch("startDate"),
  });

  const assignSpareMutation = useMutation({
    mutationFn: async (data: SpareVehicleFormData) => {
      const response = await apiRequest("POST", `/api/reservations/${originalReservation?.id}/assign-spare`, {
        body: JSON.stringify({
          spareVehicleId: parseInt(data.spareVehicleId),
          startDate: data.startDate,
          endDate: data.endDate || undefined,
        }),
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to assign spare vehicle");
      }

      return response.json();
    },
    onSuccess: () => {
      // Invalidate related queries to update UI state
      if (originalReservation) {
        invalidateRelatedQueries('reservations', {
          id: originalReservation.id,
          vehicleId: originalReservation.vehicleId
        });
        invalidateRelatedQueries('vehicles', { id: originalReservation.vehicleId });
      }
      
      // Also invalidate placeholder reservations and custom notifications
      // so the notification center updates properly
      invalidateByPrefix("/api/placeholder-reservations/needing-assignment");
      invalidateByPrefix("/api/custom-notifications");
      
      toast({
        title: "Spare vehicle assigned",
        description: "The spare vehicle has been assigned successfully.",
      });
      onSuccess?.();
      form.reset();
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (data: SpareVehicleFormData) => {
    assignSpareMutation.mutate(data);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]" data-testid="dialog-spare-vehicle">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Car className="h-5 w-5" />
            Assign Spare Vehicle
          </DialogTitle>
          <DialogDescription>
            Assign a spare vehicle to continue serving the customer while the original vehicle is in service.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="startDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Start Date</FormLabel>
                    <FormControl>
                      <Input
                        type="date"
                        {...field}
                        data-testid="input-replacement-start-date"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="endDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>End Date</FormLabel>
                    <FormControl>
                      <Input
                        type="date"
                        {...field}
                        data-testid="input-replacement-end-date"
                      />
                    </FormControl>
                    <FormDescription>
                      Leave empty for open-ended replacement.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="spareVehicleId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Available Spare Vehicles</FormLabel>
                  <FormControl>
                    <VehicleSelector
                      vehicles={availableVehicles || []}
                      value={field.value}
                      onChange={field.onChange}
                      placeholder="Select a spare vehicle"
                      disabled={isLoadingVehicles || !availableVehicles || availableVehicles.length === 0}
                      className="w-full"
                    />
                  </FormControl>
                  <FormDescription>
                    Only vehicles available during the replacement period are shown.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {availableVehicles && availableVehicles.length === 0 && form.watch("startDate") && (
              <div className="p-3 border border-yellow-200 bg-yellow-50 rounded-md">
                <div className="flex items-center gap-2 text-yellow-800">
                  <AlertTriangle className="h-4 w-4" />
                  <p className="text-sm font-medium">No vehicles available</p>
                </div>
                <p className="text-xs text-yellow-700 mt-1">
                  Try adjusting the replacement dates or check if there are other available vehicles.
                </p>
              </div>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={assignSpareMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={
                  assignSpareMutation.isPending ||
                  !availableVehicles ||
                  availableVehicles.length === 0
                }
                data-testid="button-submit-spare"
              >
                {assignSpareMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Assigning...
                  </>
                ) : (
                  "Assign Spare Vehicle"
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}