import { useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Mail, Shield, Wrench, Users, Send, Calendar, Clock, CheckCircle, AlertTriangle, Edit, Trash2, Eye, Copy } from "lucide-react";
import type { Vehicle, Customer } from "@shared/schema";
import { formatLicensePlate } from "@/lib/format-utils";

interface NotificationHistory {
  id: string;
  type: 'apk' | 'maintenance' | 'custom';
  subject: string;
  recipients: number;
  sentAt: string;
  status: 'sent' | 'failed' | 'pending';
  failureReason?: string;
  emailsSent: number;
  emailsFailed: number;
}

interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  content: string;
  createdAt: string;
  lastUsed?: string;
}

export default function CustomerCommunications() {
  const { t } = useTranslation("notifications");
  const [activeTab, setActiveTab] = useState("send");
  const [communicationMode, setCommunicationMode] = useState<'apk' | 'maintenance' | 'custom'>('apk');
  const [selectedVehicles, setSelectedVehicles] = useState<Vehicle[]>([]);
  const [selectedCustomers, setSelectedCustomers] = useState<Customer[]>([]);
  const [customerReservationFilter, setCustomerReservationFilter] = useState<'all' | 'with-reservations' | 'without-reservations'>('all');
  const [customMessage, setCustomMessage] = useState<string>("");
  const [customSubject, setCustomSubject] = useState<string>("");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [isLoadingNotifications, setIsLoadingNotifications] = useState(false);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [sendDialogOpen, setSendDialogOpen] = useState(false);
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false);
  const [emailPreview, setEmailPreview] = useState<{
    subject: string;
    content: string;
    recipients: Array<{
      name: string, 
      email: string, 
      vehicleLicense: string, 
      emailField: string, 
      emailOptions: Array<{value: string, label: string, email: string}>,
      customer?: any, 
      vehicleId?: number
    }>;
  } | null>(null);
  
  // Vehicle filter is now based on communication mode
  const vehicleFilter = communicationMode === 'custom' ? 'all' : communicationMode;
  
  // Template builder state
  const [templateName, setTemplateName] = useState<string>("");
  const [templateSubject, setTemplateSubject] = useState<string>("");
  const [templateContent, setTemplateContent] = useState<string>("");
  const [templateCategory, setTemplateCategory] = useState<'apk' | 'maintenance' | 'custom'>('custom');
  const [templates, setTemplates] = useState<Array<{id: string, name: string, subject: string, content: string, createdAt: string}>>([]);
  const [editingTemplate, setEditingTemplate] = useState<string | null>(null);
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(false);
  const [templateSearchQuery, setTemplateSearchQuery] = useState<string>("");
  const [templateCategoryFilter, setTemplateCategoryFilter] = useState<'all' | 'apk' | 'maintenance' | 'custom'>('all');
  const [templatePreviewDialog, setTemplatePreviewDialog] = useState(false);
  const [templateToDelete, setTemplateToDelete] = useState<any>(null);
  const [selectedTemplateForPreview, setSelectedTemplateForPreview] = useState<any>(null);
  const [showLivePreview, setShowLivePreview] = useState(false);
  
  // Refs for textarea
  const templateSubjectRef = useRef<HTMLInputElement | null>(null);
  const templateContentRef = useRef<HTMLTextAreaElement | null>(null);

  const { toast } = useToast();

  // Fetch saved email templates
  const { data: savedTemplates = [] } = useQuery({
    queryKey: ['/api/email-templates'],
    queryFn: async () => {
      const response = await fetch('/api/email-templates');
      if (!response.ok) throw new Error('Failed to fetch templates');
      return response.json();
    },
  });

  // Fetch vehicles with active reservations (filtered or all)
  const { data: vehiclesWithReservations = [] } = useQuery({
    queryKey: ['/api/vehicles', vehicleFilter === 'all' ? 'with-reservations' : 'filtered', vehicleFilter],
    queryFn: async () => {
      const endpoint = vehicleFilter === 'all' 
        ? '/api/vehicles/with-reservations'
        : `/api/vehicles/filtered?filterType=${vehicleFilter}`;
      const response = await fetch(endpoint);
      if (!response.ok) throw new Error('Failed to fetch vehicles');
      return response.json();
    }
  });

  // Fetch customers 
  const { data: customers = [] } = useQuery<Customer[]>({
    queryKey: ['/api/customers']
  });

  // Fetch customers with reservation status for custom messages
  const { data: customersWithReservations = [] } = useQuery({
    queryKey: ['/api/customers', 'with-reservations'],
    queryFn: async () => {
      const response = await fetch('/api/customers/with-reservations');
      if (!response.ok) {
        // Fallback to regular customers endpoint if with-reservations doesn't exist
        const customersResponse = await fetch('/api/customers');
        if (!customersResponse.ok) throw new Error('Failed to fetch customers');
        const allCustomers = await customersResponse.json();
        
        // Get reservations to determine which customers have active reservations
        const reservationsResponse = await fetch('/api/reservations');
        const reservations = reservationsResponse.ok ? await reservationsResponse.json() : [];
        
        return allCustomers.map((customer: any) => ({
          ...customer,
          hasActiveReservation: reservations.some((res: any) => 
            res.customerId === customer.id && 
            new Date(res.startDate) <= new Date() && 
            new Date(res.endDate) >= new Date()
          )
        }));
      }
      return response.json();
    }
  });

  // Fetch email logs
  const { data: emailLogs = [] } = useQuery({
    queryKey: ['/api/email-logs'],
    queryFn: async () => {
      const response = await fetch('/api/email-logs');
      if (!response.ok) throw new Error('Failed to fetch email logs');
      return response.json();
    }
  });

  // Mock notification history for now - will be replaced with real data
  const notificationHistory: NotificationHistory[] = [
    {
      id: "1",
      type: "apk",
      subject: "APK Reminder - Inspection due soon",
      recipients: 12,
      sentAt: "2024-03-15T10:30:00Z",
      status: "sent",
      emailsSent: 12,
      emailsFailed: 0
    },
    {
      id: "2", 
      type: "maintenance",
      subject: "Scheduled maintenance reminder",
      recipients: 8,
      sentAt: "2024-03-14T14:20:00Z",
      status: "sent",
      emailsSent: 7,
      emailsFailed: 1,
      failureReason: "Invalid email address"
    },
    {
      id: "3",
      type: "custom",
      subject: "Important vehicle recall notice",
      recipients: 25,
      sentAt: "2024-03-13T09:15:00Z",
      status: "sent",
      emailsSent: 25,
      emailsFailed: 0
    }
  ];

  const filteredVehicles = vehiclesWithReservations.filter((item: any) => {
    const vehicle = item.vehicle;
    const query = searchQuery.toLowerCase();
    return !query ||
      vehicle.licensePlate?.toLowerCase().includes(query) ||
      vehicle.brand?.toLowerCase().includes(query) ||
      vehicle.model?.toLowerCase().includes(query);
  });

  // Filter customers based on search query and reservation status
  const filteredCustomers = customersWithReservations.filter((customer: any) => {
    const query = searchQuery.toLowerCase();
    const matchesSearch = !query ||
      customer.name?.toLowerCase().includes(query) ||
      customer.firstName?.toLowerCase().includes(query) ||
      customer.lastName?.toLowerCase().includes(query) ||
      customer.email?.toLowerCase().includes(query);

    const matchesReservationFilter = 
      customerReservationFilter === 'all' ||
      (customerReservationFilter === 'with-reservations' && customer.hasActiveReservation) ||
      (customerReservationFilter === 'without-reservations' && !customer.hasActiveReservation);

    return matchesSearch && matchesReservationFilter;
  });

  const handleSendNotifications = async () => {
    // Check if recipients are selected based on mode
    if (communicationMode === 'custom' && selectedCustomers.length === 0) {
      toast({
        title: t('customerCommunications.toasts.noCustomersSelectedTitle'),
        description: t('customerCommunications.toasts.noCustomersSelectedDescription'),
        variant: "destructive",
      });
      return;
    }

    if (communicationMode !== 'custom' && selectedVehicles.length === 0) {
      toast({
        title: t('customerCommunications.toasts.noVehiclesSelectedTitle'),
        description: t('customerCommunications.toasts.noVehiclesSelectedDescription'),
        variant: "destructive",
      });
      return;
    }

    // Determine template and content based on communication mode and template selection
    let templateType = communicationMode;
    let emailSubject = "";
    let emailContent = "";

    if (selectedTemplateId && selectedTemplateId !== "none") {
      // Use saved template for any communication mode
      const savedTemplate = savedTemplates.find((t: any) => t.id.toString() === selectedTemplateId);
      if (savedTemplate) {
        emailSubject = savedTemplate.subject;
        emailContent = savedTemplate.content;
        templateType = "custom"; // Use custom when using saved templates
      } else {
        toast({
          title: t('customerCommunications.toasts.templateErrorTitle'),
          description: t('customerCommunications.toasts.templateErrorDescription'),
          variant: "destructive",
        });
        return;
      }
    } else {
      // When no template is selected
      if (communicationMode === 'apk' || communicationMode === 'maintenance') {
        // APK and Maintenance modes require template selection
        toast({
          title: t('customerCommunications.toasts.templateRequiredTitle'),
          description: communicationMode === 'apk'
            ? t('customerCommunications.toasts.templateRequiredDescriptionApk')
            : t('customerCommunications.toasts.templateRequiredDescriptionMaintenance'),
          variant: "destructive",
        });
        return;
      } else {
        // Custom mode - require custom message and subject when no template is selected
        if (!customMessage.trim() || !customSubject.trim()) {
          toast({
            title: t('customerCommunications.toasts.missingInformationTitle'),
            description: t('customerCommunications.toasts.missingInformationDescription'),
            variant: "destructive",
          });
          return;
        }
        emailSubject = customSubject;
        emailContent = customMessage;
        templateType = "custom";
      }
    }

    setIsLoadingNotifications(true);
    
    try {
      // Build request body based on communication mode
      const requestBody: any = {
        template: templateType,
        customMessage: emailContent.trim(),
        customSubject: emailSubject.trim(),
        emailFieldSelection: "auto",
        individualEmailSelections: {},
      };

      // For custom mode, send both customerIds and vehicleIds
      if (communicationMode === 'custom') {
        if (selectedCustomers.length > 0) {
          requestBody.customerIds = selectedCustomers.map(c => c.id);
        }
        if (selectedVehicles.length > 0) {
          requestBody.vehicleIds = selectedVehicles.map(v => v.id);
        }
      } else {
        // For APK/maintenance, send vehicleIds only
        requestBody.vehicleIds = selectedVehicles.map(v => v.id);
      }

      const response = await fetch('/api/notifications/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        throw new Error(t('customerCommunications.toasts.sendNotificationsRequestFailed', { status: response.statusText }));
      }

      const result = await response.json();

      toast({
        title: t('customerCommunications.toasts.notificationsSentTitle'),
        description: t('customerCommunications.toasts.notificationsSentDescription', { sent: result.sent, failed: result.failed || 0 }),
      });

      // Reset form
      setSendDialogOpen(false);
      setSelectedVehicles([]);
      setSelectedCustomers([]);
      setCustomMessage("");
      setCustomSubject("");
      setSearchQuery("");
    } catch (error) {
      console.error('Failed to send notifications:', error);
      toast({
        title: t('customerCommunications.toasts.sendFailedTitle'),
        description: error instanceof Error ? error.message : t('customerCommunications.toasts.genericError'),
        variant: "destructive",
      });
    } finally {
      setIsLoadingNotifications(false);
    }
  };

  const generateEmailPreview = async () => {
    // Check if custom message mode and customers are selected
    if (communicationMode === 'custom' && selectedCustomers.length === 0) {
      toast({
        title: t('customerCommunications.toasts.noCustomersSelectedTitle'),
        description: t('customerCommunications.toasts.noCustomersSelectedDescription'),
        variant: "destructive",
      });
      return;
    }

    // Check if APK/Maintenance mode and vehicles are selected
    if (communicationMode !== 'custom' && selectedVehicles.length === 0) {
      toast({
        title: t('customerCommunications.toasts.noVehiclesSelectedTitle'),
        description: t('customerCommunications.toasts.noVehiclesSelectedDescription'),
        variant: "destructive",
      });
      return;
    }

    // Get email content based on communication mode
    let emailSubject = "";
    let emailContent = "";

    if (selectedTemplateId && selectedTemplateId !== "none") {
      // Use saved template for any communication mode
      const savedTemplate = savedTemplates.find((t: any) => t.id.toString() === selectedTemplateId);
      if (savedTemplate) {
        emailSubject = savedTemplate.subject;
        emailContent = savedTemplate.content;
      } else {
        toast({
          title: t('customerCommunications.toasts.templateErrorTitle'),
          description: t('customerCommunications.toasts.templateErrorDescription'),
          variant: "destructive",
        });
        return;
      }
    } else {
      // When no template is selected
      if (communicationMode === 'apk' || communicationMode === 'maintenance') {
        // APK and Maintenance modes require template selection
        toast({
          title: t('customerCommunications.toasts.templateRequiredTitle'),
          description: communicationMode === 'apk'
            ? t('customerCommunications.toasts.templateRequiredDescriptionApk')
            : t('customerCommunications.toasts.templateRequiredDescriptionMaintenance'),
          variant: "destructive",
        });
        return;
      } else {
        // Custom mode - require custom message and subject when no template is selected
        if (!customMessage.trim() || !customSubject.trim()) {
          toast({
            title: t('customerCommunications.toasts.missingInformationTitle'),
            description: t('customerCommunications.toasts.missingInformationDescription'),
            variant: "destructive",
          });
          return;
        }
        emailSubject = customSubject;
        emailContent = customMessage;
      }
    }

    // Use determined email content (template or custom)
    const subject = emailSubject.trim();
    const content = emailContent.trim();

    // Generate recipients list based on communication mode
    let recipients: any[];
    let sampleCustomer: any;
    let sampleVehicle: any;

    if (communicationMode === 'custom') {
      // For custom messages, work with selected customers
      recipients = selectedCustomers.map(customer => {
        // Collect all available email options
        const emailOptions: Array<{value: string, label: string, email: string}> = [];
        
        if (customer.email) {
          emailOptions.push({
            value: "email",
            label: t('customerCommunications.emailOptionLabels.email'),
            email: customer.email
          });
        }
        if (customer.emailForMOT) {
          emailOptions.push({
            value: "emailForMOT",
            label: t('customerCommunications.emailOptionLabels.emailForMOT'),
            email: customer.emailForMOT
          });
        }
        if (customer.emailForInvoices) {
          emailOptions.push({
            value: "emailForInvoices",
            label: t('customerCommunications.emailOptionLabels.emailForInvoices'),
            email: customer.emailForInvoices
          });
        }
        if (customer.emailGeneral) {
          emailOptions.push({
            value: "emailGeneral",
            label: t('customerCommunications.emailOptionLabels.emailGeneral'),
            email: customer.emailGeneral
          });
        }

        // Select default email (prioritize primary email)
        let selectedEmailField = "none";
        let selectedEmail = t('customerCommunications.dialogs.emailPreview.noEmailFallback');

        if (emailOptions.length > 0) {
          const primaryOption = emailOptions.find(opt => opt.value === "email");
          const defaultOption = primaryOption || emailOptions[0];
          selectedEmailField = defaultOption.value;
          selectedEmail = defaultOption.email;
        }

        return {
          name: customer?.name || t('customerCommunications.dialogs.emailPreview.customerFallback'),
          email: selectedEmail,
          vehicleLicense: "N/A", // No specific vehicle for custom messages
          emailField: selectedEmailField,
          emailOptions: emailOptions,
          customer: customer,
          customerId: customer.id
        };
      });

      sampleCustomer = selectedCustomers[0];
      sampleVehicle = null; // No vehicle for custom messages
    } else {
      // For APK/Maintenance messages, work with selected vehicles
      recipients = selectedVehicles.map(vehicle => {
        const reservation = vehiclesWithReservations.find((item: any) => item.vehicle.id === vehicle.id);
        const customer = reservation?.customer;
        
        // Collect all available email options
        const emailOptions: Array<{value: string, label: string, email: string}> = [];
        
        if (customer) {
          if (customer.email) {
            emailOptions.push({
              value: "email",
              label: t('customerCommunications.emailOptionLabels.email'),
              email: customer.email
            });
          }
          if (customer.emailForMOT) {
            emailOptions.push({
              value: "emailForMOT",
              label: t('customerCommunications.emailOptionLabels.emailForMOT'),
              email: customer.emailForMOT
            });
          }
          if (customer.emailForInvoices) {
            emailOptions.push({
              value: "emailForInvoices",
              label: t('customerCommunications.emailOptionLabels.emailForInvoices'),
              email: customer.emailForInvoices
            });
          }
          if (customer.emailGeneral) {
            emailOptions.push({
              value: "emailGeneral",
              label: t('customerCommunications.emailOptionLabels.emailGeneral'),
              email: customer.emailGeneral
            });
          }
        }
        
        // Select default email (prioritize primary email)
        let selectedEmailField = "none";
        let selectedEmail = t('customerCommunications.dialogs.emailPreview.noEmailFallback');
        
        if (emailOptions.length > 0) {
          const primaryOption = emailOptions.find(opt => opt.value === "email");
          const defaultOption = primaryOption || emailOptions[0];
          selectedEmailField = defaultOption.value;
          selectedEmail = defaultOption.email;
        }
        
        return {
          name: customer?.name || t('customerCommunications.dialogs.emailPreview.customerFallback'),
          email: selectedEmail,
          vehicleLicense: vehicle.licensePlate,
          emailField: selectedEmailField,
          emailOptions: emailOptions,
          customer: customer,
          vehicleId: vehicle.id
        };
      });

      sampleVehicle = selectedVehicles[0];
      const sampleReservation = vehiclesWithReservations.find((item: any) => item.vehicle.id === sampleVehicle.id);
      sampleCustomer = sampleReservation?.customer;
    }

    // Format license plate properly and add all placeholders including apkDate
    const formattedPlate = sampleVehicle?.licensePlate
      ? formatLicensePlate(sampleVehicle.licensePlate)
      : t('customerCommunications.dialogs.emailPreview.fallbackLicensePlate');

    const formattedApkDate = sampleVehicle?.apkDate
      ? new Date(sampleVehicle.apkDate).toLocaleDateString('nl-NL')
      : t('customerCommunications.dialogs.emailPreview.fallbackApkDate');

    // Replace placeholders in both subject and content
    const processedSubject = subject
      .replace(/\{customerName\}/g, sampleCustomer?.name || t('customerCommunications.dialogs.emailPreview.fallbackCustomerName'))
      .replace(/\{vehiclePlate\}/g, formattedPlate)
      .replace(/\{vehicleBrand\}/g, sampleVehicle?.brand || t('customerCommunications.dialogs.emailPreview.fallbackBrand'))
      .replace(/\{vehicleModel\}/g, sampleVehicle?.model || t('customerCommunications.dialogs.emailPreview.fallbackModel'))
      .replace(/\{apkDate\}/g, formattedApkDate);

    const processedContent = content
      .replace(/\{customerName\}/g, sampleCustomer?.name || t('customerCommunications.dialogs.emailPreview.fallbackCustomerName'))
      .replace(/\{vehiclePlate\}/g, formattedPlate)
      .replace(/\{vehicleBrand\}/g, sampleVehicle?.brand || t('customerCommunications.dialogs.emailPreview.fallbackBrand'))
      .replace(/\{vehicleModel\}/g, sampleVehicle?.model || t('customerCommunications.dialogs.emailPreview.fallbackModel'))
      .replace(/\{apkDate\}/g, formattedApkDate);

    setEmailPreview({
      subject: processedSubject,
      content: processedContent,
      recipients
    });

    setPreviewDialogOpen(true);
  };

  const confirmSendNotifications = async () => {
    setPreviewDialogOpen(false);
    await handleSendNotifications();
  };

  // Template management functions
  const filteredTemplates = savedTemplates.filter((template: any) => {
    const matchesSearch = !templateSearchQuery || 
      template.name.toLowerCase().includes(templateSearchQuery.toLowerCase()) ||
      template.subject.toLowerCase().includes(templateSearchQuery.toLowerCase());
    
    const matchesCategory = templateCategoryFilter === 'all' || template.category === templateCategoryFilter;
    
    return matchesSearch && matchesCategory;
  });

  const getCategoryBadgeColor = (category: string) => {
    switch (category) {
      case 'apk': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'maintenance': return 'bg-green-100 text-green-800 border-green-200';
      case 'custom': return 'bg-purple-100 text-purple-800 border-purple-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const handlePreviewTemplate = (template: any) => {
    setSelectedTemplateForPreview(template);
    setTemplatePreviewDialog(true);
  };

  const handleDeleteTemplate = (template: any) => {
    setTemplateToDelete(template);
  };

  const confirmDeleteTemplate = async () => {
    if (!templateToDelete) return;
    
    try {
      const response = await fetch(`/api/email-templates/${templateToDelete.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error(t('customerCommunications.toasts.deleteTemplateRequestFailed', { status: response.statusText }));
      }

      toast({
        title: t('customerCommunications.toasts.templateDeletedTitle'),
        description: t('customerCommunications.toasts.templateDeletedDescription', { name: templateToDelete.name }),
      });

      // Refresh templates - this will happen automatically via react-query
      setTemplateToDelete(null);
    } catch (error) {
      console.error('Failed to delete template:', error);
      toast({
        title: t('customerCommunications.toasts.deleteTemplateFailedTitle'),
        description: error instanceof Error ? error.message : t('customerCommunications.toasts.genericError'),
        variant: "destructive",
      });
    }
  };

  // Placeholder insertion functions
  const insertPlaceholder = (placeholder: string, isSubject: boolean = false) => {
    const targetRef = isSubject ? templateSubjectRef.current : templateContentRef.current;
    const setValue = isSubject ? setTemplateSubject : setTemplateContent;
    const currentValue = isSubject ? templateSubject : templateContent;
    
    if (targetRef) {
      const start = targetRef.selectionStart || 0;
      const end = targetRef.selectionEnd || 0;
      const newValue = currentValue.substring(0, start) + placeholder + currentValue.substring(end);
      setValue(newValue);
      
      // Restore cursor position after the inserted placeholder
      setTimeout(() => {
        const newCursorPos = start + placeholder.length;
        targetRef.setSelectionRange(newCursorPos, newCursorPos);
        targetRef.focus();
      }, 0);
    } else {
      // Fallback: append to end if no ref available
      setValue(currentValue + placeholder);
    }
  };

  const duplicateTemplate = async (template: any) => {
    setEditingTemplate(null);
    setTemplateName(`${template.name} (Copy)`);
    setTemplateSubject(template.subject);
    setTemplateContent(template.content);
    setTemplateCategory(template.category || "custom");
    
    toast({
      title: t('customerCommunications.toasts.templateDuplicatedTitle'),
      description: t('customerCommunications.toasts.templateDuplicatedDescription'),
    });
  };

  const getPreviewContent = () => {
    const sampleData = {
      customerName: "John Doe",
      vehiclePlate: "AB-123-CD",
      vehicleBrand: "Toyota",
      vehicleModel: "Camry",
      apkDate: "2024-06-15",
      companyName: "Car Rental Company"
    };

    let previewSubject = templateSubject;
    let previewContent = templateContent;

    Object.entries(sampleData).forEach(([key, value]) => {
      const placeholder = `{${key}}`;
      previewSubject = previewSubject.replace(new RegExp(placeholder.replace(/[{}]/g, '\\$&'), 'g'), value);
      previewContent = previewContent.replace(new RegExp(placeholder.replace(/[{}]/g, '\\$&'), 'g'), value);
    });

    return { subject: previewSubject, content: previewContent };
  };

  // Available placeholders
  const placeholders = [
    { key: 'customerName', label: t('customerCommunications.placeholders.customerName.label'), description: t('customerCommunications.placeholders.customerName.description') },
    { key: 'vehiclePlate', label: t('customerCommunications.placeholders.vehiclePlate.label'), description: t('customerCommunications.placeholders.vehiclePlate.description') },
    { key: 'vehicleBrand', label: t('customerCommunications.placeholders.vehicleBrand.label'), description: t('customerCommunications.placeholders.vehicleBrand.description') },
    { key: 'vehicleModel', label: t('customerCommunications.placeholders.vehicleModel.label'), description: t('customerCommunications.placeholders.vehicleModel.description') },
    { key: 'apkDate', label: t('customerCommunications.placeholders.apkDate.label'), description: t('customerCommunications.placeholders.apkDate.description') },
    { key: 'companyName', label: t('customerCommunications.placeholders.companyName.label'), description: t('customerCommunications.placeholders.companyName.description') },
    { key: 'maintenanceDate', label: t('customerCommunications.placeholders.maintenanceDate.label'), description: t('customerCommunications.placeholders.maintenanceDate.description') },
    { key: 'customerEmail', label: t('customerCommunications.placeholders.customerEmail.label'), description: t('customerCommunications.placeholders.customerEmail.description') },
    { key: 'customerPhone', label: t('customerCommunications.placeholders.customerPhone.label'), description: t('customerCommunications.placeholders.customerPhone.description') },
    { key: 'reservationStart', label: t('customerCommunications.placeholders.reservationStart.label'), description: t('customerCommunications.placeholders.reservationStart.description') },
    { key: 'reservationEnd', label: t('customerCommunications.placeholders.reservationEnd.label'), description: t('customerCommunications.placeholders.reservationEnd.description') }
  ];

  // Function to handle email selection changes in preview dialog
  const handleEmailSelection = (recipientIndex: number, selectedEmailField: string) => {
    if (!emailPreview) return;

    const updatedRecipients = [...emailPreview.recipients];
    const recipient = updatedRecipients[recipientIndex];
    
    // Find the selected email option
    const selectedOption = recipient.emailOptions.find(opt => opt.value === selectedEmailField);
    
    if (selectedOption) {
      // Update the recipient's email and emailField
      updatedRecipients[recipientIndex] = {
        ...recipient,
        email: selectedOption.email,
        emailField: selectedEmailField
      };
      
      // Update the email preview state
      setEmailPreview({
        ...emailPreview,
        recipients: updatedRecipients
      });
    }
  };



  const getTemplateInfo = (template: string) => {
    switch (template) {
      case "apk":
        return {
          title: t('customerCommunications.templateInfo.apk.title'),
          icon: Shield,
          description: t('customerCommunications.templateInfo.apk.description'),
          color: "text-orange-600"
        };
      case "maintenance":
        return {
          title: t('customerCommunications.templateInfo.maintenance.title'),
          icon: Wrench,
          description: t('customerCommunications.templateInfo.maintenance.description'),
          color: "text-blue-600"
        };
      case "custom":
        return {
          title: t('customerCommunications.templateInfo.custom.title'),
          icon: Mail,
          description: t('customerCommunications.templateInfo.custom.description'),
          color: "text-green-600"
        };
      default:
        return {
          title: t('customerCommunications.templateInfo.unknown.title'),
          icon: Mail,
          description: "",
          color: "text-gray-600"
        };
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('customerCommunications.pageTitle')}</h1>
          <p className="text-muted-foreground">
            {t('customerCommunications.pageDescription')}
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Users className="h-5 w-5 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">
            {t('customerCommunications.statsLine', { customerCount: customers.length, vehicleCount: vehiclesWithReservations.length })}
          </span>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="send" className="flex items-center space-x-2">
            <Send className="h-4 w-4" />
            <span>{t('customerCommunications.tabs.send')}</span>
          </TabsTrigger>
          <TabsTrigger value="templates" className="flex items-center space-x-2">
            <Mail className="h-4 w-4" />
            <span>{t('customerCommunications.tabs.templates')}</span>
          </TabsTrigger>
          <TabsTrigger value="history" className="flex items-center space-x-2">
            <Clock className="h-4 w-4" />
            <span>{t('customerCommunications.tabs.history')}</span>
          </TabsTrigger>
          <TabsTrigger value="analytics" className="flex items-center space-x-2">
            <AlertTriangle className="h-4 w-4" />
            <span>{t('customerCommunications.tabs.analytics')}</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="send" className="space-y-6">
          {/* Communication Mode Sub-tabs */}
          <Tabs value={communicationMode} onValueChange={(value) => {
            setCommunicationMode(value as 'apk' | 'maintenance' | 'custom');
            setSelectedVehicles([]);
            setSelectedTemplateId("");
            setCustomSubject("");
            setCustomMessage("");
          }} className="space-y-4">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="apk" className="flex items-center space-x-2" data-testid="tab-apk">
                <Shield className="h-4 w-4" />
                <span>{t('customerCommunications.modes.apk')}</span>
              </TabsTrigger>
              <TabsTrigger value="maintenance" className="flex items-center space-x-2" data-testid="tab-maintenance">
                <Wrench className="h-4 w-4" />
                <span>{t('customerCommunications.modes.maintenance')}</span>
              </TabsTrigger>
              <TabsTrigger value="custom" className="flex items-center space-x-2" data-testid="tab-custom">
                <Mail className="h-4 w-4" />
                <span>{t('customerCommunications.modes.custom')}</span>
              </TabsTrigger>
            </TabsList>

            {/* APK Tab */}
            <TabsContent value="apk" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>{t('customerCommunications.send.apk.cardTitle')}</CardTitle>
                  <CardDescription>{t('customerCommunications.send.apk.cardDescription')}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Template Selection */}
                  <div className="space-y-2">
                    <Label htmlFor="apk-template-select" className="text-sm font-medium">
                      {t('customerCommunications.send.apk.emailTemplateLabel')}
                    </Label>
                    <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
                      <SelectTrigger className="w-full" data-testid="select-apk-template">
                        <SelectValue placeholder={t('customerCommunications.send.apk.templatePlaceholder')} />
                      </SelectTrigger>
                      <SelectContent>
                        {savedTemplates.length > 0 ? (
                          savedTemplates.map((template: any) => (
                            <SelectItem key={template.id} value={template.id.toString()}>
                              {template.name}
                            </SelectItem>
                          ))
                        ) : (
                          <div className="px-2 py-1 text-xs text-muted-foreground">
                            {t('customerCommunications.send.apk.noTemplatesAvailable')}
                          </div>
                        )}
                      </SelectContent>
                    </Select>
                    {selectedTemplateId && (
                      <div className="text-xs text-muted-foreground">
                        {t('customerCommunications.send.apk.templateSelectedLabel', {
                          name: savedTemplates.find((t: any) => t.id.toString() === selectedTemplateId)?.name || selectedTemplateId
                        })}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center space-x-4 mb-4">
                    <div className="flex-1">
                      <Label htmlFor="search-apk" className="text-sm font-medium sr-only">{t('customerCommunications.send.apk.searchLabel')}</Label>
                      <Input
                        id="search-apk"
                        placeholder={t('customerCommunications.send.apk.searchPlaceholder')}
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        data-testid="input-search-apk"
                      />
                    </div>
                    <Button
                      disabled={selectedVehicles.length === 0 || !selectedTemplateId}
                      onClick={generateEmailPreview}
                      className="bg-orange-600 hover:bg-orange-700"
                      data-testid="button-preview-apk"
                    >
                      <Send className="h-4 w-4 mr-2" />
                      {t('customerCommunications.send.apk.previewSendButton', { count: selectedVehicles.length })}
                    </Button>
                  </div>

              {/* Filter Information */}
              {vehicleFilter !== "all" && (
                <div className="p-4 border-l-4 border-blue-500 bg-blue-50 rounded-r">
                  {vehicleFilter === "apk" && (
                    <div className="flex items-start space-x-2">
                      <Shield className="h-5 w-5 text-blue-600 mt-0.5" />
                      <div>
                        <p className="font-medium text-blue-900">{t('customerCommunications.send.apk.filterActiveTitle')}</p>
                        <p className="text-sm text-blue-700">
                          {t('customerCommunications.send.apk.filterActiveDescription')}
                        </p>
                      </div>
                    </div>
                  )}
                  {vehicleFilter === "maintenance" && (
                    <div className="flex items-start space-x-2">
                      <Wrench className="h-5 w-5 text-blue-600 mt-0.5" />
                      <div>
                        <p className="font-medium text-blue-900">{t('customerCommunications.send.maintenance.filterActiveTitle')}</p>
                        <p className="text-sm text-blue-700">
                          {t('customerCommunications.send.maintenance.filterActiveDescription')}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}


              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-96 overflow-y-auto">
                {filteredVehicles.slice(0, 50).map((item: any) => {
                  const vehicle = item.vehicle;
                  const customer = item.customer;
                  const filterInfo = item.filterInfo;
                  const isSelected = selectedVehicles.some(v => v.id === vehicle.id);
                  
                  // Determine urgency color
                  const getUrgencyColor = (urgency: string) => {
                    switch (urgency) {
                      case 'overdue': return 'bg-red-100 text-red-800 border-red-200';
                      case 'urgent': return 'bg-orange-100 text-orange-800 border-orange-200';
                      case 'warning': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
                      default: return 'bg-blue-100 text-blue-800 border-blue-200';
                    }
                  };
                  
                  return (
                    <div
                      key={vehicle.id}
                      className={`p-3 border rounded-lg cursor-pointer transition-colors hover:bg-gray-50 ${
                        isSelected ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
                      }`}
                      onClick={() => {
                        if (isSelected) {
                          setSelectedVehicles(prev => prev.filter(v => v.id !== vehicle.id));
                        } else {
                          setSelectedVehicles(prev => [...prev, vehicle]);
                        }
                      }}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="font-medium text-sm">{formatLicensePlate(vehicle.licensePlate)}</div>
                        {isSelected && (
                          <CheckCircle className="h-4 w-4 text-blue-600" />
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground mb-2">
                        {vehicle.brand} {vehicle.model}
                      </div>
                      <div className="text-xs text-blue-600 mb-2">
                        {t('customerCommunications.send.apk.customerLabel', { name: customer.name })}
                      </div>

                      {/* Filter-specific information */}
                      {filterInfo && (
                        <div className="mb-2">
                          {vehicleFilter === 'apk' && (
                            <div className="space-y-1">
                              <div className={`inline-block px-2 py-1 rounded text-xs font-medium ${
                                getUrgencyColor(filterInfo.urgencyLevel)
                              }`}>
                                {filterInfo.urgencyLevel === 'overdue' ? t('customerCommunications.send.apk.apkOverdue') :
                                 filterInfo.urgencyLevel === 'urgent' ? t('customerCommunications.send.apk.apkUrgent') :
                                 filterInfo.urgencyLevel === 'warning' ? t('customerCommunications.send.apk.apkWarning') : t('customerCommunications.send.apk.apkNotice')}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                APK: {filterInfo.apkDate}
                                {filterInfo.daysUntilAPK < 0 ?
                                  ` ${t('customerCommunications.send.apk.apkDaysOverdue', { days: Math.abs(filterInfo.daysUntilAPK) })}` :
                                  ` ${t('customerCommunications.send.apk.apkDaysRemaining', { days: filterInfo.daysUntilAPK })}`
                                }
                              </div>
                            </div>
                          )}
                          {vehicleFilter === 'maintenance' && (
                            <div className="space-y-1">
                              <div className={`inline-block px-2 py-1 rounded text-xs font-medium ${
                                getUrgencyColor(filterInfo.urgencyLevel)
                              }`}>
                                {filterInfo.urgencyLevel === 'urgent' ? t('customerCommunications.send.maintenance.neverMaintained') :
                                 filterInfo.urgencyLevel === 'overdue' ? t('customerCommunications.send.maintenance.maintenanceOverdue') :
                                 filterInfo.urgencyLevel === 'warning' ? t('customerCommunications.send.maintenance.maintenanceDue') : t('customerCommunications.send.maintenance.maintenanceNotice')}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {filterInfo.lastMaintenanceDate ?
                                  t('customerCommunications.send.maintenance.lastMaintenance', { date: filterInfo.lastMaintenanceDate, days: filterInfo.daysSinceLastMaintenance }) :
                                  t('customerCommunications.send.maintenance.noMaintenanceRecorded')
                                }
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      <div className="flex items-center space-x-2">
                        <Badge variant="outline" className="text-xs">
                          {vehicle.vehicleType || t('customerCommunications.send.apk.vehicleTypeFallback')}
                        </Badge>
                      </div>
                    </div>
                  );
                })}
              </div>

              {selectedVehicles.length > 0 && (
                <div className="p-3 bg-green-50 rounded-lg border border-green-200">
                  <div className="text-sm font-medium text-green-900">
                    {t('customerCommunications.send.apk.selectedCount', { count: selectedVehicles.length })}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

        </TabsContent>

        {/* Maintenance Tab */}
        <TabsContent value="maintenance" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{t('customerCommunications.send.maintenance.cardTitle')}</CardTitle>
              <CardDescription>{t('customerCommunications.send.maintenance.cardDescription')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Template Selection */}
              <div className="space-y-2">
                <Label htmlFor="maintenance-template-select" className="text-sm font-medium">
                  {t('customerCommunications.send.maintenance.emailTemplateLabel')}
                </Label>
                <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
                  <SelectTrigger className="w-full" data-testid="select-maintenance-template">
                    <SelectValue placeholder={t('customerCommunications.send.maintenance.templatePlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    {savedTemplates.length > 0 ? (
                      savedTemplates.map((template: any) => (
                        <SelectItem key={template.id} value={template.id.toString()}>
                          {template.name}
                        </SelectItem>
                      ))
                    ) : (
                      <div className="px-2 py-1 text-xs text-muted-foreground">
                        {t('customerCommunications.send.maintenance.noTemplatesAvailable')}
                      </div>
                    )}
                  </SelectContent>
                </Select>
                {selectedTemplateId && (
                  <div className="text-xs text-muted-foreground">
                    {t('customerCommunications.send.maintenance.templateSelectedLabel', {
                      name: savedTemplates.find((t: any) => t.id.toString() === selectedTemplateId)?.name || selectedTemplateId
                    })}
                  </div>
                )}
              </div>

              <div className="flex items-center space-x-4 mb-4">
                <div className="flex-1">
                  <Label htmlFor="search-maintenance" className="text-sm font-medium sr-only">{t('customerCommunications.send.maintenance.searchLabel')}</Label>
                  <Input
                    id="search-maintenance"
                    placeholder={t('customerCommunications.send.maintenance.searchPlaceholder')}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    data-testid="input-search-maintenance"
                  />
                </div>
                <Button
                  disabled={selectedVehicles.length === 0 || !selectedTemplateId}
                  onClick={generateEmailPreview}
                  className="bg-blue-600 hover:bg-blue-700"
                  data-testid="button-preview-maintenance"
                >
                  <Send className="h-4 w-4 mr-2" />
                  {t('customerCommunications.send.maintenance.previewSendButton', { count: selectedVehicles.length })}
                </Button>
              </div>

              {/* Filter Information */}
              {vehicleFilter !== "all" && (
                <div className="p-4 border-l-4 border-blue-500 bg-blue-50 rounded-r">
                  {vehicleFilter === "maintenance" && (
                    <div className="flex items-start space-x-2">
                      <Wrench className="h-5 w-5 text-blue-600 mt-0.5" />
                      <div>
                        <p className="font-medium text-blue-900">{t('customerCommunications.send.maintenance.filterActiveTitle')}</p>
                        <p className="text-sm text-blue-700">
                          {t('customerCommunications.send.maintenance.filterActiveDescription')}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-96 overflow-y-auto">
                {filteredVehicles.slice(0, 50).map((item: any) => {
                  const vehicle = item.vehicle;
                  const customer = item.customer;
                  const filterInfo = item.filterInfo;
                  const isSelected = selectedVehicles.some(v => v.id === vehicle.id);
                  
                  return (
                    <div
                      key={vehicle.id}
                      className={`p-3 border rounded-lg cursor-pointer transition-colors hover:bg-gray-50 ${
                        isSelected ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
                      }`}
                      onClick={() => {
                        if (isSelected) {
                          setSelectedVehicles(prev => prev.filter(v => v.id !== vehicle.id));
                        } else {
                          setSelectedVehicles(prev => [...prev, vehicle]);
                        }
                      }}
                      data-testid={`vehicle-card-${vehicle.id}`}
                    >
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="font-medium text-sm">{formatLicensePlate(vehicle.licensePlate)}</div>
                          {isSelected && (
                            <div className="w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center">
                              <div className="w-2 h-2 bg-white rounded-full"></div>
                            </div>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {vehicle.brand} {vehicle.model}
                        </div>
                        <div className="text-xs text-gray-600">
                          {t('customerCommunications.send.maintenance.customerLabel', { name: customer?.name || t('customerCommunications.send.maintenance.unknownCustomer') })}
                        </div>
                        {filterInfo && (
                          <div className="text-xs text-muted-foreground">
                            {filterInfo.lastMaintenanceDate ?
                              t('customerCommunications.send.maintenance.lastMaintenance', { date: filterInfo.lastMaintenanceDate, days: filterInfo.daysSinceLastMaintenance }) :
                              t('customerCommunications.send.maintenance.noMaintenanceRecorded')
                            }
                          </div>
                        )}
                        <div className="flex items-center space-x-2">
                          <Badge variant="outline" className="text-xs">
                            {vehicle.vehicleType || t('customerCommunications.send.maintenance.vehicleTypeFallback')}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {selectedVehicles.length > 0 && (
                <div className="p-3 bg-green-50 rounded-lg border border-green-200">
                  <div className="text-sm font-medium text-green-900">
                    {t('customerCommunications.send.maintenance.selectedCount', { count: selectedVehicles.length })}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

        </TabsContent>

        {/* Custom Message Tab */}
        <TabsContent value="custom" className="space-y-4">
          {/* Template Selection & Actions */}
          <Card>
            <CardHeader>
              <CardTitle>{t('customerCommunications.send.custom.cardTitle')}</CardTitle>
              <CardDescription>{t('customerCommunications.send.custom.cardDescription')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Template Selection */}
              <div className="space-y-2">
                <Label htmlFor="custom-template-select" className="text-sm font-medium">
                  {t('customerCommunications.send.custom.emailTemplateOptionalLabel')}
                </Label>
                <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
                  <SelectTrigger className="w-full" data-testid="select-custom-template">
                    <SelectValue placeholder={t('customerCommunications.send.custom.templatePlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t('customerCommunications.send.custom.noTemplateOption')}</SelectItem>
                    {savedTemplates.length > 0 ? (
                      savedTemplates.map((template: any) => (
                        <SelectItem key={template.id} value={template.id.toString()}>
                          {template.name}
                        </SelectItem>
                      ))
                    ) : (
                      <div className="px-2 py-1 text-xs text-muted-foreground">
                        {t('customerCommunications.send.custom.noTemplatesAvailable')}
                      </div>
                    )}
                  </SelectContent>
                </Select>
                {selectedTemplateId && (
                  <div className="text-xs text-muted-foreground">
                    {t('customerCommunications.send.custom.templateSelectedLabel', {
                      name: savedTemplates.find((t: any) => t.id.toString() === selectedTemplateId)?.name || selectedTemplateId
                    })}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between mb-4">
                <Button
                  disabled={(selectedCustomers.length === 0 && selectedVehicles.length === 0) || ((!selectedTemplateId || selectedTemplateId === "none") && (!customMessage.trim() || !customSubject.trim()))}
                  onClick={generateEmailPreview}
                  className="bg-green-600 hover:bg-green-700"
                  data-testid="button-preview-custom"
                >
                  <Send className="h-4 w-4 mr-2" />
                  {t('customerCommunications.send.custom.previewSendButton')}
                </Button>
                <div className="text-sm text-muted-foreground">
                  {selectedCustomers.length > 0 && selectedVehicles.length > 0
                    ? t('customerCommunications.send.custom.recipientsSummaryBoth', { customers: selectedCustomers.length, vehicles: selectedVehicles.length })
                    : selectedCustomers.length > 0
                    ? t('customerCommunications.send.custom.recipientsSummaryCustomersOnly', { customers: selectedCustomers.length })
                    : selectedVehicles.length > 0
                    ? t('customerCommunications.send.custom.recipientsSummaryVehiclesOnly', { vehicles: selectedVehicles.length })
                    : t('customerCommunications.send.custom.recipientsSummaryNone')}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Split View: Customers and Vehicles */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Customers Column */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">{t('customerCommunications.send.custom.selectCustomersTitle')}</CardTitle>
                <CardDescription>{t('customerCommunications.send.custom.selectCustomersDescription')}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center space-x-2">
                  <div className="flex-1">
                    <Input
                      placeholder={t('customerCommunications.send.custom.searchCustomersPlaceholder')}
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      data-testid="input-search-custom-customers"
                    />
                  </div>
                  <Select value={customerReservationFilter} onValueChange={(value: any) => setCustomerReservationFilter(value as 'all' | 'with-reservations' | 'without-reservations')}>
                    <SelectTrigger className="w-32" data-testid="select-reservation-filter">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t('customerCommunications.send.custom.filterAll')}</SelectItem>
                      <SelectItem value="with-reservations">{t('customerCommunications.send.custom.filterWithReservations')}</SelectItem>
                      <SelectItem value="without-reservations">{t('customerCommunications.send.custom.filterWithoutReservations')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-1 gap-2 max-h-96 overflow-y-auto">
                  {filteredCustomers.slice(0, 50).map((customer: any) => {
                    const isSelected = selectedCustomers.some(c => c.id === customer.id);
                    
                    return (
                      <div
                        key={customer.id}
                        className={`p-2 border rounded-lg cursor-pointer transition-colors hover:bg-gray-50 ${
                          isSelected ? 'border-green-500 bg-green-50' : 'border-gray-200'
                        }`}
                        onClick={() => {
                          if (isSelected) {
                            setSelectedCustomers(prev => prev.filter(c => c.id !== customer.id));
                          } else {
                            setSelectedCustomers(prev => [...prev, customer]);
                          }
                        }}
                        data-testid={`customer-card-${customer.id}`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm truncate">{customer.name}</div>
                            <div className="text-xs text-muted-foreground truncate">
                              {customer.email || t('customerCommunications.send.custom.noEmail')}
                            </div>
                          </div>
                          {isSelected && (
                            <CheckCircle className="h-4 w-4 text-green-600 flex-shrink-0 ml-2" />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {selectedCustomers.length > 0 && (
                  <div className="p-2 bg-green-50 rounded-lg border border-green-200 text-center">
                    <div className="text-sm font-medium text-green-900">
                      {t('customerCommunications.send.custom.selectedCount', { count: selectedCustomers.length })}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Vehicles Column */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">{t('customerCommunications.send.custom.selectVehiclesTitle')}</CardTitle>
                <CardDescription>{t('customerCommunications.send.custom.selectVehiclesDescription')}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Input
                    placeholder={t('customerCommunications.send.custom.searchVehiclesPlaceholder')}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    data-testid="input-search-custom-vehicles"
                  />
                </div>

                <div className="grid grid-cols-1 gap-2 max-h-96 overflow-y-auto">
                  {filteredVehicles.slice(0, 50).map((item: any) => {
                    const vehicle = item.vehicle;
                    const customer = item.customer;
                    const isSelected = selectedVehicles.some(v => v.id === vehicle.id);
                    
                    return (
                      <div
                        key={vehicle.id}
                        className={`p-2 border rounded-lg cursor-pointer transition-colors hover:bg-gray-50 ${
                          isSelected ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
                        }`}
                        onClick={() => {
                          if (isSelected) {
                            setSelectedVehicles(prev => prev.filter(v => v.id !== vehicle.id));
                          } else {
                            setSelectedVehicles(prev => [...prev, vehicle]);
                          }
                        }}
                        data-testid={`vehicle-card-custom-${vehicle.id}`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm truncate">{formatLicensePlate(vehicle.licensePlate)}</div>
                            <div className="text-xs text-muted-foreground truncate">
                              {vehicle.brand} {vehicle.model}
                            </div>
                            {customer && (
                              <div className="text-xs text-blue-600 truncate">
                                {t('customerCommunications.send.custom.customerLabel', { name: customer.name })}
                              </div>
                            )}
                          </div>
                          {isSelected && (
                            <CheckCircle className="h-4 w-4 text-blue-600 flex-shrink-0 ml-2" />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {selectedVehicles.length > 0 && (
                  <div className="p-2 bg-blue-50 rounded-lg border border-blue-200 text-center">
                    <div className="text-sm font-medium text-blue-900">
                      {t('customerCommunications.send.custom.selectedCount', { count: selectedVehicles.length })}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Custom Message Composition */}
          <Card>
            <CardHeader>
              <CardTitle>{t('customerCommunications.send.custom.messageCardTitle')}</CardTitle>
              <CardDescription>{t('customerCommunications.send.custom.messageCardDescription')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="custom-subject">{t('customerCommunications.send.custom.subjectLabel')}</Label>
                <Input
                  id="custom-subject"
                  placeholder={t('customerCommunications.send.custom.subjectPlaceholder')}
                  value={customSubject}
                  onChange={(e) => setCustomSubject(e.target.value)}
                  data-testid="input-custom-subject"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="custom-message">{t('customerCommunications.send.custom.messageLabel')}</Label>
                <Textarea
                  id="custom-message"
                  placeholder={t('customerCommunications.send.custom.messagePlaceholder')}
                  value={customMessage}
                  onChange={(e) => setCustomMessage(e.target.value)}
                  className="min-h-[120px]"
                  data-testid="textarea-custom-message"
                />
              </div>
              <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                <h4 className="font-medium text-blue-900 text-sm mb-2">{t('customerCommunications.send.custom.availablePlaceholdersTitle')}</h4>
                <div className="grid grid-cols-2 gap-2 text-xs text-blue-700">
                  <div><code>{"{customerName}"}</code> {t('customerCommunications.send.custom.placeholderCustomerName')}</div>
                  <div><code>{"{vehiclePlate}"}</code> {t('customerCommunications.send.custom.placeholderVehiclePlate')}</div>
                  <div><code>{"{vehicleBrand}"}</code> {t('customerCommunications.send.custom.placeholderVehicleBrand')}</div>
                  <div><code>{"{vehicleModel}"}</code> {t('customerCommunications.send.custom.placeholderVehicleModel')}</div>
                  <div><code>{"{companyName}"}</code> {t('customerCommunications.send.custom.placeholderCompanyName')}</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

          </Tabs>
        </TabsContent>

        <TabsContent value="history" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{t('customerCommunications.history.cardTitle')}</CardTitle>
              <CardDescription>{t('customerCommunications.history.cardDescription')}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {notificationHistory.map((notification) => {
                  const info = getTemplateInfo(notification.type);
                  const Icon = info.icon;
                  const successRate = notification.emailsSent / (notification.emailsSent + notification.emailsFailed) * 100;
                  
                  return (
                    <div key={notification.id} className="p-4 border rounded-lg">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center space-x-4">
                          <Icon className={`h-5 w-5 ${info.color}`} />
                          <div>
                            <div className="font-medium">{notification.subject}</div>
                            <div className="text-sm text-muted-foreground">
                              {new Date(notification.sentAt).toLocaleDateString('nl-NL')} at {new Date(notification.sentAt).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}
                            </div>
                          </div>
                        </div>
                        <Badge variant={notification.status === 'sent' ? 'default' : 'destructive'}>
                          {t(`customerCommunications.history.statusLabels.${notification.status}`)}
                        </Badge>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-3">
                        <div className="p-3 bg-green-50 rounded-lg border border-green-200">
                          <div className="text-sm font-medium text-green-900">{t('customerCommunications.history.sentSuccessfully')}</div>
                          <div className="text-lg font-bold text-green-700">{notification.emailsSent}</div>
                        </div>

                        <div className="p-3 bg-red-50 rounded-lg border border-red-200">
                          <div className="text-sm font-medium text-red-900">{t('customerCommunications.history.failed')}</div>
                          <div className="text-lg font-bold text-red-700">{notification.emailsFailed}</div>
                        </div>

                        <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                          <div className="text-sm font-medium text-blue-900">{t('customerCommunications.history.successRate')}</div>
                          <div className="text-lg font-bold text-blue-700">{successRate.toFixed(1)}%</div>
                        </div>
                      </div>

                      {notification.failureReason && (
                        <div className="mt-3 p-2 bg-yellow-50 rounded border border-yellow-200">
                          <div className="text-sm text-yellow-800">
                            <strong>{t('customerCommunications.history.failureReasonLabel')}</strong> {notification.failureReason}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analytics" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center">
                  <div className="p-3 bg-green-100 rounded-full mr-4">
                    <CheckCircle className="h-6 w-6 text-green-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-green-600">
                      {notificationHistory.reduce((sum, n) => sum + n.emailsSent, 0)}
                    </p>
                    <p className="text-sm text-muted-foreground">{t('customerCommunications.analytics.totalEmailsSent')}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center">
                  <div className="p-3 bg-red-100 rounded-full mr-4">
                    <AlertTriangle className="h-6 w-6 text-red-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-red-600">
                      {notificationHistory.reduce((sum, n) => sum + n.emailsFailed, 0)}
                    </p>
                    <p className="text-sm text-muted-foreground">{t('customerCommunications.analytics.failedEmails')}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center">
                  <div className="p-3 bg-blue-100 rounded-full mr-4">
                    <Mail className="h-6 w-6 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-blue-600">
                      {notificationHistory.length}
                    </p>
                    <p className="text-sm text-muted-foreground">{t('customerCommunications.analytics.totalCampaigns')}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center">
                  <div className="p-3 bg-purple-100 rounded-full mr-4">
                    <Users className="h-6 w-6 text-purple-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-purple-600">
                      {vehiclesWithReservations.length}
                    </p>
                    <p className="text-sm text-muted-foreground">{t('customerCommunications.analytics.activeCustomers')}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>{t('customerCommunications.analytics.performanceCardTitle')}</CardTitle>
              <CardDescription>{t('customerCommunications.analytics.performanceCardDescription')}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="p-4 border rounded-lg">
                    <h4 className="font-medium text-sm mb-2">{t('customerCommunications.analytics.apkNotifications')}</h4>
                    <div className="text-2xl font-bold text-orange-600">
                      {notificationHistory.filter(n => n.type === 'apk').reduce((sum, n) => sum + n.emailsSent, 0)}
                    </div>
                    <p className="text-xs text-muted-foreground">{t('customerCommunications.analytics.emailsSentLabel')}</p>
                  </div>

                  <div className="p-4 border rounded-lg">
                    <h4 className="font-medium text-sm mb-2">{t('customerCommunications.analytics.maintenanceReminders')}</h4>
                    <div className="text-2xl font-bold text-blue-600">
                      {notificationHistory.filter(n => n.type === 'maintenance').reduce((sum, n) => sum + n.emailsSent, 0)}
                    </div>
                    <p className="text-xs text-muted-foreground">{t('customerCommunications.analytics.emailsSentLabel')}</p>
                  </div>

                  <div className="p-4 border rounded-lg">
                    <h4 className="font-medium text-sm mb-2">{t('customerCommunications.analytics.customMessages')}</h4>
                    <div className="text-2xl font-bold text-green-600">
                      {notificationHistory.filter(n => n.type === 'custom').reduce((sum, n) => sum + n.emailsSent, 0)}
                    </div>
                    <p className="text-xs text-muted-foreground">{t('customerCommunications.analytics.emailsSentLabel')}</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="templates" className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-medium">{t('customerCommunications.templates.sectionTitle')}</h3>
              <p className="text-sm text-muted-foreground">{t('customerCommunications.templates.sectionDescription')}</p>
            </div>
            <Button
              onClick={() => {
                setEditingTemplate(null);
                setTemplateName("");
                setTemplateSubject("");
                setTemplateContent("");
              }}
              className="bg-green-600 hover:bg-green-700"
            >
              <Mail className="h-4 w-4 mr-2" />
              {t('customerCommunications.templates.newTemplateButton')}
            </Button>
          </div>

          <div className="space-y-6">
            {/* Template Builder and Live Preview Row */}
            <div className={`${showLivePreview ? 'grid grid-cols-1 xl:grid-cols-3 gap-6' : ''}`}>
              {/* Template Builder */}
              <Card className={showLivePreview ? 'xl:col-span-2' : ''}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>
                        {editingTemplate ? t('customerCommunications.templates.editTemplateTitle') : t('customerCommunications.templates.createTemplateTitle')}
                      </CardTitle>
                      <CardDescription>
                        {t('customerCommunications.templates.builderDescription')}
                      </CardDescription>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setShowLivePreview(!showLivePreview)}
                      className="text-xs shrink-0"
                    >
                      <Eye className="h-3 w-3 mr-1" />
                      {showLivePreview ? t('customerCommunications.templates.hideLivePreview') : t('customerCommunications.templates.showLivePreview')}
                    </Button>
                  </div>
                </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="template-name">{t('customerCommunications.templates.templateNameLabel')}</Label>
                  <Input
                    id="template-name"
                    placeholder={t('customerCommunications.templates.templateNamePlaceholder')}
                    value={templateName}
                    onChange={(e) => setTemplateName(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="template-subject">{t('customerCommunications.templates.emailSubjectLabel')}</Label>
                  <Input
                    ref={templateSubjectRef}
                    id="template-subject"
                    placeholder={t('customerCommunications.templates.subjectPlaceholder')}
                    value={templateSubject}
                    onChange={(e) => setTemplateSubject(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="template-category">{t('customerCommunications.templates.categoryLabel')}</Label>
                  <Select value={templateCategory} onValueChange={(value: 'apk' | 'maintenance' | 'custom') => setTemplateCategory(value)}>
                    <SelectTrigger>
                      <SelectValue placeholder={t('customerCommunications.templates.categoryPlaceholder')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="apk">{t('customerCommunications.templates.categoryApk')}</SelectItem>
                      <SelectItem value="maintenance">{t('customerCommunications.templates.categoryMaintenance')}</SelectItem>
                      <SelectItem value="custom">{t('customerCommunications.templates.categoryCustom')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="template-content">{t('customerCommunications.templates.emailContentLabel')}</Label>
                  <textarea
                    ref={templateContentRef}
                    id="template-content"
                    placeholder={t('customerCommunications.templates.contentPlaceholder')}
                    value={templateContent}
                    onChange={(e) => setTemplateContent(e.target.value)}
                    className="w-full min-h-[200px] p-3 border rounded-md resize-vertical font-mono text-sm"
                  />
                </div>

                {/* Placeholder Buttons */}
                <div className="space-y-3">
                  <h4 className="font-medium text-gray-900 text-sm">{t('customerCommunications.templates.insertPlaceholdersTitle')}</h4>
                  
                  {/* Placeholder buttons grid */}
                  <div className={`grid gap-2 ${showLivePreview ? 'grid-cols-2' : 'grid-cols-2 md:grid-cols-3'}`}>
                    {placeholders.map((placeholder) => (
                      <Button
                        key={placeholder.key}
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => insertPlaceholder(`{${placeholder.key}}`)}
                        className="text-xs justify-start h-8 px-2"
                        title={placeholder.description}
                        data-testid={`button-placeholder-${placeholder.key}`}
                      >
                        <span className="font-mono text-blue-600">{`{${placeholder.key}}`}</span>
                        <span className="ml-2 text-gray-600 truncate">{placeholder.label}</span>
                      </Button>
                    ))}
                  </div>
                  
                  <div className="text-xs text-muted-foreground">
                    {t('customerCommunications.templates.insertTip')}
                  </div>
                </div>


                <div className="flex space-x-2">
                  <Button
                    onClick={async () => {
                      if (!templateName.trim() || !templateSubject.trim() || !templateContent.trim()) {
                        toast({
                          title: t('customerCommunications.toasts.missingInformationTitle'),
                          description: t('customerCommunications.toasts.templateFieldsMissingDescription'),
                          variant: "destructive",
                        });
                        return;
                      }
                      
                      setIsLoadingTemplates(true);
                      
                      try {
                        const method = editingTemplate ? 'PUT' : 'POST';
                        const url = editingTemplate 
                          ? `/api/email-templates/${editingTemplate}` 
                          : '/api/email-templates';
                        
                        const response = await fetch(url, {
                          method,
                          headers: {
                            'Content-Type': 'application/json',
                          },
                          credentials: 'include',
                          body: JSON.stringify({
                            name: templateName,
                            subject: templateSubject,
                            content: templateContent,
                            category: templateCategory,
                          }),
                        });

                        if (!response.ok) {
                          throw new Error(t('customerCommunications.toasts.saveTemplateRequestFailed', { status: response.statusText }));
                        }

                        const result = await response.json();

                        toast({
                          title: editingTemplate ? t('customerCommunications.toasts.templateUpdatedTitle') : t('customerCommunications.toasts.templateCreatedTitle'),
                          description: t('customerCommunications.toasts.templateSavedDescription', { name: templateName }),
                        });

                        // Reset form
                        setTemplateName("");
                        setTemplateSubject("");
                        setTemplateContent("");
                        setEditingTemplate(null);
                        
                        // Refresh templates list (you'd implement this)
                        // fetchTemplates();
                      } catch (error) {
                        console.error('Failed to save template:', error);
                        toast({
                          title: t('customerCommunications.toasts.saveTemplateFailedTitle'),
                          description: error instanceof Error ? error.message : t('customerCommunications.toasts.genericError'),
                          variant: "destructive",
                        });
                      } finally {
                        setIsLoadingTemplates(false);
                      }
                    }}
                    disabled={isLoadingTemplates}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    {isLoadingTemplates ? t('customerCommunications.templates.savingButton') : (editingTemplate ? t('customerCommunications.templates.updateTemplateButton') : t('customerCommunications.templates.saveTemplateButton'))}
                  </Button>

                  {editingTemplate && (
                    <Button
                      variant="outline"
                      onClick={() => {
                        setEditingTemplate(null);
                        setTemplateName("");
                        setTemplateSubject("");
                        setTemplateContent("");
                      }}
                    >
                      {t('customerCommunications.templates.cancelButton')}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>

              {/* Live Preview Panel - Only shown when preview is enabled */}
              {showLivePreview && (
                <Card className="xl:sticky xl:top-6 h-fit">
                  <CardHeader>
                    <div className="flex items-center space-x-2">
                      <Eye className="h-4 w-4 text-blue-600" />
                      <CardTitle className="text-lg">{t('customerCommunications.templates.livePreviewTitle')}</CardTitle>
                      <Badge variant="secondary" className="text-xs">{t('customerCommunications.templates.sampleDataBadge')}</Badge>
                    </div>
                    <CardDescription>
                      {t('customerCommunications.templates.livePreviewDescription')}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="border rounded-lg bg-gradient-to-br from-blue-50 to-indigo-50 p-4">
                      <div className="bg-white border rounded-lg shadow-sm p-4 space-y-3">
                        <div className="border-b pb-3">
                          <div className="text-xs text-gray-500 mb-1">{t('customerCommunications.templates.fromLabel')}</div>
                          <div className="text-xs text-gray-500 mb-2">{t('customerCommunications.templates.toLabelSample')}</div>
                          {templateSubject ? (
                            <div className="font-semibold text-gray-900">
                              {getPreviewContent().subject}
                            </div>
                          ) : (
                            <div className="text-gray-400 italic text-sm">{t('customerCommunications.templates.subjectPreviewPlaceholder')}</div>
                          )}
                        </div>

                        <div className="space-y-2">
                          {templateContent ? (
                            <div className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">
                              {getPreviewContent().content}
                            </div>
                          ) : (
                            <div className="text-sm text-gray-400 italic">
                              {t('customerCommunications.templates.contentPreviewPlaceholder')}
                            </div>
                          )}
                        </div>

                        {(templateSubject || templateContent) && (
                          <div className="pt-3 border-t text-xs text-gray-500 bg-gray-50 -mx-4 -mb-3 px-4 py-3 rounded-b-lg">
                            <div className="space-y-1">
                              <div><strong>{t('customerCommunications.templates.sampleDataUsedLabel')}</strong></div>
                              <div>{t('customerCommunications.templates.sampleCustomer')}</div>
                              <div>{t('customerCommunications.templates.sampleVehicle')}</div>
                              <div>{t('customerCommunications.templates.sampleApkDate')}</div>
                              <div>{t('customerCommunications.templates.sampleCompany')}</div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Saved Templates - Full Width Section */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>{t('customerCommunications.templates.savedTemplatesTitle', { count: savedTemplates.length })}</CardTitle>
                    <CardDescription>{t('customerCommunications.templates.savedTemplatesDescription')}</CardDescription>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Input
                      placeholder={t('customerCommunications.templates.searchTemplatesPlaceholder')}
                      value={templateSearchQuery}
                      onChange={(e) => setTemplateSearchQuery(e.target.value)}
                      className="w-40"
                      data-testid="input-search-templates"
                    />
                    <Select value={templateCategoryFilter} onValueChange={(value: any) => setTemplateCategoryFilter(value as 'all' | 'apk' | 'maintenance' | 'custom')}>
                      <SelectTrigger className="w-32" data-testid="select-template-category">
                        <SelectValue placeholder={t('customerCommunications.templates.categoryFilterPlaceholder')} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">{t('customerCommunications.templates.categoryAll')}</SelectItem>
                        <SelectItem value="apk">{t('customerCommunications.templates.categoryApkShort')}</SelectItem>
                        <SelectItem value="maintenance">{t('customerCommunications.templates.categoryMaintenance')}</SelectItem>
                        <SelectItem value="custom">{t('customerCommunications.templates.categoryCustom')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {savedTemplates.length === 0 ? (
                  <div className="text-center py-8">
                    <Mail className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <h3 className="text-lg font-medium mb-2">{t('customerCommunications.templates.noTemplatesYetTitle')}</h3>
                    <p className="text-muted-foreground mb-4">
                      {t('customerCommunications.templates.noTemplatesYetDescription')}
                    </p>
                    <Button
                      onClick={() => {
                        setEditingTemplate(null);
                        setTemplateName("");
                        setTemplateSubject("");
                        setTemplateContent("");
                        setTemplateCategory("custom");
                      }}
                      className="bg-green-600 hover:bg-green-700"
                    >
                      <Mail className="h-4 w-4 mr-2" />
                      {t('customerCommunications.templates.createTemplateButton')}
                    </Button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
                    {filteredTemplates.map((template: any) => (
                      <div key={template.id} className="p-4 border rounded-lg hover:shadow-sm transition-shadow bg-white" data-testid={`template-card-${template.id}`}>
                        <div className="space-y-3">
                          <div className="flex items-start justify-between">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center space-x-2 mb-2">
                                <h4 className="font-medium text-sm truncate">{template.name}</h4>
                                <Badge className={`text-xs ${getCategoryBadgeColor(template.category)}`}>
                                  {template.category?.toUpperCase() || t('customerCommunications.templates.defaultCategoryBadge')}
                                </Badge>
                              </div>
                              <p className="text-xs text-muted-foreground mb-2 truncate">{template.subject}</p>
                              <p className="text-xs text-gray-500 mb-2 line-clamp-3 leading-relaxed">{template.content}</p>
                              <div className="text-xs text-muted-foreground space-y-1">
                                <div>{t('customerCommunications.templates.createdLabel', { date: new Date(template.createdAt).toLocaleDateString('nl-NL') })}</div>
                                {template.lastUsed && (
                                  <div>{t('customerCommunications.templates.lastUsedLabel', { date: new Date(template.lastUsed).toLocaleDateString('nl-NL') })}</div>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="flex flex-wrap gap-1 pt-2 border-t">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handlePreviewTemplate(template)}
                              data-testid={`button-preview-${template.id}`}
                              title={t('customerCommunications.templates.previewTitle')}
                              className="h-8 px-2 text-xs"
                            >
                              <Eye className="h-3 w-3 mr-1" />
                              {t('customerCommunications.templates.previewButton')}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => duplicateTemplate(template)}
                              data-testid={`button-duplicate-${template.id}`}
                              title={t('customerCommunications.templates.duplicateTitle')}
                              className="h-8 px-2 text-xs"
                            >
                              <Copy className="h-3 w-3 mr-1" />
                              {t('customerCommunications.templates.copyButton')}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setEditingTemplate(template.id);
                                setTemplateName(template.name);
                                setTemplateSubject(template.subject);
                                setTemplateContent(template.content);
                                setTemplateCategory(template.category || "custom");
                              }}
                              data-testid={`button-edit-${template.id}`}
                              title={t('customerCommunications.templates.editTitle')}
                              className="h-8 px-2 text-xs"
                            >
                              <Edit className="h-3 w-3 mr-1" />
                              {t('customerCommunications.templates.editButton')}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-red-600 hover:text-red-700 h-8 px-2 text-xs"
                              onClick={() => handleDeleteTemplate(template)}
                              data-testid={`button-delete-${template.id}`}
                              title={t('customerCommunications.templates.deleteTitle')}
                            >
                              <Trash2 className="h-3 w-3 mr-1" />
                              {t('customerCommunications.templates.deleteButton')}
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Email Preview Dialog - Moved outside tabs to be accessible from all tabs */}
      <Dialog open={previewDialogOpen} onOpenChange={setPreviewDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('customerCommunications.dialogs.emailPreview.title')}</DialogTitle>
            <DialogDescription>
              {t('customerCommunications.dialogs.emailPreview.descriptionReview', { count: emailPreview?.recipients.length || 0 })}
            </DialogDescription>
          </DialogHeader>

          {emailPreview && (
            <div className="space-y-6">
              {/* Email Content Preview */}
              <div className="space-y-4">
                <div>
                  <Label className="text-sm font-medium">{t('customerCommunications.dialogs.emailPreview.subjectLabel')}</Label>
                  <div className="mt-1 p-3 bg-gray-50 rounded border">
                    <p className="font-medium">{emailPreview.subject}</p>
                  </div>
                </div>

                <div>
                  <Label className="text-sm font-medium">{t('customerCommunications.dialogs.emailPreview.contentLabel')}</Label>
                  <div className="mt-1 p-4 bg-gray-50 rounded border">
                    <pre className="whitespace-pre-wrap text-sm leading-relaxed font-sans">
                      {emailPreview.content}
                    </pre>
                  </div>
                </div>
              </div>

              {/* Recipients List */}
              <div>
                <Label className="text-sm font-medium">
                  {t('customerCommunications.dialogs.emailPreview.recipientsLabel', { count: emailPreview.recipients.length })}
                </Label>
                <div className="mt-2 max-h-48 overflow-y-auto border rounded">
                  <div className="divide-y">
                    {emailPreview.recipients.map((recipient, index) => (
                      <div key={index} className="p-3 space-y-2">
                        <div className="flex justify-between items-start">
                          <div className="space-y-1 flex-1">
                            <div className="font-medium text-sm">{recipient.name}</div>
                            <div className="text-xs text-blue-600 font-mono">
                              {recipient.vehicleLicense}
                            </div>
                          </div>
                          {recipient.emailField !== "none" && (
                            <Badge variant="outline" className="text-xs">
                              {recipient.emailField === "email" && t('customerCommunications.emailOptionLabels.email')}
                              {recipient.emailField === "emailForMOT" && t('customerCommunications.emailOptionLabels.emailForMOT')}
                              {recipient.emailField === "emailForInvoices" && t('customerCommunications.emailOptionLabels.emailForInvoices')}
                              {recipient.emailField === "emailGeneral" && t('customerCommunications.emailOptionLabels.emailGeneral')}
                            </Badge>
                          )}
                        </div>
                        {/* Email Selection */}
                        <div className="space-y-2">
                          {recipient.emailOptions.length > 1 ? (
                            <div className="space-y-1">
                              <Label className="text-xs font-medium">{t('customerCommunications.dialogs.emailPreview.selectEmailLabel')}</Label>
                              <Select 
                                value={recipient.emailField} 
                                onValueChange={(value) => handleEmailSelection(index, value)}
                              >
                                <SelectTrigger className="w-full h-8 text-xs">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {recipient.emailOptions.map((option) => (
                                    <SelectItem key={option.value} value={option.value}>
                                      <div className="flex items-center justify-between w-full">
                                        <span className="font-medium">{option.label}</span>
                                        <span className="text-muted-foreground ml-2">{option.email}</span>
                                      </div>
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          ) : (
                            <div className="text-xs text-muted-foreground">
                              <span className="font-medium">{t('customerCommunications.dialogs.emailPreview.emailLabel')}</span> {recipient.email}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Summary */}
              <div className="bg-blue-50 border border-blue-200 rounded p-4">
                <div className="flex items-center space-x-2">
                  <Mail className="h-4 w-4 text-blue-600" />
                  <span className="text-sm font-medium text-blue-900">
                    {t('customerCommunications.dialogs.emailPreview.readyToSend', { count: emailPreview.recipients.length })}
                  </span>
                </div>
                <p className="text-xs text-blue-700 mt-1">
                  {t('customerCommunications.dialogs.emailPreview.personalizedNote')}
                </p>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewDialogOpen(false)}>
              {t('customerCommunications.dialogs.emailPreview.cancelButton')}
            </Button>
            <Button
              onClick={confirmSendNotifications}
              disabled={isLoadingNotifications}
              className="bg-green-600 hover:bg-green-700"
            >
              {isLoadingNotifications ? t('customerCommunications.dialogs.emailPreview.sendingButton') : t('customerCommunications.dialogs.emailPreview.confirmSendButton')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Template Preview Dialog */}
      <Dialog open={templatePreviewDialog} onOpenChange={setTemplatePreviewDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('customerCommunications.dialogs.templatePreview.title')}</DialogTitle>
            <DialogDescription>
              {t('customerCommunications.dialogs.templatePreview.description')}
            </DialogDescription>
          </DialogHeader>
          {selectedTemplateForPreview && (
            <div className="space-y-4">
              <div className="p-4 border rounded-lg bg-white">
                <div className="border-b pb-3 mb-3">
                  <div className="flex items-center justify-between">
                    <div className="font-medium text-sm text-gray-600">{t('customerCommunications.dialogs.templatePreview.fromLabel')}</div>
                    <Badge className={getCategoryBadgeColor(selectedTemplateForPreview.category)}>
                      {selectedTemplateForPreview.category?.toUpperCase() || t('customerCommunications.templates.defaultCategoryBadge')}
                    </Badge>
                  </div>
                  <div className="font-medium text-sm text-gray-600 mt-1">{t('customerCommunications.dialogs.templatePreview.toLabel')}</div>
                  <div className="font-bold text-lg mt-2">{selectedTemplateForPreview.subject}</div>
                </div>
                <div className="whitespace-pre-wrap text-gray-900">
                  {selectedTemplateForPreview.content}
                </div>
              </div>
              <div className="text-xs text-muted-foreground">
                <div><strong>{t('customerCommunications.dialogs.templatePreview.templateLabel')}</strong> {selectedTemplateForPreview.name}</div>
                <div><strong>{t('customerCommunications.dialogs.templatePreview.categoryLabel')}</strong> {selectedTemplateForPreview.category || t('customerCommunications.dialogs.templatePreview.defaultCategory')}</div>
                <div><strong>{t('customerCommunications.dialogs.templatePreview.createdLabel')}</strong> {new Date(selectedTemplateForPreview.createdAt).toLocaleDateString()}</div>
                {selectedTemplateForPreview.lastUsed && (
                  <div><strong>{t('customerCommunications.dialogs.templatePreview.lastUsedLabel')}</strong> {new Date(selectedTemplateForPreview.lastUsed).toLocaleDateString()}</div>
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setTemplatePreviewDialog(false)}>
              {t('customerCommunications.dialogs.templatePreview.closeButton')}
            </Button>
            {selectedTemplateForPreview && (
              <Button onClick={() => {
                setTemplatePreviewDialog(false);
                setEditingTemplate(selectedTemplateForPreview.id);
                setTemplateName(selectedTemplateForPreview.name);
                setTemplateSubject(selectedTemplateForPreview.subject);
                setTemplateContent(selectedTemplateForPreview.content);
                setTemplateCategory(selectedTemplateForPreview.category || "custom");
              }}>
                <Edit className="mr-2 h-4 w-4" />
                {t('customerCommunications.dialogs.templatePreview.editTemplateButton')}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Template Confirmation Dialog */}
      <Dialog open={!!templateToDelete} onOpenChange={() => setTemplateToDelete(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('customerCommunications.dialogs.deleteTemplate.title')}</DialogTitle>
            <DialogDescription>
              {t('customerCommunications.dialogs.deleteTemplate.description', { name: templateToDelete?.name })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTemplateToDelete(null)}>
              {t('customerCommunications.dialogs.deleteTemplate.cancelButton')}
            </Button>
            <Button
              onClick={confirmDeleteTemplate}
              className="bg-red-600 hover:bg-red-700"
            >
              {t('customerCommunications.dialogs.deleteTemplate.deleteButton')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}