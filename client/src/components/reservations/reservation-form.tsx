import { useState, useEffect, useMemo, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { apiRequest, invalidateByPrefix, invalidateRelatedQueries } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { insertReservationSchemaBase } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { CustomerForm } from "@/components/customers/customer-form";
import { VehicleQuickForm } from "@/components/vehicles/vehicle-quick-form";
import { VehicleForm } from "@/components/vehicles/vehicle-form";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
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
  DialogTrigger,
} from "@/components/ui/dialog";
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
import { SearchableCombobox } from "@/components/ui/searchable-combobox";
import { VehicleSelector } from "@/components/ui/vehicle-selector";
import { formatDate, formatLicensePlate } from "@/lib/format-utils";
import { format, addDays, parseISO, differenceInDays } from "date-fns";
import { Customer, Vehicle, Reservation, Document, Driver, type InteractiveDamageCheck } from "@shared/schema";
import { PlusCircle, FileCheck, Upload, Check, X, Edit, FileText, Eye, ClipboardCheck, AlertTriangle } from "lucide-react";
import { ReadonlyVehicleDisplay } from "@/components/ui/readonly-vehicle-display";
import { DriverDialog } from "@/components/customers/driver-dialog";
import { ReservationViewDialog } from "@/components/reservations/reservation-view-dialog";
import { PickupDialog, ReturnDialog } from "@/components/reservations/pickup-return-dialogs";
import { VehicleRemarksWarningDialog } from "@/components/vehicles/vehicle-remarks-warning-dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

// Extended schema with validation
const formSchema = insertReservationSchemaBase.extend({
  vehicleId: z.union([
    z.number().min(1, "Please select a vehicle"),
    z.string().min(1, "Please select a vehicle").transform(val => parseInt(val)),
  ]),
  customerId: z.union([
    z.number().min(1, "Please select a customer"),
    z.string().min(1, "Please select a customer").transform(val => parseInt(val)),
  ]),
  driverId: z.union([
    z.number(),
    z.string().transform(val => val === "" ? null : parseInt(val)),
  ]).optional().nullable(),
  startDate: z.string().min(1, "Start date is required"),
  endDate: z.string().optional(),
  isOpenEnded: z.boolean().optional(),
  // Contract number is assigned during pickup, not during reservation creation
  contractNumber: z.string().nullish(),
  deliveryRequired: z.boolean().optional(),
  deliveryAddress: z.string().nullish(),
  deliveryCity: z.string().nullish(),
  deliveryPostalCode: z.string().nullish(),
  deliveryFee: z.union([
    z.number().nullish(),
    z.string().transform(val => val === "" ? null : parseFloat(val) || null),
  ]).nullish(),
  deliveryNotes: z.string().nullish(),
  totalPrice: z.union([
    z.number().nullish(),
    z.string().transform(val => val === "" || val === null ? null : parseFloat(val) || null),
  ]).nullish(),
  damageCheckFile: z.instanceof(File).optional(),
  departureMileage: z.union([
    z.number().nullish(),
    z.string().transform(val => val === "" || val === null ? null : parseInt(val) || null),
  ]).nullish().refine(val => val === null || val === undefined || val >= 0, { message: "Mileage cannot be negative" }),
  startMileage: z.union([
    z.number().nullish(),
    z.string().transform(val => val === "" || val === null ? null : parseInt(val) || null),
  ]).nullish().refine(val => val === null || val === undefined || val >= 0, { message: "Mileage cannot be negative" }),
  fuelLevelPickup: z.string().nullish(),
  fuelLevelReturn: z.string().nullish(),
  fuelCost: z.union([
    z.number().nullish(),
    z.string().transform(val => val === "" ? null : parseFloat(val) || null),
  ]).nullish(),
  fuelCardNumber: z.string().nullish(),
  fuelNotes: z.string().nullish(),
}).refine((data) => {
  // If not open-ended, end date is required
  if (!data.isOpenEnded && (!data.endDate || data.endDate === "")) {
    return false;
  }
  return true;
}, {
  message: "End date is required for non-open-ended rentals",
  path: ["endDate"],
}).refine((data) => {
  // End date must be >= start date (when not open-ended)
  if (!data.isOpenEnded && data.startDate && data.endDate) {
    return data.endDate >= data.startDate;
  }
  return true;
}, {
  message: "End date cannot be before start date",
  path: ["endDate"],
});

// Driver Search Combobox component
interface DriverSearchComboboxProps {
  value: number | null | undefined;
  drivers: Driver[];
  isLoading: boolean;
  onSelect: (value: number | null) => void;
}

function DriverSearchCombobox({ value, drivers, isLoading, onSelect }: DriverSearchComboboxProps) {
  const options = useMemo(() => {
    const activeDrivers = drivers.filter(d => d.status === "active");
    return [
      { value: "none", label: "No driver selected", tags: ["Clear"] },
      ...activeDrivers.map(driver => ({
        value: driver.id.toString(),
        label: driver.displayName || `${driver.firstName} ${driver.lastName}`.trim(),
        description: [driver.phone, driver.email].filter(Boolean).join(" • ") || undefined,
        tags: driver.isPrimaryDriver ? ["Primary"] : [],
      }))
    ];
  }, [drivers]);

  return (
    <SearchableCombobox
      options={options}
      value={value ? value.toString() : "none"}
      onChange={(val) => onSelect(val === "none" ? null : parseInt(val))}
      placeholder={isLoading ? "Loading drivers..." : "Search drivers..."}
      emptyMessage={isLoading ? "Loading..." : "No active drivers found"}
      searchPlaceholder="Search by name, phone, or email..."
      disabled={isLoading}
    />
  );
}

interface ReservationFormProps {
  editMode?: boolean;
  initialData?: any;
  initialVehicleId?: string;
  initialCustomerId?: string;
  initialStartDate?: string;
  onSuccess?: (reservation: Reservation) => void;
  onCancel?: () => void;
  onPreviewModeChange?: (isPreviewMode: boolean) => void;
  onPickupReturnDialogChange?: (isOpen: boolean) => void;
  onTriggerPickupDialog?: (reservation: Reservation) => void;
  onTriggerReturnDialog?: (reservation: Reservation) => void;
}

export function ReservationForm({ 
  editMode = false, 
  initialData,
  initialVehicleId,
  initialCustomerId,
  initialStartDate,
  onSuccess,
  onCancel,
  onPreviewModeChange,
  onPickupReturnDialogChange,
  onTriggerPickupDialog,
  onTriggerReturnDialog
}: ReservationFormProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [_, navigate] = useLocation();
  
  // Extract URL parameters
  const urlParams = new URLSearchParams(window.location.search);
  const preSelectedVehicleId = urlParams.get("vehicleId");
  const preSelectedCustomerId = urlParams.get("customerId");
  const preSelectedStartDate = urlParams.get("startDate");
  
  // Form states
  const [selectedStartDate, setSelectedStartDate] = useState<string>(
    initialStartDate || preSelectedStartDate || format(new Date(), "yyyy-MM-dd")
  );
  const [isOpenEnded, setIsOpenEnded] = useState<boolean>(
    !initialData?.endDate
  );
  const [deliveryRequired, setDeliveryRequired] = useState<boolean>(
    initialData?.deliveryRequired || false
  );
  const [vehicleDialogOpen, setVehicleDialogOpen] = useState(false);
  const [customerDialogOpen, setCustomerDialogOpen] = useState(false);
  const [vehicleEditDialogOpen, setVehicleEditDialogOpen] = useState(false);
  const [customerEditDialogOpen, setCustomerEditDialogOpen] = useState(false);
  const [damageFile, setDamageFile] = useState<File | null>(null);
  const [isDragActive, setIsDragActive] = useState(false);
  const [currentStatus, setCurrentStatus] = useState<string>(initialData?.status || "booked");
  const [departureMileage, setDepartureMileage] = useState<number | undefined>(
    initialData?.vehicle?.departureMileage || undefined
  );
  const [startMileage, setStartMileage] = useState<number | undefined>(
    initialData?.pickupMileage || undefined
  );
  const [fuelLevelPickup, setFuelLevelPickup] = useState<string | undefined>(
    initialData?.fuelLevelPickup || undefined
  );
  const [fuelLevelReturn, setFuelLevelReturn] = useState<string | undefined>(
    initialData?.fuelLevelReturn || undefined
  );
  const [fuelCost, setFuelCost] = useState<string | undefined>(
    initialData?.fuelCost || undefined
  );
  const [fuelCardNumber, setFuelCardNumber] = useState<string | undefined>(
    initialData?.fuelCardNumber || undefined
  );
  const [createdReservationId, setCreatedReservationId] = useState<number | null>(
    editMode && initialData ? initialData.id : null
  );
  const [showAllVehicles, setShowAllVehicles] = useState<boolean>(false);
  
  // Document management states
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false);
  const [previewDocument, setPreviewDocument] = useState<Document | null>(null);
  const [deleteDocDialogOpen, setDeleteDocDialogOpen] = useState(false);
  const [documentToDelete, setDocumentToDelete] = useState<Document | null>(null);
  
  // Overdue reservations detection states
  const [overdueReservations, setOverdueReservations] = useState<Reservation[]>([]);
  const [overdueDialogOpen, setOverdueDialogOpen] = useState(false);
  const [pendingFormData, setPendingFormData] = useState<z.infer<typeof formSchema> | null>(null);
  const [processingOverdue, setProcessingOverdue] = useState<number | null>(null);
  const [viewingReservationId, setViewingReservationId] = useState<number | null>(null);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  
  // Pickup/Return dialog workflow states - when user sets status to picked_up/returned, 
  // we save the reservation first and then open the appropriate dialog
  // NOTE: Using ref instead of state to avoid race condition where mutation's onSuccess
  // runs before React applies the state update
  const pendingStatusChangeRef = useRef<"picked_up" | "returned" | null>(null);
  const [pickupDialogOpen, setPickupDialogOpen] = useState(false);
  const [returnDialogOpen, setReturnDialogOpen] = useState(false);
  const [pendingDialogReservation, setPendingDialogReservation] = useState<Reservation | null>(null);
  
  // Vehicle remarks warning state - show warning when selecting a vehicle with remarks
  const [vehicleRemarksWarningOpen, setVehicleRemarksWarningOpen] = useState(false);
  const [pendingVehicleSelection, setPendingVehicleSelection] = useState<{vehicle: Vehicle, fieldOnChange: (value: string) => void} | null>(null);
  
  // Get recent selections from localStorage
  const getRecentSelections = (key: string): string[] => {
    try {
      const recent = localStorage.getItem(key);
      return recent ? JSON.parse(recent) : [];
    } catch {
      return [];
    }
  };
  
  const [recentVehicles, setRecentVehicles] = useState<string[]>(
    getRecentSelections('recentVehicles')
  );
  const [recentCustomers, setRecentCustomers] = useState<string[]>(
    getRecentSelections('recentCustomers')
  );
  
  // Save a selection to recent items
  const saveToRecent = (key: string, value: string) => {
    try {
      const recent = getRecentSelections(key);
      // Add to beginning, remove duplicates, limit to 5 items
      const updated = [value, ...recent.filter(v => v !== value)].slice(0, 5);
      localStorage.setItem(key, JSON.stringify(updated));
      
      if (key === 'recentVehicles') {
        setRecentVehicles(updated);
      } else if (key === 'recentCustomers') {
        setRecentCustomers(updated);
      }
    } catch {
      // Ignore localStorage errors
    }
  };
  
  // Fetch customers for select field
  const { data: customers, isLoading: isLoadingCustomers } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
  });
  
  // Fetch vehicles for select field
  const { data: vehicles, isLoading: isLoadingVehicles, refetch: refetchVehicles} = useQuery<Vehicle[]>({
    queryKey: ["/api/vehicles"],
  });
  
  // Fetch business rules settings to get default fuel policy
  const { data: businessRulesSettings } = useQuery<{ key: string; value: any } | null>({
    queryKey: ["/api/app-settings", "business_rules"],
  });
  
  // Fetch documents for the reservation (in edit mode or after creation)
  const activeReservationId = createdReservationId ?? initialData?.id ?? null;
  const { data: reservationDocuments, refetch: refetchDocuments } = useQuery<Document[]>({
    queryKey: [`/api/documents/reservation/${activeReservationId}`],
    enabled: !!activeReservationId
  });
  
  // Fetch damage checks for this reservation
  const { data: reservationDamageChecks = [], refetch: refetchReservationDamageChecks } = useQuery<InteractiveDamageCheck[]>({
    queryKey: [`/api/interactive-damage-checks/reservation/${activeReservationId}`],
    enabled: !!activeReservationId
  });
  
  // Refetch documents and damage checks when activeReservationId changes
  useEffect(() => {
    if (activeReservationId) {
      console.log('🔄 Refetching documents and damage checks for reservation:', activeReservationId);
      refetchDocuments();
      refetchReservationDamageChecks();
    }
  }, [activeReservationId, refetchDocuments, refetchReservationDamageChecks]);
  
  // Fetch selected vehicle details if vehicleId is provided
  const actualVehicleId = initialVehicleId || preSelectedVehicleId;
  const { data: preSelectedVehicle } = useQuery<Vehicle>({
    queryKey: [`/api/vehicles/${actualVehicleId}`],
    enabled: !!actualVehicleId,
  });
  
  // Fetch selected customer details if customerId is provided
  const { data: preSelectedCustomer } = useQuery<Customer>({
    queryKey: [`/api/customers/${preSelectedCustomerId}`],
    enabled: !!preSelectedCustomerId,
  });
  
  // Get today's date in YYYY-MM-DD format
  const today = format(new Date(), "yyyy-MM-dd");
  // Default end date is 3 days from start date (unless open-ended)
  const defaultEndDate = !isOpenEnded ? format(addDays(parseISO(selectedStartDate), 3), "yyyy-MM-dd") : "";
  
  // Setup form with react-hook-form and zod validation
  // When editing (initialData exists), compute isOpenEnded from endDate since API doesn't return it
  // endDate can be null, undefined, or "" (empty string) for open-ended rentals
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: initialData ? {
      ...initialData,
      isOpenEnded: !initialData.endDate,
    } : {
      vehicleId: initialVehicleId || preSelectedVehicleId || "",
      customerId: initialCustomerId || preSelectedCustomerId || "",
      driverId: null,
      startDate: selectedStartDate,
      endDate: defaultEndDate,
      startTime: undefined,
      endTime: undefined,
      isOpenEnded: isOpenEnded,
      status: "booked",
      totalPrice: 0,
      notes: "",
      fuelLevelPickup: undefined,
      fuelLevelReturn: undefined,
      fuelCost: undefined,
      fuelCardNumber: undefined,
      fuelNotes: undefined,
    },
  });
  
  // Watch for changes to calculate duration
  const startDateWatch = form.watch("startDate");
  const endDateWatch = form.watch("endDate");
  const isOpenEndedWatch = form.watch("isOpenEnded");
  const vehicleIdWatch = form.watch("vehicleId");
  const customerIdWatch = form.watch("customerId");
  const driverIdWatch = form.watch("driverId");
  const statusWatch = form.watch("status");
  
  // Fetch drivers for the selected customer (after watches are declared)
  const { data: drivers, isLoading: isLoadingDrivers, refetch: refetchDrivers } = useQuery<Driver[]>({
    queryKey: [`/api/customers/${customerIdWatch}/drivers`],
    enabled: !!customerIdWatch,
  });

  // Fetch blacklisted vehicles for the selected customer (to filter from vehicle dropdown)
  const { data: customerBlacklist = [] } = useQuery<any[]>({
    queryKey: [`/api/customers/${customerIdWatch}/blacklist`],
    enabled: !!customerIdWatch,
  });

  // Fetch blacklisted customers for the selected vehicle (to filter from customer dropdown)
  const { data: vehicleBlacklist = [] } = useQuery<any[]>({
    queryKey: [`/api/vehicles/${vehicleIdWatch}/blacklist`],
    enabled: !!vehicleIdWatch,
  });
  
  // Fetch recent damage checks for vehicle + customer (last 3)
  const { data: recentDamageChecks = [] } = useQuery<InteractiveDamageCheck[]>({
    queryKey: [`/api/interactive-damage-checks/vehicle/${vehicleIdWatch}/customer/${customerIdWatch}`],
    enabled: !!vehicleIdWatch && !!customerIdWatch
  });
  
  // Reset driverId when customer changes to prevent invalid driver-customer assignment
  useEffect(() => {
    // If there's a selected driver and it's not in the new customer's driver list, clear it
    if (driverIdWatch && drivers) {
      const isDriverValid = drivers.some(d => d.id === Number(driverIdWatch));
      if (!isDriverValid) {
        form.setValue("driverId", null, { shouldDirty: true });
      }
    }
  }, [customerIdWatch, drivers, driverIdWatch, form]);
  
  // Apply default fuel policy from settings when creating a new reservation
  // Track if we've already applied the default to avoid overwriting user changes
  const [fuelPolicyApplied, setFuelPolicyApplied] = useState(false);
  useEffect(() => {
    // Only apply for new reservations (not edit mode, not already created, and not already applied)
    if (!editMode && !createdReservationId && !initialData && !fuelPolicyApplied && businessRulesSettings?.value) {
      const policy = businessRulesSettings.value.defaultFuelPolicy || "full-to-full";
      
      if (policy === "full-to-full") {
        // Full to Full: Both pickup and return default to "Full"
        form.setValue("fuelLevelPickup", "Full");
        form.setValue("fuelLevelReturn", "Full");
        setFuelLevelPickup("Full");
        setFuelLevelReturn("Full");
      } else if (policy === "prepaid") {
        // Prepaid Full Tank: Pickup is "Full", return level doesn't matter
        form.setValue("fuelLevelPickup", "Full");
        setFuelLevelPickup("Full");
      }
      // For "same-to-same", leave undefined - user sets at pickup time
      
      setFuelPolicyApplied(true);
    }
  }, [businessRulesSettings, editMode, createdReservationId, initialData, fuelPolicyApplied, form]);
  
  // Flag to hide duplicate date fields in section 3 (dates are already handled in section 1)
  const SHOW_DUPLICATE_DATES = false;
  
  // Fetch available vehicles based on selected date range (after form watch variables are declared)
  const { data: availableVehicles, isLoading: isLoadingAvailableVehicles } = useQuery<Vehicle[]>({
    queryKey: ["/api/vehicles/available", { 
      startDate: startDateWatch, 
      endDate: endDateWatch 
    }],
    enabled: !!startDateWatch && (!isOpenEndedWatch ? !!endDateWatch : true),
  });

  // Determine which vehicles to show based on toggle and date selection
  const vehiclesToShow = useMemo(() => {
    let vehicleList: Vehicle[] = [];
    
    // If user explicitly wants to see all vehicles, show them
    if (showAllVehicles) {
      vehicleList = vehicles || [];
    }
    // If no start date selected yet, show all vehicles (initial state)
    else if (!startDateWatch) {
      vehicleList = vehicles || [];
    }
    // Once dates are selected, default to showing only available vehicles
    // For open-ended rentals, use available vehicles with just start date
    else if (isOpenEndedWatch) {
      vehicleList = availableVehicles || [];
    }
    // For date-ranged rentals, only show available vehicles if both dates are selected
    else if (startDateWatch && endDateWatch) {
      vehicleList = availableVehicles || [];
    }
    // If start date is set but end date isn't (non-open-ended), show all vehicles temporarily
    else {
      vehicleList = vehicles || [];
    }
    
    // Filter out vehicles that are blacklisted for the selected customer
    if (customerBlacklist && customerBlacklist.length > 0) {
      const blacklistedVehicleIds = new Set(customerBlacklist.map((b: any) => b.vehicleId));
      vehicleList = vehicleList.filter(v => !blacklistedVehicleIds.has(v.id));
    }
    
    return vehicleList;
  }, [vehicles, availableVehicles, showAllVehicles, startDateWatch, endDateWatch, isOpenEndedWatch, customerBlacklist]);

  // Filter customers to exclude those blacklisted for the selected vehicle
  const customersToShow = useMemo(() => {
    let customerList = customers || [];
    
    // Filter out customers that are blacklisted for the selected vehicle
    if (vehicleBlacklist && vehicleBlacklist.length > 0) {
      const blacklistedCustomerIds = new Set(vehicleBlacklist.map((b: any) => b.customerId));
      customerList = customerList.filter(c => !blacklistedCustomerIds.has(c.id));
    }
    
    return customerList;
  }, [customers, vehicleBlacklist]);

  // Find the selected vehicle and customer
  const selectedVehicle = useMemo(() => {
    if (!vehicles || !vehicleIdWatch) return null;
    return vehicles.find(v => v.id === Number(vehicleIdWatch)) || null;
  }, [vehicles, vehicleIdWatch]);
  
  const selectedCustomer = useMemo(() => {
    if (!customers || !customerIdWatch) return null;
    return customers.find(c => c.id === Number(customerIdWatch)) || null;
  }, [customers, customerIdWatch]);
  
  const selectedDriver = useMemo(() => {
    if (!drivers || !driverIdWatch) return null;
    return drivers.find(d => d.id === Number(driverIdWatch)) || null;
  }, [drivers, driverIdWatch]);
  
  // Auto-populate pickup mileage with vehicle's current mileage when vehicle is selected
  useEffect(() => {
    // Only auto-populate for new reservations (not when editing existing ones)
    if (!editMode && !createdReservationId && selectedVehicle) {
      // If vehicle has current mileage and we haven't manually set a start mileage yet
      if (selectedVehicle.currentMileage && !startMileage) {
        console.log(`🚗 Auto-populating pickup mileage with vehicle's current mileage: ${selectedVehicle.currentMileage}`);
        setStartMileage(selectedVehicle.currentMileage);
        form.setValue("pickupMileage", selectedVehicle.currentMileage);
      }
    }
  }, [selectedVehicle, editMode, createdReservationId, startMileage, form]);
  
  // Calculate rental duration
  const rentalDuration = useMemo(() => {
    if (!startDateWatch) return 1;
    if (isOpenEndedWatch) return "Open-ended";
    if (!endDateWatch) return 1;
    const start = parseISO(startDateWatch);
    const end = parseISO(endDateWatch);
    const days = differenceInDays(end, start) + 1; // Include the start day
    return days > 0 ? days : null; // null = invalid range; the date field shows the error
  }, [startDateWatch, endDateWatch, isOpenEndedWatch]);
  
  // Auto-fill total price from the vehicle's daily rate × duration, for new
  // fixed-duration reservations only. Stops as soon as the user types into the
  // price field themselves, so a manual override is never silently clobbered.
  const priceManuallyEditedRef = useRef(false);
  useEffect(() => {
    if (editMode || createdReservationId) return;
    if (priceManuallyEditedRef.current) return;
    if (typeof rentalDuration !== "number") return;
    const dailyPrice = selectedVehicle?.dailyPrice ? Number(selectedVehicle.dailyPrice) : 0;
    if (!dailyPrice) return;
    form.setValue("totalPrice", Math.round(dailyPrice * rentalDuration * 100) / 100);
  }, [selectedVehicle, rentalDuration, editMode, createdReservationId, form]);

  // Check for reservation conflicts
  const [hasOverlap, setHasOverlap] = useState(false);
  
  // Watch for status changes
  useEffect(() => {
    // Update currentStatus when status changes in the form
    if (statusWatch) {
      setCurrentStatus(statusWatch);
    }
  }, [statusWatch]);

  // Sync pickup/return data when initialData changes (e.g., after pickup dialog)
  useEffect(() => {
    if (initialData) {
      // CRITICAL: Sync isOpenEnded form value from endDate when editing
      // The API doesn't return isOpenEnded - it's computed from endDate being falsy (null, undefined, or "")
      const isOpenEndedFromData = !initialData.endDate;
      form.setValue("isOpenEnded", isOpenEndedFromData);
      setIsOpenEnded(isOpenEndedFromData);
      
      // Update mileage states
      if (initialData.pickupMileage !== undefined && initialData.pickupMileage !== startMileage) {
        setStartMileage(initialData.pickupMileage);
        form.setValue("pickupMileage", initialData.pickupMileage);
      }
      if (initialData.returnMileage !== undefined && initialData.returnMileage !== departureMileage) {
        setDepartureMileage(initialData.returnMileage);
      }
      
      // Update fuel level states
      if (initialData.fuelLevelPickup !== undefined && initialData.fuelLevelPickup !== fuelLevelPickup) {
        setFuelLevelPickup(initialData.fuelLevelPickup);
        form.setValue("fuelLevelPickup", initialData.fuelLevelPickup);
      }
      if (initialData.fuelLevelReturn !== undefined && initialData.fuelLevelReturn !== fuelLevelReturn) {
        setFuelLevelReturn(initialData.fuelLevelReturn);
        form.setValue("fuelLevelReturn", initialData.fuelLevelReturn);
      }
      
      // Update other fuel-related fields
      if (initialData.fuelCost !== undefined && initialData.fuelCost !== fuelCost) {
        setFuelCost(initialData.fuelCost);
        form.setValue("fuelCost", initialData.fuelCost);
      }
      if (initialData.fuelCardNumber !== undefined && initialData.fuelCardNumber !== fuelCardNumber) {
        setFuelCardNumber(initialData.fuelCardNumber);
        form.setValue("fuelCardNumber", initialData.fuelCardNumber);
      }
    }
  }, [initialData, form]);

  // Sync isOpenEnded state with form watch
  useEffect(() => {
    if (isOpenEndedWatch !== isOpenEnded) {
      setIsOpenEnded(!!isOpenEndedWatch);
    }
  }, [isOpenEndedWatch]);

  // Track previous open-ended state to detect user toggle
  const prevIsOpenEndedRef = useRef<boolean | undefined>(undefined);
  
  // Update end date when open-ended status changes
  useEffect(() => {
    const wasOpenEnded = prevIsOpenEndedRef.current;
    prevIsOpenEndedRef.current = isOpenEndedWatch;
    
    if (isOpenEndedWatch) {
      // Switching TO open-ended: clear the end date
      form.setValue("endDate", "");
    } else if (!form.getValues("endDate") || wasOpenEnded === true) {
      // Switching FROM open-ended to dated, or no end date set
      // Smart auto-populate: consider current date and start date
      const today = new Date();
      const startDate = parseISO(startDateWatch || selectedStartDate);
      
      let suggestedEndDate: Date;
      
      if (editMode && wasOpenEnded === true) {
        // User is converting an active open-ended rental to dated
        // Suggest today if rental already started, otherwise 3 days from start
        if (startDate <= today) {
          // Rental already started - suggest today as end date
          suggestedEndDate = today;
        } else {
          // Future rental - suggest 3 days from start
          suggestedEndDate = addDays(startDate, 3);
        }
      } else {
        // New reservation or initializing - default 3 days from start
        suggestedEndDate = addDays(startDate, 3);
      }
      
      form.setValue("endDate", format(suggestedEndDate, "yyyy-MM-dd"));
    }
  }, [isOpenEndedWatch, form, startDateWatch, selectedStartDate, editMode]);
  
  const startTimeWatch = form.watch("startTime");
  const endTimeWatch = form.watch("endTime");

  useEffect(() => {
    if (vehicleIdWatch && startDateWatch) {
      // Skip conflict checking for open-ended rentals
      if (isOpenEndedWatch) {
        setHasOverlap(false);
        return;
      }

      if (!endDateWatch) return;

      const checkConflicts = async () => {
        try {
          // Build query parameters
          const params = new URLSearchParams();
          params.append('vehicleId', vehicleIdWatch.toString());
          params.append('startDate', startDateWatch);
          // Only include endDate if it's not null/undefined (skip for open-ended rentals)
          if (endDateWatch) {
            params.append('endDate', endDateWatch);
          }
          if (startTimeWatch) {
            params.append('startTime', startTimeWatch);
          }
          if (endTimeWatch) {
            params.append('endTime', endTimeWatch);
          }
          if (initialData?.id) {
            params.append('excludeReservationId', initialData.id.toString());
          }

          const response = await fetch(`/api/reservations/check-conflicts?${params.toString()}`);
          if (response.ok) {
            const conflicts = await response.json();
            setHasOverlap(conflicts.length > 0);
          }
        } catch (error) {
          console.error("Failed to check reservation conflicts:", error);
        }
      };

      checkConflicts();
    }
  }, [vehicleIdWatch, startDateWatch, endDateWatch, isOpenEndedWatch, startTimeWatch, endTimeWatch, initialData?.id]);
  
  // Format customer options for searchable combobox (using filtered list)
  const customerOptions = useMemo(() => {
    if (!customersToShow) return [];
    return customersToShow.map(customer => {
      // Build a detailed description like vehicles show license plate
      const contactInfo = [];
      if (customer.phone) contactInfo.push(customer.phone);
      if (customer.email) contactInfo.push(customer.email);
      
      const locationInfo = [];
      if (customer.city) locationInfo.push(customer.city);
      if (customer.postalCode) locationInfo.push(customer.postalCode);
      
      let description = contactInfo.join(' • ');
      if (locationInfo.length > 0) {
        description += description ? ` • ${locationInfo.join(' ')}` : locationInfo.join(' ');
      }
      
      // Add company name as a tag if available
      const tags = [];
      if (customer.companyName) {
        tags.push(customer.companyName);
      } else if (customer.debtorNumber) {
        tags.push(`#${customer.debtorNumber}`);
      }
      
      return {
        value: customer.id.toString(),
        label: customer.name,
        description: description || undefined,
        tags: tags.length > 0 ? tags : undefined,
      };
    });
  }, [customersToShow]);
  
  // Format vehicle options for searchable combobox
  const vehicleOptions = useMemo(() => {
    if (!vehicles) return [];
    
    // Group by vehicle type
    const vehiclesByType = vehicles.reduce((acc, vehicle) => {
      const type = vehicle.vehicleType || "Other";
      if (!acc[type]) {
        acc[type] = [];
      }
      acc[type].push({
        value: vehicle.id.toString(),
        label: `${vehicle.brand} ${vehicle.model}`,
        description: formatLicensePlate(vehicle.licensePlate),
      });
      return acc;
    }, {} as Record<string, Array<{value: string, label: string, description?: string}>>);
    
    // Convert to array of groups
    return Object.entries(vehiclesByType).map(([type, options]) => ({
      label: type,
      options,
    }));
  }, [vehicles]);
  
  // Handle customer creation form
  const handleCustomerCreated = async (data: Customer) => {
    console.log("Customer created in reservation form:", data);
    
    invalidateRelatedQueries('customers');
    
    // Update form with a slight delay to ensure the revalidation has completed
    setTimeout(() => {
      // Set the new customer in the form
      if (data && data.id) {
        console.log("Setting customer ID to:", data.id);
        // Set the value and trigger form update
        form.setValue("customerId", data.id, { 
          shouldDirty: true,
          shouldTouch: true,
          shouldValidate: true
        });
      }
      
      // Close the dialog
      setCustomerDialogOpen(false);
      
      // Show success toast
      toast({
        title: "Customer Created",
        description: `${data.name} has been added and selected for this reservation.`,
      });
    }, 500); // Small delay to ensure state updates
  };
  
  // We no longer need a separate createVehicleMutation as we're using VehicleQuickForm
  // which handles all the vehicle creation logic and calls our callback directly
  
  // Handle file upload
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setDamageFile(file);
      form.setValue("damageCheckFile", file);
    }
  };
  
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(true);
  };
  
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
  };
  
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      setDamageFile(file);
      form.setValue("damageCheckFile", file);
    }
  };
  
  const removeDamageFile = () => {
    setDamageFile(null);
    form.setValue("damageCheckFile", undefined);
  };
  
  // Create or update reservation mutation
  const createReservationMutation = useMutation({
    mutationKey: ["/api/reservations"], // This enables automatic comprehensive cache invalidation
    mutationFn: async (data: z.infer<typeof formSchema>) => {
      // Check if vehicle is BV and convert to Opnaam if needed
      if (selectedVehicle && data.vehicleId) {
        const isBV = selectedVehicle.company === "true";
        
        if (isBV) {
          // Convert BV → Opnaam (required for rental insurance/tax)
          try {
            const convertResponse = await fetch(`/api/vehicles/${data.vehicleId}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                registeredTo: "true",  // Set to Opnaam
                company: "false",      // Remove BV status
                registeredToDate: new Date().toISOString().split('T')[0],
              }),
            });
            
            if (convertResponse.ok) {
              toast({
                title: "Vehicle Registration Updated",
                description: "Vehicle automatically changed from BV to Opnaam (required for rental - insurance & road tax)",
              });
              
              // Refresh vehicle data
              invalidateRelatedQueries('vehicles');
            }
          } catch (error) {
            console.error('Failed to convert vehicle from BV to Opnaam:', error);
            toast({
              title: "Warning",
              description: "Could not update vehicle registration. Please manually change from BV to Opnaam.",
              variant: "destructive",
            });
          }
        }
      }
      
      // Create FormData for file upload
      const formData = new FormData();
      
      // Add all other form data
      Object.entries(data).forEach(([key, value]) => {
        if (key !== "damageCheckFile" && value !== undefined) {
          // Allow null values for driverId (nullable field)
          if (value === null) {
            formData.append(key, '');
          } else {
            formData.append(key, String(value));
          }
        }
      });
      
      // Add file if present
      if (data.damageCheckFile) {
        formData.append("damageCheckFile", data.damageCheckFile);
      }
      
      // Use FormData for the request. We handle the admin-password override
      // protocol manually here because this path uses raw fetch (not apiRequest)
      // to support multipart file upload.
      const sendRequest = async (overridePassword?: string) => {
        if (overridePassword) {
          formData.set("adminPasswordOverride", overridePassword);
        } else {
          formData.delete("adminPasswordOverride");
        }
        return fetch(
          editMode ? `/api/reservations/${initialData?.id}` : "/api/reservations",
          {
            method: editMode ? "PATCH" : "POST",
            body: formData,
          },
        );
      };

      let response = await sendRequest();

      // Handle admin-password override challenge (old rentals, non-admin user).
      if (response.status === 403) {
        try {
          const cloned = response.clone();
          const errJson = await cloned.json();
          const code = errJson?.code;
          if (code === "ADMIN_PASSWORD_REQUIRED" || code === "INVALID_ADMIN_PASSWORD") {
            const { promptForAdminPassword } = await import("@/lib/admin-password-prompt");
            let attempts = 0;
            let errorMessage =
              code === "INVALID_ADMIN_PASSWORD"
                ? "Incorrect admin password. Please try again."
                : undefined;
            while (attempts < 3) {
              attempts++;
              const pwd = await promptForAdminPassword({ errorMessage });
              if (!pwd) {
                throw new Error("Admin password required to edit old reservation");
              }
              response = await sendRequest(pwd);
              if (response.status !== 403) break;
              try {
                const c2 = response.clone();
                const e2 = await c2.json();
                if (e2?.code !== "INVALID_ADMIN_PASSWORD") break;
                errorMessage = "Incorrect admin password. Please try again.";
              } catch {
                break;
              }
            }
          }
        } catch (overrideErr) {
          // If we threw above (user cancelled), re-throw to abort save.
          if (overrideErr instanceof Error && overrideErr.message.includes("Admin password required")) {
            throw overrideErr;
          }
          // Otherwise fall through to normal error handling below.
        }
      }

      if (!response.ok) {
        // Try to get the error message from the response
        let errorMessage = "Failed to save reservation";
        try {
          const contentType = response.headers.get("content-type");
          if (contentType && contentType.includes("application/json")) {
            const errorData = await response.json();
            
            // Check if this is an overdue error from the backend
            if (errorData.isOverdueError && errorData.overdueReservations) {
              // Create a custom error with the overdue data
              const error = new Error(errorData.message || "Overdue reservations found") as any;
              error.isOverdueError = true;
              error.overdueReservations = errorData.overdueReservations;
              throw error;
            }
            
            errorMessage = errorData.message || errorMessage;
          } else {
            errorMessage = `${errorMessage}: ${response.status} ${response.statusText}`;
          }
        } catch (parseError: any) {
          // If this is our overdue error, rethrow it
          if (parseError.isOverdueError) {
            throw parseError;
          }
          // If we can't parse the error response, use the status text
          errorMessage = `${errorMessage}: ${response.status} ${response.statusText}`;
        }
        throw new Error(errorMessage);
      }
      
      return await response.json();
    },
    onSuccess: async (data) => {
      console.log('🎉 onSuccess called with data:', data);
      
      // Set the created reservation ID FIRST to enable contract generation immediately
      if (data && data.id) {
        console.log('✅ Setting createdReservationId to:', data.id);
        setCreatedReservationId(data.id);
        console.log('✅ createdReservationId set successfully');
      } else {
        console.log('⚠️ No data.id in response:', data);
      }
      
      // Save selections to recent items
      if (vehicleIdWatch) {
        saveToRecent('recentVehicles', vehicleIdWatch.toString());
      }
      if (form.watch("customerId")) {
        saveToRecent('recentCustomers', form.watch("customerId").toString());
      }
      
      // Use comprehensive cache invalidation - this will invalidate ALL reservation queries
      // including /api/reservations/range that the calendar uses
      await invalidateByPrefix('/api/reservations');
      await invalidateByPrefix('/api/vehicles');
      
      
      
      // Check if we need to trigger pickup/return dialog (using ref for immediate access)
      const pendingStatusChange = pendingStatusChangeRef.current;
      console.log('🔍 Checking pendingStatusChange:', pendingStatusChange, 'data.id:', data?.id);
      if (pendingStatusChange && data && data.id) {
        // Prepare the reservation data for the dialog
        const reservationForDialog: Reservation = {
          ...data,
          vehicle: selectedVehicle || undefined,
          customer: selectedCustomer || undefined,
        };
        
        // Reset the pending status change ref first
        pendingStatusChangeRef.current = null;
        
        if (pendingStatusChange === "picked_up") {
          // Check if parent wants to handle pickup dialog (for nested dialog cases)
          if (onTriggerPickupDialog) {
            console.log('🔓 Delegating pickup dialog to parent');
            toast({
              title: "Opening Pickup Dialog",
              description: "Please complete the pickup details (contract number, mileage, fuel level).",
            });
            onTriggerPickupDialog(reservationForDialog);
            return; // Parent will handle the dialog
          }
          
          // Fallback to local dialog management
          setPendingDialogReservation(reservationForDialog);
          console.log('🔓 Notifying parent: pickup dialog opening');
          onPickupReturnDialogChange?.(true);
          
          toast({
            title: "Opening Pickup Dialog",
            description: "Please complete the pickup details (contract number, mileage, fuel level).",
          });
          setPickupDialogOpen(true);
          console.log('✅ pickupDialogOpen set to true');
        } else if (pendingStatusChange === "returned") {
          // Check if parent wants to handle return dialog
          if (onTriggerReturnDialog) {
            console.log('🔓 Delegating return dialog to parent');
            toast({
              title: "Opening Return Dialog",
              description: "Please complete the return details (mileage, fuel level, damage check).",
            });
            onTriggerReturnDialog(reservationForDialog);
            return; // Parent will handle the dialog
          }
          
          // Fallback to local dialog management
          setPendingDialogReservation(reservationForDialog);
          console.log('🔓 Notifying parent: return dialog opening');
          onPickupReturnDialogChange?.(true);
          
          toast({
            title: "Opening Return Dialog",
            description: "Please complete the return details (mileage, fuel level, damage check).",
          });
          setReturnDialogOpen(true);
          console.log('✅ returnDialogOpen set to true');
        }
        
        return; // Don't run the onSuccess callback or navigate yet - dialog will handle it
      }
      
      // Show success message (only if no dialog was triggered)
      toast({
        title: `Reservation ${editMode ? "updated" : "created"} successfully`,
        description: `Reservation for ${selectedVehicle?.brand} ${selectedVehicle?.model} has been ${editMode ? "updated" : "created"}.`
      });
      
      invalidateRelatedQueries('reservations');
      
      // If onSuccess callback is provided, use it instead of navigating
      if (onSuccess) {
        onSuccess(data);
      } else {
        // Default navigation behavior when no callback is provided
        if (editMode && initialData?.id) {
          // Navigate to reservation details page
          navigate(`/reservations/${initialData.id}`);
        } else {
          // For new reservations, DON'T navigate away immediately
          // Keep the form open so user can generate and save the contract
          // Only navigate if user clicks Cancel button
          // navigate("/reservations"); // Removed - keep form open
        }
      }
    },
    onError: (error: any) => {
      // Check if this is an overdue error from the backend
      if (error.isOverdueError && error.overdueReservations) {
        setOverdueReservations(error.overdueReservations);
        setOverdueDialogOpen(true);
        // Note: pendingFormData should already be set from the form's onSubmit
        return;
      }
      
      toast({
        title: "Error",
        description: `Failed to ${editMode ? "update" : "create"} reservation: ${error.message}`,
        variant: "destructive",
      });
    },
  });
  
  // Update vehicle mileage mutation 
  const updateVehicleMutation = useMutation({
    mutationFn: async (vehicleData: { id: number, departureMileage?: number, currentMileage?: number }) => {
      // Only include properties that are defined
      const updateData: any = {};
      if (vehicleData.departureMileage !== undefined) {
        updateData.departureMileage = vehicleData.departureMileage;
      }
      if (vehicleData.currentMileage !== undefined) {
        updateData.currentMileage = vehicleData.currentMileage;
      }
      
      return await apiRequest("PATCH", `/api/vehicles/${vehicleData.id}`, updateData);
    },
    onSuccess: () => {
      invalidateRelatedQueries('vehicles');
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Failed to update vehicle mileage: ${error.message}`,
        variant: "destructive",
      });
    }
  });

  // Process the actual submission
  const processSubmission = async (data: z.infer<typeof formSchema>) => {
    try {
      // Store the form data in case backend returns an overdue error
      setPendingFormData(data);
      
      // Check if user wants to set status to picked_up or returned
      // These require the proper dialogs for data entry (contract number, mileage, fuel, damage check)
      const intendedStatus = data.status || "booked";
      const currentReservationStatus = initialData?.status || "booked";
      
      // Determine if we need to trigger a pickup/return dialog after save
      let statusForSave = intendedStatus;
      let triggerDialog: "picked_up" | "returned" | null = null;
      
      if (intendedStatus === "picked_up" && currentReservationStatus !== "picked_up") {
        // User wants picked_up but current status is not picked_up
        // Save as "booked" first, then trigger pickup dialog
        statusForSave = editMode ? currentReservationStatus : "booked";
        triggerDialog = "picked_up";
      } else if (intendedStatus === "returned" && currentReservationStatus !== "returned" && currentReservationStatus !== "completed") {
        // User wants returned but current status is not returned or completed
        // Save current status first, then trigger return dialog
        statusForSave = editMode ? currentReservationStatus : "booked";
        triggerDialog = "returned";
      }
      
      // Store the pending status change for onSuccess to handle (using ref for immediate access)
      console.log('🔧 Setting pendingStatusChangeRef to:', triggerDialog);
      pendingStatusChangeRef.current = triggerDialog;
      
      // Prepare submission data for both edit and create modes
      // IMPORTANT: Use null (not undefined) for open-ended rentals
      // undefined values are omitted from JSON, so backend wouldn't receive the update
      const submissionData: any = {
        ...data,
        endDate: data.isOpenEnded ? null : (data.endDate || null),
        status: statusForSave,
      };
      delete submissionData.isOpenEnded;
      // Contract number is normally assigned during pickup; it's only editable
      // in this form when editing an already picked-up/completed reservation.
      const allowContractEdit =
        editMode &&
        (currentReservationStatus === "picked_up" ||
          currentReservationStatus === "completed");
      if (!allowContractEdit) {
        delete submissionData.contractNumber;
      } else if (typeof submissionData.contractNumber === "string") {
        submissionData.contractNumber = submissionData.contractNumber.trim() || null;
      }
      
      createReservationMutation.mutate(submissionData);
    } catch (error) {
      console.error("Error in processSubmission:", error);
      toast({
        title: "Error",
        description: "An error occurred while processing your request",
        variant: "destructive",
      });
    }
  };

  // Check for overdue reservations before submitting
  const checkOverdueReservations = async (vehicleId: number): Promise<Reservation[]> => {
    try {
      const response = await fetch(`/api/reservations/overdue/${vehicleId}`);
      if (!response.ok) {
        console.error("Failed to check overdue reservations");
        return [];
      }
      return await response.json();
    } catch (error) {
      console.error("Error checking overdue reservations:", error);
      return [];
    }
  };

  // Handle reservation form submission
  const onSubmit = async (data: z.infer<typeof formSchema>) => {
    try {
      console.log("✅ Form submitted successfully, data:", data);
      
      // Skip overdue check when editing an existing reservation
      if (!editMode) {
        const vehicleId = Number(data.vehicleId);
        if (vehicleId) {
          const overdue = await checkOverdueReservations(vehicleId);
          if (overdue.length > 0) {
            // Store the form data and show the dialog
            setPendingFormData(data);
            setOverdueReservations(overdue);
            setOverdueDialogOpen(true);
            return; // Don't proceed with submission yet
          }
        }
      }
      
      // Contract number is optional when creating reservation
      // It will be assigned/validated during pickup
      await processSubmission(data);
    } catch (error) {
      console.error("Error in onSubmit:", error);
      toast({
        title: "Error",
        description: "An error occurred while processing your request",
        variant: "destructive",
      });
    }
  };
  
  // Log form errors when they change
  useEffect(() => {
    const errors = form.formState.errors;
    if (Object.keys(errors).length > 0) {
      console.error("❌ Form validation errors:", errors);
    }
  }, [form.formState.errors]);
  
  return (
    <>
    <Card>
      <CardHeader>
        <CardTitle>{editMode ? "Edit Reservation" : "Create New Reservation"}</CardTitle>
        <CardDescription>
          {editMode 
            ? "Update the reservation details below" 
            : "Enter the details for a new reservation"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form
            onSubmit={(e) => {
              // Guard against submit events bubbling up from nested portaled forms
              // (e.g. the Quick Add Driver dialog or Customer dialog forms). Their
              // submit events propagate through React's synthetic event tree to this
              // form even though they're rendered in DOM portals — without this guard,
              // saving a driver would inadvertently submit the reservation form and
              // close the entire dialog.
              if (e.target !== e.currentTarget) {
                return;
              }
              form.handleSubmit(onSubmit)(e);
            }}
            className="space-y-6"
          >
            {/* Date Selection Section - Now First */}
            <div className="space-y-6">
              <div className="text-lg font-medium">1. Select Rental Dates</div>
              <div className="text-sm text-muted-foreground">
                Choose your rental dates first to see only available vehicles and avoid booking conflicts.
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Start Date */}
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
                          onChange={(e) => {
                            field.onChange(e);
                            setSelectedStartDate(e.target.value);
                          }}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                {/* Open-ended rental checkbox */}
                <FormField
                  control={form.control}
                  name="isOpenEnded"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                      <FormControl>
                        <Checkbox
                          data-testid="checkbox-open-ended-rental"
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                      <div className="space-y-1 leading-none">
                        <FormLabel>
                          Open-ended rental
                        </FormLabel>
                        <FormDescription>
                          Check this if the return date is not yet known
                        </FormDescription>
                      </div>
                    </FormItem>
                  )}
                />

                {/* End Date - only show if not open-ended */}
                {!isOpenEndedWatch && (
                  <FormField
                    control={form.control}
                    name="endDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>End Date</FormLabel>
                        <FormControl>
                          <Input 
                            data-testid="input-end-date"
                            type="date" 
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Pickup Time */}
                <FormField
                  control={form.control}
                  name="startTime"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Pickup Time <span className="text-muted-foreground font-normal">(optional)</span></FormLabel>
                      <FormControl>
                        <Input
                          type="time"
                          data-testid="input-start-time"
                          {...field}
                          value={field.value ?? ""}
                        />
                      </FormControl>
                      <FormDescription>Lets same-day handovers with another rental be scheduled without a false conflict</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Return Time - only meaningful when there's an end date */}
                {!isOpenEndedWatch && (
                  <FormField
                    control={form.control}
                    name="endTime"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Return Time <span className="text-muted-foreground font-normal">(optional)</span></FormLabel>
                        <FormControl>
                          <Input
                            type="time"
                            data-testid="input-end-time"
                            {...field}
                            value={field.value ?? ""}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
              </div>

              {/* Duration display */}
              <div className="text-sm text-muted-foreground">
                {startDateWatch && rentalDuration !== null && (
                  <div className="flex items-center gap-2">
                    <span>Duration:</span>
                    <Badge variant="outline" className="text-xs">
                      {rentalDuration === "Open-ended" ? "Open-ended" : `${rentalDuration} day${rentalDuration !== 1 ? 's' : ''}`}
                    </Badge>
                  </div>
                )}
              </div>
            </div>
            <Separator />

            {/* Vehicle and Customer Selection Section - Now Second */}
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <div>
                  <div className="text-lg font-medium">
                    {actualVehicleId ? "2. Selected Vehicle & Customer" : "2. Select Vehicle and Customer"}
                  </div>
                  {!showAllVehicles && startDateWatch && (
                    <div className="text-sm text-green-600 mt-1">
                      Showing only available vehicles for your selected dates
                    </div>
                  )}
                </div>
                {!actualVehicleId && (
                  <div className="flex items-center gap-2">
                    <Checkbox
                      data-testid="checkbox-show-all-vehicles"
                      checked={showAllVehicles}
                      onCheckedChange={(checked) => setShowAllVehicles(checked === true)}
                    />
                    <label htmlFor="show-all-vehicles" className="text-sm text-muted-foreground cursor-pointer">
                      Show all vehicles (for long-term rentals)
                    </label>
                  </div>
                )}
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Vehicle Selection - Show read-only or selection based on preSelectedVehicleId */}
                <FormField
                  control={form.control}
                  name="vehicleId"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      {actualVehicleId ? (
                        // If vehicle is pre-selected, show as read-only with simple label
                        <>
                          <FormLabel>Vehicle</FormLabel>
                          <ReadonlyVehicleDisplay vehicleId={actualVehicleId} />
                        </>
                      ) : (
                        // Otherwise, show selection UI with buttons inline
                        <>
                          <div className="flex justify-between items-center">
                            <FormLabel>Vehicle</FormLabel>
                            <div className="flex gap-2">
                              {/* Edit Vehicle Button - only show if vehicle is selected */}
                              {vehicleIdWatch && (
                                <Dialog open={vehicleEditDialogOpen} onOpenChange={setVehicleEditDialogOpen}>
                                  <DialogTrigger asChild>
                                    <Button variant="outline" size="sm">
                                      <Edit className="h-3.5 w-3.5 mr-1" />
                                      Edit
                                    </Button>
                                  </DialogTrigger>
                                <DialogContent className="sm:max-w-[650px] max-h-[90vh] overflow-y-auto">
                                  <DialogHeader>
                                    <DialogTitle>Edit Vehicle</DialogTitle>
                                    <DialogDescription>
                                      Edit the details of the selected vehicle
                                    </DialogDescription>
                                  </DialogHeader>
                                  {selectedVehicle && (
                                    <VehicleForm 
                                      editMode={true}
                                      initialData={selectedVehicle}
                                      redirectToList={false}
                                      onSubmitOverride={async (data) => {
                                        try {
                                          // Update the vehicle using API
                                          const response = await apiRequest("PATCH", `/api/vehicles/${selectedVehicle.id}`, data);
                                          const updatedVehicle = await response.json();
                                          
                                          // Refresh vehicles list to show updated data
                                          await refetchVehicles();
                                          
                                              // The vehicle selector will automatically show updated data after cache refresh
                                          
                                          // Close the dialog
                                          setVehicleEditDialogOpen(false);
                                          
                                          // Show success message
                                          toast({
                                            title: "Vehicle Updated",
                                            description: `${updatedVehicle.brand} ${updatedVehicle.model} has been successfully updated.`,
                                          });
                                        } catch (error) {
                                          console.error("Failed to update vehicle:", error);
                                          toast({
                                            title: "Error",
                                            description: "Failed to update vehicle. Please try again.",
                                            variant: "destructive",
                                          });
                                        }
                                      }}
                                    />
                                  )}
                                </DialogContent>
                              </Dialog>
                            )}
                            
                            <Dialog open={vehicleDialogOpen} onOpenChange={setVehicleDialogOpen}>
                              <DialogTrigger asChild>
                                <Button variant="outline" size="sm">
                                  <PlusCircle className="h-3.5 w-3.5 mr-1" />
                                  Add New
                                </Button>
                              </DialogTrigger>
                              <DialogContent className="sm:max-w-[650px] max-h-[90vh] overflow-y-auto">
                                <DialogHeader>
                                  <DialogTitle>Add New Vehicle</DialogTitle>
                                  <DialogDescription>
                                    Create a new vehicle to add to the reservation
                                  </DialogDescription>
                                </DialogHeader>
                                <div className="py-4">
                                  {/* Import the VehicleQuickForm component */}
                                  <VehicleQuickForm 
                                    onSuccess={async (vehicle) => {
                                      // Refresh the vehicles list to include the new vehicle
                                      await refetchVehicles();
                                      
                                      // Set the new vehicle in the form
                                      form.setValue("vehicleId", vehicle.id);
                                      
                                      // Close the dialog
                                      setVehicleDialogOpen(false);
                                      
                                      // Show success message
                                      toast({
                                        title: "Vehicle Added",
                                        description: `${vehicle.brand} ${vehicle.model} has been added to your fleet and selected for this reservation.`,
                                      });
                                    }}
                                    onCancel={() => setVehicleDialogOpen(false)}
                                  />
                                </div>
                              </DialogContent>
                            </Dialog>
                            </div>
                          </div>
                          
                          <FormControl>
                            <VehicleSelector
                              vehicles={vehiclesToShow}
                              value={field.value ? field.value.toString() : ''}
                              onChange={(value) => {
                                // Check if the selected vehicle has remarks
                                const vehicle = vehicles?.find(v => v.id.toString() === value);
                                if (vehicle?.remarks && vehicle.remarks.trim() !== '') {
                                  // Show warning dialog first
                                  setPendingVehicleSelection({ vehicle, fieldOnChange: field.onChange });
                                  setVehicleRemarksWarningOpen(true);
                                } else {
                                  // No remarks, proceed normally
                                  field.onChange(value);
                                  if (value) {
                                    saveToRecent('recentVehicles', value);
                                  }
                                }
                              }}
                              placeholder="Search and select a vehicle..."
                              recentVehicleIds={recentVehicles}
                            />
                          </FormControl>
                          
                          {selectedVehicle && !actualVehicleId && (
                            <div className="mt-2 text-sm bg-muted p-2 rounded-md">
                              <div className="font-medium flex items-center gap-2">
                                <span className="bg-primary-100 text-primary-800 px-2 py-1 rounded text-xs font-semibold">
                                  {formatLicensePlate(selectedVehicle.licensePlate)}
                                </span>
                                <span>{selectedVehicle.brand} {selectedVehicle.model}</span>
                              </div>
                              <div className="mt-2 flex flex-wrap items-center gap-2">
                                {selectedVehicle.vehicleType && (
                                  <Badge variant="outline" className="text-xs">{selectedVehicle.vehicleType}</Badge>
                                )}
                                {selectedVehicle.fuel && (
                                  <Badge variant="outline" className="text-xs">{selectedVehicle.fuel}</Badge>
                                )}
                                {selectedVehicle.apkDate && (() => {
                                  const apkExpired = differenceInDays(new Date(selectedVehicle.apkDate), new Date()) < 0;
                                  return (
                                    <Badge
                                      variant="outline"
                                      className={apkExpired
                                        ? "bg-red-50 text-red-800 border-red-200 text-xs"
                                        : "bg-blue-50 text-blue-800 border-blue-200 text-xs"}
                                    >
                                      APK: {new Date(selectedVehicle.apkDate).toLocaleDateString()}
                                      {apkExpired && " (expired)"}
                                    </Badge>
                                  );
                                })()}
                              </div>
                              {selectedVehicle.apkDate && differenceInDays(new Date(selectedVehicle.apkDate), new Date()) < 0 && (
                                <div className="mt-2 flex items-start gap-2 bg-red-50 border border-red-200 text-red-800 rounded-md p-2 text-xs">
                                  <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                                  <span>
                                    This vehicle's APK (roadworthiness inspection) expired on{" "}
                                    {new Date(selectedVehicle.apkDate).toLocaleDateString()}. Confirm it's safe and legal to rent out before proceeding.
                                  </span>
                                </div>
                              )}
                            </div>
                          )}
                        </>
                      )}
                      
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                {/* Customer Selection */}
                <FormField
                  control={form.control}
                  name="customerId"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <div className="flex justify-between items-center">
                        <FormLabel>Customer</FormLabel>
                        <div className="flex gap-2">
                          {/* Edit Customer Button - only show if customer is selected */}
                          {customerIdWatch && (
                            <Dialog open={customerEditDialogOpen} onOpenChange={setCustomerEditDialogOpen}>
                              <DialogTrigger asChild>
                                <Button variant="outline" size="sm">
                                  <Edit className="h-3.5 w-3.5 mr-1" />
                                  Edit
                                </Button>
                              </DialogTrigger>
                              <DialogContent className="sm:max-w-[650px] max-h-[90vh] overflow-y-auto">
                                <DialogHeader>
                                  <DialogTitle>Edit Customer</DialogTitle>
                                  <DialogDescription>
                                    Edit the details of the selected customer
                                  </DialogDescription>
                                </DialogHeader>
                                {selectedCustomer && (
                                  <CustomerForm 
                                    initialData={selectedCustomer}
                                    editMode={true}
                                    redirectToList={false}
                                    onSuccess={async (updatedCustomer) => {
                                      // Refresh customers list to show updated data
                                      invalidateRelatedQueries('customers');
                                      
                                      // The customer selector will automatically show updated data after cache refresh
                                      
                                      // Close the dialog
                                      setCustomerEditDialogOpen(false);
                                      
                                      // Show success message
                                      toast({
                                        title: "Customer Updated",
                                        description: `${updatedCustomer.name} has been successfully updated.`,
                                      });
                                    }}
                                  />
                                )}
                              </DialogContent>
                            </Dialog>
                          )}
                          
                          <Dialog open={customerDialogOpen} onOpenChange={setCustomerDialogOpen}>
                            <DialogTrigger asChild>
                              <Button variant="outline" size="sm">
                                <PlusCircle className="h-3.5 w-3.5 mr-1" />
                                Add New
                              </Button>
                            </DialogTrigger>
                          <DialogContent className="sm:max-w-[650px] max-h-[90vh] overflow-y-auto">
                            <DialogHeader>
                              <DialogTitle>Add New Customer</DialogTitle>
                              <DialogDescription>
                                Create a new customer to add to the reservation
                              </DialogDescription>
                            </DialogHeader>
                            <CustomerForm 
                              onSuccess={handleCustomerCreated} 
                              redirectToList={false} 
                            />
                          </DialogContent>
                        </Dialog>
                        </div>
                      </div>
                      <FormControl>
                        <SearchableCombobox
                          options={customerOptions}
                          value={field.value ? field.value.toString() : ''}
                          onChange={(value) => {
                            console.log("Customer selected:", value);
                            // Force form update with the new customer ID
                            form.setValue("customerId", parseInt(value), {
                              shouldDirty: true,
                              shouldTouch: true,
                              shouldValidate: true
                            });
                          }}
                          placeholder="Search and select a customer..."
                          searchPlaceholder="Search by name, phone, or city..."
                          groups={false}
                          recentValues={recentCustomers}
                        />
                      </FormControl>
                      <FormMessage />
                      {selectedCustomer && (
                        <div className="mt-2 text-sm bg-muted p-2 rounded-md">
                          {/* Name and Company Information */}
                          <div className="font-medium flex items-center gap-2 mb-1">
                            {selectedCustomer.debtorNumber && (
                              <span className="bg-green-100 text-green-800 px-2 py-1 rounded text-xs font-semibold">
                                #{selectedCustomer.debtorNumber}
                              </span>
                            )}
                            <span>{selectedCustomer.name}</span>
                          </div>
                          
                          {selectedCustomer.companyName && (
                            <div className="flex items-center gap-1 mb-1">
                              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground">
                                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                                <circle cx="12" cy="7" r="4"></circle>
                              </svg>
                              <span className="text-muted-foreground">Company:</span>
                              <span>{selectedCustomer.companyName}</span>
                            </div>
                          )}
                          
                          {/* Contact Information */}
                          {selectedCustomer.phone && (
                            <div className="flex items-center gap-1">
                              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground">
                                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
                              </svg>
                              <span>{selectedCustomer.phone}</span>
                            </div>
                          )}
                          {selectedCustomer.email && (
                            <div className="flex items-center gap-1">
                              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground">
                                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                                <polyline points="22,6 12,13 2,6"></polyline>
                              </svg>
                              <span>{selectedCustomer.email}</span>
                            </div>
                          )}
                          
                          {/* Address Information if available */}
                          {(selectedCustomer.address || selectedCustomer.city) && (
                            <div className="flex items-start gap-1 mt-1">
                              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground mt-0.5">
                                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                                <circle cx="12" cy="10" r="3"/>
                              </svg>
                              <span>
                                {selectedCustomer.address && <span>{selectedCustomer.address}</span>}
                                {selectedCustomer.address && selectedCustomer.city && <span>, </span>}
                                {selectedCustomer.city && <span>{selectedCustomer.city}</span>}
                              </span>
                            </div>
                          )}
                        </div>
                      )}
                    </FormItem>
                  )}
                />
                
                {/* Driver Selection - only show when customer is selected */}
                {customerIdWatch && (
                  <FormField
                    control={form.control}
                    name="driverId"
                    render={({ field }) => (
                      <FormItem className="flex flex-col">
                        <div className="flex justify-between items-center">
                          <FormLabel>Authorized Driver (Optional)</FormLabel>
                          <DriverDialog 
                            customerId={Number(customerIdWatch)}
                            onSuccess={async (createdDriverId) => {
                              // Refetch drivers to get the updated list
                              await refetchDrivers();
                              
                              // Auto-select the newly created driver
                              if (createdDriverId) {
                                form.setValue("driverId", createdDriverId, {
                                  shouldDirty: true,
                                  shouldTouch: true,
                                  shouldValidate: true
                                });
                              }
                            }}
                          >
                            <Button type="button" variant="outline" size="sm" data-testid="button-quick-add-driver">
                              <PlusCircle className="h-3.5 w-3.5 mr-1" />
                              Quick Add Driver
                            </Button>
                          </DriverDialog>
                        </div>
                        <FormControl>
                          <DriverSearchCombobox
                            value={field.value}
                            drivers={drivers || []}
                            isLoading={isLoadingDrivers}
                            onSelect={(value) => {
                              form.setValue("driverId", value, {
                                shouldDirty: true,
                                shouldTouch: true,
                                shouldValidate: true
                              });
                            }}
                          />
                        </FormControl>
                        <FormMessage />
                        {selectedDriver && (
                          <div className="mt-2 text-sm bg-muted p-2 rounded-md">
                            <div className="flex items-center justify-between mb-1">
                              <div className="font-medium flex items-center gap-2">
                                <span>{selectedDriver.displayName || `${selectedDriver.firstName} ${selectedDriver.lastName}`.trim()}</span>
                                {selectedDriver.isPrimaryDriver && (
                                  <Badge variant="default" className="text-xs">Primary Driver</Badge>
                                )}
                              </div>
                              <DriverDialog
                                customerId={Number(customerIdWatch)}
                                driver={selectedDriver}
                                onSuccess={async () => {
                                  invalidateByPrefix(`/api/customers/${customerIdWatch}/drivers`);
                                }}
                              >
                                <Button type="button" variant="ghost" size="sm" className="h-6 px-2">
                                  <Edit className="h-3 w-3 mr-1" />
                                  Edit
                                </Button>
                              </DriverDialog>
                            </div>
                            <div className="flex items-center gap-1 text-muted-foreground">
                              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
                              </svg>
                              <span>{selectedDriver.phone || 'No phone'}</span>
                            </div>
                            {selectedDriver.email && (
                              <div className="flex items-center gap-1 text-muted-foreground mt-1">
                                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <rect width="20" height="14" x="2" y="7" rx="2" ry="2"></rect>
                                  <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"></path>
                                </svg>
                                <span>{selectedDriver.email}</span>
                              </div>
                            )}
                            {selectedDriver.driverLicenseNumber && (
                              <div className="flex items-center gap-1 text-muted-foreground mt-1">
                                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <rect width="20" height="14" x="2" y="5" rx="2"/>
                                  <line x1="2" x2="22" y1="10" y2="10"/>
                                </svg>
                                <span className="text-muted-foreground">License:</span>
                                <span>{selectedDriver.driverLicenseNumber}</span>
                              </div>
                            )}
                          </div>
                        )}
                      </FormItem>
                    )}
                  />
                )}
              </div>
              <Separator />
            </div>

            {/* Rental period recap (dates were already selected in section 1 above) */}
            <div className="space-y-6">
              {SHOW_DUPLICATE_DATES && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {/* Start Date */}
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
                          onChange={(e) => {
                            field.onChange(e);
                            setSelectedStartDate(e.target.value);
                          }}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                {/* Open-ended rental checkbox */}
                <FormField
                  control={form.control}
                  name="isOpenEnded"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                      <FormControl>
                        <Checkbox
                          data-testid="checkbox-open-ended-rental"
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                      <div className="space-y-1 leading-none">
                        <FormLabel>
                          Open-ended rental
                        </FormLabel>
                        <FormDescription>
                          Check this if the return date is not yet known
                        </FormDescription>
                      </div>
                    </FormItem>
                  )}
                />

                {/* End Date - only show if not open-ended */}
                {!isOpenEndedWatch && (
                  <FormField
                    control={form.control}
                    name="endDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>End Date</FormLabel>
                        <FormControl>
                          <Input 
                            data-testid="input-end-date"
                            type="date" 
                            min={startDateWatch} 
                            {...field} 
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
                
                {/* Duration Indicator */}
                <div className="flex flex-col justify-end">
                  <FormLabel className="mb-2 opacity-0">Duration</FormLabel>
                  <div className="border rounded-md h-10 flex items-center px-3 bg-muted">
                    <span className="font-medium">{rentalDuration ?? '—'}</span>
                    {typeof rentalDuration === 'number' && (
                      <span className="ml-1 text-muted-foreground">
                        {rentalDuration === 1 ? "day" : "days"}
                      </span>
                    )}
                  </div>
                </div>
                </div>
              )}
              
              {/* Date Summary - Read-only display of dates selected above */}
              <div className="bg-muted/30 rounded-lg p-4 space-y-2">
                <div className="text-sm font-medium text-muted-foreground">Rental Period (selected above):</div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
                  <div>
                    <span className="font-medium">Start Date:</span> {startDateWatch || 'Not selected'}
                  </div>
                  <div>
                    <span className="font-medium">End Date:</span> {isOpenEndedWatch ? 'Open-ended' : (endDateWatch || 'Not selected')}
                  </div>
                  <div>
                    <span className="font-medium">Duration:</span> {rentalDuration ?? '—'}
                    {typeof rentalDuration === 'number' && (
                      <span className="ml-1">
                        {rentalDuration === 1 ? "day" : "days"}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <Separator />
            </div>
            
            {/* Status and Price Section */}
            <div className="space-y-6">
              <div className="text-lg font-medium">3. Reservation Details</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Status - Made more prominent */}
                <FormField
                  control={form.control}
                  name="status"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-base font-medium">Reservation Status</FormLabel>
                      <Select 
                        onValueChange={field.onChange} 
                        defaultValue={field.value}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger className="h-12 text-base">
                            <SelectValue placeholder="Select status" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="booked">Booked</SelectItem>
                          <SelectItem value="picked_up">Picked Up</SelectItem>
                          {editMode && (
                            <>
                              <SelectItem value="returned">Returned</SelectItem>
                              <SelectItem value="completed">Completed</SelectItem>
                              <SelectItem value="cancelled">Cancelled</SelectItem>
                            </>
                          )}
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        Update the reservation status as needed
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                {/* Contract Number - editable when reservation has been picked up */}
                {editMode && (currentStatus === "picked_up" || currentStatus === "completed") && (
                  <FormField
                    control={form.control}
                    name="contractNumber"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-base font-medium">Contract Number</FormLabel>
                        <FormControl>
                          <Input
                            type="text"
                            placeholder="Enter contract number"
                            {...field}
                            value={field.value ?? ""}
                            className="h-12 text-base"
                            data-testid="input-edit-form-contract-number"
                          />
                        </FormControl>
                        <FormDescription>
                          Edit the contract number assigned at pickup. Must be unique.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                {/* Mileage When Returned - only when status is completed */}
                {currentStatus === "completed" && (
                  <div className="col-span-1">
                    <div className="flex flex-col space-y-1.5">
                      <label htmlFor="departureMileage" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                        Mileage When Returned
                      </label>
                      <input
                        id="departureMileage"
                        type="number"
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                        placeholder="Enter the final mileage"
                        value={departureMileage || ""}
                        onChange={(e) => {
                          const value = parseInt(e.target.value) || undefined;
                          setDepartureMileage(value);
                          form.setValue("departureMileage", value as any);
                        }}
                      />
                      <p className="text-[0.8rem] text-muted-foreground">
                        Enter the vehicle's odometer reading when it was returned
                      </p>
                    </div>
                  </div>
                )}
                
                {currentStatus === "completed" && (
                  <FormField
                    control={form.control}
                    name="fuelLevelReturn"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Fuel Level at Return</FormLabel>
                        <Select 
                          onValueChange={(value) => {
                            const newValue = value === "not_recorded" ? undefined : value;
                            field.onChange(newValue);
                            setFuelLevelReturn(newValue);
                          }} 
                          value={field.value || "not_recorded"}
                        >
                          <FormControl>
                            <SelectTrigger data-testid="select-fuel-level-return">
                              <SelectValue placeholder="Select fuel level" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="not_recorded">Not recorded</SelectItem>
                            <SelectItem value="Empty">Empty</SelectItem>
                            <SelectItem value="1/4">1/4</SelectItem>
                            <SelectItem value="1/2">1/2</SelectItem>
                            <SelectItem value="3/4">3/4</SelectItem>
                            <SelectItem value="Full">Full</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormDescription>
                          Record the fuel level when vehicle was returned
                        </FormDescription>
                      </FormItem>
                    )}
                  />
                )}
                
                {currentStatus === "completed" && (
                  <FormField
                    control={form.control}
                    name="fuelCost"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Fuel Cost (€)</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            step="0.01"
                            placeholder="0.00"
                            {...field}
                            value={field.value || ""}
                            onChange={(e) => {
                              field.onChange(e.target.value === "" ? undefined : e.target.value);
                              setFuelCost(e.target.value || undefined);
                            }}
                            data-testid="input-fuel-cost"
                          />
                        </FormControl>
                        <FormDescription>
                          Fuel cost charged to customer (if applicable)
                        </FormDescription>
                      </FormItem>
                    )}
                  />
                )}
                
                {/* Price */}
                <FormField
                  control={form.control}
                  name="totalPrice"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Total Price (€) <span className="text-muted-foreground font-normal">(optional)</span></FormLabel>
                      <FormControl>
                        <Input 
                          type="number" 
                          step="0.01" 
                          min="0" 
                          placeholder="0.00" 
                          {...field}
                          onChange={(e) => {
                            // Once the user edits this field directly, stop auto-filling it
                            // from the vehicle's daily rate — their value wins from here on.
                            priceManuallyEditedRef.current = true;
                            // Allow emptying the field (making it optional)
                            const value = e.target.value === ""
                              ? undefined
                              : parseFloat(e.target.value) || 0;
                            field.onChange(value);
                          }}
                          value={field.value === undefined || field.value === null ? "" : field.value}
                        />
                      </FormControl>
                      <FormDescription>
                        {typeof rentalDuration === 'number' && selectedVehicle?.dailyPrice
                          ? `Auto-filled from the €${Number(selectedVehicle.dailyPrice).toFixed(2)}/day rate for ${rentalDuration} day${rentalDuration !== 1 ? 's' : ''} — edit to override`
                          : typeof rentalDuration === 'number'
                          ? `Enter the total price for the ${rentalDuration}-day rental`
                          : "Enter the total price for this open-ended rental"}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                {/* Delivery Service */}
                <FormField
                  control={form.control}
                  name="deliveryRequired"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                      <FormControl>
                        <Checkbox
                          checked={field.value || false}
                          onCheckedChange={(checked) => {
                            field.onChange(checked);
                            setDeliveryRequired(!!checked);
                          }}
                          data-testid="checkbox-delivery-required"
                        />
                      </FormControl>
                      <div className="space-y-1 leading-none">
                        <FormLabel>Delivery Service Required</FormLabel>
                        <FormDescription>
                          Vehicle will be delivered to customer's address
                        </FormDescription>
                      </div>
                    </FormItem>
                  )}
                />
                
                {deliveryRequired && (
                  <>
                    <FormField
                      control={form.control}
                      name="deliveryAddress"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Delivery Address</FormLabel>
                          <FormControl>
                            <Input placeholder="Street address" {...field} value={field.value || ""} data-testid="input-delivery-address" />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="deliveryCity"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>City</FormLabel>
                            <FormControl>
                              <Input placeholder="City" {...field} value={field.value || ""} data-testid="input-delivery-city" />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                      
                      <FormField
                        control={form.control}
                        name="deliveryPostalCode"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Postal Code</FormLabel>
                            <FormControl>
                              <Input placeholder="1234 AB" {...field} value={field.value || ""} data-testid="input-delivery-postal-code" />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    </div>
                    
                    <FormField
                      control={form.control}
                      name="deliveryFee"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Delivery Fee (€)</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              placeholder="0.00"
                              {...field}
                              onChange={(e) => {
                                const value = e.target.value === "" ? undefined : parseFloat(e.target.value) || 0;
                                field.onChange(value);
                              }}
                              value={field.value === undefined || field.value === null ? "" : field.value}
                              data-testid="input-delivery-fee"
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="deliveryNotes"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Delivery Notes <span className="text-muted-foreground font-normal">(optional)</span></FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder="Special delivery instructions..."
                              {...field}
                              value={field.value || ""}
                              data-testid="textarea-delivery-notes"
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </>
                )}
              </div>
              
              {/* Document Management - Always visible */}
              {form.watch("vehicleId") && (
                <div className="space-y-3 border rounded-lg p-4 bg-blue-50">
                  <label className="text-sm font-semibold text-gray-800">
                    {initialData?.type === 'maintenance_block' ? '🔧 Service Documentation' : '📄 Contract & Documents'}
                  </label>
                  
                  {/* Quick Upload Buttons */}
                  <div className="flex flex-wrap gap-2 p-3 bg-white rounded-md border border-gray-200">
                    <span className="text-xs text-gray-600 w-full mb-1 font-medium">
                      {!createdReservationId && !editMode ? 'Quick Upload (available after creating reservation):' : 'Quick Upload:'}
                    </span>
                    {(initialData?.type === 'maintenance_block' ? [
                      { type: 'Damage Report Photo', accept: '.jpg,.jpeg,.png' },
                      { type: 'Damage Report PDF', accept: '.pdf' },
                      { type: 'Invoice', accept: '.pdf' },
                      { type: 'Receipt', accept: '.pdf,.jpg,.jpeg,.png' },
                      { type: 'Other', accept: '.pdf,.jpg,.jpeg,.png,.doc,.docx' }
                    ] : [
                      { type: 'Contract (Signed)', accept: '.pdf' },
                      { type: 'Damage Report Photo', accept: '.jpg,.jpeg,.png' },
                      { type: 'Damage Report PDF', accept: '.pdf' },
                      { type: 'Other', accept: '.pdf,.jpg,.jpeg,.png,.doc,.docx' }
                    ]).map(({ type, accept }) => (
                      <Button
                        key={type}
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          // Check if reservation exists (either edit mode with initialData or created)
                          const reservationId = createdReservationId || (editMode && initialData?.id);
                          
                          if (!reservationId) {
                            toast({
                              title: "Create reservation first",
                              description: "Please save the reservation before uploading documents.",
                            });
                            return;
                          }

                          const input = document.createElement('input');
                          input.type = 'file';
                          input.accept = accept;
                          input.onchange = async (e) => {
                            const file = (e.target as HTMLInputElement).files?.[0];
                            if (!file) return;
                            
                            setUploadingDoc(true);
                            const formData = new FormData();
                            formData.append('vehicleId', form.watch("vehicleId").toString());
                            formData.append('reservationId', reservationId.toString());
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
                              
                              invalidateByPrefix(`/api/documents/reservation/${reservationId}`);
                              toast({
                                title: "Success",
                                description: `${type} uploaded successfully`,
                              });
                            } catch (error) {
                              console.error('Upload failed:', error);
                              toast({
                                title: "Error",
                                description: "Failed to upload document",
                                variant: "destructive",
                              });
                            } finally {
                              setUploadingDoc(false);
                            }
                          };
                          input.click();
                        }}
                        disabled={uploadingDoc}
                        className="text-xs"
                      >
                        + {type}
                      </Button>
                    ))}
                  </div>
                  
                  {/* Uploaded Documents */}
                  {reservationDocuments && reservationDocuments.length > 0 && (
                    <div className="space-y-2">
                      <span className="text-xs font-semibold text-gray-700">Uploaded Documents:</span>
                      <div className="flex flex-wrap gap-2">
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
                          const otherDocs = reservationDocuments.filter(d => 
                            !d.documentType?.startsWith('Contract (Unsigned)') && 
                            !d.documentType?.startsWith('Contract (Signed)') && 
                            d.documentType !== 'Contract' && 
                            !d.documentType?.startsWith('Damage Check') &&
                            d.documentType !== 'Damage Report Photo' && 
                            d.documentType !== 'Damage Report PDF'
                          );
                          
                          return [...contractDocs, ...damageCheckDocs, ...damageReportDocs, ...otherDocs];
                        })().map((doc) => {
                          const ext = doc.fileName.split('.').pop()?.toLowerCase();
                          const isPdf = doc.contentType?.includes('pdf') || ext === 'pdf';
                          const isImage = doc.contentType?.includes('image') || ['jpg', 'jpeg', 'png', 'gif'].includes(ext || '');
                          
                          return (
                            <div key={doc.id} className="relative group">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  if (isPdf) {
                                    window.open(`/api/documents/view/${doc.id}`, '_blank');
                                  } else {
                                    setPreviewDocument(doc);
                                    setPreviewDialogOpen(true);
                                  }
                                }}
                                className="flex items-center gap-2 pr-8"
                                title={doc.documentType || 'Document'}
                              >
                                {isPdf ? (
                                  <FileText className="h-4 w-4 text-red-600" />
                                ) : isImage ? (
                                  <FileCheck className="h-4 w-4 text-blue-600" />
                                ) : (
                                  <FileText className="h-4 w-4 text-gray-600" />
                                )}
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
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDocumentToDelete(doc);
                                  setDeleteDocDialogOpen(true);
                                }}
                                className="absolute top-1 right-1 p-1 rounded-full bg-red-500 text-white opacity-0 group-hover:opacity-100 hover:bg-red-600 transition-opacity"
                                title="Delete document"
                              >
                                <X className="h-3 w-3" />
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
              {(activeReservationId || (selectedVehicle && selectedCustomer)) && (
                <div className="space-y-3 border rounded-lg p-4 bg-orange-50">
                  <label className="text-sm font-semibold text-gray-800 flex items-center gap-2">
                    <ClipboardCheck className="h-4 w-4" />
                    🔍 Damage Checks
                  </label>
                  
                  {/* Reservation's Damage Checks */}
                  {activeReservationId && reservationDamageChecks && reservationDamageChecks.length > 0 && (
                    <div className="space-y-2">
                      <span className="text-xs font-semibold text-gray-700">This Reservation:</span>
                      <div className="flex flex-wrap gap-2">
                        {reservationDamageChecks.map((check) => (
                          <div key={check.id} className="relative group">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={async () => {
                                // View the PDF if it exists
                                try {
                                  const response = await fetch(`/api/interactive-damage-checks/${check.id}/pdf`);
                                  if (response.ok) {
                                    const blob = await response.blob();
                                    const url = window.URL.createObjectURL(blob);
                                    window.open(url, '_blank');
                                    window.URL.revokeObjectURL(url);
                                  }
                                } catch (error) {
                                  console.error('Failed to view damage check:', error);
                                }
                              }}
                              className="flex items-center gap-2 pr-2"
                            >
                              <Eye className="h-4 w-4 text-orange-600" />
                              <div className="text-left">
                                <div className="text-xs font-semibold">{check.checkType === 'pickup' ? 'Pickup' : 'Return'} Check</div>
                                <div className="text-[10px] text-gray-500">
                                  {new Date(check.checkDate).toLocaleDateString()} • {check.mileage ? `${check.mileage} km` : 'No mileage'}
                                </div>
                              </div>
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {/* Recent Damage Checks for Vehicle + Customer */}
                  {recentDamageChecks && recentDamageChecks.length > 0 && (
                    <div className="space-y-2">
                      <span className="text-xs font-semibold text-gray-700">Recent History (Vehicle + Customer):</span>
                      <div className="flex flex-wrap gap-2">
                        {recentDamageChecks.map((check) => (
                          <div key={check.id} className="relative">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={async () => {
                                // View the PDF if it exists
                                try {
                                  const response = await fetch(`/api/interactive-damage-checks/${check.id}/pdf`);
                                  if (response.ok) {
                                    const blob = await response.blob();
                                    const url = window.URL.createObjectURL(blob);
                                    window.open(url, '_blank');
                                    window.URL.revokeObjectURL(url);
                                  }
                                } catch (error) {
                                  console.error('Failed to view damage check:', error);
                                }
                              }}
                              className="flex items-center gap-2 opacity-70 hover:opacity-100"
                            >
                              <Eye className="h-4 w-4 text-gray-600" />
                              <div className="text-left">
                                <div className="text-xs">{check.checkType === 'pickup' ? 'Pickup' : 'Return'}</div>
                                <div className="text-[10px] text-gray-500">
                                  {new Date(check.checkDate).toLocaleDateString()}
                                </div>
                              </div>
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {activeReservationId && reservationDamageChecks && reservationDamageChecks.length === 0 && (
                    <p className="text-xs text-gray-600 italic">No damage checks yet for this reservation. Click "Create Damage Check" below to add one.</p>
                  )}
                </div>
              )}
              
              {/* Notes */}
              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="Add any additional notes or requirements..." 
                        className="min-h-[100px]" 
                        {...field}
                        value={field.value || ""}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            
            {/* Success message after creating reservation */}
            {!editMode && createdReservationId && (
              <div className="p-4 bg-green-50 border border-green-200 rounded-md">
                <div className="flex items-start gap-3">
                  <Check className="h-5 w-5 text-green-600 mt-0.5" />
                  <div>
                    <h4 className="font-semibold text-green-800">Reservation Created Successfully!</h4>
                    <p className="text-sm text-green-700 mt-1">
                      The unsigned contract has been generated. You can now upload additional documents using the section above.
                    </p>
                  </div>
                </div>
              </div>
            )}
            
            {/* Submit Button */}
            <div className="flex flex-col gap-4">

              <div className="flex justify-end gap-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    if (onCancel) {
                      onCancel();
                    } else {
                      navigate("/reservations");
                    }
                  }}
                >
                  {createdReservationId || editMode ? "Close" : "Cancel"}
                </Button>
                
                {/* Submit button - only show when creating new reservation or in edit mode, hide after creation */}
                {(!createdReservationId || editMode) && (
                  <Button 
                    type="submit"
                    disabled={createReservationMutation.isPending || hasOverlap}
                    data-testid="button-submit-reservation"
                  >
                    {createReservationMutation.isPending 
                      ? "Saving..." 
                      : editMode ? "Update Reservation" : "Create Reservation"
                    }
                  </Button>
                )}
              </div>
            </div>
            
            {/* Booking Conflict Warning */}
            {hasOverlap && (
              <div className="p-4 bg-destructive/10 border border-destructive rounded-md flex items-center gap-2 text-destructive mt-4">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <div>This vehicle is already reserved for the selected dates. Please choose different dates or another vehicle.</div>
              </div>
            )}
          </form>
        </Form>
      </CardContent>
    </Card>
    
    {/* Document Preview Dialog */}
    <Dialog open={previewDialogOpen} onOpenChange={setPreviewDialogOpen}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>{previewDocument?.documentType || 'Document Preview'}</DialogTitle>
          <DialogDescription>
            {previewDocument?.fileName}
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-auto bg-gray-100 rounded-md p-4">
          {previewDocument && (() => {
            const ext = previewDocument.fileName.split('.').pop()?.toLowerCase();
            const isImage = previewDocument.contentType?.includes('image') || ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext || '');

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
            } else {
              return (
                <div className="flex flex-col items-center justify-center h-full space-y-4">
                  <p className="text-gray-600">Preview not available for this file type.</p>
                  <Button onClick={() => window.open(`/api/documents/view/${previewDocument.id}`, '_blank')}>
                    Open File
                  </Button>
                </div>
              );
            }
          })()}
        </div>
        <div className="flex justify-between items-center pt-4 border-t">
          <Button variant="outline" onClick={() => window.open(`/api/documents/view/${previewDocument?.id}`, '_blank')}>
            Open in New Tab
          </Button>
          <Button onClick={() => setPreviewDialogOpen(false)}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
    
    {/* Overdue Reservations Dialog */}
    <AlertDialog open={overdueDialogOpen} onOpenChange={setOverdueDialogOpen}>
      <AlertDialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-amber-600">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
              <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>
              <line x1="12" y1="9" x2="12" y2="13"/>
              <line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            Overdue Reservations Found
          </AlertDialogTitle>
          <AlertDialogDescription>
            This vehicle has {overdueReservations.length} reservation{overdueReservations.length > 1 ? 's' : ''} that ended more than 3 days ago but {overdueReservations.length > 1 ? 'have' : 'has'}n't been completed. 
            Please resolve {overdueReservations.length > 1 ? 'these' : 'this'} before creating a new reservation.
          </AlertDialogDescription>
        </AlertDialogHeader>
        
        <div className="flex-1 overflow-auto py-4">
          <div className="space-y-3">
            {overdueReservations.map((reservation) => (
              <div 
                key={reservation.id} 
                className="border rounded-lg p-4 bg-muted/30"
              >
                <div className="flex justify-between items-start gap-4">
                  <div className="space-y-1">
                    <div className="font-medium">
                      {reservation.customer?.firstName} {reservation.customer?.lastName}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {formatDate(reservation.startDate)} - {reservation.endDate ? formatDate(reservation.endDate) : 'Open-ended'}
                    </div>
                    <Badge variant={
                      reservation.status === 'picked_up' ? 'default' : 
                      reservation.status === 'returned' ? 'secondary' : 'outline'
                    }>
                      {reservation.status}
                    </Badge>
                  </div>
                  
                  <div className="flex flex-col gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setViewingReservationId(reservation.id);
                        setViewDialogOpen(true);
                      }}
                    >
                      <Eye className="h-4 w-4 mr-1" />
                      View Details
                    </Button>
                    
                    <Button
                      size="sm"
                      variant="default"
                      disabled={processingOverdue === reservation.id}
                      onClick={async () => {
                        setProcessingOverdue(reservation.id);
                        try {
                          await apiRequest("PATCH", `/api/reservations/${reservation.id}/status`, {
                            status: "completed"
                          });
                          toast({
                            title: "Reservation Completed",
                            description: "The overdue reservation has been marked as completed.",
                          });
                          
                          // Refetch overdue reservations from server to ensure consistency
                          const vehicleId = Number(pendingFormData?.vehicleId);
                          if (vehicleId) {
                            const freshOverdue = await checkOverdueReservations(vehicleId);
                            setOverdueReservations(freshOverdue);
                            
                            // If no more overdue, proceed with the pending submission
                            if (freshOverdue.length === 0 && pendingFormData) {
                              setOverdueDialogOpen(false);
                              await processSubmission(pendingFormData);
                              setPendingFormData(null);
                            }
                          }
                          
                          invalidateRelatedQueries('reservations');
                        } catch (error) {
                          toast({
                            title: "Error",
                            description: "Failed to complete reservation",
                            variant: "destructive",
                          });
                        }
                        setProcessingOverdue(null);
                      }}
                    >
                      {processingOverdue === reservation.id ? "Processing..." : "Mark Completed"}
                    </Button>
                    
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={processingOverdue === reservation.id}
                      onClick={async () => {
                        setProcessingOverdue(reservation.id);
                        try {
                          await apiRequest("DELETE", `/api/reservations/${reservation.id}`);
                          toast({
                            title: "Reservation Deleted",
                            description: "The overdue reservation has been deleted.",
                          });
                          
                          // Refetch overdue reservations from server to ensure consistency
                          const vehicleId = Number(pendingFormData?.vehicleId);
                          if (vehicleId) {
                            const freshOverdue = await checkOverdueReservations(vehicleId);
                            setOverdueReservations(freshOverdue);
                            
                            // If no more overdue, proceed with the pending submission
                            if (freshOverdue.length === 0 && pendingFormData) {
                              setOverdueDialogOpen(false);
                              await processSubmission(pendingFormData);
                              setPendingFormData(null);
                            }
                          }
                          
                          invalidateRelatedQueries('reservations');
                        } catch (error) {
                          toast({
                            title: "Error",
                            description: "Failed to delete reservation",
                            variant: "destructive",
                          });
                        }
                        setProcessingOverdue(null);
                      }}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
        
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => {
            setOverdueDialogOpen(false);
            setPendingFormData(null);
            setOverdueReservations([]);
          }}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={overdueReservations.length > 0}
            onClick={async () => {
              if (pendingFormData) {
                setOverdueDialogOpen(false);
                await processSubmission(pendingFormData);
                setPendingFormData(null);
              }
            }}
          >
            Continue with Reservation
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    
    {/* Reservation View Dialog for overdue reservations */}
    <ReservationViewDialog
      open={viewDialogOpen}
      onOpenChange={setViewDialogOpen}
      reservationId={viewingReservationId}
    />
    
    {/* Pickup Dialog - triggered when status is set to picked_up */}
    {pendingDialogReservation && (
      <PickupDialog
        open={pickupDialogOpen}
        onOpenChange={(open) => {
          setPickupDialogOpen(open);
          if (!open) {
            // Dialog was closed/cancelled - reset states
            setPendingDialogReservation(null);
            // Update form status back to booked since pickup was cancelled
            form.setValue("status", initialData?.status || "booked");
            setCurrentStatus(initialData?.status || "booked");
            // Notify parent that pickup/return dialog is closed
            onPickupReturnDialogChange?.(false);
          }
        }}
        reservation={pendingDialogReservation}
        onSuccess={async () => {
          // Pickup completed successfully
          setPickupDialogOpen(false);
          // Notify parent that pickup/return dialog is closed
          onPickupReturnDialogChange?.(false);
          
          // Update form status to picked_up
          form.setValue("status", "picked_up");
          setCurrentStatus("picked_up");
          
          // Show success message
          toast({
            title: "Vehicle Picked Up",
            description: "Pickup completed successfully with contract number and mileage recorded.",
          });
          
          // Invalidate queries
          await invalidateByPrefix('/api/reservations');
          await invalidateByPrefix('/api/vehicles');
          
          // Fetch updated reservation to pass to callback
          if (onSuccess && pendingDialogReservation) {
            try {
              const response = await fetch(`/api/reservations/${pendingDialogReservation.id}`, { credentials: 'include' });
              if (response.ok) {
                const updatedReservation = await response.json();
                onSuccess(updatedReservation);
              }
            } catch (e) {
              console.error('Failed to fetch updated reservation:', e);
            }
          }
          
          setPendingDialogReservation(null);
        }}
      />
    )}
    
    {/* Return Dialog - triggered when status is set to returned */}
    {pendingDialogReservation && (
      <ReturnDialog
        open={returnDialogOpen}
        onOpenChange={(open) => {
          setReturnDialogOpen(open);
          if (!open) {
            // Dialog was closed/cancelled - reset states
            setPendingDialogReservation(null);
            // Update form status back to picked_up since return was cancelled
            form.setValue("status", initialData?.status || "picked_up");
            setCurrentStatus(initialData?.status || "picked_up");
            // Notify parent that pickup/return dialog is closed
            onPickupReturnDialogChange?.(false);
          }
        }}
        reservation={pendingDialogReservation}
        onSuccess={async () => {
          // Return completed successfully
          setReturnDialogOpen(false);
          // Notify parent that pickup/return dialog is closed
          onPickupReturnDialogChange?.(false);
          
          // Update form status to returned
          form.setValue("status", "returned");
          setCurrentStatus("returned");
          
          // Show success message
          toast({
            title: "Vehicle Returned",
            description: "Return completed successfully with mileage and fuel level recorded.",
          });
          
          // Invalidate queries
          await invalidateByPrefix('/api/reservations');
          await invalidateByPrefix('/api/vehicles');
          
          // Fetch updated reservation to pass to callback
          if (onSuccess && pendingDialogReservation) {
            try {
              const response = await fetch(`/api/reservations/${pendingDialogReservation.id}`, { credentials: 'include' });
              if (response.ok) {
                const updatedReservation = await response.json();
                onSuccess(updatedReservation);
              }
            } catch (e) {
              console.error('Failed to fetch updated reservation:', e);
            }
          }
          
          setPendingDialogReservation(null);
        }}
      />
    )}
    
    {/* Vehicle Remarks Warning Dialog - shown when selecting a vehicle with remarks */}
    <VehicleRemarksWarningDialog
      open={vehicleRemarksWarningOpen}
      onOpenChange={setVehicleRemarksWarningOpen}
      vehicle={pendingVehicleSelection?.vehicle ?? null}
      context="reservation"
      onAcknowledge={() => {
        // User acknowledged, proceed with vehicle selection
        if (pendingVehicleSelection) {
          pendingVehicleSelection.fieldOnChange(pendingVehicleSelection.vehicle.id.toString());
          saveToRecent('recentVehicles', pendingVehicleSelection.vehicle.id.toString());
        }
        setPendingVehicleSelection(null);
      }}
      onCancel={() => {
        // User cancelled, don't select the vehicle
        setPendingVehicleSelection(null);
      }}
    />

    <ConfirmDialog
      open={deleteDocDialogOpen}
      onOpenChange={setDeleteDocDialogOpen}
      title="Delete Document"
      description={`Are you sure you want to delete ${documentToDelete?.documentType}? This action cannot be undone.`}
      variant="danger"
      confirmLabel="Delete"
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
          
          invalidateByPrefix(`/api/documents/reservation/${createdReservationId}`);
          toast({
            title: "Success",
            description: "Document deleted successfully",
          });
        } catch (error) {
          console.error('Delete failed:', error);
          toast({
            title: "Error",
            description: "Failed to delete document",
            variant: "destructive",
          });
        }
        setDocumentToDelete(null);
      }}
      onCancel={() => setDocumentToDelete(null)}
    />
    </>
  );
}