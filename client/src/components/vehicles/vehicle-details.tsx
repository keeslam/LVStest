import { useState } from "react";
import * as React from "react";
import { Trans, useTranslation } from "react-i18next";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Link, useLocation } from "wouter";
import { ReservationAddDialog } from "@/components/reservations/reservation-add-dialog";
import { ReservationEditDialog } from "@/components/reservations/reservation-edit-dialog";
import { ExpenseViewDialog } from "@/components/expenses/expense-view-dialog";
import { ExpenseAddDialog } from "@/components/expenses/expense-add-dialog";
import { formatDate, formatCurrency, formatLicensePlate, sumMoney } from "@/lib/format-utils";
import { Price } from "@/components/ui/price";
import { isTrueValue } from "@/lib/utils";
import { getDaysUntil, getUrgencyColorClass } from "@/lib/date-utils";
import { Vehicle, Expense, Document, Reservation, UserRole, Customer } from "@shared/schema";
import { useAuth } from "@/hooks/use-auth";
import { InlineDocumentUpload } from "@/components/documents/inline-document-upload";
import { QuickStatusChangeButton } from "@/components/vehicles/quick-status-change-button";
import { VehicleDeleteDialog } from "@/components/vehicles/vehicle-delete-dialog";
import { VehicleBarcodeDialog } from "@/components/barcodes/vehicle-barcode-dialog";
import { CustomerViewDialog } from "@/components/customers/customer-view-dialog";
import { PdfPreviewDialog } from "@/components/documents/pdf-preview-dialog";
import { useGlobalDialog } from "@/contexts/GlobalDialogContext";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient, invalidateRelatedQueries, invalidateByPrefix } from "@/lib/queryClient";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Bell, Mail, User, Eye, Edit, Calendar, Plus, Upload, X, FileCheck, Printer, Trash2, Download, ChevronDown, ChevronRight, ChevronLeft, AlertTriangle, Car, ScanLine } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { insertReservationSchema, insertReservationSchemaBase } from "@shared/schema";
import { VehicleForm } from "@/components/vehicles/vehicle-form";
import { ApkInspectionDialog } from "@/components/vehicles/apk-inspection-dialog";
import { FuelStatusUpdateDialog } from "@/components/vehicles/fuel-status-update-dialog";
import InteractiveDamageCheck from "@/pages/interactive-damage-check";
import { 
  Form, 
  FormControl, 
  FormField, 
  FormItem, 
  FormLabel, 
  FormMessage 
} from "@/components/ui/form";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SearchableCombobox } from "@/components/ui/searchable-combobox";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { format, addDays, parseISO } from "date-fns";
import { useMemo } from "react";

interface VehicleDetailsProps {
  vehicleId: number;
  inDialogContext?: boolean;
  onClose?: () => void;
}

export function VehicleDetails({ vehicleId, inDialogContext = false, onClose }: VehicleDetailsProps) {
  const { t } = useTranslation(["vehicles", "barcodes"]);
  const [_, navigate] = useLocation();
  const { openVehicleDialog, openExpenseDialog } = useGlobalDialog();
  const [activeTab, setActiveTab] = useState("general");
  const [isApkReminderOpen, setIsApkReminderOpen] = useState(false);
  const [isApkInspectionOpen, setIsApkInspectionOpen] = useState(false);
  const [customMessage, setCustomMessage] = useState("");
  const [templateSubject, setTemplateSubject] = useState("");
  const [templateContent, setTemplateContent] = useState("");
  const [editableEmails, setEditableEmails] = useState<{ [customerId: number]: string }>({});
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);
  const [isNewReservationOpen, setIsNewReservationOpen] = useState(false);
  const [viewReservationDialogOpen, setViewReservationDialogOpen] = useState(false);
  const [selectedReservation, setSelectedReservation] = useState<Reservation | null>(null);
  const [editReservationDialogOpen, setEditReservationDialogOpen] = useState(false);
  const [editReservationId, setEditReservationId] = useState<number | null>(null);
  const [damageFile, setDamageFile] = useState<File | null>(null);
  const [isDragActive, setIsDragActive] = useState(false);
  const [isEditVehicleDialogOpen, setIsEditVehicleDialogOpen] = useState(false);
  const [barcodeDialogOpen, setBarcodeDialogOpen] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [showAllScheduledMaintenance, setShowAllScheduledMaintenance] = useState(false);
  const [showAllRepairs, setShowAllRepairs] = useState(false);
  const [interactiveDamageCheckDialogOpen, setInteractiveDamageCheckDialogOpen] = useState(false);
  const [editingCheckId, setEditingCheckId] = useState<number | null>(null);
  const [expenseCategoryPages, setExpenseCategoryPages] = useState<Record<string, number>>({});
  
  // Delete confirmation dialog states
  const [deleteDamageCheckDialogOpen, setDeleteDamageCheckDialogOpen] = useState(false);
  const [damageCheckToDelete, setDamageCheckToDelete] = useState<{ id: number; checkType: string; checkDate: string } | null>(null);
  const [deleteDocumentDialogOpen, setDeleteDocumentDialogOpen] = useState(false);
  const [documentToDelete, setDocumentToDelete] = useState<{ id: number; fileName: string } | null>(null);
  const [expenseToDelete, setExpenseToDelete] = useState<Expense | null>(null);
  const [receiptPreviewExpense, setReceiptPreviewExpense] = useState<Expense | null>(null);

  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user: currentUser } = useAuth();
  const isAdmin = currentUser?.role === UserRole.ADMIN;
  
  // Expense pagination helpers
  const EXPENSE_ITEMS_PER_PAGE = 5;
  const getExpenseCategoryPage = (category: string) => expenseCategoryPages[category] || 1;
  const setExpenseCategoryPage = (category: string, page: number) => {
    setExpenseCategoryPages(prev => ({ ...prev, [category]: page }));
  };

  const deleteExpenseMutation = useMutation({
    mutationFn: async (expenseId: number) => {
      const response = await apiRequest("DELETE", `/api/expenses/${expenseId}`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to delete expense");
      }
      return await response.json();
    },
    onSuccess: async () => {
      toast({
        title: t('details.expenses.expenseDeletedTitle'),
        description: t('details.expenses.expenseDeletedDescription'),
      });
      await invalidateRelatedQueries('expenses', { vehicleId });
      setExpenseToDelete(null);
    },
    onError: (error: Error) => {
      toast({
        title: t('details.expenses.expenseDeleteErrorTitle'),
        description: error.message,
        variant: "destructive",
      });
    }
  });

  // Deleting a vehicle is handled by VehicleDeleteDialog (typed license-plate
  // confirmation + cascade preview + recycle bin), see the header actions below.

  // Fetch vehicle details (MOVED UP to fix hoisting issue)
  const vehicleQueryKey = [`/api/vehicles/${vehicleId}`];
  const { 
    data: vehicle, 
    isLoading: isLoadingVehicle,
    error: vehicleError 
  } = useQuery({
    queryKey: vehicleQueryKey,
    enabled: !!vehicleId
  });

  // Auto-open APK dialog from sessionStorage (from notifications)
  React.useEffect(() => {
    if (!vehicle) return;
    
    // Check sessionStorage for APK dialog flag
    const shouldOpenApkDialog = sessionStorage.getItem('openApkDialog');
    
    console.log('[VehicleDetails] Checking for openApkDialog in sessionStorage:', shouldOpenApkDialog);
    console.log('[VehicleDetails] Vehicle loaded:', vehicle?.id, 'isApkInspectionOpen:', isApkInspectionOpen);
    
    if (shouldOpenApkDialog === 'true' && !isApkInspectionOpen) {
      console.log('[VehicleDetails] Opening APK inspection dialog');
      setIsApkInspectionOpen(true);
      // Clear the sessionStorage after opening
      sessionStorage.removeItem('openApkDialog');
    }
  }, [vehicle, isApkInspectionOpen, vehicleId]);
  
  // Auto-switch to maintenance tab from sessionStorage (from warranty notifications)
  React.useEffect(() => {
    if (!vehicle) return;
    
    // Check sessionStorage for maintenance tab flag
    const shouldOpenMaintenanceTab = sessionStorage.getItem('openMaintenanceTab');
    
    if (shouldOpenMaintenanceTab === 'true') {
      console.log('[VehicleDetails] Switching to maintenance tab from notification');
      setActiveTab('maintenance');
      // Clear the sessionStorage after switching
      sessionStorage.removeItem('openMaintenanceTab');
    }
  }, [vehicle, vehicleId]);

  // Send APK reminder mutation
  const sendApkReminderMutation = useMutation({
    mutationFn: async ({ message, subject, customerEmails }: { 
      message: string; 
      subject: string; 
      customerEmails: { [customerId: number]: string } 
    }) => {
      const response = await apiRequest("POST", "/api/notifications/send", {
        vehicleIds: [vehicleId],
        template: "custom", // Always use custom since we're providing our own content
        customMessage: message,
        customSubject: subject,
        emailFieldSelection: "auto",
        customerEmails: customerEmails // Pass the updated email addresses
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to send APK reminder');
      }
      return await response.json();
    },
    onSuccess: (data) => {
      toast({
        title: t('details.maintenance.toasts.reminderSentTitle'),
        description: t('details.maintenance.toasts.reminderSentDescription', { count: data.sent })
      });
      setIsApkReminderOpen(false);
      setCustomMessage("");
    },
    onError: (error: Error) => {
      toast({
        title: t('details.maintenance.toasts.errorTitle'),
        description: error.message || t('details.maintenance.toasts.reminderFailedDescription'),
        variant: "destructive"
      });
    }
  });

  // Fetch customers with reservations for this vehicle
  const { data: customersWithReservations = [] } = useQuery({
    queryKey: [`/api/vehicles/${vehicleId}/customers-with-reservations`],
    enabled: isApkReminderOpen, // Only fetch when dialog is open
    queryFn: async () => {
      const response = await fetch(`/api/vehicles/${vehicleId}/customers-with-reservations`);
      if (!response.ok) throw new Error('Failed to fetch customers');
      return response.json();
    }
  });

  // Fetch all email templates for selection
  const { data: emailTemplates = [] } = useQuery({
    queryKey: ['/api/email-templates'],
    enabled: isApkReminderOpen, // Only fetch when dialog is open
    queryFn: async () => {
      const response = await fetch('/api/email-templates');
      if (!response.ok) throw new Error('Failed to fetch templates');
      return response.json();
    }
  });

  // Fetch maintenance history (maintenance_block reservations)
  const { data: maintenanceHistory = [] } = useQuery({
    queryKey: [`/api/reservations/vehicle/${vehicleId}`],
    enabled: !!vehicleId,
    queryFn: async () => {
      const response = await fetch(`/api/reservations/vehicle/${vehicleId}`);
      if (!response.ok) throw new Error('Failed to fetch maintenance history');
      const allReservations = await response.json();
      // Filter for maintenance_block reservations only
      return allReservations.filter((r: any) => r.type === 'maintenance_block');
    }
  });

  // Calculate next service due based on 30,000km or 1 year
  const serviceDueInfo = useMemo(() => {
    if (!vehicle) return null;
    
    const serviceInterval = 30000; // 30,000 km
    const serviceIntervalDays = 365; // 1 year

    let nextServiceByDate = null;
    let nextServiceByMileage = null;
    let daysUntilService = null;
    let kmUntilService = null;

    // Calculate by date (1 year from last service)
    if (vehicle.lastServiceDate) {
      const lastService = parseISO(vehicle.lastServiceDate);
      nextServiceByDate = addDays(lastService, serviceIntervalDays);
      daysUntilService = getDaysUntil(format(nextServiceByDate, 'yyyy-MM-dd'));
    }

    // Calculate by mileage (30,000 km from last service)
    if (vehicle.lastServiceMileage && vehicle.currentMileage) {
      const kmSinceService = vehicle.currentMileage - vehicle.lastServiceMileage;
      kmUntilService = serviceInterval - kmSinceService;
      nextServiceByMileage = vehicle.lastServiceMileage + serviceInterval;
    }

    const isDueByDate = daysUntilService !== null && daysUntilService <= 0;
    const isDueByMileage = kmUntilService !== null && kmUntilService <= 0;

    return {
      nextServiceByDate,
      nextServiceByMileage,
      daysUntilService,
      kmUntilService,
      isDueByDate,
      isDueByMileage,
      isServiceDue: isDueByDate || isDueByMileage,
    };
  }, [vehicle]);

  // Replace placeholders in template text
  const replacePlaceholders = (text: string, customer: any) => {
    if (!vehicle || !text) return text;
    
    const customerName = customer ? `${customer.firstName} ${customer.lastName}`.trim() : 'Customer';
    const expiryDate = vehicle.apkDate ? new Date(vehicle.apkDate).toLocaleDateString('nl-NL') : 'Not set';
    
    return text
      .replace(/\{customerName\}/g, customerName)
      .replace(/\{vehiclePlate\}/g, formatLicensePlate(vehicle.licensePlate) || 'N/A')
      .replace(/\{vehicleBrand\}/g, vehicle.brand || 'N/A')
      .replace(/\{vehicleModel\}/g, vehicle.model || 'N/A')
      .replace(/\{apkDate\}/g, expiryDate)
      .replace(/\{licensePlate\}/g, formatLicensePlate(vehicle.licensePlate) || 'N/A')
      .replace(/\{firstName\}/g, customer?.firstName || 'Customer')
      .replace(/\{lastName\}/g, customer?.lastName || '')
      .replace(/\{email\}/g, customer?.email || 'N/A');
  };

  // Handle template selection
  const handleTemplateSelect = (templateId: string) => {
    const template = emailTemplates.find((t: any) => t.id === parseInt(templateId));
    if (template && vehicle && customersWithReservations.length > 0) {
      const firstCustomer = customersWithReservations[0]?.customer;
      setSelectedTemplateId(template.id);
      setTemplateSubject(replacePlaceholders(template.subject, firstCustomer));
      setTemplateContent(replacePlaceholders(template.content, firstCustomer));
    }
  };

  // Initialize template content and customer emails when dialog opens
  React.useEffect(() => {
    if (isApkReminderOpen && vehicle && customersWithReservations.length > 0) {
      // DO NOT auto-fill emails - let user select manually
      // Only reset to empty if dialog just opened
      setEditableEmails({});
      
      // Auto-select first APK template if available and no template is selected
      if (!selectedTemplateId && emailTemplates.length > 0) {
        const apkTemplate = emailTemplates.find((t: any) => 
          t.category?.toLowerCase() === 'apk' || 
          t.name?.toLowerCase().includes('apk')
        );
        
        if (apkTemplate) {
          const firstCustomer = customersWithReservations[0]?.customer;
          setSelectedTemplateId(apkTemplate.id);
          setTemplateSubject(replacePlaceholders(apkTemplate.subject, firstCustomer));
          setTemplateContent(replacePlaceholders(apkTemplate.content, firstCustomer));
        }
      }
    }
  }, [isApkReminderOpen, vehicle, customersWithReservations, emailTemplates, selectedTemplateId]);

  // New reservation form schema
  const newReservationSchema = insertReservationSchemaBase.extend({
    vehicleId: z.number().min(1, "Vehicle is required"),
    customerId: z.union([
      z.number().min(1, "Please select a customer"),
      z.string().min(1, "Please select a customer").transform(val => parseInt(val)),
    ]),
    startDate: z.string().min(1, "Start date is required"),
    endDate: z.string().optional(),
    isOpenEnded: z.boolean().optional(),
    totalPrice: z.union([
      z.number().optional(),
      z.string().transform(val => val === "" ? undefined : parseFloat(val) || undefined),
    ]).optional(),
    damageCheckFile: z.any().optional(),
    departureMileage: z.union([
      z.number().optional(),
      z.string().transform(val => val === "" ? undefined : parseInt(val) || undefined),
    ]).optional(),
    startMileage: z.union([
      z.number().optional(),
      z.string().transform(val => val === "" ? undefined : parseInt(val) || undefined),
    ]).optional(),
  }).refine((data) => {
    // If not open-ended, end date is required
    if (!data.isOpenEnded && (!data.endDate || data.endDate === "")) {
      return false;
    }
    return true;
  }, {
    message: "End date is required for non-open-ended rentals",
    path: ["endDate"],
  });

  // Fetch customers for the form
  const { data: customers } = useQuery({
    queryKey: ["/api/customers"],
    enabled: isNewReservationOpen,
  });

  // Format customer options for searchable combobox
  const customerOptions = useMemo(() => {
    if (!customers) return [];
    return customers.map(customer => {
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
  }, [customers]);

  // Get today's date for form defaults
  const today = format(new Date(), "yyyy-MM-dd");
  const defaultEndDate = format(addDays(new Date(), 3), "yyyy-MM-dd");

  // New reservation form
  const newReservationForm = useForm<z.infer<typeof newReservationSchema>>({
    resolver: zodResolver(newReservationSchema),
    defaultValues: {
      vehicleId: vehicleId,
      customerId: "",
      startDate: today,
      endDate: defaultEndDate,
      isOpenEnded: false,
      status: "pending",
      totalPrice: 0,
      notes: "",
      damageCheckFile: undefined,
      departureMileage: undefined,
      startMileage: undefined,
    },
  });

  // File upload handlers
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setDamageFile(file);
      newReservationForm.setValue("damageCheckFile", file);
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
      newReservationForm.setValue("damageCheckFile", file);
    }
  };

  const removeDamageFile = () => {
    setDamageFile(null);
    newReservationForm.setValue("damageCheckFile", undefined);
  };

  // Create reservation mutation
  const createReservationMutation = useMutation({
    mutationFn: async (data: z.infer<typeof newReservationSchema>) => {
      // Create FormData for file upload
      const formData = new FormData();
      
      // Add all other form data
      Object.entries(data).forEach(([key, value]) => {
        if (key !== "damageCheckFile" && value !== undefined && value !== null) {
          formData.append(key, String(value));
        }
      });
      
      // Add file if present
      if (damageFile) {
        formData.append("damageCheckFile", damageFile);
      }

      const response = await fetch("/api/reservations", {
        method: "POST", 
        body: formData,
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to create reservation');
      }
      return await response.json();
    },
    onSuccess: async (data) => {
      toast({
        title: t('details.toasts.reservationCreatedTitle'),
        description: t('details.toasts.reservationCreatedDescription', { brand: vehicle?.brand, model: vehicle?.model })
      });
      
      // Refresh related data
      invalidateByPrefix("/api/reservations");
      invalidateByPrefix(`/api/reservations/vehicle/${vehicleId}`);
      invalidateByPrefix("/api/vehicles");
      
      // Close dialog and reset form
      setIsNewReservationOpen(false);
      newReservationForm.reset();
      setDamageFile(null);
      setIsDragActive(false);
    },
    onError: (error: Error) => {
      toast({
        title: t('details.toasts.reservationCreateErrorTitle'),
        description: error.message || t('details.toasts.reservationCreateErrorDescription'),
        variant: "destructive"
      });
    }
  });

  // Watch form values for validation
  const isOpenEndedWatch = newReservationForm.watch("isOpenEnded");

  // Update end date when open-ended status changes
  React.useEffect(() => {
    if (isOpenEndedWatch) {
      newReservationForm.setValue("endDate", "");
    } else if (!newReservationForm.getValues("endDate")) {
      newReservationForm.setValue("endDate", defaultEndDate);
    }
  }, [isOpenEndedWatch, newReservationForm, defaultEndDate]);
  
  // Fetch vehicle expenses
  const { data: expenses, isLoading: isLoadingExpenses } = useQuery<Expense[]>({
    queryKey: [`/api/expenses/vehicle/${vehicleId}`],
  });
  
  // Fetch vehicle documents
  const { data: documents, isLoading: isLoadingDocuments } = useQuery<Document[]>({
    queryKey: [`/api/documents/vehicle/${vehicleId}`],
  });
  
  // Fetch interactive damage checks for this vehicle
  const { data: interactiveDamageChecks = [], isLoading: isLoadingDamageChecks } = useQuery({
    queryKey: [`/api/interactive-damage-checks/vehicle/${vehicleId}`],
  });
  
  // Normalize document type to standard category
  const normalizeDocumentType = (documentType: string): string => {
    const type = documentType.toLowerCase().trim();
    
    if (type.includes('contract')) return 'Contracts';
    if (type.includes('damage') && (type.includes('report') || type.includes('form'))) return 'Damage Reports';
    if (type.includes('photo') || type.includes('image')) return 'Vehicle Photos';
    if (type.includes('invoice') || type.includes('receipt')) return 'Invoices & Receipts';
    if (type.includes('insurance')) return 'Insurance Documents';
    if (type.includes('registration') || type.includes('title')) return 'Registration Documents';
    if (type.includes('maintenance') || type.includes('service')) return 'Maintenance Records';
    if (type.includes('inspection') || type.includes('apk')) return 'Inspection Reports';
    if (type.includes('other')) return 'Other Documents';
    
    // If no match, return original with proper capitalization
    return documentType.charAt(0).toUpperCase() + documentType.slice(1);
  };
  
  // Group documents by category
  const documentsByCategory = documents?.reduce((grouped, document) => {
    const category = normalizeDocumentType(document.documentType);
    if (!grouped[category]) {
      grouped[category] = [];
    }
    grouped[category].push(document);
    return grouped;
  }, {} as Record<string, Document[]>) || {};
  
  // Define query keys for easier reference
  const vehicleReservationsQueryKey = [`/api/reservations/vehicle/${vehicleId}`];
  
  // Fetch vehicle reservations
  const { 
    data: reservations, 
    isLoading: isLoadingReservations,
    refetch: refetchReservations 
  } = useQuery<Reservation[]>({
    queryKey: vehicleReservationsQueryKey,
  });

  // Fetch spare vehicle assignment info (when this vehicle has a spare assigned)
  const { data: spareAssignment } = useQuery<{
    spareVehicle: Vehicle;
    replacementReservation: Reservation;
    customer: Customer | null;
    originalReservation: Reservation;
  }>({
    queryKey: ['/api/vehicles', vehicleId, 'spare-assignment'],
    queryFn: async () => {
      const response = await fetch(`/api/vehicles/${vehicleId}/spare-assignment`);
      if (response.status === 404) return null;
      if (!response.ok) throw new Error('Failed to fetch spare assignment');
      return response.json();
    },
    retry: false,
  });

  // Fetch acting as spare info (when this vehicle is acting as a spare for another)
  const { data: actingAsSpareInfo } = useQuery<{
    originalVehicle: Vehicle;
    originalReservation: Reservation;
    replacementReservation: Reservation;
    customer: Customer | null;
  }>({
    queryKey: ['/api/vehicles', vehicleId, 'acting-as-spare'],
    queryFn: async () => {
      const response = await fetch(`/api/vehicles/${vehicleId}/acting-as-spare`);
      if (response.status === 404) return null;
      if (!response.ok) throw new Error('Failed to fetch acting as spare info');
      return response.json();
    },
    retry: false,
  });
  
  // Delete reservation mutation
  const deleteReservationMutation = useMutation({
    mutationFn: async (reservationId: number) => {
      const response = await apiRequest('DELETE', `/api/reservations/${reservationId}`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to delete reservation');
      }
      return await response.json();
    },
    onSuccess: async () => {
      // Use invalidateRelatedQueries to refresh all related data
      invalidateRelatedQueries('reservations');
      invalidateRelatedQueries('vehicles', vehicleId);
      invalidateRelatedQueries('dashboard');
      
      // Explicitly force a refetch to ensure the UI updates immediately
      await refetchReservations();
      
      toast({
        title: t('details.toasts.reservationDeletedTitle'),
        description: t('details.toasts.reservationDeletedDescription')
      });
    },
    onError: (error: Error) => {
      toast({
        title: t('details.toasts.genericErrorTitle'),
        description: error.message || t('details.toasts.reservationDeleteFailedDescription'),
        variant: "destructive"
      });
    }
  });

  // Blacklist state
  const [isAddToBlacklistOpen, setIsAddToBlacklistOpen] = useState(false);
  const [selectedBlacklistCustomerId, setSelectedBlacklistCustomerId] = useState<string>("");
  const [blacklistReason, setBlacklistReason] = useState("");

  // Fetch blacklisted customers for this vehicle
  const { 
    data: blacklistedCustomers = [], 
    isLoading: isLoadingBlacklist,
    refetch: refetchBlacklist 
  } = useQuery<any[]>({
    queryKey: [`/api/vehicles/${vehicleId}/blacklist`],
  });

  // Fetch all customers for the add blacklist dropdown
  const { data: allCustomers = [] } = useQuery<any[]>({
    queryKey: ['/api/customers'],
    enabled: isAddToBlacklistOpen,
  });

  // Filter out already blacklisted customers
  const availableCustomersForBlacklist = useMemo(() => {
    const blacklistedIds = new Set(blacklistedCustomers.map((b: any) => b.customerId));
    return allCustomers.filter((c: any) => !blacklistedIds.has(c.id));
  }, [allCustomers, blacklistedCustomers]);

  // Format available customers for SearchableCombobox
  const blacklistCustomerOptions = useMemo(() => {
    return availableCustomersForBlacklist.map((customer: any) => {
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
  }, [availableCustomersForBlacklist]);

  // Add to blacklist mutation
  const addToBlacklistMutation = useMutation({
    mutationFn: async ({ customerId, reason }: { customerId: number; reason?: string }) => {
      const response = await apiRequest('POST', `/api/vehicles/${vehicleId}/blacklist`, {
        customerId,
        reason
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to add to blacklist');
      }
      return await response.json();
    },
    onSuccess: async () => {
      await refetchBlacklist();
      setIsAddToBlacklistOpen(false);
      setSelectedBlacklistCustomerId("");
      setBlacklistReason("");
      toast({
        title: t('details.toasts.customerBlacklistedTitle'),
        description: t('details.toasts.customerBlacklistedDescription')
      });
    },
    onError: (error: Error) => {
      toast({
        title: t('details.toasts.genericErrorTitle'),
        description: error.message || t('details.toasts.blacklistErrorDescription'),
        variant: "destructive"
      });
    }
  });

  // Remove from blacklist mutation
  const removeFromBlacklistMutation = useMutation({
    mutationFn: async (blacklistId: number) => {
      const response = await apiRequest('DELETE', `/api/blacklist/${blacklistId}`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to remove from blacklist');
      }
      return await response.json();
    },
    onSuccess: async () => {
      await refetchBlacklist();
      toast({
        title: t('details.toasts.customerRemovedFromBlacklistTitle'),
        description: t('details.toasts.customerRemovedFromBlacklistDescription')
      });
    },
    onError: (error: Error) => {
      toast({
        title: t('details.toasts.genericErrorTitle'),
        description: error.message || t('details.toasts.removeBlacklistErrorDescription'),
        variant: "destructive"
      });
    }
  });
  
  // Find the current active reservation (most recent confirmed or ongoing rental)
  const currentActiveReservation = useMemo(() => {
    if (!reservations || reservations.length === 0) return null;
    
    // Find the most recent reservation that's either booked or picked up
    // Prioritize picked_up status, then booked
    const activeRentals = reservations.filter((r: Reservation) => 
      r.status === 'booked' || r.status === 'picked_up'
    ).sort((a, b) => {
      // Sort by start date descending (most recent first)
      return new Date(b.startDate).getTime() - new Date(a.startDate).getTime();
    });
    
    if (activeRentals.length > 0) return activeRentals[0];
    
    // If no confirmed/pending, check for very recently completed rentals
    const recentCompleted = reservations.filter((r: Reservation) => 
      r.status === 'completed'
    ).sort((a, b) => {
      return new Date(b.endDate || b.startDate).getTime() - new Date(a.endDate || a.startDate).getTime();
    });
    
    return recentCompleted.length > 0 ? recentCompleted[0] : null;
  }, [reservations]);
  
  // Calculate days until APK expiration
  const daysUntilApk = vehicle?.apkDate ? getDaysUntil(vehicle.apkDate) : 0;
  const apkUrgencyClass = getUrgencyColorClass(daysUntilApk);
  
  // Calculate days until warranty expiration
  const daysUntilWarranty = vehicle?.warrantyEndDate ? getDaysUntil(vehicle.warrantyEndDate) : 0;
  const warrantyUrgencyClass = getUrgencyColorClass(daysUntilWarranty);
  
  // Calculate total expenses
  const totalExpenses = expenses ? sumMoney(expenses, expense => expense.amount) : 0;
  
  // Group expenses by category
  const expensesByCategory = expenses?.reduce((grouped, expense) => {
    const category = expense.category;
    if (!grouped[category]) {
      grouped[category] = [];
    }
    grouped[category].push(expense);
    return grouped;
  }, {} as Record<string, Expense[]>) || {};
  
  // Calculate total amount by category with sorted expenses
  const totalByCategory = Object.entries(expensesByCategory).map(([category, categoryExpenses]) => {
    const sortedExpenses = categoryExpenses.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return {
      category,
      expenses: sortedExpenses,
      amount: sumMoney(sortedExpenses, expense => expense.amount),
      count: sortedExpenses.length
    };
  }).sort((a, b) => b.amount - a.amount);
  
  // Find current active RENTAL reservation (not maintenance)
  const activeReservation = reservations?.find(reservation => {
    if (!reservation.startDate || reservation.type !== 'standard') return false;
    const today = new Date();
    const startDate = parseISO(reservation.startDate);
    
    // Check if currently active - 'picked_up' is the status when vehicle is rented out
    // 'booked' is also included to show upcoming/current bookings
    const activeStatuses = ['picked_up', 'booked', 'rented', 'confirmed', 'pending'];
    if (activeStatuses.includes(reservation.status) && today >= startDate) {
      // For reservations with an end date, check if we're still within the range
      if (reservation.endDate) {
        const endDate = parseISO(reservation.endDate);
        return today <= endDate;
      }
      // For open-ended reservations (endDate is null), they're active if started
      return true;
    }
    
    return false;
  });
  
  // If no active reservation, find the next upcoming RENTAL reservation (not maintenance)
  const upcomingReservation = !activeReservation ? reservations
    ?.filter(reservation => {
      if (!reservation.startDate || reservation.status === 'cancelled' || reservation.type !== 'standard') return false;
      const today = new Date();
      const startDate = parseISO(reservation.startDate);
      return startDate > today;
    })
    .sort((a, b) => {
      const dateA = parseISO(a.startDate);
      const dateB = parseISO(b.startDate);
      return dateA.getTime() - dateB.getTime();
    })[0] : null;
  
  const displayReservation = activeReservation || upcomingReservation || actingAsSpareInfo;
  
  if (isLoadingVehicle) {
    return (
      <div className="flex justify-center items-center h-64">
        <svg className="animate-spin h-8 w-8 text-primary-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      </div>
    );
  }
  
  if (!vehicle) {
    return (
      <div className="text-center p-8">
        <h2 className="text-xl font-semibold mb-2">{t('details.notFound.title')}</h2>
        <p className="mb-4 text-gray-600">{t('details.notFound.description')}</p>
        <Button onClick={() => navigate("/vehicles")}>{t('details.notFound.backButton')}</Button>
      </div>
    );
  }
  
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">{vehicle.brand} {vehicle.model}</h1>
          <p className="text-lg font-medium text-gray-600">{formatLicensePlate(vehicle.licensePlate)}</p>
        </div>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            onClick={() => inDialogContext && onClose ? onClose() : navigate("/vehicles")}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-arrow-left mr-2">
              <path d="m12 19-7-7 7-7"/>
              <path d="M19 12H5"/>
            </svg>
            {inDialogContext ? t('details.header.backButton') : t('details.header.backToVehiclesButton')}
          </Button>

          <Button variant="outline" size="sm" onClick={() => setBarcodeDialogOpen(true)} data-testid="button-view-barcode">
            <ScanLine className="mr-1 h-4 w-4" />
            {t("barcodes:label.viewBarcode")}
          </Button>

          <Dialog open={isEditVehicleDialogOpen} onOpenChange={setIsEditVehicleDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" data-testid="button-edit-vehicle">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-pencil mr-2">
                  <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
                </svg>
                {t('details.header.editButton')}
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{t('details.header.editDialogTitle')}</DialogTitle>
                <DialogDescription>
                  {t('details.header.editDialogDescription', { brand: vehicle?.brand, model: vehicle?.model, plate: formatLicensePlate(vehicle?.licensePlate || "") })}
                </DialogDescription>
              </DialogHeader>
              <VehicleForm 
                initialData={vehicle}
                editMode={true}
                redirectToList={false}
                onSuccess={() => {
                  setIsEditVehicleDialogOpen(false);
                  invalidateByPrefix(`/api/vehicles/${vehicleId}`);
                  invalidateByPrefix('/api/vehicles');
                }}
                customCancelButton={
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsEditVehicleDialogOpen(false)}
                  >
                    {t('common:actions.cancel')}
                  </Button>
                }
              />
            </DialogContent>
          </Dialog>

          <FuelStatusUpdateDialog
            vehicleId={vehicleId}
            currentFuelLevel={vehicle.currentFuelLevel || undefined}
            onSuccess={() => {
              invalidateByPrefix(`/api/vehicles/${vehicleId}`);
              invalidateByPrefix('/api/vehicles');
            }}
          />

          {/* Same guarded dialog as the vehicles list: shows what cascades and
              requires the license plate to be typed. The old inline confirm
              could delete a vehicle plus its rentals on two quick clicks. */}
          <VehicleDeleteDialog
            vehicleId={vehicleId}
            vehicleBrand={vehicle.brand}
            vehicleModel={vehicle.model}
            vehicleLicensePlate={vehicle.licensePlate}
            onSuccess={() => {
              if (inDialogContext && onClose) {
                onClose();
              } else {
                navigate("/vehicles");
              }
            }}
          >
            <Button variant="outline" className="text-red-600 hover:text-red-700">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-trash-2 mr-2">
                <path d="M3 6h18"/>
                <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/>
                <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
                <line x1="10" x2="10" y1="11" y2="17"/>
                <line x1="14" x2="14" y1="11" y2="17"/>
              </svg>
              {t('details.header.deleteButton')}
            </Button>
          </VehicleDeleteDialog>

          <ReservationAddDialog initialVehicleId={vehicleId.toString()}>
            <Button data-testid="button-new-reservation">
              <Calendar className="h-4 w-4 mr-2" />
              {t('details.header.newReservationButton')}
            </Button>
          </ReservationAddDialog>
          
          {/* Quick Status Change Button for Active Reservation */}
          <QuickStatusChangeButton vehicleId={vehicleId} />
        </div>
      </div>
      
      {/* Vehicle Info Cards */}
      <div className={`grid grid-cols-1 gap-4 ${displayReservation ? 'md:grid-cols-7' : 'md:grid-cols-5'}`}>
        <Card className={displayReservation ? 'md:col-span-1' : ''}>
          <CardHeader className={displayReservation ? 'pb-1 pt-3' : 'pb-2'}>
            <CardTitle className="text-sm font-medium text-gray-500">{t('details.infoCards.vehicleType')}</CardTitle>
          </CardHeader>
          <CardContent className={displayReservation ? 'pb-3' : ''}>
            <p className={`font-semibold ${displayReservation ? 'text-lg' : 'text-2xl'}`}>{vehicle.vehicleType || t('details.general.na')}</p>
          </CardContent>
        </Card>

        <Card className={displayReservation ? 'md:col-span-1' : ''}>
          <CardHeader className={displayReservation ? 'pb-1 pt-3' : 'pb-2'}>
            <CardTitle className="text-sm font-medium text-gray-500">{t('details.infoCards.currentMileage')}</CardTitle>
          </CardHeader>
          <CardContent className={displayReservation ? 'pb-3' : ''}>
            <p className={`font-semibold ${displayReservation ? 'text-lg' : 'text-2xl'}`} data-testid="text-current-mileage">
              {vehicle.currentMileage != null
                ? `${Number(vehicle.currentMileage).toLocaleString()} km`
                : t('details.general.na')}
            </p>
            {isAdmin && vehicle.mileageDecreasedBy && (
              <div className="mt-2 p-2 bg-amber-50 border border-amber-200 rounded text-xs">
                <div className="flex items-center gap-1 text-amber-700 font-medium">
                  <AlertTriangle className="h-3 w-3" />
                  {t('details.infoCards.mileageDecreased')}
                </div>
                <p className="text-amber-600 mt-1">
                  {t('details.infoCards.fromKmBy', { previous: vehicle.previousMileage?.toLocaleString(), by: vehicle.mileageDecreasedBy })}
                </p>
                {vehicle.mileageDecreasedAt && (
                  <p className="text-amber-500">
                    {formatDate(new Date(vehicle.mileageDecreasedAt).toISOString().split('T')[0])}
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
        
        <Card className={displayReservation ? 'md:col-span-1' : ''}>
          <CardHeader className={displayReservation ? 'pb-1 pt-3' : 'pb-2'}>
            <CardTitle className="text-sm font-medium text-gray-500">{t('details.infoCards.currentFuelLevel')}</CardTitle>
          </CardHeader>
          <CardContent className={displayReservation ? 'pb-3' : ''}>
            <p className={`font-semibold capitalize ${displayReservation ? 'text-lg' : 'text-2xl'}`} data-testid="text-current-fuel-level">
              {vehicle.currentFuelLevel || t('details.general.na')}
            </p>
          </CardContent>
        </Card>

        <Card className={displayReservation ? 'md:col-span-1' : ''}>
          <CardHeader className={displayReservation ? 'pb-1 pt-3' : 'pb-2'}>
            <CardTitle className="text-sm font-medium text-gray-500">{t('details.infoCards.apkExpiration')}</CardTitle>
          </CardHeader>
          <CardContent className={displayReservation ? 'pb-3' : ''}>
            <div className="flex items-center space-x-2">
              <p className={`font-semibold ${displayReservation ? 'text-lg' : 'text-2xl'}`}>{vehicle.apkDate ? formatDate(vehicle.apkDate) : t('details.general.na')}</p>
              {vehicle.apkDate && (
                <Badge className={apkUrgencyClass}>
                  {daysUntilApk < 0 ? t('details.infoCards.daysOverdue', { count: Math.abs(daysUntilApk) }) : t('details.infoCards.daysCount', { count: daysUntilApk })}
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className={displayReservation ? 'md:col-span-1' : ''}>
          <CardHeader className={displayReservation ? 'pb-1 pt-3' : 'pb-2'}>
            <CardTitle className="text-sm font-medium text-gray-500">{t('details.infoCards.warrantyExpiration')}</CardTitle>
          </CardHeader>
          <CardContent className={displayReservation ? 'pb-3' : ''}>
            <div className="flex items-center space-x-2">
              <p className={`font-semibold ${displayReservation ? 'text-lg' : 'text-2xl'}`}>{vehicle.warrantyEndDate ? formatDate(vehicle.warrantyEndDate) : t('details.general.na')}</p>
              {vehicle.warrantyEndDate && (
                <Badge className={warrantyUrgencyClass}>
                  {t('details.infoCards.daysCount', { count: daysUntilWarranty })}
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>
        
        {activeReservation && (
          <Card className="bg-blue-50 border-blue-200 md:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-blue-700">{t('details.infoCards.currentRenter')}</CardTitle>
            </CardHeader>
            <CardContent>
              <CustomerViewDialog customerId={activeReservation.customerId}>
                <p className="text-2xl font-semibold text-blue-900 hover:text-blue-600 cursor-pointer transition-colors">
                  {activeReservation.customer?.name || t('details.general.na')}
                </p>
              </CustomerViewDialog>
              {(activeReservation.customer?.phone || activeReservation.customer?.driverPhone) && (
                <div className="text-sm text-blue-700 mt-1 space-y-0.5">
                  {activeReservation.customer?.phone && (
                    <p>
                      <span className="font-medium">{t('details.infoCards.phoneLabel')}</span> {activeReservation.customer.phone}
                    </p>
                  )}
                  {activeReservation.customer?.driverPhone && (
                    <p>
                      <span className="font-medium">{t('details.infoCards.driverLabel')}</span> {activeReservation.customer.driverPhone}
                    </p>
                  )}
                </div>
              )}
              <div className="text-sm text-blue-700 mt-2 pt-2 border-t border-blue-200">
                <p className="font-medium">{t('details.infoCards.rentalPeriodLabel')}</p>
                <p className="text-xs mt-0.5">
                  {formatDate(activeReservation.startDate)} - {activeReservation.endDate ? formatDate(activeReservation.endDate) : t('details.infoCards.tbd')}
                </p>
              </div>
              {spareAssignment && (
                <div className="mt-3 pt-3 border-t border-blue-200">
                  <div className="flex items-center gap-2 mb-1">
                    <Car className="h-4 w-4 text-orange-600" />
                    <span className="text-sm font-medium text-orange-700">{t('details.infoCards.spareVehicleAssigned')}</span>
                  </div>
                  <button
                    onClick={() => openVehicleDialog(spareAssignment.spareVehicle.id)}
                    className="text-sm text-orange-800 hover:text-orange-600 font-medium cursor-pointer transition-colors"
                    data-testid="link-spare-vehicle"
                  >
                    {spareAssignment.spareVehicle.brand} {spareAssignment.spareVehicle.model} ({formatLicensePlate(spareAssignment.spareVehicle.licensePlate)})
                  </button>
                  <p className="text-xs text-orange-600 mt-1">
                    {t('details.infoCards.sinceLabel', { date: formatDate(spareAssignment.replacementReservation.startDate) })}
                    {spareAssignment.replacementReservation.endDate && ` - ${formatDate(spareAssignment.replacementReservation.endDate)}`}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {actingAsSpareInfo && (
          <Card className="bg-orange-50 border-orange-200 md:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-orange-700 flex items-center gap-2">
                <Car className="h-4 w-4" />
                {t('details.infoCards.actingAsSpare')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {actingAsSpareInfo.customer && (
                <CustomerViewDialog customerId={actingAsSpareInfo.customer.id}>
                  <p className="text-2xl font-semibold text-orange-900 hover:text-orange-600 cursor-pointer transition-colors">
                    {actingAsSpareInfo.customer.name}
                  </p>
                </CustomerViewDialog>
              )}
              {actingAsSpareInfo.customer?.phone && (
                <div className="text-sm text-orange-700 mt-1 space-y-0.5">
                  <p>
                    <span className="font-medium">{t('details.infoCards.phoneLabel')}</span> {actingAsSpareInfo.customer.phone}
                  </p>
                </div>
              )}
              <div className="text-sm text-orange-700 mt-2 pt-2 border-t border-orange-200">
                <p className="font-medium">{t('details.infoCards.sparePeriodLabel')}</p>
                <p className="text-xs mt-0.5">
                  {formatDate(actingAsSpareInfo.replacementReservation.startDate)}
                  {actingAsSpareInfo.replacementReservation.endDate ? ` - ${formatDate(actingAsSpareInfo.replacementReservation.endDate)}` : ` ${t('details.infoCards.spareTbd')}`}
                </p>
              </div>
              <div className="mt-3 pt-3 border-t border-orange-200">
                <p className="text-xs text-orange-600 font-medium mb-1">{t('details.infoCards.replacementForLabel')}</p>
                <button
                  onClick={() => openVehicleDialog(actingAsSpareInfo.originalVehicle.id)}
                  className="text-sm text-orange-800 hover:text-orange-600 font-medium cursor-pointer transition-colors"
                  data-testid="link-original-vehicle"
                >
                  {actingAsSpareInfo.originalVehicle.brand} {actingAsSpareInfo.originalVehicle.model} ({formatLicensePlate(actingAsSpareInfo.originalVehicle.licensePlate)})
                </button>
              </div>
            </CardContent>
          </Card>
        )}
        
        {upcomingReservation && (
          <Card className="bg-green-50 border-green-200 md:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-green-700">{t('details.infoCards.upcomingReservation')}</CardTitle>
            </CardHeader>
            <CardContent>
              <CustomerViewDialog customerId={upcomingReservation.customerId}>
                <p className="text-2xl font-semibold text-green-900 hover:text-green-600 cursor-pointer transition-colors">
                  {upcomingReservation.customer?.name || t('details.general.na')}
                </p>
              </CustomerViewDialog>
              {(upcomingReservation.customer?.phone || upcomingReservation.customer?.driverPhone) && (
                <div className="text-sm text-green-700 mt-1 space-y-0.5">
                  {upcomingReservation.customer?.phone && (
                    <p>
                      <span className="font-medium">{t('details.infoCards.phoneLabel')}</span> {upcomingReservation.customer.phone}
                    </p>
                  )}
                  {upcomingReservation.customer?.driverPhone && (
                    <p>
                      <span className="font-medium">{t('details.infoCards.driverLabel')}</span> {upcomingReservation.customer.driverPhone}
                    </p>
                  )}
                </div>
              )}
              <div className="text-sm text-green-700 mt-2 pt-2 border-t border-green-200">
                <p className="font-medium">{t('details.infoCards.rentalPeriodLabel')}</p>
                <p className="text-xs mt-0.5">
                  {formatDate(upcomingReservation.startDate)} - {upcomingReservation.endDate ? formatDate(upcomingReservation.endDate) : t('details.infoCards.openEnded')}
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="general" value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid grid-cols-6 w-full">
          <TabsTrigger value="general">{t('details.tabs.general')}</TabsTrigger>
          <TabsTrigger value="expenses">{t('details.tabs.expenses')}</TabsTrigger>
          <TabsTrigger value="documents">{t('details.tabs.documents')}</TabsTrigger>
          <TabsTrigger value="reservations">{t('details.tabs.reservations')}</TabsTrigger>
          <TabsTrigger value="maintenance">{t('details.tabs.maintenance')}</TabsTrigger>
          <TabsTrigger value="history">{t('details.tabs.history')}</TabsTrigger>
        </TabsList>
        
        {/* General Information Tab */}
        <TabsContent value="general" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>{t('details.general.title')}</CardTitle>
              <CardDescription>{t('details.general.description')}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="mb-6">
                <h3 className="text-lg font-semibold border-b pb-2 mb-4">{t('details.general.basicInfo.title')}</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div>
                    <h4 className="text-sm font-medium text-gray-500 mb-1">{t('details.general.basicInfo.vehicleId')}</h4>
                    <p className="text-base">{vehicle.id}</p>
                  </div>

                  <div>
                    <h4 className="text-sm font-medium text-gray-500 mb-1">{t('details.general.basicInfo.licensePlate')}</h4>
                    <p className="text-base">{formatLicensePlate(vehicle.licensePlate)}</p>
                  </div>

                  <div>
                    <h4 className="text-sm font-medium text-gray-500 mb-1">{t('details.general.basicInfo.brand')}</h4>
                    <p className="text-base">{vehicle.brand}</p>
                  </div>

                  <div>
                    <h4 className="text-sm font-medium text-gray-500 mb-1">{t('details.general.basicInfo.model')}</h4>
                    <p className="text-base">{vehicle.model}</p>
                  </div>

                  <div>
                    <h4 className="text-sm font-medium text-gray-500 mb-1">{t('details.general.basicInfo.vehicleType')}</h4>
                    <p className="text-base">{vehicle.vehicleType || t('details.general.na')}</p>
                  </div>

                  <div>
                    <h4 className="text-sm font-medium text-gray-500 mb-1">{t('details.general.basicInfo.chassisNumber')}</h4>
                    <p className="text-base">{vehicle.chassisNumber || t('details.general.na')}</p>
                  </div>
                </div>
              </div>

              <div className="mb-6">
                <h3 className="text-lg font-semibold border-b pb-2 mb-4">{t('details.general.technicalInfo.title')}</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div>
                    <h4 className="text-sm font-medium text-gray-500 mb-1">{t('details.general.technicalInfo.fuelType')}</h4>
                    <p className="text-base">{vehicle.fuel || t('details.general.na')}</p>
                  </div>

                  <div>
                    <h4 className="text-sm font-medium text-gray-500 mb-1">{t('details.general.technicalInfo.recommendedOil')}</h4>
                    <p className="text-base font-semibold" data-testid="text-recommended-oil">
                      {vehicle.recommendedOil || <span className="text-gray-400 font-normal">{t('details.general.technicalInfo.notSpecified')}</span>}
                    </p>
                  </div>

                  <div>
                    <h4 className="text-sm font-medium text-gray-500 mb-1">{t('details.general.technicalInfo.adBlue')}</h4>
                    <p className="text-base">{isTrueValue(vehicle.adBlue) ? t('details.general.yes') : t('details.general.no')}</p>
                  </div>

                  <div>
                    <h4 className="text-sm font-medium text-gray-500 mb-1">{t('details.general.technicalInfo.apkDate')}</h4>
                    <p className="text-base">{vehicle.apkDate ? formatDate(vehicle.apkDate) : t('details.general.na')}</p>
                  </div>

                  <div>
                    <h4 className="text-sm font-medium text-gray-500 mb-1">{t('details.general.technicalInfo.productionDate')}</h4>
                    <p className="text-base">{vehicle.productionDate ? formatDate(vehicle.productionDate) : t('details.general.na')}</p>
                  </div>

                  <div>
                    <h4 className="text-sm font-medium text-gray-500 mb-1">{t('details.general.technicalInfo.warrantyEndDate')}</h4>
                    <p className="text-base">{vehicle.warrantyEndDate ? formatDate(vehicle.warrantyEndDate) : t('details.general.na')}</p>
                  </div>
                </div>
              </div>

              <div className="mb-6">
                <h3 className="text-lg font-semibold border-b pb-2 mb-4">{t('details.general.statusInfo.title')}</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div>
                    <h4 className="text-sm font-medium text-gray-500 mb-1">{t('details.general.statusInfo.company')}</h4>
                    <p className="text-base">{isTrueValue(vehicle.company) ? t('details.general.yes') : t('details.general.no')}</p>
                  </div>

                  <div>
                    <h4 className="text-sm font-medium text-gray-500 mb-1">{t('details.general.statusInfo.registeredTo')}</h4>
                    <p className="text-base">{isTrueValue(vehicle.registeredTo) ? t('details.general.yes') : t('details.general.no')}</p>
                  </div>

                  <div>
                    <h4 className="text-sm font-medium text-gray-500 mb-1">{t('details.general.statusInfo.registeredToDate')}</h4>
                    <p className="text-base">{vehicle.registeredToDate ? formatDate(vehicle.registeredToDate) : t('details.general.na')}</p>
                  </div>

                  <div>
                    <h4 className="text-sm font-medium text-gray-500 mb-1">{t('details.general.statusInfo.emissionsZoneAccess')}</h4>
                    <p className="text-base">{isTrueValue(vehicle.euroZoneAccess) ? t('details.general.yes') : t('details.general.no')}</p>
                  </div>

                  <div>
                    <h4 className="text-sm font-medium text-gray-500 mb-1">{t('details.general.statusInfo.paidPermitAccess')}</h4>
                    <p className="text-base">{isTrueValue(vehicle.euroZonePaidPermitAccess) ? t('details.general.yes') : t('details.general.no')}</p>
                  </div>

                  <div>
                    <h4 className="text-sm font-medium text-gray-500 mb-1">{t('details.general.statusInfo.euroZoneEndDate')}</h4>
                    <p className="text-base">{vehicle.euroZoneEndDate ? formatDate(vehicle.euroZoneEndDate) : t('details.general.na')}</p>
                  </div>

                  <div>
                    <h4 className="text-sm font-medium text-gray-500 mb-1">{t('details.general.statusInfo.moveIzi')}</h4>
                    <p className="text-base">{isTrueValue(vehicle.moveIziRegistered) ? t('details.general.yes') : t('details.general.no')}</p>
                  </div>

                  <div>
                    <h4 className="text-sm font-medium text-gray-500 mb-1">{t('details.general.statusInfo.moveIziRegistrationDate')}</h4>
                    <p className="text-base">{vehicle.moveIziRegistrationDate ? formatDate(vehicle.moveIziRegistrationDate) : t('details.general.na')}</p>
                  </div>

                  <div>
                    <h4 className="text-sm font-medium text-gray-500 mb-1">{t('details.general.statusInfo.moveIziExpirationDate')}</h4>
                    <p className="text-base">{vehicle.moveIziExpirationDate ? formatDate(vehicle.moveIziExpirationDate) : t('details.general.na')}</p>
                  </div>
                  
                  <div className="md:col-span-3">
                    <div className="flex items-center justify-between p-4 bg-blue-50 border border-blue-200 rounded-lg">
                      <div>
                        <h4 className="text-sm font-medium text-gray-700 mb-1">{t('details.general.availabilityStatus.title')}</h4>
                        <p className="text-base font-semibold">
                          {vehicle.availabilityStatus === 'available' && (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                              {t('details.general.availabilityStatus.available')}
                            </span>
                          )}
                          {vehicle.availabilityStatus === 'needs_fixing' && (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                              {t('details.general.availabilityStatus.needsFixing')}
                            </span>
                          )}
                          {vehicle.availabilityStatus === 'not_for_rental' && (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                              {t('details.general.availabilityStatus.notForRental')}
                            </span>
                          )}
                          {vehicle.availabilityStatus === 'rented' && (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                              {t('details.general.availabilityStatus.rented')}
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">
                          {t('details.general.availabilityStatus.hint')}
                        </p>
                      </div>
                      <AvailabilityToggleDialog 
                        vehicle={vehicle}
                        onSuccess={() => {
                          invalidateByPrefix(`/api/vehicles/${vehicleId}`);
                          invalidateByPrefix('/api/vehicles');
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Current Rental Mileage & Fuel Status */}
              {(currentActiveReservation || vehicle.departureMileage || vehicle.returnMileage) && (
                <div className="mb-6">
                  <h3 className="text-lg font-semibold border-b pb-2 mb-4">{t('details.general.currentRentalStatus.title')}</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <h4 className="text-sm font-medium text-gray-500 mb-1">{t('details.general.currentRentalStatus.pickupMileage')}</h4>
                      <p className="text-base">
                        {vehicle.departureMileage != null
                          ? `${Number(vehicle.departureMileage).toLocaleString()} km`
                          : currentActiveReservation?.pickupMileage != null
                          ? `${currentActiveReservation.pickupMileage.toLocaleString()} km`
                          : t('details.general.currentRentalStatus.notRecorded')}
                      </p>
                    </div>

                    <div>
                      <h4 className="text-sm font-medium text-gray-500 mb-1">{t('details.general.currentRentalStatus.returnMileage')}</h4>
                      <p className="text-base">
                        {vehicle.returnMileage != null
                          ? `${Number(vehicle.returnMileage).toLocaleString()} km`
                          : currentActiveReservation?.returnMileage != null
                          ? `${currentActiveReservation.returnMileage.toLocaleString()} km`
                          : t('details.general.currentRentalStatus.notRecorded')}
                      </p>
                    </div>

                    <div>
                      <h4 className="text-sm font-medium text-gray-500 mb-1">{t('details.general.currentRentalStatus.fuelLevelAtPickup')}</h4>
                      <p className="text-base capitalize">
                        {currentActiveReservation?.fuelLevelPickup
                          || (vehicle.departureMileage != null ? vehicle.currentFuelLevel : null)
                          || t('details.general.currentRentalStatus.notRecorded')}
                      </p>
                    </div>

                    <div>
                      <h4 className="text-sm font-medium text-gray-500 mb-1">{t('details.general.currentRentalStatus.fuelLevelAtReturn')}</h4>
                      <p className="text-base capitalize">
                        {currentActiveReservation?.fuelLevelReturn || t('details.general.currentRentalStatus.notRecorded')}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <div className="mb-6">
                <h3 className="text-lg font-semibold border-b pb-2 mb-4">{t('details.general.equipment.title')}</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div>
                    <h4 className="text-sm font-medium text-gray-500 mb-1">{t('details.general.equipment.gps')}</h4>
                    <p className="text-base">{isTrueValue(vehicle.gps) ? t('details.general.yes') : t('details.general.no')}</p>
                  </div>

                  <div>
                    <h4 className="text-sm font-medium text-gray-500 mb-1">{t('details.general.equipment.gpsActivated')}</h4>
                    <p className="text-base">{isTrueValue(vehicle.gpsActivated) ? t('details.general.yes') : t('details.general.no')}</p>
                  </div>

                  <div>
                    <h4 className="text-sm font-medium text-gray-500 mb-1">{t('details.general.equipment.gpsSwapped')}</h4>
                    <p className="text-base">{isTrueValue(vehicle.gpsSwapped) ? t('details.general.yes') : t('details.general.no')}</p>
                  </div>

                  <div>
                    <h4 className="text-sm font-medium text-gray-500 mb-1">{t('details.general.equipment.gpsImei')}</h4>
                    <p className="text-base">{vehicle.imei || t('details.general.na')}</p>
                  </div>

                  <div>
                    <h4 className="text-sm font-medium text-gray-500 mb-1">{t('details.general.equipment.roadsideAssistance')}</h4>
                    <p className="text-base">{isTrueValue(vehicle.roadsideAssistance) ? t('details.general.yes') : t('details.general.no')}</p>
                  </div>

                  <div>
                    <h4 className="text-sm font-medium text-gray-500 mb-1">{t('details.general.equipment.spareKey')}</h4>
                    <p className="text-base">
                      {isTrueValue(vehicle.spareKey) ? (
                        isTrueValue(vehicle.spareKeyWithCustomer) ? (
                          <span className="text-orange-600 font-medium">
                            {t('details.general.equipment.spareKeyWithCustomer', { name: vehicle.spareKeyCustomerName || t('details.general.equipment.spareKeyUnknownCustomer') })}
                          </span>
                        ) : (
                          t('details.general.yes')
                        )
                      ) : (
                        t('details.general.no')
                      )}
                    </p>
                  </div>

                  <div>
                    <h4 className="text-sm font-medium text-gray-500 mb-1">{t('details.general.equipment.winterTires')}</h4>
                    <p className="text-base">{isTrueValue(vehicle.winterTires) ? t('details.general.yes') : t('details.general.no')}</p>
                  </div>

                  <div>
                    <h4 className="text-sm font-medium text-gray-500 mb-1">{t('details.general.equipment.spareTire')}</h4>
                    <p className="text-base">{isTrueValue(vehicle.spareTire) ? t('details.general.yes') : t('details.general.no')}</p>
                  </div>

                  <div>
                    <h4 className="text-sm font-medium text-gray-500 mb-1">{t('details.general.equipment.toolsAndJack')}</h4>
                    <p className="text-base">{isTrueValue(vehicle.toolsAndJack) ? t('details.general.yes') : t('details.general.no')}</p>
                  </div>

                  <div>
                    <h4 className="text-sm font-medium text-gray-500 mb-1">{t('details.general.equipment.seatCovers')}</h4>
                    <p className="text-base">{isTrueValue(vehicle.seatcovers) ? t('details.general.yes') : t('details.general.no')}</p>
                  </div>

                  <div>
                    <h4 className="text-sm font-medium text-gray-500 mb-1">{t('details.general.equipment.backupBeepers')}</h4>
                    <p className="text-base">{isTrueValue(vehicle.backupbeepers) ? t('details.general.yes') : t('details.general.no')}</p>
                  </div>

                  <div>
                    <h4 className="text-sm font-medium text-gray-500 mb-1">{t('details.general.equipment.tireSize')}</h4>
                    <p className="text-base">{vehicle.tireSize || t('details.general.na')}</p>
                  </div>

                  <div>
                    <h4 className="text-sm font-medium text-gray-500 mb-1">{t('details.general.equipment.radioCode')}</h4>
                    <p className="text-base">{vehicle.radioCode || t('details.general.na')}</p>
                  </div>
                </div>
              </div>

              {vehicle.remarks && (
                <div className="mb-6">
                  <h3 className="text-lg font-semibold border-b pb-2 mb-4">{t('details.general.remarksTitle')}</h3>
                  <p className="text-base whitespace-pre-wrap">{vehicle.remarks}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        
        {/* Expenses Tab */}
        <TabsContent value="expenses" className="mt-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle>{t('details.expenses.historyTitle')}</CardTitle>
                <CardDescription>{t('details.expenses.historyDescription')}</CardDescription>
                <div className="flex justify-end space-x-2">
                  <ExpenseViewDialog 
                    vehicleId={vehicleId}
                    onSuccess={() => {
                      invalidateByPrefix(`/api/expenses/vehicle/${vehicleId}`);
                      invalidateByPrefix(`/api/vehicles/${vehicleId}`);
                    }}
                  />
                  <ExpenseAddDialog 
                    vehicleId={vehicleId}
                    onSuccess={() => {
                      invalidateByPrefix(`/api/expenses/vehicle/${vehicleId}`);
                      invalidateByPrefix(`/api/vehicles/${vehicleId}`);
                    }}
                  />
                </div>
              </CardHeader>
              <CardContent>
                {isLoadingExpenses ? (
                  <div className="flex justify-center p-6">
                    <svg className="animate-spin h-6 w-6 text-primary-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  </div>
                ) : totalByCategory.length === 0 ? (
                  <div className="text-center py-6 text-gray-500">
                    {t('details.expenses.noExpenses')}
                  </div>
                ) : (
                  <Accordion type="multiple" defaultValue={[]} className="w-full">
                    {totalByCategory.map(({ category, expenses: categoryExpenses, amount, count }) => {
                      const currentPage = getExpenseCategoryPage(category);
                      const totalPages = Math.ceil(count / EXPENSE_ITEMS_PER_PAGE);
                      const startIndex = (currentPage - 1) * EXPENSE_ITEMS_PER_PAGE;
                      const endIndex = startIndex + EXPENSE_ITEMS_PER_PAGE;
                      const paginatedExpenses = categoryExpenses.slice(startIndex, endIndex);
                      
                      return (
                        <AccordionItem key={category} value={category}>
                          <AccordionTrigger className="hover:bg-gray-50 px-4 py-3 rounded-md">
                            <div className="flex justify-between items-center w-full pr-4">
                              <div className="flex items-center gap-3">
                                <Badge variant="outline" className="text-sm font-medium">
                                  {category}
                                </Badge>
                                <span className="text-gray-500 text-sm">
                                  {t('details.expenses.expenseCount', { count })}
                                </span>
                              </div>
                              <div className="font-semibold text-right">
                                {<Price value={amount} />}
                              </div>
                            </div>
                          </AccordionTrigger>
                          <AccordionContent>
                            <div className="pt-2 pb-4 space-y-3">
                              {paginatedExpenses.map((expense) => (
                                <div key={expense.id} className="border-b pb-3 last:border-0 last:pb-0">
                                  <div className="flex justify-between items-start">
                                    <div>
                                      <p className="font-medium">{expense.description}</p>
                                      <div className="flex items-center mt-1">
                                        <span className="text-sm text-gray-500">{formatDate(expense.date)}</span>
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-1">
                                      <p className="text-lg font-semibold mr-1">{<Price value={Number(expense.amount)} />}</p>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-8 w-8 p-0"
                                        title={t('details.expenses.viewExpenseTitle')}
                                        onClick={() => openExpenseDialog(expense.id)}
                                      >
                                        <Eye className="h-4 w-4" />
                                      </Button>
                                      {expense.receiptFilePath && (
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          className="h-8 w-8 p-0"
                                          title={t('details.expenses.printReceiptTitle')}
                                          onClick={() => setReceiptPreviewExpense(expense)}
                                        >
                                          <Printer className="h-4 w-4" />
                                        </Button>
                                      )}
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-8 w-8 p-0 text-red-600 hover:text-red-800"
                                        title={t('details.expenses.deleteExpenseTitle')}
                                        onClick={() => setExpenseToDelete(expense)}
                                      >
                                        <Trash2 className="h-4 w-4" />
                                      </Button>
                                    </div>
                                  </div>
                                </div>
                              ))}
                              
                              {/* Pagination Controls */}
                              {totalPages > 1 && (
                                <div className="flex items-center justify-between mt-4 px-2 pt-3 border-t">
                                  <p className="text-sm text-muted-foreground">
                                    {t('details.expenses.showingRange', { start: startIndex + 1, end: Math.min(endIndex, count), count })}
                                  </p>
                                  <div className="flex gap-2">
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => setExpenseCategoryPage(category, currentPage - 1)}
                                      disabled={currentPage === 1}
                                    >
                                      <ChevronLeft className="h-4 w-4" />
                                      {t('details.expenses.previousButton')}
                                    </Button>
                                    <div className="flex items-center gap-1">
                                      {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                                        <Button
                                          key={page}
                                          variant={currentPage === page ? "default" : "outline"}
                                          size="sm"
                                          onClick={() => setExpenseCategoryPage(category, page)}
                                          className="w-8 h-8 p-0"
                                        >
                                          {page}
                                        </Button>
                                      ))}
                                    </div>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => setExpenseCategoryPage(category, currentPage + 1)}
                                      disabled={currentPage === totalPages}
                                    >
                                      {t('details.expenses.nextButton')}
                                      <ChevronRight className="h-4 w-4" />
                                    </Button>
                                  </div>
                                </div>
                              )}
                            </div>
                          </AccordionContent>
                        </AccordionItem>
                      );
                    })}
                  </Accordion>
                )}
              </CardContent>
            </Card>

            <AlertDialog open={!!expenseToDelete} onOpenChange={(open) => !open && setExpenseToDelete(null)}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{t('details.expenses.confirmDeleteExpenseTitle')}</AlertDialogTitle>
                  <AlertDialogDescription>
                    {t('details.expenses.confirmDeleteExpenseDescription')}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t('common:actions.cancel')}</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => expenseToDelete && deleteExpenseMutation.mutate(expenseToDelete.id)}
                    disabled={deleteExpenseMutation.isPending}
                    className="bg-red-600 hover:bg-red-700"
                  >
                    {t('details.expenses.deleteExpenseTitle')}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            <PdfPreviewDialog
              open={!!receiptPreviewExpense}
              onOpenChange={(open) => !open && setReceiptPreviewExpense(null)}
              url={receiptPreviewExpense ? `/api/expenses/${receiptPreviewExpense.id}/receipt` : null}
              title={t('details.expenses.printReceiptTitle')}
            />

            <Card>
              <CardHeader>
                <CardTitle>{t('details.expenses.summaryTitle')}</CardTitle>
                <CardDescription>{t('details.expenses.summaryDescription')}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="mb-6">
                  <h3 className="text-sm font-medium text-gray-500 mb-1">{t('details.expenses.totalExpensesLabel')}</h3>
                  <p className="text-3xl font-bold">{<Price value={totalExpenses} />}</p>
                </div>

                <div className="space-y-3">
                  {isLoadingExpenses ? (
                    <div className="flex justify-center p-6">
                      <svg className="animate-spin h-6 w-6 text-primary-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                    </div>
                  ) : totalByCategory.length === 0 ? (
                    <div className="text-center py-2 text-gray-500">
                      {t('details.expenses.noExpenseData')}
                    </div>
                  ) : (
                    totalByCategory.map(({ category, amount }) => (
                      <div key={category} className="flex justify-between items-center">
                        <span className="text-sm">{category}</span>
                        <span className="font-medium">{<Price value={amount} />}</span>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
        
        {/* Documents Tab */}
        <TabsContent value="documents" className="mt-6">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle>{t('details.documents.title')}</CardTitle>
                  <CardDescription>{t('details.documents.description')}</CardDescription>
                </div>
                <InlineDocumentUpload 
                  vehicleId={vehicleId} 
                  onSuccess={() => {
                    // Refresh the documents list after upload
                    invalidateByPrefix(`/api/vehicles/${vehicleId}`);
                    invalidateByPrefix(`/api/documents/vehicle/${vehicleId}`);
                  }}
                />
              </div>
            </CardHeader>
            <CardContent>
              {/* Interactive Damage Checks Section — always visible so staff
                  can create the first check from this page. */}
              <div className="mb-8 p-4 bg-blue-50 rounded-lg border border-blue-200">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-semibold text-blue-900">{t('details.documents.interactiveDamageChecksTitle')}</h3>
                  <Button
                    size="sm"
                    onClick={() => {
                      setEditingCheckId(null);
                      setInteractiveDamageCheckDialogOpen(true);
                    }}
                    data-testid="button-new-damage-check"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    {t('details.documents.newCheckButton')}
                  </Button>
                </div>
                {!interactiveDamageChecks || interactiveDamageChecks.length === 0 ? (
                  <div className="text-sm text-blue-700/70 italic">
                    {t('details.documents.noDamageChecks')}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {interactiveDamageChecks.map((check: any) => (
                      <div key={check.id} className="bg-white p-4 rounded-lg shadow-sm border border-blue-100">
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                              <Badge variant={check.checkType === 'pickup' ? 'default' : 'secondary'}>
                                {check.checkType === 'pickup' ? t('details.documents.pickupBadge') : t('details.documents.returnBadge')}
                              </Badge>
                              <span className="text-sm text-gray-600">
                                {new Date(check.checkDate).toLocaleDateString()}
                              </span>
                              {check.completedBy && (
                                <span className="text-sm text-gray-500">{t('details.documents.byLabel', { name: check.completedBy })}</span>
                              )}
                            </div>
                            {check.notes && (
                              <p className="text-sm text-gray-600 mt-1">{check.notes}</p>
                            )}
                            <div className="flex gap-2 text-xs text-gray-500 mt-2">
                              {check.mileage && <span>{t('details.documents.mileageLabel', { mileage: check.mileage })}</span>}
                              {check.fuelLevel && <span>{t('details.documents.fuelLabel', { fuel: check.fuelLevel })}</span>}
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={async () => {
                                try {
                                  const response = await fetch(`/api/interactive-damage-checks/${check.id}/pdf`, {
                                    credentials: 'include',
                                  });
                                  
                                  if (!response.ok) {
                                    throw new Error('Failed to generate PDF');
                                  }
                                  
                                  // Get the PDF blob
                                  const blob = await response.blob();
                                  
                                  // Create a download link
                                  const url = window.URL.createObjectURL(blob);
                                  const a = document.createElement('a');
                                  a.href = url;
                                  a.download = `damage_check_${check.vehicleId}_${check.checkType}_${new Date(check.checkDate).toISOString().split('T')[0]}.pdf`;
                                  document.body.appendChild(a);
                                  a.click();
                                  document.body.removeChild(a);
                                  window.URL.revokeObjectURL(url);
                                  
                                  toast({
                                    title: t('details.documents.toasts.pdfGeneratedTitle'),
                                    description: t('details.documents.toasts.pdfGeneratedDescription')
                                  });
                                } catch (error) {
                                  console.error('Error generating PDF:', error);
                                  toast({
                                    title: t('details.documents.toasts.errorTitle'),
                                    description: t('details.documents.toasts.pdfFailedDescription'),
                                    variant: "destructive"
                                  });
                                }
                              }}
                              data-testid={`button-pdf-${check.id}`}
                            >
                              <Printer className="h-4 w-4 mr-1" />
                              {t('details.documents.pdfButton')}
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setEditingCheckId(check.id);
                                setInteractiveDamageCheckDialogOpen(true);
                              }}
                              data-testid={`button-edit-${check.id}`}
                            >
                              <Edit className="h-4 w-4 mr-1" />
                              {t('common:actions.edit')}
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setDamageCheckToDelete({ id: check.id, checkType: check.checkType, checkDate: check.checkDate });
                                setDeleteDamageCheckDialogOpen(true);
                              }}
                              data-testid={`button-delete-${check.id}`}
                            >
                              <Trash2 className="h-4 w-4 mr-1" />
                              {t('common:actions.delete')}
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              
              {/* Document Categories */}
              <div className="mb-6">
                <h3 className="text-lg font-semibold mb-3">{t('details.documents.quickUploadCategoriesTitle')}</h3>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  <div className="flex flex-col items-center bg-slate-50 p-3 rounded-md hover:bg-slate-100 cursor-pointer transition-colors">
                    <InlineDocumentUpload 
                      vehicleId={vehicleId} 
                      preselectedType="APK Inspection"
                      onSuccess={() => {
                        invalidateByPrefix(`/api/vehicles/${vehicleId}`);
                        invalidateByPrefix(`/api/documents/vehicle/${vehicleId}`);
                      }}
                    >
                      <div className="text-center">
                        <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mx-auto mb-2 text-blue-500">
                          <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                          <polyline points="14 2 14 8 20 8" />
                          <path d="M12 18v-6" />
                          <path d="m9 15 3 3 3-3" />
                        </svg>
                        <span className="block text-sm font-medium">{t('details.documents.categories.apkInspection')}</span>
                      </div>
                    </InlineDocumentUpload>
                  </div>
                  
                  <div className="flex flex-col items-center bg-slate-50 p-3 rounded-md hover:bg-slate-100 cursor-pointer transition-colors">
                    <InlineDocumentUpload 
                      vehicleId={vehicleId}
                      preselectedType="Contract"
                      onSuccess={() => {
                        invalidateByPrefix(`/api/vehicles/${vehicleId}`);
                        invalidateByPrefix(`/api/documents/vehicle/${vehicleId}`);
                      }}
                    >
                      <div className="text-center">
                        <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mx-auto mb-2 text-orange-500">
                          <path d="M20 7h-3a2 2 0 0 1-2-2V2" />
                          <path d="M9 9h6" />
                          <path d="M9 13h6" />
                          <path d="M9 17h3" />
                          <path d="M4 22h14a2 2 0 0 0 2-2V7.5L14.5 2H6a2 2 0 0 0-2 2v4" />
                          <path d="M2 15h6v6H2z" />
                        </svg>
                        <span className="block text-sm font-medium">{t('details.documents.categories.contract')}</span>
                      </div>
                    </InlineDocumentUpload>
                  </div>
                  
                  <div className="flex flex-col items-center bg-slate-50 p-3 rounded-md hover:bg-slate-100 cursor-pointer transition-colors">
                    <InlineDocumentUpload 
                      vehicleId={vehicleId}
                      preselectedType="Damage Report"
                      onSuccess={() => {
                        invalidateByPrefix(`/api/vehicles/${vehicleId}`);
                        invalidateByPrefix(`/api/documents/vehicle/${vehicleId}`);
                      }}
                    >
                      <div className="text-center">
                        <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mx-auto mb-2 text-red-500">
                          <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                          <circle cx="12" cy="12" r="3" />
                        </svg>
                        <span className="block text-sm font-medium">{t('details.documents.categories.damageReport')}</span>
                      </div>
                    </InlineDocumentUpload>
                  </div>
                  
                  <div className="flex flex-col items-center bg-slate-50 p-3 rounded-md hover:bg-slate-100 cursor-pointer transition-colors">
                    <InlineDocumentUpload 
                      vehicleId={vehicleId}
                      preselectedType="Vehicle Photos"
                      onSuccess={() => {
                        invalidateByPrefix(`/api/vehicles/${vehicleId}`);
                        invalidateByPrefix(`/api/documents/vehicle/${vehicleId}`);
                      }}
                    >
                      <div className="text-center">
                        <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mx-auto mb-2 text-green-500">
                          <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
                          <circle cx="9" cy="9" r="2" />
                          <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
                        </svg>
                        <span className="block text-sm font-medium">{t('details.documents.categories.vehiclePhotos')}</span>
                      </div>
                    </InlineDocumentUpload>
                  </div>
                  
                  <div className="flex flex-col items-center bg-slate-50 p-3 rounded-md hover:bg-slate-100 cursor-pointer transition-colors">
                    <InlineDocumentUpload 
                      vehicleId={vehicleId}
                      preselectedType="Maintenance Record"
                      onSuccess={() => {
                        invalidateByPrefix(`/api/vehicles/${vehicleId}`);
                        invalidateByPrefix(`/api/documents/vehicle/${vehicleId}`);
                      }}
                    >
                      <div className="text-center">
                        <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mx-auto mb-2 text-purple-500">
                          <path d="M14 3v4a1 1 0 0 0 1 1h4" />
                          <path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2Z" />
                          <line x1="9" x2="15" y1="9" y2="9" />
                          <line x1="9" x2="15" y1="13" y2="13" />
                          <line x1="9" x2="15" y1="17" y2="17" />
                        </svg>
                        <span className="block text-sm font-medium">{t('details.documents.categories.maintenance')}</span>
                      </div>
                    </InlineDocumentUpload>
                  </div>
                </div>
              </div>

              {/* Document List */}
              {isLoadingDocuments ? (
                <div className="flex justify-center p-6">
                  <svg className="animate-spin h-6 w-6 text-primary-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                </div>
              ) : documents?.length === 0 ? (
                <div className="text-center py-6 text-gray-500">
                  {t('details.documents.noDocuments')}
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Document categories */}
                  {Object.entries(documentsByCategory).map(([category, docs]) => {
                    const isExpanded = expandedCategories.has(category);
                    const toggleCategory = () => {
                      setExpandedCategories(prev => {
                        const newSet = new Set(prev);
                        if (newSet.has(category)) {
                          newSet.delete(category);
                        } else {
                          newSet.add(category);
                        }
                        return newSet;
                      });
                    };
                    
                    return (
                      <div key={category} className="border rounded-lg overflow-hidden">
                        <button
                          onClick={toggleCategory}
                          className="w-full flex items-center justify-between p-4 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
                          data-testid={`toggle-category-${category}`}
                        >
                          <div className="flex items-center gap-3">
                            {isExpanded ? (
                              <ChevronDown className="h-5 w-5 text-gray-600" />
                            ) : (
                              <ChevronRight className="h-5 w-5 text-gray-600" />
                            )}
                            <h3 className="text-lg font-medium">{category}</h3>
                          </div>
                          <Badge variant="outline" className="ml-2">
                            {t('details.documents.documentCount', { count: docs.length })}
                          </Badge>
                        </button>
                        
                        {isExpanded && (
                          <div className="p-4">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                              {docs.map((document) => (
                                <Card key={document.id} className="overflow-hidden">
                                  <div className="bg-gray-100 p-6 flex items-center justify-center">
                                    <DocumentIcon type={document.contentType} />
                                  </div>
                                  <CardContent className="p-4">
                                    <h3 className="font-medium mb-1 truncate" title={document.fileName}>{document.fileName}</h3>
                                    <div className="flex items-center text-sm text-gray-500 mb-2">
                                      <Badge variant="outline" className="mr-2">{document.documentType}</Badge>
                                      <span>{formatDate(document.uploadDate?.toString() || "")}</span>
                                    </div>
                                    {document.createdBy && (
                                      <div className="text-xs text-gray-500 mb-2">
                                        {t('details.documents.createdByLabel', { name: document.createdBy })}
                                      </div>
                                    )}
                                    <div className="flex justify-between items-center gap-2 mt-2">
                                      <button
                                        onClick={() => window.open(
                                          `/api/documents/view/${document.id}`,
                                          'Document Preview',
                                          'width=900,height=700,toolbar=no,menubar=no,location=no,status=no,scrollbars=yes,resizable=yes'
                                        )}
                                        className="text-blue-600 hover:text-blue-800 text-sm flex items-center gap-1 transition-colors"
                                        data-testid={`button-view-document-${document.id}`}
                                      >
                                        <Eye className="h-3.5 w-3.5" />
                                        {t('common:actions.view')}
                                      </button>

                                      <a
                                        href={`/api/documents/download/${document.id}`}
                                        className="text-gray-600 hover:text-gray-800 text-sm flex items-center gap-1 transition-colors"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        data-testid={`link-download-document-${document.id}`}
                                      >
                                        <Download className="h-3.5 w-3.5" />
                                        {t('common:actions.download')}
                                      </a>
                                      
                                      <button 
                                        onClick={(e) => {
                                          e.preventDefault();
                                          const printWindow = window.open(
                                            `/api/documents/view/${document.id}`,
                                            'Print Preview',
                                            'width=900,height=700,toolbar=no,menubar=no,location=no,status=no,scrollbars=yes,resizable=yes'
                                          );
                                          if (printWindow) {
                                            printWindow.onload = () => {
                                              printWindow.print();
                                            };
                                          }
                                        }}
                                        className="text-green-600 hover:text-green-800 text-sm flex items-center gap-1 transition-colors"
                                        data-testid={`button-print-document-${document.id}`}
                                      >
                                        <Printer className="h-3.5 w-3.5" />
                                        {t('common:actions.print')}
                                      </button>

                                      <button
                                        className="text-red-600 hover:text-red-800 text-sm flex items-center gap-1 transition-colors"
                                        data-testid={`button-delete-document-${document.id}`}
                                        onClick={() => {
                                          setDocumentToDelete({ id: document.id, fileName: document.fileName });
                                          setDeleteDocumentDialogOpen(true);
                                        }}
                                      >
                                        <Trash2 className="h-3.5 w-3.5" />
                                        {t('common:actions.delete')}
                                      </button>
                                    </div>
                                  </CardContent>
                                </Card>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        
        {/* Reservations Tab */}
        <TabsContent value="reservations" className="mt-6">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle>{t('details.reservations.historyTitle')}</CardTitle>
                  <CardDescription>{t('details.reservations.historyDescription')}</CardDescription>
                </div>
                <ReservationAddDialog initialVehicleId={vehicleId}>
                  <Button size="sm">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-calendar-plus mr-2">
                      <path d="M21 13V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h8" />
                      <line x1="16" x2="16" y1="2" y2="6" />
                      <line x1="8" x2="8" y1="2" y2="6" />
                      <line x1="3" x2="21" y1="10" y2="10" />
                      <line x1="19" x2="19" y1="16" y2="22" />
                      <line x1="16" x2="22" y1="19" y2="19" />
                    </svg>
                    {t('details.reservations.newReservationButton')}
                  </Button>
                </ReservationAddDialog>
              </div>
            </CardHeader>
            <CardContent>
              {isLoadingReservations ? (
                <div className="flex justify-center p-6">
                  <svg className="animate-spin h-6 w-6 text-primary-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                </div>
              ) : reservations?.length === 0 ? (
                <div className="text-center py-6 text-gray-500">
                  {t('details.reservations.noReservations')}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          {t('details.reservations.tableHeaders.customer')}
                        </th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          {t('details.reservations.tableHeaders.period')}
                        </th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          {t('details.reservations.tableHeaders.status')}
                        </th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          {t('details.reservations.tableHeaders.price')}
                        </th>
                        <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                          {t('details.reservations.tableHeaders.actions')}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {reservations?.map((reservation) => (
                        <tr key={reservation.id}>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-900">{reservation.customer?.name}</div>
                            <div className="text-xs text-gray-500">{reservation.customer?.phone}</div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-900">
                              <span>{formatDate(reservation.startDate)}</span> -
                              <span> {reservation.endDate ? formatDate(reservation.endDate) : t('details.reservations.openEnded')}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <StatusBadge status={reservation.status} />
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {<Price value={reservation.totalPrice} />}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                            <div className="flex items-center justify-end space-x-2">
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                className="text-primary-600 hover:text-primary-800"
                                onClick={() => {
                                  setSelectedReservation(reservation);
                                  setViewReservationDialogOpen(true);
                                }}
                              >
                                {t('common:actions.view')}
                              </Button>

                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-blue-600 hover:text-blue-800"
                                onClick={() => {
                                  setEditReservationId(reservation.id);
                                  setEditReservationDialogOpen(true);
                                }}
                              >
                                {t('common:actions.edit')}
                              </Button>
                              
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button 
                                    variant="ghost" 
                                    size="sm" 
                                    className="text-red-600 hover:text-red-800"
                                    disabled={deleteReservationMutation.isPending}
                                  >
                                    {deleteReservationMutation.isPending ? (
                                      <>
                                        <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-red-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                        </svg>
                                        {t('common:status.deleting')}
                                      </>
                                    ) : (
                                      <>
                                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2">
                                          <path d="M3 6h18"></path>
                                          <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path>
                                          <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
                                        </svg>
                                        {t('common:actions.delete')}
                                      </>
                                    )}
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>{t('details.reservations.confirmDeleteTitle')}</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      {t('details.reservations.confirmDeleteDescription', { brand: vehicle.brand, model: vehicle.model, plate: formatLicensePlate(vehicle.licensePlate) })}
                                      <p className="mt-2 font-medium">
                                        {formatDate(reservation.startDate)} - {reservation.endDate ? formatDate(reservation.endDate) : t('details.reservations.openEnded')}
                                      </p>
                                      <p className="mt-1 text-sm text-gray-500">
                                        {t('details.reservations.customerLabel', { name: reservation.customer?.name })}
                                      </p>
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>{t('common:actions.cancel')}</AlertDialogCancel>
                                    <AlertDialogAction
                                      onClick={(e) => {
                                        e.preventDefault();
                                        deleteReservationMutation.mutate(reservation.id);
                                      }}
                                      className="bg-red-600 hover:bg-red-700 focus:ring-red-500"
                                    >
                                      {t('common:actions.delete')}
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Customer Blacklist Section */}
          <Card className="mt-6">
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-red-500">
                      <circle cx="12" cy="12" r="10"/>
                      <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
                    </svg>
                    {t('details.reservations.blacklist.title')}
                  </CardTitle>
                  <CardDescription>{t('details.reservations.blacklist.description')}</CardDescription>
                </div>
                <Dialog open={isAddToBlacklistOpen} onOpenChange={setIsAddToBlacklistOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm" variant="outline" className="flex items-center gap-2" data-testid="button-add-to-blacklist">
                      <Plus className="h-4 w-4" />
                      {t('details.reservations.blacklist.addButton')}
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-[650px] md:max-w-[720px]">
                    <DialogHeader>
                      <DialogTitle>{t('details.reservations.blacklist.addDialogTitle')}</DialogTitle>
                      <DialogDescription>
                        {t('details.reservations.blacklist.addDialogDescription')}
                      </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                      <div className="space-y-2">
                        <Label htmlFor="blacklist-customer">{t('details.reservations.blacklist.customerLabel')}</Label>
                        <SearchableCombobox
                          options={blacklistCustomerOptions}
                          value={selectedBlacklistCustomerId}
                          onChange={setSelectedBlacklistCustomerId}
                          placeholder={t('details.reservations.blacklist.searchPlaceholder')}
                          searchPlaceholder={t('details.reservations.blacklist.searchByPlaceholder')}
                          emptyMessage={t('details.reservations.blacklist.noCustomersFound')}
                          groups={false}
                          className="w-full"
                          data-testid="select-blacklist-customer"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="blacklist-reason">{t('details.reservations.blacklist.reasonLabel')}</Label>
                        <Textarea
                          id="blacklist-reason"
                          placeholder={t('details.reservations.blacklist.reasonPlaceholder')}
                          value={blacklistReason}
                          onChange={(e) => setBlacklistReason(e.target.value)}
                          data-testid="input-blacklist-reason"
                        />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button
                        variant="outline"
                        onClick={() => {
                          setIsAddToBlacklistOpen(false);
                          setSelectedBlacklistCustomerId("");
                          setBlacklistReason("");
                        }}
                      >
                        {t('common:actions.cancel')}
                      </Button>
                      <Button
                        onClick={() => {
                          if (selectedBlacklistCustomerId) {
                            addToBlacklistMutation.mutate({
                              customerId: parseInt(selectedBlacklistCustomerId),
                              reason: blacklistReason || undefined
                            });
                          }
                        }}
                        disabled={!selectedBlacklistCustomerId || addToBlacklistMutation.isPending}
                        data-testid="button-confirm-blacklist"
                      >
                        {addToBlacklistMutation.isPending ? (
                          <>
                            <svg className="animate-spin -ml-1 mr-2 h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            {t('details.reservations.blacklist.addingButton')}
                          </>
                        ) : (
                          t('details.reservations.blacklist.addButton2')
                        )}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent>
              {isLoadingBlacklist ? (
                <div className="flex justify-center p-6">
                  <svg className="animate-spin h-6 w-6 text-primary-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                </div>
              ) : blacklistedCustomers.length === 0 ? (
                <div className="text-center py-6 text-gray-500">
                  <p>{t('details.reservations.blacklist.noBlacklisted')}</p>
                  <p className="text-sm mt-1">{t('details.reservations.blacklist.allCanRent')}</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {blacklistedCustomers.map((entry: any) => (
                    <div key={entry.id} className="flex items-center justify-between p-4 border rounded-lg bg-red-50 dark:bg-red-900/10" data-testid={`blacklist-entry-${entry.id}`}>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{entry.customer?.name || t('details.reservations.blacklist.unknownCustomer')}</span>
                          {entry.customer?.email && (
                            <span className="text-sm text-gray-500">({entry.customer.email})</span>
                          )}
                        </div>
                        {entry.reason && (
                          <p className="text-sm text-gray-600 mt-1">
                            <span className="font-medium">{t('details.reservations.blacklist.reasonPrefix')}</span> {entry.reason}
                          </p>
                        )}
                        <p className="text-xs text-gray-400 mt-1">
                          {entry.createdByUsername
                            ? t('details.reservations.blacklist.addedLabelWithBy', { date: entry.createdAt ? formatDate(entry.createdAt) : t('details.reservations.blacklist.unknownDate'), by: entry.createdByUsername })
                            : t('details.reservations.blacklist.addedLabel', { date: entry.createdAt ? formatDate(entry.createdAt) : t('details.reservations.blacklist.unknownDate') })}
                        </p>
                      </div>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="text-red-600 hover:text-red-800 hover:bg-red-100"
                            data-testid={`button-remove-blacklist-${entry.id}`}
                          >
                            <Trash2 className="h-4 w-4 mr-1" />
                            {t('details.reservations.blacklist.removeButton')}
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>{t('details.reservations.blacklist.confirmRemoveTitle')}</AlertDialogTitle>
                            <AlertDialogDescription>
                              <Trans
                                i18nKey="details.reservations.blacklist.confirmRemoveDescription"
                                ns="vehicles"
                                values={{ name: entry.customer?.name }}
                                components={{ 1: <strong /> }}
                              />
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>{t('common:actions.cancel')}</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => removeFromBlacklistMutation.mutate(entry.id)}
                              className="bg-red-600 hover:bg-red-700"
                            >
                              {t('details.reservations.blacklist.removeConfirmButton')}
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        
        {/* Maintenance Tab */}
        <TabsContent value="maintenance" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>{t('details.maintenance.scheduleTitle')}</CardTitle>
              <CardDescription>{t('details.maintenance.scheduleDescription')}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                <div className="border p-4 rounded-lg">
                  <h3 className="text-lg font-medium mb-2">{t('details.maintenance.apkInspectionTitle')}</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-gray-500">{t('details.maintenance.currentApkValidUntil')}</p>
                      <p className="text-lg font-medium">{vehicle.apkDate ? formatDate(vehicle.apkDate) : t('details.maintenance.notSet')}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">{daysUntilApk < 0 ? t('details.maintenance.overdueByLabel') : t('details.maintenance.daysRemainingLabel')}</p>
                      <div className="flex items-center">
                        <p className="text-lg font-medium mr-2">{Math.abs(daysUntilApk)}</p>
                        {vehicle.apkDate && <Badge className={apkUrgencyClass}>{daysUntilApk < 0 ? t('details.maintenance.expiredBadge') : daysUntilApk <= 30 ? t('details.maintenance.actionNeededSoonBadge') : t('details.maintenance.okBadge')}</Badge>}
                      </div>
                    </div>
                  </div>
                  <div className="mt-4 flex gap-2">
                    <Button
                      size="sm"
                      variant={daysUntilApk <= 30 ? "default" : "outline"}
                      onClick={() => setIsApkInspectionOpen(true)}
                      data-testid="button-schedule-apk-inspection"
                    >
                      {t('details.maintenance.scheduleApkButton')}
                    </Button>
                    <Dialog open={isApkReminderOpen} onOpenChange={setIsApkReminderOpen}>
                      <DialogTrigger asChild>
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex items-center gap-2"
                          data-testid="button-send-apk-reminder"
                        >
                          <Bell className="h-4 w-4" />
                          {t('details.maintenance.sendApkReminderButton')}
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="sm:max-w-[800px] max-h-[90vh]">
                        <DialogHeader>
                          <DialogTitle className="flex items-center gap-2">
                            <Mail className="h-5 w-5" />
                            {t('details.maintenance.reminderDialogTitle', { plate: vehicle?.licensePlate })}
                          </DialogTitle>
                          <DialogDescription>
                            {t('details.maintenance.reminderDialogDescription')}
                          </DialogDescription>
                        </DialogHeader>
                        
                        <ScrollArea className="max-h-[60vh] overflow-y-auto">
                          <div className="grid gap-6 py-4">
                            
                            {/* Customer Email Section */}
                            <div className="space-y-4">
                              <div className="flex items-center gap-2">
                                <User className="h-4 w-4" />
                                <h3 className="text-lg font-medium">{t('details.maintenance.customerEmailSectionTitle')}</h3>
                              </div>

                              {customersWithReservations.length > 0 ? (
                                <div className="space-y-3">
                                  {customersWithReservations.map((item: any, index: number) => {
                                    // Collect all available email addresses for this customer
                                    const customerEmails = [];
                                    if (item.customer?.emailForMOT) customerEmails.push({ label: t('details.maintenance.apkMotEmailLabel'), value: item.customer.emailForMOT });
                                    if (item.customer?.email) customerEmails.push({ label: t('details.maintenance.mainEmailLabel'), value: item.customer.email });
                                    if (item.customer?.emailForInvoices) customerEmails.push({ label: t('details.maintenance.invoiceEmailLabel'), value: item.customer.emailForInvoices });
                                    if (item.customer?.emailGeneral) customerEmails.push({ label: t('details.maintenance.generalEmailLabel'), value: item.customer.emailGeneral });
                                    
                                    return (
                                      <div key={item.customer?.id || index} className="border rounded-lg p-4">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                          <div>
                                            <Label className="text-sm font-medium">{t('details.maintenance.customerNameLabel')}</Label>
                                            <p className="text-sm">
                                              {item.customer ? `${item.customer.firstName} ${item.customer.lastName}` : t('details.maintenance.unknownCustomer')}
                                            </p>
                                            <p className="text-xs text-gray-500">
                                              {t('details.maintenance.customerIdLabel', { id: item.customer?.id || t('details.maintenance.na') })}
                                            </p>
                                          </div>
                                          <div>
                                            <Label htmlFor={`email-${item.customer?.id}`} className="text-sm font-medium">
                                              {t('details.maintenance.emailAddressLabel')}
                                            </Label>
                                            
                                            {customerEmails.length > 1 ? (
                                              <div className="space-y-2">
                                                {/* Dropdown to select which email */}
                                                <Select
                                                  value=""
                                                  onValueChange={(value) => 
                                                    setEditableEmails(prev => ({
                                                      ...prev,
                                                      [item.customer?.id]: value
                                                    }))
                                                  }
                                                >
                                                  <SelectTrigger className="mt-1" data-testid={`select-email-${item.customer?.id}`}>
                                                    <SelectValue placeholder={t('details.maintenance.selectFromEmailsPlaceholder', { count: customerEmails.length })} />
                                                  </SelectTrigger>
                                                  <SelectContent>
                                                    {customerEmails.map((emailOption, idx) => (
                                                      <SelectItem key={idx} value={emailOption.value}>
                                                        {emailOption.label}: {emailOption.value}
                                                      </SelectItem>
                                                    ))}
                                                  </SelectContent>
                                                </Select>
                                                
                                                {/* Editable input field */}
                                                <Input
                                                  id={`email-${item.customer?.id}`}
                                                  type="email"
                                                  value={editableEmails[item.customer?.id] || ''}
                                                  onChange={(e) => 
                                                    setEditableEmails(prev => ({
                                                      ...prev,
                                                      [item.customer?.id]: e.target.value
                                                    }))
                                                  }
                                                  placeholder={t('details.maintenance.typeOrSelectPlaceholder')}
                                                  data-testid={`input-email-${item.customer?.id}`}
                                                />
                                              </div>
                                            ) : (
                                              <Input
                                                id={`email-${item.customer?.id}`}
                                                type="email"
                                                value={editableEmails[item.customer?.id] || ''}
                                                onChange={(e) =>
                                                  setEditableEmails(prev => ({
                                                    ...prev,
                                                    [item.customer?.id]: e.target.value
                                                  }))
                                                }
                                                placeholder={t('details.maintenance.enterEmailPlaceholder')}
                                                className="mt-1"
                                                data-testid={`input-email-${item.customer?.id}`}
                                              />
                                            )}
                                          </div>
                                        </div>
                                        <div className="mt-2 text-xs text-gray-500">
                                          {t('details.maintenance.reservationLabel', { start: item.reservation?.startDate, end: item.reservation?.endDate })}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              ) : (
                                <div className="border rounded-lg p-6 text-center text-gray-500">
                                  <User className="h-8 w-8 mx-auto mb-2 text-gray-400" />
                                  <p>{t('details.maintenance.noCustomersFoundTitle')}</p>
                                  <p className="text-sm">{t('details.maintenance.noCustomersFoundHint')}</p>
                                </div>
                              )}
                            </div>

                            <Separator />

                            {/* Template Preview and Editing Section */}
                            <div className="space-y-4">
                              <div className="flex items-center gap-2">
                                <Eye className="h-4 w-4" />
                                <h3 className="text-lg font-medium">{t('details.maintenance.templateSelectionTitle')}</h3>
                              </div>

                              <div className="space-y-4">
                                {/* Template Selector */}
                                <div>
                                  <Label htmlFor="template-select" className="text-sm font-medium">
                                    {t('details.maintenance.selectTemplateLabel')}
                                  </Label>
                                  <Select
                                    value={selectedTemplateId?.toString() || ""}
                                    onValueChange={handleTemplateSelect}
                                  >
                                    <SelectTrigger className="mt-1" data-testid="select-email-template">
                                      <SelectValue placeholder={t('details.maintenance.chooseTemplatePlaceholder')} />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {emailTemplates.length > 0 ? (
                                        emailTemplates.map((template: any) => (
                                          <SelectItem key={template.id} value={template.id.toString()}>
                                            {template.name} {template.category ? `(${template.category})` : ''}
                                          </SelectItem>
                                        ))
                                      ) : (
                                        <SelectItem value="no-templates" disabled>
                                          {t('details.maintenance.noTemplatesAvailable')}
                                        </SelectItem>
                                      )}
                                    </SelectContent>
                                  </Select>
                                  <p className="text-xs text-gray-500 mt-1">
                                    {t('details.maintenance.templateHint')}
                                  </p>
                                </div>

                                <Separator />

                                <div>
                                  <Label htmlFor="template-subject" className="text-sm font-medium">
                                    {t('details.maintenance.emailSubjectLabel')}
                                  </Label>
                                  <Input
                                    id="template-subject"
                                    value={templateSubject}
                                    onChange={(e) => setTemplateSubject(e.target.value)}
                                    placeholder={t('details.maintenance.subjectPlaceholder')}
                                    className="mt-1"
                                    data-testid="input-template-subject"
                                  />
                                </div>

                                <div>
                                  <Label htmlFor="template-content" className="text-sm font-medium">
                                    {t('details.maintenance.emailContentLabel')}
                                  </Label>
                                  <Textarea
                                    id="template-content"
                                    value={templateContent}
                                    onChange={(e) => setTemplateContent(e.target.value)}
                                    rows={10}
                                    placeholder={t('details.maintenance.contentPlaceholder')}
                                    className="mt-1 font-mono text-sm"
                                    data-testid="textarea-template-content"
                                  />
                                  <p className="text-xs text-gray-500 mt-1">
                                    {t('details.maintenance.contentHint')}
                                  </p>
                                </div>
                              </div>

                              {/* Template Preview Box */}
                              <div className="border rounded-lg p-4 bg-gray-50">
                                <h4 className="font-medium mb-2 flex items-center gap-2">
                                  <Mail className="h-4 w-4" />
                                  {t('details.maintenance.previewTitle')}
                                </h4>
                                <div className="bg-white border rounded p-3 text-sm">
                                  <div className="font-medium mb-2">{t('details.maintenance.subjectPrefix', { subject: templateSubject })}</div>
                                  <Separator className="my-2" />
                                  <div className="whitespace-pre-wrap">{templateContent}</div>
                                </div>
                              </div>
                            </div>

                          </div>
                        </ScrollArea>

                        <DialogFooter className="mt-4">
                          <Button
                            variant="outline"
                            onClick={() => {
                              setIsApkReminderOpen(false);
                              setCustomMessage("");
                              setTemplateSubject("");
                              setTemplateContent("");
                              setEditableEmails({});
                              setSelectedTemplateId(null);
                            }}
                            data-testid="button-cancel-reminder"
                          >
                            {t('common:actions.cancel')}
                          </Button>
                          <Button
                            onClick={() => sendApkReminderMutation.mutate({
                              message: templateContent,
                              subject: templateSubject,
                              customerEmails: editableEmails
                            })}
                            disabled={
                              sendApkReminderMutation.isPending ||
                              customersWithReservations.length === 0 ||
                              Object.keys(editableEmails).length === 0 ||
                              Object.values(editableEmails).some(email => !email || email.trim() === '')
                            }
                            data-testid="button-send-reminder"
                          >
                            {sendApkReminderMutation.isPending
                              ? t('details.maintenance.sendingButton')
                              : Object.keys(editableEmails).length === 0
                              ? t('details.maintenance.selectEmailsButton')
                              : t('details.maintenance.sendToButton', { count: Object.keys(editableEmails).length })}
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  </div>
                </div>
                
                <div className="border p-4 rounded-lg">
                  <h3 className="text-lg font-medium mb-2">{t('details.maintenance.warrantyTitle')}</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-gray-500">{t('details.maintenance.warrantyValidUntil')}</p>
                      <p className="text-lg font-medium">{vehicle.warrantyEndDate ? formatDate(vehicle.warrantyEndDate) : t('details.maintenance.notSet')}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">{t('details.maintenance.daysRemaining')}</p>
                      <div className="flex items-center">
                        <p className="text-lg font-medium mr-2">{daysUntilWarranty}</p>
                        {vehicle.warrantyEndDate && <Badge className={warrantyUrgencyClass}>{daysUntilWarranty <= 30 ? t('details.maintenance.expiringSoonBadge') : t('details.maintenance.activeBadge')}</Badge>}
                      </div>
                    </div>
                  </div>
                  <div className="mt-4">
                    <Button size="sm" variant="outline">
                      {t('details.maintenance.updateWarrantyButton')}
                    </Button>
                  </div>
                </div>

                {/* Service Due Alert Section */}
                {serviceDueInfo && (vehicle.lastServiceDate || vehicle.lastServiceMileage) && (
                  <div className={`border p-4 rounded-lg ${serviceDueInfo.isServiceDue ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'}`}>
                    <h3 className="text-lg font-medium mb-2 flex items-center gap-2">
                      <Calendar className="h-5 w-5" />
                      {t('details.maintenance.nextServiceDueTitle')}
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {serviceDueInfo.nextServiceByDate && (
                        <div>
                          <p className="text-sm text-gray-500">{t('details.maintenance.serviceDueByDateLabel')}</p>
                          <p className="text-lg font-medium">{formatDate(format(serviceDueInfo.nextServiceByDate, 'yyyy-MM-dd'))}</p>
                          <Badge className={serviceDueInfo.isDueByDate ? 'bg-red-600' : 'bg-green-600'}>
                            {serviceDueInfo.isDueByDate ? t('details.maintenance.overdueBadge') : t('details.maintenance.daysLabel', { count: serviceDueInfo.daysUntilService })}
                          </Badge>
                        </div>
                      )}
                      {serviceDueInfo.nextServiceByMileage && (
                        <div>
                          <p className="text-sm text-gray-500">{t('details.maintenance.serviceDueAtMileageLabel')}</p>
                          <p className="text-lg font-medium">{serviceDueInfo.nextServiceByMileage.toLocaleString()} km</p>
                          <Badge className={serviceDueInfo.isDueByMileage ? 'bg-red-600' : 'bg-green-600'}>
                            {serviceDueInfo.isDueByMileage ? t('details.maintenance.overdueBadge') : t('details.maintenance.kmRemainingLabel', { count: serviceDueInfo.kmUntilService })}
                          </Badge>
                        </div>
                      )}
                    </div>
                    <div className="mt-3 text-sm text-gray-600">
                      <p>{t('details.maintenance.lastServiceLabel', { date: vehicle.lastServiceDate ? formatDate(vehicle.lastServiceDate) : t('details.maintenance.notRecorded') })}</p>
                      {vehicle.lastServiceMileage && (
                        <p>{t('details.maintenance.lastServiceMileageLabel', { mileage: vehicle.lastServiceMileage.toLocaleString() })}</p>
                      )}
                      {vehicle.currentMileage && (
                        <p>{t('details.maintenance.currentMileageLabel', { mileage: vehicle.currentMileage.toLocaleString() })}</p>
                      )}
                    </div>
                  </div>
                )}

                {/* Scheduled Maintenance History Section */}
                <div className="border p-4 rounded-lg">
                  <h3 className="text-lg font-medium mb-4 flex items-center gap-2">
                    <Calendar className="h-5 w-5" />
                    {t('details.maintenance.scheduledMaintenanceHistoryTitle')}
                  </h3>
                  {maintenanceHistory.filter((m: any) => m.maintenanceCategory === 'scheduled_maintenance').length > 0 ? (
                    <>
                      <div className="space-y-3">
                        {maintenanceHistory
                          .filter((m: any) => m.maintenanceCategory === 'scheduled_maintenance')
                          .sort((a: any, b: any) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime())
                          .slice(0, showAllScheduledMaintenance ? undefined : 5)
                          .map((maintenance: any) => {
                            const maintenanceType = maintenance.notes?.split(':')[0] || t('details.maintenance.generalMaintenanceFallback');
                            const maintenanceDetails = maintenance.notes?.split('\n')?.[1] || '';
                            
                            return (
                              <div key={maintenance.id} className="border rounded-lg p-3 bg-blue-50">
                                <div className="flex justify-between items-start">
                                  <div className="flex-1">
                                    <div className="flex items-center gap-2">
                                      <h4 className="font-medium">{maintenanceType}</h4>
                                      {maintenance.maintenanceStatus && (
                                        <Badge variant={
                                          maintenance.maintenanceStatus === 'out' ? 'default' : 
                                          maintenance.maintenanceStatus === 'in' ? 'secondary' : 
                                          'outline'
                                        }>
                                          {maintenance.maintenanceStatus === 'out' ? t('details.maintenance.completedBadge') :
                                           maintenance.maintenanceStatus === 'in' ? t('details.maintenance.inProgressBadge') :
                                           t('details.maintenance.scheduledBadge')}
                                        </Badge>
                                      )}
                                    </div>
                                    <p className="text-sm text-gray-600 mt-1">{formatDate(maintenance.startDate)}</p>
                                    {maintenanceDetails && (
                                      <p className="text-sm mt-2 text-gray-700">{maintenanceDetails}</p>
                                    )}
                                    {maintenance.notes && !maintenanceDetails && (
                                      <p className="text-sm mt-2 text-gray-700">{maintenance.notes}</p>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                      </div>
                      {maintenanceHistory.filter((m: any) => m.maintenanceCategory === 'scheduled_maintenance').length > 5 && (
                        <Button
                          variant="ghost"
                          className="w-full mt-3"
                          onClick={() => setShowAllScheduledMaintenance(!showAllScheduledMaintenance)}
                        >
                          {showAllScheduledMaintenance ? (
                            <>
                              <ChevronDown className="h-4 w-4 mr-2" />
                              {t('details.maintenance.showLessButton')}
                            </>
                          ) : (
                            <>
                              <ChevronRight className="h-4 w-4 mr-2" />
                              {t('details.maintenance.showMoreButton', { count: maintenanceHistory.filter((m: any) => m.maintenanceCategory === 'scheduled_maintenance').length - 5 })}
                            </>
                          )}
                        </Button>
                      )}
                    </>
                  ) : (
                    <div className="text-center py-6 text-gray-500">
                      <Calendar className="h-12 w-12 mx-auto mb-2 text-gray-400" />
                      <p>{t('details.maintenance.noScheduledMaintenance')}</p>
                      <p className="text-sm">{t('details.maintenance.noScheduledMaintenanceHint')}</p>
                    </div>
                  )}
                </div>

                {/* Repair History Section */}
                <div className="border p-4 rounded-lg">
                  <h3 className="text-lg font-medium mb-4 flex items-center gap-2">
                    <Calendar className="h-5 w-5" />
                    {t('details.maintenance.repairHistoryTitle')}
                  </h3>
                  {maintenanceHistory.filter((m: any) => m.maintenanceCategory === 'repair').length > 0 ? (
                    <>
                      <div className="space-y-3">
                        {maintenanceHistory
                          .filter((m: any) => m.maintenanceCategory === 'repair')
                          .sort((a: any, b: any) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime())
                          .slice(0, showAllRepairs ? undefined : 5)
                          .map((maintenance: any) => {
                            const maintenanceType = maintenance.notes?.split(':')[0] || t('details.maintenance.repairFallback');
                            const maintenanceDetails = maintenance.notes?.split('\n')?.[1] || '';
                            
                            return (
                              <div key={maintenance.id} className="border rounded-lg p-3 bg-orange-50">
                                <div className="flex justify-between items-start">
                                  <div className="flex-1">
                                    <div className="flex items-center gap-2">
                                      <h4 className="font-medium">{maintenanceType}</h4>
                                      {maintenance.maintenanceStatus && (
                                        <Badge variant={
                                          maintenance.maintenanceStatus === 'out' ? 'default' : 
                                          maintenance.maintenanceStatus === 'in' ? 'secondary' : 
                                          'outline'
                                        }>
                                          {maintenance.maintenanceStatus === 'out' ? t('details.maintenance.completedBadge') :
                                           maintenance.maintenanceStatus === 'in' ? t('details.maintenance.inProgressBadge') :
                                           t('details.maintenance.scheduledBadge')}
                                        </Badge>
                                      )}
                                    </div>
                                    <p className="text-sm text-gray-600 mt-1">{formatDate(maintenance.startDate)}</p>
                                    {maintenanceDetails && (
                                      <p className="text-sm mt-2 text-gray-700">{maintenanceDetails}</p>
                                    )}
                                    {maintenance.notes && !maintenanceDetails && (
                                      <p className="text-sm mt-2 text-gray-700">{maintenance.notes}</p>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                      </div>
                      {maintenanceHistory.filter((m: any) => m.maintenanceCategory === 'repair').length > 5 && (
                        <Button
                          variant="ghost"
                          className="w-full mt-3"
                          onClick={() => setShowAllRepairs(!showAllRepairs)}
                        >
                          {showAllRepairs ? (
                            <>
                              <ChevronDown className="h-4 w-4 mr-2" />
                              {t('details.maintenance.showLessButton')}
                            </>
                          ) : (
                            <>
                              <ChevronRight className="h-4 w-4 mr-2" />
                              {t('details.maintenance.showMoreButton', { count: maintenanceHistory.filter((m: any) => m.maintenanceCategory === 'repair').length - 5 })}
                            </>
                          )}
                        </Button>
                      )}
                    </>
                  ) : (
                    <div className="text-center py-6 text-gray-500">
                      <Calendar className="h-12 w-12 mx-auto mb-2 text-gray-400" />
                      <p>{t('details.maintenance.noRepairHistory')}</p>
                      <p className="text-sm">{t('details.maintenance.noRepairHistoryHint')}</p>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* History Tab - User Activity Tracking */}
        <TabsContent value="history" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>{t('details.history.activityTitle')}</CardTitle>
              <CardDescription>{t('details.history.activityDescription')}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                <div className="border p-4 rounded-lg">
                  <h3 className="text-lg font-medium mb-2">{t('details.history.recordCreationTitle')}</h3>
                  <div className="grid grid-cols-1 gap-4">
                    <div className="flex items-center gap-2">
                      <div className="bg-blue-100 p-2 rounded-full">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-600">
                          <path d="M12 20h9"></path>
                          <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
                        </svg>
                      </div>
                      <div>
                        <p className="font-medium">{t('details.history.createdByTitle')}</p>
                        <p className="text-sm text-gray-500">
                          {t('details.history.createdByLabel', { name: vehicle.createdBy || t('details.history.unknownUser'), date: formatDate(vehicle.createdAt.toString()) })}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="border p-4 rounded-lg">
                  <h3 className="text-lg font-medium mb-2">{t('details.history.lastUpdateTitle')}</h3>
                  <div className="grid grid-cols-1 gap-4">
                    <div className="flex items-center gap-2">
                      <div className="bg-green-100 p-2 rounded-full">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-green-600">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                        </svg>
                      </div>
                      <div>
                        <p className="font-medium">{t('details.history.lastModifiedByTitle')}</p>
                        <p className="text-sm text-gray-500">
                          {t('details.history.lastModifiedByLabel', { name: vehicle.updatedBy || t('details.history.unknownUser'), date: formatDate(vehicle.updatedAt.toString()) })}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Registration Status Changes */}
                <div className="border p-4 rounded-lg">
                  <h3 className="text-lg font-medium mb-2">{t('details.history.registrationChangesTitle')}</h3>
                  <div className="grid grid-cols-1 gap-4">
                    {vehicle.registeredToDate && (
                      <div className="flex items-start gap-2">
                        <div className="bg-amber-100 p-2 rounded-full mt-1">
                          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-600">
                            <path d="M12 2a10 10 0 1 0 10 10H12V2z"></path>
                            <path d="M21.2 8A10 10 0 0 0 12 2v10h10a9.9 9.9 0 0 0-.8-4"></path>
                          </svg>
                        </div>
                        <div>
                          <p className="font-medium">{t('details.history.registrationStatusOpnaam')}</p>
                          <div className="text-sm text-gray-500">
                            <p>{t('details.history.changedOnLabel', { date: formatDate(vehicle.registeredToDate) })}</p>
                            <p>{t('details.history.byLabel', { name: vehicle.registeredToBy || t('details.history.adminFallback') })}</p>
                          </div>
                          <div className="mt-1 text-xs py-1 px-2 bg-gray-100 rounded-md inline-block">
                            {t('details.history.lastUpdatedLabel', { date: formatDate(vehicle.registeredToDate || vehicle.updatedAt.toString()) })}
                          </div>
                        </div>
                      </div>
                    )}

                    {vehicle.companyDate && (
                      <div className="flex items-start gap-2">
                        <div className="bg-amber-100 p-2 rounded-full mt-1">
                          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-600">
                            <path d="M12 2a10 10 0 1 0 10 10H12V2z"></path>
                            <path d="M21.2 8A10 10 0 0 0 12 2v10h10a9.9 9.9 0 0 0-.8-4"></path>
                          </svg>
                        </div>
                        <div>
                          <p className="font-medium">{t('details.history.registrationStatusBv')}</p>
                          <div className="text-sm text-gray-500">
                            <p>{t('details.history.changedOnLabel', { date: formatDate(vehicle.companyDate) })}</p>
                            <p>{t('details.history.byLabel', { name: vehicle.companyBy || t('details.history.adminFallback') })}</p>
                          </div>
                          <div className="mt-1 text-xs py-1 px-2 bg-gray-100 rounded-md inline-block">
                            {t('details.history.lastUpdatedLabel', { date: formatDate(vehicle.companyDate || vehicle.updatedAt.toString()) })}
                          </div>
                        </div>
                      </div>
                    )}

                    {!vehicle.registeredToDate && !vehicle.companyDate && (
                      <p className="text-gray-500">{t('details.history.noRegistrationChanges')}</p>
                    )}
                  </div>
                </div>

                {/* Related Documents Timeline */}
                <div className="border p-4 rounded-lg">
                  <h3 className="text-lg font-medium mb-2">{t('details.history.documentTimelineTitle')}</h3>
                  <div className="space-y-4">
                    {documents && documents.length > 0 ? (
                      documents.sort((a, b) => new Date(b.uploadDate).getTime() - new Date(a.uploadDate).getTime()).map(doc => (
                        <div key={doc.id} className="flex items-start gap-3 pb-4 border-b last:border-b-0">
                          <div className="bg-purple-100 p-2 rounded-full mt-1">
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-purple-600">
                              <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                              <polyline points="14 2 14 8 20 8" />
                            </svg>
                          </div>
                          <div className="flex-1">
                            <div className="flex justify-between items-center">
                              <h4 className="font-medium text-sm">{t('details.history.documentUploadedSuffix', { type: doc.documentType })}</h4>
                              <span className="text-xs text-gray-500">{formatDate(doc.uploadDate.toString())}</span>
                            </div>
                            <p className="text-sm">{doc.fileName}</p>
                            <p className="text-xs text-gray-500">
                              {doc.createdBy ? t('details.history.uploadedByLabel', { name: doc.createdBy }) : t('details.history.uploadedByUnknown')}
                            </p>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-gray-500">{t('details.history.noDocumentsUploaded')}</p>
                    )}
                  </div>
                </div>

                {/* Expenses Timeline */}
                <div className="border p-4 rounded-lg">
                  <h3 className="text-lg font-medium mb-2">{t('details.history.expensesTimelineTitle')}</h3>
                  <div className="space-y-4">
                    {expenses && expenses.length > 0 ? (
                      expenses.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map(expense => (
                        <div key={expense.id} className="flex items-start gap-3 pb-4 border-b last:border-b-0">
                          <div className="bg-red-100 p-2 rounded-full mt-1">
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-red-600">
                              <path d="M9 10V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v6"></path>
                              <rect x="1" y="12" width="6" height="8" rx="1"></rect>
                              <rect x="9" y="12" width="6" height="8" rx="1"></rect>
                              <rect x="17" y="12" width="6" height="8" rx="1"></rect>
                            </svg>
                          </div>
                          <div className="flex-1">
                            <div className="flex justify-between items-center">
                              <h4 className="font-medium text-sm">{t('details.history.expenseAddedSuffix', { category: expense.category })}</h4>
                              <span className="text-xs text-gray-500">{formatDate(expense.date)}</span>
                            </div>
                            <p className="text-sm">{<Price value={Number(expense.amount)} />}</p>
                            <p className="text-xs text-gray-500">
                              {expense.createdBy ? t('details.history.addedByLabel', { name: expense.createdBy }) : t('details.history.addedByUnknown')}
                            </p>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-gray-500">{t('details.history.noExpensesRecorded')}</p>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* View Reservation Dialog */}
      <Dialog open={viewReservationDialogOpen} onOpenChange={setViewReservationDialogOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>{t('details.viewReservationDialog.title')}</DialogTitle>
            <DialogDescription>
              {t('details.viewReservationDialog.description')}
            </DialogDescription>
          </DialogHeader>

          {selectedReservation && (
            <div className="space-y-6">
              {/* Reservation Info */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm font-medium text-gray-500">{t('details.viewReservationDialog.reservationIdLabel')}</Label>
                  <p className="text-sm font-medium">#{selectedReservation.id}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium text-gray-500">{t('details.viewReservationDialog.statusLabel')}</Label>
                  <div className="mt-1">
                    <StatusBadge status={selectedReservation.status} />
                  </div>
                </div>
              </div>

              {/* Customer Info */}
              <div>
                <Label className="text-sm font-medium text-gray-500">{t('details.viewReservationDialog.customerLabel')}</Label>
                <p className="text-sm font-medium">
                  {selectedReservation.customer?.name || t('details.viewReservationDialog.unknownCustomer')}
                </p>
                {selectedReservation.customer?.email && (
                  <p className="text-xs text-gray-500">{selectedReservation.customer.email}</p>
                )}
              </div>

              {/* Date Range */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm font-medium text-gray-500">{t('details.viewReservationDialog.startDateLabel')}</Label>
                  <p className="text-sm font-medium">{formatDate(selectedReservation.startDate)}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium text-gray-500">{t('details.viewReservationDialog.endDateLabel')}</Label>
                  <p className="text-sm font-medium">
                    {selectedReservation.endDate && selectedReservation.endDate !== "undefined"
                      ? formatDate(selectedReservation.endDate)
                      : t('details.viewReservationDialog.openEnded')
                    }
                  </p>
                </div>
              </div>

              {/* Price */}
              <div>
                <Label className="text-sm font-medium text-gray-500">{t('details.viewReservationDialog.totalPriceLabel')}</Label>
                <p className="text-lg font-semibold text-green-600">
                  {<Price value={selectedReservation.totalPrice} />}
                </p>
              </div>

              {/* Notes */}
              {selectedReservation.notes && (
                <div>
                  <Label className="text-sm font-medium text-gray-500">{t('details.viewReservationDialog.notesLabel')}</Label>
                  <p className="text-sm mt-1 p-2 bg-gray-50 rounded border">
                    {selectedReservation.notes}
                  </p>
                </div>
              )}

              {/* Reservation Type */}
              <div>
                <Label className="text-sm font-medium text-gray-500">{t('details.viewReservationDialog.typeLabel')}</Label>
                <p className="text-sm font-medium capitalize">
                  {selectedReservation.type === 'maintenance_block' ? t('details.viewReservationDialog.typeMaintenance') :
                   selectedReservation.type === 'replacement' ? t('details.viewReservationDialog.typeReplacement') :
                   t('details.viewReservationDialog.typeStandard')}
                </p>
              </div>

              {/* Creation Info */}
              <div className="text-xs text-gray-500 border-t pt-4">
                <p>{t('details.viewReservationDialog.createdByLine', { name: selectedReservation.createdBy || t('details.viewReservationDialog.unknown'), date: formatDate(selectedReservation.createdAt.toString()) })}</p>
                {selectedReservation.updatedBy && (
                  <p>{t('details.viewReservationDialog.updatedByLine', { name: selectedReservation.updatedBy, date: formatDate(selectedReservation.updatedAt.toString()) })}</p>
                )}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setViewReservationDialogOpen(false)}
            >
              {t('common:actions.close')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Reservation Dialog */}
      <ReservationEditDialog
        open={editReservationDialogOpen}
        onOpenChange={setEditReservationDialogOpen}
        reservationId={editReservationId}
        onSuccess={(reservation) => {
          toast({
            title: t('details.toasts.reservationUpdatedTitle'),
            description: t('details.toasts.reservationUpdatedDescription')
          });
          // Refresh vehicle data and related queries
          invalidateRelatedQueries('vehicles');
          invalidateByPrefix('/api/reservations');
          invalidateByPrefix(`/api/vehicles/${vehicleId}/reservations`);
          setEditReservationDialogOpen(false);
          setEditReservationId(null);
        }}
      />

      {/* APK Inspection Scheduling Dialog */}
      {vehicle && (
        <ApkInspectionDialog
          open={isApkInspectionOpen}
          onOpenChange={setIsApkInspectionOpen}
          vehicle={vehicle}
          onSuccess={() => {
            invalidateRelatedQueries('vehicles');
            invalidateByPrefix('/api/reservations');
            invalidateByPrefix('/api/vehicles/apk-expiring');
          }}
        />
      )}
      
      {/* Interactive Damage Check Dialog */}
      <Dialog open={interactiveDamageCheckDialogOpen} onOpenChange={setInteractiveDamageCheckDialogOpen}>
        <DialogContent className="max-w-[95vw] max-h-[95vh] w-[95vw] h-[95vh] p-0 overflow-hidden">
          <DialogTitle className="sr-only">{t('details.documents.interactiveDamageChecksTitle')}</DialogTitle>
          <div className="h-full overflow-auto">
            <InteractiveDamageCheck 
              onClose={() => {
                setInteractiveDamageCheckDialogOpen(false);
                // Refresh damage checks when dialog closes
                invalidateByPrefix(`/api/interactive-damage-checks/vehicle/${vehicleId}`);
              }} 
              editingCheckId={editingCheckId}
              initialVehicleId={vehicleId}
            />
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Damage Check Confirmation Dialog */}
      <ConfirmDialog
        open={deleteDamageCheckDialogOpen}
        onOpenChange={setDeleteDamageCheckDialogOpen}
        title={t('details.deleteDamageCheckDialog.title')}
        description={damageCheckToDelete ? t('details.deleteDamageCheckDialog.descriptionWithCheck', { type: damageCheckToDelete.checkType, date: new Date(damageCheckToDelete.checkDate).toLocaleDateString() }) : t('details.deleteDamageCheckDialog.descriptionFallback')}
        variant="danger"
        confirmLabel={t('common:actions.delete')}
        onConfirm={async () => {
          if (damageCheckToDelete) {
            try {
              const response = await fetch(`/api/interactive-damage-checks/${damageCheckToDelete.id}`, {
                method: 'DELETE',
                credentials: 'include',
              });

              if (!response.ok) {
                throw new Error('Failed to delete damage check');
              }

              invalidateByPrefix(`/api/interactive-damage-checks/vehicle/${vehicleId}`);
              invalidateByPrefix(`/api/vehicles/${vehicleId}`);
              // Active refetch so the vehicle log updates immediately, and
              // also nudge any reservation-detail page that may be open with
              // this check's reservationId visible.
              queryClient.invalidateQueries({ queryKey: [`/api/interactive-damage-checks/vehicle/${vehicleId}`], refetchType: 'active' });
              if (damageCheckToDelete?.reservationId) {
                queryClient.invalidateQueries({ queryKey: [`/api/interactive-damage-checks/reservation/${damageCheckToDelete.reservationId}`], refetchType: 'active' });
              }

              toast({
                title: t('details.deleteDamageCheckDialog.toasts.deletedTitle'),
                description: t('details.deleteDamageCheckDialog.toasts.deletedDescription')
              });
            } catch (error) {
              console.error('Error deleting damage check:', error);
              toast({
                title: t('details.deleteDamageCheckDialog.toasts.errorTitle'),
                description: t('details.deleteDamageCheckDialog.toasts.failedDescription'),
                variant: "destructive"
              });
            }
          }
          setDamageCheckToDelete(null);
        }}
        onCancel={() => setDamageCheckToDelete(null)}
      />

      {/* Delete Document Confirmation Dialog */}
      <ConfirmDialog
        open={deleteDocumentDialogOpen}
        onOpenChange={setDeleteDocumentDialogOpen}
        title={t('details.deleteDocumentDialog.title')}
        description={documentToDelete ? t('details.deleteDocumentDialog.descriptionWithFile', { fileName: documentToDelete.fileName }) : t('details.deleteDocumentDialog.descriptionFallback')}
        variant="danger"
        confirmLabel={t('common:actions.delete')}
        onConfirm={async () => {
          if (documentToDelete) {
            try {
              const response = await fetch(`/api/documents/${documentToDelete.id}`, {
                method: 'DELETE',
              });

              if (response.ok) {
                invalidateByPrefix(`/api/documents/vehicle/${vehicleId}`);
                invalidateByPrefix(`/api/vehicles/${vehicleId}`);
                toast({
                  title: t('details.deleteDocumentDialog.toasts.deletedTitle'),
                  description: t('details.deleteDocumentDialog.toasts.deletedDescription'),
                });
              } else {
                const errorData = await response.json();
                throw new Error(errorData.message || "Failed to delete document");
              }
            } catch (error) {
              console.error("Error deleting document:", error);
              toast({
                title: t('details.deleteDocumentDialog.toasts.errorTitle'),
                description: error instanceof Error ? error.message : t('details.deleteDocumentDialog.toasts.failedFallback'),
                variant: "destructive",
              });
            }
          }
          setDocumentToDelete(null);
        }}
        onCancel={() => setDocumentToDelete(null)}
      />

      {vehicle && (
        <VehicleBarcodeDialog vehicle={vehicle} open={barcodeDialogOpen} onOpenChange={setBarcodeDialogOpen} />
      )}
    </div>
  );
}

// Helper components
function StatusBadge({ status }: { status: string }) {
  const { t } = useTranslation("reservations");
  switch (status.toLowerCase()) {
    case "booked":
      return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-200">{t('form.statuses.booked')}</Badge>;
    case "picked_up":
      return <Badge className="bg-orange-100 text-orange-800 hover:bg-orange-200">{t('form.statuses.pickedUp')}</Badge>;
    case "returned":
      return <Badge className="bg-purple-100 text-purple-800 hover:bg-purple-200">{t('form.statuses.returned')}</Badge>;
    case "completed":
      return <Badge className="bg-green-100 text-green-800 hover:bg-green-200">{t('form.statuses.completed')}</Badge>;
    case "cancelled":
      return <Badge className="bg-red-100 text-red-800 hover:bg-red-200">{t('form.statuses.cancelled')}</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

function DocumentIcon({ type }: { type: string }) {
  if (type.startsWith('image/')) {
    return (
      <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-image text-gray-600">
        <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
        <circle cx="9" cy="9" r="2" />
        <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
      </svg>
    );
  } else if (type === 'application/pdf') {
    return (
      <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-file-text text-gray-600">
        <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" x2="8" y1="13" y2="13" />
        <line x1="16" x2="8" y1="17" y2="17" />
        <line x1="10" x2="8" y1="9" y2="9" />
      </svg>
    );
  } else {
    return (
      <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-file text-gray-600">
        <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
        <polyline points="14 2 14 8 20 8" />
      </svg>
    );
  }
}

function AvailabilityToggleDialog({ 
  vehicle, 
  onSuccess 
}: { 
  vehicle: Vehicle;
  onSuccess: () => void;
}) {
  const { t } = useTranslation("vehicles");
  const [open, setOpen] = useState(false);
  const [availabilityStatus, setAvailabilityStatus] = useState(vehicle.availabilityStatus || 'available');
  const [showRentedWarning, setShowRentedWarning] = useState(false);
  const { toast } = useToast();
  
  // Query reservations for this vehicle to check for active rentals
  const { data: vehicleReservations } = useQuery<Reservation[]>({
    queryKey: [`/api/reservations/vehicle/${vehicle.id}`],
    enabled: open, // Only fetch when dialog is open
  });
  
  // Find active reservations
  const activePickedUpReservation = vehicleReservations?.find(
    (res) => res.status === 'picked_up'
  );
  const activeBookedReservation = vehicleReservations?.find(
    (res) => res.status === 'booked'
  );
  
  const updateAvailabilityMutation = useMutation({
    mutationFn: async (availabilityStatus: string) => {
      return await apiRequest("PATCH", `/api/vehicles/${vehicle.id}`, {
        availabilityStatus
      });
    },
    onSuccess: () => {
      const statusLabels: Record<string, string> = {
        'available': t('details.availabilityDialog.available'),
        'needs_fixing': t('details.availabilityDialog.needsFixing'),
        'not_for_rental': t('details.availabilityDialog.notForRental'),
        'rented': t('details.availabilityDialog.rented')
      };
      toast({
        title: t('details.availabilityDialog.toasts.successTitle'),
        description: t('details.availabilityDialog.toasts.successDescription', { status: statusLabels[availabilityStatus] })
      });
      onSuccess();
      setOpen(false);
      setShowRentedWarning(false);
    },
    onError: (error: any) => {
      toast({
        title: t('details.availabilityDialog.toasts.errorTitle'),
        description: error.message || t('details.availabilityDialog.toasts.errorDescription'),
        variant: "destructive"
      });
    }
  });

  const handleStatusChange = (newStatus: string) => {
    setAvailabilityStatus(newStatus);
    // Reset warning when changing to non-rented status
    if (newStatus !== 'rented') {
      setShowRentedWarning(false);
    }
  };

  const handleSave = () => {
    // Safety check for "rented" status
    if (availabilityStatus === 'rented') {
      // Check if there's an active picked_up reservation
      if (!activePickedUpReservation) {
        // No active rental - show warning
        setShowRentedWarning(true);
        return;
      }
      
      // Check if the picked_up reservation has required data
      const hasContractNumber = !!activePickedUpReservation.contractNumber;
      const hasPickupMileage = activePickedUpReservation.pickupMileage !== null && activePickedUpReservation.pickupMileage !== undefined;
      
      if (!hasContractNumber || !hasPickupMileage) {
        setShowRentedWarning(true);
        return;
      }
    }
    
    // All checks passed
    updateAvailabilityMutation.mutate(availabilityStatus);
  };
  
  const handleForceChange = () => {
    // User confirmed they want to force the change
    updateAvailabilityMutation.mutate(availabilityStatus);
  };

  // Get warning details
  const getWarningDetails = () => {
    if (availabilityStatus !== 'rented') return null;
    
    if (!activePickedUpReservation && !activeBookedReservation) {
      return {
        type: 'error' as const,
        title: t('details.availabilityDialog.warnings.noActiveReservationTitle'),
        message: t('details.availabilityDialog.warnings.noActiveReservationMessage'),
        suggestion: t('details.availabilityDialog.warnings.noActiveReservationSuggestion'),
        canForce: false,
      };
    }

    if (!activePickedUpReservation && activeBookedReservation) {
      return {
        type: 'warning' as const,
        title: t('details.availabilityDialog.warnings.notPickedUpTitle'),
        message: t('details.availabilityDialog.warnings.notPickedUpMessage'),
        suggestion: t('details.availabilityDialog.warnings.notPickedUpSuggestion'),
        canForce: false,
      };
    }

    if (activePickedUpReservation) {
      const missingItems = [];
      if (!activePickedUpReservation.contractNumber) missingItems.push(t('details.availabilityDialog.warnings.contractNumberLabel'));
      if (activePickedUpReservation.pickupMileage === null || activePickedUpReservation.pickupMileage === undefined) missingItems.push(t('details.availabilityDialog.warnings.pickupMileageLabel'));

      if (missingItems.length > 0) {
        return {
          type: 'warning' as const,
          title: t('details.availabilityDialog.warnings.missingInfoTitle'),
          message: t('details.availabilityDialog.warnings.missingInfoMessage', { items: missingItems.join(', ') }),
          suggestion: t('details.availabilityDialog.warnings.missingInfoSuggestion'),
          canForce: true,
        };
      }
    }
    
    return null;
  };
  
  const warningDetails = showRentedWarning ? getWarningDetails() : null;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      setOpen(isOpen);
      if (!isOpen) {
        setShowRentedWarning(false);
        setAvailabilityStatus(vehicle.availabilityStatus || 'available');
      }
    }}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          data-testid="button-change-availability"
        >
          <Edit className="h-4 w-4 mr-2" />
          {t('details.availabilityDialog.changeButton')}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('details.availabilityDialog.title')}</DialogTitle>
          <DialogDescription>
            {t('details.availabilityDialog.description')}
          </DialogDescription>
        </DialogHeader>

        <div className="py-6">
          <div className="space-y-4">
            <Label className="text-base font-semibold">{t('details.availabilityDialog.statusLabel')}</Label>
            <Select value={availabilityStatus} onValueChange={handleStatusChange}>
              <SelectTrigger data-testid="select-dialog-availability">
                <SelectValue placeholder={t('details.availabilityDialog.selectPlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="available">{t('details.availabilityDialog.available')}</SelectItem>
                <SelectItem value="needs_fixing">{t('details.availabilityDialog.needsFixing')}</SelectItem>
                <SelectItem value="not_for_rental">{t('details.availabilityDialog.notForRental')}</SelectItem>
                <SelectItem value="rented">{t('details.availabilityDialog.rented')}</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground">
              {t('details.availabilityDialog.hint')}
            </p>
            
            {/* Warning message for rented status */}
            {warningDetails && (
              <div className={`rounded-lg p-4 ${warningDetails.type === 'error' ? 'bg-red-50 border border-red-200' : 'bg-yellow-50 border border-yellow-200'}`}>
                <div className="flex items-start gap-3">
                  <AlertTriangle className={`h-5 w-5 mt-0.5 ${warningDetails.type === 'error' ? 'text-red-600' : 'text-yellow-600'}`} />
                  <div className="flex-1">
                    <h4 className={`font-semibold ${warningDetails.type === 'error' ? 'text-red-800' : 'text-yellow-800'}`}>
                      {warningDetails.title}
                    </h4>
                    <p className={`text-sm mt-1 ${warningDetails.type === 'error' ? 'text-red-700' : 'text-yellow-700'}`}>
                      {warningDetails.message}
                    </p>
                    <p className={`text-sm mt-2 font-medium ${warningDetails.type === 'error' ? 'text-red-800' : 'text-yellow-800'}`}>
                      {warningDetails.suggestion}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              setOpen(false);
              setShowRentedWarning(false);
            }}
            disabled={updateAvailabilityMutation.isPending}
          >
            {t('common:actions.cancel')}
          </Button>

          {warningDetails?.canForce && (
            <Button
              variant="destructive"
              onClick={handleForceChange}
              disabled={updateAvailabilityMutation.isPending}
              data-testid="button-force-availability"
            >
              {updateAvailabilityMutation.isPending ? t('details.availabilityDialog.savingButton') : t('details.availabilityDialog.forceChangeButton')}
            </Button>
          )}

          {!warningDetails && (
            <Button
              onClick={handleSave}
              disabled={updateAvailabilityMutation.isPending}
              data-testid="button-save-availability"
            >
              {updateAvailabilityMutation.isPending ? t('details.availabilityDialog.savingButton') : t('details.availabilityDialog.saveChangesButton')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
