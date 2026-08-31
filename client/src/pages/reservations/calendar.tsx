import { useState, useMemo, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { format, addDays, subDays, isSameDay, parseISO, startOfMonth, endOfMonth, getDate, getDay, getMonth, getYear, isSameMonth, addMonths, startOfDay, endOfDay, isBefore, isAfter, differenceInDays, startOfWeek, endOfWeek } from "date-fns";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link, useLocation } from "wouter";
import { Vehicle, Reservation, Document, Driver, VehicleTransport } from "@shared/schema";
import { displayLicensePlate } from "@/lib/utils";
import { formatLicensePlate } from "@/lib/format-utils";
import { Price } from "@/components/ui/price";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
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
import { ReservationForm } from "@/components/reservations/reservation-form";
import { ReservationListDialog } from "@/components/reservations/reservation-list-dialog";
import { ReservationAddDialog } from "@/components/reservations/reservation-add-dialog";
import { StatusChangeDialog } from "@/components/reservations/status-change-dialog";
import { EditContractNumberDialog } from "@/components/reservations/edit-contract-number-dialog";
import { useAuth } from "@/hooks/use-auth";
import { UserPermission, UserRole } from "@shared/schema";
import { PickupDialog, ReturnDialog } from "@/components/reservations/pickup-return-dialogs";
import { ColorCodingDialog } from "@/components/calendar/color-coding-dialog";
import { CalendarLegend } from "@/components/calendar/calendar-legend";
import { formatReservationStatus } from "@/lib/format-utils";
import { formatCurrency } from "@/lib/utils";
import { getCustomReservationStyle, getCustomReservationStyleObject, getCustomIndicatorStyle, getCustomTBDStyle } from "@/lib/calendar-styling";
import { Calendar, User, Car, CreditCard, Edit, Eye, ClipboardEdit, Palette, Trash2, Wrench, ClipboardCheck, Mail, Search, FileText, Building, MapPin, Clock, History, AlertTriangle, Phone, RotateCcw, Printer } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiRequest, queryClient, invalidateRelatedQueries, invalidateByPrefix } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import InteractiveDamageCheckPage from "@/pages/interactive-damage-check";
import { EmailDocumentDialog } from "@/components/documents/email-document-dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { SpareVehicleDialog } from "@/components/reservations/spare-vehicle-dialog";
import { ScheduleMaintenanceDialog } from "@/components/maintenance/schedule-maintenance-dialog";
import { ReturnFromServiceDialog } from "@/components/reservations/return-from-service-dialog";

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
const COLUMNS = 5;

// Type for vehicle filters
type VehicleFilters = {
  search: string;
  type: string;
  availability: string;
};

// Helper function to parse maintenance type from notes
const parseMaintenanceType = (notes: string | null | undefined, t: (key: string) => string): string | null => {
  if (!notes) return null;

  // Notes format: "maintenanceType: description\nadditional notes"
  const firstLine = notes.split('\n')[0];
  const maintenanceTypeCode = firstLine.split(':')[0].trim();

  // Map maintenance type codes to translation keys
  const typeKeys: Record<string, string> = {
    'breakdown': 'calendarPage.maintenanceTypes.breakdown',
    'tire_replacement': 'calendarPage.maintenanceTypes.tireReplacement',
    'brake_service': 'calendarPage.maintenanceTypes.brakeService',
    'engine_repair': 'calendarPage.maintenanceTypes.engineRepair',
    'transmission_repair': 'calendarPage.maintenanceTypes.transmissionRepair',
    'electrical_issue': 'calendarPage.maintenanceTypes.electricalIssue',
    'air_conditioning': 'calendarPage.maintenanceTypes.airConditioning',
    'battery_replacement': 'calendarPage.maintenanceTypes.batteryReplacement',
    'oil_change': 'calendarPage.maintenanceTypes.oilChange',
    'regular_maintenance': 'calendarPage.maintenanceTypes.regularMaintenance',
    'apk_inspection': 'calendarPage.maintenanceTypes.apkInspection',
    'warranty_service': 'calendarPage.maintenanceTypes.warrantyService',
    'accident_damage': 'calendarPage.maintenanceTypes.accidentDamage',
    'other': 'calendarPage.maintenanceTypes.other'
  };

  const key = typeKeys[maintenanceTypeCode];
  return key ? t(key) : null;
};

// Helper function to find maintenance overlapping with a rental on a specific day
// Uses a memoized map with pre-normalized dates for O(1) lookup performance
const findMaintenanceForRental = (
  rental: Reservation, 
  day: Date, 
  maintenanceMap: Map<number, (Reservation & { _normalizedStart: Date; _normalizedEnd: Date })[]>
): Reservation | null => {
  if (!rental.vehicleId) return null;
  
  const maintenanceRecords = maintenanceMap.get(rental.vehicleId) || [];
  const dayStart = startOfDay(day);
  
  // Find the last (most recent) maintenance that overlaps with this day
  // Maintenance is sorted by start date, so we return the last match for consistent badge selection
  let lastMatch: Reservation | null = null;
  
  for (const maintenance of maintenanceRecords) {
    // Use pre-normalized dates for fast comparison (no parsing needed)
    if ((dayStart >= maintenance._normalizedStart) && (dayStart <= maintenance._normalizedEnd)) {
      lastMatch = maintenance;
    }
  }
  
  return lastMatch;
};

export default function ReservationCalendarPage() {
  const { t } = useTranslation(["reservations", "common"]);
  // Query client for cache invalidation
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  // Navigation
  const [_, navigate] = useLocation();
  
  const [view, setView] = useState<CalendarView>("month");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [vehicleFilters, setVehicleFilters] = useState<VehicleFilters>({
    search: "",
    type: "all",
    availability: "all"
  });
  const [displayLimit, setDisplayLimit] = useState(20);
  
  // Dialog states
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [pickupDialogOpen, setPickupDialogOpen] = useState(false);
  const [returnDialogOpen, setReturnDialogOpen] = useState(false);
  const [selectedReservation, setSelectedReservation] = useState<Reservation | null>(null);
  const [editContractNumberOpen, setEditContractNumberOpen] = useState(false);
  const [pdfPreviewOpen, setPdfPreviewOpen] = useState(false);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const { user: currentUser } = useAuth();
  const canManageReservations =
    currentUser?.role === UserRole.ADMIN ||
    !!currentUser?.permissions?.includes(UserPermission.MANAGE_RESERVATIONS);
  
  // Day reservations dialog
  const [dayDialogOpen, setDayDialogOpen] = useState(false);
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  
  // New reservation dialog
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  
  // List view dialog
  const [listDialogOpen, setListDialogOpen] = useState(false);
  const [openedFromListView, setOpenedFromListView] = useState(false);
  
  // Color coding dialog
  const [colorDialogOpen, setColorDialogOpen] = useState(false);
  
  // Document preview dialog
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false);
  const [previewDocument, setPreviewDocument] = useState<Document | null>(null);
  
  // Upload state
  const [uploadingDoc, setUploadingDoc] = useState(false);
  
  // Damage check dialog state
  const [damageCheckDialogOpen, setDamageCheckDialogOpen] = useState(false);
  const [editingDamageCheckId, setEditingDamageCheckId] = useState<number | null>(null);
  const [compareWithCheckId, setCompareWithCheckId] = useState<number | null>(null);
  
  // Email document dialog state
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  
  // Completed rentals dialog
  const [completedRentalsDialogOpen, setCompletedRentalsDialogOpen] = useState(false);
  const [completedRentalsSearch, setCompletedRentalsSearch] = useState('');
  const [completedRentalsDateFilter, setCompletedRentalsDateFilter] = useState<'all' | '7days' | '30days' | '90days' | 'year'>('all');
  
  // Overdue rentals dialog
  const [overdueDialogOpen, setOverdueDialogOpen] = useState(false);
  
  // Administration dialog for external invoicing
  const [adminDialogOpen, setAdminDialogOpen] = useState(false);
  const [deleteDamageCheckDialogOpen, setDeleteDamageCheckDialogOpen] = useState(false);
  const [damageCheckToDelete, setDamageCheckToDelete] = useState<number | null>(null);
  const [deleteReservationDialogOpen, setDeleteReservationDialogOpen] = useState(false);
  const [reservationToDelete, setReservationToDelete] = useState<Reservation | null>(null);
  const [deleteDocDialogOpen, setDeleteDocDialogOpen] = useState(false);
  const [documentToDelete, setDocumentToDelete] = useState<Document | null>(null);
  const [adminHistorySearch, setAdminHistorySearch] = useState('');
  const [adminHistoryDateFilter, setAdminHistoryDateFilter] = useState<'all' | '7days' | '30days' | '90days'>('all');
  const [adminCurrentSearch, setAdminCurrentSearch] = useState('');
  const [adminCurrentSort, setAdminCurrentSort] = useState<{ column: string; direction: 'asc' | 'desc' }>({ column: 'pickup', direction: 'desc' });
  const [adminHistorySort, setAdminHistorySort] = useState<{ column: string; direction: 'asc' | 'desc' }>({ column: 'return', direction: 'desc' });
  
  // Service dialogs state
  const [isServiceDialogOpen, setIsServiceDialogOpen] = useState(false);
  const [isSpareDialogOpen, setIsSpareDialogOpen] = useState(false);
  const [isReturnFromServiceDialogOpen, setIsReturnFromServiceDialogOpen] = useState(false);
  
  // Drag and drop state
  const [draggedReservation, setDraggedReservation] = useState<Reservation | null>(null);
  const [dragStartDay, setDragStartDay] = useState<Date | null>(null);
  const [dropTargetDate, setDropTargetDate] = useState<Date | null>(null);
  // A drop only stages the move - it is applied once confirmed, so an accidental
  // drag can't silently reschedule a reservation.
  const [pendingMove, setPendingMove] = useState<{
    reservation: Reservation;
    newStartDate: string;
    newEndDate: string | null;
    // What the drag itself proposed for the end date, so an edited end date can
    // be put back without cancelling the whole move.
    shiftedEndDate: string | null;
    daysDiff: number;
  } | null>(null);
  const [isMoving, setIsMoving] = useState(false);
  
  // Dialog handlers
  const handleViewReservation = (reservation: Reservation) => {
    console.log('handleViewReservation called with:', reservation);
    setSelectedReservation(reservation);
    setViewDialogOpen(true);
    console.log('View dialog should be open now');
  };
  
  const handleEditReservation = (reservation: Reservation) => {
    console.log('handleEditReservation called with:', reservation);
    setSelectedReservation(reservation);
    setEditDialogOpen(true);
    console.log('Edit dialog should be open now');
  };
  
  const refetchCalendarData = () => {
    queryClient.refetchQueries({ queryKey: ["/api/reservations/range"] });
  };

  const handleOpenDamageCheckDialog = (editCheckId: number | null = null, compareWithId: number | null = null) => {
    setEditingDamageCheckId(editCheckId);
    setCompareWithCheckId(compareWithId);
    setDamageCheckDialogOpen(true);
  };

  const handleCloseDamageCheckDialog = async () => {
    setDamageCheckDialogOpen(false);
    setEditingDamageCheckId(null);
    setCompareWithCheckId(null);
    // Refetch damage checks when dialog closes
    refetchDamageChecks();
    refetchDocuments();
    
    invalidateRelatedQueries('reservations');
    refetchCalendarData();
    
    // If view dialog is open, update the selected reservation with fresh data
    if (viewDialogOpen && selectedReservation) {
      // Use getQueriesData to find all matching queries (handles date range params)
      const queriesData = queryClient.getQueriesData({ queryKey: ["/api/reservations/range"] });
      
      // Find the updated reservation from any of the matching queries
      for (const [, data] of queriesData) {
        if (Array.isArray(data)) {
          const updatedReservation = data.find((r: any) => r.id === selectedReservation.id);
          if (updatedReservation) {
            console.log('✅ Updating selected reservation after damage check save:', updatedReservation);
            setSelectedReservation(updatedReservation);
            break;
          }
        }
      }
    }
  };

  const handleDeleteDamageCheck = (checkId: number) => {
    setDamageCheckToDelete(checkId);
    setDeleteDamageCheckDialogOpen(true);
  };

  const confirmDeleteDamageCheck = async () => {
    if (!damageCheckToDelete) return;
    
    try {
      const response = await fetch(`/api/interactive-damage-checks/${damageCheckToDelete}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete damage check');
      }

      toast({
        title: t('common:status.success'),
        description: t('calendarPage.damageCheckDeletedDescription'),
      });

      // Refetch damage checks and documents
      refetchDamageChecks();
      refetchDocuments();
      // Also actively refresh the per-vehicle log so other open views update.
      if (selectedReservation?.vehicleId) {
        queryClient.invalidateQueries({ queryKey: [`/api/interactive-damage-checks/vehicle/${selectedReservation.vehicleId}`], refetchType: 'active' });
      }
      if (selectedReservation?.id) {
        queryClient.invalidateQueries({ queryKey: [`/api/interactive-damage-checks/reservation/${selectedReservation.id}`], refetchType: 'active' });
      }
    } catch (error) {
      console.error('Error deleting damage check:', error);
      toast({
        title: t('common:status.error'),
        description: t('calendarPage.damageCheckDeleteFailedDescription'),
        variant: "destructive",
      });
    }
    setDamageCheckToDelete(null);
  };
  
  const handleStatusChange = (reservation: Reservation) => {
    // The status dialog now only reverts a picked_up reservation back to booked.
    // For any other status, this trigger is a no-op.
    if (reservation.status !== "picked_up") {
      return;
    }
    setSelectedReservation(reservation);
    setStatusDialogOpen(true);
  };
  
  const handleCloseDialogs = () => {
    console.log('Closing all dialogs');
    setViewDialogOpen(false);
    setEditDialogOpen(false);
    setSelectedReservation(null);
  };
  
  // Handle moving a reservation to a new date via drag and drop
  const handleMoveReservation = async (reservationId: number, newStartDate: string, newEndDate: string | null) => {
    try {
      const response = await apiRequest('PATCH', `/api/reservations/${reservationId}`, {
        startDate: newStartDate,
        endDate: newEndDate
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to move reservation');
      }
      
      invalidateRelatedQueries('reservations');
      refetchCalendarData();
      
      toast({
        title: t('common:status.success'),
        description: t('calendarPage.reservationMovedDescription', { date: format(parseISO(newStartDate), 'MMM d, yyyy') }),
      });
    } catch (error) {
      console.error('Error moving reservation:', error);
      toast({
        title: t('common:status.error'),
        description: error instanceof Error ? error.message : t('calendarPage.moveReservationFailedFallback'),
        variant: "destructive",
      });
    }
  };
  
  // Delete mutation with optimistic updates
  const deleteReservationMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await apiRequest('DELETE', `/api/reservations/${id}`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to delete reservation');
      }
      return response.json();
    },
    onMutate: async (reservationId: number) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ 
        predicate: (query) => {
          const key = query.queryKey[0];
          return typeof key === 'string' && key.includes('reservations');
        }
      });

      // Snapshot previous values
      const previousData: Record<string, any> = {};
      queryClient.getQueryCache().getAll().forEach(query => {
        const key = query.queryKey[0];
        if (typeof key === 'string' && key.includes('reservations')) {
          previousData[JSON.stringify(query.queryKey)] = query.state.data;
        }
      });

      // Optimistically update all reservation caches
      queryClient.getQueryCache().getAll().forEach(query => {
        const key = query.queryKey[0];
        if (typeof key === 'string' && key.includes('reservations')) {
          queryClient.setQueryData(query.queryKey, (old: any) => {
            // Only filter if old is an array
            if (Array.isArray(old)) {
              return old.filter(r => r.id !== reservationId);
            }
            // For single reservation objects, invalidate if it's the deleted one
            if (old && typeof old === 'object' && old.id === reservationId) {
              return undefined;
            }
            return old;
          });
        }
      });

      return { previousData };
    },
    onError: (error: Error, reservationId, context) => {
      // Rollback on error
      if (context?.previousData) {
        Object.entries(context.previousData).forEach(([keyStr, data]) => {
          const key = JSON.parse(keyStr);
          queryClient.setQueryData(key, data);
        });
      }
      
      toast({
        title: t('calendarPage.deleteFailedTitle'),
        description: error.message,
        variant: "destructive",
      });
    },
    onSuccess: async () => {
      await invalidateRelatedQueries('reservations');
      refetchCalendarData();

      toast({
        title: t('listDialog.toasts.deletedTitle'),
        description: t('listDialog.toasts.deletedDescription'),
      });
    },
  });
  
  const handleDeleteReservation = (reservation: Reservation) => {
    setReservationToDelete(reservation);
    setDeleteReservationDialogOpen(true);
  };

  const confirmDeleteReservation = () => {
    if (reservationToDelete) {
      deleteReservationMutation.mutate(reservationToDelete.id);
    }
    setReservationToDelete(null);
  };
  
  // Day dialog handlers
  const openDayDialog = (day: Date) => {
    console.log('Opening day dialog for:', day);
    setSelectedDay(day);
    setDayDialogOpen(true);
  };
  
  const closeDayDialog = () => {
    console.log('Closing day dialog');
    setDayDialogOpen(false);
    setSelectedDay(null);
  };
  
  // Helper function to get reservations that start or end on a specific day
  const getReservationsForDate = (day: Date): Reservation[] => {
    if (!reservations) return [];
    
    return reservations.filter((reservation: Reservation) => {
      const startDate = safeParseDateISO(reservation.startDate);
      const endDate = safeParseDateISO(reservation.endDate);
      
      if (!startDate) return false;
      
      // Only show reservations that start or end on this specific day
      const isStartDay = isSameDay(day, startDate);
      const isEndDay = endDate ? isSameDay(day, endDate) : false;
      
      return isStartDay || isEndDay;
    }).filter((reservation: Reservation) => {
      // TBD spare placeholders have no vehicle yet — always show them regardless
      // of vehicle filters, same exception the day-cell blocks already make, so
      // a transport or reservation that still needs a spare assigned doesn't
      // silently disappear from this list.
      if (reservation.placeholderSpare) return true;

      // Apply current vehicle filters
      const vehicle = vehicles?.find((v: Vehicle) => v.id === reservation.vehicleId);
      if (!vehicle) return false;

      // Search filter
      if (vehicleFilters.search &&
          !vehicle.licensePlate?.toLowerCase().includes(vehicleFilters.search.toLowerCase()) &&
          !vehicle.brand?.toLowerCase().includes(vehicleFilters.search.toLowerCase()) &&
          !vehicle.model?.toLowerCase().includes(vehicleFilters.search.toLowerCase())) {
        return false;
      }

      // Type filter
      if (vehicleFilters.type !== "all" && vehicle.vehicleType !== vehicleFilters.type) {
        return false;
      }

      return true;
    });
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
    
    // Generate all days in the calendar grid
    const dayCount = differenceInDays(lastDay, firstDay) + 1;
    const days = Array.from({ length: dayCount }, (_, i) => addDays(firstDay, i));
    
    const rangeText = format(currentDate, "MMMM yyyy");
    
    return { start, end, days, rangeText };
  }, [currentDate]);
  
  // Fetch vehicles
  const { data: vehicles, isLoading: isLoadingVehicles } = useQuery<Vehicle[]>({
    queryKey: ["/api/vehicles"],
  });

  // A transport-linked spare reservation for an external vehicle has no
  // customerId of its own to show — the closest thing to "who to contact" is
  // the owner name/phone captured on the Transport itself.
  const { data: transportsForOwnerLookup } = useQuery<VehicleTransport[]>({
    queryKey: ["/api/transports"],
  });
  const transportByIdForOwnerLookup = useMemo(() => {
    const map = new Map<number, VehicleTransport>();
    (transportsForOwnerLookup ?? []).forEach(t => map.set(t.id, t));
    return map;
  }, [transportsForOwnerLookup]);
  const getExternalOwnerInfo = (reservation: Reservation): { name: string | null; phone: string | null } | null => {
    if (reservation.replacementForTransportId == null) return null;
    const transport = transportByIdForOwnerLookup.get(reservation.replacementForTransportId);
    if (!transport?.isExternalVehicle) return null;
    if (!transport.externalOwnerName && !transport.externalOwnerPhone) return null;
    return { name: transport.externalOwnerName, phone: transport.externalOwnerPhone };
  };
  
  // Fetch reservations for the full calendar view (including adjacent month dates)
  const { data: allReservations, isLoading: isLoadingReservations } = useQuery<Reservation[]>({
    queryKey: [
      "/api/reservations/range", 
      {
        startDate: format(dateRanges.days[0], "yyyy-MM-dd"),
        endDate: format(dateRanges.days[dateRanges.days.length - 1], "yyyy-MM-dd")
      }
    ],
  });
  
  // Filter out completed/returned reservations from calendar view
  const reservations = useMemo(() => {
    if (!allReservations) return [];
    // Only show booked and picked_up reservations OR maintenance blocks OR placeholder spares OR replacement reservations
    // Returned and completed rentals appear in "View Completed" list
    return allReservations.filter(r => 
      r.type === 'maintenance_block' || 
      r.type === 'replacement' ||
      r.placeholderSpare === true ||
      ['booked', 'picked_up'].includes(r.status || '')
    );
  }, [allReservations]);
  
  // Fetch ALL reservations for building lookup maps (includes completed reservations outside calendar range)
  const { data: allReservationsForLookup = [] } = useQuery<Reservation[]>({
    queryKey: ['/api/reservations'],
  });
  
  // Build a lookup map: reservationId -> vehicleId (for finding original vehicles of spare assignments)
  const reservationVehicleLookup = useMemo(() => {
    const map = new Map<number, number>();
    allReservationsForLookup.forEach(r => {
      if (r.vehicleId) {
        map.set(r.id, r.vehicleId);
      }
    });
    return map;
  }, [allReservationsForLookup]);

  // A reservation of type 'replacement' is a spare vehicle standing in for the
  // vehicle on the reservation it replaces. Used by the admin invoice-data
  // dialog to show which vehicle a spare covers.
  const getSpareTargetVehicle = (rental: Reservation): Vehicle | undefined => {
    if (rental.type !== 'replacement' || !rental.replacementForReservationId) return undefined;
    const originalVehicleId = reservationVehicleLookup.get(rental.replacementForReservationId);
    if (!originalVehicleId) return undefined;
    return vehicles?.find(v => v.id === originalVehicleId);
  };
  
  // Fetch completed/returned rentals separately for the completed list with vehicle data
  const { data: completedRentals = [] } = useQuery<Reservation[]>({
    queryKey: ['/api/reservations', vehicles?.length],
    select: (reservations: Reservation[]) => {
      // Include both returned and completed statuses in the completed list
      const completed = reservations.filter(r => 
        (r.status === 'completed' || r.status === 'returned') && 
        r.type !== 'maintenance_block'
      );
      // Enrich with vehicle data for mileage display
      return completed.map(rental => {
        const vehicle = vehicles?.find(v => v.id === rental.vehicleId);
        return {
          ...rental,
          // Use reservation's returnMileage if available, otherwise fall back to vehicle's returnMileage
          displayReturnMileage: rental.returnMileage ?? vehicle?.returnMileage ?? null
        };
      });
    },
    enabled: !!vehicles
  });

  // Fetch overdue reservations (picked_up but past end date)
  // Note: No refetchInterval - real-time updates come via WebSocket to prevent dialog closures
  const { data: overdueReservations = [] } = useQuery<Reservation[]>({
    queryKey: ['/api/reservations/overdue'],
  });

  // Fetch documents for selected reservation
  const { data: reservationDocuments, refetch: refetchDocuments } = useQuery<Document[]>({
    queryKey: [`/api/documents/reservation/${selectedReservation?.id}`],
    enabled: !!selectedReservation?.id
  });

  // Fetch damage checks for this reservation
  const { data: reservationDamageChecks, refetch: refetchDamageChecks } = useQuery<any[]>({
    queryKey: [`/api/interactive-damage-checks/reservation/${selectedReservation?.id}`],
    enabled: !!selectedReservation?.id
  });

  // Fetch recent damage checks for vehicle+customer combination
  const { data: recentDamageChecks } = useQuery<any[]>({
    queryKey: [`/api/interactive-damage-checks/vehicle/${selectedReservation?.vehicleId}/customer/${selectedReservation?.customerId}`],
    enabled: !!selectedReservation?.vehicleId && !!selectedReservation?.customerId
  });

  // Fetch all damage checks for admin history view
  const { data: allDamageChecks = [] } = useQuery<any[]>({
    queryKey: ['/api/interactive-damage-checks'],
    enabled: adminDialogOpen
  });

  // Fetch calendar settings for holiday/blocked date display
  const { data: calendarSettings } = useQuery<{ key: string; value: any } | null>({
    queryKey: ["/api/app-settings/key/calendar_settings"],
  });

  // Helper function to check if a date is a holiday or blocked
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

  // Auto-open reservation dialog from sessionStorage (from notifications)
  useEffect(() => {
    if (!reservations) return;
    
    // Check sessionStorage for reservation to open
    const openReservationId = sessionStorage.getItem('openReservation');
    
    console.log('[Calendar] Checking for openReservation in sessionStorage:', openReservationId);
    
    if (openReservationId && !viewDialogOpen) {
      const reservationId = parseInt(openReservationId);
      const reservation = reservations.find(r => r.id === reservationId);
      
      console.log('[Calendar] Found reservation:', reservation);
      
      if (reservation) {
        console.log('[Calendar] Opening reservation dialog for:', reservationId);
        handleViewReservation(reservation);
        // Clear the sessionStorage after opening
        sessionStorage.removeItem('openReservation');
      }
    }
  }, [reservations, viewDialogOpen]);
  
  // Memoized maintenance map for O(1) lookups with pre-normalized dates (performance optimization)
  const maintenanceByVehicle = useMemo(() => {
    type NormalizedMaintenance = Reservation & { _normalizedStart: Date; _normalizedEnd: Date };
    if (!reservations) return new Map<number, NormalizedMaintenance[]>();
    
    const map = new Map<number, NormalizedMaintenance[]>();
    
    reservations
      .filter(res => res.type === 'maintenance_block' && res.vehicleId)
      .forEach(maintenance => {
        const vehicleId = maintenance.vehicleId!;
        
        // Pre-normalize dates for consistent comparisons
        const mStart = parseISO(maintenance.startDate);
        const mEnd = maintenance.endDate ? parseISO(maintenance.endDate) : mStart; // Null endDate = same day
        
        const normalized = {
          ...maintenance,
          _normalizedStart: startOfDay(mStart),
          _normalizedEnd: startOfDay(mEnd)
        };
        
        if (!map.has(vehicleId)) {
          map.set(vehicleId, []);
        }
        map.get(vehicleId)!.push(normalized);
      });
    
    // Sort each vehicle's maintenance by start date for consistent badge selection
    map.forEach(maintenanceList => {
      maintenanceList.sort((a, b) => a._normalizedStart.getTime() - b._normalizedStart.getTime());
    });
    
    return map;
  }, [reservations]);
  
  // Extract unique vehicle types for filtering
  const vehicleTypes = useMemo(() => {
    if (!vehicles) return [];
    const types = Array.from(new Set(vehicles.map(v => v.vehicleType).filter(Boolean))) as string[];
    return types.sort();
  }, [vehicles]);
  
  // Filter vehicles based on search, type, and availability
  const filteredVehicles = useMemo(() => {
    if (!vehicles) return [];
    
    return vehicles.filter(vehicle => {
      // Search filter
      const searchLower = vehicleFilters.search.toLowerCase();
      const matchesSearch = !vehicleFilters.search || 
        vehicle.licensePlate.toLowerCase().includes(searchLower) || 
        vehicle.brand.toLowerCase().includes(searchLower) || 
        vehicle.model.toLowerCase().includes(searchLower);
      
      // Vehicle type filter
      const matchesType = vehicleFilters.type === "all" || 
        vehicle.vehicleType === vehicleFilters.type;
      
      // Availability filter
      let matchesAvailability = true;
      if (vehicleFilters.availability !== "all" && reservations) {
        const hasReservation = reservations.some(res => 
          res.vehicleId === vehicle.id && 
          (vehicleFilters.availability === "reserved" || 
           (vehicleFilters.availability === "available" && 
            res.status.toLowerCase() !== "cancelled"))
        );
        
        matchesAvailability = vehicleFilters.availability === "reserved" ? 
          hasReservation : !hasReservation;
      }
      
      return matchesSearch && matchesType && matchesAvailability;
    })
    // Show limited number initially for better performance
    .slice(0, displayLimit);
  }, [vehicles, vehicleFilters, reservations, displayLimit]);
  
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

  // Function to get reservations for a specific day and vehicle
  const getReservationsForDay = (vehicleId: number, day: Date) => {
    if (!reservations) return [];
    
    return reservations.filter(res => {
      const startDate = safeParseDateISO(res.startDate);
      const endDate = safeParseDateISO(res.endDate);
      
      if (!startDate) return false;
      // For open-ended reservations, endDate might be null
      const actualEndDate = endDate || startDate;
      
      return res.vehicleId === vehicleId && isDateInRange(day, startDate, actualEndDate);
    });
  };
  
  // This function is no longer used since we only display pickup and return days
  // Keeping it for reference in case we need to revert
  const isDateInRange = (date: Date, start: Date, end: Date) => {
    const dayStart = startOfDay(date);
    const dayEnd = endOfDay(date);
    
    return (
      (start <= dayEnd && end >= dayStart) ||
      isSameDay(date, start) ||
      isSameDay(date, end)
    );
  };
  
  // Function to get reservation color and style based on status and type
  const getReservationStyle = (status: string, isStart: boolean, isEnd: boolean, reservationType?: string) => {
    // Use custom styling system first, fallback to default
    const customClass = getCustomReservationStyle(status, isStart, isEnd, reservationType);
    
    const roundedLeft = isStart ? "rounded-l-md" : "";
    const roundedRight = isEnd ? "rounded-r-md" : "";
    
    return `${customClass} ${roundedLeft} ${roundedRight}`;
  };
  
  // Function to get custom inline styles for reservations
  const getReservationStyleObject = (status: string, reservationType?: string) => {
    return getCustomReservationStyleObject(status, reservationType);
  };
  
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setVehicleFilters({
      ...vehicleFilters,
      search: e.target.value
    });
  };
  
  const handleTypeChange = (value: string) => {
    setVehicleFilters({
      ...vehicleFilters,
      type: value
    });
  };
  
  const handleAvailabilityChange = (value: string) => {
    setVehicleFilters({
      ...vehicleFilters,
      availability: value
    });
  };
  
  // Load more vehicles when user scrolls to bottom
  const loadMoreVehicles = () => {
    setDisplayLimit(prev => prev + 20);
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

  // Derived values for the drag-and-drop move confirmation
  const shiftedEndDate = pendingMove?.shiftedEndDate ?? null;
  const moveDatesInvalid = !!pendingMove?.newStartDate && !!pendingMove?.newEndDate
    && pendingMove.newEndDate < pendingMove.newStartDate;
  const moveStartShift = pendingMove
    ? differenceInDays(
        safeParseDateISO(pendingMove.newStartDate) ?? new Date(),
        safeParseDateISO(pendingMove.reservation.startDate) ?? new Date()
      )
    : 0;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">{t('calendarPage.title')}</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setListDialogOpen(true)} data-testid="button-list-view">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-list mr-2">
              <line x1="8" x2="21" y1="6" y2="6" />
              <line x1="8" x2="21" y1="12" y2="12" />
              <line x1="8" x2="21" y1="18" y2="18" />
              <line x1="3" x2="3" y1="6" y2="6" />
              <line x1="3" x2="3" y1="12" y2="12" />
              <line x1="3" x2="3" y1="18" y2="18" />
            </svg>
            {t('calendarPage.listViewButton')}
          </Button>
          <Button variant="outline" onClick={() => setCompletedRentalsDialogOpen(true)} data-testid="button-view-completed">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
              <polyline points="22 4 12 14.01 9 11.01"/>
            </svg>
            {t('calendarPage.viewCompletedButton', { count: completedRentals.length })}
          </Button>
          {overdueReservations.length > 0 && (
            <Button variant="destructive" onClick={() => setOverdueDialogOpen(true)} data-testid="button-view-overdue">
              <AlertTriangle className="h-4 w-4 mr-2" />
              {t('calendarPage.overdueButton', { count: overdueReservations.length })}
            </Button>
          )}
          <Button variant="outline" onClick={() => setAdminDialogOpen(true)} data-testid="button-administration">
            <FileText className="h-4 w-4 mr-2" />
            {t('calendarPage.administrationButton')}
          </Button>
          <ReservationAddDialog
            onSuccess={async (reservation) => {
              // Fetch the full reservation data with related entities
              try {
                const response = await fetch(`/api/reservations/${reservation.id}`, {
                  credentials: 'include',
                });
                
                if (response.ok) {
                  const fullReservation = await response.json();
                  setSelectedReservation(fullReservation);
                  setViewDialogOpen(true);
                  invalidateRelatedQueries('reservations');
                  queryClient.refetchQueries({ queryKey: ["/api/reservations/range"] });
                }
              } catch (error) {
                console.error('Error fetching new reservation:', error);
              }
            }}
          >
            <Button>
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-plus mr-2">
                <line x1="12" x2="12" y1="5" y2="19" />
                <line x1="5" x2="19" y1="12" y2="12" />
              </svg>
              {t('addDialog.newReservation')}
            </Button>
          </ReservationAddDialog>
        </div>
      </div>
      <Card>
        <CardHeader className="flex-row justify-between items-center space-y-0 pb-2">
          <div>
            <CardTitle>{t('calendarPage.scheduleTitle')}</CardTitle>
            <CardDescription>{t('calendarPage.scheduleDescription')}</CardDescription>
          </div>
          <div className="flex-shrink-0 flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setColorDialogOpen(true)}>
              <Palette className="h-4 w-4 mr-1" />
              {t('calendarPage.colorsButton')}
            </Button>
            <Button variant="outline" size="sm" onClick={goToToday}>{t('calendarPage.todayButton')}</Button>
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          {/* Top Controls */}
          <div className="flex flex-col md:flex-row justify-between gap-4 mb-6">
            {/* Calendar Navigation */}
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" onClick={navigatePrevious}>
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-chevron-left">
                  <path d="m15 18-6-6 6-6"/>
                </svg>
              </Button>
              <h4 className="text-base font-medium w-40 text-center">{dateRanges.rangeText}</h4>
              <Button variant="ghost" size="icon" onClick={navigateNext}>
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-chevron-right">
                  <path d="m9 18 6-6-6-6"/>
                </svg>
              </Button>
              <Button variant="outline" size="sm" onClick={goToToday}>{t('calendarPage.todayButton')}</Button>
            </div>

            {/* Vehicle Filters */}
            <div className="flex flex-wrap gap-2">
              <Input
                placeholder={t('calendarPage.filters.searchPlaceholder')}
                value={vehicleFilters.search}
                onChange={handleSearchChange}
                className="w-40 h-9"
              />

              {vehicleTypes.length > 0 && (
                <Select value={vehicleFilters.type} onValueChange={handleTypeChange}>
                  <SelectTrigger className="w-40 h-9">
                    <SelectValue placeholder={t('calendarPage.filters.vehicleTypePlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('calendarPage.filters.allTypesOption')}</SelectItem>
                    {vehicleTypes.map(type => (
                      <SelectItem key={type} value={type}>{type}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              <Select value={vehicleFilters.availability} onValueChange={handleAvailabilityChange}>
                <SelectTrigger className="w-40 h-9">
                  <SelectValue placeholder={t('calendarPage.filters.availabilityPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('calendarPage.filters.allVehiclesOption')}</SelectItem>
                  <SelectItem value="available">{t('common:status.available')}</SelectItem>
                  <SelectItem value="reserved">{t('calendarPage.filters.reservedOption')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Month View — on phones the 5-column grid squeezes into unreadable
              slivers, so it scrolls horizontally at a readable minimum width;
              desktop is unchanged. */}
          <div className="mb-6 overflow-x-auto">
            <div className="min-w-[640px]">
            {/* Calendar Header - Hidden in 5-column mode for better alignment */}

            {/* Calendar Grid */}
            <div className="border rounded-lg overflow-hidden">
              {calendarGrid.map((week, weekIndex) => (
                <div key={weekIndex} className="grid grid-cols-5 divide-x border-b last:border-b-0">
                  {week.map((day, dayIndex) => {
                    const isCurrentMonth = isSameMonth(day, currentDate);
                    const isToday = isSameDay(day, new Date());
                    const dateStatus = getDateStatus(day);
                    
                    // Only get reservations starting or ending on this day
                    // Filter reservations based on selected vehicles
                    // EXCLUDE maintenance blocks - they show as badge overlays on rentals, not separate blocks
                    const dayReservations = reservations?.filter(res => {
                      const startDate = safeParseDateISO(res.startDate);
                      const endDate = safeParseDateISO(res.endDate);
                      
                      if (!startDate) return false;
                      
                      // Exclude maintenance blocks - they're informational overlays only
                      if (res.type === 'maintenance_block') return false;
                      
                      // Exclude returned and completed rentals - only show active rentals on calendar
                      // EXCEPTION: Always show TBD spare placeholders to indicate spare vehicle requirements
                      if (!res.placeholderSpare && (res.status === 'returned' || res.status === 'completed')) return false;
                      
                      // Check if this day is a pickup or return day (only if endDate is valid)
                      const isPickupDay = isSameDay(day, startDate);
                      const isReturnDay = endDate ? isSameDay(day, endDate) : false;
                      
                      // First filter by date (pickup or return day)
                      const matchesDate = isPickupDay || isReturnDay;
                      
                      // Then check if the vehicle is in the filtered vehicles list
                      // ALWAYS show TBD spare reservations (placeholderSpare === true) regardless of filters
                      const matchesFilter = vehicleFilters.search === "" && vehicleFilters.type === "all" && vehicleFilters.availability === "all" || 
                                           filteredVehicles.some(v => v.id === res.vehicleId) ||
                                           res.placeholderSpare === true;
                                           
                      return matchesDate && matchesFilter;
                    }) || [];
                    
                    const isDropTarget = dropTargetDate && isSameDay(day, dropTargetDate);
                    
                    // Build background class based on status
                    let bgClass = '';
                    if (!isCurrentMonth) bgClass = 'bg-gray-50';
                    else if (isDropTarget) bgClass = 'bg-green-100 ring-2 ring-green-500';
                    else if (dateStatus.isBlocked) bgClass = 'bg-red-50';
                    else if (dateStatus.isHoliday) bgClass = 'bg-orange-50';
                    else if (isToday) bgClass = 'bg-blue-50';
                    
                    return (
                      <div
                        key={dayIndex}
                        className={`min-h-[140px] p-3 ${bgClass} relative group cursor-pointer transition-colors`}
                        onDragOver={(e) => {
                          if (draggedReservation) {
                            // Allow dropping on any visible date (including prev/next month dates)
                            e.preventDefault();
                            e.dataTransfer.dropEffect = 'move';
                            setDropTargetDate(day);
                          }
                        }}
                        onDragLeave={() => {
                          setDropTargetDate(null);
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          
                          if (!draggedReservation || !dragStartDay) return;
                          
                          const oldStartDate = safeParseDateISO(draggedReservation.startDate);
                          const oldEndDate = safeParseDateISO(draggedReservation.endDate);
                          
                          if (!oldStartDate) return;
                          
                          // Calculate the offset from the day where drag started to the drop day
                          const daysDiff = differenceInDays(day, dragStartDay);
                          
                          // Calculate new dates by applying the offset to both start and end dates
                          const newStartDate = format(addDays(oldStartDate, daysDiff), 'yyyy-MM-dd');
                          const newEndDate = oldEndDate ? format(addDays(oldEndDate, daysDiff), 'yyyy-MM-dd') : null;

                          // Dropped back on the same day - nothing to move, nothing to confirm
                          if (daysDiff !== 0) {
                            setPendingMove({
                              reservation: draggedReservation,
                              newStartDate,
                              newEndDate,
                              shiftedEndDate: newEndDate,
                              daysDiff,
                            });
                          }

                          setDraggedReservation(null);
                          setDragStartDay(null);
                          setDropTargetDate(null);
                        }}
                        onClick={(e) => {
                          // Allow clicking on any visible date (including prev/next month dates shown grayed out)
                          const allDayReservations = getReservationsForDate(day);
                          // Filter out maintenance blocks - they shouldn't prevent adding new reservations
                          const rentalReservations = allDayReservations.filter(r => r.type !== 'maintenance_block');
                          
                          if (rentalReservations.length > 0) {
                            // If there are rental reservations, show them in dialog
                            console.log('Date box clicked - opening day dialog for:', safeFormat(day, 'yyyy-MM-dd', 'invalid-date'));
                            openDayDialog(day);
                          } else {
                            // If no rental reservations (only maintenance or empty), open new reservation dialog
                            const formattedDate = safeFormat(day, "yyyy-MM-dd", '1970-01-01');
                            console.log('Date box clicked - no rental reservations, opening add dialog');
                            setSelectedDate(formattedDate);
                            setAddDialogOpen(true);
                          }
                        }}
                      >
                        {/* Quick add button - shows on hover for all visible days, positioned at top center */}
                        <div className="absolute top-1 left-0 right-0 flex justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10">
                            <Button 
                              size="icon" 
                              variant="ghost" 
                              className="h-5 w-5 bg-primary/10 hover:bg-primary/20 rounded-full border border-primary/20 shadow-sm p-0"
                              onClick={(e) => {
                                e.stopPropagation();
                                const formattedDate = safeFormat(day, "yyyy-MM-dd", '1970-01-01');
                                setSelectedDate(formattedDate);
                                setAddDialogOpen(true);
                              }}
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-plus">
                                <path d="M5 12h14"/>
                                <path d="M12 5v14"/>
                              </svg>
                            </Button>
                          </div>
                        <div className="flex justify-between items-center mb-3">
                          <div className="flex items-center space-x-2">
                            <span className="text-xs text-gray-500 font-medium">
                              {safeFormat(day, "EEE", "???")}
                            </span>
                            <span className={`text-base font-medium ${isToday ? 'bg-blue-600 text-white rounded-full w-7 h-7 flex items-center justify-center' : ''}`}>
                              {safeFormat(day, "d", "?")}
                            </span>
                            {dateStatus.isHoliday && (
                              <Badge variant="outline" className="bg-orange-100 text-orange-700 border-orange-300 text-xs px-1.5 py-0">
                                🎉 {dateStatus.holidayName || t('calendarPage.grid.holidayFallback')}
                              </Badge>
                            )}
                            {dateStatus.isBlocked && (
                              <Badge variant="outline" className="bg-red-100 text-red-700 border-red-300 text-xs px-1.5 py-0">
                                🚫 {dateStatus.blockedReason || t('calendarPage.grid.blockedFallback')}
                              </Badge>
                            )}
                          </div>
                          {dayReservations.length > 0 && (
                            <Badge variant="outline" className="text-sm font-medium">
                              {dayReservations.length}
                            </Badge>
                          )}
                        </div>
                        
                        {/* Show up to 5 reservations in month view */}
                        <div className="space-y-2">
                          {dayReservations.slice(0, 5).map(res => {
                            try {
                              const startDate = safeParseDateISO(res.startDate);
                              const endDate = safeParseDateISO(res.endDate);
                              
                              if (!startDate) return null;
                              
                              const isPickupDay = isSameDay(day, startDate);
                              const isReturnDay = endDate ? isSameDay(day, endDate) : false;
                              
                              // Calculate rental duration only if both dates are valid
                              const rentalDuration = endDate ? differenceInDays(endDate, startDate) + 1 : 1;
                            
                            // Check for overlapping maintenance on this day (using memoized map for performance)
                            const overlappingMaintenance = findMaintenanceForRental(res, day, maintenanceByVehicle);
                            
                            // Get maintenance status badge color
                            const getMaintenanceBadgeColor = (status: string | null | undefined) => {
                              switch (status) {
                                case 'scheduled':
                                  return 'bg-amber-400 text-amber-900 border-amber-500';
                                case 'in':
                                  return 'bg-purple-400 text-purple-900 border-purple-500';
                                case 'out':
                                  return 'bg-green-400 text-green-900 border-green-500';
                                default:
                                  return 'bg-gray-400 text-gray-900 border-gray-500';
                              }
                            };
                            
                            return (
                              <HoverCard key={res.id} openDelay={300} closeDelay={200}>
                                <HoverCardTrigger asChild>
                                  <div 
                                    draggable={res.status === 'booked' && res.type !== 'maintenance_block'}
                                    onDragStart={(e) => {
                                      // Only allow dragging booked reservations (not picked_up, returned, completed, or maintenance)
                                      if (res.status !== 'booked' || res.type === 'maintenance_block') {
                                        e.preventDefault();
                                        return;
                                      }
                                      e.stopPropagation();
                                      setDraggedReservation(res);
                                      setDragStartDay(day);
                                      // Set drag image and data
                                      e.dataTransfer.effectAllowed = 'move';
                                      e.dataTransfer.setData('text/plain', String(res.id));
                                    }}
                                    onDragEnd={() => {
                                      setDraggedReservation(null);
                                      setDragStartDay(null);
                                      setDropTargetDate(null);
                                    }}
                                    className={`px-2 py-1.5 text-sm truncate ${res.status === 'booked' && res.type !== 'maintenance_block' ? 'cursor-move' : 'cursor-pointer'} group/res relative ${getReservationStyle(res.status, isPickupDay, isReturnDay, res.type)}`}
                                    style={getReservationStyleObject(res.status, res.type)}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      console.log('Main reservation item clicked for:', res.id);
                                      handleViewReservation(res);
                                    }}
                                    data-testid={`reservation-item-${res.id}`}
                                  >
                                    <div className="space-y-1">
                                      <div className="flex justify-between items-center">
                                        <div className="truncate flex items-center">
                                          <span 
                                            className={`px-1.5 py-0.5 rounded text-xs font-semibold mr-1 ${res.placeholderSpare && !res.vehicleId ? 'bg-orange-100 text-orange-800' : 'bg-primary-100 text-primary-800'}`}
                                            style={res.placeholderSpare && !res.vehicleId ? getCustomTBDStyle() : {}}
                                          >
                                            {res.placeholderSpare && !res.vehicleId ? t('indexPage.tbdBadge') : formatLicensePlate(res.vehicle?.licensePlate || '')}
                                          </span>
                                          {overlappingMaintenance && (
                                            <span 
                                              className={`ml-1 inline-flex items-center gap-0.5 text-[10px] px-1 py-0.5 rounded font-bold border ${getMaintenanceBadgeColor(overlappingMaintenance.maintenanceStatus)}`}
                                              title={t('calendarPage.reservationCard.maintenanceTooltip', { type: parseMaintenanceType(overlappingMaintenance.notes, t) || t('calendarPage.reservationCard.serviceFallback'), status: overlappingMaintenance.maintenanceStatus || t('calendarPage.reservationCard.statusUnknown') })}
                                            >
                                              <Wrench className="w-2.5 h-2.5" />
                                            </span>
                                          )}
                                          {res.type === 'replacement' && (
                                            <span className="ml-1 inline-block bg-orange-300 text-orange-900 text-[10px] px-1.5 py-0.5 rounded font-bold border border-orange-400">
                                              🚗 {t('indexPage.spareBadge')}
                                            </span>
                                          )}
                                          {isPickupDay && 
                                            <span 
                                              className="ml-1 inline-block bg-green-200 text-green-800 text-[10px] px-1 rounded-sm font-medium"
                                              style={getCustomIndicatorStyle('pickup')}
                                            >
                                              {t('calendarPage.grid.outIndicator')}
                                            </span>
                                          }
                                          {isReturnDay &&
                                            <span
                                              className="ml-1 inline-block bg-blue-200 text-blue-800 text-[10px] px-1 rounded-sm font-medium"
                                              style={getCustomIndicatorStyle('return')}
                                            >
                                              {t('calendarPage.grid.inIndicator')}
                                            </span>
                                          }
                                        </div>
                                      
                                      {/* Edit button - only visible on hover */}
                                      <Button
                                        onClick={(e) => {
                                          e.stopPropagation(); // Prevent triggering the parent onClick
                                          console.log('Small edit button clicked for:', res.id);
                                          handleEditReservation(res);
                                        }}
                                        size="icon"
                                        variant="ghost"
                                        className="h-3 w-3 opacity-0 group-hover/res:opacity-100 transition-opacity p-0"
                                      >
                                        <Edit className="h-2 w-2" />
                                      </Button>
                                      </div>
                                      
                                      {/* Customer information and status */}
                                      <div className="flex justify-between items-center">
                                        <div className="text-sm text-gray-600 truncate font-medium">
                                          {res.type === 'maintenance_block' ? (
                                            (() => {
                                              const maintenanceType = parseMaintenanceType(res.notes, t);
                                              return (
                                                <span className="flex items-center gap-1 text-purple-700">
                                                  <Wrench className="w-3 h-3 text-purple-600" />
                                                  {t('calendarPage.reservationCard.comingInFor', { type: maintenanceType || t('calendarPage.reservationCard.serviceFallback') })}
                                                </span>
                                              );
                                            })()
                                          ) : res.type === 'replacement' && res.replacementForReservationId ? (
                                            (() => {
                                              // Find the original vehicle using the lookup map (works even if original reservation is outside calendar range)
                                              const originalVehicleId = reservationVehicleLookup.get(res.replacementForReservationId);
                                              const originalVehicle = originalVehicleId ? vehicles?.find(v => v.id === originalVehicleId) : null;

                                              if (originalVehicle) {
                                                return (
                                                  <span className="flex items-center gap-1 text-orange-700">
                                                    {t('calendarPage.reservationCard.replacingVehicle', { plate: formatLicensePlate(originalVehicle.licensePlate) })}
                                                  </span>
                                                );
                                              }
                                              return res.customer?.name || t('calendarPage.reservationCard.noCustomer');
                                            })()
                                          ) : res.type === 'replacement' && res.replacementForTransportId ? (
                                            <span className="flex items-center gap-1 text-orange-700">
                                              {t('calendarPage.reservationCard.replacingTransport', { id: res.replacementForTransportId })}
                                            </span>
                                          ) : (
                                            res.customer?.name || t('calendarPage.reservationCard.noCustomer')
                                          )}
                                        </div>
                                        {res.type === 'maintenance_block' && (
                                          <span className="text-[10px] font-semibold text-purple-700 bg-purple-200 px-1 py-0.5 rounded border border-purple-300">
                                            {res.maintenanceStatus?.toUpperCase() || 'IN'}
                                          </span>
                                        )}
                                        {res.type === 'replacement' && (
                                          <span className="text-[10px] font-semibold text-orange-700 bg-orange-200 px-1 py-0.5 rounded border border-orange-300">
                                            {formatReservationStatus(res.status).toUpperCase()}
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                </HoverCardTrigger>
                                <HoverCardContent 
                                  className="w-80 p-0 shadow-lg" 
                                  side="right"
                                  align="start"
                                >
                                  {/* Reservation Preview Card */}
                                  <div className="space-y-2">
                                    {/* Header with status badge */}
                                    <div className="flex items-center justify-between border-b p-3">
                                      <h4 className="font-medium">
                                        {res.type === 'maintenance_block' ? t('calendarPage.hoverCard.maintenanceServiceTitle') :
                                         res.type === 'replacement' ? t('spareVehicleDialog.title') : t('viewDialog.title')}
                                      </h4>
                                      <div className="flex gap-2">
                                        {res.type === 'maintenance_block' && (
                                          <Badge className="bg-purple-100 text-purple-800 border-purple-200" variant="outline">
                                            <Wrench className="w-3 h-3 mr-1" />
                                            {t('calendarPage.hoverCard.maintenanceBadge')}
                                          </Badge>
                                        )}
                                        {res.type === 'replacement' && (
                                          <Badge className="bg-orange-100 text-orange-800 border-orange-200" variant="outline">
                                            {t('indexPage.spareBadge')}
                                          </Badge>
                                        )}
                                        <Badge 
                                          className={`${
                                            res.type === 'maintenance_block' ? 
                                              (res.maintenanceStatus === 'scheduled' ? 'bg-amber-100 text-amber-800 border-amber-200' :
                                               res.maintenanceStatus === 'in' ? 'bg-purple-100 text-purple-800 border-purple-200' : 
                                               'bg-green-100 text-green-800 border-green-200') :
                                            res.status?.toLowerCase() === 'booked' ? 'bg-blue-100 text-blue-800 border-blue-200 hover:bg-blue-200' : 
                                            res.status?.toLowerCase() === 'picked_up' ? 'bg-orange-100 text-orange-800 border-orange-200 hover:bg-orange-200' :
                                            res.status?.toLowerCase() === 'returned' ? 'bg-purple-100 text-purple-800 border-purple-200 hover:bg-purple-200' :
                                            res.status?.toLowerCase() === 'completed' ? 'bg-green-100 text-green-800 border-green-200 hover:bg-green-200' :
                                            res.status?.toLowerCase() === 'cancelled' ? 'bg-red-100 text-red-800 border-red-200 hover:bg-red-200' :
                                            'bg-gray-100 text-gray-800 border-gray-200 hover:bg-gray-200'
                                          }`}
                                          variant="outline"
                                        >
                                          {res.type === 'maintenance_block' ? (res.maintenanceStatus?.toUpperCase() || 'IN') : formatReservationStatus(res.status)}
                                        </Badge>
                                      </div>
                                    </div>
                                    
                                    {/* Vehicle details */}
                                    <div className="px-3 py-1 flex items-start space-x-2">
                                      <Car className="h-4 w-4 text-gray-500 mt-0.5" />
                                      <div>
                                        {res.placeholderSpare && !res.vehicleId ? (
                                          <>
                                            <div className="font-medium text-sm text-orange-700">{t('calendarPage.hoverCard.tbdSpareVehicleLabel')}</div>
                                            <div className="text-xs text-gray-600">
                                              <span className="bg-orange-100 text-orange-800 px-1.5 py-0.5 rounded text-xs font-semibold">
                                                {t('spareVehicleAssignmentDialog.awaitingAssignment')}
                                              </span>
                                            </div>
                                          </>
                                        ) : (
                                          <>
                                            <div className="font-medium text-sm">{res.vehicle?.brand} {res.vehicle?.model}</div>
                                            <div className="text-xs text-gray-600">
                                              <span className="bg-primary-100 text-primary-800 px-1.5 py-0.5 rounded text-xs font-semibold">
                                                {formatLicensePlate(res.vehicle?.licensePlate || '')}
                                              </span>
                                            </div>
                                          </>
                                        )}
                                      </div>
                                    </div>
                                    
                                    {/* Customer details */}
                                    <div className="px-3 py-1 flex items-start space-x-2">
                                      <User className="h-4 w-4 text-gray-500 mt-0.5" />
                                      <div className="flex-1">
                                        <div className="text-xs font-semibold text-gray-500 mb-1">{t('viewDialog.customerLabel')}</div>
                                        <div className="font-medium text-sm">{res.customer?.name}</div>
                                        <div className="text-xs text-gray-600">{res.customer?.email || t('calendarPage.hoverCard.noEmailProvided')}</div>
                                        {res.customer?.phone && <div className="text-xs text-gray-600">{res.customer?.phone}</div>}
                                      </div>
                                    </div>

                                    {/* Driver details */}
                                    {res.driver && (
                                      <div className="px-3 py-1 flex items-start space-x-2 bg-blue-50 -mx-3 border-t border-blue-100">
                                        <User className="h-4 w-4 text-blue-600 mt-0.5" />
                                        <div className="flex-1">
                                          <div className="text-xs font-semibold text-blue-600 mb-1">{t('calendarPage.hoverCard.driverLabel')}</div>
                                          <div className="font-medium text-sm text-blue-900 flex items-center gap-1">
                                            {res.driver.displayName}
                                            {res.driver.isPrimaryDriver && (
                                              <Badge className="bg-blue-100 text-blue-800 border-blue-200 text-[10px] px-1 py-0">{t('viewDialog.primaryBadge')}</Badge>
                                            )}
                                          </div>
                                          {res.driver.phone && <div className="text-xs text-blue-700">{res.driver.phone}</div>}
                                          {res.driver.driverLicenseNumber && (
                                            <div className="text-xs text-blue-600">{t('calendarPage.licenseColonLabel')} {res.driver.driverLicenseNumber}</div>
                                          )}
                                        </div>
                                      </div>
                                    )}

                                    {/* Dates */}
                                    <div className="px-3 py-1 flex items-start space-x-2">
                                      <Calendar className="h-4 w-4 text-gray-500 mt-0.5" />
                                      <div>
                                        <div className="grid grid-cols-2 gap-2 text-xs">
                                          <div>
                                            <span className="text-gray-500">{t('calendarPage.hoverCard.startColonLabel')}</span> {startDate ? format(startDate, 'MMM d, yyyy') : t('calendarPage.invalidDate')}
                                          </div>
                                          <div>
                                            <span className="text-gray-500">{t('calendarPage.hoverCard.endColonLabel')}</span> {endDate ? format(endDate, 'MMM d, yyyy') : t('vehicleReservationsStatusDialog.openEnded')}
                                          </div>
                                          <div className="col-span-2">
                                            <span className="text-gray-500">{t('calendarPage.hoverCard.durationColonLabel')}</span> {t('form.dayCount', { count: rentalDuration })}
                                          </div>
                                        </div>
                                      </div>
                                    </div>

                                    {/* Price and mileage - hide for maintenance */}
                                    {res.type !== 'maintenance_block' && (
                                      <div className="px-3 py-1 flex items-start space-x-2">
                                        <CreditCard className="h-4 w-4 text-gray-500 mt-0.5" />
                                        <div className="grid grid-cols-2 gap-2 text-xs">
                                          {res.totalPrice && (
                                            <div>
                                              <span className="text-gray-500">{t('calendarPage.hoverCard.priceColonLabel')}</span> {<Price value={Number(res.totalPrice)} />}
                                            </div>
                                          )}
                                          <div>
                                            <span className="text-gray-500">{t('calendarPage.hoverCard.statusColonLabel')}</span>
                                            <Badge className="ml-1 text-xs">{formatReservationStatus(res.status)}</Badge>
                                          </div>
                                        </div>
                                      </div>
                                    )}
                                    
                                    {/* Notes if available */}
                                    {res.notes && (
                                      <div className="px-3 py-1 flex items-start space-x-2">
                                        <div className="bg-gray-50 p-2 rounded text-xs text-gray-700 w-full">
                                          {res.notes}
                                        </div>
                                      </div>
                                    )}
                                    
                                    {/* Action buttons */}
                                    <div className="border-t p-3 flex justify-end space-x-2">
                                      <Button 
                                        size="sm" 
                                        variant="outline"
                                        className="h-8 text-xs"
                                        onClick={(e) => {
                                          e.preventDefault();
                                          e.stopPropagation();
                                          console.log('View clicked for reservation:', res.id);
                                          handleViewReservation(res);
                                        }}
                                      >
                                        <Eye className="mr-1 h-3 w-3" />
                                        {t('common:actions.view')}
                                      </Button>
                                      {res.status === 'picked_up' && (
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          className="h-8 text-xs bg-blue-50 hover:bg-blue-100 text-blue-700 border-blue-200"
                                          onClick={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            handleStatusChange(res);
                                          }}
                                          title={t('quickStatusButton.revertToBooked')}
                                        >
                                          <RotateCcw className="mr-1 h-3 w-3" />
                                          {t('calendarPage.hoverCard.revertButton')}
                                        </Button>
                                      )}
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-8 text-xs"
                                        onClick={(e) => {
                                          e.preventDefault();
                                          e.stopPropagation();
                                          console.log('Edit clicked for reservation:', res.id);
                                          handleEditReservation(res);
                                        }}
                                      >
                                        <Edit className="mr-1 h-3 w-3" />
                                        {t('common:actions.edit')}
                                      </Button>
                                    </div>
                                  </div>
                                </HoverCardContent>
                              </HoverCard>
                              );
                            } catch (error) {
                              console.error('Error rendering reservation:', error, res);
                              return (
                                <div key={res.id} className="text-xs text-red-500 p-1 border border-red-200 rounded">
                                  {t('calendarPage.reservationCard.renderError')}
                                </div>
                              );
                            }
                          })}
                          
                          {dayReservations.length > 5 && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-auto p-1.5 text-sm text-blue-600 hover:text-blue-800 hover:bg-blue-50 font-medium"
                              onClick={(e) => {
                                e.stopPropagation();
                                console.log('More button clicked for day:', safeFormat(day, 'yyyy-MM-dd', 'invalid-date'));
                                openDayDialog(day);
                              }}
                              data-testid={`button-more-${safeFormat(day, 'yyyy-MM-dd', 'invalid-date')}`}
                            >
                              {t('calendarPage.grid.moreButton', { count: dayReservations.length - 5 })}
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
            </div>
          </div>

          {/* Loading State */}
          {(isLoadingVehicles || isLoadingReservations) && (
            <div className="flex justify-center items-center h-64">
              <svg className="animate-spin h-8 w-8 text-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            </div>
          )}
          
          {/* Calendar Legend */}
          <CalendarLegend 
            categories={['reservation-status', 'reservation-type', 'indicators']}
            title={t('calendarPage.legendTitle')}
            compact
          />
        </CardContent>
      </Card>
      {/* View Reservation Dialog */}
      {/* Hidden (not closed) while Pickup/Return is open, so starting one doesn't
          leave this dialog stacked underneath it — it reappears once that closes,
          without going through onOpenChange (which triggers "reopen list view"). */}
      <Dialog open={viewDialogOpen && !pickupDialogOpen && !returnDialogOpen} onOpenChange={(open) => {
          console.log('View dialog open change:', open);
          setViewDialogOpen(open);
          if (!open) {
            setSelectedReservation(null);
            // Reopen list view if we came from there
            if (openedFromListView) {
              setListDialogOpen(true);
              setOpenedFromListView(false);
            }
          }
        }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedReservation?.type === 'replacement' ? t('spareVehicleDialog.title') : t('viewDialog.title')}
              {selectedReservation?.type === 'replacement' && (
                <Badge className="bg-orange-100 text-orange-800 border-orange-200" variant="outline">
                  {t('indexPage.spareBadge')}
                </Badge>
              )}
            </DialogTitle>
            <DialogDescription>
              {selectedReservation ? t('calendarPage.reservationHashCustomer', { id: selectedReservation.id, name: selectedReservation.customer?.name || t('calendarPage.reservationCard.noCustomer') }) : t('calendarPage.viewDetailedInfo')}
            </DialogDescription>
          </DialogHeader>
          {selectedReservation && (
            <div className="space-y-3">
              {/* Status and type badges */}
              <div className="flex gap-2 flex-wrap">
                <Badge 
                  className={`${
                    selectedReservation.status?.toLowerCase() === 'booked' ? 'bg-blue-100 text-blue-800 border-blue-200' : 
                    selectedReservation.status?.toLowerCase() === 'picked_up' ? 'bg-orange-100 text-orange-800 border-orange-200' :
                    selectedReservation.status?.toLowerCase() === 'returned' ? 'bg-purple-100 text-purple-800 border-purple-200' :
                    selectedReservation.status?.toLowerCase() === 'completed' ? 'bg-green-100 text-green-800 border-green-200' :
                    selectedReservation.status?.toLowerCase() === 'cancelled' ? 'bg-red-100 text-red-800 border-red-200' :
                    'bg-gray-100 text-gray-800 border-gray-200'
                  }`}
                  variant="outline"
                >
                  {formatReservationStatus(selectedReservation.status)}
                </Badge>
                {selectedReservation.type === 'replacement' && selectedReservation.replacementForReservationId && (
                  <Badge className="bg-orange-50 text-orange-800 border-orange-200" variant="outline">
                    {(() => {
                      // Find the original vehicle using the lookup map (works even if original reservation is outside calendar range)
                      const originalVehicleId = reservationVehicleLookup.get(selectedReservation.replacementForReservationId);
                      const originalVehicle = originalVehicleId ? vehicles?.find(v => v.id === originalVehicleId) : null;

                      if (originalVehicle) {
                        return t('calendarPage.spareForVehicle', { plate: formatLicensePlate(originalVehicle.licensePlate), brand: originalVehicle.brand, model: originalVehicle.model });
                      }

                      return t('indexPage.spareForHash', { id: selectedReservation.replacementForReservationId });
                    })()}
                  </Badge>
                )}
                {selectedReservation.type === 'replacement' && selectedReservation.replacementForTransportId && (
                  <Badge className="bg-orange-50 text-orange-800 border-orange-200" variant="outline">
                    {t('calendarPage.spareForTransport', { id: selectedReservation.replacementForTransportId })}
                  </Badge>
                )}
              </div>

              {/* Contract Number Display */}
              {selectedReservation.contractNumber && (
                <div className="bg-indigo-50 border border-indigo-200 rounded-md p-2.5">
                  <div className="flex items-center gap-2">
                    <label className="text-[10px] font-medium text-indigo-700 uppercase">{t('editContractNumberDialog.contractNumber')}</label>
                    <span className="text-sm font-semibold text-indigo-900" data-testid="text-contract-number">
                      {selectedReservation.contractNumber}
                    </span>
                    {canManageReservations && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 text-indigo-700 hover:text-indigo-900 hover:bg-indigo-100 ml-auto"
                        onClick={() => setEditContractNumberOpen(true)}
                        title={t('editContractNumberDialog.title')}
                        data-testid="button-edit-contract-number"
                      >
                        <Edit className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </div>
              )}

              {/* Vehicle & Customer in 2 columns */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* Vehicle Details */}
                <div className="bg-gray-50 p-3 rounded-md">
                  <h3 className="text-xs font-medium text-gray-700 mb-2 flex items-center gap-2">
                    <Car className="h-3.5 w-3.5" />
                    {t('viewDialog.vehicleLabel')}
                  </h3>
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      {selectedReservation.placeholderSpare && !selectedReservation.vehicleId ? (
                        <>
                          <span className="bg-orange-100 text-orange-800 px-2 py-0.5 rounded text-xs font-semibold">
                            {t('indexPage.tbdBadge')}
                          </span>
                          <span className="text-sm font-medium text-orange-700">{t('calendarPage.spareVehicleLabel')}</span>
                        </>
                      ) : selectedReservation.vehicle ? (
                        <>
                          <span className="bg-primary-100 text-primary-800 px-2 py-0.5 rounded text-xs font-semibold">
                            {formatLicensePlate(selectedReservation.vehicle.licensePlate || '')}
                          </span>
                          <span className="text-sm font-medium">{selectedReservation.vehicle.brand} {selectedReservation.vehicle.model}</span>
                          {selectedReservation.type === 'replacement' && (
                            <Badge className="bg-green-100 text-green-800 border-green-200 text-[10px]" variant="outline">
                              {t('calendarPage.assignedSpareBadge')}
                            </Badge>
                          )}
                        </>
                      ) : (
                        <span className="text-sm text-gray-500">{t('calendarPage.noVehicleAssigned')}</span>
                      )}
                    </div>
                    <div className="text-xs text-gray-600">
                      {selectedReservation.placeholderSpare && !selectedReservation.vehicleId
                        ? t('spareVehicleAssignmentDialog.awaitingAssignment')
                        : `${selectedReservation.vehicle?.vehicleType || t('viewDialog.unknownType')} • ${selectedReservation.vehicle?.fuel || t('viewDialog.unknownFuel')}`
                      }
                    </div>
                    {/* Show Mileage Information */}
                    {(() => {
                      // For active reservations (picked_up/completed), show reservation mileage
                      // For booked, show vehicle's current mileage
                      const isActive = selectedReservation.status === 'picked_up' || selectedReservation.status === 'returned' || selectedReservation.status === 'completed';
                      const hasReservationMileage = (selectedReservation.pickupMileage !== null && selectedReservation.pickupMileage !== undefined) || 
                                                    (selectedReservation.returnMileage !== null && selectedReservation.returnMileage !== undefined);
                      const vehicleCurrentMileage = selectedReservation.vehicle?.currentMileage;
                      
                      // Show mileage if: active reservation with mileage OR scheduled with vehicle mileage
                      if ((isActive && hasReservationMileage) || (!isActive && vehicleCurrentMileage)) {
                        return (
                          <div className="mt-1.5 pt-1.5 border-t border-gray-200">
                            <div className="grid grid-cols-2 gap-3">
                              {isActive ? (
                                // Show reservation mileage for active reservations
                                (<>
                                  {selectedReservation.pickupMileage !== null && selectedReservation.pickupMileage !== undefined && (
                                    <div>
                                      <div className="text-[10px] text-gray-500 uppercase">{t('form.pickupLabel')}</div>
                                      <div className="text-xs font-semibold text-gray-900">
                                        {selectedReservation.pickupMileage.toLocaleString()} km
                                      </div>
                                    </div>
                                  )}
                                  {selectedReservation.returnMileage !== null && selectedReservation.returnMileage !== undefined && (
                                    <div>
                                      <div className="text-[10px] text-gray-500 uppercase">{t('calendarPage.returnedShortLabel')}</div>
                                      <div className="text-xs font-semibold text-gray-900">
                                        {selectedReservation.returnMileage.toLocaleString()} km
                                      </div>
                                    </div>
                                  )}
                                </>)
                              ) : (
                                // Show vehicle's current mileage for scheduled reservations
                                (vehicleCurrentMileage !== null && vehicleCurrentMileage !== undefined && (<div>
                                  <div className="text-[10px] text-gray-500 uppercase">{t('calendarPage.currentMileageShortLabel')}</div>
                                  <div className="text-xs font-semibold text-gray-900">
                                    {vehicleCurrentMileage.toLocaleString()} km
                                  </div>
                                </div>))
                              )}
                            </div>
                          </div>
                        );
                      }
                      return null;
                    })()}
                  </div>
                </div>

                {/* Customer Details */}
                <div className="bg-gray-50 p-3 rounded-md">
                  <h3 className="text-xs font-medium text-gray-700 mb-2 flex items-center gap-2">
                    <User className="h-3.5 w-3.5" />
                    {t('viewDialog.customerLabel')}
                  </h3>
                  <div className="space-y-1">
                    {selectedReservation.customer ? (
                      <>
                        <div className="text-sm font-medium">{selectedReservation.customer.name}</div>
                        {selectedReservation.customer.email && (
                          <div className="text-xs text-gray-600">{selectedReservation.customer.email}</div>
                        )}
                        {selectedReservation.customer.phone && (
                          <div className="text-xs text-gray-600">{selectedReservation.customer.phone}</div>
                        )}
                      </>
                    ) : (() => {
                      // No linked customer — for an external vehicle's spare
                      // reservation, the owner name/phone captured on the
                      // Transport is the closest equivalent contact info.
                      const ownerInfo = getExternalOwnerInfo(selectedReservation);
                      return ownerInfo ? (
                        <>
                          <div className="text-sm font-medium">{ownerInfo.name || t('calendarPage.noCustomerSpecified')}</div>
                          {ownerInfo.phone && (
                            <div className="text-xs text-gray-600">{ownerInfo.phone}</div>
                          )}
                        </>
                      ) : (
                        <div className="text-sm font-medium">{t('calendarPage.noCustomerSpecified')}</div>
                      );
                    })()}
                  </div>
                </div>
              </div>

              {/* Driver Details */}
              {selectedReservation.driver && (
                <div className="bg-blue-50 p-3 rounded-md border border-blue-200">
                  <h3 className="text-xs font-medium text-blue-900 mb-2 flex items-center gap-2">
                    <User className="h-3.5 w-3.5 text-blue-700" />
                    {t('calendarPage.hoverCard.driverLabel')}
                  </h3>
                  <div className="space-y-1">
                    <div className="text-sm font-medium text-blue-900 flex items-center gap-2">
                      {selectedReservation.driver.displayName}
                      {selectedReservation.driver.isPrimaryDriver && (
                        <Badge className="bg-blue-100 text-blue-800 border-blue-300 text-[10px] px-1.5 py-0">{t('viewDialog.primaryBadge')}</Badge>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs text-blue-700">
                      {selectedReservation.driver.email && <div>{selectedReservation.driver.email}</div>}
                      {selectedReservation.driver.phone && <div>{selectedReservation.driver.phone}</div>}
                    </div>
                    {(selectedReservation.driver.driverLicenseNumber || selectedReservation.driver.licenseExpiry) && (
                      <div className="grid grid-cols-2 gap-2 mt-1.5 pt-1.5 border-t border-blue-200 text-xs">
                        {selectedReservation.driver.driverLicenseNumber && (
                          <div>
                            <span className="text-blue-600 font-medium">{t('calendarPage.licenseColonLabel')}</span>{' '}
                            <span className="text-blue-900">{selectedReservation.driver.driverLicenseNumber}</span>
                          </div>
                        )}
                        {selectedReservation.driver.licenseExpiry && (
                          <div>
                            <span className="text-blue-600 font-medium">{t('calendarPage.expiresColonLabel')}</span>{' '}
                            <span className="text-blue-900">{selectedReservation.driver.licenseExpiry}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Dates, Duration and Price in compact grid */}
              {selectedReservation.type === 'maintenance_block' ? (
                <div className="bg-gray-50 p-3 rounded-md">
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="text-[10px] font-medium text-gray-500 uppercase">{t('form.startDateLabel')}</label>
                      <p className="text-xs font-medium mt-0.5">{safeParseDateISO(selectedReservation.startDate) ? format(safeParseDateISO(selectedReservation.startDate)!, 'PP') : t('calendarPage.invalidDate')}</p>
                    </div>
                    <div>
                      <label className="text-[10px] font-medium text-gray-500 uppercase">{t('calendarPage.durationLabel')}</label>
                      <p className="text-xs font-medium mt-0.5">
                        {selectedReservation.maintenanceDuration ? t('form.dayCount', { count: selectedReservation.maintenanceDuration }) : t('calendarPage.notSet')}
                      </p>
                    </div>
                    <div>
                      <label className="text-[10px] font-medium text-gray-500 uppercase">{t('common:fields.status')}</label>
                      <div className="mt-0.5">
                        {selectedReservation.maintenanceStatus ? (
                          <Badge
                            variant={selectedReservation.maintenanceStatus === "in" ? "default" : "outline"}
                            className={`text-[10px] px-1.5 py-0 ${
                              selectedReservation.maintenanceStatus === "in" ? "bg-purple-500 text-white" :
                              selectedReservation.maintenanceStatus === "out" ? "bg-green-500 text-white" :
                              selectedReservation.maintenanceStatus === "scheduled" ? "bg-amber-500 text-white" :
                              "bg-gray-500 text-white"
                            }`}
                          >
                            {selectedReservation.maintenanceStatus.toUpperCase()}
                          </Badge>
                        ) : <span className="text-xs">{t('calendarPage.notSet')}</span>}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-gray-50 p-3 rounded-md">
                  <div className="grid grid-cols-4 gap-3">
                    <div>
                      <label className="text-[10px] font-medium text-gray-500 uppercase">{t('form.startDateLabel')}</label>
                      <p className="text-xs font-medium mt-0.5">{safeParseDateISO(selectedReservation.startDate) ? format(safeParseDateISO(selectedReservation.startDate)!, 'PP') : t('calendarPage.invalidDate')}</p>
                    </div>
                    <div>
                      <label className="text-[10px] font-medium text-gray-500 uppercase">{t('common:fields.endDate')}</label>
                      <p className="text-xs font-medium mt-0.5">{selectedReservation.endDate ? (safeParseDateISO(selectedReservation.endDate) ? format(safeParseDateISO(selectedReservation.endDate)!, 'PP') : t('calendarPage.invalidDate')) : t('vehicleReservationsStatusDialog.openEnded')}</p>
                    </div>
                    <div>
                      <label className="text-[10px] font-medium text-gray-500 uppercase">{t('calendarPage.durationLabel')}</label>
                      <p className="text-xs font-medium mt-0.5">
                        {(() => {
                          if (!selectedReservation.startDate || !selectedReservation.endDate) return t('vehicleReservationsStatusDialog.openEnded');
                          const startDate = safeParseDateISO(selectedReservation.startDate);
                          const endDate = safeParseDateISO(selectedReservation.endDate);
                          if (!startDate || !endDate) return t('calendarPage.invalidDate');
                          const duration = differenceInDays(endDate, startDate) + 1;
                          return t('form.dayCount', { count: duration });
                        })()}
                      </p>
                    </div>
                    <div>
                      <label className="text-[10px] font-medium text-gray-500 uppercase">{t('common:fields.price')}</label>
                      <p className="text-xs font-semibold mt-0.5">{selectedReservation.totalPrice ? formatCurrency(Number(selectedReservation.totalPrice)) : t('calendarPage.notSet')}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Notes */}
              {selectedReservation.notes && (
                <div className="bg-amber-50 border border-amber-200 p-2.5 rounded-md">
                  <label className="text-[10px] font-medium text-amber-700 uppercase">{t('common:fields.notes')}</label>
                  <p className="text-xs text-amber-900 mt-1 whitespace-pre-wrap">{selectedReservation.notes}</p>
                </div>
              )}

              {/* Delivery Information */}
              {selectedReservation.deliveryRequired && (
                <div className="bg-green-50 border border-green-200 rounded-md p-2.5">
                  <label className="text-[10px] font-medium text-green-700 uppercase mb-2 block flex items-center gap-1.5">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                    </svg>
                    {t('calendarPage.deliveryServiceHeading')}
                  </label>
                  <div className="space-y-2">
                    {(selectedReservation.deliveryAddress || selectedReservation.deliveryCity || selectedReservation.deliveryPostalCode) && (
                      <div>
                        <p className="text-[10px] text-green-600 font-medium">{t('form.deliveryAddressLabel')}</p>
                        <p className="text-xs font-semibold text-green-900 mt-0.5">
                          {selectedReservation.deliveryAddress}
                          {selectedReservation.deliveryAddress && (selectedReservation.deliveryCity || selectedReservation.deliveryPostalCode) && ', '}
                          {selectedReservation.deliveryPostalCode} {selectedReservation.deliveryCity}
                        </p>
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-2">
                      {selectedReservation.deliveryFee !== null && selectedReservation.deliveryFee !== undefined && (
                        <div>
                          <p className="text-[10px] text-green-600 font-medium">{t('calendarPage.deliveryFeeLabel')}</p>
                          <p className="text-xs font-semibold text-green-900 mt-0.5">{<Price value={Number(selectedReservation.deliveryFee)} />}</p>
                        </div>
                      )}
                    </div>
                    {selectedReservation.deliveryNotes && (
                      <div className="pt-2 border-t border-green-200">
                        <p className="text-[10px] text-green-600 font-medium">{t('calendarPage.specialInstructionsLabel')}</p>
                        <p className="text-xs text-green-900 mt-0.5 whitespace-pre-wrap">{selectedReservation.deliveryNotes}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Fuel Tracking Information */}
              {(selectedReservation.fuelLevelPickup || selectedReservation.fuelLevelReturn || selectedReservation.fuelCost || selectedReservation.fuelCardNumber || selectedReservation.fuelNotes) && (
                <div className="bg-blue-50 border border-blue-200 rounded-md p-2.5">
                  <label className="text-[10px] font-medium text-blue-700 uppercase mb-2 block">{t('viewDialog.fuelTrackingLabel')}</label>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    {selectedReservation.fuelLevelPickup && (
                      <div>
                        <p className="text-[10px] text-blue-600 font-medium">{t('form.pickupLabel')}</p>
                        <p className="text-xs font-semibold text-blue-900 mt-0.5">{selectedReservation.fuelLevelPickup}</p>
                      </div>
                    )}
                    {selectedReservation.fuelLevelReturn && (
                      <div>
                        <p className="text-[10px] text-blue-600 font-medium">{t('form.returnLabel')}</p>
                        <p className="text-xs font-semibold text-blue-900 mt-0.5">{selectedReservation.fuelLevelReturn}</p>
                      </div>
                    )}
                    {selectedReservation.fuelCost && (
                      <div>
                        <p className="text-[10px] text-blue-600 font-medium">{t('viewDialog.fuelCostLabelShort')}</p>
                        <p className="text-xs font-semibold text-blue-900 mt-0.5">{<Price value={Number(selectedReservation.fuelCost)} />}</p>
                      </div>
                    )}
                    {selectedReservation.fuelCardNumber && (
                      <div>
                        <p className="text-[10px] text-blue-600 font-medium">{t('viewDialog.fuelCardNumberLabel')}</p>
                        <p className="text-xs font-semibold text-blue-900 mt-0.5">{selectedReservation.fuelCardNumber}</p>
                      </div>
                    )}
                  </div>
                  {selectedReservation.fuelNotes && (
                    <div className="mt-2 pt-2 border-t border-blue-200">
                      <p className="text-[10px] text-blue-600 font-medium">{t('common:fields.notes')}</p>
                      <p className="text-xs text-blue-900 mt-0.5 whitespace-pre-wrap">{selectedReservation.fuelNotes}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Contract and Documents */}
              {selectedReservation.vehicleId && (
                <div className="bg-gray-50 p-2.5 rounded-md">
                  <label className="text-[10px] font-medium text-gray-700 uppercase block mb-2">{t('viewDialog.documentsLabel')}</label>

                  {/* Quick Upload Buttons */}
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    <span className="text-[10px] text-gray-600 w-full mb-0.5">{t('viewDialog.quickUploadLabel')}</span>
                    {[
                      { type: 'Contract (Signed)', labelKey: 'form.docTypes.contractSigned', accept: '.pdf' },
                      { type: 'Damage Check (Signed)', labelKey: 'calendarPage.quickUploadTypes.damageCheckSigned', accept: '.pdf' },
                      { type: 'Damage Report Photo', labelKey: 'form.docTypes.damageReportPhoto', accept: '.jpg,.jpeg,.png' },
                      { type: 'Fuel Receipt', labelKey: 'calendarPage.quickUploadTypes.fuelReceipt', accept: 'image/*,.pdf' },
                      { type: 'Other', labelKey: 'form.docTypes.other', accept: '.pdf,.jpg,.jpeg,.png,.doc,.docx' }
                    ].map(({ type, labelKey, accept }) => (
                      <Button
                        key={type}
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const input = document.createElement('input');
                          input.type = 'file';
                          input.accept = accept;
                          input.onchange = async (e) => {
                            const file = (e.target as HTMLInputElement).files?.[0];
                            if (!file) return;

                            setUploadingDoc(true);
                            const formData = new FormData();
                            // Important: append fields BEFORE the file for multer to parse correctly
                            formData.append('vehicleId', selectedReservation.vehicleId!.toString());
                            formData.append('reservationId', selectedReservation.id.toString());
                            formData.append('documentType', type);
                            formData.append('file', file);

                            try {
                              const response = await fetch('/api/documents', {
                                method: 'POST',
                                body: formData,
                                credentials: 'include',
                              });
                              
                              if (!response.ok) {
                                throw new Error('Upload failed');
                              }
                              
                              invalidateByPrefix(`/api/documents/reservation/${selectedReservation.id}`);
                              toast({
                                title: t('common:status.success'),
                                description: t('calendarPage.documentUploadedDescription', { type: t(labelKey) }),
                              });
                            } catch (error) {
                              console.error('Upload failed:', error);
                              toast({
                                title: t('common:status.error'),
                                description: t('calendarPage.documentUploadFailedDescription'),
                                variant: "destructive",
                              });
                            } finally {
                              setUploadingDoc(false);
                            }
                          };
                          input.click();
                        }}
                        disabled={uploadingDoc}
                        className="text-[10px] h-7"
                      >
                        + {t(labelKey)}
                      </Button>
                    ))}
                  </div>

                  {/* Uploaded Documents */}
                  {reservationDocuments && reservationDocuments.length > 0 && (
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[10px] font-semibold text-gray-700">{t('calendarPage.uploadedColonLabel')}</span>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setEmailDialogOpen(true)}
                          className="h-6 text-[10px] gap-1"
                          data-testid="button-email-documents"
                        >
                          <Mail className="h-3 w-3" />
                          {t('calendarPage.emailToCustomerButton')}
                        </Button>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {/* Group documents by type */}
                        {(() => {
                          const contractDocs = reservationDocuments.filter(d => 
                            d.documentType?.startsWith('Contract (Unsigned)') || 
                            d.documentType?.startsWith('Contract (Signed)') || 
                            d.documentType === 'Contract'
                          );
                          const damageCheckDocs = reservationDocuments.filter(d => 
                            d.documentType?.startsWith('Damage Check')
                          );
                          const damageReportDocs = reservationDocuments.filter(d => 
                            d.documentType === 'Damage Report Photo' || d.documentType === 'Damage Report PDF'
                          );
                          const fuelReceiptDocs = reservationDocuments.filter(d => 
                            d.documentType === 'Fuel Receipt'
                          );
                          const otherDocs = reservationDocuments.filter(d => 
                            !d.documentType?.startsWith('Contract (Unsigned)') && 
                            !d.documentType?.startsWith('Contract (Signed)') && 
                            d.documentType !== 'Contract' && 
                            !d.documentType?.startsWith('Damage Check') &&
                            d.documentType !== 'Damage Report Photo' && 
                            d.documentType !== 'Damage Report PDF' &&
                            d.documentType !== 'Fuel Receipt' &&
                            d.documentType !== 'Other'
                          );
                          
                          return [...contractDocs, ...damageCheckDocs, ...damageReportDocs, ...fuelReceiptDocs, ...otherDocs];
                        })().map((doc) => {
                      const getFileIcon = (contentType: string | null, fileName: string) => {
                        const ext = fileName.split('.').pop()?.toLowerCase();
                        if (contentType?.includes('pdf') || ext === 'pdf') {
                          return (
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-red-600">
                              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                              <polyline points="14 2 14 8 20 8"></polyline>
                            </svg>
                          );
                        } else if (contentType?.includes('image') || ['jpg', 'jpeg', 'png', 'gif'].includes(ext || '')) {
                          return (
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-600">
                              <rect width="18" height="18" x="3" y="3" rx="2" ry="2"/>
                              <circle cx="9" cy="9" r="2"/>
                              <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>
                            </svg>
                          );
                        } else if (contentType?.includes('word') || ['doc', 'docx'].includes(ext || '')) {
                          return (
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-700">
                              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                              <polyline points="14 2 14 8 20 8"></polyline>
                            </svg>
                          );
                        } else {
                          return (
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-600">
                              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                              <polyline points="14 2 14 8 20 8"></polyline>
                            </svg>
                          );
                        }
                      };

                      return (
                        <div key={doc.id} className="relative group">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setPreviewDocument(doc);
                              setPreviewDialogOpen(true);
                            }}
                            className="flex items-center gap-2 pr-8"
                            title={`${doc.documentType || 'Document'}${doc.uploadDate ? ` | Uploaded: ${format(new Date(doc.uploadDate), 'PPp')}` : ''}`}
                          >
                            {getFileIcon(doc.contentType, doc.fileName)}
                            <div className="text-left">
                              <div className="text-xs font-semibold truncate max-w-[150px]">{doc.documentType}</div>
                              <div className="text-[10px] text-gray-500 truncate max-w-[150px]">
                                {doc.documentType?.startsWith('Damage Check')
                                  ? doc.fileName.replace('.pdf', '').replace('.PDF', '')
                                  : doc.fileName.split('.').pop()?.toUpperCase() || 'FILE'
                                }
                              </div>
                            </div>
                          </Button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setDocumentToDelete(doc);
                              setDeleteDocDialogOpen(true);
                            }}
                            className="absolute top-1 right-1 p-1 rounded-full bg-red-500 text-white opacity-0 group-hover:opacity-100 hover:bg-red-600 transition-opacity"
                            title={t('viewDialog.deleteDocumentTooltip')}
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <line x1="18" y1="6" x2="6" y2="18"></line>
                              <line x1="6" y1="6" x2="18" y2="18"></line>
                            </svg>
                          </button>
                        </div>
                      );
                    })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Damage Checks Section */}
              {selectedReservation?.vehicleId && (
                <div className="bg-purple-50 border border-purple-200 rounded-md p-2.5 text-[20px]">
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-[10px] font-medium text-purple-700 uppercase flex items-center gap-1.5">
                      <ClipboardCheck className="h-3.5 w-3.5" />
                      {t('calendarPage.damageChecksLabel')}
                    </label>
                    <div className="flex gap-2">
                      {/* Show Create Return Check button if there's a pickup check */}
                      {reservationDamageChecks && reservationDamageChecks.some(c => c.checkType === 'pickup') && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            const pickupCheck = reservationDamageChecks.find(c => c.checkType === 'pickup');
                            if (pickupCheck) {
                              handleOpenDamageCheckDialog(null, pickupCheck.id);
                            }
                          }}
                          className="h-7 text-xs bg-green-50 hover:bg-green-100 border-green-300 text-green-700"
                          data-testid="button-create-return-check"
                        >
                          {t('calendarPage.createReturnCheckButton')}
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleOpenDamageCheckDialog(null, null)}
                        className="h-7 text-xs"
                        data-testid="button-create-damage-check"
                      >
                        {t('calendarPage.createDamageCheckButton')}
                      </Button>
                    </div>
                  </div>

                  {/* Reservation's Damage Checks */}
                  {reservationDamageChecks && reservationDamageChecks.length > 0 && (
                    <div className="mb-3">
                      <span className="text-[10px] font-semibold text-purple-700 block mb-1.5">{t('form.thisReservationLabel')}</span>
                      <div className="space-y-1.5">
                        {reservationDamageChecks.map((check) => (
                          <div key={check.id} className="flex items-center justify-between bg-white p-2 rounded border border-purple-200">
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-purple-100 text-purple-800 border-purple-300">
                                {check.checkType === 'pickup' ? t('form.pickupLabel') : t('form.returnLabel')}
                              </Badge>
                              <span className="text-xs text-purple-900">
                                {check.createdAt ? format(new Date(check.createdAt), 'PP') : t('calendarPage.noDate')}
                              </span>
                              {check.mileage && (
                                <span className="text-xs text-purple-600">• {Number(check.mileage).toLocaleString()} km</span>
                              )}
                            </div>
                            <div className="flex gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleOpenDamageCheckDialog(check.id)}
                                className="h-6 px-2 text-xs"
                                data-testid={`button-edit-damage-check-${check.id}`}
                              >
                                {t('common:actions.edit')}
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => { setPdfPreviewUrl(`/api/interactive-damage-checks/${check.id}/pdf`); setPdfPreviewOpen(true); }}
                                className="h-6 px-2 text-xs"
                                data-testid={`button-view-damage-check-pdf-${check.id}`}
                              >
                                {t('detailsPage.viewPdfButton')}
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDeleteDamageCheck(check.id)}
                                className="h-6 px-2 text-xs text-red-600 hover:text-red-700 hover:bg-red-50"
                                data-testid={`button-delete-damage-check-${check.id}`}
                              >
                                {t('common:actions.delete')}
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Recent History */}
                  {recentDamageChecks && recentDamageChecks.length > 0 && (
                    <div className="text-[20px]">
                      <span className="text-[10px] font-semibold text-purple-700 block mb-1.5">{t('form.recentHistoryLabel')}</span>
                      <div className="space-y-1.5">
                        {recentDamageChecks.slice(0, 3).map((check) => (
                          <div key={check.id} className="flex items-center justify-between bg-purple-100/50 p-2 rounded border border-purple-200">
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-purple-200 text-purple-900 border-purple-300">
                                {check.checkType === 'pickup' ? t('form.pickupLabel') : t('form.returnLabel')}
                              </Badge>
                              <span className="text-xs text-purple-900">
                                {check.createdAt ? format(new Date(check.createdAt), 'PP') : t('calendarPage.noDate')}
                              </span>
                              {check.mileage && (
                                <span className="text-xs text-purple-600">• {Number(check.mileage).toLocaleString()} km</span>
                              )}
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => { setPdfPreviewUrl(`/api/interactive-damage-checks/${check.id}/pdf`); setPdfPreviewOpen(true); }}
                              className="h-6 px-2 text-xs"
                              data-testid={`button-view-history-damage-check-pdf-${check.id}`}
                            >
                              {t('detailsPage.viewPdfButton')}
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Empty State */}
                  {(!reservationDamageChecks || reservationDamageChecks.length === 0) &&
                   (!recentDamageChecks || recentDamageChecks.length === 0) && (
                    <div className="text-center py-3 text-xs text-purple-600">
                      {t('form.noDamageChecksYetHint')}
                    </div>
                  )}
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-3 pt-4 border-t">
                {selectedReservation.status === 'booked' && (
                  <Button 
                    className="flex-1"
                    onClick={() => {
                      setPickupDialogOpen(true);
                    }}
                    data-testid="button-start-pickup-calendar"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2">
                      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                      <circle cx="12" cy="10" r="3"></circle>
                    </svg>
                    {t('viewDialog.startPickupButton')}
                  </Button>
                )}

                {selectedReservation.status === 'picked_up' && (
                  <Button
                    className="flex-1"
                    onClick={() => {
                      setReturnDialogOpen(true);
                    }}
                    data-testid="button-start-return-calendar"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2">
                      <path d="M3 9h18v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9Z"></path>
                      <path d="m3 9 2.45-4.9A2 2 0 0 1 7.24 3h9.52a2 2 0 0 1 1.8 1.1L21 9"></path>
                      <path d="M12 3v6"></path>
                    </svg>
                    {t('viewDialog.startReturnButton')}
                  </Button>
                )}

                <Button
                  className="flex-1"
                  onClick={() => {
                    handleEditReservation(selectedReservation);
                  }}
                  data-testid="button-edit-reservation-dialog"
                >
                  <Edit className="mr-2 h-4 w-4" />
                  {t('common:actions.edit')}
                </Button>
                {selectedReservation.status === 'picked_up' && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      handleStatusChange(selectedReservation);
                    }}
                    data-testid="button-change-status-dialog"
                    title={t('quickStatusButton.revertToBooked')}
                  >
                    <RotateCcw className="mr-2 h-4 w-4" />
                    {t('calendarPage.hoverCard.revertButton')}
                  </Button>
                )}
                {selectedReservation.status === 'picked_up' && (
                  <Button
                    variant="outline"
                    onClick={() => setIsServiceDialogOpen(true)}
                    data-testid="button-send-to-service"
                  >
                    <Wrench className="mr-2 h-4 w-4" />
                    {t('calendarPage.serviceButton')}
                  </Button>
                )}
                <Button 
                  variant="destructive"
                  onClick={() => {
                    setViewDialogOpen(false);
                    setSelectedReservation(null);
                    // Return to list if opened from there
                    if (openedFromListView) {
                      setListDialogOpen(true);
                      setOpenedFromListView(false);
                    }
                    handleDeleteReservation(selectedReservation);
                  }}
                  data-testid="button-delete-reservation-dialog"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                </Button>
                <Button 
                  variant="outline"
                  onClick={() => {
                    setViewDialogOpen(false);
                    setSelectedReservation(null);
                    // Return to list if opened from there
                    if (openedFromListView) {
                      setListDialogOpen(true);
                      setOpenedFromListView(false);
                    }
                  }}
                  data-testid="button-close-view-dialog"
                >
                  {t('common:actions.close')}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Service-related dialogs */}
      {selectedReservation && (
        <>
          <ScheduleMaintenanceDialog
            open={isServiceDialogOpen}
            onOpenChange={setIsServiceDialogOpen}
            initialVehicleId={selectedReservation.vehicleId || undefined}
            initialDate={new Date().toISOString().split('T')[0]}
            onSuccess={() => {
              invalidateRelatedQueries('reservations');
              invalidateRelatedQueries('vehicles', { id: selectedReservation?.vehicleId });
              refetchCalendarData();
              setIsServiceDialogOpen(false);
            }}
          />
          <SpareVehicleDialog
            open={isSpareDialogOpen}
            onOpenChange={setIsSpareDialogOpen}
            originalReservation={selectedReservation}
            onSuccess={() => {
              invalidateRelatedQueries('reservations');
              refetchCalendarData();
              setIsSpareDialogOpen(false);
            }}
          />
          <ReturnFromServiceDialog
            open={isReturnFromServiceDialogOpen}
            onOpenChange={setIsReturnFromServiceDialogOpen}
            originalReservation={selectedReservation}
            onSuccess={() => {
              invalidateRelatedQueries('reservations');
              refetchCalendarData();
              setIsReturnFromServiceDialogOpen(false);
            }}
          />
        </>
      )}
      
      {/* Interactive Damage Check Dialog */}
      {damageCheckDialogOpen && selectedReservation?.vehicleId && (
        <Dialog open={damageCheckDialogOpen} onOpenChange={(open) => {
          if (!open) handleCloseDamageCheckDialog();
        }}>
          <DialogContent className="max-w-[95vw] max-h-[95vh] overflow-y-auto p-0">
            <DialogHeader className="sr-only">
              <DialogTitle>{compareWithCheckId ? t('calendarPage.createReturnCheckTitle') : t('pickupReturn.common.damageCheck')}</DialogTitle>
              <DialogDescription>
                {compareWithCheckId ? t('calendarPage.compareWithPickupDescription') : t('calendarPage.interactiveDamageCheckEditor')}
              </DialogDescription>
            </DialogHeader>
            <InteractiveDamageCheckPage
              onClose={handleCloseDamageCheckDialog}
              editingCheckId={editingDamageCheckId}
              initialVehicleId={selectedReservation.vehicleId}
              initialReservationId={selectedReservation.id}
              compareWithCheckId={compareWithCheckId}
            />
          </DialogContent>
        </Dialog>
      )}
      {/* Edit Reservation Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={(open) => {
          console.log('Edit dialog open change:', open);
          setEditDialogOpen(open);
          if (!open) {
            setSelectedReservation(null);
            // Reopen list view if we came from there (and not going to view dialog)
            if (openedFromListView) {
              setListDialogOpen(true);
              setOpenedFromListView(false);
            }
          }
        }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('editDialog.title')}</DialogTitle>
            <DialogDescription>
              {t('calendarPage.editReservationDescription')}
            </DialogDescription>
          </DialogHeader>
          {selectedReservation && (
            <ReservationForm 
              editMode={true} 
              initialData={selectedReservation}
              onSuccess={async () => {
                setEditDialogOpen(false);
                invalidateRelatedQueries('reservations');
                queryClient.refetchQueries({ queryKey: ["/api/reservations/range"] });
                
                // Fetch fresh reservation data and reopen view dialog
                try {
                  const response = await fetch(`/api/reservations/${selectedReservation.id}`, {
                    credentials: 'include',
                  });
                  
                  if (response.ok) {
                    const updatedReservation = await response.json();
                    setSelectedReservation(updatedReservation);
                    // Keep openedFromListView true so view dialog can return to list when closed
                    setViewDialogOpen(true);
                  }
                } catch (error) {
                  console.error('Error fetching updated reservation:', error);
                  // If fetch fails, still reopen list view if we came from there
                  if (openedFromListView) {
                    setListDialogOpen(true);
                    setOpenedFromListView(false);
                  }
                }
              }}
              onCancel={() => {
                // Close the edit dialog and reopen view dialog
                setEditDialogOpen(false);
                // Keep openedFromListView true so view dialog can return to list when closed
                setViewDialogOpen(true);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
      {/* Status Change Dialog */}
      {selectedReservation && (() => {
        return (
          <StatusChangeDialog
            open={statusDialogOpen}
            onOpenChange={setStatusDialogOpen}
            reservationId={selectedReservation.id}
            initialStatus={selectedReservation.status || "booked"}
            startDate={selectedReservation.startDate}
            vehicle={selectedReservation.vehicle ? {
              ...selectedReservation.vehicle,
              currentMileage: selectedReservation.vehicle.currentMileage ?? undefined,
              departureMileage: selectedReservation.vehicle.departureMileage ?? undefined,
              returnMileage: selectedReservation.vehicle.returnMileage ?? undefined
            } : undefined}
            customer={selectedReservation.customer ? {
              ...selectedReservation.customer,
              firstName: selectedReservation.customer.firstName ?? undefined,
              lastName: selectedReservation.customer.lastName ?? undefined,
              companyName: selectedReservation.customer.companyName ?? undefined,
              phone: selectedReservation.customer.phone ?? undefined,
              email: selectedReservation.customer.email ?? undefined
            } : undefined}
            initialFuelData={{
              fuelLevelPickup: selectedReservation.fuelLevelPickup,
              fuelLevelReturn: selectedReservation.fuelLevelReturn,
              fuelCost: selectedReservation.fuelCost ? Number(selectedReservation.fuelCost) : null,
              fuelCardNumber: selectedReservation.fuelCardNumber,
              fuelNotes: selectedReservation.fuelNotes,
            }}
            pickupMileage={selectedReservation.pickupMileage ?? null}
            returnMileage={selectedReservation.returnMileage ?? null}
            onStatusChanged={async () => {
              console.log('🔄 onStatusChanged callback started');
              
              // Always fetch fresh reservation data and reopen view dialog
              if (selectedReservation) {
                try {
                  console.log('📡 Fetching updated reservation data for ID:', selectedReservation.id);
                  
                  // Fetch the updated reservation directly from the API
                  const response = await fetch(`/api/reservations/${selectedReservation.id}`, {
                    credentials: 'include',
                  });
                  
                  if (response.ok) {
                    const updatedReservation = await response.json();
                    console.log('✅ Fetched updated reservation:', updatedReservation.status);
                    setSelectedReservation(updatedReservation);
                    
                    console.log('🔄 Reopening view dialog');
                    // Reopen the view dialog to show updated reservation
                    setViewDialogOpen(true);
                    console.log('✅ View dialog should be open now');
                  } else {
                    console.error('❌ Failed to fetch reservation:', response.status);
                  }
                } catch (error) {
                  console.error('❌ Error fetching updated reservation:', error);
                }
              } else {
                console.warn('⚠️ No selectedReservation available');
              }
              
              console.log('🔄 Refetching calendar data');
              invalidateRelatedQueries('reservations');
              refetchCalendarData();
              console.log('✅ onStatusChanged callback completed');
            }}
          />
        );
      })()}

      {/* Edit Contract Number Dialog */}
      {selectedReservation && canManageReservations && (
        <EditContractNumberDialog
          open={editContractNumberOpen}
          onOpenChange={setEditContractNumberOpen}
          reservationId={selectedReservation.id}
          currentContractNumber={selectedReservation.contractNumber}
          onSaved={(newContractNumber) => {
            // Update locally so the view dialog reflects the change immediately,
            // without waiting for the (slow) /api/reservations refetch.
            setSelectedReservation((prev) =>
              prev ? { ...prev, contractNumber: newContractNumber } : prev,
            );
            queryClient.invalidateQueries({ queryKey: ['/api/reservations'] });
          }}
        />
      )}

      {/* Day Reservations Dialog */}
      <Dialog open={dayDialogOpen} onOpenChange={(open) => {
          console.log('Day dialog open change:', open);
          if (!open) {
            closeDayDialog();
          }
        }}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {t('calendarPage.dayDialog.title', { date: selectedDay ? format(selectedDay, 'EEEE, MMMM d, yyyy') : '' })}
            </DialogTitle>
            <DialogDescription>
              {selectedDay ?
                t('calendarPage.dayDialog.descriptionCount', { count: getReservationsForDate(selectedDay).length }) :
                t('calendarPage.dayDialog.descriptionFallback')
              }
            </DialogDescription>
          </DialogHeader>
          {selectedDay && (
            <div className="space-y-3" data-testid="dialog-day-reservations">
              {getReservationsForDate(selectedDay).map((reservation) => {
                const startDate = safeParseDateISO(reservation.startDate);
                const endDate = safeParseDateISO(reservation.endDate);
                const vehicle = vehicles?.find((v: Vehicle) => v.id === reservation.vehicleId);
                const customer = reservation.customer;
                
                return (
                  <div 
                    key={reservation.id} 
                    className="border rounded-lg p-4 space-y-3 bg-white hover:bg-gray-50"
                    data-testid={`list-row-${reservation.id}`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <div className="font-medium flex items-center gap-2">
                          <span className={`px-1.5 py-0.5 rounded text-xs font-semibold mr-1 ${reservation.placeholderSpare ? 'bg-orange-100 text-orange-800' : 'bg-primary-100 text-primary-800'}`}>
                            {reservation.placeholderSpare ? t('indexPage.tbdBadge') : formatLicensePlate(vehicle?.licensePlate || '')}
                          </span>
                          {reservation.type === 'replacement' && (
                            <span className="inline-block bg-orange-300 text-orange-900 text-[10px] px-1.5 py-0.5 rounded font-bold border border-orange-400">
                              🚗 {t('indexPage.spareBadge')}
                            </span>
                          )}
                        </div>
                        {vehicle && (
                          <div className="text-sm text-gray-600">
                            {vehicle.brand} {vehicle.model}
                          </div>
                        )}
                        <Badge
                          className={`text-xs ${
                            reservation.type === 'replacement' 
                              ? (reservation.status?.toLowerCase() === 'booked' ? 'bg-orange-50 text-orange-700 border-orange-200' : 
                                 reservation.status?.toLowerCase() === 'picked_up' ? 'bg-orange-100 text-orange-800 border-orange-200' :
                                 reservation.status?.toLowerCase() === 'returned' ? 'bg-orange-150 text-orange-850 border-orange-250' :
                                 reservation.status?.toLowerCase() === 'completed' ? 'bg-orange-200 text-orange-900 border-orange-300' :
                                 reservation.status?.toLowerCase() === 'cancelled' ? 'bg-orange-50 text-orange-400 border-orange-200' :
                                 'bg-orange-50 text-orange-600 border-orange-200')
                              : (reservation.status?.toLowerCase() === 'booked' ? 'bg-blue-100 text-blue-800' : 
                                 reservation.status?.toLowerCase() === 'picked_up' ? 'bg-orange-100 text-orange-800' :
                                 reservation.status?.toLowerCase() === 'returned' ? 'bg-purple-100 text-purple-800' :
                                 reservation.status?.toLowerCase() === 'completed' ? 'bg-green-100 text-green-800' :
                                 reservation.status?.toLowerCase() === 'cancelled' ? 'bg-red-100 text-red-800' :
                                 'bg-gray-100 text-gray-800')
                          }`}
                          variant="outline"
                        >
                          {formatReservationStatus(reservation.status)}
                        </Badge>
                      </div>
                      <div className="flex space-x-2">
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => {
                            handleViewReservation(reservation);
                            closeDayDialog();
                          }}
                          data-testid={`button-view-${reservation.id}`}
                        >
                          <Eye className="mr-1 h-3 w-3" />
                          {t('common:actions.view')}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            handleEditReservation(reservation);
                            closeDayDialog();
                          }}
                          data-testid={`button-edit-${reservation.id}`}
                        >
                          <Edit className="mr-1 h-3 w-3" />
                          {t('common:actions.edit')}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleDeleteReservation(reservation)}
                          data-testid={`button-delete-${reservation.id}`}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="mr-1 h-3 w-3" />
                          {t('common:actions.delete')}
                        </Button>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-4 text-sm text-gray-600">
                      {/* A spare reservation is never priced, and often has no
                          customer of its own (only when it's covering someone's
                          active rental) — showing "Not set"/"Not specified" for
                          fields that plainly don't apply to it is just noise.
                          For an external vehicle's spare, fall back to the
                          owner name/phone captured on the Transport instead. */}
                      {(() => {
                        if (reservation.type !== 'replacement') {
                          return (
                            <div>
                              <span className="font-medium">{t('calendarPage.dayDialog.customerColonLabel')}</span> {customer?.name || t('calendarPage.dayDialog.notSpecified')}
                            </div>
                          );
                        }
                        if (customer) {
                          return (
                            <div>
                              <span className="font-medium">{t('calendarPage.dayDialog.customerColonLabel')}</span> {customer.name}
                            </div>
                          );
                        }
                        const ownerInfo = getExternalOwnerInfo(reservation);
                        return ownerInfo ? (
                          <div>
                            <span className="font-medium">{t('calendarPage.dayDialog.customerColonLabel')}</span> {[ownerInfo.name, ownerInfo.phone].filter(Boolean).join(' — ')}
                          </div>
                        ) : null;
                      })()}
                      <div>
                        <span className="font-medium">{t('calendarPage.dayDialog.periodColonLabel')}</span> {startDate ? format(startDate, 'MMM d') : t('calendarPage.invalidDate')} → {endDate ? format(endDate, 'MMM d') : t('calendarPage.dayDialog.openShort')}
                      </div>
                      {reservation.type !== 'replacement' && (
                        <div>
                          <span className="font-medium">{t('calendarPage.dayDialog.priceColonLabel')}</span> {reservation.totalPrice ? formatCurrency(Number(reservation.totalPrice)) : t('calendarPage.notSet')}
                        </div>
                      )}
                    </div>
                    {reservation.notes && (
                      <div className="text-sm text-gray-600 bg-gray-50 p-2 rounded">
                        <span className="font-medium">{t('calendarPage.dayDialog.notesColonLabel')}</span> {reservation.notes}
                      </div>
                    )}
                  </div>
                );
              })}
              {getReservationsForDate(selectedDay).length === 0 && (
                <div className="text-center text-gray-500 py-8">
                  {t('calendarPage.dayDialog.noReservationsForDay')}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
      {/* New Reservation Dialog */}
      <Dialog 
        open={addDialogOpen} 
        onOpenChange={setAddDialogOpen}
      >
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('addDialog.newReservation')}</DialogTitle>
            <DialogDescription>
              {t('calendarPage.newReservationForDate', { date: selectedDate ? format(parseISO(selectedDate), 'MMMM d, yyyy') : t('calendarPage.selectedDateFallback') })}
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4">
            <ReservationForm 
              initialStartDate={selectedDate || undefined}
              onCancel={() => {
                // Close dialog on cancel
                setAddDialogOpen(false);
                setSelectedDate(null);
              }}
              onSuccess={(reservation) => {
                invalidateRelatedQueries('reservations');
                queryClient.refetchQueries({ queryKey: ["/api/reservations/range"] });
              }}
            />
          </div>
        </DialogContent>
      </Dialog>
      {/* Reservation List Dialog */}
      <ReservationListDialog
        open={listDialogOpen}
        onOpenChange={setListDialogOpen}
        onViewReservation={(reservation) => {
          setSelectedReservation(reservation);
          setOpenedFromListView(true);
          setListDialogOpen(false);
          setViewDialogOpen(true);
        }}
        onEditReservation={(reservation) => {
          setSelectedReservation(reservation);
          setOpenedFromListView(true);
          setListDialogOpen(false);
          setEditDialogOpen(true);
        }}
      />
      {/* Color Coding Dialog */}
      <ColorCodingDialog
        open={colorDialogOpen}
        onOpenChange={setColorDialogOpen}
      />
      {/* Document Preview Dialog */}
      <Dialog open={previewDialogOpen} onOpenChange={setPreviewDialogOpen}>
        <DialogContent className="max-w-5xl w-[90vw] h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>{previewDocument?.documentType || t('form.documentPreviewTitleFallback')}</DialogTitle>
            <DialogDescription>
              {previewDocument?.fileName}
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-auto bg-gray-100 rounded-md p-4">
            {previewDocument && (() => {
              const ext = previewDocument.fileName.split('.').pop()?.toLowerCase();
              const isImage = previewDocument.contentType?.includes('image') || ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext || '');
              const isPdf = previewDocument.contentType?.includes('pdf') || ext === 'pdf';

              if (isImage) {
                return (
                  <div className="flex items-center justify-center h-full">
                    <img
                      src={`/api/documents/view/${previewDocument.id}`}
                      alt={previewDocument.fileName}
                      className="max-w-full max-h-[70vh] object-contain rounded shadow-lg"
                    />
                  </div>
                );
              } else if (isPdf) {
                return (
                  <iframe
                    src={`/api/documents/view/${previewDocument.id}`}
                    className="w-full h-full border-0 rounded bg-white"
                    title={previewDocument.fileName}
                  />
                );
              } else {
                return (
                  <div className="flex flex-col items-center justify-center h-full space-y-4">
                    <p className="text-gray-600">{t('form.documentPreview.previewNotAvailable')}</p>
                    <Button onClick={() => window.open(`/api/documents/view/${previewDocument.id}`, '_blank')}>
                      {t('form.documentPreview.openFileButton')}
                    </Button>
                  </div>
                );
              }
            })()}
          </div>
          <div className="flex justify-between items-center pt-4 border-t">
            <Button variant="outline" onClick={() => window.open(`/api/documents/view/${previewDocument?.id}`, '_blank')}>
              {t('form.documentPreview.openInNewTabButton')}
            </Button>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  if (!previewDocument) return;
                  const printWindow = window.open(`/api/documents/view/${previewDocument.id}`, '_blank');
                  if (printWindow) {
                    printWindow.addEventListener('load', () => {
                      setTimeout(() => printWindow.print(), 500);
                    });
                  } else {
                    toast({
                      title: t('calendarPage.popupBlockedTitle'),
                      description: t('calendarPage.popupBlockedDescription'),
                      variant: "destructive",
                    });
                  }
                }}
              >
                <Printer className="h-4 w-4 mr-2" />
                {t('common:actions.print')}
              </Button>
              <Button onClick={() => setPreviewDialogOpen(false)}>
                {t('common:actions.close')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      {/* Email Document Dialog */}
      {selectedReservation && (
        <EmailDocumentDialog
          open={emailDialogOpen}
          onOpenChange={setEmailDialogOpen}
          documents={reservationDocuments || []}
          customer={selectedReservation.customer}
          vehicle={vehicles?.find(v => v.id === selectedReservation.vehicleId)}
          reservation={selectedReservation}
        />
      )}
      {/* Completed Rentals Dialog */}
      <Dialog open={completedRentalsDialogOpen} onOpenChange={setCompletedRentalsDialogOpen}>
        <DialogContent className="max-w-7xl max-h-[85vh]">
          <DialogHeader>
            <DialogTitle>{t('calendarPage.completedRentals.title')}</DialogTitle>
            <DialogDescription>
              {t('calendarPage.completedRentals.description')}
            </DialogDescription>
          </DialogHeader>

          {/* Search and Filter Controls */}
          <div className="flex gap-3 items-end mb-2">
            <div className="flex-1">
              <label className="text-sm font-medium mb-1.5 block">{t('common:actions.search')}</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder={t('calendarPage.completedRentals.searchPlaceholder')}
                  value={completedRentalsSearch}
                  onChange={(e) => setCompletedRentalsSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
            <div className="w-48">
              <label className="text-sm font-medium mb-1.5 block">{t('calendarPage.completedRentals.timePeriodLabel')}</label>
              <Select value={completedRentalsDateFilter} onValueChange={(value: any) => setCompletedRentalsDateFilter(value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('calendarPage.timePeriodOptions.allTime')}</SelectItem>
                  <SelectItem value="7days">{t('calendarPage.timePeriodOptions.last7Days')}</SelectItem>
                  <SelectItem value="30days">{t('calendarPage.timePeriodOptions.last30Days')}</SelectItem>
                  <SelectItem value="90days">{t('calendarPage.timePeriodOptions.last90Days')}</SelectItem>
                  <SelectItem value="year">{t('calendarPage.timePeriodOptions.lastYear')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <ScrollArea className="max-h-[55vh]">
            {(() => {
              // Apply filters and search
              const now = new Date();
              const filtered = completedRentals.filter((rental) => {
                const vehicle = vehicles?.find(v => v.id === rental.vehicleId);
                const customerName = rental.customer?.name || '';
                const vehicleInfo = vehicle ? `${vehicle.brand} ${vehicle.model} ${formatLicensePlate(vehicle.licensePlate)}` : '';
                
                // Search filter
                const searchLower = completedRentalsSearch.toLowerCase();
                const matchesSearch = !completedRentalsSearch || 
                  vehicleInfo.toLowerCase().includes(searchLower) ||
                  customerName.toLowerCase().includes(searchLower);
                
                // Date filter
                const rentalDate = new Date(rental.startDate);
                let matchesDate = true;
                if (completedRentalsDateFilter === '7days') {
                  matchesDate = (now.getTime() - rentalDate.getTime()) <= 7 * 24 * 60 * 60 * 1000;
                } else if (completedRentalsDateFilter === '30days') {
                  matchesDate = (now.getTime() - rentalDate.getTime()) <= 30 * 24 * 60 * 60 * 1000;
                } else if (completedRentalsDateFilter === '90days') {
                  matchesDate = (now.getTime() - rentalDate.getTime()) <= 90 * 24 * 60 * 60 * 1000;
                } else if (completedRentalsDateFilter === 'year') {
                  matchesDate = (now.getTime() - rentalDate.getTime()) <= 365 * 24 * 60 * 60 * 1000;
                }
                
                return matchesSearch && matchesDate;
              });
              
              if (filtered.length === 0) {
                return (
                  <div className="text-center py-8 text-gray-500">
                    <p>{t('listDialog.noCompletedReservations')}</p>
                    {(completedRentalsSearch || completedRentalsDateFilter !== 'all') && (
                      <p className="text-sm mt-1">{t('calendarPage.completedRentals.tryAdjustingFilters')}</p>
                    )}
                  </div>
                );
              }
              
              return (
                <div className="space-y-3">
                  {filtered
                    .sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime())
                    .map((rental) => {
                    const vehicle = vehicles?.find(v => v.id === rental.vehicleId);
                    const customerName = rental.customer?.name || t('spareVehicleAssignmentDialog.unknownCustomer');

                    return (
                      <div key={rental.id} className="border rounded-lg p-4 bg-gray-50">
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <h4 className="font-medium">{vehicle ? `${vehicle.brand} ${vehicle.model} (${formatLicensePlate(vehicle.licensePlate)})` : t('calendarPage.completedRentals.unknownVehicle')}</h4>
                              <Badge variant="outline">
                                {customerName}
                              </Badge>
                            </div>
                            <p className="text-sm text-gray-600">
                              {format(parseISO(rental.startDate), 'MMM d, yyyy')} - {rental.endDate ? format(parseISO(rental.endDate), 'MMM d, yyyy') : t('indexPage.tbdDate')}
                            </p>

                            {/* Mileage and Fuel Information */}
                            <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-2 text-sm">
                              <div>
                                <span className="text-gray-600">{t('calendarPage.completedRentals.pickupMileageColonLabel')}</span>
                                <span className="ml-1 font-medium">
                                  {rental.pickupMileage !== null && rental.pickupMileage !== undefined
                                    ? `${rental.pickupMileage.toLocaleString()} km`
                                    : '—'}
                                </span>
                              </div>
                              <div>
                                <span className="text-gray-600">{t('calendarPage.completedRentals.returnMileageColonLabel')}</span>
                                <span className="ml-1 font-medium">
                                  {(rental as any).displayReturnMileage !== null && (rental as any).displayReturnMileage !== undefined
                                    ? `${(rental as any).displayReturnMileage.toLocaleString()} km`
                                    : '—'}
                                </span>
                              </div>
                              <div>
                                <span className="text-gray-600">{t('calendarPage.completedRentals.fuelAtPickupColonLabel')}</span>
                                <span className="ml-1 font-medium">
                                  {rental.fuelLevelPickup && rental.fuelLevelPickup !== 'not_recorded'
                                    ? rental.fuelLevelPickup
                                    : '—'}
                                </span>
                              </div>
                              <div>
                                <span className="text-gray-600">{t('calendarPage.completedRentals.fuelAtReturnColonLabel')}</span>
                                <span className="ml-1 font-medium">
                                  {rental.fuelLevelReturn && rental.fuelLevelReturn !== 'not_recorded'
                                    ? rental.fuelLevelReturn
                                    : '—'}
                                </span>
                              </div>
                            </div>

                            {rental.notes && (
                              <p className="text-sm mt-2 text-gray-700">{rental.notes}</p>
                            )}
                            {rental.totalPrice && (
                              <p className="text-sm font-medium text-green-600 mt-1">
                                {t('calendarPage.completedRentals.totalColonLabel')} <Price value={Number(rental.totalPrice)} />
                              </p>
                            )}
                          </div>
                          <div className="flex gap-2 ml-4">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                handleViewReservation(rental);
                                setCompletedRentalsDialogOpen(false);
                              }}
                              data-testid={`button-view-${rental.id}`}
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1">
                                <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/>
                                <circle cx="12" cy="12" r="3"/>
                              </svg>
                              {t('common:actions.view')}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={async () => {
                                try {
                                  await apiRequest('PATCH', `/api/reservations/${rental.id}`, {
                                    status: 'picked_up',
                                    returnMileage: null,
                                    fuelLevelReturn: null,
                                    fuelCost: null,
                                    fuelNotes: null
                                  });
                                  invalidateRelatedQueries('reservations');
                                  refetchCalendarData();
                                  toast({
                                    title: t('calendarPage.completedRentals.toasts.revertedTitle'),
                                    description: t('calendarPage.completedRentals.toasts.revertedDescription')
                                  });
                                } catch (error) {
                                  toast({
                                    title: t('common:status.error'),
                                    description: t('calendarPage.completedRentals.toasts.revertFailedDescription'),
                                    variant: "destructive"
                                  });
                                }
                              }}
                              data-testid={`button-revert-${rental.id}`}
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1">
                                <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/>
                                <path d="M21 3v5h-5"/>
                                <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/>
                                <path d="M8 16H3v5"/>
                              </svg>
                              {t('calendarPage.completedRentals.revertButton')}
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="text-red-600 hover:text-red-700"
                                  data-testid={`button-delete-${rental.id}`}
                                >
                                  <Trash2 className="h-4 w-4 mr-1" />
                                  {t('common:actions.delete')}
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>{t('calendarPage.completedRentals.deleteTitle')}</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    {t('calendarPage.completedRentals.deleteDescription')}
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>{t('common:actions.cancel')}</AlertDialogCancel>
                                  <AlertDialogAction
                                    className="bg-red-600 hover:bg-red-700"
                                    onClick={async () => {
                                      try {
                                        await apiRequest('DELETE', `/api/reservations/${rental.id}`);
                                        invalidateRelatedQueries('reservations');
                                        refetchCalendarData();
                                        toast({
                                          title: t('calendarPage.completedRentals.toasts.deletedTitle'),
                                          description: t('calendarPage.completedRentals.toasts.deletedDescription')
                                        });
                                      } catch (error) {
                                        toast({
                                          title: t('common:status.error'),
                                          description: t('calendarPage.completedRentals.toasts.deleteFailedDescription'),
                                          variant: "destructive"
                                        });
                                      }
                                    }}
                                  >
                                    {t('common:actions.delete')}
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
              );
            })()}
          </ScrollArea>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCompletedRentalsDialogOpen(false)}>
              {t('common:actions.close')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Overdue Rentals Dialog */}
      <Dialog open={overdueDialogOpen} onOpenChange={setOverdueDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="h-5 w-5" />
              {t('indexPage.overdueRentalsDialogTitle')}
            </DialogTitle>
            <DialogDescription>
              {t('indexPage.overdueRentalsDialogDescription')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 mt-4">
            {overdueReservations.map((reservation) => {
              const daysOverdue = reservation.endDate 
                ? differenceInDays(new Date(), parseISO(reservation.endDate))
                : 0;
              
              return (
                <div 
                  key={reservation.id}
                  className="flex items-start justify-between p-4 bg-red-50 dark:bg-red-950/30 rounded-lg border border-red-200 dark:border-red-800"
                  data-testid={`overdue-reservation-${reservation.id}`}
                >
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Car className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">
                        {reservation.vehicle?.brand} {reservation.vehicle?.model}
                      </span>
                      <Badge variant="outline" className="text-xs">
                        {formatLicensePlate(reservation.vehicle?.licensePlate || '')}
                      </Badge>
                    </div>
                    
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <User className="h-3 w-3" />
                      <span>{reservation.customer?.name || t('spareVehicleAssignmentDialog.unknownCustomer')}</span>
                      {reservation.customer?.phone && (
                        <>
                          <Phone className="h-3 w-3 ml-2" />
                          <a
                            href={`tel:${reservation.customer.phone}`}
                            className="text-blue-600 hover:underline"
                            data-testid={`phone-link-${reservation.id}`}
                          >
                            {reservation.customer.phone}
                          </a>
                        </>
                      )}
                    </div>

                    <div className="flex items-center gap-2 text-sm">
                      <Calendar className="h-3 w-3 text-muted-foreground" />
                      <span className="text-muted-foreground">
                        {t('indexPage.shouldHaveReturnedLabel', { date: reservation.endDate ? format(parseISO(reservation.endDate), 'MMM d, yyyy') : t('indexPage.notAvailable') })}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-2">
                    <Badge variant="destructive" className="shrink-0">
                      {t('listDialog.daysOverdue', { count: daysOverdue })}
                    </Badge>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        handleViewReservation(reservation);
                        setOverdueDialogOpen(false);
                      }}
                      data-testid={`button-view-overdue-${reservation.id}`}
                    >
                      {t('form.overdueDialog.viewDetailsButton')}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
      {/* Administration Dialog for External Invoicing */}
      <Dialog open={adminDialogOpen} onOpenChange={setAdminDialogOpen}>
        <DialogContent className="w-[95vw] max-w-[95vw] max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              {t('calendarPage.administration.title')}
            </DialogTitle>
            <DialogDescription>
              {t('calendarPage.administration.description')}
            </DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="current" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="current" className="flex items-center gap-2">
                <Car className="h-4 w-4" />
                {t('calendarPage.administration.currentRentalsTab')}
              </TabsTrigger>
              <TabsTrigger value="history" className="flex items-center gap-2">
                <History className="h-4 w-4" />
                {t('calendarPage.administration.historyTab')}
              </TabsTrigger>
            </TabsList>
            
            {/* Current Rentals Tab */}
            <TabsContent value="current" className="mt-4">
              {(() => {
                // Get all currently picked up rentals (active rentals).
                // IMPORTANT: use the full reservations list, NOT the calendar's
                // date-range query — rentals picked up outside the visible
                // calendar window would otherwise be missing here.
                const currentRentals = allReservationsForLookup.filter(res => 
                  res.status === 'picked_up' && res.type !== 'maintenance_block'
                );
                
                // Apply search filter
                const searchedCurrent = currentRentals.filter(rental => {
                  if (!adminCurrentSearch) return true;
                  const search = adminCurrentSearch.toLowerCase();
                  return (
                    rental.vehicle?.licensePlate?.toLowerCase().includes(search) ||
                    rental.vehicle?.brand?.toLowerCase().includes(search) ||
                    rental.vehicle?.model?.toLowerCase().includes(search) ||
                    rental.customer?.companyName?.toLowerCase().includes(search) ||
                    rental.customer?.name?.toLowerCase().includes(search) ||
                    rental.contractNumber?.toLowerCase().includes(search) ||
                    rental.vehicle?.imei?.toLowerCase().includes(search)
                  );
                });
                
                // Apply sort - every column is sortable from its header, the
                // dropdown just picks the column and leaves the direction alone.
                const sortedCurrent = [...searchedCurrent].sort((a, b) => {
                  const dir = adminCurrentSort.direction === 'asc' ? 1 : -1;
                  const vehicleA = a.vehicle || vehicles?.find(v => v.id === a.vehicleId);
                  const vehicleB = b.vehicle || vehicles?.find(v => v.id === b.vehicleId);

                  switch (adminCurrentSort.column) {
                    case 'gps':
                      return dir * ((vehicleA?.gps ? 1 : 0) - (vehicleB?.gps ? 1 : 0));
                    case 'plate':
                      return dir * (vehicleA?.licensePlate || '').localeCompare(vehicleB?.licensePlate || '');
                    case 'model':
                      return dir * `${vehicleA?.brand || ''} ${vehicleA?.model || ''}`.trim()
                        .localeCompare(`${vehicleB?.brand || ''} ${vehicleB?.model || ''}`.trim());
                    case 'spare':
                      return dir * (getSpareTargetVehicle(a)?.licensePlate || '')
                        .localeCompare(getSpareTargetVehicle(b)?.licensePlate || '');
                    case 'company':
                      return dir * (a.customer?.companyName || a.customer?.name || '').localeCompare(b.customer?.companyName || b.customer?.name || '');
                    case 'contract':
                      return dir * (a.contractNumber || '').localeCompare(b.contractNumber || '');
                    case 'pickup':
                      return dir * (new Date(a.startDate || 0).getTime() - new Date(b.startDate || 0).getTime());
                    default:
                      return 0;
                  }
                });

                const toggleCurrentSort = (column: string) => {
                  setAdminCurrentSort(prev => ({
                    column,
                    direction: prev.column === column && prev.direction === 'asc' ? 'desc' : 'asc'
                  }));
                };

                const CurrentSortIcon = ({ column }: { column: string }) => (
                  <span className="ml-1 inline-flex">
                    {adminCurrentSort.column === column ? (
                      adminCurrentSort.direction === 'asc' ? '↑' : '↓'
                    ) : (
                      <span className="text-gray-300">↕</span>
                    )}
                  </span>
                );

                return (
                  <div className="space-y-4">
                    <div className="flex items-center gap-4">
                      <div className="flex-1">
                        <Input
                          placeholder={t('calendarPage.administration.searchPlaceholder')}
                          value={adminCurrentSearch}
                          onChange={(e) => setAdminCurrentSearch(e.target.value)}
                          className="h-9"
                          data-testid="input-admin-current-search"
                        />
                      </div>
                      <Select
                        value={adminCurrentSort.column}
                        onValueChange={(v: string) => setAdminCurrentSort({ column: v, direction: v === 'pickup' ? 'desc' : 'asc' })}
                      >
                        <SelectTrigger className="w-[160px] h-9">
                          <SelectValue placeholder={t('calendarPage.administration.sortByPlaceholder')} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pickup">{t('calendarPage.administration.sortOptions.pickupDate')}</SelectItem>
                          <SelectItem value="plate">{t('calendarPage.administration.sortOptions.licensePlate')}</SelectItem>
                          <SelectItem value="company">{t('calendarPage.administration.sortOptions.company')}</SelectItem>
                          <SelectItem value="contract">{t('calendarPage.administration.sortOptions.contractNumber')}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <p className="text-sm text-muted-foreground">
                      {t('calendarPage.administration.vehiclesCurrentlyOutCount', { count: sortedCurrent.length })}
                    </p>

                    <div className="border rounded-md overflow-hidden">
                      <div className="max-h-[400px] overflow-y-auto">
                        <Table>
                          <TableHeader className="bg-muted/50 sticky top-0 z-10">
                            <TableRow className="border-b-2">
                              <TableHead
                                className="px-2 py-1 border-r font-semibold text-center whitespace-nowrap cursor-pointer hover:bg-muted/80 select-none"
                                onClick={() => toggleCurrentSort('gps')}
                                data-testid="header-admin-current-gps"
                              >
                                {t('calendarPage.administration.tableHeaders.gps')}<CurrentSortIcon column="gps" />
                              </TableHead>
                              <TableHead
                                className="px-2 py-1 border-r font-semibold whitespace-nowrap cursor-pointer hover:bg-muted/80 select-none"
                                onClick={() => toggleCurrentSort('plate')}
                                data-testid="header-admin-current-plate"
                              >
                                {t('calendarPage.administration.tableHeaders.licensePlate')}<CurrentSortIcon column="plate" />
                              </TableHead>
                              <TableHead
                                className="px-2 py-1 border-r font-semibold whitespace-nowrap cursor-pointer hover:bg-muted/80 select-none"
                                onClick={() => toggleCurrentSort('model')}
                                data-testid="header-admin-current-model"
                              >
                                {t('calendarPage.administration.tableHeaders.makeModel')}<CurrentSortIcon column="model" />
                              </TableHead>
                              <TableHead
                                className="px-2 py-1 border-r font-semibold whitespace-nowrap cursor-pointer hover:bg-muted/80 select-none"
                                onClick={() => toggleCurrentSort('spare')}
                                data-testid="header-admin-current-spare"
                              >
                                {t('calendarPage.administration.tableHeaders.spareVehicle')}<CurrentSortIcon column="spare" />
                              </TableHead>
                              <TableHead
                                className="px-2 py-1 border-r font-semibold whitespace-nowrap cursor-pointer hover:bg-muted/80 select-none"
                                onClick={() => toggleCurrentSort('contract')}
                                data-testid="header-admin-current-contract"
                              >
                                {t('calendarPage.administration.tableHeaders.contractNumber')}<CurrentSortIcon column="contract" />
                              </TableHead>
                              <TableHead
                                className="px-2 py-1 border-r font-semibold whitespace-nowrap cursor-pointer hover:bg-muted/80 select-none"
                                onClick={() => toggleCurrentSort('company')}
                                data-testid="header-admin-current-company"
                              >
                                {t('calendarPage.administration.tableHeaders.companyCustomer')}<CurrentSortIcon column="company" />
                              </TableHead>
                              <TableHead
                                className="px-2 py-1 font-semibold whitespace-nowrap cursor-pointer hover:bg-muted/80 select-none"
                                onClick={() => toggleCurrentSort('pickup')}
                                data-testid="header-admin-current-pickup"
                              >
                                {t('calendarPage.administration.tableHeaders.pickupDate')}<CurrentSortIcon column="pickup" />
                              </TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {sortedCurrent.length === 0 ? (
                              <TableRow>
                                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                                  {t('calendarPage.administration.noVehiclesCurrentlyRented')}
                                </TableCell>
                              </TableRow>
                            ) : (
                              sortedCurrent.map((rental) => {
                                const vehicleData = rental.vehicle || vehicles?.find(v => v.id === rental.vehicleId);
                                const spareForVehicle = getSpareTargetVehicle(rental);
                                return (
                                  <TableRow key={rental.id} className="border-b hover:bg-muted/30" data-testid={`admin-current-row-${rental.id}`}>
                                    <TableCell className="px-2 py-1 border-r text-center">
                                      {vehicleData?.gps ? (
                                        <Badge className="bg-green-100 text-green-800 text-xs">{t('common:actions.yes')}</Badge>
                                      ) : (
                                        <Badge variant="secondary" className="text-xs">{t('common:actions.no')}</Badge>
                                      )}
                                    </TableCell>
                                    <TableCell className="px-2 py-1 font-semibold border-r">
                                      <span className="bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded text-sm font-mono">
                                        {formatLicensePlate(vehicleData?.licensePlate || '')}
                                      </span>
                                    </TableCell>
                                    <TableCell className="px-2 py-1 border-r">
                                      {vehicleData?.brand} {vehicleData?.model}
                                    </TableCell>
                                    <TableCell className="px-2 py-1 border-r whitespace-nowrap">
                                      {spareForVehicle ? (
                                        <span className="text-xs">
                                          <Badge className="bg-orange-100 text-orange-800 text-xs mr-1">{t('calendarPage.administration.spareForBadge')}</Badge>
                                          <span className="font-mono">{formatLicensePlate(spareForVehicle.licensePlate)}</span>
                                        </span>
                                      ) : (
                                        <span className="text-muted-foreground text-xs">-</span>
                                      )}
                                    </TableCell>
                                    <TableCell className="px-2 py-1 font-mono font-semibold border-r">
                                      {rental.contractNumber || '-'}
                                    </TableCell>
                                    <TableCell className="px-2 py-1 border-r truncate max-w-[200px]">
                                      <span className="font-medium">{rental.customer?.companyName || rental.customer?.name || '-'}</span>
                                    </TableCell>
                                    <TableCell className="px-2 py-1">
                                      {rental.startDate ? format(parseISO(rental.startDate), 'dd MMM yyyy') : '-'}
                                    </TableCell>
                                  </TableRow>
                                );
                              })
                            )}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </TabsContent>
            
            {/* History Tab */}
            <TabsContent value="history" className="mt-4">
              {(() => {
                // Use completedRentals which fetches ALL completed/returned rentals (not date-filtered)
                // Enrich with vehicle data from vehicles array
                const historyRentals = completedRentals.map(rental => ({
                  ...rental,
                  vehicle: rental.vehicle || vehicles?.find(v => v.id === rental.vehicleId)
                }));
                
                // Apply date filter
                const now = new Date();
                const filteredHistory = historyRentals.filter(rental => {
                  if (adminHistoryDateFilter === 'all') return true;
                  const endDate = rental.endDate ? parseISO(rental.endDate) : null;
                  if (!endDate) return false;
                  
                  switch (adminHistoryDateFilter) {
                    case '7days': return differenceInDays(now, endDate) <= 7;
                    case '30days': return differenceInDays(now, endDate) <= 30;
                    case '90days': return differenceInDays(now, endDate) <= 90;
                    default: return true;
                  }
                });
                
                // Apply search filter
                const searchedHistory = filteredHistory.filter(rental => {
                  if (!adminHistorySearch) return true;
                  const search = adminHistorySearch.toLowerCase();
                  return (
                    rental.vehicle?.licensePlate?.toLowerCase().includes(search) ||
                    rental.vehicle?.brand?.toLowerCase().includes(search) ||
                    rental.vehicle?.model?.toLowerCase().includes(search) ||
                    rental.customer?.companyName?.toLowerCase().includes(search) ||
                    rental.customer?.name?.toLowerCase().includes(search) ||
                    rental.contractNumber?.toLowerCase().includes(search) ||
                    rental.vehicle?.imei?.toLowerCase().includes(search)
                  );
                });
                
                // Helper to get damage check info for a reservation
                const getDamageCheckInfo = (reservationId: number) => {
                  const check = allDamageChecks.find((c: any) => c.reservationId === reservationId);
                  if (!check) return null;
                  return {
                    exists: true,
                    date: check.checkDate || check.createdAt,
                    completedBy: check.completedBy || t('detailsPage.unknown')
                  };
                };
                
                // Apply sorting
                const sortedHistory = [...searchedHistory].sort((a, b) => {
                  const dir = adminHistorySort.direction === 'asc' ? 1 : -1;
                  const vehicleA = a.vehicle || vehicles?.find(v => v.id === a.vehicleId);
                  const vehicleB = b.vehicle || vehicles?.find(v => v.id === b.vehicleId);
                  
                  switch (adminHistorySort.column) {
                    case 'gps':
                      return dir * ((vehicleA?.imei ? 1 : 0) - (vehicleB?.imei ? 1 : 0));
                    case 'plate':
                      return dir * (vehicleA?.licensePlate || '').localeCompare(vehicleB?.licensePlate || '');
                    case 'model':
                      return dir * (`${vehicleA?.brand} ${vehicleA?.model}` || '').localeCompare(`${vehicleB?.brand} ${vehicleB?.model}` || '');
                    case 'contract':
                      return dir * (a.contractNumber || '').localeCompare(b.contractNumber || '');
                    case 'company':
                      return dir * (a.customer?.companyName || a.customer?.name || '').localeCompare(b.customer?.companyName || b.customer?.name || '');
                    case 'pickup':
                      return dir * (new Date(a.startDate || 0).getTime() - new Date(b.startDate || 0).getTime());
                    case 'return':
                      return dir * (new Date(a.endDate || 0).getTime() - new Date(b.endDate || 0).getTime());
                    case 'damage':
                      const checkA = getDamageCheckInfo(a.id);
                      const checkB = getDamageCheckInfo(b.id);
                      return dir * ((checkA ? 1 : 0) - (checkB ? 1 : 0));
                    case 'kmout':
                      return dir * ((a.pickupMileage || 0) - (b.pickupMileage || 0));
                    case 'kmin':
                      return dir * ((a.returnMileage || 0) - (b.returnMileage || 0));
                    default:
                      return 0;
                  }
                });
                
                // Toggle sort helper
                const toggleSort = (column: string) => {
                  setAdminHistorySort(prev => ({
                    column,
                    direction: prev.column === column && prev.direction === 'asc' ? 'desc' : 'asc'
                  }));
                };
                
                // Sort icon helper
                const SortIcon = ({ column }: { column: string }) => (
                  <span className="ml-1 inline-flex">
                    {adminHistorySort.column === column ? (
                      adminHistorySort.direction === 'asc' ? '↑' : '↓'
                    ) : (
                      <span className="text-gray-300">↕</span>
                    )}
                  </span>
                );
                
                return (
                  <div className="space-y-4">
                    <div className="flex items-center gap-4">
                      <div className="flex-1">
                        <Input
                          placeholder={t('calendarPage.administration.searchPlaceholder')}
                          value={adminHistorySearch}
                          onChange={(e) => setAdminHistorySearch(e.target.value)}
                          className="h-9"
                          data-testid="input-admin-history-search"
                        />
                      </div>
                      <Select value={adminHistoryDateFilter} onValueChange={(v: any) => setAdminHistoryDateFilter(v)}>
                        <SelectTrigger className="w-[140px] h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="7days">{t('calendarPage.timePeriodOptions.last7Days')}</SelectItem>
                          <SelectItem value="30days">{t('calendarPage.timePeriodOptions.last30Days')}</SelectItem>
                          <SelectItem value="90days">{t('calendarPage.timePeriodOptions.last90Days')}</SelectItem>
                          <SelectItem value="all">{t('calendarPage.timePeriodOptions.allTime')}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <p className="text-sm text-muted-foreground">
                      {t('calendarPage.administration.completedRentalsCount', { count: sortedHistory.length })}
                    </p>

                    <div className="border rounded-md overflow-hidden">
                      <div className="max-h-[400px] overflow-y-auto">
                        <Table>
                          <TableHeader className="bg-muted/50 sticky top-0 z-10">
                            <TableRow className="border-b-2">
                              <TableHead
                                className="px-2 py-1 border-r font-semibold text-center whitespace-nowrap cursor-pointer hover:bg-muted/80 select-none"
                                onClick={() => toggleSort('gps')}
                              >
                                {t('calendarPage.administration.tableHeaders.gps')}<SortIcon column="gps" />
                              </TableHead>
                              <TableHead
                                className="px-2 py-1 border-r font-semibold whitespace-nowrap cursor-pointer hover:bg-muted/80 select-none"
                                onClick={() => toggleSort('plate')}
                              >
                                {t('calendarPage.administration.tableHeaders.licensePlate')}<SortIcon column="plate" />
                              </TableHead>
                              <TableHead
                                className="px-2 py-1 border-r font-semibold whitespace-nowrap cursor-pointer hover:bg-muted/80 select-none"
                                onClick={() => toggleSort('model')}
                              >
                                {t('calendarPage.administration.tableHeaders.makeModel')}<SortIcon column="model" />
                              </TableHead>
                              <TableHead className="px-2 py-1 border-r font-semibold whitespace-nowrap">
                                {t('calendarPage.administration.tableHeaders.spareVehicle')}
                              </TableHead>
                              <TableHead
                                className="px-2 py-1 border-r font-semibold whitespace-nowrap cursor-pointer hover:bg-muted/80 select-none"
                                onClick={() => toggleSort('contract')}
                              >
                                {t('calendarPage.administration.tableHeaders.contractNumber')}<SortIcon column="contract" />
                              </TableHead>
                              <TableHead
                                className="px-2 py-1 border-r font-semibold whitespace-nowrap cursor-pointer hover:bg-muted/80 select-none"
                                onClick={() => toggleSort('company')}
                              >
                                {t('calendarPage.administration.tableHeaders.companyCustomer')}<SortIcon column="company" />
                              </TableHead>
                              <TableHead
                                className="px-2 py-1 border-r font-semibold whitespace-nowrap cursor-pointer hover:bg-muted/80 select-none"
                                onClick={() => toggleSort('pickup')}
                              >
                                {t('calendarPage.administration.tableHeaders.pickup')}<SortIcon column="pickup" />
                              </TableHead>
                              <TableHead
                                className="px-2 py-1 border-r font-semibold whitespace-nowrap cursor-pointer hover:bg-muted/80 select-none"
                                onClick={() => toggleSort('return')}
                              >
                                {t('calendarPage.administration.tableHeaders.return')}<SortIcon column="return" />
                              </TableHead>
                              <TableHead
                                className="px-2 py-1 border-r font-semibold whitespace-nowrap cursor-pointer hover:bg-muted/80 select-none"
                                onClick={() => toggleSort('damage')}
                              >
                                {t('calendarPage.administration.tableHeaders.damageCheck')}<SortIcon column="damage" />
                              </TableHead>
                              <TableHead
                                className="px-2 py-1 border-r font-semibold whitespace-nowrap cursor-pointer hover:bg-muted/80 select-none"
                                onClick={() => toggleSort('kmout')}
                              >
                                {t('calendarPage.administration.tableHeaders.kmOut')}<SortIcon column="kmout" />
                              </TableHead>
                              <TableHead
                                className="px-2 py-1 font-semibold whitespace-nowrap cursor-pointer hover:bg-muted/80 select-none"
                                onClick={() => toggleSort('kmin')}
                              >
                                {t('calendarPage.administration.tableHeaders.kmIn')}<SortIcon column="kmin" />
                              </TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {sortedHistory.length === 0 ? (
                              <TableRow>
                                <TableCell colSpan={11} className="text-center py-8 text-muted-foreground">
                                  {t('listDialog.noCompletedReservations')}
                                </TableCell>
                              </TableRow>
                            ) : (
                              sortedHistory.map((rental) => {
                                const damageCheck = getDamageCheckInfo(rental.id);
                                const vehicleData = rental.vehicle || vehicles?.find(v => v.id === rental.vehicleId);
                                const spareForVehicle = getSpareTargetVehicle(rental);
                                return (
                                  <TableRow key={rental.id} className="border-b hover:bg-muted/30" data-testid={`admin-history-row-${rental.id}`}>
                                    <TableCell className="px-2 py-1 border-r text-center whitespace-nowrap">
                                      {vehicleData?.gps ? (
                                        <Badge className="bg-green-100 text-green-800 text-xs">{t('common:actions.yes')}</Badge>
                                      ) : (
                                        <Badge variant="secondary" className="text-xs">{t('common:actions.no')}</Badge>
                                      )}
                                    </TableCell>
                                    <TableCell className="px-2 py-1 font-semibold border-r whitespace-nowrap">
                                      <span className="bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded text-sm font-mono">
                                        {formatLicensePlate(vehicleData?.licensePlate || '')}
                                      </span>
                                    </TableCell>
                                    <TableCell className="px-2 py-1 border-r text-sm whitespace-nowrap">
                                      {vehicleData?.brand} {vehicleData?.model}
                                    </TableCell>
                                    <TableCell className="px-2 py-1 border-r whitespace-nowrap">
                                      {spareForVehicle ? (
                                        <span className="text-xs">
                                          <Badge className="bg-orange-100 text-orange-800 text-xs mr-1">{t('calendarPage.administration.spareForBadge')}</Badge>
                                          <span className="font-mono">{formatLicensePlate(spareForVehicle.licensePlate)}</span>
                                        </span>
                                      ) : (
                                        <span className="text-muted-foreground text-xs">-</span>
                                      )}
                                    </TableCell>
                                    <TableCell className="px-2 py-1 font-mono font-semibold border-r whitespace-nowrap">
                                      {rental.contractNumber || '-'}
                                    </TableCell>
                                    <TableCell className="px-2 py-1 border-r whitespace-nowrap">
                                      <span className="font-medium text-sm">{rental.customer?.companyName || rental.customer?.name || '-'}</span>
                                    </TableCell>
                                    <TableCell className="px-2 py-1 border-r text-sm whitespace-nowrap">
                                      {rental.startDate ? format(parseISO(rental.startDate), 'dd MMM yy') : '-'}
                                    </TableCell>
                                    <TableCell className="px-2 py-1 border-r text-sm whitespace-nowrap">
                                      {rental.endDate ? format(parseISO(rental.endDate), 'dd MMM yy') : '-'}
                                    </TableCell>
                                    <TableCell className="px-2 py-1 border-r whitespace-nowrap">
                                      {damageCheck ? (
                                        <span className="text-xs">
                                          <Badge variant="default" className="bg-green-100 text-green-800 text-xs">{t('common:actions.yes')}</Badge>
                                          <span className="text-muted-foreground ml-1">
                                            {damageCheck.date ? format(parseISO(damageCheck.date), 'dd MMM yyyy') : ''} {damageCheck.completedBy}
                                          </span>
                                        </span>
                                      ) : (
                                        <Badge variant="secondary" className="text-xs">{t('common:actions.no')}</Badge>
                                      )}
                                    </TableCell>
                                    <TableCell className="px-2 py-1 border-r text-sm font-mono whitespace-nowrap">
                                      {rental.pickupMileage?.toLocaleString() || '-'}
                                    </TableCell>
                                    <TableCell className="px-2 py-1 text-sm font-mono whitespace-nowrap">
                                      {rental.returnMileage?.toLocaleString() || '-'}
                                    </TableCell>
                                  </TableRow>
                                );
                              })
                            )}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </TabsContent>
          </Tabs>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdminDialogOpen(false)}>
              {t('common:actions.close')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Pickup/Return Dialogs */}
      {selectedReservation && (
        <>
          <PickupDialog
            key={`pickup-${selectedReservation.id}`}
            open={pickupDialogOpen}
            onOpenChange={setPickupDialogOpen}
            reservation={selectedReservation}
            onSuccess={async () => {
              // Fetch updated reservation data and update the view dialog
              try {
                const response = await fetch(`/api/reservations/${selectedReservation.id}`, {
                  credentials: 'include',
                });
                
                if (response.ok) {
                  const updatedReservation = await response.json();
                  setSelectedReservation(updatedReservation);
                }
              } catch (error) {
                console.error('Error fetching updated reservation:', error);
              }
              
              await refetchDocuments();
              await refetchDamageChecks();
              
              invalidateRelatedQueries('reservations');
              refetchCalendarData();
            }}
          />
          <ReturnDialog
            key={`return-${selectedReservation.id}`}
            open={returnDialogOpen}
            onOpenChange={setReturnDialogOpen}
            reservation={selectedReservation}
            onSuccess={async () => {
              try {
                const response = await fetch(`/api/reservations/${selectedReservation.id}`, {
                  credentials: 'include',
                });
                
                if (response.ok) {
                  const updatedReservation = await response.json();
                  setSelectedReservation(updatedReservation);
                }
              } catch (error) {
                console.error('Error fetching updated reservation:', error);
              }
              
              await refetchDocuments();
              await refetchDamageChecks();
              
              invalidateRelatedQueries('reservations');
              refetchCalendarData();
            }}
          />
        </>
      )}

      <ConfirmDialog
        open={deleteDamageCheckDialogOpen}
        onOpenChange={setDeleteDamageCheckDialogOpen}
        title={t('pickupReturn.common.deleteDamageCheckTitle')}
        description={t('calendarPage.deleteDamageCheckConfirmDescription')}
        variant="danger"
        confirmLabel={t('common:actions.delete')}
        onConfirm={confirmDeleteDamageCheck}
        onCancel={() => setDamageCheckToDelete(null)}
      />

      <ConfirmDialog
        open={deleteReservationDialogOpen}
        onOpenChange={setDeleteReservationDialogOpen}
        title={t('listDialog.deleteDialog.title')}
        description={t('calendarPage.deleteReservationForCustomerDescription', { name: reservationToDelete?.customer?.name || t('calendarPage.thisCustomerFallback') })}
        variant="danger"
        confirmLabel={t('common:actions.delete')}
        onConfirm={confirmDeleteReservation}
        onCancel={() => setReservationToDelete(null)}
      />

      <ConfirmDialog
        open={deleteDocDialogOpen}
        onOpenChange={setDeleteDocDialogOpen}
        title={t('form.deleteDocumentDialog.title')}
        description={t('form.deleteDocumentDialog.description', { type: documentToDelete?.documentType })}
        variant="danger"
        confirmLabel={t('common:actions.delete')}
        onConfirm={async () => {
          if (!documentToDelete) return;
          try {
            const response = await fetch(`/api/documents/${documentToDelete.id}`, {
              method: 'DELETE',
              credentials: 'include',
            });

            if (!response.ok) {
              throw new Error('Delete failed');
            }

            invalidateByPrefix(`/api/documents/reservation/${selectedReservation?.id}`);
            toast({
              title: t('common:status.success'),
              description: t('form.toasts.documentDeletedDescription'),
            });
          } catch (error) {
            console.error('Delete failed:', error);
            toast({
              title: t('common:status.error'),
              description: t('form.toasts.failedToDeleteDocumentDescription'),
              variant: "destructive",
            });
          }
          setDocumentToDelete(null);
        }}
        onCancel={() => setDocumentToDelete(null)}
      />

      {/* Damage check PDF preview — in-app iframe instead of window.open, which
          browsers routinely block and which never let the user view the PDF
          inline (had to download first). */}
      <AlertDialog open={pdfPreviewOpen} onOpenChange={setPdfPreviewOpen}>
        <AlertDialogContent className="max-w-5xl w-[90vw] h-[90vh] flex flex-col">
          <AlertDialogHeader className="flex-shrink-0">
            <AlertDialogTitle>{t('calendarPage.damageCheckPdfTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('calendarPage.previewLabel')}</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex-1 overflow-hidden border rounded">
            {pdfPreviewUrl && (
              <iframe
                src={pdfPreviewUrl}
                className="w-full h-full border-0"
                title={t('calendarPage.damageCheckPdfTitle')}
              />
            )}
          </div>
          <AlertDialogFooter className="flex-shrink-0">
            <AlertDialogCancel onClick={() => setPdfPreviewOpen(false)}>{t('common:actions.close')}</AlertDialogCancel>
            <AlertDialogAction onClick={() => pdfPreviewUrl && window.open(pdfPreviewUrl, '_blank')}>
              {t('form.documentPreview.openInNewTabButton')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirmation for a reservation moved by drag and drop */}
      <AlertDialog open={!!pendingMove} onOpenChange={(open) => { if (!open) setPendingMove(null); }}>
        <AlertDialogContent data-testid="dialog-confirm-move-reservation">
          <AlertDialogHeader>
            <AlertDialogTitle>{t('calendarPage.moveConfirm.title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {moveStartShift === 0
                ? t('calendarPage.moveConfirm.descriptionSameStart')
                : t('calendarPage.moveConfirm.description', {
                    count: Math.abs(moveStartShift),
                    direction: moveStartShift > 0
                      ? t('calendarPage.moveConfirm.later')
                      : t('calendarPage.moveConfirm.earlier'),
                  })}
            </AlertDialogDescription>
          </AlertDialogHeader>

          {pendingMove && (
            <div className="space-y-3 text-sm">
              <div className="font-medium">
                {formatLicensePlate(pendingMove.reservation.vehicle?.licensePlate || '') || t('calendarPage.moveConfirm.noVehicle')}
                {pendingMove.reservation.customer?.name ? ` — ${pendingMove.reservation.customer.name}` : ''}
              </div>
              <div>
                <span className="text-muted-foreground">{t('calendarPage.moveConfirm.from')} </span>
                <span className="line-through">
                  {safeFormat(safeParseDateISO(pendingMove.reservation.startDate), 'dd-MM-yyyy', '-')}
                  {pendingMove.reservation.endDate ? ` → ${safeFormat(safeParseDateISO(pendingMove.reservation.endDate), 'dd-MM-yyyy', '-')}` : ''}
                </span>
              </div>

              {/* Both dates stay editable here: the drag shifts them by the same
                  offset, but a vehicle picked up earlier is often returned on the
                  originally agreed day or later. */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label htmlFor="move-start-date" className="text-xs text-muted-foreground">
                    {t('calendarPage.moveConfirm.newStartDate')}
                  </label>
                  <Input
                    id="move-start-date"
                    type="date"
                    value={pendingMove.newStartDate}
                    disabled={isMoving}
                    onChange={(e) => setPendingMove({ ...pendingMove, newStartDate: e.target.value })}
                    data-testid="input-move-start-date"
                  />
                </div>
                <div className="space-y-1">
                  <label htmlFor="move-end-date" className="text-xs text-muted-foreground">
                    {t('calendarPage.moveConfirm.newEndDate')}
                  </label>
                  <Input
                    id="move-end-date"
                    type="date"
                    value={pendingMove.newEndDate || ''}
                    disabled={isMoving}
                    onChange={(e) => setPendingMove({ ...pendingMove, newEndDate: e.target.value || null })}
                    data-testid="input-move-end-date"
                  />
                </div>
              </div>

              {pendingMove.reservation.endDate && pendingMove.newEndDate !== shiftedEndDate && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isMoving}
                  onClick={() => setPendingMove({ ...pendingMove, newEndDate: shiftedEndDate })}
                  data-testid="button-reset-move-end-date"
                >
                  {t('calendarPage.moveConfirm.resetEndDate')}
                </Button>
              )}

              {moveDatesInvalid && (
                <p className="text-sm text-destructive" data-testid="text-move-date-error">
                  {t('calendarPage.moveConfirm.endBeforeStart')}
                </p>
              )}
            </div>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel disabled={isMoving} data-testid="button-cancel-move">
              {t('common:actions.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={isMoving || moveDatesInvalid || !pendingMove?.newStartDate}
              data-testid="button-confirm-move"
              onClick={async (e) => {
                // Keep the dialog up until the move actually lands, so a failure
                // isn't hidden behind a closed dialog.
                e.preventDefault();
                if (!pendingMove) return;
                setIsMoving(true);
                try {
                  await handleMoveReservation(pendingMove.reservation.id, pendingMove.newStartDate, pendingMove.newEndDate);
                  setPendingMove(null);
                } finally {
                  setIsMoving(false);
                }
              }}
            >
              {isMoving ? t('calendarPage.moveConfirm.moving') : t('calendarPage.moveConfirm.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
