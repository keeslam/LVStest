import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useForm } from "react-hook-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiRequest , invalidateByPrefix } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { insertVehicleSchema } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Mail } from "lucide-react";
import { useLocation } from "wouter";
import { formatLicensePlate, capitalizeWords } from "@/lib/format-utils";
import { OIL_GRADES } from "@/constants/oil-grades";

// Utility function to handle null values for form inputs
const handleFieldValue = (value: any): string => {
  return value === null || value === undefined ? '' : String(value);
};

// Extended schema with validation
export const formSchema = insertVehicleSchema.extend({
  licensePlate: z.string().min(1, "License plate is required"),
  brand: z.string().min(1, "Brand is required"),
  model: z.string().min(1, "Model is required"),
  // Make these fields truly optional
  registeredTo: z.boolean().optional(),
  company: z.boolean().optional(),
  // Make mileage fields optional with non-negative validation
  departureMileage: z.union([
    z.string().optional(),
    z.number().optional(),
    z.null()
  ]).optional().transform(val => val === '' ? null : val === null ? null : Number(val))
    .refine(val => val === null || val === undefined || val >= 0, { message: "Mileage cannot be negative" }),
  returnMileage: z.union([
    z.string().optional(),
    z.number().optional(),
    z.null()
  ]).optional().transform(val => val === '' ? null : val === null ? null : Number(val))
    .refine(val => val === null || val === undefined || val >= 0, { message: "Mileage cannot be negative" }),
});

// Vehicle types
const vehicleTypes = ["Sedan", "SUV", "Van", "Hatchback", "Coupe", "Truck", "Stationwagen", "Other"];

// Fuel types
const fuelTypes = ["Gasoline", "Diesel", "Electric", "Hybrid", "LPG", "CNG"];

// Euro zone classifications
const euroZones = ["Euro 3", "Euro 4", "Euro 5", "Euro 6", "Euro 6d"];

const VEHICLE_TYPE_KEYS: Record<string, string> = {
  Sedan: "sedan",
  SUV: "suv",
  Van: "van",
  Hatchback: "hatchback",
  Coupe: "coupe",
  Truck: "truck",
  Stationwagen: "stationwagen",
  Other: "other",
};

const FUEL_TYPE_KEYS: Record<string, string> = {
  Gasoline: "gasoline",
  Diesel: "diesel",
  Electric: "electric",
  Hybrid: "hybrid",
  LPG: "lpg",
  CNG: "cng",
};

// GPS Activation Dialog Component
function GPSActivationDialog({ vehicleData, onSuccess, onAutoSave }: { vehicleData: { brand: string; model: string; licensePlate: string; imei: string }, onSuccess?: () => void, onAutoSave?: (isSwap: boolean) => void }) {
  const { t } = useTranslation("vehicles");
  const [isSwap, setIsSwap] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const { toast } = useToast();

  const handleSendActivation = async () => {
    if (!vehicleData.imei) {
      toast({
        title: t('vehicleForm.gpsActivationDialog.imeiRequiredTitle'),
        description: t('vehicleForm.gpsActivationDialog.imeiRequiredDescription'),
        variant: "destructive"
      });
      return;
    }

    setIsSending(true);
    try {
      const response = await apiRequest("POST", "/api/notifications/send-gps-activation", {
        vehicleData: {
          brand: vehicleData.brand,
          model: vehicleData.model,
          licensePlate: vehicleData.licensePlate,
          imei: vehicleData.imei
        },
        isSwap
      });

      if (!response.ok) {
        throw new Error("Failed to send GPS activation email");
      }

      toast({
        title: t('vehicleForm.gpsActivationDialog.emailSentTitle'),
        description: isSwap
          ? t('vehicleForm.gpsActivationDialog.emailSentDescriptionSwap')
          : t('vehicleForm.gpsActivationDialog.emailSentDescriptionActivate')
      });

      // Auto-save the form with GPS enabled and activation status
      if (onAutoSave) {
        onAutoSave(isSwap);
      }

      // Close dialog on success
      if (onSuccess) {
        onSuccess();
      }
    } catch (error) {
      toast({
        title: t('vehicleForm.gpsActivationDialog.failedTitle'),
        description: t('vehicleForm.gpsActivationDialog.failedDescription'),
        variant: "destructive"
      });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="text-sm">
          <span className="font-medium">{t('vehicleForm.gpsActivationDialog.vehicleLabel')}</span> {vehicleData.brand} {vehicleData.model} ({vehicleData.licensePlate})
        </div>
        <div className="text-sm">
          <span className="font-medium">{t('vehicleForm.gpsActivationDialog.imeiFieldLabel')}</span> {vehicleData.imei || t('vehicleForm.gpsActivationDialog.notSet')}
        </div>
      </div>

      <div className="flex items-center justify-between rounded-md border p-4">
        <div className="space-y-0.5">
          <Label>{t('vehicleForm.gpsActivationDialog.gpsModuleSwapLabel')}</Label>
          <p className="text-sm text-muted-foreground">
            {t('vehicleForm.gpsActivationDialog.gpsModuleSwapDescription')}
          </p>
        </div>
        <Switch
          checked={isSwap}
          onCheckedChange={setIsSwap}
        />
      </div>

      <div className="rounded-md bg-muted p-4">
        <p className="text-sm font-medium mb-2">{t('vehicleForm.gpsActivationDialog.emailPreviewLabel')}</p>
        <p className="text-sm text-muted-foreground">
          {isSwap ?
            `Verzoek om GPS module swap voor ${vehicleData.brand} ${vehicleData.model} (${vehicleData.licensePlate}). Nieuwe IMEI: ${vehicleData.imei || 'N.v.t.'}` :
            `Verzoek om GPS activatie voor ${vehicleData.brand} ${vehicleData.model} (${vehicleData.licensePlate}). IMEI: ${vehicleData.imei || 'N.v.t.'}`
          }
        </p>
      </div>

      <div className="flex justify-end space-x-2">
        <Button
          type="button"
          onClick={handleSendActivation}
          disabled={isSending || !vehicleData.imei}
          data-testid="button-send-gps-activation"
        >
          {isSending ? t('vehicleForm.gpsActivationDialog.sendingButton') : t('vehicleForm.gpsActivationDialog.sendButton')}
        </Button>
      </div>
    </div>
  );
}

interface VehicleFormProps {
  editMode?: boolean;
  initialData?: any;
  redirectToList?: boolean;
  onSuccess?: (vehicle: any) => void;
  onSubmitOverride?: (data: any) => void; // Optional override for form submission
  customCancelButton?: React.ReactNode;
}

export function VehicleForm({ 
  editMode = false, 
  initialData,
  redirectToList = true,
  onSuccess,
  onSubmitOverride,
  customCancelButton
}: VehicleFormProps) {
  const { t } = useTranslation("vehicles");
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [isGpsDialogOpen, setIsGpsDialogOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [_, navigate] = useLocation();
  
  // Process initial data to ensure boolean fields are properly formatted
  const processedInitialData = initialData ? {
    ...initialData,
    // For regular boolean fields
    adBlue: Boolean(initialData.adBlue),
    gps: Boolean(initialData.gps),
    damageCheck: Boolean(initialData.damageCheck),
    roadsideAssistance: Boolean(initialData.roadsideAssistance),
    spareKey: Boolean(initialData.spareKey),
    spareKeyWithCustomer: Boolean(initialData.spareKeyWithCustomer),
    spareKeyCustomerName: initialData.spareKeyCustomerName || '',
    winterTires: Boolean(initialData.winterTires),
    wokNotification: Boolean(initialData.wokNotification),
    seatcovers: Boolean(initialData.seatcovers),
    backupbeepers: Boolean(initialData.backupbeepers),
    spareTire: Boolean(initialData.spareTire),
    toolsAndJack: Boolean(initialData.toolsAndJack),
    euroZoneAccess: Boolean(initialData.euroZoneAccess),
    euroZonePaidPermitAccess: Boolean(initialData.euroZonePaidPermitAccess),
    availabilityStatus: initialData.availabilityStatus || "available",
    
    // For string-boolean fields, convert to actual boolean for UI
    registeredTo: initialData.registeredTo === "true" || initialData.registeredTo === true,
    company: initialData.company === "true" || initialData.company === true,
  } : null;

  // Setup form with react-hook-form and zod validation
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: processedInitialData || {
      licensePlate: "",
      brand: "",
      model: "",
      vehicleType: "",
      chassisNumber: "",
      fuel: "",
      adBlue: false,
      euroZone: "",
      euroZoneEndDate: "",
      apkDate: "",
      warrantyEndDate: "",
      registeredTo: false,
      registeredToDate: "",
      productionDate: "",
      company: false,
      companyDate: "",
      gps: false,
      monthlyPrice: "",
      dailyPrice: "",
      dateIn: "",
      dateOut: "",
      contractNumber: "",
      damageCheck: false,  // Changed from empty string to false
      damageCheckDate: "",
      damageCheckAttachment: "",
      damageCheckAttachmentDate: "",
      roadsideAssistance: false,
      spareKey: false,
      spareKeyWithCustomer: false,
      spareKeyCustomerName: '',
      remarks: "",
      winterTires: false,
      tireSize: "",
      wokNotification: false,
      radioCode: "",
      seatcovers: false,
      backupbeepers: false,
      spareTire: false,
      toolsAndJack: false,
      euroZoneAccess: false,
      euroZonePaidPermitAccess: false,
      availabilityStatus: "available",
      internalAppointments: "",
      departureMileage: "",
      returnMileage: "",
      createdBy: "",
    },
  });
  
  // Fetch active reservation for this vehicle to suggest current renter name
  const { data: activeReservation } = useQuery<{
    id: number;
    status: string;
    customer?: { name: string; companyName?: string | null; firstName?: string | null; lastName?: string | null } | null;
    driver?: { firstName: string; lastName: string } | null;
  } | null>({
    queryKey: ['/api/reservations/vehicle', initialData?.id, 'active'],
    queryFn: async () => {
      if (!initialData?.id) return null;
      try {
        const response = await fetch(`/api/reservations/vehicle/${initialData.id}`);
        if (!response.ok) return null;
        const reservations = await response.json();
        // Find the active (picked_up) reservation
        const activeRes = reservations.find((r: any) => r.status === 'picked_up');
        return activeRes || null;
      } catch {
        return null;
      }
    },
    enabled: !!initialData?.id && editMode,
  });
  
  // Get the current renter name from active reservation
  // Priority: company name > customer name (which may contain the company or person name)
  const currentRenterName = (() => {
    if (!activeReservation) return null;
    
    // First check for company name field
    if (activeReservation.customer?.companyName) {
      return activeReservation.customer.companyName;
    }
    
    // Fall back to the main name field (contains either company name or person name)
    if (activeReservation.customer?.name) {
      return activeReservation.customer.name;
    }
    
    return null;
  })();
  
  const createVehicleMutation = useMutation({
    mutationFn: async (data: z.infer<typeof formSchema>) => {
      console.log("Vehicle data being sent:", JSON.stringify(data));
      
      const url = editMode ? `/api/vehicles/${initialData?.id}` : "/api/vehicles";
      console.log(`Sending request to ${url}`);
      
      try {
        const response = await apiRequest(
          editMode ? "PATCH" : "POST", 
          url, 
          data
        );
        
        console.log("Response received:", response);
        // Parse the response to see if there's a more detailed error message
        if (!response.ok) {
          const errorData = await response.json();
          console.error("API error:", errorData);
          throw new Error(errorData.message || "Failed to save vehicle data");
        }
        
        return response;
      } catch (error) {
        console.error("Request failed:", error);
        throw error;
      }
    },
    onSuccess: async (response) => {
      console.log("Vehicle saved successfully");
      
      // Parse the response to get the created/updated vehicle data
      let vehicleData;
      try {
        // Clone the response before parsing it to avoid the "body already read" error
        const clonedResponse = response.clone();
        vehicleData = await response.json();
        console.log("Successfully parsed vehicle data:", vehicleData);
      } catch (e) {
        console.error("Failed to parse response JSON:", e);
        vehicleData = { id: initialData?.id };
      }
      
      // Invalidate relevant queries
      await invalidateByPrefix("/api/vehicles");
      
      // Also invalidate the specific vehicle query if we're in edit mode
      if (editMode && initialData?.id) {
        await invalidateByPrefix(`/api/vehicles/${initialData.id}`);
      }
      
      // Show success message
      toast({
        title: editMode ? t('vehicleForm.toasts.vehicleUpdatedTitle') : t('vehicleForm.toasts.vehicleCreatedTitle'),
        description: editMode ? t('vehicleForm.toasts.vehicleUpdatedDescription') : t('vehicleForm.toasts.vehicleCreatedDescription'),
      });

      console.log("onSuccess callback exists:", !!onSuccess);
      console.log("redirectToList value:", redirectToList);
      
      // If a success callback was provided, call it with the vehicle data
      if (onSuccess && typeof onSuccess === 'function') {
        console.log("Calling onSuccess callback with vehicle data");
        onSuccess(vehicleData);
        // When a callback is provided, we assume it will handle navigation
        return;
      } 
      
      // Only navigate if redirectToList is true and we didn't call onSuccess
      if (redirectToList) {
        console.log("Navigating based on redirectToList flag");
        if (editMode && initialData?.id) {
          // Navigate to vehicle details page when updating
          navigate(`/vehicles/${initialData.id}`);
        } else {
          // Navigate to vehicles list for new vehicles
          navigate("/vehicles");
        }
      } else {
        console.log("Not navigating because redirectToList is false");
      }
    },
    onError: async (error: any) => {
      console.error("Mutation error:", error);
      
      // Try to parse the error response
      let errorData = error;
      if (error instanceof Response) {
        try {
          errorData = await error.json();
        } catch (e) {
          errorData = { message: error.statusText || "Unknown error" };
        }
      }
      
      // Handle specific error types based on status code or error content
      let title = t('vehicleForm.toasts.errorTitle');
      let description = errorData.message || (editMode
        ? t('vehicleForm.toasts.genericUpdateFailed')
        : t('vehicleForm.toasts.genericCreateFailed'));

      // Check for duplicate license plate error (409 status or specific message)
      const isDuplicate =
        error.status === 409 ||
        errorData.message?.includes("license plate already exists") ||
        errorData.message?.includes("duplicate key");

      if (isDuplicate) {
        title = t('vehicleForm.toasts.duplicateLicensePlateTitle');
        description = errorData.message || t('vehicleForm.toasts.duplicateLicensePlateDescription');

        // Highlight the license plate field
        form.setError("licensePlate", {
          type: "duplicate",
          message: t('vehicleForm.toasts.licensePlateInUseError')
        });
      } else if (errorData.message?.includes("required")) {
        title = t('vehicleForm.toasts.missingInformationTitle');
        description = t('vehicleForm.toasts.missingInformationDescription');
      }
      
      toast({
        title,
        description,
        variant: "destructive",
      });
    },
  });
  
  const lookupVehicleMutation = useMutation({
    mutationFn: async (licensePlate: string) => {
      const response = await fetch(`/api/rdw/vehicle/${licensePlate}`, {
        method: "GET",
        headers: { "Content-Type": "application/json" }
      });
      
      // Check if the response is OK before parsing
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: t('vehicleForm.toasts.unknownError') }));
        const error = new Error(errorData.message || t('vehicleForm.toasts.lookupFailedFallback'));
        (error as any).status = response.status;
        throw error;
      }
      
      return response.json();
    },
    onSuccess: (vehicleData) => {
      // Fill form with retrieved data, converting null values to empty strings
      Object.keys(vehicleData).forEach((key) => {
        if (form.getValues(key as any) !== undefined) {
          let value = vehicleData[key] === null ? "" : vehicleData[key];
          
          // Convert string "true"/"false" to actual booleans for registeredTo and company fields
          if (key === 'registeredTo' || key === 'company') {
            value = value === "true" || value === true;
          }
          
          // Format license plate with proper dashes
          if (key === 'licensePlate' && typeof value === 'string') {
            value = formatLicensePlate(value);
          }
          
          // Mark fields as touched and dirty so form knows it's been modified
          form.setValue(key as any, value, { 
            shouldDirty: true, 
            shouldTouch: true, 
            shouldValidate: true 
          });
        }
      });
      
      toast({
        title: t('vehicleForm.toasts.vehicleInfoFoundTitle'),
        description: t('vehicleForm.toasts.vehicleInfoFoundDescription'),
      });
    },
    onError: (error: any) => {
      console.error("RDW lookup error:", error);

      // Handle specific error types based on status code
      let title = t('vehicleForm.toasts.lookupFailedTitle');
      let description = t('vehicleForm.toasts.lookupFailedDescriptionDefault');

      if (error.status === 404) {
        title = t('vehicleForm.toasts.vehicleNotFoundTitle');
        description = t('vehicleForm.toasts.vehicleNotFoundDescription');
      } else if (error.status === 504) {
        title = t('vehicleForm.toasts.serviceTimeoutTitle');
        description = t('vehicleForm.toasts.serviceTimeoutDescription');
      } else if (error.status === 502) {
        title = t('vehicleForm.toasts.serviceUnavailableTitle');
        description = t('vehicleForm.toasts.serviceUnavailableDescription');
      } else {
        description = error.message || description;
      }
      
      toast({
        title,
        description,
        variant: "destructive",
      });
    },
    onSettled: () => {
      setIsLookingUp(false);
    }
  });
  
  const onSubmit = async (data: z.infer<typeof formSchema>) => {
    // Process the form data before submission
    const formattedData: any = { ...data };
    
    console.log("Original form data:", data);
    
    // Handle empty string values for numeric fields
    if (formattedData.departureMileage === "") formattedData.departureMileage = null;
    if (formattedData.returnMileage === "") formattedData.returnMileage = null;
    if (formattedData.monthlyPrice === "") formattedData.monthlyPrice = null;
    if (formattedData.dailyPrice === "") formattedData.dailyPrice = null;
    
    // Convert boolean values to match the database schema expectations
    // Force boolean values for registeredTo
    if ('registeredTo' in formattedData) {
      if (formattedData.registeredTo === "" || formattedData.registeredTo === "false" || 
          formattedData.registeredTo === false || formattedData.registeredTo === null || 
          formattedData.registeredTo === undefined) {
        formattedData.registeredTo = false;
      } else {
        formattedData.registeredTo = true;
      }
    } else {
      formattedData.registeredTo = false;
    }
    
    // Force boolean values for company
    if ('company' in formattedData) {
      if (formattedData.company === "" || formattedData.company === "false" || 
          formattedData.company === false || formattedData.company === null || 
          formattedData.company === undefined) {
        formattedData.company = false;
      } else {
        formattedData.company = true;
      }
    } else {
      formattedData.company = false;
    }
    
    // For NEW vehicles only: ensure date fields are set when booleans are true
    if (!editMode) {
      if (formattedData.registeredTo === true && (!formattedData.registeredToDate || formattedData.registeredToDate === '')) {
        const todayDate = new Date().toISOString().split('T')[0];
        formattedData.registeredToDate = todayDate;
        console.log(`🔧 Auto-set registeredToDate to ${todayDate} for new vehicle with registeredTo=true`);
      }
      if (formattedData.company === true && (!formattedData.companyDate || formattedData.companyDate === '')) {
        const todayDate = new Date().toISOString().split('T')[0];
        formattedData.companyDate = todayDate;
        console.log(`🔧 Auto-set companyDate to ${todayDate} for new vehicle with company=true`);
      }
      
      // For new vehicles, clean up the "By" tracking fields (they'll be set by backend)
      delete formattedData.registeredToBy;
      delete formattedData.companyBy;
    }
    
    // Separate normal boolean fields from string-boolean fields
    const booleanFields = ['winterTires', 'damageCheck', 'roadsideAssistance', 
      'spareKey', 'wokNotification', 'seatcovers', 'backupbeepers', 'spareTire', 'toolsAndJack', 'gps', 'adBlue'];
    
    // These fields are stored as strings in the database despite being boolean in the UI
    const stringBooleanFields = ['registeredTo', 'company'];
    
    booleanFields.forEach(field => {
      // Convert any value to a proper boolean
      if (field in formattedData) {
        if (formattedData[field] === "" || formattedData[field] === "false" || formattedData[field] === false || formattedData[field] === null || formattedData[field] === undefined) {
          formattedData[field] = false;
        } else {
          formattedData[field] = true;
        }
      } else {
        // If field is missing, set it to false
        formattedData[field] = false; 
      }
    });
    
    // Handle string-boolean fields differently - convert to strings "true" or "false"
    stringBooleanFields.forEach(field => {
      // Convert any value to a string representation of boolean
      if (field in formattedData) {
        if (formattedData[field] === "" || formattedData[field] === "false" || formattedData[field] === false || formattedData[field] === null || formattedData[field] === undefined) {
          formattedData[field] = "false";
        } else {
          formattedData[field] = "true";
        }
      } else {
        // If field is missing, set it to "false"
        formattedData[field] = "false"; 
      }
    });
    
    // Clean up date fields if they're empty strings
    Object.keys(formattedData).forEach(key => {
      if (key.toLowerCase().includes('date') && formattedData[key] === "") {
        formattedData[key] = null;
      }
    });
    
    console.log("Processed vehicle data:", formattedData);
    
    // If a submission override was provided, use that instead of our default flow
    if (onSubmitOverride && typeof onSubmitOverride === 'function') {
      console.log("Using submission override function");
      return onSubmitOverride(formattedData);
    }
    
    try {
      // First, check if we're making a registration status change
      const previousData = initialData || {};
      
      // Convert string "true"/"false" to actual booleans for comparison
      const prevRegisteredTo = previousData.registeredTo === "true" || previousData.registeredTo === true;
      const prevCompany = previousData.company === "true" || previousData.company === true;
      const newRegisteredTo = formattedData.registeredTo === "true" || formattedData.registeredTo === true;
      const newCompany = formattedData.company === "true" || formattedData.company === true;
      
      // Check if there's an actual change in registration status
      const isRegStatusChange = editMode && (
        (prevRegisteredTo !== newRegisteredTo) || 
        (prevCompany !== newCompany)
      );
      
      console.log("Previous registration status:", {
        registeredTo: prevRegisteredTo,
        company: prevCompany
      });
      
      console.log("New registration status:", {
        registeredTo: newRegisteredTo,
        company: newCompany
      });
      
      console.log("Registration status change detected:", isRegStatusChange);
      
      // Track the response data
      let responseData;
      
      // If we're changing registration status, use the dedicated endpoint first
      if (isRegStatusChange && editMode) {
        console.log("Using dedicated registration toggle endpoint");
        
        // Determine which status we're changing to based on new values
        // We now have 4 possible toggles:
        // - opnaam: Set registeredTo to true
        // - not-opnaam: Set registeredTo to false
        // - bv: Set company to true
        // - not-bv: Set company to false
        
        // Important: When toggling one status, automatically turn off the other
        // to maintain the business rule that a car can't be both Opnaam and BV
        let toggleStatus = null;
        
        // Determine the dominant change: prioritise the field being turned ON (→true)
        // over the one being turned off. This handles the case where both change
        // simultaneously (e.g. Opnaam true→false AND BV false→true) and prevents
        // the wrong toggle status from being sent to the dedicated endpoint.
        if (newRegisteredTo && !prevRegisteredTo) {
          // Opnaam is being enabled
          toggleStatus = "opnaam";
          if (prevCompany) {
            console.log("Automatically disabling BV status because Opnaam is being activated");
            formattedData.company = "false";
          }
        } else if (newCompany && !prevCompany) {
          // BV is being enabled
          toggleStatus = "bv";
          if (prevRegisteredTo) {
            console.log("Automatically disabling Opnaam status because BV is being activated");
            formattedData.registeredTo = "false";
          }
        } else if (!newRegisteredTo && prevRegisteredTo) {
          // Opnaam is being disabled (and BV is NOT being enabled)
          toggleStatus = "not-opnaam";
        } else if (!newCompany && prevCompany) {
          // BV is being disabled (and Opnaam is NOT being enabled)
          toggleStatus = "not-bv";
        }
        
        console.log(`Selected toggle status: ${toggleStatus}`);
        
        // Call toggle endpoint if we've determined which status to change to
        if (toggleStatus) {
          console.log(`Sending toggle registration request with status: ${toggleStatus}`);
          
          const toggleResponse = await apiRequest(
            "PATCH",
            `/api/vehicles/${initialData.id}/toggle-registration`,
            { status: toggleStatus }
          );
          
          if (!toggleResponse.ok) {
            const errorData = await toggleResponse.json();
            console.error("Registration toggle error:", errorData);
            throw new Error(errorData.message || "Failed to update registration status");
          }
          
          // Remove ALL registration-related fields from the main update since we already handled them
          // This ensures we don't accidentally update registration tracking fields through the vehicle update
          delete formattedData.registeredTo;
          delete formattedData.company;
          delete formattedData.registeredToDate;
          delete formattedData.companyDate;
          delete formattedData.registeredToBy;
          delete formattedData.companyBy;
          // This is very important - we need to ensure that when using the dedicated endpoint,
          // we don't update any registration fields through the regular update endpoint
          
          // Get the initial response data
          responseData = await toggleResponse.json();
          console.log("Registration toggle response:", responseData);
        } else {
          console.warn("Could not determine appropriate toggle status, skipping dedicated endpoint");
        }
      }
      
      // If there are still fields to update OR we're creating a new vehicle, make the standard request
      if (Object.keys(formattedData).length > 0 || !editMode) {
        // Use apiRequest helper instead of raw fetch to ensure consistency
        const url = editMode ? `/api/vehicles/${initialData?.id}` : "/api/vehicles";
        console.log(`Sending API request to ${url}`);
        
        const response = await apiRequest(
          editMode ? "PATCH" : "POST", 
          url, 
          formattedData
        );
        
        console.log("API response status:", response.status);
        
        if (!response.ok) {
          const errorData = await response.json();
          console.error("API error:", errorData);
          throw new Error(errorData.message || "Failed to save vehicle data");
        }
        
        responseData = await response.json();
        console.log("API response data:", responseData);
      }
      
      // Force more aggressive cache invalidation
      
      // First invalidate all vehicle-related queries
      await invalidateByPrefix("/api/vehicles");
      
      // Invalidate dashboard queries that might show vehicle data
      await invalidateByPrefix("/api/dashboard");
      
      // Also invalidate the specific vehicle query if we're in edit mode with a refetchType of "all"
      if (editMode && initialData?.id) {
        await invalidateByPrefix(`/api/vehicles/${initialData.id}`);
      }
      
      toast({
        title: editMode ? t('vehicleForm.toasts.vehicleUpdatedTitle') : t('vehicleForm.toasts.vehicleCreatedTitle'),
        description: editMode ? t('vehicleForm.toasts.vehicleUpdatedDescription') : t('vehicleForm.toasts.vehicleCreatedDescription'),
      });

      // If a success callback was provided, call it with the response data
      if (onSuccess && typeof onSuccess === 'function') {
        console.log("Calling onSuccess callback from onSubmit");
        onSuccess(responseData);
        // When a callback is provided, we assume it will handle navigation
        return;
      }
      
      // Only navigate if redirectToList is true and we didn't call onSuccess
      if (redirectToList) {
        console.log("Navigating from onSubmit based on redirectToList flag");
        if (editMode && initialData?.id) {
          // Navigate to vehicle details page when updating
          navigate(`/vehicles/${initialData.id}`);
        } else {
          // Navigate to vehicles list for new vehicles
          navigate("/vehicles");
        }
      } else {
        console.log("Not navigating from onSubmit because redirectToList is false");
      }
    } catch (error: any) {
      console.error("API request failed:", error);
      toast({
        title: t('vehicleForm.toasts.saveFailedTitle'),
        description: editMode
          ? t('vehicleForm.toasts.saveFailedDescriptionUpdate', { message: error.message })
          : t('vehicleForm.toasts.saveFailedDescriptionCreate', { message: error.message }),
        variant: "destructive",
      });
    }
  };

  const handleLookup = () => {
    const licensePlate = form.getValues("licensePlate");
    if (!licensePlate) {
      toast({
        title: t('vehicleForm.toasts.licensePlateRequiredTitle'),
        description: t('vehicleForm.toasts.licensePlateRequiredDescription'),
        variant: "destructive",
      });
      return;
    }
    
    setIsLookingUp(true);
    lookupVehicleMutation.mutate(licensePlate);
  };

  
  return (
    <Card>
      <CardHeader>
        <CardTitle>{editMode ? t('editDialog.title') : t('addDialog.title')}</CardTitle>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="flex flex-col md:flex-row gap-4 mb-4">
              <div className="flex-1">
                <FormField
                  control={form.control}
                  name="licensePlate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('vehicleForm.licensePlateLabel')}</FormLabel>
                      <div className="flex gap-2">
                        <FormControl>
                          <Input
                            placeholder={t('vehicleForm.licensePlatePlaceholder')}
                            {...field}
                            onChange={(e) => {
                              const formatted = formatLicensePlate(e.target.value);
                              field.onChange(formatted);
                            }}
                          />
                        </FormControl>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={handleLookup}
                          disabled={isLookingUp || lookupVehicleMutation.isPending}
                          data-testid="button-lookup"
                        >
                          {isLookingUp ? (
                            <span className="flex items-center">
                              <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                              </svg>
                              {t('vehicleForm.lookupButtonLoading')}
                            </span>
                          ) : (
                            t('vehicleForm.lookupButton')
                          )}
                        </Button>
                      </div>
                      <FormDescription>
                        {t('vehicleForm.licensePlateDescription')}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>
            
            <Tabs defaultValue="general">
              <TabsList className="grid w-full grid-cols-5">
                <TabsTrigger value="general">{t('vehicleForm.tabs.general')}</TabsTrigger>
                <TabsTrigger value="technical">{t('vehicleForm.tabs.technical')}</TabsTrigger>
                <TabsTrigger value="dates">{t('vehicleForm.tabs.dates')}</TabsTrigger>
                <TabsTrigger value="contract">{t('vehicleForm.tabs.contract')}</TabsTrigger>
                <TabsTrigger value="additional">{t('vehicleForm.tabs.additional')}</TabsTrigger>
              </TabsList>

              <TabsContent value="general" className="space-y-4 mt-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Column 1 */}
                  <FormField
                    control={form.control}
                    name="brand"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('vehicleForm.brandLabel')}</FormLabel>
                        <FormControl>
                          <Input
                            placeholder={t('vehicleForm.brandPlaceholder')}
                            {...field}
                            onChange={(e) => field.onChange(capitalizeWords(e.target.value))}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Column 2 */}
                  <FormField
                    control={form.control}
                    name="model"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('vehicleForm.modelLabel')}</FormLabel>
                        <FormControl>
                          <Input
                            placeholder={t('vehicleForm.modelPlaceholder')}
                            {...field}
                            onChange={(e) => field.onChange(capitalizeWords(e.target.value))}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Column 1 - Vehicle Type Dropdown */}
                  <FormField
                    control={form.control}
                    name="vehicleType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('vehicleForm.vehicleTypeLabel')}</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          defaultValue={handleFieldValue(field.value) || undefined}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder={t('vehicleForm.vehicleTypePlaceholder')} />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {vehicleTypes.map(type => (
                              <SelectItem key={type} value={type}>
                                {t(`vehicleForm.vehicleTypes.${VEHICLE_TYPE_KEYS[type]}`, { defaultValue: type })}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Column 2 - Chassis Number */}
                  <FormField
                    control={form.control}
                    name="chassisNumber"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('vehicleForm.chassisNumberLabel')}</FormLabel>
                        <FormControl>
                          <Input placeholder={t('vehicleForm.chassisNumberPlaceholder')} {...field} value={handleFieldValue(field.value)} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Column 1 - Custom Vehicle Type Input */}
                  <FormField
                    control={form.control}
                    name="vehicleType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('vehicleForm.customVehicleTypeLabel')}</FormLabel>
                        <FormControl>
                          <Input
                            placeholder={t('vehicleForm.customVehicleTypePlaceholder')}
                            value={handleFieldValue(field.value)}
                            onChange={field.onChange}
                            data-testid="input-vehicle-type-custom"
                          />
                        </FormControl>
                        <FormDescription className="text-xs">
                          {t('vehicleForm.customVehicleTypeDescription')}
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Column 2 - Availability Status */}
                  <FormField
                    control={form.control}
                    name="availabilityStatus"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('vehicleForm.availabilityStatusLabel')}</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          defaultValue={handleFieldValue(field.value) || "available"}
                        >
                          <FormControl>
                            <SelectTrigger data-testid="select-availability-status">
                              <SelectValue placeholder={t('vehicleForm.availabilityStatusPlaceholder')} />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="available">{t('vehicleForm.availabilityStatuses.available')}</SelectItem>
                            <SelectItem value="needs_fixing">{t('vehicleForm.availabilityStatuses.needsFixing')}</SelectItem>
                            <SelectItem value="not_for_rental">{t('vehicleForm.availabilityStatuses.notForRental')}</SelectItem>
                            <SelectItem value="rented">{t('vehicleForm.availabilityStatuses.rented')}</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormDescription className="text-xs">
                          {t('vehicleForm.availabilityStatusDescription')}
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </TabsContent>
              
              <TabsContent value="technical" className="space-y-4 mt-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="fuel"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('vehicleForm.fuelTypeLabel')}</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          defaultValue={handleFieldValue(field.value) || undefined}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder={t('vehicleForm.fuelTypePlaceholder')} />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {fuelTypes.map(type => (
                              <SelectItem key={type} value={type}>
                                {t(`vehicleForm.fuelTypes.${FUEL_TYPE_KEYS[type]}`, { defaultValue: type })}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="recommendedOil"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('vehicleForm.recommendedOilLabel')}</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          defaultValue={handleFieldValue(field.value) || undefined}
                        >
                          <FormControl>
                            <SelectTrigger data-testid="select-recommended-oil">
                              <SelectValue placeholder={t('vehicleForm.recommendedOilPlaceholder')} />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent className="max-h-[300px]">
                            {OIL_GRADES.map(grade => (
                              <SelectItem key={grade} value={grade}>{grade}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormDescription className="text-xs">
                          {t('vehicleForm.recommendedOilDescription')}
                        </FormDescription>
                        <FormControl>
                          <Input
                            placeholder={t('vehicleForm.recommendedOilCustomPlaceholder')}
                            value={handleFieldValue(field.value)}
                            onChange={field.onChange}
                            data-testid="input-recommended-oil-custom"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="adBlue"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-md border p-4">
                        <div className="space-y-0.5">
                          <FormLabel>{t('vehicleForm.adBlueLabel')}</FormLabel>
                          <FormDescription>
                            {t('vehicleForm.adBlueDescription')}
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value as boolean}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="gps"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-md border p-4">
                        <div className="space-y-0.5">
                          <FormLabel>{t('vehicleForm.gpsLabel')}</FormLabel>
                          <FormDescription>
                            {t('vehicleForm.gpsDescription')}
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value as boolean}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  
                  {form.watch('gps') && (
                    <>
                      <FormField
                        control={form.control}
                        name="imei"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t('vehicleForm.imeiLabel')}</FormLabel>
                            <div className="flex gap-2">
                              <FormControl>
                                <Input placeholder={t('vehicleForm.imeiPlaceholder')} {...field} value={handleFieldValue(field.value)} />
                              </FormControl>
                              <Dialog open={isGpsDialogOpen} onOpenChange={setIsGpsDialogOpen}>
                                <DialogTrigger asChild>
                                  <Button type="button" variant="outline" size="sm" className="whitespace-nowrap" data-testid="button-gps-activation">
                                    <Mail className="h-4 w-4 mr-1" />
                                    {t('vehicleForm.activateGpsButton')}
                                  </Button>
                                </DialogTrigger>
                                <DialogContent className="sm:max-w-[500px]">
                                  <DialogHeader>
                                    <DialogTitle>{t('vehicleForm.gpsActivationRequestTitle')}</DialogTitle>
                                    <DialogDescription>
                                      {t('vehicleForm.gpsActivationRequestDescription')}
                                    </DialogDescription>
                                  </DialogHeader>
                                  <GPSActivationDialog 
                                    vehicleData={{
                                      brand: form.getValues('brand') || '',
                                      model: form.getValues('model') || '',
                                      licensePlate: form.getValues('licensePlate') || '',
                                      imei: field.value || ''
                                    }}
                                    onSuccess={() => setIsGpsDialogOpen(false)}
                                    onAutoSave={async (isSwap: boolean) => {
                                      // Save directly using mutation without triggering onSuccess callback
                                      if (editMode && initialData?.id) {
                                        // Get current form data
                                        const formData = form.getValues();
                                        
                                        // Update GPS activation fields
                                        const updatedData = {
                                          ...formData,
                                          gps: true,
                                          gpsActivated: true,
                                          gpsSwapped: isSwap ? true : formData.gpsSwapped
                                        };
                                        
                                        try {
                                          const response = await apiRequest("PATCH", `/api/vehicles/${initialData.id}`, updatedData);
                                          
                                          if (response.ok) {
                                            // Update form state to reflect saved values
                                            form.setValue('gps', true);
                                            form.setValue('gpsActivated', true);
                                            if (isSwap) {
                                              form.setValue('gpsSwapped', true);
                                            }
                                            
                                            // Invalidate queries to refresh data
                                            await invalidateByPrefix(`/api/vehicles/${initialData.id}`);
                                            await invalidateByPrefix("/api/vehicles");
                                            
                                            toast({
                                              title: t('vehicleForm.toasts.gpsSettingsSavedTitle'),
                                              description: isSwap
                                                ? t('vehicleForm.toasts.gpsSettingsSavedDescriptionSwapped')
                                                : t('vehicleForm.toasts.gpsSettingsSavedDescriptionActivated'),
                                            });
                                          }
                                        } catch (error) {
                                          console.error("Failed to save GPS settings:", error);
                                        }
                                      }
                                    }}
                                  />
                                </DialogContent>
                              </Dialog>
                            </div>
                            <FormDescription>
                              {t('vehicleForm.imeiDescription')}
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <div className="grid grid-cols-2 gap-4">
                        <FormField
                          control={form.control}
                          name="gpsSwapped"
                          render={({ field }) => (
                            <FormItem className="flex flex-row items-center justify-between rounded-md border p-4">
                              <div className="space-y-0.5">
                                <FormLabel>{t('vehicleForm.gpsSwappedLabel')}</FormLabel>
                                <FormDescription className="text-xs">
                                  {t('vehicleForm.gpsSwappedDescription')}
                                </FormDescription>
                              </div>
                              <FormControl>
                                <Switch
                                  checked={field.value as boolean}
                                  onCheckedChange={field.onChange}
                                />
                              </FormControl>
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="gpsActivated"
                          render={({ field }) => (
                            <FormItem className="flex flex-row items-center justify-between rounded-md border p-4">
                              <div className="space-y-0.5">
                                <FormLabel>{t('vehicleForm.gpsActivatedLabel')}</FormLabel>
                                <FormDescription className="text-xs">
                                  {t('vehicleForm.gpsActivatedDescription')}
                                </FormDescription>
                              </div>
                              <FormControl>
                                <Switch
                                  checked={field.value as boolean}
                                  onCheckedChange={field.onChange}
                                />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                      </div>
                    </>
                  )}

                  <FormField
                    control={form.control}
                    name="roadsideAssistance"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-md border p-4">
                        <div className="space-y-0.5">
                          <FormLabel>{t('vehicleForm.roadsideAssistanceLabel')}</FormLabel>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value as boolean}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="spareKey"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-md border p-4">
                        <div className="space-y-0.5">
                          <FormLabel>{t('vehicleForm.spareKeyLabel')}</FormLabel>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value as boolean}
                            onCheckedChange={(checked) => {
                              field.onChange(checked);
                              // Clear the "with customer" fields if spare key is turned off
                              if (!checked) {
                                form.setValue('spareKeyWithCustomer', false);
                                form.setValue('spareKeyCustomerName', '');
                              }
                            }}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  
                  {/* Show "Spare Key with Customer" only when Spare Key is ON */}
                  {form.watch('spareKey') && (
                    <>
                      <FormField
                        control={form.control}
                        name="spareKeyWithCustomer"
                        render={({ field }) => (
                          <FormItem className="flex flex-row items-center justify-between rounded-md border p-4 ml-4 border-l-4 border-l-orange-400">
                            <div className="space-y-0.5">
                              <FormLabel>{t('vehicleForm.spareKeyWithCustomerLabel')}</FormLabel>
                              <p className="text-xs text-muted-foreground">{t('vehicleForm.spareKeyWithCustomerDescription')}</p>
                            </div>
                            <FormControl>
                              <Switch
                                checked={field.value as boolean}
                                onCheckedChange={(checked) => {
                                  field.onChange(checked);
                                  // Clear customer name if toggled off
                                  if (!checked) {
                                    form.setValue('spareKeyCustomerName', '');
                                  }
                                }}
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                      
                      {/* Show customer name input when "with customer" is ON */}
                      {form.watch('spareKeyWithCustomer') && (
                        <FormField
                          control={form.control}
                          name="spareKeyCustomerName"
                          render={({ field }) => (
                            <FormItem className="ml-4 border-l-4 border-l-orange-400 pl-4">
                              <FormLabel>{t('vehicleForm.customerNameLabel')}</FormLabel>
                              <FormControl>
                                <div className="space-y-2">
                                  <Input
                                    placeholder={t('vehicleForm.customerNamePlaceholder')}
                                    {...field}
                                    value={field.value || ''}
                                  />
                                  {currentRenterName && (
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      className="text-xs"
                                      onClick={() => form.setValue('spareKeyCustomerName', currentRenterName)}
                                      data-testid="button-use-current-renter"
                                    >
                                      {t('vehicleForm.useCurrentRenterButton', { name: currentRenterName })}
                                    </Button>
                                  )}
                                </div>
                              </FormControl>
                              <p className="text-xs text-muted-foreground">{t('vehicleForm.customerNameDescription')}</p>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      )}
                    </>
                  )}
                  
                  <FormField
                    control={form.control}
                    name="winterTires"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-md border p-4">
                        <div className="space-y-0.5">
                          <FormLabel>{t('vehicleForm.winterTiresLabel')}</FormLabel>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value as boolean}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="wokNotification"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-md border p-4">
                        <div className="space-y-0.5">
                          <FormLabel>{t('vehicleForm.wokNotificationLabel')}</FormLabel>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value as boolean}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="seatcovers"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-md border p-4">
                        <div className="space-y-0.5">
                          <FormLabel>{t('vehicleForm.seatCoversLabel')}</FormLabel>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value as boolean}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="backupbeepers"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-md border p-4">
                        <div className="space-y-0.5">
                          <FormLabel>{t('vehicleForm.backupBeepersLabel')}</FormLabel>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value as boolean}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="spareTire"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-md border p-4">
                        <div className="space-y-0.5">
                          <FormLabel>{t('vehicleForm.spareTireLabel')}</FormLabel>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value as boolean}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="toolsAndJack"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-md border p-4">
                        <div className="space-y-0.5">
                          <FormLabel>{t('vehicleForm.toolsAndJackLabel')}</FormLabel>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value as boolean}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                
                  <FormField
                    control={form.control}
                    name="tireSize"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('vehicleForm.tireSizeLabel')}</FormLabel>
                        <FormControl>
                          <Input placeholder={t('vehicleForm.tireSizePlaceholder')} {...field} value={handleFieldValue(field.value)} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="radioCode"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('vehicleForm.radioCodeLabel')}</FormLabel>
                        <FormControl>
                          <Input placeholder={t('vehicleForm.radioCodePlaceholder')} {...field} value={handleFieldValue(field.value)} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                </div>
              </TabsContent>

              <TabsContent value="dates" className="space-y-4 mt-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="apkDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('vehicleForm.apkDateLabel')}</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} value={handleFieldValue(field.value)} />
                        </FormControl>
                        <FormDescription>
                          {t('vehicleForm.apkDateDescription')}
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="warrantyEndDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('vehicleForm.warrantyEndDateLabel')}</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} value={handleFieldValue(field.value)} />
                        </FormControl>
                        <FormDescription>
                          {t('vehicleForm.warrantyEndDateDescription')}
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="productionDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('vehicleForm.productionDateLabel')}</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} value={handleFieldValue(field.value)} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="col-span-2 mb-4">
                    <h3 className="text-sm font-medium mb-2">{t('vehicleForm.registrationStatusHeading')}</h3>
                  </div>

                  <FormField
                    control={form.control}
                    name="registeredTo"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-md border p-4">
                        <div className="space-y-0.5">
                          <FormLabel>{t('vehicleForm.registeredToLabel')}</FormLabel>
                          <FormDescription>
                            {t('vehicleForm.registeredToDescription')}
                          </FormDescription>
                          {field.value && (
                            <FormDescription className="text-xs text-muted-foreground">
                              {t('vehicleForm.lastUpdatedLabel', { date: form.getValues().registeredToDate || t('vehicleForm.notSet') })}
                            </FormDescription>
                          )}
                        </div>
                        <FormControl>
                          <Switch
                            checked={!!field.value}
                            onCheckedChange={(checked) => {
                              // Store as boolean in form for UI consistency
                              field.onChange(checked);
                              if (checked) {
                                // If registeredTo is turned on, turn off company (as boolean for UI)
                                form.setValue('company', false);
                                // Clear company date and set registration date
                                form.setValue('companyDate', '');
                                
                                // Use RDW registration date if available, otherwise use today's date
                                const currentRegistrationDate = form.getValues('registeredToDate');
                                if (!currentRegistrationDate) {
                                  // Only set today's date if no RDW date is available
                                  form.setValue('registeredToDate', new Date().toISOString().split('T')[0]);
                                }
                                // If currentRegistrationDate exists (from RDW), keep it as is
                              }
                            }}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="registeredToDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('vehicleForm.registrationDateLabel')}</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} value={handleFieldValue(field.value)} />
                        </FormControl>
                        <FormDescription>
                          {t('vehicleForm.registrationDateDescription')}
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="company"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-md border p-4">
                        <div className="space-y-0.5">
                          <FormLabel>{t('vehicleForm.companyLabel')}</FormLabel>
                          <FormDescription>
                            {t('vehicleForm.companyDescription')}
                          </FormDescription>
                          {field.value && (
                            <FormDescription className="text-xs text-muted-foreground">
                              {t('vehicleForm.lastUpdatedLabel', { date: form.getValues().companyDate || t('vehicleForm.notSet') })}
                            </FormDescription>
                          )}
                        </div>
                        <FormControl>
                          <Switch
                            checked={!!field.value}
                            onCheckedChange={(checked) => {
                              // Store as boolean in form for UI consistency
                              field.onChange(checked);
                              if (checked) {
                                // If company is turned on, turn off registeredTo (as boolean for UI)
                                form.setValue('registeredTo', false);
                                // Clear registration date and set company date to today
                                form.setValue('registeredToDate', '');
                                form.setValue('companyDate', new Date().toISOString().split('T')[0]);
                              }
                            }}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="companyDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('vehicleForm.companyDateLabel')}</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} value={handleFieldValue(field.value)} />
                        </FormControl>
                        <FormDescription>
                          {t('vehicleForm.companyDateDescription')}
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="euroZoneEndDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('vehicleForm.euroZoneEndDateLabel')}</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} value={handleFieldValue(field.value)} />
                        </FormControl>
                        <FormDescription>
                          {t('vehicleForm.euroZoneEndDateDescription')}
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="euroZoneAccess"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                        <FormControl>
                          <Switch
                            checked={!!field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                        <div className="space-y-1 leading-none">
                          <FormLabel>
                            {t('vehicleForm.emissionsZoneAccessLabel')}
                          </FormLabel>
                          <FormDescription>
                            {t('vehicleForm.emissionsZoneAccessDescription')}
                          </FormDescription>
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="euroZonePaidPermitAccess"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                        <FormControl>
                          <Switch
                            checked={!!field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                        <div className="space-y-1 leading-none">
                          <FormLabel>
                            {t('vehicleForm.paidPermitAccessLabel')}
                          </FormLabel>
                          <FormDescription>
                            {t('vehicleForm.paidPermitAccessDescription')}
                          </FormDescription>
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="moveIziRegistered"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                        <FormControl>
                          <Switch
                            checked={!!field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                        <div className="space-y-1 leading-none">
                          <FormLabel>
                            {t('vehicleForm.moveIziLabel')}
                          </FormLabel>
                          <FormDescription>
                            {t('vehicleForm.moveIziDescription')}
                          </FormDescription>
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="moveIziRegistrationDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('vehicleForm.moveIziRegistrationDateLabel')}</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} value={handleFieldValue(field.value)} />
                        </FormControl>
                        <FormDescription>
                          {t('vehicleForm.moveIziRegistrationDateDescription')}
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="moveIziExpirationDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('vehicleForm.moveIziExpirationDateLabel')}</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} value={handleFieldValue(field.value)} />
                        </FormControl>
                        <FormDescription>
                          {t('vehicleForm.moveIziExpirationDateDescription')}
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                </div>
              </TabsContent>
              
              <TabsContent value="contract" className="space-y-4 mt-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="monthlyPrice"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('vehicleForm.monthlyPriceLabel')}</FormLabel>
                        <FormControl>
                          <Input type="number" step="0.01" placeholder="0.00" {...field} value={handleFieldValue(field.value)} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="dailyPrice"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('vehicleForm.dailyPriceLabel')}</FormLabel>
                        <FormControl>
                          <Input type="number" step="0.01" placeholder="0.00" {...field} value={handleFieldValue(field.value)} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="returnMileage"
                    render={({ field: { onChange, ...restField } }) => (
                      <FormItem>
                        <FormLabel>{t('vehicleForm.returnMileageLabel')} <span className="text-sm font-normal text-muted-foreground">{t('vehicleForm.returnMileageOptional')}</span></FormLabel>
                        <FormControl>
                          <Input 
                            type="number" 
                            placeholder="0" 
                            {...restField} 
                            value={restField.value ?? ''}
                            onChange={(e) => {
                              const value = e.target.value === '' ? '' : e.target.value;
                              onChange(value);
                            }}
                          />
                        </FormControl>
                        <FormDescription>
                          {t('vehicleForm.returnMileageDescription')}
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </TabsContent>

              <TabsContent value="additional" className="space-y-4 mt-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <FormField
                      control={form.control}
                      name="internalAppointments"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('vehicleForm.internalAppointmentsLabel')}</FormLabel>
                          <FormControl>
                            <textarea
                              className="flex min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                              placeholder={t('vehicleForm.internalAppointmentsPlaceholder')}
                              {...field}
                              value={handleFieldValue(field.value)}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="col-span-2">
                    <FormField
                      control={form.control}
                      name="remarks"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('vehicleForm.remarksLabel')}</FormLabel>
                          <FormControl>
                            <textarea
                              className="flex min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                              placeholder={t('vehicleForm.remarksPlaceholder')}
                              {...field}
                              value={handleFieldValue(field.value)}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>
              </TabsContent>
            </Tabs>

            <div className="flex justify-end space-x-2">
              {customCancelButton ? (
                customCancelButton
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => navigate("/vehicles")}
                >
                  {t('common:actions.cancel')}
                </Button>
              )}
              <Button
                type="button" 
                disabled={createVehicleMutation.isPending}
                onClick={async () => {
                  // Debug: Log form state before submission
                  console.log("🚗 Update Vehicle button clicked");
                  console.log("🔍 Form values:", form.getValues());
                  console.log("🔍 Form errors before validation:", form.formState.errors);
                  
                  // Trigger form validation first
                  const isValid = await form.trigger();
                  console.log("🔍 Form is valid:", isValid);
                  
                  if (!isValid) {
                    console.log("❌ Form validation failed:", form.formState.errors);
                    return;
                  }
                  
                  // Form is valid, trigger submission
                  form.handleSubmit(onSubmit)();
                }}
              >
                {createVehicleMutation.isPending ? (
                  <span className="flex items-center">
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    {t('vehicleForm.savingButton')}
                  </span>
                ) : (
                  editMode ? t('vehicleForm.updateButton') : t('vehicleForm.addButton')
                )}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
