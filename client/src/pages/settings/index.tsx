import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, invalidateByPrefix } from "@/lib/queryClient";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
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
 Mail,
  Settings as SettingsIcon,
  Key,
  Server,
  Edit,
  Plus,
  Building2,
  Bell,
  FileText,
  FileCheck,
  Calendar as CalendarIcon,
  DollarSign,
  Clock,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { calculateDutchHolidays } from "@shared/holidays";

interface EmailSetting {
  id: number;
  key: string;
  value: {
    fromEmail?: string;
    fromName?: string;
    apiKey?: string;
    smtpHost?: string;
    smtpPort?: string;
    smtpUser?: string;
    smtpPassword?: string;
    provider?: string;
    purpose?: 'apk' | 'maintenance' | 'gps' | 'documents' | 'custom' | 'default';
  };
  category: string;
  description?: string;
}

interface AppSetting {
  id: number;
  key: string;
  value: any;
  category: string;
  description?: string;
}

const EMAIL_PURPOSES = [
  { value: 'apk', label: 'APK Reminders', description: 'For sending APK inspection reminders' },
  { value: 'maintenance', label: 'Maintenance Alerts', description: 'For maintenance notifications' },
  { value: 'gps', label: 'GPS/IEI Information', description: 'For sending GPS and IEI numbers' },
  { value: 'documents', label: 'Documents Email', description: 'For sending contracts and damage checks to customers' },
  { value: 'custom', label: 'Custom Messages', description: 'For custom email communications' },
  { value: 'default', label: 'Default/General', description: 'Default email for all other purposes' },
] as const;

export default function Settings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("business");
  const [isEmailDialogOpen, setIsEmailDialogOpen] = useState(false);
  const [editingEmail, setEditingEmail] = useState<EmailSetting | null>(null);
  const [deleteEmailDialogOpen, setDeleteEmailDialogOpen] = useState(false);
  const [emailConfigToDelete, setEmailConfigToDelete] = useState<number | null>(null);
  
  // Email form state
  const [fromEmail, setFromEmail] = useState("");
  const [fromName, setFromName] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [smtpHost, setSmtpHost] = useState("");
  const [smtpPort, setSmtpPort] = useState("");
  const [smtpUser, setSmtpUser] = useState("");
  const [smtpPassword, setSmtpPassword] = useState("");
  const [provider, setProvider] = useState("mailersend");
  const [purpose, setPurpose] = useState<'apk' | 'maintenance' | 'gps' | 'documents' | 'custom' | 'default'>('default');
  
  // GPS settings state
  const [gpsRecipientEmail, setGpsRecipientEmail] = useState("");
  const [gpsActivationSubject, setGpsActivationSubject] = useState("");
  const [gpsActivationMessage, setGpsActivationMessage] = useState("");
  const [gpsSwapSubject, setGpsSwapSubject] = useState("");
  const [gpsSwapMessage, setGpsSwapMessage] = useState("");
  
  // Business Rules state
  const [defaultRentalDuration, setDefaultRentalDuration] = useState("7");
  const [defaultFuelPolicy, setDefaultFuelPolicy] = useState("full-to-full");
  const [eigenrisicoBinnenland, setEigenrisicoBinnenland] = useState("500");
  const [eigenrisicoBuitenland, setEigenrisicoBuitenland] = useState("1000");
  const [tollRatePerKm, setTollRatePerKm] = useState("0.15");
  
  // Notification Preferences state
  const [apkReminderDays, setApkReminderDays] = useState("60");
  const [warrantyReminderDays, setWarrantyReminderDays] = useState("30");
  const [maintenanceReminderDays, setMaintenanceReminderDays] = useState("7");
  const [emailNotificationsEnabled, setEmailNotificationsEnabled] = useState(true);
  const [realtimeSoundEnabled, setRealtimeSoundEnabled] = useState(false);
  const [notifyOnNewReservation, setNotifyOnNewReservation] = useState(true);
  const [notifyOnVehicleReturn, setNotifyOnVehicleReturn] = useState(true);
  const [notifyOnMaintenanceDue, setNotifyOnMaintenanceDue] = useState(true);
  
  // Document Settings state
  const [invoiceNumberFormat, setInvoiceNumberFormat] = useState("INV-{YEAR}-{NUMBER}");
  const [invoiceStartingNumber, setInvoiceStartingNumber] = useState("1001");
  const [contractTerms, setContractTerms] = useState("");
  const [invoiceFooter, setInvoiceFooter] = useState("");
  
  // Calendar Settings state  
  const [holidays, setHolidays] = useState<Array<{date: string, name: string}>>([]);
  const [newHolidayDate, setNewHolidayDate] = useState("");
  
  const [newHolidayName, setNewHolidayName] = useState("");
  
  // Dutch holidays with auto-calculation support
  // New format: { enabled, date (current), isOverridden, calculatedDate }
  const currentYear = new Date().getFullYear();
  
  // Initialize with calculated defaults so UI is never empty
  const getInitialDutchHolidays = () => {
    const calculated = calculateDutchHolidays(currentYear);
    const result: Record<string, { enabled: boolean; date: string; isOverridden: boolean; calculatedDate: string }> = {};
    for (const [key, date] of Object.entries(calculated)) {
      result[key] = { enabled: true, date, isOverridden: false, calculatedDate: date };
    }
    return result;
  };
  
  const [dutchHolidays, setDutchHolidays] = useState<Record<string, { 
    enabled: boolean; 
    date: string; 
    isOverridden?: boolean; 
    calculatedDate?: string 
  }>>(getInitialDutchHolidays);
  
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
  const [blockedDates, setBlockedDates] = useState<Array<{startDate: string, endDate: string, reason: string}>>([]);
  const [newBlockedStart, setNewBlockedStart] = useState("");
  const [newBlockedEnd, setNewBlockedEnd] = useState("");
  const [newBlockedReason, setNewBlockedReason] = useState("");
  const [defaultMaintenanceDuration, setDefaultMaintenanceDuration] = useState("1");
  const [reservationReminderHours, setReservationReminderHours] = useState("24");
  
  // Maintenance Calendar Settings state
  const [maintenanceExcludedStatuses, setMaintenanceExcludedStatuses] = useState<string[]>(["not_for_rental"]);
  const [showApkReminders, setShowApkReminders] = useState(true);
  const [showWarrantyReminders, setShowWarrantyReminders] = useState(true);
  const [showMaintenanceBlocks, setShowMaintenanceBlocks] = useState(true);
  const [apkReminderThresholdDays, setApkReminderThresholdDays] = useState("30");
  const [warrantyReminderThresholdDays, setWarrantyReminderThresholdDays] = useState("30");

  // Document Email Templates state
  const [docEmailTemplates, setDocEmailTemplates] = useState({
    contract: {
      en: {
        subject: "Your Rental Contract - {vehiclePlate}",
        message: "Dear {customerName},\n\nPlease find attached your rental agreement for {vehiclePlate}.\n\nRental Period: {startDate} to {endDate}\n\nPlease review and keep this document for your records.\n\nBest regards,\nCar Rental Team"
      },
      nl: {
        subject: "Uw Huurcontract - {vehiclePlate}",
        message: "Beste {customerName},\n\nBijgevoegd vindt u uw huurovereenkomst voor {vehiclePlate}.\n\nHuurperiode: {startDate} tot {endDate}\n\nGelieve dit document te bewaren voor uw administratie.\n\nMet vriendelijke groet,\nAutoverhuur Team"
      }
    },
    damage_check: {
      en: {
        subject: "Vehicle Inspection Report - {vehiclePlate}",
        message: "Dear {customerName},\n\nPlease find attached the vehicle inspection report for {vehiclePlate}.\n\nRental Period: {startDate} to {endDate}\n\nPlease review the document carefully and contact us if you have any questions.\n\nBest regards,\nCar Rental Team"
      },
      nl: {
        subject: "Schade Inspectierapport - {vehiclePlate}",
        message: "Beste {customerName},\n\nBijgevoegd vindt u het schade inspectierapport voor {vehiclePlate}.\n\nHuurperiode: {startDate} tot {endDate}\n\nGelieve het document zorgvuldig door te nemen en contact op te nemen bij vragen.\n\nMet vriendelijke groet,\nAutoverhuur Team"
      }
    },
    combined: {
      en: {
        subject: "Rental Documents - {vehiclePlate}",
        message: "Dear {customerName},\n\nPlease find attached your rental documents for {vehiclePlate}:\n- Rental Contract\n- Vehicle Inspection Report\n\nRental Period: {startDate} to {endDate}\n\nPlease review all documents carefully and keep them for your records.\n\nBest regards,\nCar Rental Team"
      },
      nl: {
        subject: "Huurdocumenten - {vehiclePlate}",
        message: "Beste {customerName},\n\nBijgevoegd vindt u uw huurdocumenten voor {vehiclePlate}:\n- Huurovereenkomst\n- Schade Inspectierapport\n\nHuurperiode: {startDate} tot {endDate}\n\nGelieve alle documenten zorgvuldig door te nemen en te bewaren voor uw administratie.\n\nMet vriendelijke groet,\nAutoverhuur Team"
      }
    }
  });

  // Fetch all app settings
  const { data: appSettings, isLoading: loadingSettings } = useQuery<AppSetting[]>({
    queryKey: ['/api/app-settings'],
  });
  
  // Fetch email settings
  const { data: emailSettings, isLoading: loadingEmail } = useQuery<EmailSetting[]>({
    queryKey: ['/api/app-settings/email'],
  });
  
  // Fetch system settings (for maintenance calendar display settings)
  const { data: systemSettings } = useQuery<{
    maintenanceExcludedStatuses?: string[];
    showApkReminders?: boolean;
    showWarrantyReminders?: boolean;
    showMaintenanceBlocks?: boolean;
    apkReminderDays?: number;
    warrantyReminderDays?: number;
    tollRatePerKm?: string;
  }>({
    queryKey: ['/api/system-settings'],
  });
  
  // Load maintenance calendar settings when they arrive
  useEffect(() => {
    if (!systemSettings) return;
    if (systemSettings.maintenanceExcludedStatuses) {
      setMaintenanceExcludedStatuses(systemSettings.maintenanceExcludedStatuses);
    }
    if (typeof systemSettings.showApkReminders === 'boolean') {
      setShowApkReminders(systemSettings.showApkReminders);
    }
    if (typeof systemSettings.showWarrantyReminders === 'boolean') {
      setShowWarrantyReminders(systemSettings.showWarrantyReminders);
    }
    if (typeof systemSettings.showMaintenanceBlocks === 'boolean') {
      setShowMaintenanceBlocks(systemSettings.showMaintenanceBlocks);
    }
    if (systemSettings.apkReminderDays) {
      setApkReminderThresholdDays(String(systemSettings.apkReminderDays));
    }
    if (systemSettings.warrantyReminderDays) {
      setWarrantyReminderThresholdDays(String(systemSettings.warrantyReminderDays));
    }
    if (systemSettings.tollRatePerKm) {
      setTollRatePerKm(String(systemSettings.tollRatePerKm));
    }
  }, [systemSettings]);

  // Load settings into state when data arrives
  useEffect(() => {
    if (!appSettings) return;
    
    // Business Rules
    const businessRules = appSettings.find(s => s.key === 'business_rules');
    if (businessRules?.value) {
      setDefaultRentalDuration(businessRules.value.defaultRentalDuration || "7");
      setDefaultFuelPolicy(businessRules.value.defaultFuelPolicy || "full-to-full");
      setEigenrisicoBinnenland(businessRules.value.eigenrisicoBinnenland || "500");
      setEigenrisicoBuitenland(businessRules.value.eigenrisicoBuitenland || "1000");
    }
    
    // Notification Preferences
    const notifPrefs = appSettings.find(s => s.key === 'notification_preferences');
    if (notifPrefs?.value) {
      setApkReminderDays(notifPrefs.value.apkReminderDays || "60");
      setWarrantyReminderDays(notifPrefs.value.warrantyReminderDays || "30");
      setMaintenanceReminderDays(notifPrefs.value.maintenanceReminderDays || "7");
      setEmailNotificationsEnabled(notifPrefs.value.emailNotificationsEnabled ?? true);
      setRealtimeSoundEnabled(notifPrefs.value.realtimeSoundEnabled ?? false);
      setNotifyOnNewReservation(notifPrefs.value.notifyOnNewReservation ?? true);
      setNotifyOnVehicleReturn(notifPrefs.value.notifyOnVehicleReturn ?? true);
      setNotifyOnMaintenanceDue(notifPrefs.value.notifyOnMaintenanceDue ?? true);
    }
    
    // Document Settings
    const docSettings = appSettings.find(s => s.key === 'document_settings');
    if (docSettings?.value) {
      setInvoiceNumberFormat(docSettings.value.invoiceNumberFormat || "INV-{YEAR}-{NUMBER}");
      setInvoiceStartingNumber(docSettings.value.invoiceStartingNumber || "1001");
      setContractTerms(docSettings.value.contractTerms || "");
      setInvoiceFooter(docSettings.value.invoiceFooter || "");
    }
    
    // Calendar Settings
    const calSettings = appSettings.find(s => s.key === 'calendar_settings');
    if (calSettings?.value) {
      setHolidays(calSettings.value.holidays || []);
      setBlockedDates(calSettings.value.blockedDates || []);
      setDefaultMaintenanceDuration(calSettings.value.defaultMaintenanceDuration || "1");
      setReservationReminderHours(calSettings.value.reservationReminderHours || "24");
      if (calSettings.value.dutchHolidays) {
        // API now returns auto-calculated holidays with format:
        // { enabled, date, isOverridden, calculatedDate }
        // Merge with initial defaults to ensure all holidays have dates
        const initialDefaults = getInitialDutchHolidays();
        const merged: Record<string, { enabled: boolean; date: string; isOverridden?: boolean; calculatedDate?: string }> = {};
        for (const key of Object.keys(initialDefaults)) {
          const apiValue = calSettings.value.dutchHolidays[key];
          const defaultValue = initialDefaults[key];
          merged[key] = {
            ...defaultValue,
            ...apiValue,
            // Ensure date always has a value
            date: apiValue?.date || defaultValue.date,
          };
        }
        setDutchHolidays(merged);
      }
    }
    
    // GPS Settings
    const gpsRecipient = appSettings.find(s => s.key === 'gps_recipient');
    if (gpsRecipient?.value?.email) {
      setGpsRecipientEmail(gpsRecipient.value.email);
    }
    
    const gpsTemplates = appSettings.find(s => s.key === 'gps_email_templates');
    if (gpsTemplates?.value) {
      setGpsActivationSubject(gpsTemplates.value.activationSubject || "");
      setGpsActivationMessage(gpsTemplates.value.activationMessage || "");
      setGpsSwapSubject(gpsTemplates.value.swapSubject || "");
      setGpsSwapMessage(gpsTemplates.value.swapMessage || "");
    }
    
    // Document Email Templates
    const docTemplates = appSettings.find(s => s.key === 'document_email_templates');
    if (docTemplates?.value) {
      setDocEmailTemplates(docTemplates.value);
    }
  }, [appSettings]);

  // Save settings mutations
  const saveBusinessRules = useMutation({
    mutationFn: async () => {
      const data = {
        key: 'business_rules',
        category: 'business',
        value: {
          defaultRentalDuration,
          defaultFuelPolicy,
          eigenrisicoBinnenland,
          eigenrisicoBuitenland,
        }
      };
      await apiRequest('POST', '/api/app-settings', data);
    },
    onSuccess: () => {
      invalidateByPrefix('/api/app-settings');
      toast({ title: "Success", description: "Business rules saved successfully" });
    },
  });

  const saveNotificationPrefs = useMutation({
    mutationFn: async () => {
      const data = {
        key: 'notification_preferences',
        category: 'notifications',
        value: {
          apkReminderDays,
          warrantyReminderDays,
          maintenanceReminderDays,
          emailNotificationsEnabled,
          realtimeSoundEnabled,
          notifyOnNewReservation,
          notifyOnVehicleReturn,
          notifyOnMaintenanceDue,
        }
      };
      await apiRequest('POST', '/api/app-settings', data);
    },
    onSuccess: () => {
      invalidateByPrefix('/api/app-settings');
      toast({ title: "Success", description: "Notification preferences saved successfully" });
    },
  });

  const saveDocumentSettings = useMutation({
    mutationFn: async () => {
      const data = {
        key: 'document_settings',
        category: 'documents',
        value: {
          invoiceNumberFormat,
          invoiceStartingNumber,
          contractTerms,
          invoiceFooter,
        }
      };
      await apiRequest('POST', '/api/app-settings', data);
    },
    onSuccess: () => {
      invalidateByPrefix('/api/app-settings');
      toast({ title: "Success", description: "Document settings saved successfully" });
    },
  });

  const saveCalendarSettings = useMutation({
    mutationFn: async () => {
      // Only store overrides, not calculated dates
      // Format: { [key]: { enabled, overrideDate? } }
      const dutchHolidaysToSave: Record<string, { enabled: boolean; overrideDate?: string }> = {};
      for (const [key, value] of Object.entries(dutchHolidays)) {
        dutchHolidaysToSave[key] = {
          enabled: value.enabled,
          // Only save overrideDate if user has manually changed the date
          overrideDate: value.isOverridden ? value.date : undefined
        };
      }
      
      const data = {
        key: 'calendar_settings',
        category: 'calendar',
        value: {
          holidays,
          blockedDates,
          dutchHolidays: dutchHolidaysToSave,
          defaultMaintenanceDuration,
          reservationReminderHours,
        }
      };
      await apiRequest('POST', '/api/app-settings', data);
    },
    onSuccess: () => {
      invalidateByPrefix('/api/app-settings');
      toast({ title: "Success", description: "Calendar settings saved successfully" });
    },
  });
  
  // Save Maintenance Calendar Display Settings (to /api/system-settings)
  const saveMaintenanceCalendarSettings = useMutation({
    mutationFn: async () => {
      const data = {
        maintenanceExcludedStatuses,
        showApkReminders,
        showWarrantyReminders,
        showMaintenanceBlocks,
        apkReminderDays: parseInt(apkReminderThresholdDays) || 30,
        warrantyReminderDays: parseInt(warrantyReminderThresholdDays) || 30,
      };
      await apiRequest('PUT', '/api/system-settings', data);
    },
    onSuccess: () => {
      invalidateByPrefix('/api/system-settings');
      toast({ title: "Success", description: "Maintenance calendar settings saved successfully" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to save maintenance calendar settings", variant: "destructive" });
    },
  });

  // Save Toll Rate Settings (to /api/system-settings)
  const saveTollRateSettings = useMutation({
    mutationFn: async () => {
      await apiRequest('PUT', '/api/system-settings', { tollRatePerKm });
    },
    onSuccess: () => {
      invalidateByPrefix('/api/system-settings');
      toast({ title: "Success", description: "Toll rate saved successfully" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to save toll rate", variant: "destructive" });
    },
  });

  const saveDocumentEmailTemplates = useMutation({
    mutationFn: async () => {
      const data = {
        key: 'document_email_templates',
        category: 'email',
        description: 'Email templates for sending contracts and damage checks to customers',
        value: docEmailTemplates
      };
      await apiRequest('POST', '/api/app-settings', data);
    },
    onSuccess: () => {
      invalidateByPrefix('/api/app-settings');
      toast({ title: "Success", description: "Document email templates saved successfully" });
    },
  });

  // GPS settings mutations (keep existing)
  const saveGpsRecipient = useMutation({
    mutationFn: async () => {
      const data = {
        key: 'gps_recipient',
        category: 'gps',
        value: { email: gpsRecipientEmail }
      };
      await apiRequest('POST', '/api/app-settings', data);
    },
    onSuccess: () => {
      invalidateByPrefix('/api/app-settings');
      toast({ title: "Success", description: "GPS recipient email saved successfully" });
    },
  });

  const saveGpsTemplates = useMutation({
    mutationFn: async () => {
      const data = {
        key: 'gps_email_templates',
        category: 'gps',
        value: {
          activationSubject: gpsActivationSubject,
          activationMessage: gpsActivationMessage,
          swapSubject: gpsSwapSubject,
          swapMessage: gpsSwapMessage,
        }
      };
      await apiRequest('POST', '/api/app-settings', data);
    },
    onSuccess: () => {
      invalidateByPrefix('/api/app-settings');
      toast({ title: "Success", description: "GPS email templates saved successfully" });
    },
  });

  // Email settings mutations (keep existing)
  const saveEmailSetting = useMutation({
    mutationFn: async (emailData: any) => {
      const url = editingEmail
        ? `/api/app-settings/${editingEmail.id}`
        : '/api/app-settings';
      const method = editingEmail ? 'PUT' : 'POST';
      await apiRequest(method, url, emailData);
    },
    onSuccess: () => {
      invalidateByPrefix('/api/app-settings/email');
      toast({
        title: "Success",
        description: editingEmail ? "Email configuration updated successfully" : "Email configuration saved successfully",
      });
      setIsEmailDialogOpen(false);
      resetEmailForm();
    },
  });

  const resetEmailForm = () => {
    setEditingEmail(null);
    setFromEmail("");
    setFromName("");
    setApiKey("");
    setSmtpHost("");
    setSmtpPort("");
    setSmtpUser("");
    setSmtpPassword("");
    setProvider("mailersend");
    setPurpose('default');
  };

  const handleOpenEmailDialog = (email?: EmailSetting) => {
    if (email) {
      setEditingEmail(email);
      setFromEmail(email.value.fromEmail || "");
      setFromName(email.value.fromName || "");
      setApiKey(email.value.apiKey || "");
      setSmtpHost(email.value.smtpHost || "");
      setSmtpPort(email.value.smtpPort || "");
      setSmtpUser(email.value.smtpUser || "");
      setSmtpPassword(email.value.smtpPassword || "");
      setProvider(email.value.provider || "mailersend");
      setPurpose(email.value.purpose || 'default');
    } else {
      resetEmailForm();
    }
    setIsEmailDialogOpen(true);
  };

  const handleSaveEmail = () => {
    const emailData = {
      key: `email_${purpose}_${provider}`,
      category: 'email',
      value: {
        fromEmail,
        fromName,
        provider,
        purpose,
        ...(provider === 'smtp' ? {
          smtpHost,
          smtpPort,
          smtpUser,
          smtpPassword,
        } : {
          apiKey,
        }),
      },
    };
    
    saveEmailSetting.mutate(emailData);
  };

  const handleDeleteEmailConfig = (id: number) => {
    setEmailConfigToDelete(id);
    setDeleteEmailDialogOpen(true);
  };

  const confirmDeleteEmailConfig = async () => {
    if (!emailConfigToDelete) return;
    
    try {
      await apiRequest('DELETE', `/api/app-settings/${emailConfigToDelete}`);
      invalidateByPrefix('/api/app-settings/email');
      toast({ 
        title: "Success", 
        description: "Email configuration deleted successfully" 
      });
    } catch (error: any) {
      toast({ 
        title: "Error", 
        description: error.message || "Failed to delete email configuration",
        variant: "destructive"
      });
    }
    setEmailConfigToDelete(null);
  };

  // Holiday management
  const handleAddHoliday = () => {
    if (!newHolidayDate || !newHolidayName) {
      toast({ title: "Error", description: "Please enter both date and name", variant: "destructive" });
      return;
    }
    setHolidays([...holidays, { date: newHolidayDate, name: newHolidayName }]);
    setNewHolidayDate("");
    setNewHolidayName("");
  };

  const handleRemoveHoliday = (index: number) => {
    setHolidays(holidays.filter((_, i) => i !== index));
  };

  // Blocked dates management
  const handleAddBlockedDate = () => {
    if (!newBlockedStart || !newBlockedEnd || !newBlockedReason) {
      toast({ title: "Error", description: "Please fill all fields", variant: "destructive" });
      return;
    }
    setBlockedDates([...blockedDates, { 
      startDate: newBlockedStart, 
      endDate: newBlockedEnd,
      reason: newBlockedReason 
    }]);
    setNewBlockedStart("");
    setNewBlockedEnd("");
    setNewBlockedReason("");
  };

  const handleRemoveBlockedDate = (index: number) => {
    setBlockedDates(blockedDates.filter((_, i) => i !== index));
  };

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <SettingsIcon className="h-8 w-8" />
          Application Settings
        </h1>
        <p className="text-gray-500 mt-2">Manage your car rental system configuration</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-6 lg:w-auto lg:inline-grid">
          <TabsTrigger value="business" className="gap-2">
            <Building2 className="h-4 w-4" />
            <span className="hidden sm:inline">Business Rules</span>
            <span className="sm:hidden">Business</span>
          </TabsTrigger>
          <TabsTrigger value="notifications" className="gap-2">
            <Bell className="h-4 w-4" />
            <span className="hidden sm:inline">Notifications</span>
            <span className="sm:hidden">Notifs</span>
          </TabsTrigger>
          <TabsTrigger value="documents" className="gap-2">
            <FileText className="h-4 w-4" />
            <span className="hidden sm:inline">Documents</span>
            <span className="sm:hidden">Docs</span>
          </TabsTrigger>
          <TabsTrigger value="doc-emails" className="gap-2">
            <Mail className="h-4 w-4" />
            <span className="hidden sm:inline">Doc Emails</span>
            <span className="sm:hidden">Emails</span>
          </TabsTrigger>
          <TabsTrigger value="calendar" className="gap-2">
            <CalendarIcon className="h-4 w-4" />
            <span className="hidden sm:inline">Calendar</span>
            <span className="sm:hidden">Calendar</span>
          </TabsTrigger>
          <TabsTrigger value="email" className="gap-2">
            <Mail className="h-4 w-4" />
            <span className="hidden sm:inline">Email & GPS</span>
            <span className="sm:hidden">Email</span>
          </TabsTrigger>
        </TabsList>

        {/* Business Rules Tab */}
        <TabsContent value="business" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="h-5 w-5" />
                Rental Defaults & Policies
              </CardTitle>
              <CardDescription>
                Set default values and business rules for rentals
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="defaultDuration">Default Rental Duration (days)</Label>
                  <Input
                    id="defaultDuration"
                    type="number"
                    min="1"
                    value={defaultRentalDuration}
                    onChange={(e) => setDefaultRentalDuration(e.target.value)}
                    data-testid="input-default-rental-duration"
                  />
                  <p className="text-xs text-gray-500 mt-1">Default duration when creating new rentals</p>
                </div>
                <div>
                  <Label htmlFor="fuelPolicy">Default Fuel Policy</Label>
                  <select
                    id="fuelPolicy"
                    value={defaultFuelPolicy}
                    onChange={(e) => setDefaultFuelPolicy(e.target.value)}
                    className="w-full mt-1 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
                    data-testid="select-fuel-policy"
                  >
                    <option value="full-to-full">Full to Full</option>
                    <option value="same-to-same">Same to Same</option>
                    <option value="prepaid">Prepaid Full Tank</option>
                  </select>
                  <p className="text-xs text-gray-500 mt-1">Standard fuel return policy</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="eigenrisicoBinnenland">Eigenrisico Binnenland (€)</Label>
                  <Input
                    id="eigenrisicoBinnenland"
                    type="number"
                    min="0"
                    step="0.01"
                    value={eigenrisicoBinnenland}
                    onChange={(e) => setEigenrisicoBinnenland(e.target.value)}
                    data-testid="input-eigenrisico-binnenland"
                  />
                  <p className="text-xs text-gray-500 mt-1">Damage deposit for domestic rentals</p>
                </div>
                <div>
                  <Label htmlFor="eigenrisicoBuitenland">Eigenrisico Buitenland (€)</Label>
                  <Input
                    id="eigenrisicoBuitenland"
                    type="number"
                    min="0"
                    step="0.01"
                    value={eigenrisicoBuitenland}
                    onChange={(e) => setEigenrisicoBuitenland(e.target.value)}
                    data-testid="input-eigenrisico-buitenland"
                  />
                  <p className="text-xs text-gray-500 mt-1">Damage deposit for international rentals</p>
                </div>
              </div>

              <Button
                onClick={() => saveBusinessRules.mutate()}
                disabled={saveBusinessRules.isPending}
                className="w-full md:w-auto"
                data-testid="button-save-business-rules"
              >
                {saveBusinessRules.isPending ? "Saving..." : "Save Business Rules"}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="h-5 w-5" />
                Transport & Toll Costs
              </CardTitle>
              <CardDescription>
                Default rate used to suggest toll costs when logging a vehicle transport
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="tollRatePerKm">Toll Rate (€ per km)</Label>
                  <Input
                    id="tollRatePerKm"
                    type="number"
                    min="0"
                    step="0.01"
                    value={tollRatePerKm}
                    onChange={(e) => setTollRatePerKm(e.target.value)}
                    data-testid="input-toll-rate-per-km"
                  />
                  <p className="text-xs text-gray-500 mt-1">Used to suggest a toll cost from the distance entered on a transport</p>
                </div>
              </div>

              <Button
                onClick={() => saveTollRateSettings.mutate()}
                disabled={saveTollRateSettings.isPending}
                className="w-full md:w-auto"
                data-testid="button-save-toll-rate"
              >
                {saveTollRateSettings.isPending ? "Saving..." : "Save Toll Rate"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Notifications Tab */}
        <TabsContent value="notifications" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Reminder Timing
              </CardTitle>
              <CardDescription>
                Configure when reminders are sent for upcoming events
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="apkReminder">APK Expiration Reminder (days before)</Label>
                  <Input
                    id="apkReminder"
                    type="number"
                    min="1"
                    value={apkReminderDays}
                    onChange={(e) => setApkReminderDays(e.target.value)}
                    data-testid="input-apk-reminder-days"
                  />
                  <p className="text-xs text-gray-500 mt-1">Send reminder this many days before APK expires</p>
                </div>
                <div>
                  <Label htmlFor="warrantyReminder">Warranty Expiration Reminder (days before)</Label>
                  <Input
                    id="warrantyReminder"
                    type="number"
                    min="1"
                    value={warrantyReminderDays}
                    onChange={(e) => setWarrantyReminderDays(e.target.value)}
                    data-testid="input-warranty-reminder-days"
                  />
                  <p className="text-xs text-gray-500 mt-1">Send reminder this many days before warranty expires</p>
                </div>
                <div>
                  <Label htmlFor="maintenanceReminder">Maintenance Due Reminder (days before)</Label>
                  <Input
                    id="maintenanceReminder"
                    type="number"
                    min="1"
                    value={maintenanceReminderDays}
                    onChange={(e) => setMaintenanceReminderDays(e.target.value)}
                    data-testid="input-maintenance-reminder-days"
                  />
                  <p className="text-xs text-gray-500 mt-1">Send reminder this many days before maintenance is due</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="h-5 w-5" />
                Notification Preferences
              </CardTitle>
              <CardDescription>
                Control which notifications you receive
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Email Notifications</Label>
                  <p className="text-sm text-gray-500">Receive notifications via email</p>
                </div>
                <Switch
                  checked={emailNotificationsEnabled}
                  onCheckedChange={setEmailNotificationsEnabled}
                  data-testid="switch-email-notifications"
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Real-time Sound Alerts</Label>
                  <p className="text-sm text-gray-500">Play sound for real-time notifications</p>
                </div>
                <Switch
                  checked={realtimeSoundEnabled}
                  onCheckedChange={setRealtimeSoundEnabled}
                  data-testid="switch-realtime-sound"
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>New Reservation Notifications</Label>
                  <p className="text-sm text-gray-500">Get notified when a new reservation is created</p>
                </div>
                <Switch
                  checked={notifyOnNewReservation}
                  onCheckedChange={setNotifyOnNewReservation}
                  data-testid="switch-notify-new-reservation"
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Vehicle Return Notifications</Label>
                  <p className="text-sm text-gray-500">Get notified when a vehicle is returned</p>
                </div>
                <Switch
                  checked={notifyOnVehicleReturn}
                  onCheckedChange={setNotifyOnVehicleReturn}
                  data-testid="switch-notify-vehicle-return"
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Maintenance Due Notifications</Label>
                  <p className="text-sm text-gray-500">Get notified when maintenance is due</p>
                </div>
                <Switch
                  checked={notifyOnMaintenanceDue}
                  onCheckedChange={setNotifyOnMaintenanceDue}
                  data-testid="switch-notify-maintenance-due"
                />
              </div>

              <Button 
                onClick={() => saveNotificationPrefs.mutate()}
                disabled={saveNotificationPrefs.isPending}
                className="w-full md:w-auto"
                data-testid="button-save-notification-prefs"
              >
                {saveNotificationPrefs.isPending ? "Saving..." : "Save Notification Preferences"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Documents Tab */}
        <TabsContent value="documents" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Invoice & Contract Settings
              </CardTitle>
              <CardDescription>
                Configure document numbering and auto-generation
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="invoiceFormat">Invoice Number Format</Label>
                  <Input
                    id="invoiceFormat"
                    value={invoiceNumberFormat}
                    onChange={(e) => setInvoiceNumberFormat(e.target.value)}
                    placeholder="INV-{YEAR}-{NUMBER}"
                    data-testid="input-invoice-format"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Use {'{YEAR}'}, {'{MONTH}'}, {'{NUMBER}'} as placeholders
                  </p>
                </div>
                <div>
                  <Label htmlFor="invoiceStartNumber">Starting Invoice Number</Label>
                  <Input
                    id="invoiceStartNumber"
                    type="number"
                    min="1"
                    value={invoiceStartingNumber}
                    onChange={(e) => setInvoiceStartingNumber(e.target.value)}
                    data-testid="input-invoice-start-number"
                  />
                  <p className="text-xs text-gray-500 mt-1">First invoice number to use</p>
                </div>
              </div>

              <div>
                <Label htmlFor="contractTerms">Contract Terms & Conditions</Label>
                <Textarea
                  id="contractTerms"
                  value={contractTerms}
                  onChange={(e) => setContractTerms(e.target.value)}
                  rows={8}
                  placeholder="Enter standard contract terms and conditions..."
                  data-testid="textarea-contract-terms"
                  className="font-mono text-sm"
                />
                <p className="text-xs text-gray-500 mt-1">These terms will appear in rental contracts</p>
              </div>

              <div>
                <Label htmlFor="invoiceFooter">Invoice Footer Text</Label>
                <Textarea
                  id="invoiceFooter"
                  value={invoiceFooter}
                  onChange={(e) => setInvoiceFooter(e.target.value)}
                  rows={4}
                  placeholder="Enter invoice footer (payment terms, bank details, etc.)..."
                  data-testid="textarea-invoice-footer"
                  className="font-mono text-sm"
                />
                <p className="text-xs text-gray-500 mt-1">This appears at the bottom of all invoices</p>
              </div>

              <Button 
                onClick={() => saveDocumentSettings.mutate()}
                disabled={saveDocumentSettings.isPending}
                className="w-full md:w-auto"
                data-testid="button-save-document-settings"
              >
                {saveDocumentSettings.isPending ? "Saving..." : "Save Document Settings"}
              </Button>
            </CardContent>
          </Card>

          {/* Contract Number Settings Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileCheck className="h-5 w-5" />
                Contract Number Settings
              </CardTitle>
              <CardDescription>
                Configure the starting number for auto-generated contract numbers
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <ContractNumberSettings />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Document Emails Tab */}
        <TabsContent value="doc-emails" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Mail className="h-5 w-5" />
                Document Email Templates
              </CardTitle>
              <CardDescription>
                Configure email templates for sending contracts and damage checks to customers in English and Dutch
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm text-blue-800">
                  <strong>Available Placeholders:</strong> {'{customerName}'}, {'{vehiclePlate}'}, {'{startDate}'}, {'{endDate}'}
                </p>
                <p className="text-xs text-blue-600 mt-1">
                  All placeholders are automatically filled with reservation and customer data when sending emails.
                </p>
              </div>

              <Tabs defaultValue="en" className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="en">English Templates</TabsTrigger>
                  <TabsTrigger value="nl">Dutch Templates</TabsTrigger>
                </TabsList>

                {/* English Templates */}
                <TabsContent value="en" className="space-y-6 mt-6">
                  {/* Contract Email - English */}
                  <div className="space-y-4 border rounded-lg p-4 bg-gray-50">
                    <h4 className="font-semibold text-lg flex items-center gap-2">
                      <FileText className="h-4 w-4" />
                      Contract Email (English)
                    </h4>
                    <div className="space-y-3">
                      <div>
                        <Label htmlFor="contract-en-subject">Subject Line</Label>
                        <Input
                          id="contract-en-subject"
                          value={docEmailTemplates.contract.en.subject}
                          onChange={(e) => setDocEmailTemplates(prev => ({
                            ...prev,
                            contract: {
                              ...prev.contract,
                              en: { ...prev.contract.en, subject: e.target.value }
                            }
                          }))}
                          placeholder="Email subject..."
                          data-testid="input-contract-en-subject"
                        />
                      </div>
                      <div>
                        <Label htmlFor="contract-en-message">Email Message</Label>
                        <Textarea
                          id="contract-en-message"
                          value={docEmailTemplates.contract.en.message}
                          onChange={(e) => setDocEmailTemplates(prev => ({
                            ...prev,
                            contract: {
                              ...prev.contract,
                              en: { ...prev.contract.en, message: e.target.value }
                            }
                          }))}
                          rows={6}
                          placeholder="Email message body..."
                          data-testid="textarea-contract-en-message"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Damage Check Email - English */}
                  <div className="space-y-4 border rounded-lg p-4 bg-gray-50">
                    <h4 className="font-semibold text-lg flex items-center gap-2">
                      <FileCheck className="h-4 w-4" />
                      Damage Check Email (English)
                    </h4>
                    <div className="space-y-3">
                      <div>
                        <Label htmlFor="damage-en-subject">Subject Line</Label>
                        <Input
                          id="damage-en-subject"
                          value={docEmailTemplates.damage_check.en.subject}
                          onChange={(e) => setDocEmailTemplates(prev => ({
                            ...prev,
                            damage_check: {
                              ...prev.damage_check,
                              en: { ...prev.damage_check.en, subject: e.target.value }
                            }
                          }))}
                          placeholder="Email subject..."
                          data-testid="input-damage-en-subject"
                        />
                      </div>
                      <div>
                        <Label htmlFor="damage-en-message">Email Message</Label>
                        <Textarea
                          id="damage-en-message"
                          value={docEmailTemplates.damage_check.en.message}
                          onChange={(e) => setDocEmailTemplates(prev => ({
                            ...prev,
                            damage_check: {
                              ...prev.damage_check,
                              en: { ...prev.damage_check.en, message: e.target.value }
                            }
                          }))}
                          rows={6}
                          placeholder="Email message body..."
                          data-testid="textarea-damage-en-message"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Combined Documents Email - English */}
                  <div className="space-y-4 border rounded-lg p-4 bg-indigo-50">
                    <h4 className="font-semibold text-lg flex items-center gap-2">
                      <FileText className="h-4 w-4" />
                      Combined Documents Email (English)
                    </h4>
                    <p className="text-sm text-gray-600">Used when sending both contract AND damage check together</p>
                    <div className="space-y-3">
                      <div>
                        <Label htmlFor="combined-en-subject">Subject Line</Label>
                        <Input
                          id="combined-en-subject"
                          value={docEmailTemplates.combined.en.subject}
                          onChange={(e) => setDocEmailTemplates(prev => ({
                            ...prev,
                            combined: {
                              ...prev.combined,
                              en: { ...prev.combined.en, subject: e.target.value }
                            }
                          }))}
                          placeholder="Email subject..."
                          data-testid="input-combined-en-subject"
                        />
                      </div>
                      <div>
                        <Label htmlFor="combined-en-message">Email Message</Label>
                        <Textarea
                          id="combined-en-message"
                          value={docEmailTemplates.combined.en.message}
                          onChange={(e) => setDocEmailTemplates(prev => ({
                            ...prev,
                            combined: {
                              ...prev.combined,
                              en: { ...prev.combined.en, message: e.target.value }
                            }
                          }))}
                          rows={8}
                          placeholder="Email message..."
                          data-testid="textarea-combined-en-message"
                        />
                      </div>
                    </div>
                  </div>
                </TabsContent>

                {/* Dutch Templates */}
                <TabsContent value="nl" className="space-y-6 mt-6">
                  {/* Contract Email - Dutch */}
                  <div className="space-y-4 border rounded-lg p-4 bg-gray-50">
                    <h4 className="font-semibold text-lg flex items-center gap-2">
                      <FileText className="h-4 w-4" />
                      Huurcontract E-mail (Nederlands)
                    </h4>
                    <div className="space-y-3">
                      <div>
                        <Label htmlFor="contract-nl-subject">Onderwerp</Label>
                        <Input
                          id="contract-nl-subject"
                          value={docEmailTemplates.contract.nl.subject}
                          onChange={(e) => setDocEmailTemplates(prev => ({
                            ...prev,
                            contract: {
                              ...prev.contract,
                              nl: { ...prev.contract.nl, subject: e.target.value }
                            }
                          }))}
                          placeholder="E-mail onderwerp..."
                          data-testid="input-contract-nl-subject"
                        />
                      </div>
                      <div>
                        <Label htmlFor="contract-nl-message">Bericht</Label>
                        <Textarea
                          id="contract-nl-message"
                          value={docEmailTemplates.contract.nl.message}
                          onChange={(e) => setDocEmailTemplates(prev => ({
                            ...prev,
                            contract: {
                              ...prev.contract,
                              nl: { ...prev.contract.nl, message: e.target.value }
                            }
                          }))}
                          rows={6}
                          placeholder="E-mail bericht..."
                          data-testid="textarea-contract-nl-message"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Damage Check Email - Dutch */}
                  <div className="space-y-4 border rounded-lg p-4 bg-gray-50">
                    <h4 className="font-semibold text-lg flex items-center gap-2">
                      <FileCheck className="h-4 w-4" />
                      Schade Controle E-mail (Nederlands)
                    </h4>
                    <div className="space-y-3">
                      <div>
                        <Label htmlFor="damage-nl-subject">Onderwerp</Label>
                        <Input
                          id="damage-nl-subject"
                          value={docEmailTemplates.damage_check.nl.subject}
                          onChange={(e) => setDocEmailTemplates(prev => ({
                            ...prev,
                            damage_check: {
                              ...prev.damage_check,
                              nl: { ...prev.damage_check.nl, subject: e.target.value }
                            }
                          }))}
                          placeholder="E-mail onderwerp..."
                          data-testid="input-damage-nl-subject"
                        />
                      </div>
                      <div>
                        <Label htmlFor="damage-nl-message">Bericht</Label>
                        <Textarea
                          id="damage-nl-message"
                          value={docEmailTemplates.damage_check.nl.message}
                          onChange={(e) => setDocEmailTemplates(prev => ({
                            ...prev,
                            damage_check: {
                              ...prev.damage_check,
                              nl: { ...prev.damage_check.nl, message: e.target.value }
                            }
                          }))}
                          rows={6}
                          placeholder="E-mail bericht..."
                          data-testid="textarea-damage-nl-message"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Combined Documents Email - Dutch */}
                  <div className="space-y-4 border rounded-lg p-4 bg-indigo-50">
                    <h4 className="font-semibold text-lg flex items-center gap-2">
                      <FileText className="h-4 w-4" />
                      Gecombineerde Documenten E-mail (Nederlands)
                    </h4>
                    <p className="text-sm text-gray-600">Gebruikt bij het verzenden van zowel contract ALS schadecontrole</p>
                    <div className="space-y-3">
                      <div>
                        <Label htmlFor="combined-nl-subject">Onderwerp</Label>
                        <Input
                          id="combined-nl-subject"
                          value={docEmailTemplates.combined.nl.subject}
                          onChange={(e) => setDocEmailTemplates(prev => ({
                            ...prev,
                            combined: {
                              ...prev.combined,
                              nl: { ...prev.combined.nl, subject: e.target.value }
                            }
                          }))}
                          placeholder="E-mail onderwerp..."
                          data-testid="input-combined-nl-subject"
                        />
                      </div>
                      <div>
                        <Label htmlFor="combined-nl-message">Bericht</Label>
                        <Textarea
                          id="combined-nl-message"
                          value={docEmailTemplates.combined.nl.message}
                          onChange={(e) => setDocEmailTemplates(prev => ({
                            ...prev,
                            combined: {
                              ...prev.combined,
                              nl: { ...prev.combined.nl, message: e.target.value }
                            }
                          }))}
                          rows={8}
                          placeholder="E-mail bericht..."
                          data-testid="textarea-combined-nl-message"
                        />
                      </div>
                    </div>
                  </div>
                </TabsContent>
              </Tabs>

              <Button 
                onClick={() => saveDocumentEmailTemplates.mutate()}
                disabled={saveDocumentEmailTemplates.isPending}
                className="w-full md:w-auto"
                data-testid="button-save-document-email-templates"
              >
                {saveDocumentEmailTemplates.isPending ? "Saving..." : "Save Email Templates"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Calendar Tab */}
        <TabsContent value="calendar" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CalendarIcon className="h-5 w-5" />
                Holidays & Blocked Dates
              </CardTitle>
              <CardDescription>
                Manage company holidays and closure periods
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Dutch National Holidays */}
              <div>
                <h4 className="font-medium text-sm mb-3">Dutch National Holidays</h4>
                <p className="text-xs text-gray-500 mb-4">
                  Dates are automatically calculated for {currentYear}. You can override any date manually.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {Object.entries(DUTCH_HOLIDAY_NAMES).map(([key, name]) => {
                    const holiday = dutchHolidays[key];
                    const isOverridden = holiday?.isOverridden === true;
                    
                    return (
                      <div key={key} className={`flex items-center justify-between p-3 border rounded-lg gap-2 ${isOverridden ? 'bg-blue-50 border-blue-200' : 'bg-orange-50'}`}>
                        <div className="flex-shrink-0 min-w-[130px]">
                          <Label htmlFor={`holiday-${key}`} className="font-medium cursor-pointer text-sm">
                            {name}
                          </Label>
                          {isOverridden && (
                            <span className="block text-xs text-blue-600">Manual override</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <Input
                            type="date"
                            value={holiday?.date || ''}
                            onChange={(e) => setDutchHolidays(prev => ({
                              ...prev,
                              [key]: { 
                                ...prev[key], 
                                date: e.target.value,
                                isOverridden: true
                              }
                            }))}
                            className="w-[140px] flex-shrink-0"
                            data-testid={`input-holiday-date-${key}`}
                          />
                          {isOverridden && holiday?.calculatedDate && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="px-2 text-xs text-blue-600 hover:text-blue-800"
                              onClick={() => setDutchHolidays(prev => ({
                                ...prev,
                                [key]: { 
                                  ...prev[key], 
                                  date: prev[key]?.calculatedDate || '',
                                  isOverridden: false
                                }
                              }))}
                              title={`Reset to calculated date: ${holiday.calculatedDate}`}
                              data-testid={`button-reset-holiday-${key}`}
                            >
                              Reset
                            </Button>
                          )}
                          <Switch
                            id={`holiday-${key}`}
                            checked={holiday?.enabled ?? true}
                            onCheckedChange={(checked) => setDutchHolidays(prev => {
                              // Get calculated defaults to preserve date if current entry is missing
                              const calculated = calculateDutchHolidays(currentYear);
                              const defaultDate = calculated[key as keyof typeof calculated] || '';
                              const existingEntry = prev[key] || { 
                                enabled: true, 
                                date: defaultDate, 
                                isOverridden: false, 
                                calculatedDate: defaultDate 
                              };
                              return {
                                ...prev,
                                [key]: { ...existingEntry, enabled: checked }
                              };
                            })}
                            data-testid={`switch-holiday-${key}`}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="border-t pt-6">
                <h4 className="font-medium text-sm mb-3">Custom Holidays</h4>
                <div className="space-y-2 mb-4">
                  {holidays.map((holiday, index) => (
                    <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                      <div>
                        <p className="font-medium">{holiday.name}</p>
                        <p className="text-sm text-gray-500">{new Date(holiday.date).toLocaleDateString()}</p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveHoliday(index)}
                        data-testid={`button-remove-holiday-${index}`}
                      >
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  ))}
                  {holidays.length === 0 && (
                    <p className="text-sm text-gray-500 text-center py-4">No holidays defined</p>
                  )}
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <Input
                    type="date"
                    value={newHolidayDate}
                    onChange={(e) => setNewHolidayDate(e.target.value)}
                    placeholder="Date"
                    data-testid="input-new-holiday-date"
                  />
                  <Input
                    value={newHolidayName}
                    onChange={(e) => setNewHolidayName(e.target.value)}
                    placeholder="Holiday name"
                    data-testid="input-new-holiday-name"
                  />
                  <Button onClick={handleAddHoliday} data-testid="button-add-holiday">
                    <Plus className="h-4 w-4 mr-2" />
                    Add Holiday
                  </Button>
                </div>
              </div>

              <div className="border-t pt-6">
                <h4 className="font-medium text-sm mb-3">Blocked Dates (Company Closures)</h4>
                <div className="space-y-2 mb-4">
                  {blockedDates.map((blocked, index) => (
                    <div key={index} className="flex items-center justify-between p-3 border rounded-lg bg-red-50">
                      <div>
                        <p className="font-medium">{blocked.reason}</p>
                        <p className="text-sm text-gray-500">
                          {new Date(blocked.startDate).toLocaleDateString()} - {new Date(blocked.endDate).toLocaleDateString()}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveBlockedDate(index)}
                        data-testid={`button-remove-blocked-${index}`}
                      >
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  ))}
                  {blockedDates.length === 0 && (
                    <p className="text-sm text-gray-500 text-center py-4">No blocked dates defined</p>
                  )}
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <Input
                    type="date"
                    value={newBlockedStart}
                    onChange={(e) => setNewBlockedStart(e.target.value)}
                    placeholder="Start date"
                    data-testid="input-new-blocked-start"
                  />
                  <Input
                    type="date"
                    value={newBlockedEnd}
                    onChange={(e) => setNewBlockedEnd(e.target.value)}
                    placeholder="End date"
                    data-testid="input-new-blocked-end"
                  />
                  <Input
                    value={newBlockedReason}
                    onChange={(e) => setNewBlockedReason(e.target.value)}
                    placeholder="Reason"
                    data-testid="input-new-blocked-reason"
                  />
                  <Button onClick={handleAddBlockedDate} data-testid="button-add-blocked">
                    <Plus className="h-4 w-4 mr-2" />
                    Add Closure
                  </Button>
                </div>
              </div>

              <div className="border-t pt-6">
                <h4 className="font-medium text-sm mb-3">Default Settings</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="defaultMaintenanceDuration">Default Maintenance Duration (days)</Label>
                    <Input
                      id="defaultMaintenanceDuration"
                      type="number"
                      min="1"
                      value={defaultMaintenanceDuration}
                      onChange={(e) => setDefaultMaintenanceDuration(e.target.value)}
                      data-testid="input-default-maintenance-duration"
                    />
                    <p className="text-xs text-gray-500 mt-1">Default duration for maintenance appointments</p>
                  </div>
                  <div>
                    <Label htmlFor="reservationReminder">Reservation Reminder (hours before)</Label>
                    <Input
                      id="reservationReminder"
                      type="number"
                      min="1"
                      value={reservationReminderHours}
                      onChange={(e) => setReservationReminderHours(e.target.value)}
                      data-testid="input-reservation-reminder-hours"
                    />
                    <p className="text-xs text-gray-500 mt-1">Send reminder this many hours before pickup</p>
                  </div>
                </div>
              </div>

              <Button 
                onClick={() => saveCalendarSettings.mutate()}
                disabled={saveCalendarSettings.isPending}
                className="w-full md:w-auto"
                data-testid="button-save-calendar-settings"
              >
                {saveCalendarSettings.isPending ? "Saving..." : "Save Calendar Settings"}
              </Button>
            </CardContent>
          </Card>

          {/* Maintenance Calendar Settings Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <SettingsIcon className="h-5 w-5" />
                Maintenance Calendar Display
              </CardTitle>
              <CardDescription>
                Control which vehicles and reminders appear in the maintenance calendar
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Vehicle Status Exclusions */}
              <div>
                <h4 className="font-medium text-sm mb-3">Exclude Vehicles by Status</h4>
                <p className="text-xs text-gray-500 mb-4">
                  Vehicles with these statuses will not show APK/warranty reminders
                </p>
                <div className="flex flex-wrap gap-4">
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="exclude-not-for-rental"
                      checked={maintenanceExcludedStatuses.includes("not_for_rental")}
                      onCheckedChange={(checked) => {
                        setMaintenanceExcludedStatuses(prev => 
                          checked 
                            ? [...prev.filter(s => s !== "not_for_rental"), "not_for_rental"]
                            : prev.filter(s => s !== "not_for_rental")
                        );
                      }}
                      data-testid="switch-exclude-not-for-rental"
                    />
                    <Label htmlFor="exclude-not-for-rental">Not for Rental</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="exclude-needs-fixing"
                      checked={maintenanceExcludedStatuses.includes("needs_fixing")}
                      onCheckedChange={(checked) => {
                        setMaintenanceExcludedStatuses(prev => 
                          checked 
                            ? [...prev.filter(s => s !== "needs_fixing"), "needs_fixing"]
                            : prev.filter(s => s !== "needs_fixing")
                        );
                      }}
                      data-testid="switch-exclude-needs-fixing"
                    />
                    <Label htmlFor="exclude-needs-fixing">Needs Fixing</Label>
                  </div>
                </div>
              </div>

              <div className="border-t pt-6">
                <h4 className="font-medium text-sm mb-3">Reminder Visibility</h4>
                <p className="text-xs text-gray-500 mb-4">
                  Toggle which reminder types appear in the calendar and notification center
                </p>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>APK Reminders</Label>
                      <p className="text-sm text-gray-500">Show APK expiration reminders</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          min="1"
                          max="365"
                          value={apkReminderThresholdDays}
                          onChange={(e) => setApkReminderThresholdDays(e.target.value)}
                          className="w-20"
                          disabled={!showApkReminders}
                          data-testid="input-apk-threshold-days"
                        />
                        <span className="text-sm text-gray-500">days</span>
                      </div>
                      <Switch
                        checked={showApkReminders}
                        onCheckedChange={setShowApkReminders}
                        data-testid="switch-show-apk-reminders"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Warranty Reminders</Label>
                      <p className="text-sm text-gray-500">Show warranty expiration reminders</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          min="1"
                          max="365"
                          value={warrantyReminderThresholdDays}
                          onChange={(e) => setWarrantyReminderThresholdDays(e.target.value)}
                          className="w-20"
                          disabled={!showWarrantyReminders}
                          data-testid="input-warranty-threshold-days"
                        />
                        <span className="text-sm text-gray-500">days</span>
                      </div>
                      <Switch
                        checked={showWarrantyReminders}
                        onCheckedChange={setShowWarrantyReminders}
                        data-testid="switch-show-warranty-reminders"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Maintenance Blocks</Label>
                      <p className="text-sm text-gray-500">Show scheduled maintenance blocks on calendar</p>
                    </div>
                    <Switch
                      checked={showMaintenanceBlocks}
                      onCheckedChange={setShowMaintenanceBlocks}
                      data-testid="switch-show-maintenance-blocks"
                    />
                  </div>
                </div>
              </div>

              <Button 
                onClick={() => saveMaintenanceCalendarSettings.mutate()}
                disabled={saveMaintenanceCalendarSettings.isPending}
                className="w-full md:w-auto"
                data-testid="button-save-maintenance-calendar-settings"
              >
                {saveMaintenanceCalendarSettings.isPending ? "Saving..." : "Save Maintenance Settings"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Email & GPS Tab (existing email configuration) */}
        <TabsContent value="email" className="space-y-6">
          {/* Email Configuration Card */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Mail className="h-5 w-5" />
                    Email Configuration
                  </CardTitle>
                  <CardDescription>
                    Configure email settings for sending notifications and reminders
                  </CardDescription>
                </div>
                <Dialog open={isEmailDialogOpen} onOpenChange={setIsEmailDialogOpen}>
                  <DialogTrigger asChild>
                    <Button onClick={() => handleOpenEmailDialog()} data-testid="button-add-email-config">
                      <Plus className="h-4 w-4 mr-2" />
                      Add Email Config
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>
                        {editingEmail ? 'Edit Email Configuration' : 'Add Email Configuration'}
                      </DialogTitle>
                      <DialogDescription>
                        Configure email service provider and credentials
                      </DialogDescription>
                    </DialogHeader>
                    
                    <div className="space-y-4 py-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor="provider">Provider</Label>
                          <select
                            id="provider"
                            value={provider}
                            onChange={(e) => setProvider(e.target.value)}
                            className="w-full mt-1 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
                            data-testid="select-email-provider"
                          >
                            <option value="mailersend">MailerSend</option>
                            <option value="sendgrid">SendGrid</option>
                            <option value="smtp">Custom SMTP</option>
                          </select>
                        </div>
                        <div>
                          <Label htmlFor="purpose">Email Purpose</Label>
                          <select
                            id="purpose"
                            value={purpose}
                            onChange={(e) => setPurpose(e.target.value as any)}
                            className="w-full mt-1 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
                            data-testid="select-email-purpose"
                          >
                            {EMAIL_PURPOSES.map(p => (
                              <option key={p.value} value={p.value}>{p.label}</option>
                            ))}
                          </select>
                          <p className="text-xs text-gray-500 mt-1">
                            {EMAIL_PURPOSES.find(p => p.value === purpose)?.description}
                          </p>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor="fromEmail">From Email</Label>
                          <Input
                            id="fromEmail"
                            type="email"
                            value={fromEmail}
                            onChange={(e) => setFromEmail(e.target.value)}
                            placeholder="noreply@example.com"
                            data-testid="input-from-email"
                          />
                        </div>
                        <div>
                          <Label htmlFor="fromName">From Name</Label>
                          <Input
                            id="fromName"
                            value={fromName}
                            onChange={(e) => setFromName(e.target.value)}
                            placeholder="Car Rental Manager"
                            data-testid="input-from-name"
                          />
                        </div>
                      </div>
                      
                      {(provider === 'mailersend' || provider === 'sendgrid') && (
                        <div>
                          <Label htmlFor="apiKey">API Key</Label>
                          <Input
                            id="apiKey"
                            type="password"
                            value={apiKey}
                            onChange={(e) => setApiKey(e.target.value)}
                            placeholder="Enter API key"
                            data-testid="input-api-key"
                          />
                        </div>
                      )}
                      
                      {provider === 'smtp' && (
                        <>
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <Label htmlFor="smtpHost">SMTP Host</Label>
                              <Input
                                id="smtpHost"
                                value={smtpHost}
                                onChange={(e) => setSmtpHost(e.target.value)}
                                placeholder="smtp.example.com"
                                data-testid="input-smtp-host"
                              />
                            </div>
                            <div>
                              <Label htmlFor="smtpPort">SMTP Port</Label>
                              <Input
                                id="smtpPort"
                                value={smtpPort}
                                onChange={(e) => setSmtpPort(e.target.value)}
                                placeholder="587"
                                data-testid="input-smtp-port"
                              />
                            </div>
                          </div>
                          
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <Label htmlFor="smtpUser">SMTP Username</Label>
                              <Input
                                id="smtpUser"
                                value={smtpUser}
                                onChange={(e) => setSmtpUser(e.target.value)}
                                placeholder="username"
                                data-testid="input-smtp-user"
                              />
                            </div>
                            <div>
                              <Label htmlFor="smtpPassword">SMTP Password</Label>
                              <Input
                                id="smtpPassword"
                                type="password"
                                value={smtpPassword}
                                onChange={(e) => setSmtpPassword(e.target.value)}
                                placeholder="Enter your password"
                                data-testid="input-smtp-password"
                              />
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                    
                    <DialogFooter>
                      <Button
                        variant="outline"
                        onClick={() => {
                          setIsEmailDialogOpen(false);
                          resetEmailForm();
                        }}
                      >
                        Cancel
                      </Button>
                      <Button
                        onClick={handleSaveEmail}
                        disabled={saveEmailSetting.isPending}
                        data-testid="button-save-email-config"
                      >
                        {saveEmailSetting.isPending ? "Saving..." : "Save Configuration"}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent>
              {loadingEmail ? (
                <div className="text-center py-8 text-gray-500">Loading email settings...</div>
              ) : emailSettings && emailSettings.length > 0 ? (
                <div className="space-y-4">
                  {emailSettings.map((setting) => {
                    const purposeInfo = EMAIL_PURPOSES.find(p => p.value === setting.value.purpose) || EMAIL_PURPOSES[EMAIL_PURPOSES.length - 1];
                    return (
                      <div key={setting.id} className="border rounded-lg p-4 flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <h3 className="font-medium">{purposeInfo.label}</h3>
                            <Badge variant="outline">{setting.value.provider || 'mailersend'}</Badge>
                            <Badge 
                              variant="secondary" 
                              className={
                                setting.value.purpose === 'apk' ? 'bg-blue-100 text-blue-800' :
                                setting.value.purpose === 'maintenance' ? 'bg-green-100 text-green-800' :
                                setting.value.purpose === 'gps' ? 'bg-purple-100 text-purple-800' :
                                setting.value.purpose === 'documents' ? 'bg-indigo-100 text-indigo-800' :
                                setting.value.purpose === 'custom' ? 'bg-orange-100 text-orange-800' :
                                'bg-gray-100 text-gray-800'
                              }
                            >
                              {purposeInfo.value.toUpperCase()}
                            </Badge>
                          </div>
                          <div className="text-sm text-gray-600 space-y-1">
                            <p className="text-xs text-gray-500 mb-1">{purposeInfo.description}</p>
                            <p><strong>From:</strong> {setting.value.fromName} &lt;{setting.value.fromEmail}&gt;</p>
                            {setting.value.apiKey && (
                              <p><strong>API Key:</strong> {setting.value.apiKey.substring(0, 10)}...***</p>
                            )}
                            {setting.value.smtpHost && (
                              <p><strong>SMTP:</strong> {setting.value.smtpHost}:{setting.value.smtpPort}</p>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleOpenEmailDialog(setting)}
                            data-testid={`button-edit-email-${setting.id}`}
                          >
                            <Edit className="h-4 w-4 mr-2" />
                            Edit
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteEmailConfig(setting.id)}
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                            data-testid={`button-delete-email-${setting.id}`}
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <Mail className="h-12 w-12 mx-auto mb-3 text-gray-400" />
                  <p>No email configuration set</p>
                  <p className="text-sm mt-1">Click "Add Email Config" to configure your email service</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* GPS Settings Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Server className="h-5 w-5" />
                GPS Activation Settings
              </CardTitle>
              <CardDescription>
                Configure the GPS company's email address for activation requests
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="md:col-span-2">
                    <Label htmlFor="gpsRecipientEmail">GPS Company Email</Label>
                    <Input
                      id="gpsRecipientEmail"
                      type="email"
                      value={gpsRecipientEmail}
                      onChange={(e) => setGpsRecipientEmail(e.target.value)}
                      placeholder="gps@company.com"
                      className="mt-1"
                      data-testid="input-gps-recipient-email"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      This email will receive GPS activation and swap requests
                    </p>
                  </div>
                  <div className="flex items-end">
                    <Button
                      onClick={() => saveGpsRecipient.mutate()}
                      disabled={saveGpsRecipient.isPending}
                      className="w-full"
                      data-testid="button-save-gps-recipient"
                    >
                      {saveGpsRecipient.isPending ? "Saving..." : "Save GPS Email"}
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* GPS Email Templates Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Mail className="h-5 w-5" />
                GPS Email Templates
              </CardTitle>
              <CardDescription>
                Customize GPS activation and swap email messages sent to your GPS provider
              </CardDescription>
              <div className="mt-2 text-sm text-muted-foreground bg-blue-50 border border-blue-200 rounded-md p-3">
                <strong>Available Placeholders:</strong> <code className="mx-1 px-1.5 py-0.5 bg-blue-100 rounded">{'{brand}'}</code>
                <code className="mx-1 px-1.5 py-0.5 bg-blue-100 rounded">{'{model}'}</code>
                <code className="mx-1 px-1.5 py-0.5 bg-blue-100 rounded">{'{licensePlate}'}</code>
                <code className="mx-1 px-1.5 py-0.5 bg-blue-100 rounded">{'{imei}'}</code>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {/* GPS Activation Template */}
                <div className="space-y-3 p-4 border rounded-lg">
                  <h4 className="font-medium text-sm">GPS Activation Email</h4>
                  <div className="space-y-3">
                    <div>
                      <Label htmlFor="gpsActivationSubject">Subject</Label>
                      <Input
                        id="gpsActivationSubject"
                        value={gpsActivationSubject}
                        onChange={(e) => setGpsActivationSubject(e.target.value)}
                        placeholder="GPS Activatie Verzoek - {brand} {model} ({licensePlate})"
                        className="mt-1"
                        data-testid="input-gps-activation-subject"
                      />
                    </div>
                    <div>
                      <Label htmlFor="gpsActivationMessage">Message</Label>
                      <Textarea
                        id="gpsActivationMessage"
                        value={gpsActivationMessage}
                        onChange={(e) => setGpsActivationMessage(e.target.value)}
                        placeholder="Enter GPS activation message template..."
                        rows={6}
                        className="mt-1 font-mono text-sm"
                        data-testid="textarea-gps-activation-message"
                      />
                    </div>
                  </div>
                </div>

                {/* GPS Swap Template */}
                <div className="space-y-3 p-4 border rounded-lg">
                  <h4 className="font-medium text-sm">GPS Module Swap Email</h4>
                  <div className="space-y-3">
                    <div>
                      <Label htmlFor="gpsSwapSubject">Subject</Label>
                      <Input
                        id="gpsSwapSubject"
                        value={gpsSwapSubject}
                        onChange={(e) => setGpsSwapSubject(e.target.value)}
                        placeholder="GPS Module Swap Verzoek - {brand} {model} ({licensePlate})"
                        className="mt-1"
                        data-testid="input-gps-swap-subject"
                      />
                    </div>
                    <div>
                      <Label htmlFor="gpsSwapMessage">Message</Label>
                      <Textarea
                        id="gpsSwapMessage"
                        value={gpsSwapMessage}
                        onChange={(e) => setGpsSwapMessage(e.target.value)}
                        placeholder="Enter GPS swap message template..."
                        rows={6}
                        className="mt-1 font-mono text-sm"
                        data-testid="textarea-gps-swap-message"
                      />
                    </div>
                  </div>
                </div>

                {/* Save Button */}
                <Button
                  onClick={() => saveGpsTemplates.mutate()}
                  disabled={saveGpsTemplates.isPending}
                  className="w-full"
                  data-testid="button-save-gps-templates"
                >
                  {saveGpsTemplates.isPending ? "Saving..." : "Save GPS Email Templates"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <ConfirmDialog
        open={deleteEmailDialogOpen}
        onOpenChange={setDeleteEmailDialogOpen}
        title="Delete Email Configuration"
        description="Are you sure you want to delete this email configuration? This action cannot be undone."
        variant="danger"
        confirmLabel="Delete"
        onConfirm={confirmDeleteEmailConfig}
        onCancel={() => setEmailConfigToDelete(null)}
      />
    </div>
  );
}

// Contract Number Settings Component
function ContractNumberSettings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [contractNumberStart, setContractNumberStart] = useState("");
  const [nextContractNumber, setNextContractNumber] = useState("");
  const [overrideInput, setOverrideInput] = useState("");
  const [conflictWarning, setConflictWarning] = useState<{ count: number; conflicts: string[] } | null>(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  // Fetch settings
  const { data: settings, isLoading } = useQuery({
    queryKey: ["/api/system-settings"],
    queryFn: async () => {
      const response = await fetch("/api/system-settings");
      if (!response.ok) throw new Error("Failed to fetch settings");
      return response.json();
    },
  });

  // Fetch next contract number
  const { data: nextNumber, refetch: refetchNextNumber } = useQuery({
    queryKey: ["/api/settings/next-contract-number"],
    queryFn: async () => {
      const response = await fetch("/api/settings/next-contract-number");
      if (!response.ok) throw new Error("Failed to fetch next contract number");
      return response.json();
    },
  });

  // Update settings mutation
  const updateSettings = useMutation({
    mutationFn: async (data: { contractNumberStart: number }) => {
      return apiRequest("PUT", "/api/system-settings", data);
    },
    onSuccess: () => {
      toast({
        title: "Settings Updated",
        description: "Contract number start value has been updated successfully.",
      });
      invalidateByPrefix("/api/system-settings");
      invalidateByPrefix("/api/settings/next-contract-number");
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to update settings. Please try again.",
        variant: "destructive",
      });
      console.error("Error updating settings:", error);
    },
  });

  // Check conflicts mutation
  const checkConflicts = useMutation({
    mutationFn: async (proposedNumber: number) => {
      const response = await fetch(`/api/settings/contract-number-conflicts/${proposedNumber}`);
      if (!response.ok) throw new Error("Failed to check conflicts");
      return response.json();
    },
    onSuccess: (data) => {
      if (data.hasConflicts) {
        setConflictWarning({ count: data.count, conflicts: data.conflicts.slice(0, 5) });
      } else {
        setConflictWarning(null);
      }
    },
  });

  // Set override mutation
  const setOverride = useMutation({
    mutationFn: async (overrideNumber: number) => {
      return apiRequest("POST", "/api/settings/contract-number-override", { overrideNumber });
    },
    onSuccess: (data: any) => {
      toast({
        title: "Override Set",
        description: data.message || `Next contract number is now ${data.nextContractNumber}`,
      });
      invalidateByPrefix("/api/system-settings");
      invalidateByPrefix("/api/settings/next-contract-number");
      setOverrideInput("");
      setConflictWarning(null);
      setShowConfirmDialog(false);
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to set override. Please try again.",
        variant: "destructive",
      });
      console.error("Error setting override:", error);
    },
  });

  // Clear override mutation
  const clearOverride = useMutation({
    mutationFn: async () => {
      return apiRequest("DELETE", "/api/settings/contract-number-override");
    },
    onSuccess: (data: any) => {
      toast({
        title: "Override Cleared",
        description: data.message || "Now using automatic contract numbering",
      });
      invalidateByPrefix("/api/system-settings");
      invalidateByPrefix("/api/settings/next-contract-number");
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to clear override. Please try again.",
        variant: "destructive",
      });
      console.error("Error clearing override:", error);
    },
  });

  // Set initial values when data loads
  useEffect(() => {
    if (settings) {
      setContractNumberStart(String(settings.contractNumberStart || 1));
    }
  }, [settings]);

  useEffect(() => {
    if (nextNumber) {
      setNextContractNumber(nextNumber.contractNumber || "");
    }
  }, [nextNumber]);

  // Check for conflicts when override input changes
  useEffect(() => {
    const num = parseInt(overrideInput, 10);
    if (!isNaN(num) && num > 0) {
      const timer = setTimeout(() => {
        checkConflicts.mutate(num);
      }, 500);
      return () => clearTimeout(timer);
    } else {
      setConflictWarning(null);
    }
  }, [overrideInput]);

  const handleSave = () => {
    const startNum = parseInt(contractNumberStart);
    if (isNaN(startNum) || startNum < 1) {
      toast({
        title: "Invalid Value",
        description: "Please enter a valid number greater than 0.",
        variant: "destructive",
      });
      return;
    }
    updateSettings.mutate({ contractNumberStart: startNum });
  };

  const handleSetOverride = () => {
    const num = parseInt(overrideInput, 10);
    if (isNaN(num) || num < 1) {
      toast({
        title: "Invalid Value",
        description: "Please enter a valid positive number.",
        variant: "destructive",
      });
      return;
    }
    
    // If there are conflicts, show confirmation dialog
    if (conflictWarning && conflictWarning.count > 0) {
      setShowConfirmDialog(true);
    } else {
      setOverride.mutate(num);
    }
  };

  const handleConfirmOverride = () => {
    const num = parseInt(overrideInput, 10);
    setOverride.mutate(num);
  };

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Loading...</div>;
  }

  const hasActiveOverride = settings?.contractNumberOverride !== null && settings?.contractNumberOverride !== undefined;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="contractNumberStart">Starting Contract Number</Label>
          <Input
            id="contractNumberStart"
            type="number"
            min="1"
            value={contractNumberStart}
            onChange={(e) => setContractNumberStart(e.target.value)}
            placeholder="1"
            data-testid="input-contract-number-start"
          />
          <p className="text-xs text-gray-500 mt-1">
            This will be the base for auto-generated contract numbers
          </p>
        </div>
        <div>
          <Label>Next Contract Number</Label>
          <div className="flex h-10 w-full rounded-md border border-input bg-muted px-3 py-2 text-sm items-center justify-between">
            <span className="font-medium">{nextContractNumber || "Loading..."}</span>
            {hasActiveOverride && (
              <Badge variant="secondary" className="ml-2 bg-orange-100 text-orange-800">
                Override Active
              </Badge>
            )}
          </div>
          <p className="text-xs text-gray-500 mt-1">
            This will be assigned to the next new reservation
          </p>
        </div>
      </div>

      <Button
        onClick={handleSave}
        disabled={updateSettings.isPending}
        className="w-full md:w-auto"
        data-testid="button-save-contract-settings"
      >
        {updateSettings.isPending ? "Saving..." : "Save Starting Number"}
      </Button>

      {/* Smart Override Section */}
      <div className="border-t pt-6">
        <h4 className="font-medium mb-4">Smart Override</h4>
        <p className="text-sm text-gray-600 mb-4">
          Manually set the next contract number. The system will warn you if this conflicts with existing contract numbers.
        </p>
        
        <div className="flex gap-2 items-start">
          <div className="flex-1">
            <Input
              type="number"
              min="1"
              value={overrideInput}
              onChange={(e) => setOverrideInput(e.target.value)}
              placeholder="Enter new contract number..."
              data-testid="input-contract-override"
            />
          </div>
          <Button
            onClick={handleSetOverride}
            disabled={!overrideInput || setOverride.isPending}
            data-testid="button-set-override"
          >
            {setOverride.isPending ? "Setting..." : "Set Override"}
          </Button>
          {hasActiveOverride && (
            <Button
              variant="outline"
              onClick={() => clearOverride.mutate()}
              disabled={clearOverride.isPending}
              data-testid="button-clear-override"
            >
              {clearOverride.isPending ? "Clearing..." : "Clear Override"}
            </Button>
          )}
        </div>

        {/* Conflict Warning */}
        {conflictWarning && conflictWarning.count > 0 && (
          <div className="mt-3 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <p className="text-sm text-yellow-800 font-medium">
              Warning: {conflictWarning.count} existing contract number{conflictWarning.count > 1 ? 's' : ''} may conflict
            </p>
            <p className="text-sm text-yellow-700 mt-1">
              Numbers that are equal or higher: {conflictWarning.conflicts.join(", ")}
              {conflictWarning.count > 5 ? ` and ${conflictWarning.count - 5} more...` : ""}
            </p>
            <p className="text-sm text-yellow-700 mt-2">
              You can still set this override, but future automatic numbering may create duplicates.
            </p>
          </div>
        )}

        {/* No conflicts message */}
        {overrideInput && !checkConflicts.isPending && !conflictWarning && parseInt(overrideInput, 10) > 0 && (
          <div className="mt-3 bg-green-50 border border-green-200 rounded-lg p-4">
            <p className="text-sm text-green-800">
              No conflicts found. This number is safe to use.
            </p>
          </div>
        )}
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="text-sm text-blue-800">
          <strong>Note:</strong> Contract numbers are generated sequentially. Without an override, the system uses the highest existing contract number + 1.
        </p>
      </div>

      {/* Confirmation Dialog */}
      <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Confirm Override</DialogTitle>
            <DialogDescription>
              There are {conflictWarning?.count} existing contract numbers that may conflict with this value.
              Are you sure you want to set the next contract number to {overrideInput}?
            </DialogDescription>
          </DialogHeader>
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 my-4">
            <p className="text-sm text-yellow-800">
              Conflicting numbers: {conflictWarning?.conflicts.join(", ")}
              {(conflictWarning?.count || 0) > 5 ? ` and ${(conflictWarning?.count || 0) - 5} more...` : ""}
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfirmDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleConfirmOverride} disabled={setOverride.isPending}>
              {setOverride.isPending ? "Setting..." : "Override Anyway"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
