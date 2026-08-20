import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiRequest, invalidateRelatedQueries } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Vehicle } from "@shared/schema";

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Loader2, Wrench } from "lucide-react";

const serviceVehicleSchema = z.object({
  maintenanceStatus: z.enum(["needs_service", "in_service"], {
    required_error: "Please select a maintenance status",
  }),
  maintenanceNote: z.string().optional(),
  serviceStartDate: z.string().optional(),
  serviceEndDate: z.string().optional(),
});

type ServiceVehicleFormData = z.infer<typeof serviceVehicleSchema>;

interface ServiceVehicleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reservationId: number;
  vehicle?: Vehicle;
  onSuccess?: () => void;
}

export function ServiceVehicleDialog({
  open,
  onOpenChange,
  reservationId,
  vehicle,
  onSuccess,
}: ServiceVehicleDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<ServiceVehicleFormData>({
    resolver: zodResolver(serviceVehicleSchema),
    defaultValues: {
      maintenanceStatus: "needs_service",
      maintenanceNote: "",
      serviceStartDate: "",
      serviceEndDate: "",
    },
  });

  const markForServiceMutation = useMutation({
    mutationFn: async (data: ServiceVehicleFormData) => {
      const response = await apiRequest("POST", `/api/reservations/${reservationId}/mark-needs-service`, {
        body: JSON.stringify(data),
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to mark vehicle for service");
      }

      return response.json();
    },
    onSuccess: () => {
      // Invalidate related queries to update UI state
      invalidateRelatedQueries('reservations', {
        id: reservationId,
        vehicleId: vehicle?.id
      });
      invalidateRelatedQueries('vehicles', { id: vehicle?.id });
      
      toast({
        title: "Vehicle marked for service",
        description: "The vehicle has been marked as needing service successfully.",
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

  const handleSubmit = (data: ServiceVehicleFormData) => {
    markForServiceMutation.mutate(data);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]" data-testid="dialog-service-vehicle">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wrench className="h-5 w-5" />
            Mark Vehicle for Service
          </DialogTitle>
          <DialogDescription>
            Mark {vehicle?.brand} {vehicle?.model} ({vehicle?.licensePlate}) as needing service or currently in service.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="maintenanceStatus"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Maintenance Status</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-maintenance-status">
                        <SelectValue placeholder="Select maintenance status" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="needs_service">Needs Service</SelectItem>
                      <SelectItem value="in_service">Currently In Service</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    Choose whether the vehicle needs service or is currently being serviced.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="maintenanceNote"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Service Notes</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Describe the service needed or being performed..."
                      {...field}
                      data-testid="textarea-maintenance-note"
                    />
                  </FormControl>
                  <FormDescription>
                    Optional notes about the service required or being performed.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="serviceStartDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Service Start Date</FormLabel>
                    <FormControl>
                      <Input
                        type="date"
                        {...field}
                        data-testid="input-service-start-date"
                      />
                    </FormControl>
                    <FormDescription>
                      When service begins (optional).
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="serviceEndDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Service End Date</FormLabel>
                    <FormControl>
                      <Input
                        type="date"
                        {...field}
                        data-testid="input-service-end-date"
                      />
                    </FormControl>
                    <FormDescription>
                      Expected service completion (optional).
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={markForServiceMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={markForServiceMutation.isPending}
                data-testid="button-submit-service"
              >
                {markForServiceMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Marking...
                  </>
                ) : (
                  "Mark for Service"
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}