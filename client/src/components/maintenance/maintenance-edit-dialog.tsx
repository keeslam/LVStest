import { useState, useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { apiRequest , invalidateByPrefix } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { insertReservationSchema } from "@shared/schema";
import { 
  Form, 
  FormControl, 
  FormDescription, 
  FormField, 
  FormItem, 
  FormLabel, 
  FormMessage 
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { format, addDays, parseISO } from "date-fns";
import { Reservation, Vehicle, Customer, Driver } from "@shared/schema";
import { Loader2, User, Car as CarIcon, Phone } from "lucide-react";
import { Badge } from "@/components/ui/badge";

// Form schema for maintenance editing - only fields that can be edited
const maintenanceEditSchema = z.object({
  vehicleId: z.union([
    z.number().min(1, "Please select a vehicle"),
    z.string().min(1, "Please select a vehicle").transform(val => parseInt(val)),
  ]),
  customerId: z.string().optional(), // Optional customer
  contactPhone: z.string().optional(), // Phone number for person dropping off vehicle
  maintenanceType: z.enum([
    "breakdown",
    "tire_replacement",
    "brake_service",
    "engine_repair",
    "transmission_repair",
    "electrical_issue",
    "air_conditioning",
    "battery_replacement",
    "oil_change",
    "regular_maintenance",
    "apk_inspection",
    "warranty_service",
    "accident_damage",
    "other"
  ]),
  description: z.string().optional(), // Description/details of the maintenance
  startDate: z.string().min(1, "Date when vehicle comes in is required"),
  maintenanceDuration: z.number().min(1, "Duration must be at least 1 day").max(90, "Duration cannot exceed 90 days"),
  maintenanceStatus: z.enum(["scheduled", "in", "out"]).default("scheduled"),
  notes: z.string().optional(), // Additional notes
});

type MaintenanceEditFormType = z.infer<typeof maintenanceEditSchema>;

// Spare vehicle assignment state
type SpareVehicleAssignment = {
  reservationId: number;
  spareVehicleId: number;
};

interface MaintenanceEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reservation: Reservation | null;
}

export function MaintenanceEditDialog({
  open,
  onOpenChange,
  reservation
}: MaintenanceEditDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Fetch vehicles for the selector
  const { data: vehicles = [] } = useQuery<Vehicle[]>({
    queryKey: ["/api/vehicles"],
  });

  // Fetch customers for optional selection
  const { data: customers = [] } = useQuery<any[]>({
    queryKey: ['/api/customers'],
    enabled: open,
  });

  // For maintenance blocks, fetch active rentals for the vehicle to find the customer
  const { data: vehicleReservations } = useQuery<Reservation[]>({
    queryKey: [`/api/reservations/vehicle/${reservation?.vehicleId}`],
    enabled: !!reservation?.vehicleId && reservation?.type === 'maintenance_block' && open,
  });

  // Find active rental for this vehicle (for maintenance blocks)
  const activeRental = (() => {
    if (reservation?.type !== 'maintenance_block' || !vehicleReservations) return null;
    
    const now = new Date();
    
    return vehicleReservations.find(r => {
      if (r.type !== 'standard') return false;
      if (r.status !== 'booked' && r.status !== 'picked_up') return false;
      
      const startDate = parseISO(r.startDate);
      
      // Check if rental is currently active
      if (!r.endDate) {
        // Open-ended rental - check if started
        return startDate <= now;
      } else {
        // Has end date - check if we're within the rental period
        const endDate = parseISO(r.endDate);
        return startDate <= now && now <= endDate;
      }
    }) || null;
  })();

  // Fetch the customer from active rental (for maintenance blocks)
  const { data: rentalCustomer } = useQuery<Customer>({
    queryKey: [`/api/customers/${activeRental?.customerId}`],
    enabled: !!activeRental?.customerId && open,
  });

  // Fetch the driver from active rental (for maintenance blocks)
  const { data: rentalDriver } = useQuery<Driver>({
    queryKey: [`/api/drivers/${activeRental?.driverId}`],
    enabled: !!activeRental?.driverId && open,
  });

  // Parse the maintenance notes to extract structured data
  const parseMaintenanceNotes = (notes: string) => {
    const lines = notes.split('\n');
    const maintenanceType = lines[0]?.split(': ')[0] || '';
    const description = lines[0]?.split(': ')[1] || '';
    const additionalNotes = lines.slice(1).join('\n');
    
    return {
      maintenanceType,
      description,
      notes: additionalNotes
    };
  };

  // Parse maintenance notes for initial values
  const parsed = reservation ? parseMaintenanceNotes(reservation.notes || '') : { maintenanceType: '', description: '', notes: '' };

  // Initialize form with reservation data
  const form = useForm<MaintenanceEditFormType>({
    resolver: zodResolver(maintenanceEditSchema),
    defaultValues: {
      vehicleId: reservation?.vehicleId || undefined,
      customerId: reservation?.customerId?.toString() || "none",
      maintenanceType: (parsed.maintenanceType as any) || "other",
      description: parsed.description || "",
      startDate: reservation?.startDate || "",
      maintenanceDuration: reservation?.maintenanceDuration || 
        (reservation?.startDate && reservation?.endDate ? 
          Math.max(1, Math.ceil((new Date(reservation.endDate).getTime() - new Date(reservation.startDate).getTime()) / (1000 * 60 * 60 * 24)) + 1) : 1),
      maintenanceStatus: (reservation?.maintenanceStatus === "in" || reservation?.maintenanceStatus === "out") ? reservation.maintenanceStatus : "scheduled",
      notes: parsed.notes || "",
    },
  });

  // Watch form values for real-time overlap computation  
  const formVehicleId = form.watch("vehicleId");
  const formStartDate = form.watch("startDate");
  const formDuration = form.watch("maintenanceDuration");
  
  // Calculate end date from start date + duration
  const calculateEndDate = (startDate: string, duration: number) => {
    if (!startDate || !duration) return startDate;
    const start = new Date(startDate);
    const end = new Date(start);
    end.setDate(end.getDate() + duration - 1); // -1 because start day counts as day 1
    return end.toISOString().split('T')[0];
  };
  
  const formEndDate = formStartDate && formDuration ? calculateEndDate(formStartDate, formDuration) : "";
  
  // Use form values for overlap computation, fall back to reservation values
  const currentVehicleId = formVehicleId || reservation?.vehicleId;
  const currentStartDate = formStartDate || reservation?.startDate;
  const currentEndDate = formEndDate || (reservation?.startDate && reservation?.maintenanceDuration ? 
    calculateEndDate(reservation.startDate, reservation.maintenanceDuration) : reservation?.endDate) || "";

  // Fetch available spare vehicles for the maintenance period
  const { data: availableVehicles = [] } = useQuery<Vehicle[]>({
    queryKey: ["/api/vehicles/available", currentStartDate, currentEndDate],
    queryFn: () => {
      const params = new URLSearchParams();
      if (currentStartDate) params.set('startDate', currentStartDate);
      if (currentEndDate) params.set('endDate', currentEndDate);
      return fetch(`/api/vehicles/available?${params.toString()}`).then(res => res.json());
    },
    enabled: !!(currentStartDate && currentEndDate && open),
  });

  const { data: overlappingRentals = [], isLoading: isLoadingRentals } = useQuery<{
    reservation: { id: number; startDate: string; endDate: string; status: string; type: string };
    customer: { name: string; firstName?: string; lastName?: string; email?: string; phone?: string };
  }[]>({
    queryKey: ["/api/vehicles", currentVehicleId, "overlaps", currentStartDate, currentEndDate],
    queryFn: () => fetch(`/api/vehicles/${currentVehicleId}/overlaps?startDate=${currentStartDate}&endDate=${currentEndDate}`).then(res => res.json()),
    enabled: !!(currentVehicleId && currentStartDate && currentEndDate && open),
  });

  // Reset form when the dialog opens or the reservation being edited changes.
  // Also allows a follow-up reset when related queries (overlapping rentals,
  // customers) finish loading — but only while the form is still pristine, so
  // background refetches never wipe unsaved user edits.
  const lastResetKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!open) {
      lastResetKeyRef.current = null;
      return;
    }
    if (reservation) {
      const resetKey = String(reservation.id);
      if (lastResetKeyRef.current === resetKey && form.formState.isDirty) {
        return;
      }
      lastResetKeyRef.current = resetKey;
      const parsed = parseMaintenanceNotes(reservation.notes || '');
      const duration = reservation.maintenanceDuration || 
        (reservation.startDate && reservation.endDate ? 
          Math.max(1, Math.ceil((new Date(reservation.endDate).getTime() - new Date(reservation.startDate).getTime()) / (1000 * 60 * 60 * 24)) + 1) : 1);
      
      // Extract contact phone from notes if it exists
      const contactPhoneMatch = (reservation.notes || '').match(/Contact Phone:\s*(.+?)(?:\n|$)/);
      let existingContactPhone = contactPhoneMatch ? contactPhoneMatch[1].trim() : "";
      
      // If no customer is assigned but there's an active rental, auto-select that customer
      let customerIdToSet = reservation.customerId?.toString() || "none";
      let contactPhoneToSet = existingContactPhone;
      
      // Check if there are overlapping rentals and no customer is currently assigned
      if ((!reservation.customerId || reservation.customerId === null) && overlappingRentals.length > 0 && !isLoadingRentals) {
        // Find the customer ID from the first overlapping rental
        const firstRentalCustomerEmail = overlappingRentals[0]?.customer?.email;
        const firstRentalCustomerPhone = overlappingRentals[0]?.customer?.phone;
        if (firstRentalCustomerEmail && customers.length > 0) {
          const matchingCustomer = customers.find((c: any) => 
            c.email?.toLowerCase() === firstRentalCustomerEmail.toLowerCase()
          );
          if (matchingCustomer) {
            customerIdToSet = matchingCustomer.id.toString();
            // Use existing contact phone if available, otherwise use customer's phone
            if (!contactPhoneToSet) {
              contactPhoneToSet = matchingCustomer.phone || firstRentalCustomerPhone || "";
            }
          }
        }
      } else if (customerIdToSet && customerIdToSet !== "none" && !contactPhoneToSet) {
        // If customer is already assigned and no contact phone exists, get their phone
        const customer = customers.find((c: any) => c.id.toString() === customerIdToSet);
        if (customer) {
          contactPhoneToSet = customer.phone || "";
        }
      }
      
      const parsedNotes = parseMaintenanceNotes(reservation.notes || '');
      form.reset({
        vehicleId: reservation.vehicleId || undefined,
        customerId: customerIdToSet,
        contactPhone: contactPhoneToSet,
        maintenanceType: (parsedNotes.maintenanceType as any) || "other",
        description: parsedNotes.description || "",
        startDate: reservation.startDate,
        maintenanceDuration: duration,
        maintenanceStatus: (reservation.maintenanceStatus === "in" || reservation.maintenanceStatus === "out") ? reservation.maintenanceStatus : "in",
        notes: parsedNotes.notes || "",
      });
    }
  }, [reservation, open, form, overlappingRentals, isLoadingRentals, customers]);

  // Update mutation - single source of truth approach
  const updateMutation = useMutation({
    mutationFn: async (data: MaintenanceEditFormType) => {
      if (!reservation) throw new Error("No reservation to update");
      
      // Calculate end date from start date + duration
      const endDate = calculateEndDate(data.startDate, data.maintenanceDuration);
      
      // Build notes with maintenance type, description, and contact phone
      let notesText = `${data.maintenanceType}: ${data.description || ''}`;
      
      if (data.notes) {
        notesText += `\n${data.notes}`;
      }
      
      if (data.contactPhone) {
        notesText += `\nContact Phone: ${data.contactPhone}`;
      }
      
      // Update the maintenance reservation directly (spare vehicle assignments are now managed in the view dialog)
      const response = await apiRequest("PATCH", `/api/reservations/${reservation.id}`, {
        vehicleId: data.vehicleId,
        customerId: (data.customerId && data.customerId !== "none") ? parseInt(data.customerId) : null,
        startDate: data.startDate,
        endDate: endDate,
        status: data.maintenanceStatus,
        type: "maintenance_block",
        notes: notesText,
        totalPrice: 0,
        maintenanceDuration: data.maintenanceDuration,
        maintenanceStatus: data.maintenanceStatus,
      });
      return await response.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Maintenance reservation updated successfully",
      });
      
      // Invalidate all reservation-related queries
      invalidateByPrefix("/api/reservations");
      invalidateByPrefix("/api/reservations/range");
      invalidateByPrefix("/api/reservations/upcoming");
      
      // Invalidate vehicle availability cache
      invalidateByPrefix("/api/vehicles/available");
      
      // Invalidate overlaps for both original and current form values
      const originalVehicleId = reservation?.vehicleId;
      const originalStartDate = reservation?.startDate;
      const originalEndDate = reservation?.endDate;
      
      // Invalidate original overlaps
      if (originalVehicleId) {
        invalidateByPrefix("/api/vehicles");
      }
      
      // Invalidate current form values overlaps (if different)
      if (currentVehicleId && currentVehicleId !== originalVehicleId) {
        invalidateByPrefix("/api/vehicles");
      }
      
      onOpenChange(false);
    },
    onError: (error) => {
      console.error("Error updating maintenance:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to update maintenance reservation",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: MaintenanceEditFormType) => {
    // No validation required - spare vehicle assignment is optional
    // Customers can choose to use spare vehicles or manage without them
    console.log("Submitting maintenance edit:", data);
    updateMutation.mutate(data);
  };

  if (!reservation) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Maintenance Reservation</DialogTitle>
          <DialogDescription>
            Update the maintenance details for this reservation.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Active Rental Context - Show if exists */}
            {(rentalCustomer || rentalDriver) && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-3">
                <h3 className="text-sm font-semibold text-blue-900">Active Rental Information</h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Active Rental Customer */}
                  {rentalCustomer && (
                    <div>
                      <label className="text-xs font-medium text-blue-700">Customer (from active rental)</label>
                      <div className="mt-1 flex items-center gap-2 text-sm text-blue-900">
                        <User className="h-4 w-4" />
                        <span className="font-medium">{rentalCustomer.name}</span>
                        {rentalCustomer.phone && (
                          <span className="flex items-center gap-1 text-blue-600">
                            <Phone className="h-3 w-3" />
                            {rentalCustomer.phone}
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                  
                  {/* Active Rental Driver */}
                  {rentalDriver && (
                    <div>
                      <label className="text-xs font-medium text-blue-700">Driver (from active rental)</label>
                      <div className="mt-1 flex items-center gap-2 text-sm text-blue-900">
                        <User className="h-4 w-4" />
                        <span className="font-medium">{rentalDriver.displayName}</span>
                        {rentalDriver.isPrimaryDriver && (
                          <Badge className="bg-blue-100 text-blue-800 border-blue-200 text-xs">Primary</Badge>
                        )}
                      </div>
                      {rentalDriver.phone && (
                        <div className="mt-1 flex items-center gap-1 text-sm text-blue-600">
                          <Phone className="h-3 w-3" />
                          {rentalDriver.phone}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
            
            {/* Vehicle (Display Only) - Full Width */}
            <div>
              <label className="text-sm font-medium text-gray-900 dark:text-gray-100">
                Vehicle
              </label>
              <div className="mt-1 p-3 bg-gray-50 dark:bg-gray-800 rounded-md border text-base font-medium" data-testid="display-vehicle">
                {vehicles.find((v: Vehicle) => v.id === reservation?.vehicleId)
                  ? `${vehicles.find((v: Vehicle) => v.id === reservation?.vehicleId)?.brand} ${vehicles.find((v: Vehicle) => v.id === reservation?.vehicleId)?.model} (${vehicles.find((v: Vehicle) => v.id === reservation?.vehicleId)?.licensePlate})`
                  : 'Not specified'}
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Maintenance Type - Editable */}
              <FormField
                control={form.control}
                name="maintenanceType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Maintenance Type</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-maintenance-type">
                          <SelectValue placeholder="Select maintenance type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="breakdown">Breakdown</SelectItem>
                        <SelectItem value="tire_replacement">Tire Replacement</SelectItem>
                        <SelectItem value="brake_service">Brake Service</SelectItem>
                        <SelectItem value="engine_repair">Engine Repair</SelectItem>
                        <SelectItem value="transmission_repair">Transmission Repair</SelectItem>
                        <SelectItem value="electrical_issue">Electrical Issue</SelectItem>
                        <SelectItem value="air_conditioning">Air Conditioning</SelectItem>
                        <SelectItem value="battery_replacement">Battery Replacement</SelectItem>
                        <SelectItem value="oil_change">Oil Change</SelectItem>
                        <SelectItem value="regular_maintenance">Regular Maintenance</SelectItem>
                        <SelectItem value="apk_inspection">APK Inspection</SelectItem>
                        <SelectItem value="warranty_service">Warranty Service</SelectItem>
                        <SelectItem value="accident_damage">Accident Damage</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Description */}
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Brief description of the maintenance work"
                        {...field}
                        data-testid="input-maintenance-description"
                      />
                    </FormControl>
                    <FormDescription>
                      What needs to be done? (e.g., "front brakes", "oil and filter change")
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Contact Phone Number */}
              <FormField
                control={form.control}
                name="contactPhone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Contact Phone Number</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                        <Input
                          type="tel"
                          placeholder="Phone number for drop-off contact"
                          {...field}
                          className="pl-10"
                          data-testid="input-contact-phone"
                        />
                      </div>
                    </FormControl>
                    <FormDescription>
                      Direct number to reach the person dropping off the vehicle
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Scheduled Date */}
              <FormField
                control={form.control}
                name="startDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Scheduled Date</FormLabel>
                    <FormControl>
                      <Input
                        type="date"
                        {...field}
                        data-testid="input-scheduled-date"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Duration (days) */}
              <FormField
                control={form.control}
                name="maintenanceDuration"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Duration (days)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min="1"
                        max="90"
                        placeholder="Number of days"
                        {...field}
                        onChange={(e) => field.onChange(parseInt(e.target.value) || 1)}
                        value={field.value}
                        data-testid="input-maintenance-duration"
                      />
                    </FormControl>
                    <FormDescription>
                      How long will the maintenance take?
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Status */}
              <FormField
                control={form.control}
                name="maintenanceStatus"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-maintenance-status">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="scheduled">Scheduled (vehicle not yet arrived)</SelectItem>
                        <SelectItem value="in">In (vehicle is in maintenance)</SelectItem>
                        <SelectItem value="out">Out (maintenance completed)</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Current status of the maintenance
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

            </div>

            {/* Notes */}
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      placeholder="Additional notes about this maintenance..."
                      className="min-h-[100px]"
                      data-testid="textarea-notes"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={updateMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={updateMutation.isPending}
                data-testid="button-update-maintenance"
              >
                {updateMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Updating...
                  </>
                ) : (
                  "Update Maintenance"
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}