import { useState, useRef } from "react";
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
        title: "No Customers Selected",
        description: "Please select at least one customer",
        variant: "destructive",
      });
      return;
    }
    
    if (communicationMode !== 'custom' && selectedVehicles.length === 0) {
      toast({
        title: "No Vehicles Selected",
        description: "Please select at least one vehicle",
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
          title: "Template Error",
          description: "Selected template not found",
          variant: "destructive",
        });
        return;
      }
    } else {
      // When no template is selected
      if (communicationMode === 'apk' || communicationMode === 'maintenance') {
        // APK and Maintenance modes require template selection
        toast({
          title: "Template Required",
          description: `Please select a template for ${communicationMode} reminders`,
          variant: "destructive",
        });
        return;
      } else {
        // Custom mode - require custom message and subject when no template is selected
        if (!customMessage.trim() || !customSubject.trim()) {
          toast({
            title: "Missing Information",
            description: "Please enter both subject and message for the notification",
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
        throw new Error(`Failed to send notifications: ${response.statusText}`);
      }

      const result = await response.json();
      
      toast({
        title: "Notifications Sent Successfully",
        description: `${result.sent} emails sent, ${result.failed || 0} failed`,
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
        title: "Failed to Send Notifications",
        description: error instanceof Error ? error.message : "An error occurred",
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
        title: "No Customers Selected",
        description: "Please select at least one customer",
        variant: "destructive",
      });
      return;
    }
    
    // Check if APK/Maintenance mode and vehicles are selected  
    if (communicationMode !== 'custom' && selectedVehicles.length === 0) {
      toast({
        title: "No Vehicles Selected",
        description: "Please select at least one vehicle",
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
          title: "Template Error",
          description: "Selected template not found",
          variant: "destructive",
        });
        return;
      }
    } else {
      // When no template is selected
      if (communicationMode === 'apk' || communicationMode === 'maintenance') {
        // APK and Maintenance modes require template selection
        toast({
          title: "Template Required",
          description: `Please select a template for ${communicationMode} reminders`,
          variant: "destructive",
        });
        return;
      } else {
        // Custom mode - require custom message and subject when no template is selected
        if (!customMessage.trim() || !customSubject.trim()) {
          toast({
            title: "Missing Information",
            description: "Please enter both subject and message for the notification",
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
            label: "Primary",
            email: customer.email
          });
        }
        if (customer.emailForMOT) {
          emailOptions.push({
            value: "emailForMOT",
            label: "APK/MOT",
            email: customer.emailForMOT
          });
        }
        if (customer.emailForInvoices) {
          emailOptions.push({
            value: "emailForInvoices",
            label: "Invoice",
            email: customer.emailForInvoices
          });
        }
        if (customer.emailGeneral) {
          emailOptions.push({
            value: "emailGeneral",
            label: "General",
            email: customer.emailGeneral
          });
        }
        
        // Select default email (prioritize primary email)
        let selectedEmailField = "none";
        let selectedEmail = "No email";
        
        if (emailOptions.length > 0) {
          const primaryOption = emailOptions.find(opt => opt.value === "email");
          const defaultOption = primaryOption || emailOptions[0];
          selectedEmailField = defaultOption.value;
          selectedEmail = defaultOption.email;
        }
        
        return {
          name: customer?.name || "Customer",
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
              label: "Primary",
              email: customer.email
            });
          }
          if (customer.emailForMOT) {
            emailOptions.push({
              value: "emailForMOT",
              label: "APK/MOT",
              email: customer.emailForMOT
            });
          }
          if (customer.emailForInvoices) {
            emailOptions.push({
              value: "emailForInvoices",
              label: "Invoice",
              email: customer.emailForInvoices
            });
          }
          if (customer.emailGeneral) {
            emailOptions.push({
              value: "emailGeneral",
              label: "General",
              email: customer.emailGeneral
            });
          }
        }
        
        // Select default email (prioritize primary email)
        let selectedEmailField = "none";
        let selectedEmail = "No email";
        
        if (emailOptions.length > 0) {
          const primaryOption = emailOptions.find(opt => opt.value === "email");
          const defaultOption = primaryOption || emailOptions[0];
          selectedEmailField = defaultOption.value;
          selectedEmail = defaultOption.email;
        }
        
        return {
          name: customer?.name || "Customer",
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
      : "[License Plate]";
    
    const formattedApkDate = sampleVehicle?.apkDate 
      ? new Date(sampleVehicle.apkDate).toLocaleDateString('nl-NL')
      : "[APK Date]";

    // Replace placeholders in both subject and content
    const processedSubject = subject
      .replace(/\{customerName\}/g, sampleCustomer?.name || "[Customer Name]")
      .replace(/\{vehiclePlate\}/g, formattedPlate)
      .replace(/\{vehicleBrand\}/g, sampleVehicle?.brand || "[Brand]")
      .replace(/\{vehicleModel\}/g, sampleVehicle?.model || "[Model]")
      .replace(/\{apkDate\}/g, formattedApkDate);
    
    const processedContent = content
      .replace(/\{customerName\}/g, sampleCustomer?.name || "[Customer Name]")
      .replace(/\{vehiclePlate\}/g, formattedPlate)
      .replace(/\{vehicleBrand\}/g, sampleVehicle?.brand || "[Brand]")
      .replace(/\{vehicleModel\}/g, sampleVehicle?.model || "[Model]")
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
        throw new Error(`Failed to delete template: ${response.statusText}`);
      }

      toast({
        title: "Template Deleted",
        description: `Template "${templateToDelete.name}" has been deleted successfully.`,
      });

      // Refresh templates - this will happen automatically via react-query
      setTemplateToDelete(null);
    } catch (error) {
      console.error('Failed to delete template:', error);
      toast({
        title: "Failed to Delete Template",
        description: error instanceof Error ? error.message : "An error occurred",
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
      title: "Template Duplicated",
      description: "Template content has been copied to the editor. Modify and save as new template.",
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
    { key: 'customerName', label: 'Customer Name', description: "Customer's full name" },
    { key: 'vehiclePlate', label: 'License Plate', description: "Vehicle license plate" },
    { key: 'vehicleBrand', label: 'Vehicle Brand', description: "Vehicle brand/make" },
    { key: 'vehicleModel', label: 'Vehicle Model', description: "Vehicle model" },
    { key: 'apkDate', label: 'APK Date', description: "APK expiry date" },
    { key: 'companyName', label: 'Company Name', description: "Your company name" },
    { key: 'maintenanceDate', label: 'Maintenance Date', description: "Last maintenance date" },
    { key: 'customerEmail', label: 'Customer Email', description: "Customer's email address" },
    { key: 'customerPhone', label: 'Customer Phone', description: "Customer's phone number" },
    { key: 'reservationStart', label: 'Reservation Start', description: "Reservation start date" },
    { key: 'reservationEnd', label: 'Reservation End', description: "Reservation end date" }
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
          title: "APK Reminder",
          icon: Shield,
          description: "Send APK inspection reminders to customers",
          color: "text-orange-600"
        };
      case "maintenance":
        return {
          title: "Maintenance Reminder", 
          icon: Wrench,
          description: "Send scheduled maintenance reminders",
          color: "text-blue-600"
        };
      case "custom":
        return {
          title: "Custom Message",
          icon: Mail,
          description: "Send custom messages to customers",
          color: "text-green-600"
        };
      default:
        return {
          title: "Unknown",
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
          <h1 className="text-3xl font-bold tracking-tight">Customer Communications</h1>
          <p className="text-muted-foreground">
            Manage and send notifications to your customers
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Users className="h-5 w-5 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">
            {customers.length} customers • {vehiclesWithReservations.length} vehicles with reservations
          </span>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="send" className="flex items-center space-x-2">
            <Send className="h-4 w-4" />
            <span>Send Notifications</span>
          </TabsTrigger>
          <TabsTrigger value="templates" className="flex items-center space-x-2">
            <Mail className="h-4 w-4" />
            <span>Template Builder</span>
          </TabsTrigger>
          <TabsTrigger value="history" className="flex items-center space-x-2">
            <Clock className="h-4 w-4" />
            <span>Email Log</span>
          </TabsTrigger>
          <TabsTrigger value="analytics" className="flex items-center space-x-2">
            <AlertTriangle className="h-4 w-4" />
            <span>Analytics</span>
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
                <span>APK Reminders</span>
              </TabsTrigger>
              <TabsTrigger value="maintenance" className="flex items-center space-x-2" data-testid="tab-maintenance">
                <Wrench className="h-4 w-4" />
                <span>Maintenance</span>
              </TabsTrigger>
              <TabsTrigger value="custom" className="flex items-center space-x-2" data-testid="tab-custom">
                <Mail className="h-4 w-4" />
                <span>Custom Message</span>
              </TabsTrigger>
            </TabsList>

            {/* APK Tab */}
            <TabsContent value="apk" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>APK Reminder Notifications</CardTitle>
                  <CardDescription>Send APK inspection reminders to customers with upcoming or overdue inspections</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Template Selection */}
                  <div className="space-y-2">
                    <Label htmlFor="apk-template-select" className="text-sm font-medium">
                      Email Template
                    </Label>
                    <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
                      <SelectTrigger className="w-full" data-testid="select-apk-template">
                        <SelectValue placeholder="Select an APK reminder template" />
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
                            No templates available. Create templates in the "Templates" tab.
                          </div>
                        )}
                      </SelectContent>
                    </Select>
                    {selectedTemplateId && (
                      <div className="text-xs text-muted-foreground">
                        Template selected: {
                          savedTemplates.find((t: any) => t.id.toString() === selectedTemplateId)?.name || selectedTemplateId
                        }
                      </div>
                    )}
                  </div>

                  <div className="flex items-center space-x-4 mb-4">
                    <div className="flex-1">
                      <Label htmlFor="search-apk" className="text-sm font-medium sr-only">Search</Label>
                      <Input
                        id="search-apk"
                        placeholder="Search by license plate, brand, or model..."
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
                      Preview & Send to {selectedVehicles.length} vehicles
                    </Button>
                  </div>

              {/* Filter Information */}
              {vehicleFilter !== "all" && (
                <div className="p-4 border-l-4 border-blue-500 bg-blue-50 rounded-r">
                  {vehicleFilter === "apk" && (
                    <div className="flex items-start space-x-2">
                      <Shield className="h-5 w-5 text-blue-600 mt-0.5" />
                      <div>
                        <p className="font-medium text-blue-900">APK Reminder Filter Active</p>
                        <p className="text-sm text-blue-700">
                          Showing vehicles with APK expiring within 2 months (60 days). 
                          Vehicles are sorted by urgency: most urgent first.
                        </p>
                      </div>
                    </div>
                  )}
                  {vehicleFilter === "maintenance" && (
                    <div className="flex items-start space-x-2">
                      <Wrench className="h-5 w-5 text-blue-600 mt-0.5" />
                      <div>
                        <p className="font-medium text-blue-900">Maintenance Reminder Filter Active</p>
                        <p className="text-sm text-blue-700">
                          Showing vehicles that need maintenance (no maintenance recorded in the last year). 
                          Vehicles never maintained are prioritized.
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
                        Customer: {customer.name}
                      </div>
                      
                      {/* Filter-specific information */}
                      {filterInfo && (
                        <div className="mb-2">
                          {vehicleFilter === 'apk' && (
                            <div className="space-y-1">
                              <div className={`inline-block px-2 py-1 rounded text-xs font-medium ${
                                getUrgencyColor(filterInfo.urgencyLevel)
                              }`}>
                                {filterInfo.urgencyLevel === 'overdue' ? 'APK OVERDUE' :
                                 filterInfo.urgencyLevel === 'urgent' ? 'APK URGENT' :
                                 filterInfo.urgencyLevel === 'warning' ? 'APK WARNING' : 'APK NOTICE'}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                APK: {filterInfo.apkDate}
                                {filterInfo.daysUntilAPK < 0 ? 
                                  ` (${Math.abs(filterInfo.daysUntilAPK)} days overdue)` :
                                  ` (${filterInfo.daysUntilAPK} days remaining)`
                                }
                              </div>
                            </div>
                          )}
                          {vehicleFilter === 'maintenance' && (
                            <div className="space-y-1">
                              <div className={`inline-block px-2 py-1 rounded text-xs font-medium ${
                                getUrgencyColor(filterInfo.urgencyLevel)
                              }`}>
                                {filterInfo.urgencyLevel === 'urgent' ? 'NEVER MAINTAINED' :
                                 filterInfo.urgencyLevel === 'overdue' ? 'MAINTENANCE OVERDUE' :
                                 filterInfo.urgencyLevel === 'warning' ? 'MAINTENANCE DUE' : 'MAINTENANCE NOTICE'}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {filterInfo.lastMaintenanceDate ? 
                                  `Last: ${filterInfo.lastMaintenanceDate} (${filterInfo.daysSinceLastMaintenance} days ago)` :
                                  'No maintenance recorded'
                                }
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                      
                      <div className="flex items-center space-x-2">
                        <Badge variant="outline" className="text-xs">
                          {vehicle.vehicleType || 'Vehicle'}
                        </Badge>
                      </div>
                    </div>
                  );
                })}
              </div>

              {selectedVehicles.length > 0 && (
                <div className="p-3 bg-green-50 rounded-lg border border-green-200">
                  <div className="text-sm font-medium text-green-900">
                    {selectedVehicles.length} vehicle(s) selected for notification
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
              <CardTitle>Maintenance Reminder Notifications</CardTitle>
              <CardDescription>Send maintenance reminders to customers with vehicles needing service</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Template Selection */}
              <div className="space-y-2">
                <Label htmlFor="maintenance-template-select" className="text-sm font-medium">
                  Email Template
                </Label>
                <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
                  <SelectTrigger className="w-full" data-testid="select-maintenance-template">
                    <SelectValue placeholder="Select a maintenance reminder template" />
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
                        No templates available. Create templates in the "Templates" tab.
                      </div>
                    )}
                  </SelectContent>
                </Select>
                {selectedTemplateId && (
                  <div className="text-xs text-muted-foreground">
                    Template selected: {
                      savedTemplates.find((t: any) => t.id.toString() === selectedTemplateId)?.name || selectedTemplateId
                    }
                  </div>
                )}
              </div>

              <div className="flex items-center space-x-4 mb-4">
                <div className="flex-1">
                  <Label htmlFor="search-maintenance" className="text-sm font-medium sr-only">Search</Label>
                  <Input
                    id="search-maintenance"
                    placeholder="Search by license plate, brand, or model..."
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
                  Preview & Send to {selectedVehicles.length} vehicles
                </Button>
              </div>

              {/* Filter Information */}
              {vehicleFilter !== "all" && (
                <div className="p-4 border-l-4 border-blue-500 bg-blue-50 rounded-r">
                  {vehicleFilter === "maintenance" && (
                    <div className="flex items-start space-x-2">
                      <Wrench className="h-5 w-5 text-blue-600 mt-0.5" />
                      <div>
                        <p className="font-medium text-blue-900">Maintenance Reminder Filter Active</p>
                        <p className="text-sm text-blue-700">
                          Showing vehicles that need maintenance (no maintenance recorded in the last year). 
                          Vehicles never maintained are prioritized.
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
                          Customer: {customer?.name || 'Unknown'}
                        </div>
                        {filterInfo && (
                          <div className="text-xs text-muted-foreground">
                            {filterInfo.lastMaintenanceDate ? 
                              `Last: ${filterInfo.lastMaintenanceDate} (${filterInfo.daysSinceLastMaintenance} days ago)` :
                              'No maintenance recorded'
                            }
                          </div>
                        )}
                        <div className="flex items-center space-x-2">
                          <Badge variant="outline" className="text-xs">
                            {vehicle.vehicleType || 'Vehicle'}
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
                    {selectedVehicles.length} vehicle(s) selected for notification
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
              <CardTitle>Custom Message Notifications</CardTitle>
              <CardDescription>Send custom messages to customers and optionally include vehicle information</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Template Selection */}
              <div className="space-y-2">
                <Label htmlFor="custom-template-select" className="text-sm font-medium">
                  Email Template (Optional)
                </Label>
                <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
                  <SelectTrigger className="w-full" data-testid="select-custom-template">
                    <SelectValue placeholder="Select a template or compose custom message below" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No template - Use custom message</SelectItem>
                    {savedTemplates.length > 0 ? (
                      savedTemplates.map((template: any) => (
                        <SelectItem key={template.id} value={template.id.toString()}>
                          {template.name}
                        </SelectItem>
                      ))
                    ) : (
                      <div className="px-2 py-1 text-xs text-muted-foreground">
                        No templates available. Create templates in the "Templates" tab.
                      </div>
                    )}
                  </SelectContent>
                </Select>
                {selectedTemplateId && (
                  <div className="text-xs text-muted-foreground">
                    Template selected: {
                      savedTemplates.find((t: any) => t.id.toString() === selectedTemplateId)?.name || selectedTemplateId
                    }
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
                  Preview & Send
                </Button>
                <div className="text-sm text-muted-foreground">
                  {selectedCustomers.length > 0 && selectedVehicles.length > 0 
                    ? `${selectedCustomers.length} customer(s) + ${selectedVehicles.length} vehicle(s) selected`
                    : selectedCustomers.length > 0 
                    ? `${selectedCustomers.length} customer(s) selected`
                    : selectedVehicles.length > 0
                    ? `${selectedVehicles.length} vehicle(s) selected`
                    : 'No recipients selected'}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Split View: Customers and Vehicles */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Customers Column */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Select Customers</CardTitle>
                <CardDescription>Choose customers to send messages to</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center space-x-2">
                  <div className="flex-1">
                    <Input
                      placeholder="Search by customer name, email..."
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
                      <SelectItem value="all">All</SelectItem>
                      <SelectItem value="with-reservations">With Res.</SelectItem>
                      <SelectItem value="without-reservations">No Res.</SelectItem>
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
                              {customer.email || 'No email'}
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
                      {selectedCustomers.length} selected
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Vehicles Column */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Select Vehicles (Optional)</CardTitle>
                <CardDescription>Choose vehicles to include in the message</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Input
                    placeholder="Search by license plate, brand, model..."
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
                                Customer: {customer.name}
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
                      {selectedVehicles.length} selected
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Custom Message Composition */}
          <Card>
            <CardHeader>
              <CardTitle>Custom Message</CardTitle>
              <CardDescription>Compose your custom message</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="custom-subject">Email Subject</Label>
                <Input
                  id="custom-subject"
                  placeholder="Enter email subject..."
                  value={customSubject}
                  onChange={(e) => setCustomSubject(e.target.value)}
                  data-testid="input-custom-subject"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="custom-message">Message</Label>
                <Textarea
                  id="custom-message"
                  placeholder="Enter your custom message to customers..."
                  value={customMessage}
                  onChange={(e) => setCustomMessage(e.target.value)}
                  className="min-h-[120px]"
                  data-testid="textarea-custom-message"
                />
              </div>
              <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                <h4 className="font-medium text-blue-900 text-sm mb-2">Available Placeholders:</h4>
                <div className="grid grid-cols-2 gap-2 text-xs text-blue-700">
                  <div><code>{"{customerName}"}</code> - Customer's name</div>
                  <div><code>{"{vehiclePlate}"}</code> - License plate</div>
                  <div><code>{"{vehicleBrand}"}</code> - Vehicle brand</div>
                  <div><code>{"{vehicleModel}"}</code> - Vehicle model</div>
                  <div><code>{"{companyName}"}</code> - Your company name</div>
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
              <CardTitle>Email Log</CardTitle>
              <CardDescription>Track sent and failed email notifications</CardDescription>
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
                          {notification.status}
                        </Badge>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-3">
                        <div className="p-3 bg-green-50 rounded-lg border border-green-200">
                          <div className="text-sm font-medium text-green-900">Sent Successfully</div>
                          <div className="text-lg font-bold text-green-700">{notification.emailsSent}</div>
                        </div>
                        
                        <div className="p-3 bg-red-50 rounded-lg border border-red-200">
                          <div className="text-sm font-medium text-red-900">Failed</div>
                          <div className="text-lg font-bold text-red-700">{notification.emailsFailed}</div>
                        </div>
                        
                        <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                          <div className="text-sm font-medium text-blue-900">Success Rate</div>
                          <div className="text-lg font-bold text-blue-700">{successRate.toFixed(1)}%</div>
                        </div>
                      </div>
                      
                      {notification.failureReason && (
                        <div className="mt-3 p-2 bg-yellow-50 rounded border border-yellow-200">
                          <div className="text-sm text-yellow-800">
                            <strong>Failure Reason:</strong> {notification.failureReason}
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
                    <p className="text-sm text-muted-foreground">Total Emails Sent</p>
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
                    <p className="text-sm text-muted-foreground">Failed Emails</p>
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
                    <p className="text-sm text-muted-foreground">Total Campaigns</p>
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
                    <p className="text-sm text-muted-foreground">Active Customers</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Email Performance</CardTitle>
              <CardDescription>Track your email communication effectiveness</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="p-4 border rounded-lg">
                    <h4 className="font-medium text-sm mb-2">APK Notifications</h4>
                    <div className="text-2xl font-bold text-orange-600">
                      {notificationHistory.filter(n => n.type === 'apk').reduce((sum, n) => sum + n.emailsSent, 0)}
                    </div>
                    <p className="text-xs text-muted-foreground">Emails sent</p>
                  </div>
                  
                  <div className="p-4 border rounded-lg">
                    <h4 className="font-medium text-sm mb-2">Maintenance Reminders</h4>
                    <div className="text-2xl font-bold text-blue-600">
                      {notificationHistory.filter(n => n.type === 'maintenance').reduce((sum, n) => sum + n.emailsSent, 0)}
                    </div>
                    <p className="text-xs text-muted-foreground">Emails sent</p>
                  </div>
                  
                  <div className="p-4 border rounded-lg">
                    <h4 className="font-medium text-sm mb-2">Custom Messages</h4>
                    <div className="text-2xl font-bold text-green-600">
                      {notificationHistory.filter(n => n.type === 'custom').reduce((sum, n) => sum + n.emailsSent, 0)}
                    </div>
                    <p className="text-xs text-muted-foreground">Emails sent</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="templates" className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-medium">Email Templates</h3>
              <p className="text-sm text-muted-foreground">Create and manage custom email templates</p>
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
              New Template
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
                        {editingTemplate ? "Edit Template" : "Create New Template"}
                      </CardTitle>
                      <CardDescription>
                        Design your email template with placeholders for dynamic content
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
                      {showLivePreview ? 'Hide' : 'Show'} Live Preview
                    </Button>
                  </div>
                </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="template-name">Template Name</Label>
                  <Input
                    id="template-name"
                    placeholder="e.g., Service Reminder, Welcome Message"
                    value={templateName}
                    onChange={(e) => setTemplateName(e.target.value)}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="template-subject">Email Subject</Label>
                  <Input
                    ref={templateSubjectRef}
                    id="template-subject"
                    placeholder="e.g., Service Reminder for {vehiclePlate}"
                    value={templateSubject}
                    onChange={(e) => setTemplateSubject(e.target.value)}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="template-category">Template Category</Label>
                  <Select value={templateCategory} onValueChange={(value: 'apk' | 'maintenance' | 'custom') => setTemplateCategory(value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="apk">APK Reminders</SelectItem>
                      <SelectItem value="maintenance">Maintenance</SelectItem>
                      <SelectItem value="custom">Custom</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="template-content">Email Content</Label>
                  <textarea
                    ref={templateContentRef}
                    id="template-content"
                    placeholder="Write your email content here... Click the placeholder buttons below to insert dynamic content"
                    value={templateContent}
                    onChange={(e) => setTemplateContent(e.target.value)}
                    className="w-full min-h-[200px] p-3 border rounded-md resize-vertical font-mono text-sm"
                  />
                </div>
                
                {/* Placeholder Buttons */}
                <div className="space-y-3">
                  <h4 className="font-medium text-gray-900 text-sm">Insert Placeholders:</h4>
                  
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
                    💡 Tip: Click on any field above, position your cursor, then click a placeholder button to insert it at that position.
                  </div>
                </div>

                
                <div className="flex space-x-2">
                  <Button
                    onClick={async () => {
                      if (!templateName.trim() || !templateSubject.trim() || !templateContent.trim()) {
                        toast({
                          title: "Missing Information",
                          description: "Please fill in all template fields",
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
                          throw new Error(`Failed to save template: ${response.statusText}`);
                        }

                        const result = await response.json();
                        
                        toast({
                          title: editingTemplate ? "Template Updated" : "Template Created",
                          description: `Template "${templateName}" saved successfully`,
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
                          title: "Failed to Save Template",
                          description: error instanceof Error ? error.message : "An error occurred",
                          variant: "destructive",
                        });
                      } finally {
                        setIsLoadingTemplates(false);
                      }
                    }}
                    disabled={isLoadingTemplates}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    {isLoadingTemplates ? "Saving..." : (editingTemplate ? "Update Template" : "Save Template")}
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
                      Cancel
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
                      <CardTitle className="text-lg">Live Preview</CardTitle>
                      <Badge variant="secondary" className="text-xs">Sample Data</Badge>
                    </div>
                    <CardDescription>
                      See how your template will look with real data
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="border rounded-lg bg-gradient-to-br from-blue-50 to-indigo-50 p-4">
                      <div className="bg-white border rounded-lg shadow-sm p-4 space-y-3">
                        <div className="border-b pb-3">
                          <div className="text-xs text-gray-500 mb-1">From: Car Rental System</div>
                          <div className="text-xs text-gray-500 mb-2">To: john.doe@example.com</div>
                          {templateSubject ? (
                            <div className="font-semibold text-gray-900">
                              {getPreviewContent().subject}
                            </div>
                          ) : (
                            <div className="text-gray-400 italic text-sm">Subject will appear here...</div>
                          )}
                        </div>
                        
                        <div className="space-y-2">
                          {templateContent ? (
                            <div className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">
                              {getPreviewContent().content}
                            </div>
                          ) : (
                            <div className="text-sm text-gray-400 italic">
                              Your email content will appear here as you type...
                            </div>
                          )}
                        </div>
                        
                        {(templateSubject || templateContent) && (
                          <div className="pt-3 border-t text-xs text-gray-500 bg-gray-50 -mx-4 -mb-3 px-4 py-3 rounded-b-lg">
                            <div className="space-y-1">
                              <div><strong>Sample Data Used:</strong></div>
                              <div>• Customer: John Doe</div>
                              <div>• Vehicle: Toyota Camry (AB-123-CD)</div>
                              <div>• APK Date: 2024-06-15</div>
                              <div>• Company: Car Rental Company</div>
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
                    <CardTitle>Saved Templates ({savedTemplates.length})</CardTitle>
                    <CardDescription>Manage your existing email templates</CardDescription>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Input
                      placeholder="Search templates..."
                      value={templateSearchQuery}
                      onChange={(e) => setTemplateSearchQuery(e.target.value)}
                      className="w-40"
                      data-testid="input-search-templates"
                    />
                    <Select value={templateCategoryFilter} onValueChange={(value: any) => setTemplateCategoryFilter(value as 'all' | 'apk' | 'maintenance' | 'custom')}>
                      <SelectTrigger className="w-32" data-testid="select-template-category">
                        <SelectValue placeholder="Category" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All</SelectItem>
                        <SelectItem value="apk">APK</SelectItem>
                        <SelectItem value="maintenance">Maintenance</SelectItem>
                        <SelectItem value="custom">Custom</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {savedTemplates.length === 0 ? (
                  <div className="text-center py-8">
                    <Mail className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <h3 className="text-lg font-medium mb-2">No templates yet</h3>
                    <p className="text-muted-foreground mb-4">
                      Create your first email template to get started
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
                      Create Template
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
                                  {template.category?.toUpperCase() || 'CUSTOM'}
                                </Badge>
                              </div>
                              <p className="text-xs text-muted-foreground mb-2 truncate">{template.subject}</p>
                              <p className="text-xs text-gray-500 mb-2 line-clamp-3 leading-relaxed">{template.content}</p>
                              <div className="text-xs text-muted-foreground space-y-1">
                                <div>Created: {new Date(template.createdAt).toLocaleDateString('nl-NL')}</div>
                                {template.lastUsed && (
                                  <div>Last used: {new Date(template.lastUsed).toLocaleDateString('nl-NL')}</div>
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
                              title="Preview template"
                              className="h-8 px-2 text-xs"
                            >
                              <Eye className="h-3 w-3 mr-1" />
                              Preview
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => duplicateTemplate(template)}
                              data-testid={`button-duplicate-${template.id}`}
                              title="Duplicate template"
                              className="h-8 px-2 text-xs"
                            >
                              <Copy className="h-3 w-3 mr-1" />
                              Copy
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
                              title="Edit template"
                              className="h-8 px-2 text-xs"
                            >
                              <Edit className="h-3 w-3 mr-1" />
                              Edit
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-red-600 hover:text-red-700 h-8 px-2 text-xs"
                              onClick={() => handleDeleteTemplate(template)}
                              data-testid={`button-delete-${template.id}`}
                              title="Delete template"
                            >
                              <Trash2 className="h-3 w-3 mr-1" />
                              Delete
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
            <DialogTitle>Email Preview</DialogTitle>
            <DialogDescription>
              Review your email before sending to {emailPreview?.recipients.length || 0} recipients
            </DialogDescription>
          </DialogHeader>
          
          {emailPreview && (
            <div className="space-y-6">
              {/* Email Content Preview */}
              <div className="space-y-4">
                <div>
                  <Label className="text-sm font-medium">Subject:</Label>
                  <div className="mt-1 p-3 bg-gray-50 rounded border">
                    <p className="font-medium">{emailPreview.subject}</p>
                  </div>
                </div>
                
                <div>
                  <Label className="text-sm font-medium">Email Content:</Label>
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
                  Recipients ({emailPreview.recipients.length}):
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
                              {recipient.emailField === "email" && "Primary"}
                              {recipient.emailField === "emailForMOT" && "APK/MOT"}
                              {recipient.emailField === "emailForInvoices" && "Invoice"}
                              {recipient.emailField === "emailGeneral" && "General"}
                            </Badge>
                          )}
                        </div>
                        {/* Email Selection */}
                        <div className="space-y-2">
                          {recipient.emailOptions.length > 1 ? (
                            <div className="space-y-1">
                              <Label className="text-xs font-medium">Select Email Address:</Label>
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
                              <span className="font-medium">Email:</span> {recipient.email}
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
                    Ready to send {emailPreview.recipients.length} emails
                  </span>
                </div>
                <p className="text-xs text-blue-700 mt-1">
                  Each recipient will receive a personalized version of this email with their specific vehicle and customer information. You can select which email address to use for each recipient above.
                </p>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={confirmSendNotifications}
              disabled={isLoadingNotifications}
              className="bg-green-600 hover:bg-green-700"
            >
              {isLoadingNotifications ? "Sending..." : "Confirm & Send Emails"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Template Preview Dialog */}
      <Dialog open={templatePreviewDialog} onOpenChange={setTemplatePreviewDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Template Preview</DialogTitle>
            <DialogDescription>
              Preview how this template will appear in emails
            </DialogDescription>
          </DialogHeader>
          {selectedTemplateForPreview && (
            <div className="space-y-4">
              <div className="p-4 border rounded-lg bg-white">
                <div className="border-b pb-3 mb-3">
                  <div className="flex items-center justify-between">
                    <div className="font-medium text-sm text-gray-600">From: Car Rental System</div>
                    <Badge className={getCategoryBadgeColor(selectedTemplateForPreview.category)}>
                      {selectedTemplateForPreview.category?.toUpperCase() || 'CUSTOM'}
                    </Badge>
                  </div>
                  <div className="font-medium text-sm text-gray-600 mt-1">To: customer@example.com</div>
                  <div className="font-bold text-lg mt-2">{selectedTemplateForPreview.subject}</div>
                </div>
                <div className="whitespace-pre-wrap text-gray-900">
                  {selectedTemplateForPreview.content}
                </div>
              </div>
              <div className="text-xs text-muted-foreground">
                <div><strong>Template:</strong> {selectedTemplateForPreview.name}</div>
                <div><strong>Category:</strong> {selectedTemplateForPreview.category || 'custom'}</div>
                <div><strong>Created:</strong> {new Date(selectedTemplateForPreview.createdAt).toLocaleDateString()}</div>
                {selectedTemplateForPreview.lastUsed && (
                  <div><strong>Last Used:</strong> {new Date(selectedTemplateForPreview.lastUsed).toLocaleDateString()}</div>
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setTemplatePreviewDialog(false)}>
              Close
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
                Edit Template
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Template Confirmation Dialog */}
      <Dialog open={!!templateToDelete} onOpenChange={() => setTemplateToDelete(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Delete Template</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{templateToDelete?.name}"? 
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTemplateToDelete(null)}>
              Cancel
            </Button>
            <Button 
              onClick={confirmDeleteTemplate}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete Template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}