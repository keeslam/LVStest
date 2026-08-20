import { useState, useMemo, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, addDays, subDays, addWeeks, isSameDay, parseISO, startOfMonth, endOfMonth, getDate, getDay, getMonth, getYear, isSameMonth, addMonths, subMonths, startOfDay, endOfDay, isBefore, isAfter, differenceInDays, startOfWeek, endOfWeek, eachDayOfInterval } from "date-fns";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import { Vehicle, Reservation } from "@shared/schema";
import { displayLicensePlate } from "@/lib/utils";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ScheduleMaintenanceDialog } from "@/components/maintenance/schedule-maintenance-dialog";
import { MaintenanceEditDialog } from "@/components/maintenance/maintenance-edit-dialog";
import { MaintenanceListDialog } from "@/components/maintenance/maintenance-list-dialog";
import { VehicleViewDialog } from "@/components/vehicles/vehicle-view-dialog";
import { MaintenanceViewDialog } from "@/components/maintenance/maintenance-view-dialog";
import { formatLicensePlate } from "@/lib/format-utils";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, invalidateRelatedQueries } from "@/lib/queryClient";
import { ColorCodingDialog } from "@/components/calendar/color-coding-dialog";
import { CalendarLegend } from "@/components/calendar/calendar-legend";
import { getCustomMaintenanceStyle, getCustomMaintenanceStyleObject } from "@/lib/calendar-styling";
import { ChevronLeft, ChevronRight, Calendar, Car, Wrench, AlertTriangle, Clock, Plus, Eye, Edit, Trash2, Palette } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

// Holiday names for display
const DUTCH_HOLIDAY_NAMES: Record<string, string> = {
  nieuwjaarsdag: "Nieuwjaarsdag",
  goede_vrijdag: "Goede Vrijdag",
  eerste_paasdag: "Eerste Paasdag",
  tweede_paasdag: "Tweede Paasdag",
  koningsdag: "Koningsdag",
  bevrijdingsdag: "Bevrijdingsdag",
  hemelvaartsdag: "Hemelvaartsdag",
  eerste_pinksterdag: "Eerste Pinksterdag",
  tweede_pinksterdag: "Tweede Pinksterdag",
  eerste_kerstdag: "Eerste Kerstdag",
  tweede_kerstdag: "Tweede Kerstdag",
};

// Calendar view options
type CalendarView = "month";

// Calendar configuration
const COLUMNS = 4;

// Type for filters
type MaintenanceFilters = {
  search: string;
  type: string;
  eventType: string;
};

interface MaintenanceEvent {
  id: string | number;
  vehicleId: number;
  vehicle: Vehicle;
  type: 'apk_due' | 'apk_reminder_2m' | 'apk_reminder_1m' | 'warranty_expiring' | 'warranty_reminder_2m' | 'warranty_reminder_1m' | 'scheduled_maintenance' | 'in_service';
  date: string;
  startDate?: string;
  endDate?: string;
  title: string;
  description: string;
  needsSpareVehicle?: boolean;
  hasUpcomingRentals?: boolean;
  currentReservations?: Reservation[];
  priority?: 'low' | 'medium' | 'high' | 'urgent';
}

export default function MaintenanceCalendar() {
  // Query client for cache invalidation
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const [view, setView] = useState<CalendarView>("month");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [maintenanceFilters, setMaintenanceFilters] = useState<MaintenanceFilters>({
    search: "",
    type: "all",
    eventType: "all"
  });
  
  // Dialog states
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [isScheduleDialogOpen, setIsScheduleDialogOpen] = useState(false);
  const [selectedReservation, setSelectedReservation] = useState<Reservation | null>(null);
  const [editingReservation, setEditingReservation] = useState<Reservation | null>(null);
  const [selectedScheduleDate, setSelectedScheduleDate] = useState<string | null>(null);
  const [selectedVehicleIdForSchedule, setSelectedVehicleIdForSchedule] = useState<number | null>(null);
  const [selectedMaintenanceTypeForSchedule, setSelectedMaintenanceTypeForSchedule] = useState<"breakdown" | "tire_replacement" | "brake_service" | "engine_repair" | "transmission_repair" | "electrical_issue" | "air_conditioning" | "battery_replacement" | "oil_change" | "regular_maintenance" | "apk_inspection" | "warranty_service" | "accident_damage" | "other" | null>(null);
  
  // Day dialog for maintenance events
  const [dayDialogOpen, setDayDialogOpen] = useState(false);
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  
  // Delete confirmation dialog
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [reservationToDelete, setReservationToDelete] = useState<Reservation | null>(null);
  
  // Color coding dialog
  const [colorDialogOpen, setColorDialogOpen] = useState(false);
  
  // Maintenance list dialog
  const [maintenanceListDialogOpen, setMaintenanceListDialogOpen] = useState(false);
  
  // Completed maintenance dialog
  const [completedMaintenanceDialogOpen, setCompletedMaintenanceDialogOpen] = useState(false);
  
  // Vehicle view dialog
  const [vehicleViewDialogOpen, setVehicleViewDialogOpen] = useState(false);
  const [selectedVehicleId, setSelectedVehicleId] = useState<number | null>(null);
  
  // Maintenance reservation view dialog
  const [maintenanceReservationDialogOpen, setMaintenanceReservationDialogOpen] = useState(false);
  const [selectedMaintenanceReservationId, setSelectedMaintenanceReservationId] = useState<number | null>(null);
  
  // Warranty date dialog
  const [warrantyDateDialogOpen, setWarrantyDateDialogOpen] = useState(false);
  const [warrantyDateInput, setWarrantyDateInput] = useState<string>('');
  const [apkDateInput, setApkDateInput] = useState<string>('');
  const [completingReservation, setCompletingReservation] = useState<any>(null);
  const [apkFormFile, setApkFormFile] = useState<File | null>(null);
  const [maintenanceDetails, setMaintenanceDetails] = useState<string>('');
  const [maintenanceCategory, setMaintenanceCategory] = useState<string>('scheduled_maintenance');
  const [currentMileage, setCurrentMileage] = useState<string>('');
  
  // Calculate next APK date based on vehicle type and age
  const calculateNextApkDate = (vehicle: Vehicle, completionDate: Date = new Date()): string => {
    if (!vehicle.productionDate && !vehicle.apkDate) {
      // Default to 1 year if we don't have production date
      const nextDate = new Date(completionDate);
      nextDate.setFullYear(nextDate.getFullYear() + 1);
      return format(nextDate, 'yyyy-MM-dd');
    }
    
    // Use apkDate if available for determining current cycle, otherwise use productionDate
    const referenceDate = vehicle.apkDate 
      ? parseISO(vehicle.apkDate) 
      : vehicle.productionDate 
        ? parseISO(vehicle.productionDate) 
        : null;
    
    if (!referenceDate) {
      // Default to 1 year if we can't determine reference date
      const nextDate = new Date(completionDate);
      nextDate.setFullYear(nextDate.getFullYear() + 1);
      return format(nextDate, 'yyyy-MM-dd');
    }
    
    // Calculate vehicle age from production date
    const productionDate = vehicle.productionDate ? parseISO(vehicle.productionDate) : null;
    const vehicleAgeYears = productionDate 
      ? differenceInDays(completionDate, productionDate) / 365.25 
      : 0;
    
    const fuel = vehicle.fuel?.toLowerCase() || '';
    const isDieselOrLpg = fuel.includes('diesel') || fuel.includes('lpg');
    const isPetrolOrElectric = fuel.includes('petrol') || fuel.includes('benzine') || fuel.includes('electric');
    
    let yearsToAdd = 1; // Default to annual
    
    if (isDieselOrLpg) {
      // Diesel/LPG: First inspection after 3 years, then annually
      if (vehicleAgeYears < 3) {
        yearsToAdd = 3 - Math.floor(vehicleAgeYears);
      } else {
        yearsToAdd = 1;
      }
    } else if (isPetrolOrElectric) {
      // Petrol/Electric: First inspection after 4 years, then every 2 years until 8 years, then annually
      if (vehicleAgeYears < 4) {
        yearsToAdd = 4 - Math.floor(vehicleAgeYears);
      } else if (vehicleAgeYears < 8) {
        yearsToAdd = 2;
      } else {
        yearsToAdd = 1;
      }
    }
    
    const nextDate = new Date(completionDate);
    nextDate.setFullYear(nextDate.getFullYear() + yearsToAdd);
    return format(nextDate, 'yyyy-MM-dd');
  };
  
  // Dialog handlers
  const handleViewMaintenanceEvent = (reservation: Reservation) => {
    console.log('handleViewMaintenanceEvent called with:', reservation);
    setSelectedReservation(reservation);
    setViewDialogOpen(true);
  };
  
  const handleEditMaintenance = (reservation: Reservation) => {
    console.log('handleEditMaintenance called with:', reservation);
    setSelectedReservation(reservation);
    setEditDialogOpen(true);
    console.log('Edit dialog should be open now');
  };

  const handleDeleteMaintenance = async (reservation: Reservation) => {
    try {
      const response = await apiRequest("DELETE", `/api/reservations/${reservation.id}`);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to delete maintenance reservation');
      }

      // Create descriptive vehicle info for toast
      const vehicleInfo = reservation.vehicle 
        ? `${reservation.vehicle.brand} ${reservation.vehicle.model} (${displayLicensePlate(reservation.vehicle.licensePlate)})`
        : `Vehicle ${reservation.vehicleId}`;

      // Clear localStorage dismissals for APK/warranty notifications when deleting that type
      // This ensures the notification will reappear after deletion
      const notes = reservation.notes?.toLowerCase() || '';
      if (notes.includes('apk_inspection:') || notes.includes('apk')) {
        localStorage.removeItem(`dismissed_apk_${reservation.vehicleId}`);
      } else if (notes.includes('warranty_service:') || notes.includes('warranty') || notes.includes('garantie')) {
        localStorage.removeItem(`dismissed_warranty_${reservation.vehicleId}`);
      }

      // Show success toast
      toast({
        title: "Maintenance deleted",
        description: `Maintenance for ${vehicleInfo} has been deleted successfully.`,
      });

      invalidateRelatedQueries('reservations');
      invalidateRelatedQueries('vehicles');

      // Close dialogs if open
      setDeleteDialogOpen(false);
      setDayDialogOpen(false);
      setViewDialogOpen(false);
      setEditDialogOpen(false);
      setSelectedReservation(null);
      setReservationToDelete(null);
      
    } catch (error) {
      console.error('Error deleting maintenance:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to delete maintenance reservation",
        variant: "destructive",
      });
    }
  };
  
  const handleCloseDialogs = () => {
    console.log('Closing all dialogs');
    setViewDialogOpen(false);
    setEditDialogOpen(false);
    setSelectedReservation(null);
  };
  
  // Day dialog handlers
  const openDayDialog = (day: Date) => {
    console.log('Opening maintenance day dialog for:', day);
    setSelectedDay(day);
    setDayDialogOpen(true);
  };
  
  const closeDayDialog = () => {
    console.log('Closing maintenance day dialog');
    setDayDialogOpen(false);
    setSelectedDay(null);
  };
  
  // Function to open schedule dialog from a maintenance event
  const openScheduleFromEvent = (event: { date?: string; startDate?: string; vehicleId: number; type: string }) => {
    const maintenanceTypeMap: Record<string, "apk_inspection" | "warranty_service"> = {
      'apk_due': 'apk_inspection',
      'apk_reminder_2m': 'apk_inspection',
      'apk_reminder_1m': 'apk_inspection',
      'warranty_expiring': 'warranty_service',
      'warranty_reminder_2m': 'warranty_service',
      'warranty_reminder_1m': 'warranty_service',
    };
    
    // Use startDate if available, fallback to date - never pass undefined
    const scheduleDate = event.startDate || event.date;
    if (scheduleDate && scheduleDate !== 'undefined') {
      setSelectedScheduleDate(scheduleDate);
    }
    setSelectedVehicleIdForSchedule(event.vehicleId);
    setSelectedMaintenanceTypeForSchedule(maintenanceTypeMap[event.type] || 'breakdown');
    setIsScheduleDialogOpen(true);
  };
  
  // Calculate date ranges for month view
  const dateRanges = useMemo(() => {
    // Month view calculations
    const start = startOfMonth(currentDate);
    const end = endOfMonth(currentDate);
    
    // Get the first Monday before or on the first day of the month
    const firstDay = new Date(start);
    const firstDayOfWeek = getDay(firstDay) || 7; // Convert Sunday (0) to 7
    firstDay.setDate(firstDay.getDate() - ((firstDayOfWeek - 1) || 0));
    
    // Get the last Sunday after or on the last day of the month
    const lastDay = new Date(end);
    const lastDayOfWeek = getDay(lastDay) || 7; // Convert Sunday (0) to 7
    lastDay.setDate(lastDay.getDate() + (7 - lastDayOfWeek));
    
    // Generate all days in the calendar grid, but only weekdays
    const dayCount = differenceInDays(lastDay, firstDay) + 1;
    const allDays = Array.from({ length: dayCount }, (_, i) => addDays(firstDay, i));
    const days = allDays.filter(day => {
      const dayOfWeek = getDay(day);
      return dayOfWeek >= 1 && dayOfWeek <= 5; // Monday to Friday only
    });
    
    const rangeText = format(currentDate, "MMMM yyyy");
    
    return { start, end, days, rangeText };
  }, [currentDate]);
  
  // Fetch vehicles
  const { data: vehicles, isLoading: isLoadingVehicles } = useQuery<Vehicle[]>({
    queryKey: ["/api/vehicles"],
  });
  
  // Fetch vehicles with maintenance needs
  const { data: apkExpiringVehicles = [] } = useQuery<Vehicle[]>({
    queryKey: ['/api/vehicles/apk-expiring'],
  });

  const { data: warrantyExpiringVehicles = [] } = useQuery<Vehicle[]>({
    queryKey: ['/api/vehicles/warranty-expiring'],
  });

  // Fetch reservations for the full calendar view (including adjacent month dates)
  const { data: reservations, isLoading: isLoadingReservations } = useQuery<Reservation[]>({
    queryKey: [
      "/api/reservations/range", 
      {
        startDate: format(dateRanges.days[0], "yyyy-MM-dd"),
        endDate: format(dateRanges.days[dateRanges.days.length - 1], "yyyy-MM-dd")
      }
    ],
  });

  // Fetch scheduled maintenance blocks (reservations with type maintenance_block)
  const { data: maintenanceBlocks = [] } = useQuery<Reservation[]>({
    queryKey: ['/api/reservations'],
    select: (reservations: Reservation[]) => 
      reservations.filter(r => r.type === 'maintenance_block' && r.maintenanceStatus !== 'out') // Exclude completed maintenance
  });

  // Fetch completed maintenance blocks separately
  const { data: completedMaintenanceBlocks = [] } = useQuery<Reservation[]>({
    queryKey: ['/api/reservations'],
    select: (reservations: Reservation[]) => 
      reservations.filter(r => r.type === 'maintenance_block' && r.maintenanceStatus === 'out') // Only completed maintenance
  });

  // Fetch calendar settings for holidays and blocked dates
  const { data: calendarSettings } = useQuery<{ key: string; value: any } | null>({
    queryKey: ["/api/app-settings/key/calendar_settings"],
  });

  // Fetch system settings for maintenance calendar display options
  const { data: systemSettings } = useQuery<{
    showApkReminders?: boolean;
    showWarrantyReminders?: boolean;
    showMaintenanceBlocks?: boolean;
    maintenanceExcludedStatuses?: string[];
  }>({
    queryKey: ["/api/system-settings"],
  });

  // Apply show/hide settings - default to showing all if settings not loaded
  const showApkReminders = systemSettings?.showApkReminders ?? true;
  const showWarrantyReminders = systemSettings?.showWarrantyReminders ?? true;
  const showMaintenanceBlocks = systemSettings?.showMaintenanceBlocks ?? true;
  const maintenanceExcludedStatuses = systemSettings?.maintenanceExcludedStatuses || ["not_for_rental"];

  // Filter APK and warranty vehicles based on settings
  const filteredApkExpiringVehicles = showApkReminders ? apkExpiringVehicles : [];
  const filteredWarrantyExpiringVehicles = showWarrantyReminders ? warrantyExpiringVehicles : [];
  const filteredMaintenanceBlocks = showMaintenanceBlocks ? maintenanceBlocks : [];

  // Filter vehicles based on excluded statuses for maintenance reminders
  const vehiclesForMaintenance = useMemo(() => {
    if (!vehicles) return [];
    return vehicles.filter(v => !maintenanceExcludedStatuses.includes(v.availabilityStatus || 'available'));
  }, [vehicles, maintenanceExcludedStatuses]);

  // Helper to check if a date is a holiday or blocked
  const getDateStatus = useMemo(() => {
    return (day: Date): { isHoliday: boolean; isBlocked: boolean; holidayName?: string; blockedReason?: string } => {
      const dateStr = format(day, "yyyy-MM-dd");
      let isHoliday = false;
      let isBlocked = false;
      let holidayName: string | undefined;
      let blockedReason: string | undefined;
      
      // Get settings value from single object response
      const settings = calendarSettings?.value;
      
      if (settings) {
        // Use allHolidayDates for efficient O(1) multi-year holiday lookup
        const allHolidayDates = settings.allHolidayDates;
        if (allHolidayDates && allHolidayDates[dateStr]) {
          const holiday = allHolidayDates[dateStr];
          if (holiday.enabled) {
            isHoliday = true;
            holidayName = DUTCH_HOLIDAY_NAMES[holiday.holidayKey] || holiday.holidayKey;
          }
        } else {
          // Fallback to dutchHolidays for backward compatibility
          const dutchHolidays = settings.dutchHolidays;
          if (dutchHolidays) {
            for (const [key, value] of Object.entries(dutchHolidays)) {
              // Handle both old format (boolean) and new format (object with enabled+date)
              if (typeof value === 'object' && value !== null && 'enabled' in value && 'date' in value) {
                const holiday = value as { enabled: boolean; date: string };
                if (holiday.enabled && holiday.date === dateStr) {
                  isHoliday = true;
                  holidayName = DUTCH_HOLIDAY_NAMES[key] || key;
                  break;
                }
              }
            }
          }
        }
        
        // Check custom holidays
        const customHolidays = settings.holidays;
        if (customHolidays && Array.isArray(customHolidays)) {
          for (const holiday of customHolidays) {
            if (holiday.date === dateStr) {
              isHoliday = true;
              holidayName = holiday.name;
              break;
            }
          }
        }
        
        // Check blocked dates
        const blockedDates = settings.blockedDates;
        if (blockedDates && Array.isArray(blockedDates)) {
          for (const blocked of blockedDates) {
            if (dateStr >= blocked.startDate && dateStr <= blocked.endDate) {
              isBlocked = true;
              blockedReason = blocked.reason;
              break;
            }
          }
        }
      }
      
      return { isHoliday, isBlocked, holidayName, blockedReason };
    };
  }, [calendarSettings]);

  // Helper function to shift weekend dates to next Monday
  const shiftWeekendToMonday = (date: Date): { shiftedDate: Date; wasShifted: boolean } => {
    const dayOfWeek = getDay(date); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
    
    if (dayOfWeek === 0) { // Sunday -> shift to Monday (+1 day)
      return {
        shiftedDate: addDays(date, 1),
        wasShifted: true
      };
    } else if (dayOfWeek === 6) { // Saturday -> shift to Monday (+2 days)
      return {
        shiftedDate: addDays(date, 2), 
        wasShifted: true
      };
    } else {
      return {
        shiftedDate: date,
        wasShifted: false
      };
    }
  };

  // Helper function to check if maintenance is already scheduled for a vehicle
  // Note: We use the FULL maintenanceBlocks list (not filtered) to ensure reminder suppression
  // works correctly even when maintenance block visibility is toggled off in settings
  const isMaintenanceScheduled = (vehicleId: number, maintenanceType: 'apk_inspection' | 'warranty_service'): boolean => {
    if (!maintenanceBlocks) {
      return false;
    }
    
    const found = maintenanceBlocks.some(block => {
      if (block.vehicleId !== vehicleId) return false;
      
      // For reminder suppression, we want to consider ALL maintenance blocks (past, present, future)
      // The goal is to suppress reminders if maintenance has already been scheduled/completed
      
      // Check maintenance type from reservation notes with comprehensive keyword matching
      const notes = (block.notes?.toLowerCase() || '').trim();
      const searchText = notes.toLowerCase();
      
      let matches = false;
      if (maintenanceType === 'apk_inspection') {
        // APK inspection keywords - using specific terms to avoid false positives
        matches = searchText.includes('apk_inspection') ||
                 searchText.includes('apk') || 
                 searchText.includes('keuring') || 
                 searchText.includes('rdw');
      } else if (maintenanceType === 'warranty_service') {
        // Warranty service keywords - using specific terms only
        matches = searchText.includes('warranty_service') ||
                 searchText.includes('warranty') || 
                 searchText.includes('garantie') || 
                 searchText.includes('garanti') ||
                 searchText.includes('recall');
      }
      
      return matches;
    });
    
    return found;
  };

  // Create maintenance events from vehicle data and scheduled maintenance
  const maintenanceEvents: MaintenanceEvent[] = useMemo(() => {
    const events: MaintenanceEvent[] = [];
    
    // Helper function to add APK events with advance reminders
    const addApkEvents = (vehicle: Vehicle) => {
      if (!vehicle.apkDate) return;
      
      const dueDate = parseISO(vehicle.apkDate);
      const twoMonthsBefore = subMonths(dueDate, 2);
      const oneMonthBefore = subMonths(dueDate, 1);
      const today = startOfDay(new Date());
      
      // Check if the ACTUAL APK date is overdue (not the reminder date)
      const isApkOverdue = isBefore(dueDate, today);
      
      // Always create 2 months before reminder (show in backlog if past)
      const { shiftedDate: shifted2m, wasShifted: wasShifted2m } = shiftWeekendToMonday(twoMonthsBefore);
      const reminderPassed2m = isBefore(shifted2m, today);
      events.push({
        id: `apk_reminder_2m_${vehicle.id}`,
        vehicleId: vehicle.id,
        vehicle,
        type: 'apk_reminder_2m' as const,
        date: format(shifted2m, 'yyyy-MM-dd'),
        title: isApkOverdue ? 'APK Reminder (2 months) - OVERDUE' : 'APK Reminder (2 months)' + (wasShifted2m ? ' (Moved from weekend)' : ''),
        description: isApkOverdue 
          ? `APK inspection is now overdue for ${vehicle.brand} ${vehicle.model}` + (wasShifted2m ? ' (Reminder originally scheduled for weekend)' : '')
          : reminderPassed2m
          ? `APK inspection due soon for ${vehicle.brand} ${vehicle.model}` + (wasShifted2m ? ' (Reminder was moved from weekend to Monday)' : '')
          : `APK inspection due in 2 months for ${vehicle.brand} ${vehicle.model}` + (wasShifted2m ? ' (Moved from weekend to Monday)' : ''),
        needsSpareVehicle: false,
        priority: isApkOverdue ? 'urgent' : 'low',
        currentReservations: reservations?.filter((r: Reservation) => r.vehicleId === vehicle.id) || []
      });
      
      // Always create 1 month before reminder (show in backlog if past)
      const { shiftedDate: shifted1m, wasShifted: wasShifted1m } = shiftWeekendToMonday(oneMonthBefore);
      const reminderPassed1m = isBefore(shifted1m, today);
      events.push({
        id: `apk_reminder_1m_${vehicle.id}`,
        vehicleId: vehicle.id,
        vehicle,
        type: 'apk_reminder_1m' as const,
        date: format(shifted1m, 'yyyy-MM-dd'),
        title: isApkOverdue ? 'APK Reminder (1 month) - OVERDUE' : 'APK Reminder (1 month)' + (wasShifted1m ? ' (Moved from weekend)' : ''),
        description: isApkOverdue
          ? `APK inspection is now overdue for ${vehicle.brand} ${vehicle.model}` + (wasShifted1m ? ' (Reminder originally scheduled for weekend)' : '')
          : reminderPassed1m
          ? `APK inspection due soon for ${vehicle.brand} ${vehicle.model}` + (wasShifted1m ? ' (Reminder was moved from weekend to Monday)' : '')
          : `APK inspection due in 1 month for ${vehicle.brand} ${vehicle.model}` + (wasShifted1m ? ' (Moved from weekend to Monday)' : ''),
        needsSpareVehicle: false,
        priority: isApkOverdue ? 'urgent' : 'medium',
        currentReservations: reservations?.filter((r: Reservation) => r.vehicleId === vehicle.id) || []
      });
      
      // Actual due date
      const { shiftedDate: shiftedDue, wasShifted: wasShiftedDue } = shiftWeekendToMonday(dueDate);
      
      // Check for overlapping and upcoming reservations
      const vehicleReservations = reservations?.filter((r: Reservation) => r.vehicleId === vehicle.id) || [];
      const apkDueDate = shiftedDue;
      const threeWeeksLater = addWeeks(apkDueDate, 3);
      
      // Check if any reservation overlaps with the APK due date
      const hasOverlappingReservation = vehicleReservations.some((r: Reservation) => {
        const resStart = parseISO(r.startDate);
        const resEnd = r.endDate ? parseISO(r.endDate) : null;
        
        // Check if APK date falls within reservation period
        if (resEnd) {
          return (isBefore(resStart, apkDueDate) || isSameDay(resStart, apkDueDate)) && 
                 (isAfter(resEnd, apkDueDate) || isSameDay(resEnd, apkDueDate));
        } else {
          // Open-ended reservation
          return isBefore(resStart, apkDueDate) || isSameDay(resStart, apkDueDate);
        }
      });
      
      // Check if there are reservations within 3 weeks (but not overlapping)
      const hasUpcomingReservations = !hasOverlappingReservation && vehicleReservations.some((r: Reservation) => {
        const resStart = parseISO(r.startDate);
        return isAfter(resStart, apkDueDate) && (isBefore(resStart, threeWeeksLater) || isSameDay(resStart, threeWeeksLater));
      });
      
      events.push({
        id: `apk_due_${vehicle.id}`,
        vehicleId: vehicle.id,
        vehicle,
        type: 'apk_due' as const,
        date: format(shiftedDue, 'yyyy-MM-dd'),
        title: 'APK Inspection Due' + (wasShiftedDue ? ' (Moved from weekend)' : ''),
        description: `APK inspection required for ${vehicle.brand} ${vehicle.model}` + (wasShiftedDue ? ' (Moved from weekend to Monday)' : ''),
        needsSpareVehicle: hasOverlappingReservation,
        hasUpcomingRentals: hasUpcomingReservations,
        priority: 'urgent',
        currentReservations: vehicleReservations
      });
    };
    
    // Helper function to add warranty events with advance reminders
    const addWarrantyEvents = (vehicle: Vehicle) => {
      if (!vehicle.warrantyEndDate) return;
      
      const dueDate = parseISO(vehicle.warrantyEndDate);
      const twoMonthsBefore = subMonths(dueDate, 2);
      const oneMonthBefore = subMonths(dueDate, 1);
      const today = startOfDay(new Date());
      
      // Check if the ACTUAL warranty date is overdue (not the reminder date)
      const isWarrantyOverdue = isBefore(dueDate, today);
      
      // Always create 2 months before reminder (show in backlog if past)
      const { shiftedDate: shifted2m, wasShifted: wasShifted2m } = shiftWeekendToMonday(twoMonthsBefore);
      const reminderPassed2m = isBefore(shifted2m, today);
      events.push({
        id: `warranty_reminder_2m_${vehicle.id}`,
        vehicleId: vehicle.id,
        vehicle,
        type: 'warranty_reminder_2m' as const,
        date: format(shifted2m, 'yyyy-MM-dd'),
        title: isWarrantyOverdue ? 'Warranty Reminder (2 months) - OVERDUE' : 'Warranty Reminder (2 months)' + (wasShifted2m ? ' (Moved from weekend)' : ''),
        description: isWarrantyOverdue
          ? `Warranty has expired for ${vehicle.brand} ${vehicle.model}` + (wasShifted2m ? ' (Reminder originally scheduled for weekend)' : '')
          : reminderPassed2m
          ? `Warranty expiring soon for ${vehicle.brand} ${vehicle.model}` + (wasShifted2m ? ' (Reminder was moved from weekend to Monday)' : '')
          : `Warranty expires in 2 months for ${vehicle.brand} ${vehicle.model}` + (wasShifted2m ? ' (Moved from weekend to Monday)' : ''),
        needsSpareVehicle: false,
        priority: isWarrantyOverdue ? 'urgent' : 'low',
        currentReservations: reservations?.filter((r: Reservation) => r.vehicleId === vehicle.id) || []
      });
      
      // Always create 1 month before reminder (show in backlog if past)
      const { shiftedDate: shifted1m, wasShifted: wasShifted1m } = shiftWeekendToMonday(oneMonthBefore);
      const reminderPassed1m = isBefore(shifted1m, today);
      events.push({
        id: `warranty_reminder_1m_${vehicle.id}`,
        vehicleId: vehicle.id,
        vehicle,
        type: 'warranty_reminder_1m' as const,
        date: format(shifted1m, 'yyyy-MM-dd'),
        title: isWarrantyOverdue ? 'Warranty Reminder (1 month) - OVERDUE' : 'Warranty Reminder (1 month)' + (wasShifted1m ? ' (Moved from weekend)' : ''),
        description: isWarrantyOverdue
          ? `Warranty has expired for ${vehicle.brand} ${vehicle.model}` + (wasShifted1m ? ' (Reminder originally scheduled for weekend)' : '')
          : reminderPassed1m
          ? `Warranty expiring soon for ${vehicle.brand} ${vehicle.model}` + (wasShifted1m ? ' (Reminder was moved from weekend to Monday)' : '')
          : `Warranty expires in 1 month for ${vehicle.brand} ${vehicle.model}` + (wasShifted1m ? ' (Moved from weekend to Monday)' : ''),
        needsSpareVehicle: false,
        priority: isWarrantyOverdue ? 'urgent' : 'medium',
        currentReservations: reservations?.filter((r: Reservation) => r.vehicleId === vehicle.id) || []
      });
      
      // Actual expiry date
      const { shiftedDate: shiftedExpiry, wasShifted: wasShiftedExpiry } = shiftWeekendToMonday(parseISO(vehicle.warrantyEndDate));
      events.push({
        id: `warranty_expiring_${vehicle.id}`,
        vehicleId: vehicle.id,
        vehicle,
        type: 'warranty_expiring' as const,
        date: format(shiftedExpiry, 'yyyy-MM-dd'),
        title: 'Warranty Expiring' + (wasShiftedExpiry ? ' (Moved from weekend)' : ''),
        description: `Warranty expires for ${vehicle.brand} ${vehicle.model}` + (wasShiftedExpiry ? ' (Moved from weekend to Monday)' : ''),
        needsSpareVehicle: false,
        priority: 'high',
        currentReservations: reservations?.filter((r: Reservation) => r.vehicleId === vehicle.id) || []
      });
    };
    
    // Generate APK and warranty events with advance reminders for vehicles (excluding filtered statuses)
    // Check every vehicle for APK and warranty dates to create complete reminders
    if (vehiclesForMaintenance) {
      vehiclesForMaintenance.forEach(vehicle => {
        // Create APK events if vehicle has APK date AND no APK maintenance is scheduled AND APK reminders are enabled
        if (showApkReminders && vehicle.apkDate && !isMaintenanceScheduled(vehicle.id, 'apk_inspection')) {
          addApkEvents(vehicle);
        }
        
        // Create warranty events if vehicle has warranty end date AND no warranty service is scheduled AND warranty reminders are enabled
        if (showWarrantyReminders && vehicle.warrantyEndDate && !isMaintenanceScheduled(vehicle.id, 'warranty_service')) {
          addWarrantyEvents(vehicle);
        }
      });
    }
    
    // Scheduled maintenance events (potentially multi-day)
    filteredMaintenanceBlocks.forEach(reservation => {
      // Find vehicle from vehicles list instead of relying on embedded object
      const vehicle = vehicles?.find((v: Vehicle) => v.id === reservation.vehicleId);
      if (!vehicle) return; // Skip if vehicle not found
      
      // Extract maintenance type from notes (format: "{maintenanceType}: {description}\n{notes}")
      const noteParts = reservation.notes?.split(':') || [];
      const maintenanceTypeRaw = noteParts[0]?.trim() || 'regular_maintenance';
      
      // Map maintenance type to display label
      const maintenanceTypeMap: Record<string, string> = {
        'breakdown': 'Vehicle Breakdown',
        'tire_replacement': 'Tire Replacement',
        'brake_service': 'Brake Service',
        'engine_repair': 'Engine Repair',
        'transmission_repair': 'Transmission Repair',
        'electrical_issue': 'Electrical Issue',
        'air_conditioning': 'Air Conditioning',
        'battery_replacement': 'Battery Replacement',
        'oil_change': 'Oil Change',
        'regular_maintenance': 'Regular Maintenance',
        'apk_inspection': 'APK Inspection',
        'warranty_service': 'Warranty Service',
        'accident_damage': 'Accident Damage',
        'other': 'Other Maintenance'
      };
      
      const displayTitle = maintenanceTypeMap[maintenanceTypeRaw] || 'Scheduled Maintenance';
      const descriptionPart = noteParts[1]?.split('\n')[0]?.trim() || '';
      
      events.push({
        id: `scheduled_maintenance_${reservation.id}`, // Avoid ID conflicts
        vehicleId: reservation.vehicleId!, // Using ! since we already checked vehicle exists
        vehicle,
        type: 'scheduled_maintenance' as const,
        date: reservation.startDate,
        startDate: reservation.startDate,
        endDate: reservation.endDate || undefined,
        title: displayTitle,
        description: descriptionPart || `${displayTitle} for ${vehicle.brand} ${vehicle.model}`,
        needsSpareVehicle: false,
        priority: 'high'
      });
    });
    
    return events;
  }, [filteredApkExpiringVehicles, filteredWarrantyExpiringVehicles, filteredMaintenanceBlocks, reservations, vehicles, vehiclesForMaintenance, showApkReminders, showWarrantyReminders]);

  // Helper function to get maintenance events that start, end, or occur on a specific day
  const getMaintenanceEventsForDate = (day: Date): MaintenanceEvent[] => {
    if (!maintenanceEvents) return [];
    
    return maintenanceEvents.filter((event: MaintenanceEvent) => {
      // Handle multi-day events for scheduled maintenance
      if (event.type === 'scheduled_maintenance' && event.startDate) {
        const startDate = safeParseDateISO(event.startDate);
        const endDate = safeParseDateISO(event.endDate);
        
        if (!startDate) return false;
        
        // Only show maintenance that starts or ends on this specific day
        const isStartDay = isSameDay(day, startDate);
        const isEndDay = endDate ? isSameDay(day, endDate) : false;
        
        return isStartDay || isEndDay;
      } else {
        // Single date events (APK due, warranty expiring) - always show
        if (!event.date) return false;
        const eventDate = safeParseDateISO(event.date);
        if (!eventDate) return false;
        return isSameDay(day, eventDate);
      }
    }).filter((event: MaintenanceEvent) => {
      // Apply current filters
      const vehicle = event.vehicle;
      if (!vehicle) return false;
      
      // Search filter
      if (maintenanceFilters.search && 
          !vehicle.licensePlate?.toLowerCase().includes(maintenanceFilters.search.toLowerCase()) &&
          !vehicle.brand?.toLowerCase().includes(maintenanceFilters.search.toLowerCase()) &&
          !vehicle.model?.toLowerCase().includes(maintenanceFilters.search.toLowerCase()) &&
          !event.title?.toLowerCase().includes(maintenanceFilters.search.toLowerCase())) {
        return false;
      }
      
      // Vehicle type filter
      if (maintenanceFilters.type !== "all" && vehicle.vehicleType !== maintenanceFilters.type) {
        return false;
      }
      
      // Event type filter
      if (maintenanceFilters.eventType !== "all" && event.type !== maintenanceFilters.eventType) {
        return false;
      }
      
      return true;
    });
  };

  // Get event type styling
  const getEventTypeStyle = (type: string) => {
    // Use custom styling system first, fallback to default
    return getCustomMaintenanceStyle(type);
  };
  
  // Function to get custom inline styles for maintenance events
  const getMaintenanceStyleObject = (type: string) => {
    return getCustomMaintenanceStyleObject(type);
  };

  const getEventIcon = (type: string) => {
    switch (type) {
      case 'apk_due':
        return <AlertTriangle className="w-3 h-3" />;
      case 'apk_reminder_2m':
      case 'apk_reminder_1m':
        return <Calendar className="w-3 h-3" />;
      case 'warranty_expiring':
        return <Clock className="w-3 h-3" />;
      case 'warranty_reminder_2m':
      case 'warranty_reminder_1m':
        return <Clock className="w-3 h-3" />;
      case 'scheduled_maintenance':
        return <Wrench className="w-3 h-3" />;
      case 'in_service':
        return <Car className="w-3 h-3" />;
      default:
        return <Calendar className="w-3 h-3" />;
    }
  };
  
  // Extract unique vehicle types for filtering
  const vehicleTypes = useMemo(() => {
    if (!vehicles) return [];
    const types = Array.from(new Set(vehicles.map(v => v.vehicleType).filter(Boolean))) as string[];
    return types.sort();
  }, [vehicles]);
  
  // Extract unique event types for filtering
  const eventTypes = ['apk_due', 'apk_reminder_2m', 'apk_reminder_1m', 'warranty_expiring', 'warranty_reminder_2m', 'warranty_reminder_1m', 'scheduled_maintenance', 'in_service'];
  
  // Functions to navigate between months
  const navigatePrevious = () => {
    setCurrentDate(prevDate => addMonths(prevDate, -1));
  };
  
  const navigateNext = () => {
    setCurrentDate(prevDate => addMonths(prevDate, 1));
  };
  
  // Reset to today
  const goToToday = () => {
    setCurrentDate(new Date());
  };
  
  // Safe date parsing function to prevent invalid date errors
  const safeParseDateISO = (dateString: string | null | undefined): Date | null => {
    if (!dateString || dateString === 'undefined' || dateString === 'null') {
      return null;
    }
    try {
      const parsed = parseISO(dateString);
      // Check if the parsed date is valid
      if (isNaN(parsed.getTime())) {
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  };

  // Safe format function to prevent format errors with invalid dates
  const safeFormat = (date: Date | null | undefined, formatString: string, fallback: string = ''): string => {
    if (!date) return fallback;
    try {
      // Check if date is valid
      if (isNaN(date.getTime())) {
        return fallback;
      }
      return format(date, formatString);
    } catch {
      return fallback;
    }
  };
  
  // Filter handlers
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setMaintenanceFilters({
      ...maintenanceFilters,
      search: e.target.value
    });
  };
  
  const handleTypeChange = (value: string) => {
    setMaintenanceFilters({
      ...maintenanceFilters,
      type: value
    });
  };
  
  const handleEventTypeChange = (value: string) => {
    setMaintenanceFilters({
      ...maintenanceFilters,
      eventType: value
    });
  };
  
  // Generate calendar grid for month view
  const calendarGrid = useMemo(() => {
    const rows: Date[][] = [];
    const days = dateRanges.days;
    
    // Group days into rows of 5 columns
    for (let i = 0; i < days.length; i += COLUMNS) {
      rows.push(days.slice(i, i + COLUMNS));
    }
    
    return rows;
  }, [dateRanges.days]);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Maintenance Calendar</h1>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            onClick={() => setMaintenanceListDialogOpen(true)}
            data-testid="button-maintenance-list-view"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-list mr-2">
              <line x1="8" x2="21" y1="6" y2="6" />
              <line x1="8" x2="21" y1="12" y2="12" />
              <line x1="8" x2="21" y1="18" y2="18" />
              <line x1="3" x2="3" y1="6" y2="6" />
              <line x1="3" x2="3" y1="12" y2="12" />
              <line x1="3" x2="3" y1="18" y2="18" />
            </svg>
            List View
          </Button>
          <Button 
            variant="outline" 
            onClick={() => setCompletedMaintenanceDialogOpen(true)}
            data-testid="button-view-completed"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-check-circle mr-2">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
              <polyline points="22 4 12 14.01 9 11.01"/>
            </svg>
            View Completed ({completedMaintenanceBlocks.length})
          </Button>
          <Button onClick={() => {
            setSelectedScheduleDate(null); // No pre-selected date from header button
            setIsScheduleDialogOpen(true);
          }}>
            <Plus className="mr-2 h-4 w-4" />
            Schedule Maintenance
          </Button>
        </div>
      </div>
      
      <Card>
        <CardHeader className="flex-row justify-between items-center space-y-0 pb-2">
          <div>
            <CardTitle>Maintenance Schedule</CardTitle>
            <CardDescription>View and manage vehicle maintenance events</CardDescription>
          </div>
          <div className="flex-shrink-0 flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setColorDialogOpen(true)}>
              <Palette className="h-4 w-4 mr-1" />
              Colors
            </Button>
            <Button variant="outline" size="sm" onClick={goToToday}>Today</Button>
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          {/* Top Controls */}
          <div className="flex flex-col md:flex-row justify-between gap-4 mb-6">
            {/* Calendar Navigation */}
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" onClick={navigatePrevious}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <h4 className="text-base font-medium w-40 text-center">{dateRanges.rangeText}</h4>
              <Button variant="ghost" size="icon" onClick={navigateNext}>
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="sm" onClick={goToToday}>Today</Button>
            </div>
            
            {/* Maintenance Filters */}
            <div className="flex flex-wrap gap-2">
              <Input
                placeholder="Search vehicles or events..."
                value={maintenanceFilters.search}
                onChange={handleSearchChange}
                className="w-50 h-9"
              />
              
              {vehicleTypes.length > 0 && (
                <Select value={maintenanceFilters.type} onValueChange={handleTypeChange}>
                  <SelectTrigger className="w-40 h-9">
                    <SelectValue placeholder="Vehicle Type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    {vehicleTypes.map(type => (
                      <SelectItem key={type} value={type}>{type}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              
              <Select value={maintenanceFilters.eventType} onValueChange={handleEventTypeChange}>
                <SelectTrigger className="w-40 h-9">
                  <SelectValue placeholder="Event Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Events</SelectItem>
                  <SelectItem value="apk_due">APK Due</SelectItem>
                  <SelectItem value="apk_reminder_2m">APK Reminder (2 months)</SelectItem>
                  <SelectItem value="apk_reminder_1m">APK Reminder (1 month)</SelectItem>
                  <SelectItem value="warranty_expiring">Warranty Expiring</SelectItem>
                  <SelectItem value="warranty_reminder_2m">Warranty Reminder (2 months)</SelectItem>
                  <SelectItem value="warranty_reminder_1m">Warranty Reminder (1 month)</SelectItem>
                  <SelectItem value="scheduled_maintenance">Scheduled Maintenance</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          
          {/* Month View */}
          <div className="mb-6">
            {/* Calendar Grid */}
            <div className="border rounded-lg overflow-hidden">
              {calendarGrid.map((week, weekIndex) => (
                <div key={weekIndex} className="grid grid-cols-4 divide-x border-b last:border-b-0">
                  {week.map((day, dayIndex) => {
                    const isCurrentMonth = isSameMonth(day, currentDate);
                    const isToday = isSameDay(day, new Date());
                    const dateStatus = getDateStatus(day);
                    
                    // Get maintenance events for this day with filters applied
                    const dayEvents = getMaintenanceEventsForDate(day);
                    
                    // Determine background color based on status
                    let bgClass = isCurrentMonth ? '' : 'bg-gray-50';
                    if (dateStatus.isBlocked) {
                      bgClass = 'bg-red-50';
                    } else if (dateStatus.isHoliday) {
                      bgClass = 'bg-orange-50';
                    } else if (isToday) {
                      bgClass = 'bg-blue-50';
                    }
                    
                    return (
                      <div
                        key={dayIndex}
                        className={`min-h-[140px] p-3 ${bgClass} relative group cursor-pointer`}
                        onClick={(e) => {
                          if (isCurrentMonth) {
                            const allDayEvents = getMaintenanceEventsForDate(day);
                            if (allDayEvents.length > 0) {
                              // If there are events, show them in dialog
                              console.log('Maintenance date box clicked - opening day dialog for:', safeFormat(day, 'yyyy-MM-dd', 'invalid-date'));
                              openDayDialog(day);
                            } else {
                              // If no events, open schedule dialog with selected date
                              const dateStr = safeFormat(day, 'yyyy-MM-dd', '');
                              console.log('Maintenance date box clicked - no events, opening schedule dialog for:', dateStr);
                              setSelectedScheduleDate(dateStr);
                              setIsScheduleDialogOpen(true);
                            }
                          }
                        }}
                      >
                        {/* Quick add button - only shows on hover for current month days */}
                        {isCurrentMonth && (
                          <div className="absolute top-1 left-0 right-0 flex justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10">
                            <Button 
                              size="icon" 
                              variant="ghost" 
                              className="h-5 w-5 bg-primary/10 hover:bg-primary/20 rounded-full border border-primary/20 shadow-sm p-0"
                              onClick={(e) => {
                                e.stopPropagation();
                                const dateStr = safeFormat(day, 'yyyy-MM-dd', '');
                                setSelectedScheduleDate(dateStr);
                                setIsScheduleDialogOpen(true);
                              }}
                            >
                              <Plus className="h-3 w-3" />
                            </Button>
                          </div>
                        )}
                        <div className="flex justify-between items-center mb-3">
                          <div className="flex items-center space-x-2">
                            <span className="text-xs text-gray-500 font-medium">
                              {safeFormat(day, "EEE", "???")}
                            </span>
                            <span className={`text-base font-medium ${isToday ? 'bg-blue-600 text-white rounded-full w-7 h-7 flex items-center justify-center' : ''}`}>
                              {safeFormat(day, "d", "?")}
                            </span>
                          </div>
                          <div className="flex items-center gap-1">
                            {dateStatus.isHoliday && (
                              <Badge variant="outline" className="text-[10px] px-1 py-0 bg-orange-100 text-orange-700 border-orange-300">
                                🎉 {dateStatus.holidayName || 'Holiday'}
                              </Badge>
                            )}
                            {dateStatus.isBlocked && (
                              <Badge variant="outline" className="text-[10px] px-1 py-0 bg-red-100 text-red-700 border-red-300">
                                🚫 {dateStatus.blockedReason || 'Blocked'}
                              </Badge>
                            )}
                            {dayEvents.length > 0 && (
                              <Badge variant="outline" className="text-sm font-medium">
                                {dayEvents.length}
                              </Badge>
                            )}
                          </div>
                        </div>
                        
                        {/* Events for this day */}
                        <div className="space-y-1">
                          {dayEvents.map(event => {
                            const isMaintenanceBlock = event.type === 'scheduled_maintenance';
                            
                            return (
                              <HoverCard key={`${event.id}-${event.type}`}>
                                <HoverCardTrigger asChild>
                                  <div
                                    className={`text-xs p-1 rounded cursor-pointer hover:opacity-80 border ${getEventTypeStyle(event.type)} group`}
                                    style={getMaintenanceStyleObject(event.type)}
                                    data-testid={`event-${event.id}-${event.type}`}
                                  >
                                    <div className="flex items-center justify-between">
                                      <div className="flex items-center gap-1 min-w-0">
                                        {getEventIcon(event.type)}
                                        <span className="truncate">{displayLicensePlate(event.vehicle.licensePlate)}</span>
                                      </div>
                                      
                                      {/* Action buttons - only show on hover */}
                                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        {isMaintenanceBlock && (
                                          <Button 
                                            size="icon"
                                            variant="ghost"
                                            className="h-4 w-4 p-0"
                                            onClick={async (e) => {
                                              e.stopPropagation();
                                              try {
                                                const response = await fetch('/api/reservations');
                                                const allReservations = await response.json();
                                                const actualReservation = allReservations.find((r: any) => 
                                                  r.vehicleId === event.vehicleId && 
                                                  r.type === 'maintenance_block' &&
                                                  r.startDate === event.date
                                                );
                                                
                                                if (actualReservation) {
                                                  handleEditMaintenance(actualReservation);
                                                }
                                              } catch (error) {
                                                console.error('Failed to fetch reservation:', error);
                                              }
                                            }}
                                            data-testid={`button-edit-${event.id}`}
                                          >
                                            <Edit className="h-3 w-3" />
                                          </Button>
                                        )}
                                        <Button 
                                          size="icon"
                                          variant="ghost"
                                          className="h-4 w-4 p-0"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setSelectedVehicleId(event.vehicleId);
                                            setVehicleViewDialogOpen(true);
                                          }}
                                          data-testid={`button-view-${event.vehicleId}`}
                                        >
                                          <Eye className="h-3 w-3" />
                                        </Button>
                                      </div>
                                    </div>
                                    <div className="truncate mt-1">{event.title}</div>
                                    {event.needsSpareVehicle && event.currentReservations && event.currentReservations.length > 0 && (
                                      <Badge className="bg-orange-500 text-white text-xs mt-1">
                                        Spare needed
                                      </Badge>
                                    )}
                                    {event.hasUpcomingRentals && !event.needsSpareVehicle && (
                                      <Badge className="bg-blue-500 text-white text-xs mt-1">
                                        Rental coming up
                                      </Badge>
                                    )}
                                  </div>
                                </HoverCardTrigger>
                                <HoverCardContent className="w-80">
                                  <div className="flex justify-between space-x-4">
                                    <div className="space-y-1">
                                      <div className="flex items-center gap-2">
                                        {getEventIcon(event.type)}
                                        <h4 className="text-sm font-semibold">{event.title}</h4>
                                      </div>
                                      <p className="text-sm text-muted-foreground">
                                        {event.vehicle.brand} {event.vehicle.model}
                                      </p>
                                      <p className="text-sm text-muted-foreground">
                                        {displayLicensePlate(event.vehicle.licensePlate)}
                                      </p>
                                      <p className="text-sm">
                                        {event.description}
                                      </p>
                                      <div className="flex items-center pt-2 gap-2">
                                        {isMaintenanceBlock && (
                                          <Button 
                                            size="sm" 
                                            variant="outline"
                                            onClick={async () => {
                                              try {
                                                const response = await fetch('/api/reservations');
                                                const allReservations = await response.json();
                                                const actualReservation = allReservations.find((r: any) => 
                                                  r.vehicleId === event.vehicleId && 
                                                  r.type === 'maintenance_block' &&
                                                  r.startDate === event.date
                                                );
                                                
                                                if (actualReservation) {
                                                  handleEditMaintenance(actualReservation);
                                                }
                                              } catch (error) {
                                                console.error('Failed to fetch reservation:', error);
                                              }
                                            }}
                                            data-testid={`hover-edit-${event.id}`}
                                          >
                                            <Edit className="h-3 w-3 mr-1" />
                                            Edit
                                          </Button>
                                        )}
                                        {event.type === 'scheduled_maintenance' ? (
                                          <Button 
                                            size="sm" 
                                            variant="outline" 
                                            onClick={(e) => {
                                              e.preventDefault();
                                              e.stopPropagation();
                                              
                                              // For scheduled maintenance, extract the reservation ID from the event ID
                                              let reservationId: number;
                                              if (typeof event.id === 'string') {
                                                // Extract the number from strings like "scheduled_maintenance_60"
                                                const match = event.id.match(/\d+$/);
                                                reservationId = match ? parseInt(match[0]) : 0;
                                              } else {
                                                reservationId = event.id;
                                              }
                                              
                                              if (reservationId && !isNaN(reservationId) && reservationId > 0) {
                                                setSelectedMaintenanceReservationId(reservationId);
                                                setMaintenanceReservationDialogOpen(true);
                                              } else {
                                                toast({
                                                  title: "Error",
                                                  description: "Cannot find maintenance reservation details",
                                                  variant: "destructive"
                                                });
                                              }
                                            }}
                                            data-testid={`hover-view-maintenance-${event.vehicleId}`}
                                          >
                                            <Wrench className="h-3 w-3 mr-1" />
                                            View Maintenance
                                          </Button>
                                        ) : (
                                          <Button 
                                            size="sm" 
                                            variant="outline" 
                                            onClick={(e) => {
                                              e.preventDefault();
                                              e.stopPropagation();
                                              openScheduleFromEvent({
                                                date: event.date,
                                                vehicleId: event.vehicleId,
                                                type: event.type
                                              });
                                            }}
                                            data-testid={`hover-schedule-${event.vehicleId}`}
                                          >
                                            <Wrench className="h-3 w-3 mr-1" />
                                            Schedule Maintenance
                                          </Button>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                </HoverCardContent>
                              </HoverCard>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
          
          {/* Calendar Legend */}
          <CalendarLegend 
            categories={['maintenance-type', 'maintenance-priority']}
            title="Maintenance Calendar Legend"
            compact
          />
        </CardContent>
      </Card>
      
      {/* Day Dialog for viewing maintenance events */}
      <Dialog open={dayDialogOpen} onOpenChange={(open) => { 
        if (!open) closeDayDialog(); 
      }}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Maintenance Events - {selectedDay ? safeFormat(selectedDay, 'MMMM d, yyyy', 'Selected Day') : 'Day'}</DialogTitle>
            <DialogDescription>
              View and manage maintenance events for this day
            </DialogDescription>
          </DialogHeader>
          
          {selectedDay && (
            <div className="space-y-4">
              {getMaintenanceEventsForDate(selectedDay).map(event => {
                const isMaintenanceBlock = event.type === 'scheduled_maintenance';
                
                return (
                  <Card key={`${event.id}-${event.type}`}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            {getEventIcon(event.type)}
                            <h4 className="font-semibold">{event.title}</h4>
                            <Badge 
                              className={getEventTypeStyle(event.type)}
                              style={getMaintenanceStyleObject(event.type)}
                            >
                              {event.type.replace('_', ' ')}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {event.vehicle.brand} {event.vehicle.model} - {displayLicensePlate(event.vehicle.licensePlate)}
                          </p>
                          <p className="text-sm">{event.description}</p>
                          {event.needsSpareVehicle && event.currentReservations && event.currentReservations.length > 0 && (
                            <Badge className="bg-orange-100 text-orange-800">
                              Spare vehicle needed
                            </Badge>
                          )}
                          {event.hasUpcomingRentals && !event.needsSpareVehicle && (
                            <Badge className="bg-blue-100 text-blue-800">
                              Rental coming up (within 3 weeks)
                            </Badge>
                          )}
                        </div>
                        <div className="flex gap-2">
                          {isMaintenanceBlock && (
                            <>
                              <Button 
                                size="sm" 
                                variant="default"
                                className="bg-green-600 hover:bg-green-700"
                                onClick={async () => {
                                  try {
                                    const response = await fetch('/api/reservations');
                                    const allReservations = await response.json();
                                    const actualReservation = allReservations.find((r: any) => 
                                      r.vehicleId === event.vehicleId && 
                                      r.type === 'maintenance_block' &&
                                      r.startDate === event.date
                                    );
                                    
                                    if (actualReservation) {
                                      // Always show dialog to allow reviewing APK date and optionally adding warranty date
                                      setCompletingReservation(actualReservation);
                                      
                                      // Check if this is a warranty maintenance to pre-fill warranty date
                                      const notes = actualReservation.notes?.toLowerCase() || '';
                                      const isWarranty = notes.includes('warranty') || notes.includes('garantie');
                                      
                                      if (isWarranty) {
                                        setWarrantyDateInput(format(new Date(), 'yyyy-MM-dd'));
                                      } else {
                                        setWarrantyDateInput(''); // Leave empty for non-warranty maintenance
                                      }
                                      
                                      // Pre-fill APK date with current value or calculated value
                                      const currentApkDate = event.vehicle.apkDate || calculateNextApkDate(event.vehicle, new Date());
                                      setApkDateInput(currentApkDate);
                                      
                                      // Pre-fill current mileage with vehicle's current mileage
                                      if (event.vehicle.currentMileage) {
                                        setCurrentMileage(event.vehicle.currentMileage.toString());
                                      } else {
                                        setCurrentMileage('');
                                      }
                                      
                                      setWarrantyDateDialogOpen(true);
                                    }
                                  } catch (error) {
                                    console.error('Failed to complete maintenance:', error);
                                    toast({
                                      title: "Error",
                                      description: "Failed to complete maintenance. Please try again.",
                                      variant: "destructive",
                                    });
                                  }
                                }}
                                data-testid={`button-complete-${event.id}`}
                              >
                                <svg className="h-4 w-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
                                </svg>
                                Complete
                              </Button>
                              <Button 
                                size="sm" 
                                variant="outline"
                                onClick={async () => {
                                  try {
                                    const response = await fetch('/api/reservations');
                                    const allReservations = await response.json();
                                    const actualReservation = allReservations.find((r: any) => 
                                      r.vehicleId === event.vehicleId && 
                                      r.type === 'maintenance_block' &&
                                      r.startDate === event.date
                                    );
                                    
                                    if (actualReservation) {
                                      handleEditMaintenance(actualReservation);
                                      closeDayDialog();
                                    }
                                  } catch (error) {
                                    console.error('Failed to fetch reservation:', error);
                                  }
                                }}
                              >
                                <Edit className="h-4 w-4 mr-1" />
                                Edit
                              </Button>
                              <Button 
                                size="sm" 
                                variant="outline"
                                onClick={async () => {
                                  try {
                                    // Extract reservation ID from event ID (format: "scheduled_maintenance_123")
                                    let reservationId: number;
                                    if (typeof event.id === 'string') {
                                      const match = event.id.match(/\d+$/);
                                      reservationId = match ? parseInt(match[0]) : 0;
                                    } else {
                                      reservationId = event.id;
                                    }
                                    
                                    if (reservationId && reservationId > 0) {
                                      // Fetch only the specific reservation instead of all
                                      const response = await fetch(`/api/reservations/${reservationId}`);
                                      if (response.ok) {
                                        const reservation = await response.json();
                                        setReservationToDelete(reservation);
                                        setDeleteDialogOpen(true);
                                      }
                                    }
                                  } catch (error) {
                                    console.error('Failed to fetch reservation:', error);
                                  }
                                }}
                                className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                data-testid={`button-delete-${event.id}`}
                              >
                                <Trash2 className="h-4 w-4 mr-1" />
                                Delete
                              </Button>
                            </>
                          )}
                          {event.type === 'scheduled_maintenance' ? (
                            <Button 
                              size="sm" 
                              variant="outline"
                              onClick={() => {
                                // Extract the reservation ID from the event ID  
                                let reservationId: number;
                                if (typeof event.id === 'string') {
                                  // Extract the number from strings like "scheduled_maintenance_60"
                                  const match = event.id.match(/\d+$/);
                                  reservationId = match ? parseInt(match[0]) : 0;
                                } else {
                                  reservationId = event.id;
                                }
                                
                                if (reservationId && reservationId > 0) {
                                  setSelectedMaintenanceReservationId(reservationId);
                                  setMaintenanceReservationDialogOpen(true);
                                }
                              }}
                            >
                              <Wrench className="h-4 w-4 mr-1" />
                              View Maintenance
                            </Button>
                          ) : (
                            <Button 
                              size="sm" 
                              variant="outline"
                              onClick={() => {
                                openScheduleFromEvent({
                                  date: event.date,
                                  startDate: event.startDate,
                                  vehicleId: event.vehicleId,
                                  type: event.type
                                });
                              }}
                            >
                              <Wrench className="h-4 w-4 mr-1" />
                              Schedule Maintenance
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
              
              {getMaintenanceEventsForDate(selectedDay).length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  <Calendar className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                  <p>No maintenance events scheduled for this day</p>
                  <Button 
                    className="mt-4" 
                    onClick={() => {
                      const dateStr = selectedDay ? safeFormat(selectedDay, 'yyyy-MM-dd', '') : null;
                      setSelectedScheduleDate(dateStr);
                      closeDayDialog();
                      setIsScheduleDialogOpen(true);
                    }}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Schedule Maintenance
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Schedule Maintenance Dialog */}
      <ScheduleMaintenanceDialog
        open={isScheduleDialogOpen}
        onOpenChange={(open) => {
          setIsScheduleDialogOpen(open);
          if (!open) {
            setEditingReservation(null);
            setSelectedScheduleDate(null);
            setSelectedVehicleIdForSchedule(null);
            setSelectedMaintenanceTypeForSchedule(null);
          }
        }}
        editingReservation={editingReservation}
        initialDate={selectedScheduleDate || undefined}
        initialVehicleId={selectedVehicleIdForSchedule || undefined}
        initialMaintenanceType={selectedMaintenanceTypeForSchedule || undefined}
        onSuccess={() => {
          invalidateRelatedQueries('reservations');
          invalidateRelatedQueries('vehicles');
          
          // Close the day dialog to immediately reflect changes
          closeDayDialog();
          
          // Force calendar to refresh by updating current date
          setCurrentDate(new Date(currentDate));
          setEditingReservation(null);
          
          // Show success message
          toast({
            title: "Maintenance Scheduled",
            description: "The maintenance has been scheduled and reminders have been updated.",
          });
        }}
      />

      {/* Maintenance Edit Dialog */}
      <MaintenanceEditDialog
        open={editDialogOpen}
        onOpenChange={(open) => {
          setEditDialogOpen(open);
          if (!open) {
            setSelectedReservation(null);
            invalidateRelatedQueries('reservations');
            invalidateRelatedQueries('vehicles');
          }
        }}
        reservation={selectedReservation}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Maintenance</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this maintenance reservation for{' '}
              {reservationToDelete?.vehicle ? (
                <>
                  <strong>
                    {reservationToDelete.vehicle.brand} {reservationToDelete.vehicle.model}
                  </strong>{' '}
                  ({displayLicensePlate(reservationToDelete.vehicle.licensePlate)})
                </>
              ) : (
                <strong>Vehicle {reservationToDelete?.vehicleId}</strong>
              )}
              ? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (reservationToDelete) {
                  handleDeleteMaintenance(reservationToDelete);
                }
              }}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Color Coding Dialog */}
      <ColorCodingDialog
        open={colorDialogOpen}
        onOpenChange={setColorDialogOpen}
      />

      {/* Maintenance List Dialog */}
      <MaintenanceListDialog
        open={maintenanceListDialogOpen}
        onOpenChange={setMaintenanceListDialogOpen}
      />

      {/* Vehicle View Dialog */}
      <VehicleViewDialog
        open={vehicleViewDialogOpen}
        onOpenChange={(open) => {
          setVehicleViewDialogOpen(open);
          if (!open) {
            setSelectedVehicleId(null);
          }
        }}
        vehicleId={selectedVehicleId}
      />

      {/* Maintenance Reservation View Dialog */}
      <MaintenanceViewDialog
        open={maintenanceReservationDialogOpen}
        onOpenChange={(open) => {
          setMaintenanceReservationDialogOpen(open);
          if (!open) {
            setSelectedMaintenanceReservationId(null);
          }
        }}
        reservationId={selectedMaintenanceReservationId}
        onEdit={(reservation) => {
          setMaintenanceReservationDialogOpen(false);
          setSelectedMaintenanceReservationId(null);
          handleEditMaintenance(reservation);
        }}
      />

      {/* Maintenance Completion Dialog */}
      <Dialog open={warrantyDateDialogOpen} onOpenChange={setWarrantyDateDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Complete Maintenance</DialogTitle>
            <DialogDescription>
              Review and update vehicle information after completing maintenance
            </DialogDescription>
          </DialogHeader>
          
          {/* Vehicle Information Section */}
          {completingReservation && (() => {
            const vehicle = vehicles?.find(v => v.id === completingReservation.vehicleId);
            if (!vehicle) return null;
            
            const maintenanceType = completingReservation.notes?.split(':')[0] || 'Maintenance';
            
            return (
              <div className="bg-muted/50 rounded-md p-4 mb-4 space-y-3">
                <div className="space-y-2">
                  <h3 className="font-medium text-sm">Vehicle Information</h3>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                    <div className="flex items-center">
                      <span className="text-muted-foreground mr-1">License:</span>
                      <span className="font-medium">{displayLicensePlate(vehicle.licensePlate)}</span>
                    </div>
                    <div className="flex items-center">
                      <span className="text-muted-foreground mr-1">Vehicle:</span>
                      <span className="font-medium">{vehicle.brand} {vehicle.model}</span>
                    </div>
                    <div className="flex items-center">
                      <span className="text-muted-foreground mr-1">Maintenance Type:</span>
                      <span className="font-medium">{maintenanceType}</span>
                    </div>
                    {vehicle.currentMileage !== undefined && vehicle.currentMileage !== null && (
                      <div className="flex items-center">
                        <span className="text-muted-foreground mr-1">Last Known Mileage:</span>
                        <span className="font-medium">{vehicle.currentMileage.toLocaleString()} km</span>
                      </div>
                    )}
                    {vehicle.apkDate && (
                      <div className="flex items-center">
                        <span className="text-muted-foreground mr-1">Current APK:</span>
                        <span className="font-medium">{format(parseISO(vehicle.apkDate), 'MMM d, yyyy')}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })()}
          
          <div className="space-y-4">
            {/* Row 1: Dates side by side */}
            <div className="border rounded-lg p-4 bg-slate-50 space-y-4">
              <h3 className="font-semibold text-base">Completion Details</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">Completion Date</label>
                  <Input
                    type="date"
                    value={completingReservation?.startDate ? format(parseISO(completingReservation.startDate), 'yyyy-MM-dd') : ''}
                    onChange={(e) => {
                      if (completingReservation) {
                        setCompletingReservation({
                          ...completingReservation,
                          startDate: e.target.value
                        });
                      }
                    }}
                    className="mt-2 bg-white"
                    data-testid="input-completion-date"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    When was maintenance completed?
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium">APK Date</label>
                  <Input
                    type="date"
                    value={apkDateInput}
                    onChange={(e) => setApkDateInput(e.target.value)}
                    className="mt-2 bg-white"
                    data-testid="input-apk-date"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    APK expiry date (if updated)
                  </p>
                </div>
              </div>

              {/* APK Form upload */}
              <div>
                <label className="text-sm font-medium">APK Inspection Form (Optional)</label>
                <Input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      setApkFormFile(file);
                    }
                  }}
                  className="mt-2 bg-white"
                  data-testid="input-apk-form"
                />
                {apkFormFile && (
                  <p className="text-xs text-green-600 mt-1">
                    Selected: {apkFormFile.name}
                  </p>
                )}
              </div>
            </div>

            {/* Service Details Section */}
            <div className="border rounded-lg p-4 bg-blue-50 space-y-4">
              <h3 className="font-semibold text-base">Service Details</h3>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">Service Category</label>
                  <Select value={maintenanceCategory} onValueChange={setMaintenanceCategory}>
                    <SelectTrigger className="mt-2 bg-white" data-testid="select-maintenance-category">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="scheduled_maintenance">Scheduled Maintenance</SelectItem>
                      <SelectItem value="repair">Repair</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground mt-1">
                    Maintenance or repair?
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium">Current Mileage (km)</label>
                  <Input
                    type="number"
                    value={currentMileage}
                    onChange={(e) => setCurrentMileage(e.target.value)}
                    placeholder="Odometer reading"
                    className="mt-2 bg-white"
                    data-testid="input-current-mileage"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Current vehicle mileage
                  </p>
                </div>
              </div>

              {/* Maintenance Details full width */}
              <div>
                <label className="text-sm font-medium">Maintenance Details</label>
                <Textarea
                  value={maintenanceDetails}
                  onChange={(e) => setMaintenanceDetails(e.target.value)}
                  placeholder={
                    maintenanceCategory === 'scheduled_maintenance'
                      ? "Describe the maintenance performed (e.g., oil change, air filter, spark plugs, cabin filter)"
                      : "Describe the repair performed (e.g., tire replacement, brake repair, battery, window fix, damage repair)"
                  }
                  className="mt-2 bg-white"
                  rows={3}
                  data-testid="textarea-maintenance-details"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  What work was done on the vehicle?
                </p>
              </div>
            </div>
            
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setWarrantyDateDialogOpen(false);
                  setCompletingReservation(null);
                  setApkDateInput('');
                  setApkFormFile(null);
                  setMaintenanceDetails('');
                  setMaintenanceCategory('scheduled_maintenance');
                  setCurrentMileage('');
                }}
              >
                Cancel
              </Button>
              <Button
                className="bg-green-600 hover:bg-green-700"
                onClick={async () => {
                  try {
                    if (!completingReservation) {
                      throw new Error('Missing required data');
                    }

                    // Upload APK form if provided
                    if (apkFormFile) {
                      const formData = new FormData();
                      // Important: append fields before the file for multer to parse correctly
                      formData.append('vehicleId', completingReservation.vehicleId.toString());
                      formData.append('documentType', 'APK Inspection');
                      formData.append('description', `APK inspection completed on ${apkDateInput || new Date().toISOString().split('T')[0]}`);
                      formData.append('file', apkFormFile);

                      const response = await fetch('/api/documents', {
                        method: 'POST',
                        body: formData,
                      });

                      if (!response.ok) {
                        const errorData = await response.json();
                        throw new Error(errorData.message || 'Failed to upload APK form');
                      }
                    }

                    // Build vehicle update payload
                    const vehicleUpdates: any = {
                      maintenanceStatus: 'ok',
                    };

                    // Add APK date if provided
                    if (apkDateInput) {
                      vehicleUpdates.apkDate = apkDateInput;
                    }

                    // Get the actual completion date (may be different from scheduled date)
                    const completionDate = completingReservation.startDate;

                    // Add mileage data to vehicle updates if provided
                    if (currentMileage && parseInt(currentMileage) > 0) {
                      vehicleUpdates.currentMileage = parseInt(currentMileage);
                      // Only update last service date/mileage for scheduled maintenance
                      if (maintenanceCategory === 'scheduled_maintenance') {
                        vehicleUpdates.lastServiceDate = completionDate;
                        vehicleUpdates.lastServiceMileage = parseInt(currentMileage);
                      }
                    }

                    // Update vehicle with new dates
                    await apiRequest('PATCH', `/api/vehicles/${completingReservation.vehicleId}`, vehicleUpdates);

                    // Update maintenance reservation to mark as complete with details
                    const maintenanceType = completingReservation.notes?.split(':')[0] || 'Maintenance';
                    const updatedNotes = maintenanceDetails 
                      ? `${maintenanceType}:\n${maintenanceDetails}`
                      : completingReservation.notes || 'Maintenance completed';
                    
                    await apiRequest('PATCH', `/api/reservations/${completingReservation.id}`, {
                      startDate: completionDate,
                      endDate: completionDate,
                      maintenanceStatus: 'out',
                      maintenanceCategory: maintenanceCategory,
                      notes: updatedNotes
                    });

                    invalidateRelatedQueries('reservations', { vehicleId: completingReservation.vehicleId });
                    invalidateRelatedQueries('vehicles');

                    setWarrantyDateDialogOpen(false);
                    setCompletingReservation(null);
                    setApkDateInput('');
                    setApkFormFile(null);
                    setMaintenanceDetails('');
                    setMaintenanceCategory('scheduled_maintenance');
                    setCurrentMileage('');
                    closeDayDialog();

                    toast({
                      title: "Maintenance Completed",
                      description: maintenanceDetails
                        ? `Maintenance completed: ${maintenanceDetails.substring(0, 50)}${maintenanceDetails.length > 50 ? '...' : ''}`
                        : "Vehicle maintenance tracking has been updated.",
                    });
                  } catch (error) {
                    console.error('Failed to complete maintenance:', error);
                    toast({
                      title: "Error",
                      description: "Failed to complete maintenance. Please try again.",
                      variant: "destructive",
                    });
                  }
                }}
                data-testid="button-complete-maintenance"
              >
                Complete
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Completed Maintenance Dialog */}
      <Dialog open={completedMaintenanceDialogOpen} onOpenChange={setCompletedMaintenanceDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Completed Maintenance History</DialogTitle>
            <DialogDescription>
              View, edit, revert, or delete completed maintenance records
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh]">
            {completedMaintenanceBlocks.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <p>No completed maintenance records found</p>
              </div>
            ) : (
              <div className="space-y-3">
                {[...completedMaintenanceBlocks]
                  .sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime())
                  .map((maintenance) => {
                    const vehicle = vehicles?.find(v => v.id === maintenance.vehicleId);
                    const maintenanceType = maintenance.notes?.split(':')[0] || 'Maintenance';
                    const maintenanceDetails = maintenance.notes?.split('\n')?.[1] || '';
                    const categoryBadge = maintenance.maintenanceCategory === 'scheduled_maintenance' ? 'Scheduled' : 'Repair';
                    const categoryColor = maintenance.maintenanceCategory === 'scheduled_maintenance' ? 'bg-blue-100 text-blue-800' : 'bg-orange-100 text-orange-800';
                    
                    return (
                      <div key={maintenance.id} className="border rounded-lg p-4 bg-gray-50">
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <h4 className="font-medium">{maintenanceType}</h4>
                              <Badge className={categoryColor}>{categoryBadge}</Badge>
                              <Badge variant="outline">
                                {vehicle ? `${vehicle.brand} ${vehicle.model} (${vehicle.licensePlate})` : 'Unknown Vehicle'}
                              </Badge>
                            </div>
                            <p className="text-sm text-gray-600">
                              Completed: {format(parseISO(maintenance.startDate), 'MMM d, yyyy')}
                            </p>
                            {maintenanceDetails && (
                              <p className="text-sm mt-2 text-gray-700">{maintenanceDetails}</p>
                            )}
                          </div>
                          <div className="flex gap-2 ml-4">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={async () => {
                                try {
                                  await apiRequest('PATCH', `/api/reservations/${maintenance.id}`, {
                                    maintenanceStatus: 'in'
                                  });
                                  invalidateRelatedQueries('reservations');
                                  toast({
                                    title: "Maintenance Reverted",
                                    description: "Maintenance has been marked as active again"
                                  });
                                } catch (error) {
                                  toast({
                                    title: "Error",
                                    description: "Failed to revert maintenance",
                                    variant: "destructive"
                                  });
                                }
                              }}
                              data-testid={`button-revert-${maintenance.id}`}
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1">
                                <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/>
                                <path d="M21 3v5h-5"/>
                                <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/>
                                <path d="M8 16H3v5"/>
                              </svg>
                              Revert
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="text-red-600 hover:text-red-700"
                                  data-testid={`button-delete-${maintenance.id}`}
                                >
                                  <Trash2 className="h-4 w-4 mr-1" />
                                  Delete
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Delete Completed Maintenance?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    This will permanently delete this maintenance record. This action cannot be undone.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction
                                    className="bg-red-600 hover:bg-red-700"
                                    onClick={async () => {
                                      try {
                                        await apiRequest('DELETE', `/api/reservations/${maintenance.id}`);
                                        invalidateRelatedQueries('reservations');
                                        invalidateRelatedQueries('vehicles');
                                        toast({
                                          title: "Maintenance Deleted",
                                          description: "The maintenance record has been permanently deleted"
                                        });
                                      } catch (error) {
                                        toast({
                                          title: "Error",
                                          description: "Failed to delete maintenance",
                                          variant: "destructive"
                                        });
                                      }
                                    }}
                                  >
                                    Delete
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </ScrollArea>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCompletedMaintenanceDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}