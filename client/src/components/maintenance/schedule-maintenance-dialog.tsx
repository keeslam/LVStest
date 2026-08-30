import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiRequest, invalidateRelatedQueries, invalidateByPrefix } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Vehicle } from "@shared/schema";
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
import { VehicleSelector } from "@/components/ui/vehicle-selector";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Calendar, AlertTriangle, Wrench, Clock, Car, Filter } from "lucide-react";

const scheduleMaintenanceSchema = z.object({
  vehicleId: z.string().min(1, "Please select a vehicle"),
  customerId: z.string().optional(), // Optional customer
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
  ], {
    required_error: "Please select a maintenance type",
  }),
  scheduledDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Please enter a valid date (YYYY-MM-DD)").min(1, "Date when vehicle comes in is required"),
  maintenanceDuration: z.number().min(1, "Duration must be at least 1 day").max(90, "Duration cannot exceed 90 days"),
  maintenanceStatus: z.enum(["scheduled", "in", "out"]).default("scheduled"),
  description: z.string().optional(),
  notes: z.string().optional(),
  needsSpareVehicle: z.boolean().default(false),
});

type ScheduleMaintenanceFormData = z.infer<typeof scheduleMaintenanceSchema>;

interface ScheduleMaintenanceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
  editingReservation?: any; // Reservation being edited, null for new reservations
  initialDate?: string; // Initial date to pre-select when scheduling new maintenance
  initialVehicleId?: number; // Initial vehicle to pre-select
  initialMaintenanceType?: ScheduleMaintenanceFormData["maintenanceType"]; // Initial maintenance type to pre-select
}

export function ScheduleMaintenanceDialog({
  open,
  onOpenChange,
  onSuccess,
  editingReservation,
  initialDate,
  initialVehicleId,
  initialMaintenanceType,
}: ScheduleMaintenanceDialogProps) {
  const { t } = useTranslation(["maintenance", "common"]);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // State for spare vehicle selection
  const [showSpareDialog, setShowSpareDialog] = useState(false);
  const [conflictingReservations, setConflictingReservations] = useState<any[]>([]);
  const [maintenanceData, setMaintenanceData] = useState<any>(null);
  const [spareVehicleAssignments, setSpareVehicleAssignments] = useState<{[reservationId: number]: number | 'tbd' | 'customer_arranging' | 'selecting'}>({});
  
  // State for spare vehicle duration selection
  const [spareVehicleDurations, setSpareVehicleDurations] = useState<{[reservationId: number]: { startDate: string; endDate: string | null }}>({});
  const [showDurationDialog, setShowDurationDialog] = useState(false);
  const [currentDurationReservationId, setCurrentDurationReservationId] = useState<number | null>(null);
  const [tempDurationStartDate, setTempDurationStartDate] = useState("");
  const [tempDurationEndDate, setTempDurationEndDate] = useState("");
  
  // State for vehicle filtering
  const [showAvailableOnly, setShowAvailableOnly] = useState(false);
  const [excludeMaintenanceVehicles, setExcludeMaintenanceVehicles] = useState(false);
  
  // State for tracking active customer from reservation
  const [activeCustomer, setActiveCustomer] = useState<any>(null);

  const form = useForm<ScheduleMaintenanceFormData>({
    resolver: zodResolver(scheduleMaintenanceSchema),
    defaultValues: {
      vehicleId: initialVehicleId?.toString() || "",
      customerId: "",
      maintenanceType: initialMaintenanceType || "breakdown",
      scheduledDate: initialDate || new Date().toISOString().split('T')[0], // Use initialDate if provided, otherwise today
      maintenanceDuration: 1, // Default 1 day
      maintenanceStatus: "scheduled",
      description: "",
      notes: "",
      needsSpareVehicle: false,
    },
  });

  // Reset form when the dialog opens or the reservation being edited changes.
  // Guarded so a background refetch (new object references from the parent)
  // never wipes unsaved user edits while the dialog is open.
  const lastResetKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!open) {
      // Reset active customer when dialog closes
      setActiveCustomer(null);
      lastResetKeyRef.current = null;
      return;
    }

    const resetKey = String(editingReservation?.id ?? "new");
    if (lastResetKeyRef.current === resetKey && form.formState.isDirty) {
      return;
    }
    lastResetKeyRef.current = resetKey;

    if (editingReservation) {
      // Parse maintenance data from the reservation
      const noteParts = editingReservation.notes?.split(':') || [];
      const maintenanceType = noteParts[0] || "breakdown";
      const descriptionPart = noteParts[1]?.split('\n')[0]?.trim() || "";
      const notesPart = editingReservation.notes?.split('\n')[1]?.trim() || "";
      
      // Calculate duration from existing dates if available (add 1 because start day counts as day 1)
      const duration = editingReservation.maintenanceDuration || 
        (editingReservation.startDate && editingReservation.endDate ? 
          Math.max(1, Math.ceil((new Date(editingReservation.endDate).getTime() - new Date(editingReservation.startDate).getTime()) / (1000 * 60 * 60 * 24)) + 1) : 1);
      
      form.reset({
        vehicleId: editingReservation.vehicleId?.toString() || "",
        customerId: editingReservation.customerId?.toString() || "none",
        maintenanceType,
        scheduledDate: editingReservation.startDate || new Date().toISOString().split('T')[0],
        maintenanceDuration: duration,
        maintenanceStatus: editingReservation.maintenanceStatus || "in",
        description: descriptionPart,
        notes: notesPart,
        needsSpareVehicle: false,
      });
    } else {
      // Reset to default values for new maintenance
      form.reset({
        vehicleId: initialVehicleId?.toString() || "",
        customerId: "",
        maintenanceType: initialMaintenanceType || "breakdown",
        scheduledDate: initialDate || new Date().toISOString().split('T')[0],
        maintenanceDuration: 1,
        maintenanceStatus: "scheduled",
        description: "",
        notes: "",
        needsSpareVehicle: false,
      });
    }
  }, [open, editingReservation, initialDate, initialVehicleId, initialMaintenanceType, form]);

  // Get selected date for filtering (after form is defined)
  const scheduledDate = form.watch('scheduledDate');
  
  // Get current vehicle ID to exclude from filters when editing
  const currentVehicleId = editingReservation?.vehicleId || (form.watch('vehicleId') ? parseInt(form.watch('vehicleId')) : undefined);
  
  // Fetch vehicles based on filter settings
  const { data: vehicles = [], isLoading: vehiclesLoading } = useQuery<Vehicle[]>({
    queryKey: showAvailableOnly 
      ? ['/api/vehicles/available', { 
          startDate: scheduledDate, 
          endDate: scheduledDate,
          excludeVehicleId: currentVehicleId // Keep current vehicle in list when editing
        }]
      : ['/api/vehicles'],
    enabled: open, // Only fetch when dialog is open
  });

  // Fetch customers for optional selection
  const { data: customers = [] } = useQuery<any[]>({
    queryKey: ['/api/customers'],
    enabled: open,
  });

  // Fetch all reservations to filter out vehicles with maintenance (if filter is enabled)
  const { data: allReservations = [] } = useQuery<any[]>({
    queryKey: ['/api/reservations'],
    enabled: open && excludeMaintenanceVehicles, // Only fetch when needed
  });

  // Fetch all reservations to check for active rentals (for auto-filling customer)
  const { data: activeReservations = [] } = useQuery<any[]>({
    queryKey: ['/api/reservations'],
    enabled: open, // Also when editing: blocks saved without a customer get the renting customer filled in
  });

  // Watch vehicle and date for auto-filling customer
  const watchedVehicleId = form.watch('vehicleId');
  const watchedScheduledDate = form.watch('scheduledDate');

  // Auto-fill customer when there's an active rental
  useEffect(() => {
    // Helper to check if a date falls within a range (supports open-ended rentals)
    const dateInRange = (checkDate: string, startDate: string, endDate?: string | null) => {
      const check = new Date(checkDate);
      const start = new Date(startDate);
      // For open-ended rentals (endDate is null/undefined), treat as far-future date
      const end = endDate ? new Date(endDate) : new Date('2099-12-31');
      
      check.setHours(0, 0, 0, 0);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      
      return check >= start && check <= end;
    };
    
    // Auto-fill when vehicle and date are selected. Also runs while editing a
    // block that has no customer yet — the guard below never overrides a
    // customer that is already set on the block or picked by the user.
    if (watchedVehicleId && watchedScheduledDate && activeReservations.length > 0) {
      const vehicleIdNum = parseInt(watchedVehicleId);
      
      // Find active rental for this vehicle on this date
      const activeRental = activeReservations.find(reservation =>
        reservation.vehicleId === vehicleIdNum &&
        reservation.type === 'standard' &&
        (reservation.status === 'booked' || reservation.status === 'picked_up') &&
        dateInRange(watchedScheduledDate, reservation.startDate, reservation.endDate)
      );
      
      // If found, auto-fill the customer and set as active
      if (activeRental && activeRental.customerId) {
        const currentCustomerId = form.getValues('customerId');
        // Only update if not already set (to avoid overriding user's manual selection)
        if (!currentCustomerId || currentCustomerId === 'none' || currentCustomerId === '') {
          form.setValue('customerId', activeRental.customerId.toString());
          // Find and set the active customer for display
          const customer = customers.find(c => c.id === activeRental.customerId);
          setActiveCustomer(customer);
        }
      } else {
        // No active rental, clear active customer
        setActiveCustomer(null);
      }
    }
  }, [watchedVehicleId, watchedScheduledDate, activeReservations, editingReservation, customers, form]);

  // Helper function to check if a date falls within a range
  const dateInRange = (checkDate: string, startDate: string, endDate?: string) => {
    const check = new Date(checkDate);
    const start = new Date(startDate);
    const end = endDate ? new Date(endDate) : start;
    
    // Normalize to date-only comparison
    check.setHours(0, 0, 0, 0);
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
    
    return check >= start && check <= end;
  };

  // Filter vehicles based on current filters
  const filteredVehicles = vehicles.filter(vehicle => {
    // If excluding maintenance vehicles, check if this vehicle has maintenance that overlaps the scheduled date
    if (excludeMaintenanceVehicles && scheduledDate) {
      const hasMaintenanceConflict = allReservations.some(reservation => 
        reservation.vehicleId === vehicle.id &&
        reservation.type === 'maintenance_block' &&
        reservation.id !== editingReservation?.id && // Don't exclude current editing reservation
        dateInRange(scheduledDate, reservation.startDate, reservation.endDate)
      );
      if (hasMaintenanceConflict) return false;
    }
    return true;
  });

  const scheduleMaintenanceMutation = useMutation({
    mutationFn: async (data: ScheduleMaintenanceFormData) => {
      // Validate and sanitize the scheduled date
      const startDate = data.scheduledDate?.trim();
      if (!startDate || startDate === 'undefined') {
        throw new Error('Please select a valid scheduled date');
      }
      
      // Calculate end date from start date + duration
      const startDateObj = new Date(startDate);
      const endDateObj = new Date(startDateObj);
      endDateObj.setDate(endDateObj.getDate() + data.maintenanceDuration - 1); // -1 because start day counts as day 1
      const endDate = endDateObj.toISOString().split('T')[0];
      
      const payload = {
        vehicleId: parseInt(data.vehicleId),
        customerId: (data.customerId && data.customerId !== "none") ? parseInt(data.customerId) : null,
        startDate: startDate,
        endDate: endDate, // Calculated from duration
        status: data.maintenanceStatus, // Use maintenance status ('in' or 'out')
        type: "maintenance_block",
        notes: `${data.maintenanceType}: ${data.description || ''}\n${data.notes || ''}`.trim(),
        totalPrice: 0, // No price for maintenance
        maintenanceDuration: data.maintenanceDuration,
        maintenanceStatus: data.maintenanceStatus,
      };
      
      console.log('Sending payload:', payload);
      
      // Use PATCH for editing, POST for creating
      const method = editingReservation ? "PATCH" : "POST";
      const url = editingReservation ? `/api/reservations/${editingReservation.id}/basic` : "/api/reservations";
      
      const response = await apiRequest(method, url, {
        body: JSON.stringify(payload),
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || t('scheduleDialog.scheduleFailedFallback'));
      }

      const result = await response.json();
      
      // Check if spare vehicles are needed
      if (result.needsSpareVehicle) {
        console.log('🚗 Spare vehicles needed! Showing spare dialog...', result);
        console.log('Conflicting reservations:', result.conflictingReservations);
        console.log('Maintenance reservation ID:', result.maintenanceReservationId);
        setConflictingReservations(result.conflictingReservations);
        setMaintenanceData({
          ...result.maintenanceData,
          maintenanceId: result.maintenanceReservationId, // Store the created maintenance ID
          maintenanceType: data.maintenanceType, // Store maintenance type for later
          vehicleId: data.vehicleId // Store vehicle ID for later
        });
        
        // Close the maintenance dialog before showing spare dialog
        onOpenChange(false);
        
        // Small delay to ensure smooth transition between dialogs
        setTimeout(() => {
          setShowSpareDialog(true);
        }, 100);
        
        return null; // Don't proceed with success yet
      }

      return result;
    },
    onSuccess: (result, variables) => {
      if (result === null) return; // Spare vehicle dialog will handle this
      
      // Clear localStorage dismissals for APK/warranty notifications when scheduling that type
      // This ensures if the user deletes the maintenance, the notification will reappear
      if (variables.maintenanceType === 'apk_inspection') {
        localStorage.removeItem(`dismissed_apk_${variables.vehicleId}`);
      } else if (variables.maintenanceType === 'warranty_service') {
        localStorage.removeItem(`dismissed_warranty_${variables.vehicleId}`);
      }
      
      invalidateRelatedQueries('reservations');
      invalidateRelatedQueries('vehicles');
      invalidateByPrefix('/api/placeholder-reservations');
      
      toast({
        title: editingReservation ? t('scheduleDialog.maintenanceUpdatedTitle') : t('scheduleDialog.maintenanceScheduledTitle'),
        description: editingReservation
          ? t('scheduleDialog.maintenanceUpdatedDescription')
          : t('scheduleDialog.maintenanceScheduledDescription'),
      });
      onSuccess?.();
      form.reset();
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast({
        title: t('scheduleDialog.errorTitle'),
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Helper function to create placeholder reservations (not a mutation to avoid nesting issues)
  const createPlaceholder = async (data: {
    originalReservationId: number;
    customerId: number;
    startDate: string;
    endDate?: string;
  }) => {
    console.log('🔄 Creating placeholder with data:', data);
    
    const response = await apiRequest("POST", "/api/placeholder-reservations", {
      body: JSON.stringify(data),
      headers: {
        "Content-Type": "application/json",
      },
    });

    console.log('📡 Placeholder response status:', response.status);

    if (!response.ok) {
      const errorData = await response.json();
      console.error('❌ Placeholder creation failed:', errorData);
      throw new Error(errorData.message || t('scheduleDialog.placeholderCreationFailed'));
    }

    const result = await response.json();
    console.log('✅ Placeholder created successfully:', result);
    return result;
  };

  // Mutation for handling spare vehicle assignments (maintenance already created)
  const createMaintenanceWithSpareMutation = useMutation({
    mutationFn: async (data: { 
      maintenanceData: any; 
      conflictingReservations: any[]; 
      spareVehicleAssignments: {[reservationId: number]: number | 'tbd' | 'customer_arranging'};
      spareVehicleDurations?: {[reservationId: number]: { startDate: string; endDate: string | null }};
    }) => {
      // Separate into three categories: TBD, specific assignments, and customer arranging
      const tbdAssignments: any[] = [];
      const specificAssignments: any[] = [];
      const customerArrangingAssignments: any[] = [];

      Object.entries(data.spareVehicleAssignments).forEach(([reservationId, assignment]) => {
        const reservation = data.conflictingReservations.find(r => r.id.toString() === reservationId);
        const resId = parseInt(reservationId);
        const duration = data.spareVehicleDurations?.[resId];
        
        if (assignment === 'tbd') {
          tbdAssignments.push({
            reservationId: resId,
            reservation
          });
        } else if (assignment === 'customer_arranging') {
          customerArrangingAssignments.push({
            reservationId: resId,
            reservation
          });
        } else {
          specificAssignments.push({
            reservationId: resId,
            spareVehicleId: assignment,
            // Include custom duration if available
            startDate: duration?.startDate,
            endDate: duration?.endDate
          });
        }
      });

      // Create placeholder reservations for TBD assignments
      for (const tbdAssignment of tbdAssignments) {
        // Validate that we have the reservation data
        if (!tbdAssignment.reservation) {
          console.error('Missing reservation data for TBD assignment:', tbdAssignment);
          continue;
        }
        
        // Validate required fields
        const reservationId = parseInt(tbdAssignment.reservationId);
        const customerId = parseInt(tbdAssignment.reservation.customerId);
        
        if (isNaN(reservationId) || isNaN(customerId)) {
          console.error('Invalid reservation or customer ID:', { reservationId, customerId });
          continue;
        }
        
        // Calculate the overlap between maintenance window and original reservation
        const maintenanceStart = data.maintenanceData.startDate;
        const maintenanceEnd = data.maintenanceData.endDate || data.maintenanceData.startDate;
        const reservationStart = tbdAssignment.reservation.startDate;
        const reservationEnd = tbdAssignment.reservation.endDate;
        
        // Validate dates
        if (!maintenanceStart || !reservationStart) {
          console.error('Missing required dates:', { maintenanceStart, reservationStart });
          continue;
        }
        
        // Check if rental is open-ended (no end date)
        const isOpenEnded = !reservationEnd || reservationEnd === null || reservationEnd === 'undefined';
        
        // Calculate intersection dates (overlap period)
        // For open-ended rentals, the placeholder should cover the entire maintenance period
        const overlapStart = reservationStart > maintenanceStart ? reservationStart : maintenanceStart;
        const overlapEnd = isOpenEnded ? maintenanceEnd : (reservationEnd < maintenanceEnd ? reservationEnd : maintenanceEnd);
        
        // Check if there's any overlap
        // For open-ended rentals: rental must start before or during maintenance
        // For closed rentals: normal overlap check
        const hasOverlap = isOpenEnded 
          ? (reservationStart <= maintenanceEnd) 
          : (overlapStart <= overlapEnd);
        
        if (hasOverlap) {
          console.log('✅ Creating placeholder reservation with data:', {
            originalReservationId: reservationId,
            customerId: customerId,
            startDate: overlapStart,
            endDate: overlapEnd,
            isOpenEnded
          });
          
          try {
            await createPlaceholder({
              originalReservationId: reservationId,
              customerId: customerId,
              startDate: overlapStart,
              endDate: overlapEnd
            });
          } catch (error: any) {
            // If placeholder already exists (409 Conflict), that's okay - just skip it
            if (error.message && error.message.includes('409') && error.message.includes('already exists')) {
              console.log('ℹ️ Placeholder already exists for this reservation, skipping...');
              continue;
            }
            // For other errors, rethrow
            throw error;
          }
        } else {
          console.log('⚠️ No overlap detected:', {
            maintenanceStart,
            maintenanceEnd,
            reservationStart,
            reservationEnd,
            isOpenEnded
          });
        }
      }

      // Create specific vehicle assignments if any
      if (specificAssignments.length > 0) {
        const response = await apiRequest("POST", "/api/reservations/maintenance-with-spare", {
          body: JSON.stringify({
            maintenanceId: data.maintenanceData.maintenanceId, // Use existing maintenance ID
            maintenanceData: data.maintenanceData, // Include full maintenance data
            conflictingReservations: data.conflictingReservations.filter(r => 
              specificAssignments.some(sa => sa.reservationId === r.id)
            ),
            spareVehicleAssignments: specificAssignments
          }),
          headers: {
            "Content-Type": "application/json",
          },
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.message || t('scheduleDialog.assignSpecificSparesFailed'));
        }
      }

      return { success: true };
    },
    onSuccess: () => {
      // Clear localStorage dismissals for APK/warranty notifications when scheduling that type
      // This ensures if the user deletes the maintenance, the notification will reappear
      if (maintenanceData?.maintenanceType === 'apk_inspection') {
        localStorage.removeItem(`dismissed_apk_${maintenanceData.vehicleId}`);
      } else if (maintenanceData?.maintenanceType === 'warranty_service') {
        localStorage.removeItem(`dismissed_warranty_${maintenanceData.vehicleId}`);
      }
      
      // Show success message first
      toast({
        title: t('scheduleDialog.maintenanceScheduledTitle'),
        description: t('scheduleDialog.spareAssignedScheduledDescription'),
      });
      
      // Close dialogs immediately for better UX
      setShowSpareDialog(false);
      setConflictingReservations([]);
      setMaintenanceData(null);
      setSpareVehicleAssignments({});
      setSpareVehicleDurations({});
      onOpenChange(false);
      
      // Call parent onSuccess if provided
      if (onSuccess && typeof onSuccess === 'function') {
        try {
          onSuccess();
        } catch (error) {
          console.warn('Error calling parent onSuccess:', error);
        }
      }
      
      // Reset form safely
      try {
        if (form && typeof form.reset === 'function') {
          form.reset();
        }
      } catch (error) {
        console.warn('Error resetting form:', error);
      }
      
      invalidateRelatedQueries('reservations');
      invalidateRelatedQueries('vehicles');
      invalidateByPrefix('/api/placeholder-reservations');
    },
    onError: (error: Error) => {
      toast({
        title: t('scheduleDialog.errorTitle'),
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (data: ScheduleMaintenanceFormData) => {
    console.log('Form data:', data);

    // Validate required fields before submitting
    if (!data.vehicleId || data.vehicleId === "") {
      toast({
        title: t('scheduleDialog.validationErrorTitle'),
        description: t('scheduleDialog.selectVehicleError'),
        variant: "destructive",
      });
      return;
    }

    if (!data.scheduledDate) {
      toast({
        title: t('scheduleDialog.validationErrorTitle'),
        description: t('scheduleDialog.selectDateError'),
        variant: "destructive",
      });
      return;
    }

    scheduleMaintenanceMutation.mutate(data);
  };

  const getMaintenanceTypeInfo = (type: string) => {
    switch (type) {
      case "breakdown":
        return { icon: <AlertTriangle className="w-4 h-4 text-red-500" />, label: t('scheduleDialog.typesFull.breakdown.label'), urgent: true };
      case "tire_replacement":
        return { icon: <Car className="w-4 h-4 text-orange-500" />, label: t('scheduleDialog.typesFull.tire_replacement.label'), urgent: false };
      case "brake_service":
        return { icon: <AlertTriangle className="w-4 h-4 text-red-500" />, label: t('scheduleDialog.typesFull.brake_service.label'), urgent: true };
      case "engine_repair":
        return { icon: <AlertTriangle className="w-4 h-4 text-red-500" />, label: t('scheduleDialog.typesFull.engine_repair.label'), urgent: true };
      case "transmission_repair":
        return { icon: <AlertTriangle className="w-4 h-4 text-red-500" />, label: t('scheduleDialog.typesFull.transmission_repair.label'), urgent: true };
      case "electrical_issue":
        return { icon: <Wrench className="w-4 h-4 text-yellow-500" />, label: t('scheduleDialog.typesFull.electrical_issue.label'), urgent: false };
      case "air_conditioning":
        return { icon: <Wrench className="w-4 h-4 text-blue-500" />, label: t('scheduleDialog.typesFull.air_conditioning.label'), urgent: false };
      case "battery_replacement":
        return { icon: <Wrench className="w-4 h-4 text-yellow-500" />, label: t('scheduleDialog.typesFull.battery_replacement.label'), urgent: false };
      case "oil_change":
        return { icon: <Wrench className="w-4 h-4 text-blue-500" />, label: t('scheduleDialog.typesFull.oil_change.label'), urgent: false };
      case "regular_maintenance":
        return { icon: <Wrench className="w-4 h-4 text-blue-500" />, label: t('scheduleDialog.typesFull.regular_maintenance.label'), urgent: false };
      case "apk_inspection":
        return { icon: <Clock className="w-4 h-4 text-green-500" />, label: t('scheduleDialog.typesFull.apk_inspection.label'), urgent: false };
      case "warranty_service":
        return { icon: <Clock className="w-4 h-4 text-green-500" />, label: t('scheduleDialog.typesFull.warranty_service.label'), urgent: false };
      case "accident_damage":
        return { icon: <AlertTriangle className="w-4 h-4 text-red-500" />, label: t('scheduleDialog.typesFull.accident_damage.label'), urgent: true };
      case "other":
        return { icon: <Wrench className="w-4 h-4 text-gray-500" />, label: t('scheduleDialog.typesFull.other.label'), urgent: false };
      default:
        return { icon: <Wrench className="w-4 h-4" />, label: t('scheduleDialog.maintenanceType'), urgent: false };
    }
  };

  const selectedVehicle = filteredVehicles.find(v => v.id.toString() === form.watch('vehicleId'));

  // Fetch available vehicles for spare assignment during the maintenance period
  const { data: availableVehicles = [] } = useQuery<Vehicle[]>({
    queryKey: ['/api/vehicles/available', {
      startDate: maintenanceData?.startDate,
      endDate: maintenanceData?.endDate || maintenanceData?.startDate, // Use endDate if available, otherwise same day
      excludeVehicleId: maintenanceData?.vehicleId
    }],
    enabled: Boolean(showSpareDialog && maintenanceData?.startDate && maintenanceData?.vehicleId), // Ensure boolean return
  });

  const handleSpareVehicleAssignment = async () => {
    console.log('🎯 Handling spare vehicle assignment...');
    console.log('Spare vehicle assignments:', spareVehicleAssignments);
    console.log('Conflicting reservations:', conflictingReservations);
    console.log('Maintenance data:', maintenanceData);
    
    // Check that all conflicting reservations have either a specific vehicle or TBD assigned
    const missingAssignments = conflictingReservations.filter(r => {
      const assignment = spareVehicleAssignments[r.id];
      // 'selecting' means user started but didn't pick a vehicle yet
      return !assignment || assignment === 'selecting'; // No assignment at all (neither specific vehicle nor TBD)
    });
    
    if (missingAssignments.length > 0) {
      console.log('❌ Missing assignments for reservations:', missingAssignments);
      toast({
        title: t('scheduleDialog.missingAssignmentsTitle'),
        description: t('scheduleDialog.missingAssignmentsDescription'),
        variant: "destructive",
      });
      return;
    }

    // Check if specific vehicle assignments are valid (not just 'specific' radio selected)
    const invalidSpecificAssignments = conflictingReservations.filter(r => {
      const assignment = spareVehicleAssignments[r.id];
      // Valid assignments: TBD, customer_arranging, or a numeric vehicle ID
      // 'selecting' is invalid as user hasn't picked a vehicle yet
      return assignment && assignment !== 'tbd' && assignment !== 'customer_arranging' && assignment !== 'selecting' && (!assignment || isNaN(Number(assignment)));
    });

    if (invalidSpecificAssignments.length > 0) {
      console.log('❌ Invalid specific assignments:', invalidSpecificAssignments);
      toast({
        title: t('scheduleDialog.invalidAssignmentsTitle'),
        description: t('scheduleDialog.invalidAssignmentsDescription'),
        variant: "destructive",
      });
      return;
    }

    // Check that all specific assignments have durations set
    const missingDurations = conflictingReservations.filter(r => {
      const assignment = spareVehicleAssignments[r.id];
      // Only check for specific vehicle assignments (not TBD, customer_arranging, or 'selecting')
      return assignment && assignment !== 'tbd' && assignment !== 'customer_arranging' && assignment !== 'selecting' && !spareVehicleDurations[r.id];
    });

    if (missingDurations.length > 0) {
      console.log('❌ Missing durations for reservations:', missingDurations);
      toast({
        title: t('scheduleDialog.missingDurationTitle'),
        description: t('scheduleDialog.missingDurationDescription'),
        variant: "destructive",
      });
      return;
    }

    console.log('✅ All validations passed, creating placeholders...');
    
    // Filter out 'selecting' entries before sending to API (they're already validated as invalid above)
    const validAssignments: {[reservationId: number]: number | 'tbd' | 'customer_arranging'} = {};
    for (const [key, value] of Object.entries(spareVehicleAssignments)) {
      if (value !== 'selecting') {
        validAssignments[Number(key)] = value;
      }
    }
    
    try {
      await createMaintenanceWithSpareMutation.mutateAsync({
        maintenanceData,
        conflictingReservations,
        spareVehicleAssignments: validAssignments,
        spareVehicleDurations
      });
      console.log('✅ Mutation completed successfully');
    } catch (error) {
      console.error('❌ Mutation failed:', error);
      // Error is already handled by onError
    }
  };

  const handleSpareVehicleChange = (reservationId: number, spareVehicleId: string | number) => {
    if (spareVehicleId === 'tbd' || spareVehicleId === 'customer_arranging') {
      // For TBD or customer arranging, just set the assignment and clear any duration
      setSpareVehicleAssignments(prev => ({
        ...prev,
        [reservationId]: spareVehicleId as 'tbd' | 'customer_arranging'
      }));
      setSpareVehicleDurations(prev => {
        const newDurations = { ...prev };
        delete newDurations[reservationId];
        return newDurations;
      });
    } else {
      // For specific vehicle selection, open the duration dialog
      const vehicleId = parseInt(spareVehicleId as string);
      setSpareVehicleAssignments(prev => ({
        ...prev,
        [reservationId]: vehicleId
      }));
      
      // Get default dates from maintenance data
      const defaultStartDate = maintenanceData?.startDate || new Date().toISOString().split('T')[0];
      const defaultEndDate = maintenanceData?.endDate || '';
      
      // Set temp values for the dialog
      setTempDurationStartDate(spareVehicleDurations[reservationId]?.startDate || defaultStartDate);
      setTempDurationEndDate(spareVehicleDurations[reservationId]?.endDate || defaultEndDate);
      setCurrentDurationReservationId(reservationId);
      setShowDurationDialog(true);
    }
  };
  
  // Handle saving the duration from the dialog
  const handleSaveDuration = () => {
    if (currentDurationReservationId !== null) {
      setSpareVehicleDurations(prev => ({
        ...prev,
        [currentDurationReservationId]: {
          startDate: tempDurationStartDate,
          endDate: tempDurationEndDate || null
        }
      }));
    }
    setShowDurationDialog(false);
    setCurrentDurationReservationId(null);
  };
  
  // Handle canceling the duration dialog
  const handleCancelDuration = () => {
    // Remove the vehicle assignment if no duration was set
    if (currentDurationReservationId !== null && !spareVehicleDurations[currentDurationReservationId]) {
      setSpareVehicleAssignments(prev => {
        const newAssignments = { ...prev };
        delete newAssignments[currentDurationReservationId];
        return newAssignments;
      });
    }
    setShowDurationDialog(false);
    setCurrentDurationReservationId(null);
  };
  
  // Helper to format date for display
  const formatDisplayDate = (dateStr: string) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  };

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto" data-testid="dialog-schedule-maintenance">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-blue-600" />
            {editingReservation ? t('scheduleDialog.editMaintenanceTitle') : t('scheduleDialog.scheduleMaintenanceTitle')}
          </DialogTitle>
          <DialogDescription>
            {t('scheduleDialog.mainDescription')}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="vehicleId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('scheduleDialog.vehicle')}</FormLabel>
                  <FormControl>
                    {vehiclesLoading ? (
                      <div className="flex items-center justify-center p-2 border rounded-md">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span className="ml-2">{t('scheduleDialog.loadingVehicles')}</span>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {/* Filter Options */}
                        <div className="bg-gray-50 p-3 rounded-lg border">
                          <div className="flex items-center gap-2 mb-2">
                            <Filter className="h-4 w-4 text-gray-500" />
                            <span className="text-sm font-medium text-gray-700">{t('scheduleDialog.vehicleFilters')}</span>
                          </div>
                          <div className="flex flex-col gap-2">
                            <div className="flex items-center space-x-2">
                              <Checkbox
                                id="show-available-only"
                                checked={showAvailableOnly}
                                onCheckedChange={(checked) => setShowAvailableOnly(checked === true)}
                                data-testid="checkbox-available-only"
                              />
                              <label htmlFor="show-available-only" className="text-sm text-gray-600">
                                {t('scheduleDialog.showAvailableOnly')}
                              </label>
                            </div>
                            <div className="flex items-center space-x-2">
                              <Checkbox
                                id="exclude-maintenance"
                                checked={excludeMaintenanceVehicles}
                                onCheckedChange={(checked) => setExcludeMaintenanceVehicles(checked === true)}
                                data-testid="checkbox-exclude-maintenance"
                              />
                              <label htmlFor="exclude-maintenance" className="text-sm text-gray-600">
                                {t('scheduleDialog.excludeMaintenanceVehicles')}
                              </label>
                            </div>
                          </div>
                        </div>

                        {/* Vehicle Selector */}
                        <div data-testid="select-vehicle">
                          <VehicleSelector
                            vehicles={filteredVehicles}
                            value={field.value}
                            onChange={field.onChange}
                            placeholder={t('scheduleDialog.selectVehiclePlaceholder')}
                          />
                        </div>

                        {/* Results summary */}
                        <div className="text-xs text-gray-500">
                          {t('scheduleDialog.showingVehiclesCount', { shown: filteredVehicles.length, total: vehicles.length })}
                          {showAvailableOnly && t('scheduleDialog.availableOnDate', { date: scheduledDate })}
                          {excludeMaintenanceVehicles && t('scheduleDialog.noMaintenanceConflicts')}
                        </div>
                      </div>
                    )}
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Optional Customer Selection */}
            <FormField
              control={form.control}
              name="customerId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('scheduleDialog.customer')}</FormLabel>
                  {activeCustomer ? (
                    <div>
                      <div className="p-3 bg-blue-50 border border-blue-200 rounded-md">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="font-medium text-blue-900">{activeCustomer.name}</div>
                            {activeCustomer.email && (
                              <div className="text-sm text-blue-700">{activeCustomer.email}</div>
                            )}
                            {activeCustomer.phone && (
                              <div className="text-sm text-blue-700">{activeCustomer.phone}</div>
                            )}
                          </div>
                          <div className="text-xs text-blue-600 bg-blue-100 px-2 py-1 rounded">
                            {t('scheduleDialog.activeRentalBadge')}
                          </div>
                        </div>
                      </div>
                      <FormDescription className="mt-2">
                        {t('scheduleDialog.activeRentalHint')}
                      </FormDescription>
                    </div>
                  ) : (
                    <>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-customer">
                            <SelectValue placeholder={t('scheduleDialog.selectCustomerOptional')} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent className="max-h-60">
                          <SelectItem value="none">{t('scheduleDialog.noneNoCustomer')}</SelectItem>
                          {customers.map((customer: any) => (
                            <SelectItem key={customer.id} value={customer.id.toString()}>
                              {customer.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        {t('scheduleDialog.whoIsBringingVehicle')}
                      </FormDescription>
                    </>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="maintenanceType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('scheduleDialog.maintenanceType')}</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-maintenance-type">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent className="max-h-60">
                      <SelectItem value="breakdown">
                        <div className="flex items-center gap-2">
                          <AlertTriangle className="w-4 h-4 text-red-500" />
                          <div>
                            <div className="font-medium">{t('scheduleDialog.typesFull.breakdown.label')}</div>
                            <div className="text-xs text-gray-500">{t('scheduleDialog.typesFull.breakdown.description')}</div>
                          </div>
                        </div>
                      </SelectItem>
                      <SelectItem value="tire_replacement">
                        <div className="flex items-center gap-2">
                          <Car className="w-4 h-4 text-orange-500" />
                          <div>
                            <div className="font-medium">{t('scheduleDialog.typesFull.tire_replacement.label')}</div>
                            <div className="text-xs text-gray-500">{t('scheduleDialog.typesFull.tire_replacement.description')}</div>
                          </div>
                        </div>
                      </SelectItem>
                      <SelectItem value="brake_service">
                        <div className="flex items-center gap-2">
                          <AlertTriangle className="w-4 h-4 text-red-500" />
                          <div>
                            <div className="font-medium">{t('scheduleDialog.typesFull.brake_service.label')}</div>
                            <div className="text-xs text-gray-500">{t('scheduleDialog.typesFull.brake_service.description')}</div>
                          </div>
                        </div>
                      </SelectItem>
                      <SelectItem value="engine_repair">
                        <div className="flex items-center gap-2">
                          <AlertTriangle className="w-4 h-4 text-red-500" />
                          <div>
                            <div className="font-medium">{t('scheduleDialog.typesFull.engine_repair.label')}</div>
                            <div className="text-xs text-gray-500">{t('scheduleDialog.typesFull.engine_repair.description')}</div>
                          </div>
                        </div>
                      </SelectItem>
                      <SelectItem value="transmission_repair">
                        <div className="flex items-center gap-2">
                          <AlertTriangle className="w-4 h-4 text-red-500" />
                          <div>
                            <div className="font-medium">{t('scheduleDialog.typesFull.transmission_repair.label')}</div>
                            <div className="text-xs text-gray-500">{t('scheduleDialog.typesFull.transmission_repair.description')}</div>
                          </div>
                        </div>
                      </SelectItem>
                      <SelectItem value="electrical_issue">
                        <div className="flex items-center gap-2">
                          <Wrench className="w-4 h-4 text-yellow-500" />
                          <div>
                            <div className="font-medium">{t('scheduleDialog.typesFull.electrical_issue.label')}</div>
                            <div className="text-xs text-gray-500">{t('scheduleDialog.typesFull.electrical_issue.description')}</div>
                          </div>
                        </div>
                      </SelectItem>
                      <SelectItem value="air_conditioning">
                        <div className="flex items-center gap-2">
                          <Wrench className="w-4 h-4 text-blue-500" />
                          <div>
                            <div className="font-medium">{t('scheduleDialog.typesFull.air_conditioning.label')}</div>
                            <div className="text-xs text-gray-500">{t('scheduleDialog.typesFull.air_conditioning.description')}</div>
                          </div>
                        </div>
                      </SelectItem>
                      <SelectItem value="battery_replacement">
                        <div className="flex items-center gap-2">
                          <Wrench className="w-4 h-4 text-yellow-500" />
                          <div>
                            <div className="font-medium">{t('scheduleDialog.typesFull.battery_replacement.label')}</div>
                            <div className="text-xs text-gray-500">{t('scheduleDialog.typesFull.battery_replacement.description')}</div>
                          </div>
                        </div>
                      </SelectItem>
                      <SelectItem value="oil_change">
                        <div className="flex items-center gap-2">
                          <Wrench className="w-4 h-4 text-blue-500" />
                          <div>
                            <div className="font-medium">{t('scheduleDialog.typesFull.oil_change.label')}</div>
                            <div className="text-xs text-gray-500">{t('scheduleDialog.typesFull.oil_change.description')}</div>
                          </div>
                        </div>
                      </SelectItem>
                      <SelectItem value="regular_maintenance">
                        <div className="flex items-center gap-2">
                          <Wrench className="w-4 h-4 text-blue-500" />
                          <div>
                            <div className="font-medium">{t('scheduleDialog.typesFull.regular_maintenance.label')}</div>
                            <div className="text-xs text-gray-500">{t('scheduleDialog.typesFull.regular_maintenance.description')}</div>
                          </div>
                        </div>
                      </SelectItem>
                      <SelectItem value="apk_inspection">
                        <div className="flex items-center gap-2">
                          <Clock className="w-4 h-4 text-green-500" />
                          <div>
                            <div className="font-medium">{t('scheduleDialog.typesFull.apk_inspection.label')}</div>
                            <div className="text-xs text-gray-500">{t('scheduleDialog.typesFull.apk_inspection.description')}</div>
                          </div>
                        </div>
                      </SelectItem>
                      <SelectItem value="warranty_service">
                        <div className="flex items-center gap-2">
                          <Clock className="w-4 h-4 text-green-500" />
                          <div>
                            <div className="font-medium">{t('scheduleDialog.typesFull.warranty_service.label')}</div>
                            <div className="text-xs text-gray-500">{t('scheduleDialog.typesFull.warranty_service.description')}</div>
                          </div>
                        </div>
                      </SelectItem>
                      <SelectItem value="accident_damage">
                        <div className="flex items-center gap-2">
                          <AlertTriangle className="w-4 h-4 text-red-500" />
                          <div>
                            <div className="font-medium">{t('scheduleDialog.typesFull.accident_damage.label')}</div>
                            <div className="text-xs text-gray-500">{t('scheduleDialog.typesFull.accident_damage.description')}</div>
                          </div>
                        </div>
                      </SelectItem>
                      <SelectItem value="other">
                        <div className="flex items-center gap-2">
                          <Wrench className="w-4 h-4 text-gray-500" />
                          <div>
                            <div className="font-medium">{t('scheduleDialog.typesFull.other.label')}</div>
                            <div className="text-xs text-gray-500">{t('scheduleDialog.typesFull.other.description')}</div>
                          </div>
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="scheduledDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('scheduleDialog.scheduledDate')}</FormLabel>
                    <FormControl>
                      <Input
                        type="date"
                        {...field}
                        data-testid="input-scheduled-date"
                      />
                    </FormControl>
                    <FormDescription>
                      {t('scheduleDialog.whenPerformedHint')}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="maintenanceDuration"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('scheduleDialog.durationDays')}</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min="1"
                        max="90"
                        placeholder={t('scheduleDialog.numberOfDaysPlaceholder')}
                        {...field}
                        onChange={(e) => field.onChange(parseInt(e.target.value) || 1)}
                        value={field.value}
                        data-testid="input-maintenance-duration"
                      />
                    </FormControl>
                    <FormDescription>
                      {t('scheduleDialog.howLongHint')}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="maintenanceStatus"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('scheduleDialog.status')}</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-maintenance-status">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="scheduled">{t('scheduleDialog.statuses.scheduled')}</SelectItem>
                      <SelectItem value="in">{t('scheduleDialog.statuses.in')}</SelectItem>
                      <SelectItem value="out">{t('scheduleDialog.statuses.out')}</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    {t('scheduleDialog.statusHint')}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('scheduleDialog.description')}</FormLabel>
                  <FormControl>
                    <Input
                      placeholder={t('scheduleDialog.descriptionPlaceholder')}
                      {...field}
                      data-testid="input-description"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('scheduleDialog.notes')}</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder={t('scheduleDialog.notesPlaceholder')}
                      {...field}
                      data-testid="textarea-notes"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {selectedVehicle && (
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-md">
                <div className="flex items-center gap-2 text-blue-800 font-medium mb-1">
                  <Calendar className="w-4 h-4" />
                  {t('scheduleDialog.selectedVehicle')}
                </div>
                <div className="text-blue-700">
                  {selectedVehicle.brand} {selectedVehicle.model} ({formatLicensePlate(selectedVehicle.licensePlate)})
                </div>
                {selectedVehicle.apkDate && (
                  <div className="text-sm text-blue-600 mt-1">
                    {t('scheduleDialog.currentApkDate', { date: selectedVehicle.apkDate })}
                  </div>
                )}
              </div>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={scheduleMaintenanceMutation.isPending}
              >
                {t('common:actions.cancel')}
              </Button>
              <Button
                type="submit"
                disabled={scheduleMaintenanceMutation.isPending}
                data-testid="button-schedule"
              >
                {scheduleMaintenanceMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {editingReservation ? t('scheduleDialog.updating') : t('scheduleDialog.scheduling')}
                  </>
                ) : (
                  editingReservation ? t('scheduleDialog.updateMaintenance') : t('scheduleDialog.scheduleMaintenanceButton')
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>

    {/* Spare Vehicle Selection Dialog */}
    <Dialog open={showSpareDialog} onOpenChange={setShowSpareDialog}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Car className="h-5 w-5 text-orange-600" />
            {t('scheduleDialog.assignSpareVehiclesTitle')}
          </DialogTitle>
          <DialogDescription>
            {t('scheduleDialog.assignSpareDescription')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {conflictingReservations.map((reservation: any) => {
            // Check if this is an open-ended rental
            const isOpenEnded = !reservation.endDate || reservation.endDate === "undefined" || reservation.endDate === null;
            
            return (
              <div key={reservation.id} className={`p-4 border rounded-lg space-y-3 ${isOpenEnded ? 'bg-blue-50 border-blue-200' : ''}`}>
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-medium">
                      {reservation.customer?.name || t('scheduleDialog.unknownCustomer')}
                      {isOpenEnded && <span className="ml-2 text-blue-600 font-medium">{t('scheduleDialog.openEndedRental')}</span>}
                    </h4>
                    <p className="text-sm text-gray-600">
                      {t('scheduleDialog.reservationRange', { start: reservation.startDate })}{isOpenEnded ? <span className="font-medium text-blue-600">{t('scheduleDialog.noEndDate')}</span> : reservation.endDate}
                    </p>
                    <p className="text-sm text-gray-500">
                      {t('scheduleDialog.originalVehicle', { brand: reservation.vehicle?.brand, model: reservation.vehicle?.model, plate: formatLicensePlate(reservation.vehicle?.licensePlate) })}
                    </p>
                    {isOpenEnded && (
                      <p className="text-sm text-blue-600 mt-1">
                        {t('scheduleDialog.openEndedSpareHint')}
                      </p>
                    )}
                  </div>
                </div>
                
                <div>
                  <label className="text-sm font-medium">{t('scheduleDialog.transportSolution')}</label>
                  <div className="mt-1 space-y-2">
                    {/* Assign Spare - Now */}
                    <div className="flex items-center space-x-2 p-2 border rounded-md hover:bg-gray-50 cursor-pointer">
                      <input
                        type="radio"
                        id={`spare-now-${reservation.id}`}
                        name={`spare-option-${reservation.id}`}
                        value="spare-now"
                        checked={Boolean(spareVehicleAssignments[reservation.id] && spareVehicleAssignments[reservation.id] !== 'tbd' && spareVehicleAssignments[reservation.id] !== 'customer_arranging')}
                        onChange={() => {
                          // Just mark as "selecting spare" - don't pre-select a vehicle or open dialog
                          // Set a placeholder to show the vehicle selector
                          setSpareVehicleAssignments(prev => ({
                            ...prev,
                            [reservation.id]: 'selecting' as any
                          }));
                        }}
                        className="h-4 w-4 text-blue-600"
                        disabled={availableVehicles.length === 0}
                      />
                      <div className="flex-1">
                        <label htmlFor={`spare-now-${reservation.id}`} className="flex items-center gap-2 text-sm cursor-pointer">
                          <Car className="w-4 h-4 text-blue-500" />
                          <div>
                            <div className="font-medium text-blue-700">{t('scheduleDialog.assignSpareNowTitle')}</div>
                            <div className="text-xs text-blue-600">{t('scheduleDialog.assignSpareNowHint')}</div>
                          </div>
                        </label>
                        {availableVehicles.length === 0 && (
                          <div className="text-xs text-gray-500 mt-1">{t('scheduleDialog.noVehiclesAvailable')}</div>
                        )}
                        {(spareVehicleAssignments[reservation.id] && spareVehicleAssignments[reservation.id] !== 'tbd' && spareVehicleAssignments[reservation.id] !== 'customer_arranging') && (
                          <div className="mt-1 space-y-2" data-testid={`select-spare-vehicle-${reservation.id}`}>
                            <VehicleSelector
                              vehicles={availableVehicles}
                              value={spareVehicleAssignments[reservation.id] === 'selecting' ? '' : spareVehicleAssignments[reservation.id]?.toString() || ""}
                              onChange={(value) => {
                                const vehicleId = parseInt(value);
                                const hasDurationSet = Boolean(spareVehicleDurations[reservation.id]);
                                
                                // Update the vehicle assignment
                                setSpareVehicleAssignments(prev => ({
                                  ...prev,
                                  [reservation.id]: vehicleId
                                }));
                                
                                // Only open duration dialog if duration not yet set
                                if (!hasDurationSet) {
                                  const defaultStartDate = maintenanceData?.startDate || new Date().toISOString().split('T')[0];
                                  const defaultEndDate = maintenanceData?.endDate || '';
                                  setTempDurationStartDate(defaultStartDate);
                                  setTempDurationEndDate(defaultEndDate);
                                  setCurrentDurationReservationId(reservation.id);
                                  setShowDurationDialog(true);
                                }
                              }}
                              placeholder={t('scheduleDialog.chooseSpareVehiclePlaceholder')}
                              disabled={availableVehicles.length === 0}
                            />
                            {/* Show selected duration */}
                            {spareVehicleDurations[reservation.id] && (
                              <div className="flex items-center gap-2 p-2 bg-blue-50 border border-blue-200 rounded-md">
                                <Calendar className="w-4 h-4 text-blue-600" />
                                <div className="flex-1">
                                  <span className="text-sm font-medium text-blue-800">
                                    {t('scheduleDialog.spareRentalLabel', { start: formatDisplayDate(spareVehicleDurations[reservation.id].startDate) })}
                                    {spareVehicleDurations[reservation.id].endDate
                                      ? ` - ${formatDisplayDate(spareVehicleDurations[reservation.id].endDate!)}`
                                      : t('scheduleDialog.openEndedSuffix')}
                                  </span>
                                </div>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 px-2 text-blue-600 hover:text-blue-800"
                                  onClick={() => {
                                    setTempDurationStartDate(spareVehicleDurations[reservation.id].startDate);
                                    setTempDurationEndDate(spareVehicleDurations[reservation.id].endDate || '');
                                    setCurrentDurationReservationId(reservation.id);
                                    setShowDurationDialog(true);
                                  }}
                                >
                                  {t('scheduleDialog.edit')}
                                </Button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Assign Spare - Later (TBD) */}
                    <div className="flex items-center space-x-2 p-2 border rounded-md hover:bg-gray-50 cursor-pointer">
                      <input
                        type="radio"
                        id={`tbd-${reservation.id}`}
                        name={`spare-option-${reservation.id}`}
                        value="tbd"
                        checked={spareVehicleAssignments[reservation.id] === 'tbd'}
                        onChange={() => handleSpareVehicleChange(reservation.id, 'tbd')}
                        className="h-4 w-4 text-blue-600"
                      />
                      <label htmlFor={`tbd-${reservation.id}`} className="flex items-center gap-2 text-sm cursor-pointer flex-1">
                        <Clock className="w-4 h-4 text-orange-500" />
                        <div>
                          <div className="font-medium text-orange-700">{t('scheduleDialog.assignSpareLaterTitle')}</div>
                          <div className="text-xs text-orange-600">{t('scheduleDialog.assignSpareLaterHint')}</div>
                        </div>
                      </label>
                    </div>

                    {/* Customer Arranging Transport */}
                    <div className="flex items-center space-x-2 p-2 border rounded-md hover:bg-gray-50 cursor-pointer">
                      <input
                        type="radio"
                        id={`customer-arranging-${reservation.id}`}
                        name={`spare-option-${reservation.id}`}
                        value="customer_arranging"
                        checked={spareVehicleAssignments[reservation.id] === 'customer_arranging'}
                        onChange={() => handleSpareVehicleChange(reservation.id, 'customer_arranging')}
                        className="h-4 w-4 text-blue-600"
                      />
                      <label htmlFor={`customer-arranging-${reservation.id}`} className="flex items-center gap-2 text-sm cursor-pointer flex-1">
                        <AlertTriangle className="w-4 h-4 text-green-500" />
                        <div>
                          <div className="font-medium text-green-700">{t('scheduleDialog.customerArrangingTitle')}</div>
                          <div className="text-xs text-green-600">{t('scheduleDialog.customerArrangingHint')}</div>
                        </div>
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              setShowSpareDialog(false);
              setConflictingReservations([]);
              setMaintenanceData(null);
              setSpareVehicleAssignments({});
              setSpareVehicleDurations({});
            }}
            disabled={createMaintenanceWithSpareMutation.isPending}
          >
            {t('common:actions.cancel')}
          </Button>
          <Button
            onClick={handleSpareVehicleAssignment}
            disabled={createMaintenanceWithSpareMutation.isPending}
            data-testid="button-assign-spare-vehicles"
          >
            {createMaintenanceWithSpareMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t('scheduleDialog.assigning')}
              </>
            ) : (
              t('scheduleDialog.assignSpareAndScheduleButton')
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Spare Vehicle Duration Selection Dialog */}
    <Dialog open={showDurationDialog} onOpenChange={(open) => {
      if (!open) handleCancelDuration();
    }}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-blue-600" />
            {t('scheduleDialog.setSpareRentalDurationTitle')}
          </DialogTitle>
          <DialogDescription>
            {t('scheduleDialog.durationDialogDescription')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">{t('scheduleDialog.startDate')}</label>
            <Input
              type="date"
              value={tempDurationStartDate}
              onChange={(e) => setTempDurationStartDate(e.target.value)}
              data-testid="input-spare-start-date"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">{t('scheduleDialog.endDateOptional')}</label>
            <Input
              type="date"
              value={tempDurationEndDate}
              onChange={(e) => setTempDurationEndDate(e.target.value)}
              data-testid="input-spare-end-date"
            />
            <p className="text-xs text-gray-500">{t('scheduleDialog.leaveEmptyOpenEnded')}</p>
          </div>

          {/* Quick actions */}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setTempDurationStartDate(maintenanceData?.startDate || '');
                setTempDurationEndDate(maintenanceData?.endDate || '');
              }}
            >
              {t('scheduleDialog.useMaintenanceDates')}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setTempDurationEndDate('')}
            >
              {t('scheduleDialog.makeOpenEnded')}
            </Button>
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={handleCancelDuration}
          >
            {t('common:actions.cancel')}
          </Button>
          <Button
            type="button"
            onClick={handleSaveDuration}
            disabled={!tempDurationStartDate}
            data-testid="button-save-duration"
          >
            {t('scheduleDialog.saveDuration')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>
  );
}