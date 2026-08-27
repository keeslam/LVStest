import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
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
    smtpHost?: string;
    smtpPort?: string;
    smtpUser?: string;
    smtpPassword?: string;
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

export function SettingsPanel() {
  const { t } = useTranslation("settings");
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
  const [smtpHost, setSmtpHost] = useState("");
  const [smtpPort, setSmtpPort] = useState("");
  const [smtpUser, setSmtpUser] = useState("");
  const [smtpPassword, setSmtpPassword] = useState("");
  const [purpose, setPurpose] = useState<'apk' | 'maintenance' | 'gps' | 'documents' | 'custom' | 'default'>('default');
  const [smtpTestResult, setSmtpTestResult] = useState<{ success: boolean; userMessage: string; suggestion?: string } | null>(null);
  
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
  const [depotAddress, setDepotAddress] = useState("");
  const [depotCity, setDepotCity] = useState("");
  const [depotPostalCode, setDepotPostalCode] = useState("");
  
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
    depotAddress?: string | null;
    depotCity?: string | null;
    depotPostalCode?: string | null;
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
    setDepotAddress(systemSettings.depotAddress || "");
    setDepotCity(systemSettings.depotCity || "");
    setDepotPostalCode(systemSettings.depotPostalCode || "");
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
      toast({ title: t('common:status.success'), description: t('settingsPage.toasts.businessRulesSavedDescription') });
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
      toast({ title: t('common:status.success'), description: t('settingsPage.toasts.notificationPrefsSavedDescription') });
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
      toast({ title: t('common:status.success'), description: t('settingsPage.toasts.documentSettingsSavedDescription') });
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
      toast({ title: t('common:status.success'), description: t('settingsPage.toasts.calendarSettingsSavedDescription') });
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
      toast({ title: t('common:status.success'), description: t('settingsPage.toasts.maintenanceCalendarSavedDescription') });
    },
    onError: () => {
      toast({ title: t('common:status.error'), description: t('settingsPage.toasts.maintenanceCalendarSaveFailedDescription'), variant: "destructive" });
    },
  });

  // Save Toll Rate & Depot Settings (to /api/system-settings)
  const saveTollRateSettings = useMutation({
    mutationFn: async () => {
      await apiRequest('PUT', '/api/system-settings', {
        tollRatePerKm,
        depotAddress: depotAddress || null,
        depotCity: depotCity || null,
        depotPostalCode: depotPostalCode || null,
      });
    },
    onSuccess: () => {
      invalidateByPrefix('/api/system-settings');
      toast({ title: t('common:status.success'), description: t('settingsPage.toasts.transportSettingsSavedDescription') });
    },
    onError: () => {
      toast({ title: t('common:status.error'), description: t('settingsPage.toasts.transportSettingsSaveFailedDescription'), variant: "destructive" });
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
      toast({ title: t('common:status.success'), description: t('settingsPage.toasts.docEmailTemplatesSavedDescription') });
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
      toast({ title: t('common:status.success'), description: t('settingsPage.toasts.gpsRecipientSavedDescription') });
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
      toast({ title: t('common:status.success'), description: t('settingsPage.toasts.gpsTemplatesSavedDescription') });
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
        title: t('common:status.success'),
        description: editingEmail ? t('settingsPage.toasts.emailConfigUpdatedDescription') : t('settingsPage.toasts.emailConfigSavedDescription'),
      });
      setIsEmailDialogOpen(false);
      resetEmailForm();
    },
  });

  const testSmtpConnectionMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/app-settings/email/test', {
        smtpHost,
        smtpPort,
        smtpUser,
        smtpPassword,
      });
      return response.json();
    },
    onSuccess: (result) => {
      setSmtpTestResult(result);
    },
    onError: (error: any) => {
      setSmtpTestResult({ success: false, userMessage: error.message || t('settingsPage.email.testConnectionErrorFallback') });
    },
  });

  const resetEmailForm = () => {
    setEditingEmail(null);
    setFromEmail("");
    setFromName("");
    setSmtpHost("");
    setSmtpPort("");
    setSmtpUser("");
    setSmtpPassword("");
    setPurpose('default');
    setSmtpTestResult(null);
  };

  const handleOpenEmailDialog = (email?: EmailSetting) => {
    if (email) {
      setEditingEmail(email);
      setFromEmail(email.value.fromEmail || "");
      setFromName(email.value.fromName || "");
      setSmtpHost(email.value.smtpHost || "");
      setSmtpPort(email.value.smtpPort || "");
      setSmtpUser(email.value.smtpUser || "");
      setSmtpPassword(email.value.smtpPassword || "");
      setPurpose(email.value.purpose || 'default');
    } else {
      resetEmailForm();
    }
    setIsEmailDialogOpen(true);
  };

  const handleSaveEmail = () => {
    const emailData = {
      key: `email_${purpose}`,
      category: 'email',
      value: {
        fromEmail,
        fromName,
        purpose,
        smtpHost,
        smtpPort,
        smtpUser,
        smtpPassword,
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
        title: t('common:status.success'),
        description: t('settingsPage.toasts.emailConfigDeletedDescription')
      });
    } catch (error: any) {
      toast({
        title: t('common:status.error'),
        description: error.message || t('settingsPage.toasts.emailConfigDeleteFailedDescription'),
        variant: "destructive"
      });
    }
    setEmailConfigToDelete(null);
  };

  // Holiday management
  const handleAddHoliday = () => {
    if (!newHolidayDate || !newHolidayName) {
      toast({ title: t('common:status.error'), description: t('settingsPage.toasts.holidayFieldsRequiredDescription'), variant: "destructive" });
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
      toast({ title: t('common:status.error'), description: t('settingsPage.toasts.blockedDateFieldsRequiredDescription'), variant: "destructive" });
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
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <SettingsIcon className="h-8 w-8" />
          {t('settingsPage.header.title')}
        </h1>
        <p className="text-gray-500 mt-2">{t('settingsPage.header.subtitle')}</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-6 lg:w-auto lg:inline-grid">
          <TabsTrigger value="business" className="gap-2">
            <Building2 className="h-4 w-4" />
            <span className="hidden sm:inline">{t('settingsPage.tabs.business')}</span>
            <span className="sm:hidden">{t('settingsPage.tabs.businessShort')}</span>
          </TabsTrigger>
          <TabsTrigger value="notifications" className="gap-2">
            <Bell className="h-4 w-4" />
            <span className="hidden sm:inline">{t('settingsPage.tabs.notifications')}</span>
            <span className="sm:hidden">{t('settingsPage.tabs.notificationsShort')}</span>
          </TabsTrigger>
          <TabsTrigger value="documents" className="gap-2">
            <FileText className="h-4 w-4" />
            <span className="hidden sm:inline">{t('settingsPage.tabs.documents')}</span>
            <span className="sm:hidden">{t('settingsPage.tabs.documentsShort')}</span>
          </TabsTrigger>
          <TabsTrigger value="doc-emails" className="gap-2">
            <Mail className="h-4 w-4" />
            <span className="hidden sm:inline">{t('settingsPage.tabs.docEmails')}</span>
            <span className="sm:hidden">{t('settingsPage.tabs.docEmailsShort')}</span>
          </TabsTrigger>
          <TabsTrigger value="calendar" className="gap-2">
            <CalendarIcon className="h-4 w-4" />
            <span className="hidden sm:inline">{t('settingsPage.tabs.calendar')}</span>
            <span className="sm:hidden">{t('settingsPage.tabs.calendarShort')}</span>
          </TabsTrigger>
          <TabsTrigger value="email" className="gap-2">
            <Mail className="h-4 w-4" />
            <span className="hidden sm:inline">{t('settingsPage.tabs.email')}</span>
            <span className="sm:hidden">{t('settingsPage.tabs.emailShort')}</span>
          </TabsTrigger>
        </TabsList>

        {/* Business Rules Tab */}
        <TabsContent value="business" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="h-5 w-5" />
                {t('settingsPage.business.rentalDefaultsTitle')}
              </CardTitle>
              <CardDescription>
                {t('settingsPage.business.rentalDefaultsDescription')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="defaultDuration">{t('settingsPage.business.defaultDurationLabel')}</Label>
                  <Input
                    id="defaultDuration"
                    type="number"
                    min="1"
                    value={defaultRentalDuration}
                    onChange={(e) => setDefaultRentalDuration(e.target.value)}
                    data-testid="input-default-rental-duration"
                  />
                  <p className="text-xs text-gray-500 mt-1">{t('settingsPage.business.defaultDurationHint')}</p>
                </div>
                <div>
                  <Label htmlFor="fuelPolicy">{t('settingsPage.business.fuelPolicyLabel')}</Label>
                  <select
                    id="fuelPolicy"
                    value={defaultFuelPolicy}
                    onChange={(e) => setDefaultFuelPolicy(e.target.value)}
                    className="w-full mt-1 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
                    data-testid="select-fuel-policy"
                  >
                    <option value="full-to-full">{t('settingsPage.business.fuelPolicyFullToFull')}</option>
                    <option value="same-to-same">{t('settingsPage.business.fuelPolicySameToSame')}</option>
                    <option value="prepaid">{t('settingsPage.business.fuelPolicyPrepaid')}</option>
                  </select>
                  <p className="text-xs text-gray-500 mt-1">{t('settingsPage.business.fuelPolicyHint')}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="eigenrisicoBinnenland">{t('settingsPage.business.eigenrisicoBinnenlandLabel')}</Label>
                  <Input
                    id="eigenrisicoBinnenland"
                    type="number"
                    min="0"
                    step="0.01"
                    value={eigenrisicoBinnenland}
                    onChange={(e) => setEigenrisicoBinnenland(e.target.value)}
                    data-testid="input-eigenrisico-binnenland"
                  />
                  <p className="text-xs text-gray-500 mt-1">{t('settingsPage.business.eigenrisicoBinnenlandHint')}</p>
                </div>
                <div>
                  <Label htmlFor="eigenrisicoBuitenland">{t('settingsPage.business.eigenrisicoBuitenlandLabel')}</Label>
                  <Input
                    id="eigenrisicoBuitenland"
                    type="number"
                    min="0"
                    step="0.01"
                    value={eigenrisicoBuitenland}
                    onChange={(e) => setEigenrisicoBuitenland(e.target.value)}
                    data-testid="input-eigenrisico-buitenland"
                  />
                  <p className="text-xs text-gray-500 mt-1">{t('settingsPage.business.eigenrisicoBuitenlandHint')}</p>
                </div>
              </div>

              <Button
                onClick={() => saveBusinessRules.mutate()}
                disabled={saveBusinessRules.isPending}
                className="w-full md:w-auto"
                data-testid="button-save-business-rules"
              >
                {saveBusinessRules.isPending ? t('common:status.saving') : t('settingsPage.business.saveBusinessRulesButton')}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="h-5 w-5" />
                {t('settingsPage.business.transportTitle')}
              </CardTitle>
              <CardDescription>
                {t('settingsPage.business.transportDescription')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="tollRatePerKm">{t('settingsPage.business.tollRateLabel')}</Label>
                  <Input
                    id="tollRatePerKm"
                    type="number"
                    min="0"
                    step="0.01"
                    value={tollRatePerKm}
                    onChange={(e) => setTollRatePerKm(e.target.value)}
                    data-testid="input-toll-rate-per-km"
                  />
                  <p className="text-xs text-gray-500 mt-1">{t('settingsPage.business.tollRateHint')}</p>
                </div>
              </div>

              <div className="space-y-1">
                <Label>{t('settingsPage.business.depotAddressLabel')}</Label>
                <p className="text-xs text-gray-500">{t('settingsPage.business.depotAddressHint')}</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                  <Input
                    placeholder={t('settingsPage.business.streetAddressPlaceholder')}
                    value={depotAddress}
                    onChange={(e) => setDepotAddress(e.target.value)}
                    data-testid="input-depot-address"
                  />
                  <Input
                    placeholder={t('settingsPage.business.cityPlaceholder')}
                    value={depotCity}
                    onChange={(e) => setDepotCity(e.target.value)}
                    data-testid="input-depot-city"
                  />
                </div>
                <Input
                  placeholder={t('settingsPage.business.postalCodePlaceholder')}
                  value={depotPostalCode}
                  onChange={(e) => setDepotPostalCode(e.target.value)}
                  className="max-w-[200px]"
                  data-testid="input-depot-postal-code"
                />
              </div>

              <Button
                onClick={() => saveTollRateSettings.mutate()}
                disabled={saveTollRateSettings.isPending}
                className="w-full md:w-auto"
                data-testid="button-save-toll-rate"
              >
                {saveTollRateSettings.isPending ? t('common:status.saving') : t('settingsPage.business.saveSettingsButton')}
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
                {t('settingsPage.notifications.reminderTimingTitle')}
              </CardTitle>
              <CardDescription>
                {t('settingsPage.notifications.reminderTimingDescription')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="apkReminder">{t('settingsPage.notifications.apkReminderLabel')}</Label>
                  <Input
                    id="apkReminder"
                    type="number"
                    min="1"
                    value={apkReminderDays}
                    onChange={(e) => setApkReminderDays(e.target.value)}
                    data-testid="input-apk-reminder-days"
                  />
                  <p className="text-xs text-gray-500 mt-1">{t('settingsPage.notifications.apkReminderHint')}</p>
                </div>
                <div>
                  <Label htmlFor="warrantyReminder">{t('settingsPage.notifications.warrantyReminderLabel')}</Label>
                  <Input
                    id="warrantyReminder"
                    type="number"
                    min="1"
                    value={warrantyReminderDays}
                    onChange={(e) => setWarrantyReminderDays(e.target.value)}
                    data-testid="input-warranty-reminder-days"
                  />
                  <p className="text-xs text-gray-500 mt-1">{t('settingsPage.notifications.warrantyReminderHint')}</p>
                </div>
                <div>
                  <Label htmlFor="maintenanceReminder">{t('settingsPage.notifications.maintenanceReminderLabel')}</Label>
                  <Input
                    id="maintenanceReminder"
                    type="number"
                    min="1"
                    value={maintenanceReminderDays}
                    onChange={(e) => setMaintenanceReminderDays(e.target.value)}
                    data-testid="input-maintenance-reminder-days"
                  />
                  <p className="text-xs text-gray-500 mt-1">{t('settingsPage.notifications.maintenanceReminderHint')}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="h-5 w-5" />
                {t('settingsPage.notifications.preferencesTitle')}
              </CardTitle>
              <CardDescription>
                {t('settingsPage.notifications.preferencesDescription')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>{t('settingsPage.notifications.emailNotificationsLabel')}</Label>
                  <p className="text-sm text-gray-500">{t('settingsPage.notifications.emailNotificationsHint')}</p>
                </div>
                <Switch
                  checked={emailNotificationsEnabled}
                  onCheckedChange={setEmailNotificationsEnabled}
                  data-testid="switch-email-notifications"
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>{t('settingsPage.notifications.realtimeSoundLabel')}</Label>
                  <p className="text-sm text-gray-500">{t('settingsPage.notifications.realtimeSoundHint')}</p>
                </div>
                <Switch
                  checked={realtimeSoundEnabled}
                  onCheckedChange={setRealtimeSoundEnabled}
                  data-testid="switch-realtime-sound"
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>{t('settingsPage.notifications.newReservationLabel')}</Label>
                  <p className="text-sm text-gray-500">{t('settingsPage.notifications.newReservationHint')}</p>
                </div>
                <Switch
                  checked={notifyOnNewReservation}
                  onCheckedChange={setNotifyOnNewReservation}
                  data-testid="switch-notify-new-reservation"
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>{t('settingsPage.notifications.vehicleReturnLabel')}</Label>
                  <p className="text-sm text-gray-500">{t('settingsPage.notifications.vehicleReturnHint')}</p>
                </div>
                <Switch
                  checked={notifyOnVehicleReturn}
                  onCheckedChange={setNotifyOnVehicleReturn}
                  data-testid="switch-notify-vehicle-return"
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>{t('settingsPage.notifications.maintenanceDueLabel')}</Label>
                  <p className="text-sm text-gray-500">{t('settingsPage.notifications.maintenanceDueHint')}</p>
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
                {saveNotificationPrefs.isPending ? t('common:status.saving') : t('settingsPage.notifications.savePreferencesButton')}
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
                {t('settingsPage.documents.invoiceContractTitle')}
              </CardTitle>
              <CardDescription>
                {t('settingsPage.documents.invoiceContractDescription')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="invoiceFormat">{t('settingsPage.documents.invoiceFormatLabel')}</Label>
                  <Input
                    id="invoiceFormat"
                    value={invoiceNumberFormat}
                    onChange={(e) => setInvoiceNumberFormat(e.target.value)}
                    placeholder="INV-{YEAR}-{NUMBER}"
                    data-testid="input-invoice-format"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    {t('settingsPage.documents.invoiceFormatHintPrefix')} {'{YEAR}'}, {'{MONTH}'}, {'{NUMBER}'} {t('settingsPage.documents.invoiceFormatHintSuffix')}
                  </p>
                </div>
                <div>
                  <Label htmlFor="invoiceStartNumber">{t('settingsPage.documents.invoiceStartNumberLabel')}</Label>
                  <Input
                    id="invoiceStartNumber"
                    type="number"
                    min="1"
                    value={invoiceStartingNumber}
                    onChange={(e) => setInvoiceStartingNumber(e.target.value)}
                    data-testid="input-invoice-start-number"
                  />
                  <p className="text-xs text-gray-500 mt-1">{t('settingsPage.documents.invoiceStartNumberHint')}</p>
                </div>
              </div>

              <div>
                <Label htmlFor="contractTerms">{t('settingsPage.documents.contractTermsLabel')}</Label>
                <Textarea
                  id="contractTerms"
                  value={contractTerms}
                  onChange={(e) => setContractTerms(e.target.value)}
                  rows={8}
                  placeholder={t('settingsPage.documents.contractTermsPlaceholder')}
                  data-testid="textarea-contract-terms"
                  className="font-mono text-sm"
                />
                <p className="text-xs text-gray-500 mt-1">{t('settingsPage.documents.contractTermsHint')}</p>
              </div>

              <div>
                <Label htmlFor="invoiceFooter">{t('settingsPage.documents.invoiceFooterLabel')}</Label>
                <Textarea
                  id="invoiceFooter"
                  value={invoiceFooter}
                  onChange={(e) => setInvoiceFooter(e.target.value)}
                  rows={4}
                  placeholder={t('settingsPage.documents.invoiceFooterPlaceholder')}
                  data-testid="textarea-invoice-footer"
                  className="font-mono text-sm"
                />
                <p className="text-xs text-gray-500 mt-1">{t('settingsPage.documents.invoiceFooterHint')}</p>
              </div>

              <Button
                onClick={() => saveDocumentSettings.mutate()}
                disabled={saveDocumentSettings.isPending}
                className="w-full md:w-auto"
                data-testid="button-save-document-settings"
              >
                {saveDocumentSettings.isPending ? t('common:status.saving') : t('settingsPage.documents.saveDocumentSettingsButton')}
              </Button>
            </CardContent>
          </Card>

          {/* Contract Number Settings Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileCheck className="h-5 w-5" />
                {t('settingsPage.documents.contractNumberCardTitle')}
              </CardTitle>
              <CardDescription>
                {t('settingsPage.documents.contractNumberCardDescription')}
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
                {t('settingsPage.docEmails.title')}
              </CardTitle>
              <CardDescription>
                {t('settingsPage.docEmails.description')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm text-blue-800">
                  <strong>{t('settingsPage.docEmails.placeholdersLabel')}</strong> {'{customerName}'}, {'{vehiclePlate}'}, {'{startDate}'}, {'{endDate}'}
                </p>
                <p className="text-xs text-blue-600 mt-1">
                  {t('settingsPage.docEmails.placeholdersHint')}
                </p>
              </div>

              <Tabs defaultValue="en" className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="en">{t('settingsPage.docEmails.englishTemplatesTab')}</TabsTrigger>
                  <TabsTrigger value="nl">{t('settingsPage.docEmails.dutchTemplatesTab')}</TabsTrigger>
                </TabsList>

                {/* English Templates */}
                <TabsContent value="en" className="space-y-6 mt-6">
                  {/* Contract Email - English */}
                  <div className="space-y-4 border rounded-lg p-4 bg-gray-50">
                    <h4 className="font-semibold text-lg flex items-center gap-2">
                      <FileText className="h-4 w-4" />
                      {t('settingsPage.docEmails.contractEmailEnglishTitle')}
                    </h4>
                    <div className="space-y-3">
                      <div>
                        <Label htmlFor="contract-en-subject">{t('settingsPage.docEmails.subjectLineLabel')}</Label>
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
                          placeholder={t('settingsPage.docEmails.emailSubjectPlaceholder')}
                          data-testid="input-contract-en-subject"
                        />
                      </div>
                      <div>
                        <Label htmlFor="contract-en-message">{t('settingsPage.docEmails.emailMessageLabel')}</Label>
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
                          placeholder={t('settingsPage.docEmails.emailMessageBodyPlaceholder')}
                          data-testid="textarea-contract-en-message"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Damage Check Email - English */}
                  <div className="space-y-4 border rounded-lg p-4 bg-gray-50">
                    <h4 className="font-semibold text-lg flex items-center gap-2">
                      <FileCheck className="h-4 w-4" />
                      {t('settingsPage.docEmails.damageEmailEnglishTitle')}
                    </h4>
                    <div className="space-y-3">
                      <div>
                        <Label htmlFor="damage-en-subject">{t('settingsPage.docEmails.subjectLineLabel')}</Label>
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
                          placeholder={t('settingsPage.docEmails.emailSubjectPlaceholder')}
                          data-testid="input-damage-en-subject"
                        />
                      </div>
                      <div>
                        <Label htmlFor="damage-en-message">{t('settingsPage.docEmails.emailMessageLabel')}</Label>
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
                          placeholder={t('settingsPage.docEmails.emailMessageBodyPlaceholder')}
                          data-testid="textarea-damage-en-message"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Combined Documents Email - English */}
                  <div className="space-y-4 border rounded-lg p-4 bg-indigo-50">
                    <h4 className="font-semibold text-lg flex items-center gap-2">
                      <FileText className="h-4 w-4" />
                      {t('settingsPage.docEmails.combinedEmailEnglishTitle')}
                    </h4>
                    <p className="text-sm text-gray-600">{t('settingsPage.docEmails.combinedUsedHint')}</p>
                    <div className="space-y-3">
                      <div>
                        <Label htmlFor="combined-en-subject">{t('settingsPage.docEmails.subjectLineLabel')}</Label>
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
                          placeholder={t('settingsPage.docEmails.emailSubjectPlaceholder')}
                          data-testid="input-combined-en-subject"
                        />
                      </div>
                      <div>
                        <Label htmlFor="combined-en-message">{t('settingsPage.docEmails.emailMessageLabel')}</Label>
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
                          placeholder={t('settingsPage.docEmails.emailMessagePlaceholder')}
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
                      {t('settingsPage.docEmails.contractEmailDutchTitle')}
                    </h4>
                    <div className="space-y-3">
                      <div>
                        <Label htmlFor="contract-nl-subject">{t('settingsPage.docEmails.subjectLineLabel')}</Label>
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
                          placeholder={t('settingsPage.docEmails.emailSubjectPlaceholder')}
                          data-testid="input-contract-nl-subject"
                        />
                      </div>
                      <div>
                        <Label htmlFor="contract-nl-message">{t('settingsPage.docEmails.emailMessageLabel')}</Label>
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
                          placeholder={t('settingsPage.docEmails.emailMessageBodyPlaceholder')}
                          data-testid="textarea-contract-nl-message"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Damage Check Email - Dutch */}
                  <div className="space-y-4 border rounded-lg p-4 bg-gray-50">
                    <h4 className="font-semibold text-lg flex items-center gap-2">
                      <FileCheck className="h-4 w-4" />
                      {t('settingsPage.docEmails.damageEmailDutchTitle')}
                    </h4>
                    <div className="space-y-3">
                      <div>
                        <Label htmlFor="damage-nl-subject">{t('settingsPage.docEmails.subjectLineLabel')}</Label>
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
                          placeholder={t('settingsPage.docEmails.emailSubjectPlaceholder')}
                          data-testid="input-damage-nl-subject"
                        />
                      </div>
                      <div>
                        <Label htmlFor="damage-nl-message">{t('settingsPage.docEmails.emailMessageLabel')}</Label>
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
                          placeholder={t('settingsPage.docEmails.emailMessageBodyPlaceholder')}
                          data-testid="textarea-damage-nl-message"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Combined Documents Email - Dutch */}
                  <div className="space-y-4 border rounded-lg p-4 bg-indigo-50">
                    <h4 className="font-semibold text-lg flex items-center gap-2">
                      <FileText className="h-4 w-4" />
                      {t('settingsPage.docEmails.combinedEmailDutchTitle')}
                    </h4>
                    <p className="text-sm text-gray-600">{t('settingsPage.docEmails.combinedUsedHintDutchTab')}</p>
                    <div className="space-y-3">
                      <div>
                        <Label htmlFor="combined-nl-subject">{t('settingsPage.docEmails.subjectLineLabel')}</Label>
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
                          placeholder={t('settingsPage.docEmails.emailSubjectPlaceholder')}
                          data-testid="input-combined-nl-subject"
                        />
                      </div>
                      <div>
                        <Label htmlFor="combined-nl-message">{t('settingsPage.docEmails.emailMessageLabel')}</Label>
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
                          placeholder={t('settingsPage.docEmails.emailMessageBodyPlaceholder')}
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
                {saveDocumentEmailTemplates.isPending ? t('common:status.saving') : t('settingsPage.docEmails.saveEmailTemplatesButton')}
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
                {t('settingsPage.calendar.holidaysBlockedDatesTitle')}
              </CardTitle>
              <CardDescription>
                {t('settingsPage.calendar.holidaysBlockedDatesDescription')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Dutch National Holidays */}
              <div>
                <h4 className="font-medium text-sm mb-3">{t('settingsPage.calendar.dutchHolidaysTitle')}</h4>
                <p className="text-xs text-gray-500 mb-4">
                  {t('settingsPage.calendar.dutchHolidaysHint', { year: currentYear })}
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
                            <span className="block text-xs text-blue-600">{t('settingsPage.calendar.manualOverrideBadge')}</span>
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
                              title={t('settingsPage.calendar.resetTitleHint', { date: holiday.calculatedDate })}
                              data-testid={`button-reset-holiday-${key}`}
                            >
                              {t('settingsPage.calendar.resetButton')}
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
                <h4 className="font-medium text-sm mb-3">{t('settingsPage.calendar.customHolidaysTitle')}</h4>
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
                    <p className="text-sm text-gray-500 text-center py-4">{t('settingsPage.calendar.noHolidaysDefined')}</p>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <Input
                    type="date"
                    value={newHolidayDate}
                    onChange={(e) => setNewHolidayDate(e.target.value)}
                    placeholder={t('settingsPage.calendar.datePlaceholder')}
                    data-testid="input-new-holiday-date"
                  />
                  <Input
                    value={newHolidayName}
                    onChange={(e) => setNewHolidayName(e.target.value)}
                    placeholder={t('settingsPage.calendar.holidayNamePlaceholder')}
                    data-testid="input-new-holiday-name"
                  />
                  <Button onClick={handleAddHoliday} data-testid="button-add-holiday">
                    <Plus className="h-4 w-4 mr-2" />
                    {t('settingsPage.calendar.addHolidayButton')}
                  </Button>
                </div>
              </div>

              <div className="border-t pt-6">
                <h4 className="font-medium text-sm mb-3">{t('settingsPage.calendar.blockedDatesTitle')}</h4>
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
                    <p className="text-sm text-gray-500 text-center py-4">{t('settingsPage.calendar.noBlockedDatesDefined')}</p>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <Input
                    type="date"
                    value={newBlockedStart}
                    onChange={(e) => setNewBlockedStart(e.target.value)}
                    placeholder={t('settingsPage.calendar.startDatePlaceholder')}
                    data-testid="input-new-blocked-start"
                  />
                  <Input
                    type="date"
                    value={newBlockedEnd}
                    onChange={(e) => setNewBlockedEnd(e.target.value)}
                    placeholder={t('settingsPage.calendar.endDatePlaceholder')}
                    data-testid="input-new-blocked-end"
                  />
                  <Input
                    value={newBlockedReason}
                    onChange={(e) => setNewBlockedReason(e.target.value)}
                    placeholder={t('settingsPage.calendar.reasonPlaceholder')}
                    data-testid="input-new-blocked-reason"
                  />
                  <Button onClick={handleAddBlockedDate} data-testid="button-add-blocked">
                    <Plus className="h-4 w-4 mr-2" />
                    {t('settingsPage.calendar.addClosureButton')}
                  </Button>
                </div>
              </div>

              <div className="border-t pt-6">
                <h4 className="font-medium text-sm mb-3">{t('settingsPage.calendar.defaultSettingsTitle')}</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="defaultMaintenanceDuration">{t('settingsPage.calendar.defaultMaintenanceDurationLabel')}</Label>
                    <Input
                      id="defaultMaintenanceDuration"
                      type="number"
                      min="1"
                      value={defaultMaintenanceDuration}
                      onChange={(e) => setDefaultMaintenanceDuration(e.target.value)}
                      data-testid="input-default-maintenance-duration"
                    />
                    <p className="text-xs text-gray-500 mt-1">{t('settingsPage.calendar.defaultMaintenanceDurationHint')}</p>
                  </div>
                  <div>
                    <Label htmlFor="reservationReminder">{t('settingsPage.calendar.reservationReminderLabel')}</Label>
                    <Input
                      id="reservationReminder"
                      type="number"
                      min="1"
                      value={reservationReminderHours}
                      onChange={(e) => setReservationReminderHours(e.target.value)}
                      data-testid="input-reservation-reminder-hours"
                    />
                    <p className="text-xs text-gray-500 mt-1">{t('settingsPage.calendar.reservationReminderHint')}</p>
                  </div>
                </div>
              </div>

              <Button
                onClick={() => saveCalendarSettings.mutate()}
                disabled={saveCalendarSettings.isPending}
                className="w-full md:w-auto"
                data-testid="button-save-calendar-settings"
              >
                {saveCalendarSettings.isPending ? t('common:status.saving') : t('settingsPage.calendar.saveCalendarSettingsButton')}
              </Button>
            </CardContent>
          </Card>

          {/* Maintenance Calendar Settings Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <SettingsIcon className="h-5 w-5" />
                {t('settingsPage.calendar.maintenanceDisplayTitle')}
              </CardTitle>
              <CardDescription>
                {t('settingsPage.calendar.maintenanceDisplayDescription')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Vehicle Status Exclusions */}
              <div>
                <h4 className="font-medium text-sm mb-3">{t('settingsPage.calendar.excludeVehiclesTitle')}</h4>
                <p className="text-xs text-gray-500 mb-4">
                  {t('settingsPage.calendar.excludeVehiclesHint')}
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
                    <Label htmlFor="exclude-not-for-rental">{t('settingsPage.calendar.notForRentalLabel')}</Label>
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
                    <Label htmlFor="exclude-needs-fixing">{t('settingsPage.calendar.needsFixingLabel')}</Label>
                  </div>
                </div>
              </div>

              <div className="border-t pt-6">
                <h4 className="font-medium text-sm mb-3">{t('settingsPage.calendar.reminderVisibilityTitle')}</h4>
                <p className="text-xs text-gray-500 mb-4">
                  {t('settingsPage.calendar.reminderVisibilityHint')}
                </p>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>{t('settingsPage.calendar.apkRemindersLabel')}</Label>
                      <p className="text-sm text-gray-500">{t('settingsPage.calendar.apkRemindersHint')}</p>
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
                        <span className="text-sm text-gray-500">{t('common:units.days')}</span>
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
                      <Label>{t('settingsPage.calendar.warrantyRemindersLabel')}</Label>
                      <p className="text-sm text-gray-500">{t('settingsPage.calendar.warrantyRemindersHint')}</p>
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
                        <span className="text-sm text-gray-500">{t('common:units.days')}</span>
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
                      <Label>{t('settingsPage.calendar.maintenanceBlocksLabel')}</Label>
                      <p className="text-sm text-gray-500">{t('settingsPage.calendar.maintenanceBlocksHint')}</p>
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
                {saveMaintenanceCalendarSettings.isPending ? t('common:status.saving') : t('settingsPage.calendar.saveMaintenanceSettingsButton')}
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
                    {t('settingsPage.email.configurationTitle')}
                  </CardTitle>
                  <CardDescription>
                    {t('settingsPage.email.configurationDescription')}
                  </CardDescription>
                </div>
                <Dialog open={isEmailDialogOpen} onOpenChange={setIsEmailDialogOpen}>
                  <DialogTrigger asChild>
                    <Button onClick={() => handleOpenEmailDialog()} data-testid="button-add-email-config">
                      <Plus className="h-4 w-4 mr-2" />
                      {t('settingsPage.email.addConfigButton')}
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>
                        {editingEmail ? t('settingsPage.email.editConfigDialogTitle') : t('settingsPage.email.addConfigDialogTitle')}
                      </DialogTitle>
                      <DialogDescription>
                        {t('settingsPage.email.configDialogDescription')}
                      </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-4">
                      <div>
                        <Label htmlFor="purpose">{t('settingsPage.email.purposeLabel')}</Label>
                        <select
                          id="purpose"
                          value={purpose}
                          onChange={(e) => setPurpose(e.target.value as any)}
                          className="w-full mt-1 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
                          data-testid="select-email-purpose"
                        >
                          {EMAIL_PURPOSES.map(p => (
                            <option key={p.value} value={p.value}>{t(`settingsPage.email.purposes.${p.value}.label`)}</option>
                          ))}
                        </select>
                        <p className="text-xs text-gray-500 mt-1">
                          {t(`settingsPage.email.purposes.${purpose}.description`)}
                        </p>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor="fromEmail">{t('settingsPage.email.fromEmailLabel')}</Label>
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
                          <Label htmlFor="fromName">{t('settingsPage.email.fromNameLabel')}</Label>
                          <Input
                            id="fromName"
                            value={fromName}
                            onChange={(e) => setFromName(e.target.value)}
                            placeholder="Auto Lease LAM"
                            data-testid="input-from-name"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor="smtpHost">{t('settingsPage.email.smtpHostLabel')}</Label>
                          <Input
                            id="smtpHost"
                            value={smtpHost}
                            onChange={(e) => { setSmtpHost(e.target.value); setSmtpTestResult(null); }}
                            placeholder="smtp.example.com"
                            data-testid="input-smtp-host"
                          />
                        </div>
                        <div>
                          <Label htmlFor="smtpPort">{t('settingsPage.email.smtpPortLabel')}</Label>
                          <Input
                            id="smtpPort"
                            value={smtpPort}
                            onChange={(e) => { setSmtpPort(e.target.value); setSmtpTestResult(null); }}
                            placeholder="587"
                            data-testid="input-smtp-port"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor="smtpUser">{t('settingsPage.email.smtpUsernameLabel')}</Label>
                          <Input
                            id="smtpUser"
                            value={smtpUser}
                            onChange={(e) => { setSmtpUser(e.target.value); setSmtpTestResult(null); }}
                            placeholder={t('settingsPage.email.usernamePlaceholder')}
                            data-testid="input-smtp-user"
                          />
                        </div>
                        <div>
                          <Label htmlFor="smtpPassword">{t('settingsPage.email.smtpPasswordLabel')}</Label>
                          <Input
                            id="smtpPassword"
                            type="password"
                            value={smtpPassword}
                            onChange={(e) => { setSmtpPassword(e.target.value); setSmtpTestResult(null); }}
                            placeholder={t('settingsPage.email.passwordPlaceholder')}
                            data-testid="input-smtp-password"
                          />
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => { setSmtpTestResult(null); testSmtpConnectionMutation.mutate(); }}
                          disabled={!smtpHost || !smtpUser || !smtpPassword || testSmtpConnectionMutation.isPending}
                          data-testid="button-test-smtp-connection"
                        >
                          {testSmtpConnectionMutation.isPending ? t('settingsPage.email.testingConnection') : t('settingsPage.email.testConnectionButton')}
                        </Button>
                        {smtpTestResult && (
                          <p className={`text-sm ${smtpTestResult.success ? 'text-green-700' : 'text-red-700'}`}>
                            {smtpTestResult.userMessage}
                            {smtpTestResult.suggestion && (
                              <span className="block text-xs text-gray-500">{smtpTestResult.suggestion}</span>
                            )}
                          </p>
                        )}
                      </div>
                    </div>

                    <DialogFooter>
                      <Button
                        variant="outline"
                        onClick={() => {
                          setIsEmailDialogOpen(false);
                          resetEmailForm();
                        }}
                      >
                        {t('common:actions.cancel')}
                      </Button>
                      <Button
                        onClick={handleSaveEmail}
                        disabled={saveEmailSetting.isPending}
                        data-testid="button-save-email-config"
                      >
                        {saveEmailSetting.isPending ? t('common:status.saving') : t('settingsPage.email.saveConfigButton')}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent>
              {loadingEmail ? (
                <div className="text-center py-8 text-gray-500">{t('settingsPage.email.loadingEmailSettings')}</div>
              ) : emailSettings && emailSettings.length > 0 ? (
                <div className="space-y-4">
                  {emailSettings.map((setting) => {
                    const purposeInfo = EMAIL_PURPOSES.find(p => p.value === setting.value.purpose) || EMAIL_PURPOSES[EMAIL_PURPOSES.length - 1];
                    return (
                      <div key={setting.id} className="border rounded-lg p-4 flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <h3 className="font-medium">{t(`settingsPage.email.purposes.${purposeInfo.value}.label`)}</h3>
                            <Badge variant="outline">SMTP</Badge>
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
                            <p className="text-xs text-gray-500 mb-1">{t(`settingsPage.email.purposes.${purposeInfo.value}.description`)}</p>
                            <p><strong>{t('settingsPage.email.fromDisplayLabel')}</strong> {setting.value.fromName} &lt;{setting.value.fromEmail}&gt;</p>
                            {setting.value.smtpHost && (
                              <p><strong>{t('settingsPage.email.smtpDisplayLabel')}</strong> {setting.value.smtpHost}:{setting.value.smtpPort}</p>
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
                            {t('common:actions.edit')}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteEmailConfig(setting.id)}
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                            data-testid={`button-delete-email-${setting.id}`}
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            {t('common:actions.delete')}
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <Mail className="h-12 w-12 mx-auto mb-3 text-gray-400" />
                  <p>{t('settingsPage.email.noEmailConfigSet')}</p>
                  <p className="text-sm mt-1">{t('settingsPage.email.noEmailConfigHint')}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* GPS Settings Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Server className="h-5 w-5" />
                {t('settingsPage.gps.activationSettingsTitle')}
              </CardTitle>
              <CardDescription>
                {t('settingsPage.gps.activationSettingsDescription')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="md:col-span-2">
                    <Label htmlFor="gpsRecipientEmail">{t('settingsPage.gps.companyEmailLabel')}</Label>
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
                      {t('settingsPage.gps.companyEmailHint')}
                    </p>
                  </div>
                  <div className="flex items-end">
                    <Button
                      onClick={() => saveGpsRecipient.mutate()}
                      disabled={saveGpsRecipient.isPending}
                      className="w-full"
                      data-testid="button-save-gps-recipient"
                    >
                      {saveGpsRecipient.isPending ? t('common:status.saving') : t('settingsPage.gps.saveGpsEmailButton')}
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
                {t('settingsPage.gps.templatesTitle')}
              </CardTitle>
              <CardDescription>
                {t('settingsPage.gps.templatesDescription')}
              </CardDescription>
              <div className="mt-2 text-sm text-muted-foreground bg-blue-50 border border-blue-200 rounded-md p-3">
                <strong>{t('settingsPage.docEmails.placeholdersLabel')}</strong> <code className="mx-1 px-1.5 py-0.5 bg-blue-100 rounded">{'{brand}'}</code>
                <code className="mx-1 px-1.5 py-0.5 bg-blue-100 rounded">{'{model}'}</code>
                <code className="mx-1 px-1.5 py-0.5 bg-blue-100 rounded">{'{licensePlate}'}</code>
                <code className="mx-1 px-1.5 py-0.5 bg-blue-100 rounded">{'{imei}'}</code>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {/* GPS Activation Template */}
                <div className="space-y-3 p-4 border rounded-lg">
                  <h4 className="font-medium text-sm">{t('settingsPage.gps.activationEmailTitle')}</h4>
                  <div className="space-y-3">
                    <div>
                      <Label htmlFor="gpsActivationSubject">{t('settingsPage.gps.subjectLabel')}</Label>
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
                      <Label htmlFor="gpsActivationMessage">{t('settingsPage.gps.messageLabel')}</Label>
                      <Textarea
                        id="gpsActivationMessage"
                        value={gpsActivationMessage}
                        onChange={(e) => setGpsActivationMessage(e.target.value)}
                        placeholder={t('settingsPage.gps.activationMessagePlaceholder')}
                        rows={6}
                        className="mt-1 font-mono text-sm"
                        data-testid="textarea-gps-activation-message"
                      />
                    </div>
                  </div>
                </div>

                {/* GPS Swap Template */}
                <div className="space-y-3 p-4 border rounded-lg">
                  <h4 className="font-medium text-sm">{t('settingsPage.gps.swapEmailTitle')}</h4>
                  <div className="space-y-3">
                    <div>
                      <Label htmlFor="gpsSwapSubject">{t('settingsPage.gps.subjectLabel')}</Label>
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
                      <Label htmlFor="gpsSwapMessage">{t('settingsPage.gps.messageLabel')}</Label>
                      <Textarea
                        id="gpsSwapMessage"
                        value={gpsSwapMessage}
                        onChange={(e) => setGpsSwapMessage(e.target.value)}
                        placeholder={t('settingsPage.gps.swapMessagePlaceholder')}
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
                  {saveGpsTemplates.isPending ? t('common:status.saving') : t('settingsPage.gps.saveGpsTemplatesButton')}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <ConfirmDialog
        open={deleteEmailDialogOpen}
        onOpenChange={setDeleteEmailDialogOpen}
        title={t('settingsPage.email.deleteConfigDialogTitle')}
        description={t('settingsPage.email.deleteConfigDialogDescription')}
        variant="danger"
        confirmLabel={t('common:actions.delete')}
        onConfirm={confirmDeleteEmailConfig}
        onCancel={() => setEmailConfigToDelete(null)}
      />
    </div>
  );
}

// Contract Number Settings Component
function ContractNumberSettings() {
  const { t } = useTranslation("settings");
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
        title: t('settingsPage.contractNumberSettings.toasts.settingsUpdatedTitle'),
        description: t('settingsPage.contractNumberSettings.toasts.settingsUpdatedDescription'),
      });
      invalidateByPrefix("/api/system-settings");
      invalidateByPrefix("/api/settings/next-contract-number");
    },
    onError: (error) => {
      toast({
        title: t('common:status.error'),
        description: t('settingsPage.contractNumberSettings.toasts.updateFailedDescription'),
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
        title: t('settingsPage.contractNumberSettings.toasts.overrideSetTitle'),
        description: data.message || t('settingsPage.contractNumberSettings.toasts.overrideSetDefaultDescription', { number: data.nextContractNumber }),
      });
      invalidateByPrefix("/api/system-settings");
      invalidateByPrefix("/api/settings/next-contract-number");
      setOverrideInput("");
      setConflictWarning(null);
      setShowConfirmDialog(false);
    },
    onError: (error) => {
      toast({
        title: t('common:status.error'),
        description: t('settingsPage.contractNumberSettings.toasts.setOverrideFailedDescription'),
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
        title: t('settingsPage.contractNumberSettings.toasts.overrideClearedTitle'),
        description: data.message || t('settingsPage.contractNumberSettings.toasts.overrideClearedDefaultDescription'),
      });
      invalidateByPrefix("/api/system-settings");
      invalidateByPrefix("/api/settings/next-contract-number");
    },
    onError: (error) => {
      toast({
        title: t('common:status.error'),
        description: t('settingsPage.contractNumberSettings.toasts.clearOverrideFailedDescription'),
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
        title: t('settingsPage.contractNumberSettings.toasts.invalidValueTitle'),
        description: t('settingsPage.contractNumberSettings.toasts.invalidStartNumberDescription'),
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
        title: t('settingsPage.contractNumberSettings.toasts.invalidValueTitle'),
        description: t('settingsPage.contractNumberSettings.toasts.invalidOverrideDescription'),
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
    return <div className="text-sm text-muted-foreground">{t('common:status.loading')}</div>;
  }

  const hasActiveOverride = settings?.contractNumberOverride !== null && settings?.contractNumberOverride !== undefined;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="contractNumberStart">{t('settingsPage.contractNumberSettings.startingNumberLabel')}</Label>
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
            {t('settingsPage.contractNumberSettings.startingNumberHint')}
          </p>
        </div>
        <div>
          <Label>{t('settingsPage.contractNumberSettings.nextNumberLabel')}</Label>
          <div className="flex h-10 w-full rounded-md border border-input bg-muted px-3 py-2 text-sm items-center justify-between">
            <span className="font-medium">{nextContractNumber || t('common:status.loading')}</span>
            {hasActiveOverride && (
              <Badge variant="secondary" className="ml-2 bg-orange-100 text-orange-800">
                {t('settingsPage.contractNumberSettings.overrideActiveBadge')}
              </Badge>
            )}
          </div>
          <p className="text-xs text-gray-500 mt-1">
            {t('settingsPage.contractNumberSettings.nextNumberHint')}
          </p>
        </div>
      </div>

      <Button
        onClick={handleSave}
        disabled={updateSettings.isPending}
        className="w-full md:w-auto"
        data-testid="button-save-contract-settings"
      >
        {updateSettings.isPending ? t('common:status.saving') : t('settingsPage.contractNumberSettings.saveStartingNumberButton')}
      </Button>

      {/* Smart Override Section */}
      <div className="border-t pt-6">
        <h4 className="font-medium mb-4">{t('settingsPage.contractNumberSettings.smartOverrideTitle')}</h4>
        <p className="text-sm text-gray-600 mb-4">
          {t('settingsPage.contractNumberSettings.smartOverrideDescription')}
        </p>

        <div className="flex gap-2 items-start">
          <div className="flex-1">
            <Input
              type="number"
              min="1"
              value={overrideInput}
              onChange={(e) => setOverrideInput(e.target.value)}
              placeholder={t('settingsPage.contractNumberSettings.overrideInputPlaceholder')}
              data-testid="input-contract-override"
            />
          </div>
          <Button
            onClick={handleSetOverride}
            disabled={!overrideInput || setOverride.isPending}
            data-testid="button-set-override"
          >
            {setOverride.isPending ? t('settingsPage.contractNumberSettings.settingStatus') : t('settingsPage.contractNumberSettings.setOverrideButton')}
          </Button>
          {hasActiveOverride && (
            <Button
              variant="outline"
              onClick={() => clearOverride.mutate()}
              disabled={clearOverride.isPending}
              data-testid="button-clear-override"
            >
              {clearOverride.isPending ? t('settingsPage.contractNumberSettings.clearingStatus') : t('settingsPage.contractNumberSettings.clearOverrideButton')}
            </Button>
          )}
        </div>

        {/* Conflict Warning */}
        {conflictWarning && conflictWarning.count > 0 && (
          <div className="mt-3 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <p className="text-sm text-yellow-800 font-medium">
              {t('settingsPage.contractNumberSettings.conflictWarning', { count: conflictWarning.count })}
            </p>
            <p className="text-sm text-yellow-700 mt-1">
              {t('settingsPage.contractNumberSettings.conflictingNumbersLabel', { conflicts: conflictWarning.conflicts.join(", ") })}
              {conflictWarning.count > 5 ? t('settingsPage.contractNumberSettings.andMoreSuffix', { count: conflictWarning.count - 5 }) : ""}
            </p>
            <p className="text-sm text-yellow-700 mt-2">
              {t('settingsPage.contractNumberSettings.overrideAnywayWarning')}
            </p>
          </div>
        )}

        {/* No conflicts message */}
        {overrideInput && !checkConflicts.isPending && !conflictWarning && parseInt(overrideInput, 10) > 0 && (
          <div className="mt-3 bg-green-50 border border-green-200 rounded-lg p-4">
            <p className="text-sm text-green-800">
              {t('settingsPage.contractNumberSettings.noConflictsMessage')}
            </p>
          </div>
        )}
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="text-sm text-blue-800">
          <strong>{t('settingsPage.contractNumberSettings.noteLabel')}</strong> {t('settingsPage.contractNumberSettings.noteText')}
        </p>
      </div>

      {/* Confirmation Dialog */}
      <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('settingsPage.contractNumberSettings.confirmOverrideTitle')}</DialogTitle>
            <DialogDescription>
              {t('settingsPage.contractNumberSettings.confirmOverrideDescription', { count: conflictWarning?.count, number: overrideInput })}
            </DialogDescription>
          </DialogHeader>
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 my-4">
            <p className="text-sm text-yellow-800">
              {t('settingsPage.contractNumberSettings.conflictingNumbersDialogLabel', { conflicts: conflictWarning?.conflicts.join(", ") })}
              {(conflictWarning?.count || 0) > 5 ? t('settingsPage.contractNumberSettings.andMoreSuffix', { count: (conflictWarning?.count || 0) - 5 }) : ""}
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfirmDialog(false)}>
              {t('common:actions.cancel')}
            </Button>
            <Button onClick={handleConfirmOverride} disabled={setOverride.isPending}>
              {setOverride.isPending ? t('settingsPage.contractNumberSettings.settingStatus') : t('settingsPage.contractNumberSettings.overrideAnywayButton')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
