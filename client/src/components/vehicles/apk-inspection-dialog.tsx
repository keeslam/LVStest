import { useState, useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest , invalidateByPrefix } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Vehicle, Reservation } from "@shared/schema";
import { formatLicensePlate } from "@/lib/format-utils";
import { format, addDays, parseISO, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isSameMonth, startOfWeek, endOfWeek } from "date-fns";

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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Calendar, Wrench, AlertTriangle, Clock, ChevronLeft, ChevronRight, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const apkInspectionSchema = z.object({
  scheduledDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Please enter a valid date (YYYY-MM-DD)").min(1, "Date is required"),
  duration: z.number().min(1, "Duration must be at least 1 day").max(7, "APK inspection should not exceed 7 days"),
  notes: z.string().optional(),
  needsSpareVehicle: z.boolean().default(false),
});

type ApkInspectionFormData = z.infer<typeof apkInspectionSchema>;

interface ApkInspectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vehicle: Vehicle;
  onSuccess?: () => void;
}

export function ApkInspectionDialog({ open, onOpenChange, vehicle, onSuccess }: ApkInspectionDialogProps) {
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<ApkInspectionFormData>({
    resolver: zodResolver(apkInspectionSchema),
    mode: "onChange",
    defaultValues: {
      scheduledDate: "",
      duration: 1,
      notes: "",
      needsSpareVehicle: false,
    },
  });

  // Fetch all maintenance reservations to show on calendar
  const { data: maintenanceReservations = [] } = useQuery<Reservation[]>({
    queryKey: ['/api/reservations'],
    select: (data) => data.filter(r => r.type === 'maintenance_block'),
  });

  // Fetch active rentals for this vehicle to check for conflicts
  const { data: vehicleRentals = [] } = useQuery<Reservation[]>({
    queryKey: [`/api/reservations/vehicle/${vehicle.id}`],
    enabled: open,
    select: (data) => data.filter(r => 
      r.type === 'standard' && 
      (r.status === 'booked' || r.status === 'picked_up')
    ),
  });

  // Generate calendar days
  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(calendarMonth);
    const monthEnd = endOfMonth(calendarMonth);
    const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 }); // Start week on Monday
    const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });

    return eachDayOfInterval({ start: calendarStart, end: calendarEnd });
  }, [calendarMonth]);

  // Get maintenance count for each day
  const getMaintenanceForDay = (day: Date) => {
    return maintenanceReservations.filter(m => {
      const start = parseISO(m.startDate);
      const end = m.endDate ? parseISO(m.endDate) : start;
      return day >= start && day <= end;
    });
  };

  // Check if APK period overlaps with any active rental
  const checkRentalConflict = (apkStartDate: string, duration: number) => {
    if (!apkStartDate || !duration) return null;
    
    const apkStart = parseISO(apkStartDate);
    const apkEnd = addDays(apkStart, duration - 1);
    
    return vehicleRentals.find(rental => {
      const rentalStart = parseISO(rental.startDate);
      const rentalEnd = rental.endDate ? parseISO(rental.endDate) : addDays(new Date(), 365); // Open-ended rentals
      
      // Check if ranges overlap
      return (apkStart <= rentalEnd && apkEnd >= rentalStart);
    });
  };

  // Watch for date/duration changes to detect conflicts (but don't auto-check)
  const scheduledDate = form.watch('scheduledDate');
  const duration = form.watch('duration');

  // Schedule APK inspection mutation
  const scheduleApkMutation = useMutation({
    mutationFn: async (data: ApkInspectionFormData) => {
      // Create the maintenance block
      const maintenanceData = {
        vehicleId: vehicle.id,
        customerId: null,
        startDate: data.scheduledDate,
        endDate: data.scheduledDate,
        status: "scheduled",
        type: "maintenance_block",
        notes: `apk_inspection:\n${data.notes || "Scheduled APK inspection"}`,
        totalPrice: 0,
        maintenanceDuration: data.duration,
        maintenanceStatus: "scheduled",
      };

      const response = await apiRequest("POST", "/api/reservations", maintenanceData);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to schedule APK inspection");
      }
      
      const maintenanceBlock = await response.json();

      // If spare vehicle is needed and there's a conflicting rental, create placeholder
      if (data.needsSpareVehicle) {
        const conflictingRental = checkRentalConflict(data.scheduledDate, data.duration);
        if (conflictingRental) {
          // Create a placeholder spare vehicle reservation
          const spareData = {
            vehicleId: null, // Placeholder - no vehicle assigned yet
            customerId: conflictingRental.customerId,
            driverId: conflictingRental.driverId,
            startDate: data.scheduledDate,
            endDate: format(addDays(parseISO(data.scheduledDate), data.duration - 1), 'yyyy-MM-dd'),
            status: "pending",
            type: "replacement",
            replacementForReservationId: conflictingRental.id,
            placeholderSpare: true,
            spareVehicleStatus: "assigned",
            notes: `Spare vehicle needed during APK inspection`,
            totalPrice: 0,
          };

          const spareResponse = await apiRequest("POST", "/api/reservations", spareData);
          if (!spareResponse.ok) {
            console.error("Failed to create spare vehicle placeholder");
          }
        }
      }

      return maintenanceBlock;
    },
    onSuccess: (data, variables) => {
      const needsSpare = variables.needsSpareVehicle && checkRentalConflict(variables.scheduledDate, variables.duration);
      
      toast({
        title: "APK Inspection Scheduled",
        description: needsSpare 
          ? `APK inspection scheduled. Spare vehicle assignment created and added to assignment queue.`
          : `APK inspection for ${formatLicensePlate(vehicle.licensePlate)} has been scheduled successfully.`,
      });
      
      // Clear any localStorage dismissal for this vehicle's APK notification
      // This ensures if the user deletes the maintenance, the notification will reappear
      localStorage.removeItem(`dismissed_apk_${vehicle.id}`);
      
      invalidateByPrefix('/api/reservations');
      invalidateByPrefix(`/api/vehicles/${vehicle.id}`);
      invalidateByPrefix('/api/vehicles/apk-expiring');
      invalidateByPrefix('/api/placeholder-reservations/needing-assignment');
      invalidateByPrefix('/api/custom-notifications/unread');
      form.reset();
      setSelectedDate(null);
      onOpenChange(false);
      onSuccess?.();
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: ApkInspectionFormData) => {
    scheduleApkMutation.mutate(data);
  };

  // Handle date selection from calendar
  const handleDateSelect = (day: Date) => {
    setSelectedDate(day);
    const dateString = format(day, 'yyyy-MM-dd');
    form.setValue('scheduledDate', dateString, { shouldValidate: true, shouldDirty: true });
  };

  // Navigate calendar months
  const previousMonth = () => {
    setCalendarMonth(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };

  const nextMonth = () => {
    setCalendarMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };

  // Reset when dialog opens
  useEffect(() => {
    if (open) {
      form.reset();
      setSelectedDate(null);
      setCalendarMonth(new Date());
    }
  }, [open, form]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[1200px] max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wrench className="h-5 w-5" />
            Schedule APK Inspection - {formatLicensePlate(vehicle.licensePlate)}
          </DialogTitle>
          <DialogDescription>
            Select a date from the workshop calendar and schedule the APK inspection. Existing maintenance is shown to avoid conflicts.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[calc(90vh-200px)]">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 py-2 pr-4">
            {/* Calendar View */}
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center justify-between">
                    <span>Workshop Calendar</span>
                    <div className="flex items-center gap-2">
                      <Button variant="ghost" size="sm" onClick={previousMonth}>
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <span className="text-sm font-normal">
                        {format(calendarMonth, 'MMMM yyyy')}
                      </span>
                      <Button variant="ghost" size="sm" onClick={nextMonth}>
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardTitle>
                  <CardDescription>Click a date to schedule APK inspection</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-7 gap-1">
                    {/* Day headers */}
                    {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => (
                      <div key={day} className="text-center text-xs font-medium text-gray-500 py-2">
                        {day}
                      </div>
                    ))}
                    
                    {/* Calendar days */}
                    {calendarDays.map((day, index) => {
                      const isCurrentMonth = isSameMonth(day, calendarMonth);
                      const isToday = isSameDay(day, new Date());
                      const isSelected = selectedDate && isSameDay(day, selectedDate);
                      const maintenanceCount = getMaintenanceForDay(day).length;
                      const isPast = day < new Date() && !isToday;
                      
                      return (
                        <button
                          key={index}
                          type="button"
                          onClick={() => !isPast && handleDateSelect(day)}
                          disabled={isPast}
                          className={`
                            aspect-square p-1 text-sm rounded-md transition-colors relative
                            ${!isCurrentMonth ? 'text-gray-300' : ''}
                            ${isToday ? 'bg-blue-100 font-bold' : ''}
                            ${isSelected ? 'bg-green-500 text-white' : ''}
                            ${!isPast && !isSelected ? 'hover:bg-gray-100' : ''}
                            ${isPast ? 'opacity-40 cursor-not-allowed' : ''}
                          `}
                        >
                          <div className="flex flex-col items-center justify-center h-full">
                            <span>{format(day, 'd')}</span>
                            {maintenanceCount > 0 && (
                              <Badge 
                                variant="secondary" 
                                className={`text-[8px] px-1 py-0 h-4 mt-0.5 ${
                                  maintenanceCount >= 3 ? 'bg-red-100 text-red-800' : 
                                  maintenanceCount >= 2 ? 'bg-amber-100 text-amber-800' : 
                                  'bg-blue-100 text-blue-800'
                                }`}
                              >
                                {maintenanceCount}
                              </Badge>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  
                  {/* Legend */}
                  <div className="mt-4 pt-4 border-t space-y-2">
                    <p className="text-xs font-medium text-gray-500">Legend:</p>
                    <div className="flex flex-wrap gap-3 text-xs">
                      <div className="flex items-center gap-1">
                        <div className="w-4 h-4 bg-green-500 rounded"></div>
                        <span>Selected</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <div className="w-4 h-4 bg-blue-100 rounded"></div>
                        <span>Today</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Badge variant="secondary" className="bg-blue-100 text-blue-800 text-[8px] px-1 h-4">1</Badge>
                        <span>Low (1)</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Badge variant="secondary" className="bg-amber-100 text-amber-800 text-[8px] px-1 h-4">2</Badge>
                        <span>Medium (2)</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Badge variant="secondary" className="bg-red-100 text-red-800 text-[8px] px-1 h-4">3+</Badge>
                        <span>Busy (3+)</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Selected Date Maintenance */}
              {selectedDate && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">
                      Scheduled for {format(selectedDate, 'MMMM d, yyyy')}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {getMaintenanceForDay(selectedDate).length > 0 ? (
                      <div className="space-y-2">
                        {getMaintenanceForDay(selectedDate).map(m => {
                          // Parse maintenance type from notes field (format: "maintenanceType: description\nnotes")
                          const maintenanceType = m.notes?.split(':')[0] || 'maintenance';
                          
                          return (
                            <div key={m.id} className="flex items-center gap-2 p-2 bg-gray-50 rounded text-sm">
                              <Wrench className="h-4 w-4 text-gray-500" />
                              <div className="flex-1">
                                <p className="font-medium">{formatLicensePlate(m.vehicle?.licensePlate || 'N/A')}</p>
                                <p className="text-xs text-gray-500 capitalize">{maintenanceType.replace(/_/g, ' ')}</p>
                              </div>
                              <Badge variant={m.maintenanceStatus === 'scheduled' ? 'outline' : 'default'}>
                                {m.maintenanceStatus}
                              </Badge>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-500 flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                        No maintenance scheduled - Workshop available
                      </p>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Form */}
            <div>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
                  <FormField
                    control={form.control}
                    name="scheduledDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Selected Date *</FormLabel>
                        <FormControl>
                          <Input 
                            type="date" 
                            {...field} 
                            className="font-mono"
                            data-testid="input-apk-date"
                          />
                        </FormControl>
                        <FormDescription>
                          Select from calendar or enter date manually
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="duration"
                    render={({ field: { onChange, value, ...rest } }) => (
                      <FormItem>
                        <FormLabel>Duration (days) *</FormLabel>
                        <FormControl>
                          <Input 
                            type="number" 
                            min="1" 
                            max="7"
                            {...rest}
                            value={value || ''}
                            onChange={(e) => onChange(e.target.value ? parseInt(e.target.value) : 1)}
                            data-testid="input-apk-duration"
                          />
                        </FormControl>
                        <FormDescription>
                          How many days will the APK inspection take? (1-7 days)
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="notes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Notes</FormLabel>
                        <FormControl>
                          <Textarea 
                            {...field}
                            placeholder="Additional notes about the APK inspection..."
                            rows={2}
                            data-testid="textarea-apk-notes"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Rental Conflict Warning */}
                  {(() => {
                    const conflictingRental = scheduledDate && duration ? checkRentalConflict(scheduledDate, duration) : null;
                    if (conflictingRental) {
                      return (
                        <div className="bg-orange-50 border border-orange-200 rounded-md p-4">
                          <div className="flex gap-2">
                            <AlertTriangle className="h-5 w-5 text-orange-600 flex-shrink-0 mt-0.5" />
                            <div className="text-sm space-y-2">
                              <p className="font-medium text-orange-900">Active Rental Detected</p>
                              <p className="text-orange-700">
                                This vehicle has an active rental during the APK inspection period:
                              </p>
                              <div className="bg-orange-100 rounded p-2 space-y-1">
                                <p className="font-medium text-orange-900">
                                  {conflictingRental.customer?.name || 'Customer'}
                                </p>
                                <p className="text-orange-700 text-xs">
                                  Rental: {format(parseISO(conflictingRental.startDate), 'MMM d, yyyy')} - 
                                  {conflictingRental.endDate ? format(parseISO(conflictingRental.endDate), 'MMM d, yyyy') : 'Open-ended'}
                                </p>
                              </div>
                              <p className="text-orange-700 font-medium">
                                ⚠️ A spare vehicle assignment will be required for this customer.
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    }
                    return null;
                  })()}

                  <FormField
                    control={form.control}
                    name="needsSpareVehicle"
                    render={({ field }) => {
                      const conflictingRental = scheduledDate && duration ? checkRentalConflict(scheduledDate, duration) : null;
                      return (
                        <FormItem className={`flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4 ${conflictingRental ? 'border-orange-300 bg-orange-50' : ''}`}>
                          <FormControl>
                            <input
                              type="checkbox"
                              checked={field.value}
                              onChange={field.onChange}
                              className="h-4 w-4 rounded border-gray-300"
                              data-testid="checkbox-needs-spare"
                            />
                          </FormControl>
                          <div className="space-y-1 leading-none">
                            <FormLabel className={conflictingRental ? 'text-orange-900 font-semibold' : ''}>
                              Request Spare Vehicle Assignment
                            </FormLabel>
                            <FormDescription className={conflictingRental ? 'text-orange-700' : ''}>
                              {conflictingRental 
                                ? 'Creates a spare vehicle assignment request - you can assign a vehicle now or later from the Spare Assignments tab' 
                                : 'Check this to create a spare vehicle assignment request (optional - customer may arrange their own transportation)'}
                            </FormDescription>
                          </div>
                        </FormItem>
                      );
                    }}
                  />

                  <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
                    <div className="flex gap-2">
                      <AlertTriangle className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
                      <div className="text-sm">
                        <p className="font-medium text-blue-900">APK Inspection Details</p>
                        <p className="text-blue-700 mt-1">
                          Vehicle: <strong>{vehicle.brand} {vehicle.model}</strong> ({formatLicensePlate(vehicle.licensePlate)})
                        </p>
                        <p className="text-blue-700">
                          Current APK Date: <strong>{vehicle.apkDate ? format(parseISO(vehicle.apkDate), 'MMM d, yyyy') : 'Not set'}</strong>
                        </p>
                      </div>
                    </div>
                  </div>
                </form>
              </Form>
            </div>
          </div>
        </ScrollArea>

        <DialogFooter>
          <Button 
            variant="outline" 
            onClick={() => onOpenChange(false)}
            data-testid="button-cancel-apk"
          >
            Cancel
          </Button>
          <Button 
            onClick={form.handleSubmit(onSubmit)}
            disabled={scheduleApkMutation.isPending || !form.formState.isValid}
            data-testid="button-schedule-apk"
          >
            {scheduleApkMutation.isPending ? (
              <>
                <Clock className="mr-2 h-4 w-4 animate-spin" />
                Scheduling...
              </>
            ) : (
              <>
                <Calendar className="mr-2 h-4 w-4" />
                Schedule APK Inspection
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
