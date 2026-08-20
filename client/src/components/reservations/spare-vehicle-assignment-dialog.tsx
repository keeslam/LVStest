import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest, invalidateRelatedQueries , invalidateByPrefix } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
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
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Car, Calendar, User, Wrench } from "lucide-react";
import { formatDate, formatLicensePlate } from "@/lib/format-utils";
import { Reservation, Vehicle } from "@shared/schema";
import { VehicleSelector } from "@/components/ui/vehicle-selector";

// Form schema for vehicle assignments
const assignmentSchema = z.object({
  assignments: z.array(z.object({
    placeholderReservationId: z.number(),
    vehicleId: z.number().min(1, "Please select a vehicle"),
  })).min(1, "At least one assignment is required"),
});

type AssignmentFormType = z.infer<typeof assignmentSchema>;

interface SpareVehicleAssignmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  maintenanceId?: number;
  // Optional pre-filtered placeholder reservations
  placeholderReservations?: Reservation[];
}

export function SpareVehicleAssignmentDialog({
  open,
  onOpenChange,
  maintenanceId,
  placeholderReservations: providedPlaceholders
}: SpareVehicleAssignmentDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch placeholder reservations if not provided
  const { data: fetchedPlaceholders, isLoading: isLoadingPlaceholders } = useQuery({
    queryKey: ['placeholder-reservations', maintenanceId],
    queryFn: async () => {
      const response = await fetch('/api/placeholder-reservations');
      if (!response.ok) throw new Error('Failed to fetch placeholder reservations');
      return response.json();
    },
    enabled: false, // Disabled for now - callers should provide placeholderReservations directly
  });

  // Use provided placeholders or fetched ones
  const placeholderReservations = providedPlaceholders || fetchedPlaceholders || [];

  // Use provided placeholders directly (they're already filtered by context)
  const filteredPlaceholders = placeholderReservations;

  // Fetch original reservations to get vehicle info being replaced
  const originalReservationIds = filteredPlaceholders
    .map((p: Reservation) => p.replacementForReservationId)
    .filter(Boolean);
  
  const { data: originalReservations = [] } = useQuery<Reservation[]>({
    queryKey: ['/api/reservations'],
    enabled: open && originalReservationIds.length > 0,
  });

  // Create a map of original reservations by ID for quick lookup
  const originalReservationsMap = new Map(
    originalReservations
      .filter((r: Reservation) => originalReservationIds.includes(r.id))
      .map((r: Reservation) => [r.id, r])
  );

  // Get date range for availability checking
  const dateRange = filteredPlaceholders.length > 0 ? {
    startDate: Math.min(...filteredPlaceholders.map((res: Reservation) => new Date(res.startDate).getTime())),
    endDate: Math.max(...filteredPlaceholders.map((res: Reservation) => new Date(res.endDate || res.startDate).getTime()))
  } : null;

  // Fetch available vehicles for the date range
  const { data: availableVehicles, isLoading: isLoadingVehicles } = useQuery({
    queryKey: ['vehicles', 'available', dateRange?.startDate, dateRange?.endDate],
    queryFn: async () => {
      if (!dateRange) return [];
      
      const startDate = new Date(dateRange.startDate).toISOString().split('T')[0];
      const endDate = new Date(dateRange.endDate).toISOString().split('T')[0];
      
      const response = await fetch(`/api/vehicles/available?startDate=${startDate}&endDate=${endDate}`);
      if (!response.ok) throw new Error('Failed to fetch available vehicles');
      return response.json();
    },
    enabled: open && !!dateRange,
  });

  // Form setup
  const form = useForm<AssignmentFormType>({
    resolver: zodResolver(assignmentSchema),
    defaultValues: {
      assignments: filteredPlaceholders.map((res: Reservation) => ({
        placeholderReservationId: res.id,
        vehicleId: 0,
      })),
    },
  });

  // Reset form only when the actual set of placeholders changes (compared by
  // ID), not when a background refetch produces a new array reference —
  // otherwise the user's in-progress vehicle selections would be wiped.
  const placeholderIdsKey = filteredPlaceholders
    .map((res: Reservation) => res.id)
    .join(",");
  useEffect(() => {
    if (filteredPlaceholders.length > 0) {
      form.reset({
        assignments: filteredPlaceholders.map((res: Reservation) => ({
          placeholderReservationId: res.id,
          vehicleId: 0,
        })),
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placeholderIdsKey, form]);

  // Assignment mutation
  const assignVehiclesMutation = useMutation({
    mutationFn: async (data: AssignmentFormType) => {
      const results = [];
      
      for (const assignment of data.assignments) {
        const response = await apiRequest('POST', `/api/placeholder-reservations/${assignment.placeholderReservationId}/assign-vehicle`, {
          vehicleId: assignment.vehicleId,
        });
        
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.message || `Failed to assign vehicle for reservation ${assignment.placeholderReservationId}`);
        }
        
        results.push(await response.json());
      }
      
      return results;
    },
    onSuccess: async () => {
      toast({
        title: "Vehicles assigned successfully",
        description: `${filteredPlaceholders.length} spare vehicle(s) have been assigned.`,
      });

      // Invalidate related queries
      await invalidateRelatedQueries('reservations');
      await invalidateRelatedQueries('placeholder-reservations');
      await invalidateRelatedQueries('vehicles');
      
      // Also invalidate specific calendar query keys
      invalidateByPrefix('/api/reservations/range');

      // Close dialog
      onOpenChange(false);
      form.reset();
    },
    onError: (error: Error) => {
      toast({
        title: "Assignment failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: AssignmentFormType) => {
    // Filter out assignments with no vehicle selected
    const validAssignments = data.assignments.filter(a => a.vehicleId > 0);
    
    if (validAssignments.length === 0) {
      toast({
        title: "No vehicles selected",
        description: "Please select at least one vehicle to assign.",
        variant: "destructive",
      });
      return;
    }

    assignVehiclesMutation.mutate({ assignments: validAssignments });
  };

  const isLoading = isLoadingPlaceholders || isLoadingVehicles;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Assign Spare Vehicles</DialogTitle>
          <DialogDescription>
            Select available vehicles to assign to placeholder spare vehicle reservations.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin mr-2" />
            Loading placeholder reservations and available vehicles...
          </div>
        ) : filteredPlaceholders.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            No placeholder spare vehicle reservations found.
          </div>
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="space-y-4">
                {filteredPlaceholders.map((placeholder: Reservation, index: number) => {
                  const originalReservation = placeholder.replacementForReservationId 
                    ? originalReservationsMap.get(placeholder.replacementForReservationId)
                    : null;
                  
                  return (
                    <Card key={placeholder.id} className="border-orange-200">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-4">
                          {/* Placeholder Info */}
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <Badge className="bg-orange-100 text-orange-800">
                                TBD Spare #{placeholder.id}
                              </Badge>
                              {placeholder.replacementForReservationId && (
                                <Badge variant="outline">
                                  For Reservation #{placeholder.replacementForReservationId}
                                </Badge>
                              )}
                              {originalReservation?.vehicle && (
                                <Badge className="bg-blue-100 text-blue-800 border border-blue-300">
                                  <Wrench className="h-3 w-3 mr-1" />
                                  Replacing: {formatLicensePlate(originalReservation.vehicle.licensePlate)} {originalReservation.vehicle.brand} {originalReservation.vehicle.model}
                                </Badge>
                              )}
                            </div>
                            
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                            {/* Customer Info */}
                            <div className="flex items-center gap-2">
                              <User className="h-4 w-4 text-gray-500" />
                              <div>
                                <div className="font-medium">{placeholder.customer?.name || 'Unknown Customer'}</div>
                                <div className="text-gray-600">{placeholder.customer?.phone || placeholder.customer?.email}</div>
                              </div>
                            </div>
                            
                            {/* Date Range */}
                            <div className="flex items-center gap-2">
                              <Calendar className="h-4 w-4 text-gray-500" />
                              <div>
                                <div className="font-medium">Assignment Period</div>
                                <div className="text-gray-600">
                                  {formatDate(placeholder.startDate)} - {formatDate(placeholder.endDate || placeholder.startDate)}
                                </div>
                              </div>
                            </div>
                            
                            {/* Status */}
                            <div className="flex items-center gap-2">
                              <Car className="h-4 w-4 text-gray-500" />
                              <div>
                                <div className="font-medium">Status</div>
                                <div className="text-orange-600">Awaiting Assignment</div>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Vehicle Selection */}
                        <div className="flex-shrink-0 w-full md:w-80">
                          <FormField
                            control={form.control}
                            name={`assignments.${index}.vehicleId`}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Select Vehicle</FormLabel>
                                <FormControl>
                                  <VehicleSelector
                                    vehicles={availableVehicles || []}
                                    value={field.value > 0 ? field.value.toString() : ""}
                                    onChange={(value) => field.onChange(value ? parseInt(value) : 0)}
                                    placeholder="Choose vehicle..."
                                    disabled={assignVehiclesMutation.isPending}
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  );
                })}
              </div>

              <DialogFooter>
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => onOpenChange(false)}
                  disabled={assignVehiclesMutation.isPending}
                >
                  Cancel
                </Button>
                <Button 
                  type="submit" 
                  disabled={assignVehiclesMutation.isPending}
                  data-testid="button-assign-vehicles"
                >
                  {assignVehiclesMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Assigning...
                    </>
                  ) : (
                    `Assign ${filteredPlaceholders.length} Vehicle(s)`
                  )}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  );
}