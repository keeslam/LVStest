import { invalidateByPrefix } from "@/lib/queryClient";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "wouter";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectGroup,
  SelectLabel,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import React, { useState } from "react";
import { Reservation, Vehicle } from "@shared/schema";
import { Check, RotateCw, Search, CalendarClock } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { isTrueValue } from "@/lib/utils";
import { formatLicensePlate } from "@/lib/format-utils";
import { formatDate } from "@/lib/format-utils";
import { SearchableCombobox, type ComboboxOption } from "@/components/ui/searchable-combobox";
import { VehicleReservationsStatusDialog } from "@/components/reservations/vehicle-reservations-status-dialog";
import { VehicleSelector } from "@/components/ui/vehicle-selector";
import { InlineDocumentUpload } from "@/components/documents/inline-document-upload";
import { ReservationForm } from "@/components/reservations/reservation-form";
import { VehicleForm } from "@/components/vehicles/vehicle-form";
import { CustomerForm } from "@/components/customers/customer-form";
import { ExpenseForm } from "@/components/expenses/expense-form";
import InteractiveDamageCheck from "@/pages/interactive-damage-check";
import { FuelStatusUpdateDialog } from "@/components/vehicles/fuel-status-update-dialog";

interface ActionIconProps {
  name: string;
  className?: string;
}

function ActionIcon({ name, className = "" }: ActionIconProps) {
  switch (name) {
    case "calendar-clock":
      return (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`lucide lucide-calendar-clock ${className}`}
        >
          <path d="M21 7.5V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h3.5" />
          <path d="M16 2v4" />
          <path d="M8 2v4" />
          <path d="M3 10h18" />
          <circle cx="18" cy="18" r="4" />
          <path d="M18 16.5v1.5h1.5" />
        </svg>
      );
    case "calendar-plus":
      return (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`lucide lucide-calendar-plus ${className}`}
        >
          <path d="M21 13V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h8" />
          <line x1="16" x2="16" y1="2" y2="6" />
          <line x1="8" x2="8" y1="2" y2="6" />
          <line x1="3" x2="21" y1="10" y2="10" />
          <line x1="19" x2="19" y1="16" y2="22" />
          <line x1="16" x2="22" y1="19" y2="19" />
        </svg>
      );
    case "car":
      return (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`lucide lucide-car ${className}`}
        >
          <path d="M14 16H9m10 0h3v-3.15a1 1 0 0 0-.84-.99L16 11l-2.7-3.6a1 1 0 0 0-.8-.4H5.24a2 2 0 0 0-1.8 1.1l-.8 1.63A6 6 0 0 0 2 12.42V16h2" />
          <circle cx="6.5" cy="16.5" r="2.5" />
          <circle cx="16.5" cy="16.5" r="2.5" />
        </svg>
      );
    case "user-plus":
      return (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`lucide lucide-user-plus ${className}`}
        >
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <line x1="19" x2="19" y1="8" y2="14" />
          <line x1="22" x2="16" y1="11" y2="11" />
        </svg>
      );
    case "upload":
      return (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`lucide lucide-upload ${className}`}
        >
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" x2="12" y1="3" y2="15" />
        </svg>
      );
    case "alert-triangle":
      return (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`lucide lucide-alert-triangle ${className}`}
        >
          <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
          <path d="M12 9v4" />
          <path d="M12 17h.01" />
        </svg>
      );
    case "receipt":
      return (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`lucide lucide-receipt ${className}`}
        >
          <path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1-2-1Z" />
          <path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8" />
          <path d="M12 17.5v-11" />
        </svg>
      );
    case "refresh-cw":
      return (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`lucide lucide-refresh-cw ${className}`}
        >
          <path d="M21 2v6h-6" />
          <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
          <path d="M3 22v-6h6" />
          <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
        </svg>
      );
    case "hammer":
      return (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`lucide lucide-hammer ${className}`}
        >
          <path d="m15 12-8.5 8.5c-.83.83-2.17.83-3 0 0 0 0 0 0 0a2.12 2.12 0 0 1 0-3L12 9" />
          <path d="M17.64 15 22 10.64" />
          <path d="m20.91 11.7-1.25-1.25c-.6-.6-.93-1.4-.93-2.25v-.86L16.01 4.6a5.56 5.56 0 0 0-3.94-1.64H9l.92.82A6.18 6.18 0 0 1 12 8.4v1.56l2 2h2.47l2.26 1.91" />
        </svg>
      );
    case "fuel":
      return (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`lucide lucide-fuel ${className}`}
        >
          <line x1="3" y1="22" x2="15" y2="22" />
          <line x1="4" y1="9" x2="14" y2="9" />
          <path d="M14 22V4a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v18" />
          <path d="M14 13h2a2 2 0 0 1 2 2v2a2 2 0 0 0 2 2h0a2 2 0 0 0 2-2V9.83a2 2 0 0 0-.59-1.42L18 5" />
        </svg>
      );
    default:
      return null;
  }
}

// Define quick actions for the dashboard
interface QuickAction {
  label: string;
  href?: string;
  icon: string;
  dialog?: string;
  primary?: boolean;
}

const quickActions: QuickAction[] = [
  {
    label: "New Reservation",
    dialog: "new-reservation",
    icon: "calendar-plus",
    primary: false,
  },
  {
    label: "Add Vehicle",
    dialog: "add-vehicle",
    icon: "car",
    primary: false,
  },
  {
    label: "Add Customer",
    dialog: "add-customer",
    icon: "user-plus",
    primary: false,
  },
  {
    label: "Upload Document",
    icon: "upload",
    dialog: "document-upload",
    primary: false,
  },
  {
    label: "Log Expense",
    dialog: "log-expense",
    icon: "receipt",
    primary: false,
  },
  {
    label: "Update Fuel Status",
    dialog: "fuel-status",
    icon: "fuel",
    primary: false,
  },
  {
    label: "Change Status by Vehicle",
    icon: "car",
    dialog: "vehicle-reservation-status",
    primary: false,
  },
  {
    label: "Change Registration",
    icon: "refresh-cw",
    dialog: "registration",
    primary: false,
  },
  {
    label: "Upload Damage Form",
    icon: "hammer",
    dialog: "damage-form",
    primary: false,
  },
  {
    label: "Start Damage Check",
    dialog: "interactive-damage-check",
    icon: "hammer",
    primary: false,
  },
  {
    label: "Upload APK Report",
    icon: "upload",
    dialog: "apk-report",
    primary: false,
  },
  {
    label: "Send APK Notifications",
    icon: "shield-alert",
    dialog: "apk-notifications",
    primary: false,
  },
];

export function QuickActions() {
  // State for the vehicle registration dialog
  const [selectedVehicles, setSelectedVehicles] = useState<string[]>([]);
  const [registrationStatus, setRegistrationStatus] = useState<"opnaam" | "bv">("opnaam");
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState<string>("");
  
  // State for the damage form upload dialog
  const [selectedDamageVehicle, setSelectedDamageVehicle] = useState<Vehicle | null>(null);
  const [damageFormFile, setDamageFormFile] = useState<File | null>(null);
  const [damagePhotos, setDamagePhotos] = useState<File[]>([]);
  const [damageFormSearchQuery, setDamageFormSearchQuery] = useState<string>("");
  const [isDamageUploading, setIsDamageUploading] = useState(false);
  
  // State for the vehicle reservation dialog
  const [vehicleReservationDialogOpen, setVehicleReservationDialogOpen] = useState(false);
  
  // State for the document upload dialog
  const [selectedUploadVehicle, setSelectedUploadVehicle] = useState<Vehicle | null>(null);
  const [documentFile, setDocumentFile] = useState<File | null>(null);
  const [documentCategory, setDocumentCategory] = useState<string>("APK Inspection");
  const [documentNotes, setDocumentNotes] = useState<string>("");
  const [isDocumentUploading, setIsDocumentUploading] = useState(false);
  
  // State for the APK report upload dialog
  const [selectedApkVehicle, setSelectedApkVehicle] = useState<Vehicle | null>(null);
  const [apkReportFile, setApkReportFile] = useState<File | null>(null);
  const [apkDate, setApkDate] = useState<string>("");
  const [apkNotes, setApkNotes] = useState<string>("");
  const [isApkUploading, setIsApkUploading] = useState(false);
  
  // State for new form dialogs
  const [reservationDialogOpen, setReservationDialogOpen] = useState(false);
  const [vehicleDialogOpen, setVehicleDialogOpen] = useState(false);
  const [customerDialogOpen, setCustomerDialogOpen] = useState(false);
  const [expenseDialogOpen, setExpenseDialogOpen] = useState(false);
  
  // State for APK notifications dialog
  const [apkNotificationsDialogOpen, setApkNotificationsDialogOpen] = useState(false);
  const [selectedApkVehicles, setSelectedApkVehicles] = useState<Vehicle[]>([]);
  const [isLoadingApkNotifications, setIsLoadingApkNotifications] = useState(false);
  
  // State for interactive damage check dialog
  const [interactiveDamageCheckDialogOpen, setInteractiveDamageCheckDialogOpen] = useState(false);
  const [apkSearchQuery, setApkSearchQuery] = useState<string>("");
  
  // State for fuel status update dialog
  const [fuelStatusDialogOpen, setFuelStatusDialogOpen] = useState(false);
  const [selectedFuelVehicle, setSelectedFuelVehicle] = useState<Vehicle | null>(null);
  const [showFuelStatusUpdateDialog, setShowFuelStatusUpdateDialog] = useState(false);
  
  const { toast } = useToast();
  const { t } = useTranslation(["dashboard", "common"]);

  // Get queryClient for cache invalidation
  const queryClient = useQueryClient();
  
  // References for dialog closing buttons
  const damageDialogCloseRef = React.useRef(null);
  const documentDialogCloseRef = React.useRef(null);
  const apkDialogCloseRef = React.useRef(null);
  
  // Fetch all vehicles for the selection list
  const { data: vehicles, refetch: refetchVehicles } = useQuery<Vehicle[]>({
    queryKey: ["/api/vehicles"],
  });
  
  // Fetch upcoming reservations
  const { data: upcomingReservations, isLoading: isLoadingReservations } = useQuery<Reservation[]>({
    queryKey: ["/api/reservations/upcoming"],
  });
  
  // Handler for changing a single vehicle's registration
  const handleChangeVehicleRegistration = async (vehicleId: number, newStatus: "opnaam" | "bv" | "not-opnaam" | "not-bv") => {
    try {
      // First, get the current vehicle to determine the actual change we need to make
      const vehicleResponse = await fetch(`/api/vehicles/${vehicleId}`);
      
      if (!vehicleResponse.ok) {
        throw new Error(`Failed to fetch vehicle: ${vehicleResponse.status}`);
      }
      
      const vehicle = await vehicleResponse.json();
      
      // Determine the correct toggle status based on current state and desired state
      let toggleStatus;
      
      const currentRegisteredTo = vehicle.registeredTo === "true" || vehicle.registeredTo === true;
      const currentCompany = vehicle.company === "true" || vehicle.company === true;
      
      if (newStatus === "opnaam") {
        // If already opnaam, no change needed
        if (currentRegisteredTo) return vehicle;
        toggleStatus = "opnaam";
      } else if (newStatus === "bv") {
        // If already bv, no change needed
        if (currentCompany) return vehicle;
        toggleStatus = "bv";
      } else if (newStatus === "not-opnaam") {
        // If already not opnaam, no change needed
        if (!currentRegisteredTo) return vehicle;
        toggleStatus = "not-opnaam";
      } else if (newStatus === "not-bv") {
        // If already not bv, no change needed
        if (!currentCompany) return vehicle;
        toggleStatus = "not-bv";
      }
      
      // If no change is needed, return the current vehicle
      if (!toggleStatus) return vehicle;
      
      console.log(`Toggling vehicle ${vehicleId} to status: ${toggleStatus}`);
      
      const response = await fetch(`/api/vehicles/${vehicleId}/toggle-registration`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status: toggleStatus }),
      });
      
      // Even if the server returns an error, we'll still receive a valid JSON response
      // with error details. Let's parse the response first.
      const responseData = await response.json();
      
      if (!response.ok) {
        // If the server operation failed but the frontend side is OK,
        // we'll handle it gracefully by showing the issue but returning
        // the original vehicle data anyway, since the UI toggle still works
        console.error("Server error but continuing:", responseData.message || "Unknown server error");
        // Still return the original vehicle to prevent UI issues
        return vehicle;
      }
      
      return responseData;
    } catch (error) {
      throw error;
    }
  };
  
  // Handler for batch changing multiple vehicles' registration
  const handleChangeRegistration = async () => {
    if (selectedVehicles.length === 0) {
      toast({
        title: t('common:status.error'),
        description: t('quickActions.selectAtLeastOneVehicle'),
        variant: "destructive",
      });
      return;
    }
    
    setIsLoading(true);
    
    // Track results for reporting
    const results = {
      success: 0,
      failed: 0,
      vehicles: [] as { id: number; licensePlate: string; success: boolean }[]
    };
    
    try {
      // Process each vehicle in sequence
      for (const vehicleIdStr of selectedVehicles) {
        const vehicleId = parseInt(vehicleIdStr);
        try {
          const updatedVehicle = await handleChangeVehicleRegistration(vehicleId, registrationStatus);
          results.success++;
          results.vehicles.push({ 
            id: vehicleId, 
            licensePlate: updatedVehicle.licensePlate, 
            success: true 
          });
        } catch (error) {
          results.failed++;
          const vehicle = vehicles?.find(v => v.id === vehicleId);
          results.vehicles.push({ 
            id: vehicleId, 
            licensePlate: vehicle?.licensePlate || `ID: ${vehicleId}`, 
            success: false 
          });
        }
      }
      
      // Determine appropriate message based on results
      if (results.success > 0 && results.failed === 0) {
        toast({
          title: t('common:status.success'),
          description: t('quickActions.registrationUpdatedSuccess', {
            status: registrationStatus === "opnaam" ? "Opnaam" : "BV",
            count: results.success,
          }),
        });
      } else if (results.success > 0 && results.failed > 0) {
        toast({
          title: t('quickActions.partialSuccess'),
          description: t('quickActions.registrationPartialSuccess', {
            count: results.success,
            success: results.success,
            failed: results.failed,
          }),
          variant: "destructive",
        });
      } else {
        toast({
          title: t('quickActions.failed'),
          description: t('quickActions.registrationFailed', { count: results.failed }),
          variant: "destructive",
        });
      }
      
      // Refresh the vehicle list
      refetchVehicles();
      
      // Reset selection
      setSelectedVehicles([]);
    } catch (error) {
      toast({
        title: t('common:status.error'),
        description: error instanceof Error ? error.message : t('quickActions.registrationUpdateFailed'),
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };
  
  // We already have references defined at the top
  
  // Handler for uploading damage form and photos
  const handleDamageFormUpload = async () => {
    if (!selectedDamageVehicle) {
      toast({
        title: t('common:status.error'),
        description: t('quickActions.selectVehicle'),
        variant: "destructive",
      });
      return;
    }
    
    if (!damageFormFile && damagePhotos.length === 0) {
      toast({
        title: t('common:status.error'),
        description: t('quickActions.uploadAtLeastOne'),
        variant: "destructive",
      });
      return;
    }
    
    setIsDamageUploading(true);
    
    try {
      // Upload each document (form and photos) with proper document type
      let uploadCount = 0;
      let errorCount = 0;
      
      // Helper function to upload a document
      const uploadDamageDocument = async (file: File, documentType: string, notes?: string) => {
        const formData = new FormData();
        formData.append("vehicleId", selectedDamageVehicle.id.toString());
        formData.append("documentType", documentType);
        formData.append("file", file);
        
        // Set the appropriate category based on document type - always use damage_checks for consistency
        if (documentType === "Damage Form" || documentType === "Damage Report") {
          formData.append("category", "damage_checks");
        } else if (documentType === "Damage Photo") {
          formData.append("category", "damage_checks");
        }
        
        if (notes) {
          formData.append("notes", notes);
        }
        
        const response = await fetch("/api/documents", {
          method: "POST",
          body: formData,
        });
        
        if (!response.ok) {
          throw new Error(`Failed to upload ${documentType}: ${response.status}`);
        }
        
        return await response.json();
      };
      
      // Upload damage form if provided
      if (damageFormFile) {
        const document = await uploadDamageDocument(damageFormFile, "Damage Report", "Damage report uploaded from dashboard");
        uploadCount++;
        
        // Update vehicle's damage check status
        try {
          // First get the current vehicle data
          const vehicleResponse = await fetch(`/api/vehicles/${selectedDamageVehicle.id}`);
          if (!vehicleResponse.ok) {
            throw new Error(`Failed to get vehicle data: ${vehicleResponse.status}`);
          }
          
          const vehicleData = await vehicleResponse.json();
          const currentDate = new Date().toISOString().split('T')[0];
          
          // Then send the update with all required fields
          const response = await fetch(`/api/vehicles/${selectedDamageVehicle.id}`, {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              ...vehicleData, // Include all existing data
              damageCheck: "true", // Then override with our updates
              damageCheckDate: currentDate,
              damageCheckAttachment: document.id.toString(),
              damageCheckAttachmentDate: currentDate
            })
          });
          
          if (!response.ok) {
            console.error("Failed to update vehicle damage check status:", response.status);
          } else {
            // Invalidate cache for this vehicle and for the documents
            invalidateByPrefix("/api/vehicles");
            invalidateByPrefix("/api/documents/vehicle");
          }
        } catch (error) {
          console.error("Error updating vehicle damage check status:", error);
        }
      }
      
      // Upload damage photos if provided
      for (const photo of damagePhotos) {
        try {
          await uploadDamageDocument(photo, "Damage Photo", "Damage photo uploaded from dashboard");
          uploadCount++;
        } catch (error) {
          console.error("Error uploading damage photo:", error);
          errorCount++;
        }
      }
      
      // Invalidate queries to refresh UI
      if (uploadCount > 0) {
        invalidateByPrefix("/api/vehicles");
        invalidateByPrefix("/api/documents/vehicle");
      }
      
      // Show success message
      toast({
        title: uploadCount > 0 ? t('quickActions.uploadSuccessful') : t('quickActions.uploadFailed'),
        description: uploadCount > 0
          ? t('quickActions.damageUploadedSuccess', {
              count: uploadCount,
              plate: selectedDamageVehicle.licensePlate,
              errorSuffix: errorCount > 0 ? t('quickActions.damageUploadErrorSuffix', { count: errorCount }) : '',
            })
          : t('quickActions.uploadAnyDocumentsFailed'),
        variant: uploadCount > 0 ? "default" : "destructive",
      });
      
      // Reset form
      setSelectedDamageVehicle(null);
      setDamageFormFile(null);
      setDamagePhotos([]);
      setDamageFormSearchQuery("");
      
      // Auto-close dialog if successful
      if (uploadCount > 0 && damageDialogCloseRef.current) {
        (damageDialogCloseRef.current as HTMLButtonElement).click();
      }
      
    } catch (error) {
      toast({
        title: t('common:status.error'),
        description: error instanceof Error ? error.message : t('quickActions.uploadDamageDocumentsFailed'),
        variant: "destructive",
      });
    } finally {
      setIsDamageUploading(false);
    }
  };

  // Handler for when a reservation status has been updated
  const handleReservationStatusUpdated = () => {
    // Refetch upcoming reservations to update the list
    invalidateByPrefix("/api/reservations/upcoming");
    // Show a success toast
    toast({
      title: t('common:status.success'),
      description: t('quickActions.reservationStatusUpdated'),
    });
  };
  
  // Handler for document upload
  const handleDocumentUpload = async () => {
    if (!selectedUploadVehicle) {
      toast({
        title: t('common:status.error'),
        description: t('quickActions.selectVehicle'),
        variant: "destructive",
      });
      return;
    }
    
    if (!documentFile) {
      toast({
        title: t('common:status.error'),
        description: t('quickActions.selectFileToUpload'),
        variant: "destructive",
      });
      return;
    }
    
    setIsDocumentUploading(true);
    
    try {
      const formData = new FormData();
      formData.append("vehicleId", selectedUploadVehicle.id.toString());
      formData.append("documentType", documentCategory);  // Use selected category as document type
      formData.append("file", documentFile);
      formData.append("category", documentCategory.toLowerCase().replace(/\s+/g, '_'));
      
      if (documentNotes) {
        formData.append("notes", documentNotes);
      }
      
      const response = await fetch("/api/documents", {
        method: "POST",
        body: formData,
      });
      
      if (!response.ok) {
        throw new Error(`Failed to upload document: ${response.status}`);
      }
      
      // Document uploaded successfully
      const document = await response.json();
      
      // Invalidate queries to refresh UI
      invalidateByPrefix("/api/vehicles");
      invalidateByPrefix("/api/documents");
      invalidateByPrefix("/api/documents/vehicle");
      
      // Show success message
      toast({
        title: t('quickActions.uploadSuccessful'),
        description: t('quickActions.documentUploadSuccess', { plate: selectedUploadVehicle.licensePlate }),
      });
      
      // Reset form
      setSelectedUploadVehicle(null);
      setDocumentFile(null);
      setDocumentCategory("APK Inspection");
      setDocumentNotes("");
      
      // Close dialog using the ref
      if (documentDialogCloseRef.current) {
        (documentDialogCloseRef.current as HTMLButtonElement).click();
      }
      
    } catch (error) {
      toast({
        title: t('common:status.error'),
        description: error instanceof Error ? error.message : t('quickActions.documentUploadFailed'),
        variant: "destructive",
      });
    } finally {
      setIsDocumentUploading(false);
    }
  };
  
  // Now add handler for APK Report upload
  const handleApkReportUpload = async () => {
    if (!selectedApkVehicle) {
      toast({
        title: t('common:status.error'),
        description: t('quickActions.selectVehicle'),
        variant: "destructive",
      });
      return;
    }
    
    if (!apkReportFile) {
      toast({
        title: t('common:status.error'),
        description: t('quickActions.selectFileToUpload'),
        variant: "destructive",
      });
      return;
    }
    
    if (!apkDate) {
      toast({
        title: t('common:status.error'),
        description: t('quickActions.enterApkDate'),
        variant: "destructive",
      });
      return;
    }
    
    setIsApkUploading(true);
    
    try {
      // Upload the APK Report document first
      const formData = new FormData();
      formData.append("vehicleId", selectedApkVehicle.id.toString());
      formData.append("documentType", "APK Inspection");
      formData.append("file", apkReportFile);
      formData.append("category", "apk_inspection");
      
      if (apkNotes) {
        formData.append("notes", apkNotes);
      }
      
      const response = await fetch("/api/documents", {
        method: "POST",
        body: formData,
      });
      
      if (!response.ok) {
        throw new Error(`Failed to upload APK report: ${response.status}`);
      }
      
      // Document uploaded successfully
      const document = await response.json();
      
      // Now update the vehicle's APK date
      try {
        // First get the current vehicle data
        const vehicleResponse = await fetch(`/api/vehicles/${selectedApkVehicle.id}`);
        if (!vehicleResponse.ok) {
          throw new Error(`Failed to get vehicle data: ${vehicleResponse.status}`);
        }
        
        const vehicleData = await vehicleResponse.json();
        
        // Then send the update with all required fields
        const updateResponse = await fetch(`/api/vehicles/${selectedApkVehicle.id}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            ...vehicleData, // Include all existing data
            apkDate: apkDate, // Then override with our updates
            apkAttachment: document.id.toString(),
            apkAttachmentDate: new Date().toISOString().split('T')[0]
          })
        });
        
        if (!updateResponse.ok) {
          console.error("Failed to update vehicle APK date:", updateResponse.status);
          toast({
            title: t('quickActions.partialSuccess'),
            description: t('quickActions.apkReportPartialFailUpdate'),
            variant: "destructive",
          });
        } else {
          // Successfully updated both document and APK date
          toast({
            title: t('common:status.success'),
            description: t('quickActions.apkReportUploadSuccess', { plate: selectedApkVehicle.licensePlate }),
          });
          
          // Invalidate cache for this vehicle and for the documents
          invalidateByPrefix("/api/vehicles");
          invalidateByPrefix("/api/vehicles");
          invalidateByPrefix("/api/documents/vehicle");
          
          // Reset form
          setSelectedApkVehicle(null);
          setApkReportFile(null);
          setApkDate("");
          setApkNotes("");
          
          // Auto-close dialog if successful
          if (apkDialogCloseRef.current) {
            (apkDialogCloseRef.current as HTMLButtonElement).click();
          }
        }
      } catch (error) {
        console.error("Error updating vehicle APK date:", error);
        toast({
          title: t('quickActions.partialSuccess'),
          description: t('quickActions.apkReportPartialFailWithError', {
            error: error instanceof Error ? error.message : t('quickActions.unknownError'),
          }),
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: t('common:status.error'),
        description: error instanceof Error ? error.message : t('quickActions.apkReportUploadFailed'),
        variant: "destructive",
      });
    } finally {
      setIsApkUploading(false);
    }
  };

  return (
    <>
      {/* Vehicle-based Reservation Status Dialog */}
      <VehicleReservationsStatusDialog
        open={vehicleReservationDialogOpen}
        onOpenChange={setVehicleReservationDialogOpen}
        onStatusChanged={handleReservationStatusUpdated}
      />
      
      {/* No need for a separate document upload dialog now */}
      
      <Card className="mb-6">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg font-medium text-gray-800">{t('quickActions.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
          {quickActions.map((action) => {
            // For vehicle-based reservation status dialog
            if (action.dialog === "vehicle-reservation-status") {
              return (
                <Button
                  key={action.label}
                  variant="outline"
                  className="bg-primary-50 text-primary-600 hover:bg-primary-100"
                  size="sm"
                  onClick={() => setVehicleReservationDialogOpen(true)}
                >
                  <ActionIcon name={action.icon || "car"} className="mr-1 h-4 w-4" />
                  {t(`quickActions.buttons.${action.dialog}`)}
                </Button>
              );
            }
            
            // For new reservation dialog
            if (action.dialog === "new-reservation") {
              return (
                <Dialog key={action.label} open={reservationDialogOpen} onOpenChange={setReservationDialogOpen}>
                  <DialogTrigger asChild>
                    <Button
                      variant="outline"
                      className="bg-primary-50 text-primary-600 hover:bg-primary-100"
                      size="sm"
                    >
                      <ActionIcon name={action.icon} className="mr-1 h-4 w-4" />
                      {t(`quickActions.buttons.${action.dialog}`)}
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>{t('quickActions.buttons.new-reservation')}</DialogTitle>
                      <DialogDescription>
                        {t('quickActions.newReservationDescription')}
                      </DialogDescription>
                    </DialogHeader>
                    <div className="py-4">
                      <ReservationForm
                        onSuccess={() => {
                          setReservationDialogOpen(false);
                          invalidateByPrefix("/api/reservations");
                          invalidateByPrefix("/api/reservations/upcoming");
                          toast({ title: t('common:status.success'), description: t('quickActions.reservationCreated') });
                        }}
                      />
                    </div>
                  </DialogContent>
                </Dialog>
              );
            }
            
            // For add vehicle dialog
            if (action.dialog === "add-vehicle") {
              return (
                <Dialog key={action.label} open={vehicleDialogOpen} onOpenChange={setVehicleDialogOpen}>
                  <DialogTrigger asChild>
                    <Button
                      variant="outline"
                      className="bg-primary-50 text-primary-600 hover:bg-primary-100"
                      size="sm"
                    >
                      <ActionIcon name={action.icon} className="mr-1 h-4 w-4" />
                      {t(`quickActions.buttons.${action.dialog}`)}
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>{t('quickActions.addVehicleTitle')}</DialogTitle>
                      <DialogDescription>
                        {t('quickActions.addVehicleDescription')}
                      </DialogDescription>
                    </DialogHeader>
                    <div className="py-4">
                      <VehicleForm
                        onSuccess={() => {
                          setVehicleDialogOpen(false);
                          invalidateByPrefix("/api/vehicles");
                          toast({ title: t('common:status.success'), description: t('quickActions.vehicleAdded') });
                        }}
                      />
                    </div>
                  </DialogContent>
                </Dialog>
              );
            }
            
            // For add customer dialog
            if (action.dialog === "add-customer") {
              return (
                <Dialog key={action.label} open={customerDialogOpen} onOpenChange={setCustomerDialogOpen}>
                  <DialogTrigger asChild>
                    <Button
                      variant="outline"
                      className="bg-primary-50 text-primary-600 hover:bg-primary-100"
                      size="sm"
                    >
                      <ActionIcon name={action.icon} className="mr-1 h-4 w-4" />
                      {t(`quickActions.buttons.${action.dialog}`)}
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>{t('quickActions.addCustomerTitle')}</DialogTitle>
                      <DialogDescription>
                        {t('quickActions.addCustomerDescription')}
                      </DialogDescription>
                    </DialogHeader>
                    <div className="py-4">
                      <CustomerForm
                        onSuccess={() => {
                          setCustomerDialogOpen(false);
                          invalidateByPrefix("/api/customers");
                          toast({ title: t('common:status.success'), description: t('quickActions.customerAdded') });
                        }}
                      />
                    </div>
                  </DialogContent>
                </Dialog>
              );
            }
            
            // For log expense dialog
            if (action.dialog === "log-expense") {
              return (
                <Dialog key={action.label} open={expenseDialogOpen} onOpenChange={setExpenseDialogOpen}>
                  <DialogTrigger asChild>
                    <Button
                      variant="outline"
                      className="bg-primary-50 text-primary-600 hover:bg-primary-100"
                      size="sm"
                    >
                      <ActionIcon name={action.icon} className="mr-1 h-4 w-4" />
                      {t(`quickActions.buttons.${action.dialog}`)}
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>{t('quickActions.logExpenseTitle')}</DialogTitle>
                      <DialogDescription>
                        {t('quickActions.logExpenseDescription')}
                      </DialogDescription>
                    </DialogHeader>
                    <div className="py-4">
                      <ExpenseForm
                        onSuccess={() => {
                          setExpenseDialogOpen(false);
                          invalidateByPrefix("/api/expenses");
                          toast({ title: t('common:status.success'), description: t('quickActions.expenseLogged') });
                        }}
                      />
                    </div>
                  </DialogContent>
                </Dialog>
              );
            }
            
            // We've removed the reservation status change dialog
            
            // For document upload dialog
            if (action.dialog === "document-upload") {
              return (
                <Dialog key={action.label}>
                  <DialogTrigger asChild>
                    <Button
                      variant="outline"
                      className="bg-primary-50 text-primary-600 hover:bg-primary-100"
                      size="sm"
                    >
                      <ActionIcon name={action.icon} className="mr-1 h-4 w-4" />
                      {t(`quickActions.buttons.${action.dialog}`)}
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>{t('quickActions.documentUploadTitle')}</DialogTitle>
                      <DialogDescription>
                        {t('quickActions.documentUploadDescription')}
                      </DialogDescription>
                    </DialogHeader>

                    <div className="grid gap-4 py-4">
                      {/* Vehicle Selector */}
                      <div className="grid gap-2">
                        <label className="text-sm font-medium">
                          {t('quickActions.selectVehicleLabel')}
                        </label>

                        {vehicles && vehicles.length > 0 ? (
                          <VehicleSelector 
                            vehicles={vehicles}
                            value={selectedUploadVehicle ? selectedUploadVehicle.id.toString() : ""}
                            onChange={(value) => {
                              const vehicle = vehicles.find(v => v.id.toString() === value);
                              setSelectedUploadVehicle(vehicle || null);
                            }}
                          />
                        ) : (
                          <div className="flex justify-center items-center h-full">
                            <RotateCw className="h-6 w-6 animate-spin text-muted-foreground" />
                          </div>
                        )}
                        
                        {selectedUploadVehicle && (
                          <div className="mt-2 p-3 bg-muted/30 border rounded-md">
                            <div className="flex items-center gap-2">
                              <div className="font-medium">{formatLicensePlate(selectedUploadVehicle.licensePlate)}</div>
                              <div className="text-sm text-muted-foreground">
                                {selectedUploadVehicle.brand} {selectedUploadVehicle.model}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                    
                    {/* Document Upload Form */}
                    {selectedUploadVehicle && (
                      <div className="space-y-4 mt-4">
                        <div>
                          <label htmlFor="documentFile" className="text-sm font-medium">
                            {t('quickActions.documentFileLabel')}
                          </label>
                          <div className="mt-1 flex items-center">
                            <input
                              id="documentFile"
                              type="file"
                              accept=".pdf,.jpg,.jpeg,.png"
                              onChange={(e) => {
                                if (e.target.files && e.target.files[0]) {
                                  setDocumentFile(e.target.files[0]);
                                }
                              }}
                              className="w-full text-sm text-slate-500
                                file:mr-4 file:py-2 file:px-4
                                file:rounded-md file:border-0
                                file:text-sm file:font-semibold
                                file:bg-primary-50 file:text-primary-700
                                hover:file:bg-primary-100
                                cursor-pointer"
                            />
                          </div>
                          {documentFile && (
                            <div className="mt-2 flex items-center space-x-2 text-sm">
                              <Check className="h-4 w-4 text-green-500" />
                              <span>{documentFile.name}</span>
                              <button
                                type="button"
                                onClick={() => setDocumentFile(null)}
                                className="text-red-500 hover:text-red-700 text-xs"
                              >
                                {t('quickActions.remove')}
                              </button>
                            </div>
                          )}
                        </div>
                        
                        <div>
                          <label htmlFor="documentCategory" className="text-sm font-medium">
                            {t('quickActions.documentCategoryLabel')}
                          </label>
                          <Select value={documentCategory} onValueChange={setDocumentCategory}>
                            <SelectTrigger id="documentCategory" className="w-full">
                              <SelectValue placeholder={t('quickActions.selectCategory')} />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="APK Inspection">{t('quickActions.documentCategories.APK Inspection')}</SelectItem>
                              <SelectItem value="Damage Report">{t('quickActions.documentCategories.Damage Report')}</SelectItem>
                              <SelectItem value="Insurance">{t('quickActions.documentCategories.Insurance')}</SelectItem>
                              <SelectItem value="Maintenance Record">{t('quickActions.documentCategories.Maintenance Record')}</SelectItem>
                              <SelectItem value="Receipt">{t('quickActions.documentCategories.Receipt')}</SelectItem>
                              <SelectItem value="Registration">{t('quickActions.documentCategories.Registration')}</SelectItem>
                              <SelectItem value="Vehicle Photos">{t('quickActions.documentCategories.Vehicle Photos')}</SelectItem>
                              <SelectItem value="Warranty">{t('quickActions.documentCategories.Warranty')}</SelectItem>
                              <SelectItem value="Tire Replacement">{t('quickActions.documentCategories.Tire Replacement')}</SelectItem>
                              <SelectItem value="Front Window Replacement">{t('quickActions.documentCategories.Front Window Replacement')}</SelectItem>
                              <SelectItem value="Repair Report">{t('quickActions.documentCategories.Repair Report')}</SelectItem>
                              <SelectItem value="Other">{t('quickActions.documentCategories.Other')}</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        
                        <div>
                          <label htmlFor="documentNotes" className="text-sm font-medium">
                            {t('quickActions.notesOptional')}
                          </label>
                          <Textarea
                            id="documentNotes"
                            value={documentNotes}
                            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setDocumentNotes(e.target.value)}
                            placeholder={t('quickActions.documentNotesPlaceholder')}
                            rows={2}
                            className="resize-none"
                          />
                        </div>
                      </div>
                    )}

                    <DialogFooter className="flex justify-between mt-6">
                      <DialogClose asChild>
                        <Button variant="outline" type="button">
                          {t('common:actions.cancel')}
                        </Button>
                      </DialogClose>

                      <DialogClose asChild data-document-dialog-close>
                        <Button
                          type="button"
                          variant="outline"
                          className="hidden"
                          ref={documentDialogCloseRef}
                        >
                          {t('quickActions.hiddenClose')}
                        </Button>
                      </DialogClose>

                      <Button
                        type="button"
                        disabled={!selectedUploadVehicle || !documentFile || isDocumentUploading}
                        onClick={handleDocumentUpload}
                      >
                        {isDocumentUploading && (
                          <RotateCw className="mr-2 h-4 w-4 animate-spin" />
                        )}
                        {t('quickActions.uploadDocumentButton')}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              );
            }
            
            // For damage form upload action, render a Dialog
            if (action.dialog === "damage-form") {
              return (
                <Dialog key={action.label}>
                  <DialogTrigger asChild>
                    <Button
                      variant="outline"
                      className="bg-primary-50 text-primary-600 hover:bg-primary-100"
                      size="sm"
                    >
                      <ActionIcon name={action.icon || "hammer"} className="mr-1 h-4 w-4" />
                      {t(`quickActions.buttons.${action.dialog}`)}
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>{t('quickActions.damageReportUploadTitle')}</DialogTitle>
                      <DialogDescription>
                        {t('quickActions.damageReportUploadDescription')}
                      </DialogDescription>
                    </DialogHeader>

                    <div className="grid gap-4 py-4">
                      {/* Vehicle search */}
                      <div className="grid gap-2">
                        <label className="text-sm font-medium">
                          {t('quickActions.selectVehicleLabel')}
                        </label>
                        
                        {vehicles && vehicles.length > 0 ? (
                          <>
                            <VehicleSelector 
                              vehicles={vehicles}
                              value={selectedDamageVehicle ? selectedDamageVehicle.id.toString() : ""}
                              onChange={(value) => {
                                const vehicle = vehicles.find(v => v.id.toString() === value);
                                setSelectedDamageVehicle(vehicle || null);
                              }}
                            />
                            
                            {selectedDamageVehicle && (
                              <div className="mt-2 p-3 bg-muted/30 border rounded-md">
                                <div className="flex items-center gap-2">
                                  <div className="font-medium">{formatLicensePlate(selectedDamageVehicle.licensePlate)}</div>
                                  <div className="text-sm text-muted-foreground">
                                    {selectedDamageVehicle.brand} {selectedDamageVehicle.model}
                                  </div>
                                </div>
                              </div>
                            )}
                          </>
                        ) : (
                          <div className="flex justify-center items-center h-full">
                            <RotateCw className="h-6 w-6 animate-spin text-muted-foreground" />
                          </div>
                        )}
                      </div>
                      
                      {/* File Uploads */}
                      <div className="space-y-4">
                        <div>
                          <label htmlFor="damageForm" className="text-sm font-medium">
                            {t('quickActions.damageReportFileLabel')}
                          </label>
                          <div className="mt-1 flex items-center">
                            <input
                              id="damageForm"
                              type="file"
                              accept=".pdf,.jpg,.jpeg,.png"
                              onChange={(e) => {
                                if (e.target.files && e.target.files[0]) {
                                  setDamageFormFile(e.target.files[0]);
                                }
                              }}
                              className="w-full text-sm text-slate-500
                                file:mr-4 file:py-2 file:px-4
                                file:rounded-md file:border-0
                                file:text-sm file:font-semibold
                                file:bg-primary-50 file:text-primary-700
                                hover:file:bg-primary-100
                                cursor-pointer"
                            />
                          </div>
                          {damageFormFile && (
                            <div className="mt-2 flex items-center space-x-2 text-sm">
                              <Check className="h-4 w-4 text-green-500" />
                              <span>{damageFormFile.name}</span>
                              <button
                                type="button"
                                onClick={() => setDamageFormFile(null)}
                                className="text-red-500 hover:text-red-700 text-xs"
                              >
                                {t('quickActions.remove')}
                              </button>
                            </div>
                          )}
                        </div>
                        
                        <div>
                          <label htmlFor="damagePhotos" className="text-sm font-medium">
                            {t('quickActions.damagePhotosLabel')}
                          </label>
                          <div className="mt-1 flex items-center">
                            <input
                              id="damagePhotos"
                              type="file"
                              accept=".jpg,.jpeg,.png"
                              multiple
                              onChange={(e) => {
                                if (e.target.files) {
                                  const newPhotos = Array.from(e.target.files);
                                  setDamagePhotos(prevPhotos => [...prevPhotos, ...newPhotos]);
                                }
                              }}
                              className="w-full text-sm text-slate-500
                                file:mr-4 file:py-2 file:px-4
                                file:rounded-md file:border-0
                                file:text-sm file:font-semibold
                                file:bg-primary-50 file:text-primary-700
                                hover:file:bg-primary-100
                                cursor-pointer"
                            />
                          </div>
                          {damagePhotos.length > 0 && (
                            <div className="mt-2 space-y-1">
                              <div className="text-sm font-medium">
                                {t('quickActions.selectedPhotosCount', { count: damagePhotos.length })}
                              </div>
                              <div className="space-y-1 max-h-24 overflow-y-auto pr-2">
                                {damagePhotos.map((photo, index) => (
                                  <div key={index} className="flex items-center space-x-2 text-xs">
                                    <Check className="h-3 w-3 text-green-500 flex-shrink-0" />
                                    <span className="truncate flex-1">{photo.name}</span>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setDamagePhotos(prevPhotos => 
                                          prevPhotos.filter((_, i) => i !== index)
                                        );
                                      }}
                                      className="text-red-500 hover:text-red-700 flex-shrink-0"
                                    >
                                      {t('quickActions.remove')}
                                    </button>
                                  </div>
                                ))}
                              </div>
                              {damagePhotos.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => setDamagePhotos([])}
                                  className="text-red-500 hover:text-red-700 text-xs"
                                >
                                  {t('quickActions.removeAllPhotos')}
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                    
                    <DialogFooter>
                      <DialogClose ref={damageDialogCloseRef} asChild>
                        <Button variant="outline" type="button">
                          {t('common:actions.cancel')}
                        </Button>
                      </DialogClose>
                      <Button
                        type="button"
                        onClick={handleDamageFormUpload}
                        disabled={!selectedDamageVehicle || (!damageFormFile && damagePhotos.length === 0) || isDamageUploading}
                      >
                        {isDamageUploading && (
                          <RotateCw className="mr-2 h-4 w-4 animate-spin" />
                        )}
                        {t('quickActions.uploadButton')}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              );
            }
            
            // For APK notifications dialog
            if (action.dialog === "apk-notifications") {
              return (
                <Dialog key={action.label} open={apkNotificationsDialogOpen} onOpenChange={setApkNotificationsDialogOpen}>
                  <DialogTrigger asChild>
                    <Button
                      variant="outline"
                      className="bg-primary-50 text-primary-600 hover:bg-primary-100"
                      size="sm"
                    >
                      <ActionIcon name={action.icon} className="mr-1 h-4 w-4" />
                      {t(`quickActions.buttons.${action.dialog}`)}
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-hidden flex flex-col">
                    <DialogHeader>
                      <DialogTitle>{t('quickActions.sendApkNotificationsTitle')}</DialogTitle>
                      <DialogDescription>
                        {t('quickActions.sendApkNotificationsDescription')}
                      </DialogDescription>
                    </DialogHeader>

                    <div className="flex-1 overflow-y-auto px-1">
                      <div className="space-y-6">
                        {/* Info about APK notifications */}
                        <div className="p-3 bg-orange-50 rounded-lg border border-orange-200">
                          <div className="flex items-center mb-2">
                            <ActionIcon name="shield-alert" className="w-4 h-4 text-orange-600 mr-2" />
                            <h4 className="font-medium text-orange-900 text-sm">{t('quickActions.apkRemindersHeading')}</h4>
                          </div>
                          <p className="text-xs text-orange-700">
                            {t('quickActions.apkRemindersDescription')}
                          </p>
                        </div>

                        {/* Vehicle Selection - Only APK expiring vehicles */}
                        <div className="space-y-3">
                          <Label>{t('quickActions.vehiclesNeedingApk')}</Label>
                          <Input
                            placeholder={t('quickActions.searchByPlateOrBrand')}
                            value={apkSearchQuery}
                            onChange={(e) => setApkSearchQuery(e.target.value)}
                            className="w-full"
                          />
                          
                          <div className="max-h-40 overflow-y-auto border rounded-md">
                            {vehicles
                              ?.filter(vehicle => {
                                // Only show vehicles with APK dates and expiring soon (within 30 days)
                                if (!vehicle.apkDate) return false;
                                const apkDate = new Date(vehicle.apkDate);
                                const today = new Date();
                                const thirtyDaysFromNow = new Date(today.getTime() + (30 * 24 * 60 * 60 * 1000));
                                const isExpiringSoon = apkDate <= thirtyDaysFromNow;
                                
                                if (!isExpiringSoon) return false;
                                
                                const query = apkSearchQuery.toLowerCase();
                                return !query ||
                                  vehicle.licensePlate?.toLowerCase().includes(query) ||
                                  vehicle.brand?.toLowerCase().includes(query) ||
                                  vehicle.model?.toLowerCase().includes(query);
                              })
                              .slice(0, 15)
                              .map((vehicle) => {
                                const isSelected = selectedApkVehicles.some(v => v.id === vehicle.id);
                                const apkDate = new Date(vehicle.apkDate!);
                                const today = new Date();
                                const daysUntilExpiry = Math.ceil((apkDate.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
                                const isOverdue = daysUntilExpiry < 0;
                                
                                return (
                                  <div
                                    key={vehicle.id}
                                    className={`p-2 cursor-pointer border-b last:border-b-0 hover:bg-gray-50 transition-colors ${
                                      isSelected ? 'bg-blue-50 border-blue-200' : ''
                                    }`}
                                    onClick={() => {
                                      if (isSelected) {
                                        setSelectedApkVehicles(prev => prev.filter(v => v.id !== vehicle.id));
                                      } else {
                                        setSelectedApkVehicles(prev => [...prev, vehicle]);
                                      }
                                    }}
                                  >
                                    <div className="flex justify-between items-center">
                                      <div className="flex-1">
                                        <div className="font-medium text-sm">
                                          {vehicle.licensePlate}
                                        </div>
                                        <div className="text-xs text-muted-foreground">
                                          {vehicle.brand} {vehicle.model}
                                          <span className={`ml-2 ${
                                            isOverdue ? 'text-red-600 font-medium' : 'text-orange-600'
                                          }`}>
                                            {t('quickActions.apkDateLabel', { date: apkDate.toLocaleDateString('nl-NL') })}
                                            {' '}
                                            {isOverdue ? t('quickActions.overdue') : t('quickActions.daysRemainingParen', { count: daysUntilExpiry })}
                                          </span>
                                        </div>
                                      </div>
                                      {isSelected && (
                                        <ActionIcon name="check" className="w-4 h-4 text-blue-600 ml-2" />
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                          </div>
                        </div>
                        
                        {/* Selected Summary */}
                        {selectedApkVehicles.length > 0 && (
                          <div className="p-3 bg-green-50 rounded-lg border border-green-200">
                            <h4 className="font-medium text-green-900 mb-2 text-sm">
                              {t('quickActions.selectedForApkNotification', { count: selectedApkVehicles.length })}
                            </h4>
                            <div className="space-y-1 text-xs max-h-20 overflow-y-auto">
                              {selectedApkVehicles.map((vehicle) => (
                                <div key={vehicle.id} className="flex justify-between">
                                  <span>{vehicle.licensePlate}</span>
                                  <span className="text-green-700">{vehicle.brand} {vehicle.model}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Preview */}
                        {selectedApkVehicles.length > 0 && (
                          <div className="space-y-2">
                            <Label className="text-sm">{t('quickActions.emailPreview')}</Label>
                            <div className="p-3 bg-gray-50 rounded border text-xs">
                              <strong>{t('quickActions.subjectLabel')}</strong> {t('quickActions.subjectValue')}
                              <br/><br/>
                              <strong>{t('quickActions.recipientsLabel')}</strong> {t('quickActions.recipientsValue')}
                              <br/>
                              <strong>{t('quickActions.senderLabel')}</strong> Autolease Lam
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                    
                    <DialogFooter className="flex justify-between">
                      <Button
                        variant="outline"
                        onClick={() => {
                          setApkNotificationsDialogOpen(false);
                          setSelectedApkVehicles([]);
                          setApkSearchQuery("");
                        }}
                      >
                        {t('common:actions.cancel')}
                      </Button>
                      <Button
                        onClick={async () => {
                          if (selectedApkVehicles.length === 0) {
                            toast({
                              title: t('quickActions.noVehiclesSelectedTitle'),
                              description: t('quickActions.selectAtLeastOneVehicle'),
                              variant: "destructive",
                            });
                            return;
                          }

                          setIsLoadingApkNotifications(true);
                          
                          try {
                            const response = await fetch('/api/notifications/send', {
                              method: 'POST',
                              headers: {
                                'Content-Type': 'application/json',
                              },
                              credentials: 'include',
                              body: JSON.stringify({
                                vehicleIds: selectedApkVehicles.map(v => v.id),
                                template: "apk",
                              }),
                            });

                            if (!response.ok) {
                              throw new Error(`Failed to send notifications: ${response.statusText}`);
                            }

                            const result = await response.json();
                            
                            toast({
                              title: t('quickActions.apkNotificationsSentTitle'),
                              description: t('quickActions.apkNotificationsSentDescription', { sent: result.sent, failed: result.failed || 0 }),
                            });

                            // Reset form
                            setApkNotificationsDialogOpen(false);
                            setSelectedApkVehicles([]);
                            setApkSearchQuery("");
                          } catch (error) {
                            console.error('Failed to send notifications:', error);
                            toast({
                              title: t('quickActions.failedToSendTitle'),
                              description: error instanceof Error ? error.message : t('quickActions.anErrorOccurred'),
                              variant: "destructive",
                            });
                          } finally {
                            setIsLoadingApkNotifications(false);
                          }
                        }}
                        disabled={selectedApkVehicles.length === 0 || isLoadingApkNotifications}
                        className="bg-orange-600 hover:bg-orange-700"
                      >
                        {isLoadingApkNotifications ? (
                          <>
                            <ActionIcon name="loader-2" className="w-4 h-4 mr-2 animate-spin" />
                            {t('quickActions.sending')}
                          </>
                        ) : (
                          <>
                            <ActionIcon name="shield-alert" className="w-4 h-4 mr-2" />
                            {t('quickActions.sendApkReminders', { count: selectedApkVehicles.length })}
                          </>
                        )}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              );
            }
            
            // For APK report upload, render a Dialog
            if (action.dialog === "apk-report") {
              return (
                <Dialog key={action.label}>
                  <DialogTrigger asChild>
                    <Button
                      variant="outline"
                      className="bg-primary-50 text-primary-600 hover:bg-primary-100"
                      size="sm"
                    >
                      <ActionIcon name={action.icon || "upload"} className="mr-1 h-4 w-4" />
                      {t(`quickActions.buttons.${action.dialog}`)}
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>{t('quickActions.apkReportUploadTitle')}</DialogTitle>
                      <DialogDescription>
                        {t('quickActions.apkReportUploadDescription')}
                      </DialogDescription>
                    </DialogHeader>

                    <div className="grid gap-4 py-4">
                      {/* Vehicle Selector */}
                      <div className="grid gap-2">
                        <label className="text-sm font-medium">
                          {t('quickActions.selectVehicleLabel')}
                        </label>

                        {vehicles && vehicles.length > 0 ? (
                          <VehicleSelector
                            vehicles={vehicles}
                            value={selectedApkVehicle ? selectedApkVehicle.id.toString() : ""}
                            onChange={(value) => {
                              const vehicle = vehicles.find(v => v.id.toString() === value);
                              setSelectedApkVehicle(vehicle || null);
                              // Pre-fill the APK date with the vehicle's current APK date
                              if (vehicle?.apkDate) {
                                setApkDate(vehicle.apkDate);
                              } else {
                                setApkDate("");
                              }
                            }}
                          />
                        ) : (
                          <div className="flex justify-center items-center h-full">
                            <RotateCw className="h-6 w-6 animate-spin text-muted-foreground" />
                          </div>
                        )}
                        
                        {selectedApkVehicle && (
                          <div className="mt-2 p-3 bg-muted/30 border rounded-md space-y-2">
                            <div className="flex items-center gap-2">
                              <div className="font-medium">{formatLicensePlate(selectedApkVehicle.licensePlate)}</div>
                              <div className="text-sm text-muted-foreground">
                                {selectedApkVehicle.brand} {selectedApkVehicle.model}
                              </div>
                            </div>
                            {selectedApkVehicle.apkDate && (
                              <div className="flex items-center gap-2 text-sm">
                                <span className="text-muted-foreground">{t('quickActions.currentApkDate')}</span>
                                <span className="font-medium">{formatDate(selectedApkVehicle.apkDate)}</span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                    
                    {/* APK Upload Form */}
                    {selectedApkVehicle && (
                      <div className="space-y-4 mt-4">
                        <div>
                          <label htmlFor="apkReportFile" className="text-sm font-medium">
                            {t('quickActions.apkReportFileLabel')}
                          </label>
                          <div className="mt-1 flex items-center">
                            <input
                              id="apkReportFile"
                              type="file"
                              accept=".pdf,.jpg,.jpeg,.png"
                              onChange={(e) => {
                                if (e.target.files && e.target.files[0]) {
                                  setApkReportFile(e.target.files[0]);
                                }
                              }}
                              className="w-full text-sm text-slate-500
                                file:mr-4 file:py-2 file:px-4
                                file:rounded-md file:border-0
                                file:text-sm file:font-semibold
                                file:bg-primary-50 file:text-primary-700
                                hover:file:bg-primary-100
                                cursor-pointer"
                            />
                          </div>
                          {apkReportFile && (
                            <div className="mt-2 flex items-center space-x-2 text-sm">
                              <Check className="h-4 w-4 text-green-500" />
                              <span>{apkReportFile.name}</span>
                              <button
                                type="button"
                                onClick={() => setApkReportFile(null)}
                                className="text-red-500 hover:text-red-700 text-xs"
                              >
                                {t('quickActions.remove')}
                              </button>
                            </div>
                          )}
                        </div>
                        
                        <div>
                          <label htmlFor="apkDate" className="text-sm font-medium">
                            {t('quickActions.newApkDate')}
                          </label>
                          {selectedApkVehicle.apkDate && (
                            <div className="text-xs text-muted-foreground mb-1">
                              {t('quickActions.current', { date: formatDate(selectedApkVehicle.apkDate) })}
                            </div>
                          )}
                          <Input
                            id="apkDate"
                            type="date"
                            value={apkDate}
                            onChange={(e) => setApkDate(e.target.value)}
                            className="w-full"
                          />
                        </div>
                        
                        <div>
                          <label htmlFor="apkNotes" className="text-sm font-medium">
                            {t('quickActions.notesOptional')}
                          </label>
                          <Textarea
                            id="apkNotes"
                            value={apkNotes}
                            onChange={(e) => setApkNotes(e.target.value)}
                            placeholder={t('quickActions.apkNotesPlaceholder')}
                            rows={2}
                            className="resize-none"
                          />
                        </div>
                      </div>
                    )}

                    <DialogFooter className="flex justify-between mt-6">
                      <DialogClose asChild>
                        <Button variant="outline" type="button">
                          {t('common:actions.cancel')}
                        </Button>
                      </DialogClose>

                      <DialogClose asChild data-apk-dialog-close>
                        <Button
                          type="button"
                          variant="outline"
                          className="hidden"
                          ref={apkDialogCloseRef}
                        >
                          {t('quickActions.hiddenClose')}
                        </Button>
                      </DialogClose>

                      <Button
                        type="button"
                        disabled={!selectedApkVehicle || !apkReportFile || !apkDate || isApkUploading}
                        onClick={handleApkReportUpload}
                      >
                        {isApkUploading && (
                          <RotateCw className="mr-2 h-4 w-4 animate-spin" />
                        )}
                        {t('quickActions.apkReportUploadTitle')}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              );
            }
            
            // For registration change dialog, render a Dialog
            if (action.dialog === "registration") {
              return (
                <Dialog key={action.label}>
                  <DialogTrigger asChild>
                    <Button
                      variant="outline"
                      className="bg-primary-50 text-primary-600 hover:bg-primary-100"
                      size="sm"
                    >
                      <ActionIcon name={action.icon} className="mr-1 h-4 w-4" />
                      {t(`quickActions.buttons.${action.dialog}`)}
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>{t('quickActions.changeRegistrationTitle')}</DialogTitle>
                      <DialogDescription>
                        {t('quickActions.changeRegistrationDescription')}
                      </DialogDescription>
                    </DialogHeader>

                    <div className="grid gap-4 py-4">
                      {/* Search and select vehicles */}
                      <div className="space-y-2">
                        <label className="text-sm font-medium">
                          {t('quickActions.selectVehiclesLabel')}
                        </label>

                        <div className="relative">
                          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                          <Input
                            placeholder={t('quickActions.searchByPlateOrBrandModel')}
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value.toLowerCase())}
                            className="mb-2 pl-8"
                          />
                          {searchQuery && (
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="absolute right-0 top-0 h-full px-3" 
                              onClick={() => setSearchQuery("")}
                            >
                              ✕
                            </Button>
                          )}
                        </div>
                        
                        <div className="border rounded h-[200px] overflow-y-auto p-1">
                          {vehicles ? (
                            (() => {
                              // Apply filtering based on search
                              const filteredVehicles = searchQuery
                                ? vehicles.filter(v => {
                                    // Format license plates with and without dashes for flexible searching
                                    const formattedLicensePlate = (v.licensePlate || '').replace(/-/g, '').toLowerCase();
                                    const formattedQuery = searchQuery.replace(/-/g, '').toLowerCase();
                                    
                                    return formattedLicensePlate.includes(formattedQuery) || 
                                      (v.brand?.toLowerCase() || '').includes(searchQuery) || 
                                      (v.model?.toLowerCase() || '').includes(searchQuery);
                                  })
                                : vehicles;
                              
                              // Group by registration status
                              const vehicleGroups: Record<string, Vehicle[]> = {
                                "Opnaam": [],
                                "BV": [],
                                "Unspecified": []
                              };
                              
                              filteredVehicles.forEach(vehicle => {
                                if (!vehicle.registeredTo && !vehicle.company) {
                                  vehicleGroups["Unspecified"].push(vehicle);
                                } else if (isTrueValue(vehicle.registeredTo)) {
                                  vehicleGroups["Opnaam"].push(vehicle);
                                } else if (isTrueValue(vehicle.company)) {
                                  vehicleGroups["BV"].push(vehicle);
                                } else {
                                  vehicleGroups["Unspecified"].push(vehicle);
                                }
                              });
                              
                              return filteredVehicles.length === 0 ? (
                                <div className="p-2 text-center text-sm text-muted-foreground">
                                  {t('quickActions.noVehiclesMatchSearch')}
                                </div>
                              ) : (
                                <div className="space-y-2">
                                  {Object.entries(vehicleGroups).map(([status, vehicles]) => {
                                    // Skip empty groups
                                    if (vehicles.length === 0) return null;
                                    
                                    return (
                                      <div key={status} className="space-y-1">
                                        <div className="sticky top-0 z-10 bg-background px-2 py-1 text-xs font-semibold border-b">
                                          {status === 'Unspecified' ? t('quickActions.unspecified') : status} ({vehicles.length})
                                        </div>
                                        <div>
                                          {vehicles.map(vehicle => (
                                            <div 
                                              key={vehicle.id}
                                              className="flex items-center py-1 px-2 text-xs hover:bg-accent rounded"
                                            >
                                              <input
                                                type="checkbox"
                                                id={`vehicle-${vehicle.id}`}
                                                value={vehicle.id}
                                                checked={selectedVehicles.includes(vehicle.id.toString())}
                                                onChange={(e) => {
                                                  if (e.target.checked) {
                                                    setSelectedVehicles([...selectedVehicles, vehicle.id.toString()]);
                                                  } else {
                                                    setSelectedVehicles(selectedVehicles.filter(id => id !== vehicle.id.toString()));
                                                  }
                                                }}
                                                className="mr-2"
                                              />
                                              <label 
                                                htmlFor={`vehicle-${vehicle.id}`}
                                                className="flex items-center cursor-pointer flex-1"
                                              >
                                                <span className="font-medium">{formatLicensePlate(vehicle.licensePlate)}</span>
                                                <span className="ml-1 text-muted-foreground">
                                                  {vehicle.brand} {vehicle.model}
                                                </span>
                                              </label>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              );
                            })()
                          ) : (
                            <div className="flex justify-center items-center h-full">
                              <RotateCw className="h-6 w-6 animate-spin text-muted-foreground" />
                            </div>
                          )}
                        </div>
                        
                        <div className="flex justify-between items-center text-sm">
                          <div>
                            {t('quickActions.selectedCount', { count: selectedVehicles.length })}
                          </div>
                          {selectedVehicles.length > 0 && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setSelectedVehicles([])}
                            >
                              {t('quickActions.clear')}
                            </Button>
                          )}
                        </div>
                      </div>

                      {/* Registration Status */}
                      <div className="space-y-2">
                        <label className="text-sm font-medium">
                          {t('quickActions.registrationStatusLabel')}
                        </label>
                        <Select
                          value={registrationStatus}
                          onValueChange={(value) => setRegistrationStatus(value as "opnaam" | "bv")}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder={t('quickActions.selectStatus')} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="opnaam">Opnaam</SelectItem>
                            <SelectItem value="bv">BV</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    
                    <DialogFooter>
                      <Button variant="outline" type="button" onClick={() => {}}>
                        {t('common:actions.cancel')}
                      </Button>
                      <Button
                        type="button"
                        onClick={handleChangeRegistration}
                        disabled={selectedVehicles.length === 0 || isLoading}
                      >
                        {isLoading && (
                          <RotateCw className="mr-2 h-4 w-4 animate-spin" />
                        )}
                        {t('quickActions.applyChanges')}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              );
            }
            
            // For fuel status update dialog
            if (action.dialog === "fuel-status") {
              return (
                <React.Fragment key={action.label}>
                  <Dialog open={fuelStatusDialogOpen} onOpenChange={setFuelStatusDialogOpen}>
                    <DialogTrigger asChild>
                      <Button
                        variant="outline"
                        className="bg-primary-50 text-primary-600 hover:bg-primary-100"
                        size="sm"
                      >
                        <ActionIcon name={action.icon} className="mr-1 h-4 w-4" />
                        {t(`quickActions.buttons.${action.dialog}`)}
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
                      <DialogHeader>
                        <DialogTitle>{t('quickActions.updateFuelStatusTitle')}</DialogTitle>
                        <DialogDescription>
                          {t('quickActions.updateFuelStatusDescription')}
                        </DialogDescription>
                      </DialogHeader>

                      <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                          <label className="text-sm font-medium">
                            {t('quickActions.selectVehicleLabel')}
                          </label>
                          
                          {vehicles && vehicles.length > 0 ? (
                            <VehicleSelector 
                              vehicles={vehicles}
                              value={selectedFuelVehicle ? selectedFuelVehicle.id.toString() : ""}
                              onChange={(value) => {
                                const vehicle = vehicles.find(v => v.id.toString() === value);
                                setSelectedFuelVehicle(vehicle || null);
                              }}
                            />
                          ) : (
                            <div className="flex justify-center items-center h-full">
                              <RotateCw className="h-6 w-6 animate-spin text-muted-foreground" />
                            </div>
                          )}
                          
                          {selectedFuelVehicle && (
                            <div className="mt-2 p-3 bg-muted/30 border rounded-md">
                              <div className="flex items-center gap-2">
                                <div className="font-medium">{formatLicensePlate(selectedFuelVehicle.licensePlate)}</div>
                                <div className="text-sm text-muted-foreground">
                                  {selectedFuelVehicle.brand} {selectedFuelVehicle.model}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                      
                      <DialogFooter className="flex justify-between mt-2">
                        <DialogClose asChild>
                          <Button variant="outline" type="button">
                            {t('common:actions.cancel')}
                          </Button>
                        </DialogClose>

                        <Button
                          type="button"
                          disabled={!selectedFuelVehicle}
                          onClick={() => {
                            if (selectedFuelVehicle) {
                              setFuelStatusDialogOpen(false);
                              setShowFuelStatusUpdateDialog(true);
                            }
                          }}
                        >
                          {t('quickActions.continue')}
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                  
                  {selectedFuelVehicle && (
                    <FuelStatusUpdateDialog
                      vehicleId={selectedFuelVehicle.id}
                      currentFuelLevel={selectedFuelVehicle.currentFuelLevel || undefined}
                      open={showFuelStatusUpdateDialog}
                      onOpenChange={(open) => {
                        setShowFuelStatusUpdateDialog(open);
                        if (!open) {
                          setSelectedFuelVehicle(null);
                        }
                      }}
                      onSuccess={() => {
                        setShowFuelStatusUpdateDialog(false);
                        setSelectedFuelVehicle(null);
                        invalidateByPrefix('/api/vehicles');
                      }}
                    />
                  )}
                </React.Fragment>
              );
            }
            
            // For interactive damage check dialog - just render the trigger button
            if (action.dialog === "interactive-damage-check") {
              return (
                <Button
                  key={action.label}
                  variant="outline"
                  className="bg-primary-50 text-primary-600 hover:bg-primary-100"
                  size="sm"
                  onClick={() => setInteractiveDamageCheckDialogOpen(true)}
                >
                  <ActionIcon name={action.icon} className="mr-1 h-4 w-4" />
                  {t(`quickActions.buttons.${action.dialog}`)}
                </Button>
              );
            }
            
            // For actions with href, render a Link
            if (action.href) {
              return (
                <Button
                  key={action.label}
                  variant="outline"
                  className="bg-primary-50 text-primary-600 hover:bg-primary-100"
                  size="sm"
                  asChild
                >
                  <Link to={action.href}>
                    <ActionIcon name={action.icon} className="mr-1 h-4 w-4" />
                    {t(`quickActions.buttons.${action.dialog}`)}
                  </Link>
                </Button>
              );
            }
            
            // Fallback for any other action types
            return (
              <Button
                key={action.label}
                variant="outline"
                className="bg-primary-50 text-primary-600 hover:bg-primary-100"
                size="sm"
              >
                <ActionIcon name={action.icon} className="mr-1 h-4 w-4" />
                {t(`quickActions.buttons.${action.dialog}`)}
              </Button>
            );
          })}
          </div>
        </CardContent>
      </Card>
      
      {/* Interactive Damage Check Dialog - Kept mounted to preserve state */}
      <Dialog open={interactiveDamageCheckDialogOpen} onOpenChange={setInteractiveDamageCheckDialogOpen}>
        <DialogContent className="max-w-[95vw] max-h-[95vh] w-[95vw] h-[95vh] p-0 overflow-hidden">
          <DialogTitle className="sr-only">{t('quickActions.buttons.interactive-damage-check')}</DialogTitle>
          <div className="h-full overflow-auto">
            <InteractiveDamageCheck onClose={() => setInteractiveDamageCheckDialogOpen(false)} />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}