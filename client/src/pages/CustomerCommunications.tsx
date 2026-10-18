import { describeApiError } from "@/lib/api-error";
import { useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Mail, Shield, Wrench, Users, Send, Calendar, Clock, CheckCircle, AlertTriangle, Edit, Trash2, Eye, Copy } from "lucide-react";
import type { Vehicle, Customer } from "@shared/schema";
import { UserPermission } from "@shared/schema";
import { RequiresPermission } from "@/components/ui/requires-permission";
import { useHasPermission } from "@/hooks/use-has-permission";
import { NoDataAccess } from "@/components/ui/no-data-access";
import { formatLicensePlate, plateMatches, formatVehicleType, formatDate } from "@/lib/format-utils";
import { formatDateNl, formatDateTimeNl } from "@/lib/format-date-nl";
import { fillPlaceholders, placeholderKeysForCategory } from "@shared/message-placeholders";
import { COMPANY_NAME_KEY, companyNameFromSetting } from "@shared/company-name";
import { templatesForMode, isSystemTemplate, systemTemplateLabelKey, systemTemplateLanguage, htmlToPlainText } from "@/lib/communication-templates";
import { LANGUAGE_NAMES, SUPPORTED_LANGUAGES, type SupportedLanguage } from "@shared/languages";
import {
  buildRecipients, renderForRecipient, emptyPlaceholders, unsupportedPlaceholders, MASS_SEND_THRESHOLD,
  type PreviewRecipient, type EmailField,
} from "@/lib/communication-preview";
import { classifySendResult, firstFailureCode } from "@/lib/communication-send";
import { failureCodeText } from "@/lib/email-failure-text";
import { EmailFailureReasons } from "@/components/communications/email-failure-reasons";
import { EmailLogDetailDialog, type EmailLogRow, type EmailLogStatus } from "@/components/communications/email-log-detail-dialog";

function emailLogStatus(row: EmailLogRow): EmailLogStatus {
  if (row.result === 'sent') return 'sent';
  if (row.result === 'failed') return 'failed';
  if (row.emailsFailed > 0) return row.emailsSent > 0 ? 'partial' : 'failed';
  return 'sent';
}

function sentAtMs(row: EmailLogRow): number {
  const ms = Date.parse(row.sentAt);
  return Number.isNaN(ms) ? 0 : ms;
}

/** Newest first, whatever order the route used; the id breaks a tie. */
function newestFirst(rows: EmailLogRow[]): EmailLogRow[] {
  return [...rows].sort((a, b) => sentAtMs(b) - sentAtMs(a) || b.id - a.id);
}

type EmailKind = 'apk' | 'maintenance' | 'custom' | 'other';

/** The numbers on the Analyse tab, all counted from the rows themselves. */
function summariseEmailLog(rows: EmailLogRow[]) {
  const mails = rows.filter((row) => row.recipient);
  const runs = rows.filter((row) => !row.recipient);
  const count = (list: EmailLogRow[], status: EmailLogStatus) =>
    list.filter((row) => emailLogStatus(row) === status).length;
  const kind = (name: EmailKind) => {
    const list = mails.filter((row) =>
      name === 'other' ? !['apk', 'maintenance', 'custom'].includes(row.template) : row.template === name);
    return { sent: count(list, 'sent'), failed: count(list, 'failed') };
  };
  return {
    sent: count(mails, 'sent'),
    failed: count(mails, 'failed'),
    runs: runs.length,
    runsWithFailures: runs.filter((row) => row.emailsFailed > 0).length,
    kinds: { apk: kind('apk'), maintenance: kind('maintenance'), custom: kind('custom'), other: kind('other') },
  };
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
  // The preview keeps the template text as written and renders it per recipient
  // (audit A-13-3); every recipient carries its own placeholder values and address.
  const [emailPreview, setEmailPreview] = useState<{
    subject: string;
    content: string;
    recipients: PreviewRecipient[];
  } | null>(null);
  const [previewRecipientKey, setPreviewRecipientKey] = useState<string | null>(null);
  const [massSendAcknowledged, setMassSendAcknowledged] = useState(false);
  const [logDetailRow, setLogDetailRow] = useState<EmailLogRow | null>(null);

  // Vehicle filter is now based on communication mode
  const vehicleFilter = communicationMode === 'custom' ? 'all' : communicationMode;

  // The page's own permission is MANAGE_NOTIFICATIONS OR MANAGE_EMAIL_TEMPLATES
  // (B-29a, shared/page-access.ts) - none of these three recipient-list
  // queries accept either one on its own (fact sheet row 12, "server
  // narrower than menu, severely"). The send buttons themselves already
  // require MANAGE_NOTIFICATIONS separately (RequiresPermission, above) -
  // this is about whether the recipient lists that feed those buttons can
  // load at all.
  const canViewCustomers = useHasPermission(UserPermission.VIEW_CUSTOMERS, UserPermission.MANAGE_CUSTOMERS);
  // vehicleFilter === "all" hits GET /api/vehicles/with-reservations
  // (server/index.ts:415, a 4-way OR incl. reservation rights); any other
  // value hits GET /api/vehicles/filtered (server/index.ts:416, vehicle
  // rights only) - the enabled condition below matches whichever endpoint
  // the query function is about to call.
  const canViewVehiclesFiltered = useHasPermission(UserPermission.VIEW_VEHICLES, UserPermission.MANAGE_VEHICLES);
  const canViewVehiclesWithReservations = useHasPermission(
    UserPermission.VIEW_VEHICLES, UserPermission.MANAGE_VEHICLES,
    UserPermission.VIEW_RESERVATIONS, UserPermission.MANAGE_RESERVATIONS,
  );
  const canViewVehiclesForCommunications = vehicleFilter === 'all' ? canViewVehiclesWithReservations : canViewVehiclesFiltered;

  // B-29a: template MANAGEMENT (create, edit, delete, the e-mail log) stays
  // behind MANAGE_EMAIL_TEMPLATES alone - GET/POST/PUT/DELETE /api/email-templates
  // and GET /api/email-logs all accept exactly that one permission
  // (server/index.ts:417/418), nothing wider. Gates the two queries below and
  // every control that creates, edits, deletes or otherwise mutates a template.
  const canManageEmailTemplates = useHasPermission(UserPermission.MANAGE_EMAIL_TEMPLATES);

  // Template builder state
  const [templateName, setTemplateName] = useState<string>("");
  const [templateSubject, setTemplateSubject] = useState<string>("");
  const [templateContent, setTemplateContent] = useState<string>("");
  const [templateCategory, setTemplateCategory] = useState<'apk' | 'maintenance' | 'custom' | 'portal'>('custom');
  const [templates, setTemplates] = useState<Array<{id: string, name: string, subject: string, content: string, createdAt: string}>>([]);
  const [editingTemplate, setEditingTemplate] = useState<string | null>(null);
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(false);
  const [templateSearchQuery, setTemplateSearchQuery] = useState<string>("");
  const [templateCategoryFilter, setTemplateCategoryFilter] = useState<'all' | 'apk' | 'maintenance' | 'custom' | 'portal'>('all');
  const [templateLanguageFilter, setTemplateLanguageFilter] = useState<'all' | SupportedLanguage>('all');
  const [templatePreviewDialog, setTemplatePreviewDialog] = useState(false);
  const [templateToDelete, setTemplateToDelete] = useState<any>(null);
  const [selectedTemplateForPreview, setSelectedTemplateForPreview] = useState<any>(null);
  const [showLivePreview, setShowLivePreview] = useState(false);
  
  // Refs for textarea
  const templateSubjectRef = useRef<HTMLInputElement | null>(null);
  const templateContentRef = useRef<HTMLTextAreaElement | null>(null);
  // Edit and Duplicate fill a form that sits above the saved-template list; the
  // page has to bring it into view (audit A-13-7).
  const templateBuilderRef = useRef<HTMLDivElement | null>(null);
  const templateNameRef = useRef<HTMLInputElement | null>(null);

  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch saved email templates - B-29a: GET /api/email-templates accepts
  // MANAGE_EMAIL_TEMPLATES only (server/index.ts:417), narrower than the
  // page's own MANAGE_NOTIFICATIONS-OR-MANAGE_EMAIL_TEMPLATES gate.
  const { data: savedTemplates = [] } = useQuery({
    queryKey: ['/api/email-templates'],
    queryFn: async () => {
      const response = await fetch('/api/email-templates');
      if (!response.ok) throw new Error('Failed to fetch templates');
      return response.json();
    },
    enabled: canManageEmailTemplates,
  });

  // D15: the company name setting fills {companyName} in the preview, as the server does when it sends.
  const { data: companyNameSetting } = useQuery<{ value?: unknown } | null>({
    queryKey: [`/api/app-settings/key/${COMPANY_NAME_KEY}`],
  });
  const companyName = companyNameFromSetting(companyNameSetting?.value);
  // The saved template that is chosen, if any: its id and category travel with the send.
  const selectedSavedTemplate = selectedTemplateId && selectedTemplateId !== "none"
    ? savedTemplates.find((tpl: any) => tpl.id.toString() === selectedTemplateId)
    : undefined;

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
    },
    enabled: canViewVehiclesForCommunications,
  });

  // Fetch customers
  const { data: customers = [] } = useQuery<Customer[]>({
    queryKey: ['/api/customers'],
    enabled: canViewCustomers,
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
    },
    enabled: canViewCustomers,
  });

  // Fetch email logs - B-29a: GET /api/email-logs also accepts
  // MANAGE_EMAIL_TEMPLATES only (server/index.ts:418). The E-maillogboek and
  // Analyse tabs render exactly this, nothing else (audit 2026-10-09, module
  // 13, finding 1: they used to show hard-coded rows from March 2024).
  const {
    data: emailLogData,
    isLoading: emailLogLoading,
    isError: emailLogError,
  } = useQuery<EmailLogRow[]>({
    queryKey: ['/api/email-logs'],
    queryFn: async () => {
      const response = await fetch('/api/email-logs');
      if (!response.ok) throw new Error('Failed to fetch email logs');
      return response.json();
    },
    enabled: canManageEmailTemplates,
  });
  const emailLogRows = newestFirst(Array.isArray(emailLogData) ? emailLogData : []);
  const emailLogSummary = summariseEmailLog(emailLogRows);

  const filteredVehicles = vehiclesWithReservations.filter((item: any) => {
    const vehicle = item.vehicle;
    const query = searchQuery.toLowerCase();
    return !query ||
      plateMatches(vehicle.licensePlate, query) ||
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

  // The pickers offer the templates of their own tab, never the portal's system
  // templates (audit A-13-5).
  const pickerTemplates = templatesForMode(savedTemplates, communicationMode);

  // Why the preview button is off, in words (audit A-13-10).
  const templateChosen = Boolean(selectedTemplateId) && selectedTemplateId !== "none";
  const vehicleModeHint =
    selectedVehicles.length === 0 && !templateChosen ? t('customerCommunications.send.hints.needTemplateAndVehicle')
    : selectedVehicles.length === 0 ? t('customerCommunications.send.hints.needVehicle')
    : !templateChosen ? t('customerCommunications.send.hints.needTemplate')
    : null;
  const hasCustomRecipients = selectedCustomers.length > 0 || selectedVehicles.length > 0;
  const hasCustomMessage = templateChosen || (customMessage.trim() !== "" && customSubject.trim() !== "");
  const customModeHint =
    !hasCustomRecipients && !hasCustomMessage ? t('customerCommunications.send.hints.needRecipientAndMessage')
    : !hasCustomRecipients ? t('customerCommunications.send.hints.needRecipient')
    : !hasCustomMessage ? t('customerCommunications.send.hints.needMessage')
    : null;

  const handleSendNotifications = async () => {
    // Check if recipients are selected based on mode
    if (communicationMode === 'custom' && !hasCustomRecipients) {
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
      // The address chosen in the preview, for the recipients where the choice
      // differs from what the route picks by itself. The route reads it per vehicle.
      const individualEmailSelections: Record<string, EmailField> = {};
      for (const recipient of emailPreview?.recipients ?? []) {
        if (recipient.vehicleId !== null && recipient.emailField && recipient.emailField !== recipient.defaultEmailField) {
          individualEmailSelections[String(recipient.vehicleId)] = recipient.emailField;
        }
      }

      // Build request body based on communication mode
      const requestBody: any = {
        template: templateType,
        customMessage: emailContent.trim(),
        customSubject: emailSubject.trim(),
        emailFieldSelection: "auto",
        individualEmailSelections,
      };
      // D15: the server fills {maintenanceDate} only for a maintenance template, and takes the
      // category from the saved template itself; both travel along.
      if (selectedSavedTemplate) {
        requestBody.templateId = selectedSavedTemplate.id;
        requestBody.category = selectedSavedTemplate.category;
      }

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
        throw new Error(t('customerCommunications.toasts.sendNotificationsRequestFailed', { status: response.status }));
      }

      const result = await response.json();

      // The send wrote to the e-mail log (one row per mail, one for the round);
      // the log tab and the analysis read it once on load and would never show it.
      void queryClient.invalidateQueries({ queryKey: ['/api/email-logs'] });

      // The route answers 200 also when nothing could be mailed (no e-mail
      // configuration, no usable address); only the counts say what happened
      // (audit A-13-2).
      const outcome = classifySendResult(result);
      const sent = Number(result.sent) || 0;
      const failed = Number(result.failed) || 0;
      if (outcome === 'failed') {
        toast({
          title: t('customerCommunications.toasts.failedTitle'),
          // { sent: 0, failed: 0 }: nobody was handled, so "0 e-mails mislukt" would be a strange thing to say.
          description: failed === 0
            ? t('customerCommunications.toasts.nobodyToMailDescription')
            : t('customerCommunications.toasts.failedDescription', {
                failed: t('customerCommunications.toasts.failedCount', { count: failed }),
                reason: failureCodeText(t as any, firstFailureCode(result.errors)),
              }),
          variant: "destructive",
        });
        // Nothing went out: keep the recipients and the text so it can be tried again.
        return;
      }
      if (outcome === 'partial') {
        toast({
          title: t('customerCommunications.toasts.partialTitle'),
          description: t('customerCommunications.toasts.partialDescription', {
            sent: t('customerCommunications.toasts.sentCount', { count: sent }),
            failed: t('customerCommunications.toasts.failedCount', { count: failed }),
          }),
          variant: "destructive",
        });
      } else {
        toast({
          title: t('customerCommunications.toasts.notificationsSentTitle'),
          description: t('customerCommunications.toasts.sentCount', { count: sent }),
        });
      }

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
        description: describeApiError(error, undefined, t('customerCommunications.toasts.genericError')),
        variant: "destructive",
      });
    } finally {
      setIsLoadingNotifications(false);
    }
  };

  const generateEmailPreview = async () => {
    // Check if custom message mode and customers or vehicles are selected
    if (communicationMode === 'custom' && !hasCustomRecipients) {
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

    // The recipients are resolved the way the send route resolves them, and the
    // text is rendered per recipient when the dialog shows it (audit A-13-3).
    const recipients = buildRecipients({
      mode: communicationMode,
      selectedVehicles,
      selectedCustomers,
      vehicleItems: vehiclesWithReservations,
      companyName,
      category: selectedSavedTemplate?.category ?? null,
    });

    setEmailPreview({
      subject: emailSubject.trim(),
      content: emailContent.trim(),
      recipients,
    });
    setPreviewRecipientKey(recipients[0]?.key ?? null);
    setMassSendAcknowledged(false);
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

    // The language filter narrows the portal templates (one row per language); a template staff wrote stays visible.
    const language = systemTemplateLanguage(template.name);
    const matchesLanguage = templateLanguageFilter === 'all' || language === null || language === templateLanguageFilter;

    return matchesSearch && matchesCategory && matchesLanguage;
  });

  const getCategoryBadgeColor = (category: string) => {
    switch (category) {
      case 'apk': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'maintenance': return 'bg-green-100 text-green-800 border-green-200';
      case 'custom': return 'bg-purple-100 text-purple-800 border-purple-200';
      case 'portal': return 'bg-slate-100 text-slate-800 border-slate-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const categoryBadgeText = (category?: string | null) =>
    category === 'portal'
      ? t('customerCommunications.templates.categoryPortal')
      : category?.toUpperCase() || t('customerCommunications.templates.defaultCategoryBadge');

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
        throw new Error(t('customerCommunications.toasts.deleteTemplateRequestFailed', { status: response.status }));
      }

      toast({
        title: t('customerCommunications.toasts.templateDeletedTitle'),
        description: t('customerCommunications.toasts.templateDeletedDescription', { name: templateDisplayName(templateToDelete) }),
      });

      // The saved-template list is a query of its own: refresh it, or the
      // deleted template stays on screen (audit A-13-4).
      await queryClient.invalidateQueries({ queryKey: ['/api/email-templates'] });
      if (selectedTemplateId === String(templateToDelete.id)) setSelectedTemplateId("");
      setTemplateToDelete(null);
    } catch (error) {
      console.error('Failed to delete template:', error);
      toast({
        title: t('customerCommunications.toasts.deleteTemplateFailedTitle'),
        description: describeApiError(error, undefined, t('customerCommunications.toasts.genericError')),
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

  // The Dutch name of a system template, the stored name of any other. A portal template in another
  // language than Dutch carries that language's own name: "Portaal: uitnodiging (Español)".
  const templateDisplayName = (template: { name: string }) => {
    const key = systemTemplateLabelKey(template.name);
    if (!key) return template.name;
    const language = systemTemplateLanguage(template.name);
    return language && language !== 'nl' ? `${t(key)} (${LANGUAGE_NAMES[language]})` : t(key);
  };

  // Brings the builder form into view and puts the cursor in its first field:
  // the saved-template cards sit far below it (audit A-13-7).
  const showTemplateBuilder = () => {
    templateBuilderRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
    setTimeout(() => templateNameRef.current?.focus({ preventScroll: true }), 0);
  };

  // Judged by the stored row, not by what is typed in the field (typing "portal_x" must not lock it).
  const storedEditing = editingTemplate === null ? undefined : savedTemplates.find((tpl: any) => tpl.id === editingTemplate);
  const editingSystemTemplate = !!storedEditing && isSystemTemplate(storedEditing);

  const beginEditingTemplate = (template: any) => {
    setEditingTemplate(template.id);
    setTemplateName(template.name);
    setTemplateSubject(template.subject);
    setTemplateContent(template.content);
    setTemplateCategory(template.category || "custom");
    showTemplateBuilder();
  };

  const duplicateTemplate = async (template: any) => {
    setEditingTemplate(null);
    setTemplateName(`${templateDisplayName(template)} ${t('customerCommunications.templates.copySuffix')}`);
    setTemplateSubject(template.subject);
    setTemplateContent(template.content);
    // A copy of a system template is an ordinary template: it must not be
    // hidden from the pickers as a portal one.
    setTemplateCategory(template.category && template.category !== 'portal' ? template.category : "custom");
    showTemplateBuilder();

    toast({
      title: t('customerCommunications.toasts.templateDuplicatedTitle'),
      description: t('customerCommunications.toasts.templateDuplicatedDescription'),
    });
  };

  // The sample customer and vehicle of the live preview, from the locale.
  const sampleValues = t('customerCommunications.templates.sampleValues', { returnObjects: true }) as unknown as Record<string, string>;

  const getPreviewContent = () => ({
    subject: fillPlaceholders(templateSubject, sampleValues),
    content: fillPlaceholders(templateContent, sampleValues),
  });

  // Available placeholders
  const allPlaceholders = [
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
  // D15: the maintenance date only makes sense in a maintenance template.
  const offered = placeholderKeysForCategory(templateCategory) as string[];
  const placeholders = allPlaceholders.filter((placeholder) => offered.includes(placeholder.key));

  // The address chosen for one recipient in the preview dialog.
  const handleEmailSelection = (recipientKey: string, selectedEmailField: string) => {
    if (!emailPreview) return;
    setEmailPreview({
      ...emailPreview,
      recipients: emailPreview.recipients.map((recipient) => {
        if (recipient.key !== recipientKey) return recipient;
        const option = recipient.emailOptions.find((candidate) => candidate.field === selectedEmailField);
        return option ? { ...recipient, emailField: option.field, email: option.email } : recipient;
      }),
    });
  };

  // Reading helpers for the e-mail log tab.
  const logKindLabel = (template: string) => {
    if (['apk', 'maintenance', 'custom'].includes(template)) return getTemplateInfo(template).title;
    if (template === 'gps') return t('customerCommunications.history.kindGps');
    if (template === 'documents') return t('customerCommunications.history.kindDocuments');
    if (template === 'fine_linked') return t('customerCommunications.history.kindFine');
    return t('customerCommunications.history.kindOther');
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
          <span className="text-sm text-muted-foreground" data-testid="stats-line">
            {t('customerCommunications.statsCustomers', { count: customers.length })}
            {' • '}
            {t(
              communicationMode === 'apk' ? 'customerCommunications.statsVehiclesApk'
                : communicationMode === 'maintenance' ? 'customerCommunications.statsVehiclesMaintenance'
                : 'customerCommunications.statsVehiclesCustom',
              { count: vehiclesWithReservations.length },
            )}
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
                        {pickerTemplates.length > 0 ? (
                          pickerTemplates.map((template: any) => (
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
                    <RequiresPermission anyOf={[UserPermission.MANAGE_NOTIFICATIONS]}>
                      <Button
                        disabled={selectedVehicles.length === 0 || !selectedTemplateId}
                        onClick={generateEmailPreview}
                        className="bg-orange-600 hover:bg-orange-700"
                        data-testid="button-preview-apk"
                        aria-describedby={vehicleModeHint ? 'hint-preview-apk' : undefined}
                      >
                        <Send className="h-4 w-4 mr-2" />
                        {t('customerCommunications.send.apk.previewSendButton', { count: selectedVehicles.length })}
                      </Button>
                    </RequiresPermission>
                  </div>
                  {vehicleModeHint && (
                    <p id="hint-preview-apk" className="-mt-2 text-xs text-muted-foreground" data-testid="hint-preview-apk">
                      {vehicleModeHint}
                    </p>
                  )}

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
                {!canViewVehiclesForCommunications ? (
                  <NoDataAccess permission={UserPermission.VIEW_VEHICLES} className="md:col-span-2 lg:col-span-3" />
                ) : filteredVehicles.slice(0, 50).map((item: any) => {
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
                      data-testid={`vehicle-card-${vehicle.id}`}
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
                                {t('customerCommunications.send.apk.apkDateLabel', { date: formatDateNl(filterInfo.apkDate, 'short') })}
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
                                  t('customerCommunications.send.maintenance.lastMaintenance', { date: formatDateNl(filterInfo.lastMaintenanceDate, 'short'), days: filterInfo.daysSinceLastMaintenance }) :
                                  t('customerCommunications.send.maintenance.noMaintenanceRecorded')
                                }
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      <div className="flex items-center space-x-2">
                        <Badge variant="outline" className="text-xs">
                          {formatVehicleType(vehicle.vehicleType) || t('customerCommunications.send.apk.vehicleTypeFallback')}
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
                    {pickerTemplates.length > 0 ? (
                      pickerTemplates.map((template: any) => (
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
                <RequiresPermission anyOf={[UserPermission.MANAGE_NOTIFICATIONS]}>
                  <Button
                    disabled={selectedVehicles.length === 0 || !selectedTemplateId}
                    onClick={generateEmailPreview}
                    className="bg-blue-600 hover:bg-blue-700"
                    data-testid="button-preview-maintenance"
                    aria-describedby={vehicleModeHint ? 'hint-preview-maintenance' : undefined}
                  >
                    <Send className="h-4 w-4 mr-2" />
                    {t('customerCommunications.send.maintenance.previewSendButton', { count: selectedVehicles.length })}
                  </Button>
                </RequiresPermission>
              </div>
              {vehicleModeHint && (
                <p id="hint-preview-maintenance" className="-mt-2 text-xs text-muted-foreground" data-testid="hint-preview-maintenance">
                  {vehicleModeHint}
                </p>
              )}

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
                {!canViewVehiclesForCommunications ? (
                  <NoDataAccess permission={UserPermission.VIEW_VEHICLES} className="md:col-span-2 lg:col-span-3" />
                ) : filteredVehicles.slice(0, 50).map((item: any) => {
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
                              t('customerCommunications.send.maintenance.lastMaintenance', { date: formatDateNl(filterInfo.lastMaintenanceDate, 'short'), days: filterInfo.daysSinceLastMaintenance }) :
                              t('customerCommunications.send.maintenance.noMaintenanceRecorded')
                            }
                          </div>
                        )}
                        <div className="flex items-center space-x-2">
                          <Badge variant="outline" className="text-xs">
                            {formatVehicleType(vehicle.vehicleType) || t('customerCommunications.send.maintenance.vehicleTypeFallback')}
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
                    {pickerTemplates.length > 0 ? (
                      pickerTemplates.map((template: any) => (
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
                <RequiresPermission anyOf={[UserPermission.MANAGE_NOTIFICATIONS]}>
                  <Button
                    disabled={!hasCustomRecipients || !hasCustomMessage}
                    onClick={generateEmailPreview}
                    className="bg-green-600 hover:bg-green-700"
                    data-testid="button-preview-custom"
                    aria-describedby={customModeHint ? 'hint-preview-custom' : undefined}
                  >
                    <Send className="h-4 w-4 mr-2" />
                    {t('customerCommunications.send.custom.previewSendButton')}
                  </Button>
                </RequiresPermission>
                <div className="text-sm text-muted-foreground">
                  {(() => {
                    const customersText = t('customerCommunications.send.custom.customersCount', { count: selectedCustomers.length });
                    const vehiclesText = t('customerCommunications.send.custom.vehiclesCount', { count: selectedVehicles.length });
                    return selectedCustomers.length > 0 && selectedVehicles.length > 0
                      ? t('customerCommunications.send.custom.recipientsSummaryBoth', { customers: customersText, vehicles: vehiclesText })
                      : selectedCustomers.length > 0
                      ? t('customerCommunications.send.custom.recipientsSummaryCustomersOnly', { customers: customersText })
                      : selectedVehicles.length > 0
                      ? t('customerCommunications.send.custom.recipientsSummaryVehiclesOnly', { vehicles: vehiclesText })
                      : t('customerCommunications.send.custom.recipientsSummaryNone');
                  })()}
                </div>
              </div>
              {customModeHint && (
                <p id="hint-preview-custom" className="-mt-2 text-xs text-muted-foreground" data-testid="hint-preview-custom">
                  {customModeHint}
                </p>
              )}
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
                  {!canViewCustomers ? (
                    <NoDataAccess permission={UserPermission.VIEW_CUSTOMERS} />
                  ) : filteredCustomers.slice(0, 50).map((customer: any) => {
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
                  {!canViewVehiclesForCommunications ? (
                    <NoDataAccess permission={UserPermission.VIEW_VEHICLES} />
                  ) : filteredVehicles.slice(0, 50).map((item: any) => {
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
              {!canManageEmailTemplates ? (
                // GET /api/email-logs needs MANAGE_EMAIL_TEMPLATES alone: a
                // visible hole, not a genuine "nothing sent yet" state.
                <NoDataAccess permission={UserPermission.MANAGE_EMAIL_TEMPLATES} />
              ) : emailLogLoading ? (
                <p className="text-sm text-muted-foreground" data-testid="email-log-loading">
                  {t('customerCommunications.history.loading')}
                </p>
              ) : emailLogError ? (
                <p className="text-sm text-destructive" data-testid="email-log-error">
                  {t('customerCommunications.history.loadError')}
                </p>
              ) : emailLogRows.length === 0 ? (
                <div className="text-center py-8" data-testid="email-log-empty">
                  <Mail className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-medium mb-2">{t('customerCommunications.history.emptyTitle')}</h3>
                  <p className="text-muted-foreground">{t('customerCommunications.history.emptyDescription')}</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {emailLogRows.map((row) => {
                    const status = emailLogStatus(row);
                    const knownKind = ['apk', 'maintenance', 'custom'].includes(row.template);
                    const info = knownKind ? getTemplateInfo(row.template) : null;
                    const Icon = info ? info.icon : Mail;
                    const kindLabel = logKindLabel(row.template);

                    return (
                      <div key={row.id} className="p-4 border rounded-lg" data-testid="email-log-row">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start space-x-4 min-w-0">
                            <Icon className={`h-5 w-5 mt-0.5 shrink-0 ${info ? info.color : 'text-muted-foreground'}`} />
                            <div className="min-w-0">
                              <div className="font-medium break-words">{row.subject}</div>
                              <div className="text-sm text-muted-foreground">
                                {formatDateTimeNl(row.sentAt)} · {kindLabel}
                              </div>
                              <div className="text-sm text-muted-foreground">
                                {row.recipient ? (
                                  <>
                                    <span>{t('customerCommunications.history.recipientLabel')}</span>{' '}
                                    <span className="break-all">{row.recipient}</span>
                                  </>
                                ) : (
                                  <>
                                    <span>{t('customerCommunications.history.recipientsCount', { count: row.recipients })}</span>
                                    {' · '}
                                    <span>{t('customerCommunications.history.roundCounts', { sent: row.emailsSent, failed: row.emailsFailed })}</span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="flex shrink-0 flex-col items-end gap-2">
                            <Badge
                              variant={status === 'sent' ? 'default' : 'destructive'}
                              data-testid="email-log-status"
                            >
                              {t(`customerCommunications.history.statusLabels.${status}`)}
                            </Badge>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 px-2 text-xs"
                              onClick={() => setLogDetailRow(row)}
                              data-testid={`button-email-log-detail-${row.id}`}
                            >
                              {t('customerCommunications.history.detailButton')}
                            </Button>
                          </div>
                        </div>

                        {row.failureReason && (
                          <div className="mt-3 p-2 bg-yellow-50 rounded border border-yellow-200">
                            <EmailFailureReasons reason={row.failureReason} />
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

        <TabsContent value="analytics" className="space-y-4">
          {!canManageEmailTemplates ? (
            <Card>
              <CardContent className="p-6">
                <NoDataAccess permission={UserPermission.MANAGE_EMAIL_TEMPLATES} />
              </CardContent>
            </Card>
          ) : emailLogLoading ? (
            <p className="text-sm text-muted-foreground">{t('customerCommunications.history.loading')}</p>
          ) : emailLogError ? (
            <p className="text-sm text-destructive">{t('customerCommunications.history.loadError')}</p>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center">
                      <div className="p-3 bg-green-100 rounded-full mr-4">
                        <CheckCircle className="h-6 w-6 text-green-600" />
                      </div>
                      <div>
                        <p className="text-2xl font-bold text-green-600" data-testid="analytics-sent">
                          {emailLogSummary.sent}
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
                        <p className="text-2xl font-bold text-red-600" data-testid="analytics-failed">
                          {emailLogSummary.failed}
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
                        <p className="text-2xl font-bold text-blue-600" data-testid="analytics-runs">
                          {emailLogSummary.runs}
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
                        <p className="text-2xl font-bold text-purple-600" data-testid="analytics-runs-failed">
                          {emailLogSummary.runsWithFailures}
                        </p>
                        <p className="text-sm text-muted-foreground">{t('customerCommunications.analytics.runsWithFailures')}</p>
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
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {([
                      ['apk', 'apkNotifications', 'text-orange-600'],
                      ['maintenance', 'maintenanceReminders', 'text-blue-600'],
                      ['custom', 'customMessages', 'text-green-600'],
                      ['other', 'otherMessages', 'text-muted-foreground'],
                    ] as const).map(([kind, labelKey, color]) => (
                      <div key={kind} className="p-4 border rounded-lg" data-testid={`analytics-kind-${kind}`}>
                        <h4 className="font-medium text-sm mb-2">{t(`customerCommunications.analytics.${labelKey}`)}</h4>
                        <div className={`text-2xl font-bold ${color}`}>{emailLogSummary.kinds[kind].sent}</div>
                        <p className="text-xs text-muted-foreground">{t('customerCommunications.analytics.emailsSentLabel')}</p>
                        <p className="text-xs text-muted-foreground">
                          {t('customerCommunications.analytics.failedCount', { count: emailLogSummary.kinds[kind].failed })}
                        </p>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground mt-4" data-testid="analytics-basis-note">
                    {t('customerCommunications.analytics.basisNote')}
                  </p>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        <TabsContent value="templates" className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-medium">{t('customerCommunications.templates.sectionTitle')}</h3>
              <p className="text-sm text-muted-foreground">{t('customerCommunications.templates.sectionDescription')}</p>
            </div>
            <RequiresPermission anyOf={[UserPermission.MANAGE_EMAIL_TEMPLATES]}>
              <Button
                onClick={() => {
                  setEditingTemplate(null);
                  setTemplateName("");
                  setTemplateSubject("");
                  setTemplateContent("");
                }}
                className="bg-green-600 hover:bg-green-700"
                data-testid="button-new-template"
              >
                <Mail className="h-4 w-4 mr-2" />
                {t('customerCommunications.templates.newTemplateButton')}
              </Button>
            </RequiresPermission>
          </div>

          <div className="space-y-6">
            {/* Template Builder and Live Preview Row */}
            <div className={`${showLivePreview ? 'grid grid-cols-1 xl:grid-cols-3 gap-6' : ''}`}>
              {/* Template Builder */}
              <Card ref={templateBuilderRef} className={showLivePreview ? 'xl:col-span-2' : ''}>
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
                    ref={templateNameRef}
                    id="template-name"
                    placeholder={t('customerCommunications.templates.templateNamePlaceholder')}
                    value={editingSystemTemplate ? templateDisplayName({ name: templateName }) : templateName}
                    onChange={(e) => setTemplateName(e.target.value)}
                    // The portal looks a system template up by its name, so a renamed one silently falls back to the built-in text.
                    disabled={editingSystemTemplate}
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
                  <Select value={templateCategory} onValueChange={(value: 'apk' | 'maintenance' | 'custom' | 'portal') => setTemplateCategory(value)}>
                    <SelectTrigger>
                      <SelectValue placeholder={t('customerCommunications.templates.categoryPlaceholder')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="apk">{t('customerCommunications.templates.categoryApk')}</SelectItem>
                      <SelectItem value="maintenance">{t('customerCommunications.templates.categoryMaintenance')}</SelectItem>
                      <SelectItem value="custom">{t('customerCommunications.templates.categoryCustom')}</SelectItem>
                      {templateCategory === 'portal' && (
                        <SelectItem value="portal">{t('customerCommunications.templates.categoryPortalShort')}</SelectItem>
                      )}
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
                  <RequiresPermission anyOf={[UserPermission.MANAGE_EMAIL_TEMPLATES]}>
                  <Button
                    data-testid="button-save-template"
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
                          throw new Error(t('customerCommunications.toasts.saveTemplateRequestFailed', { status: response.status }));
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
                        setTemplateCategory("custom");
                        setEditingTemplate(null);

                        // The saved-template list is a query of its own; without
                        // this it keeps showing the old state (audit A-13-4).
                        await queryClient.invalidateQueries({ queryKey: ['/api/email-templates'] });
                      } catch (error) {
                        console.error('Failed to save template:', error);
                        toast({
                          title: t('customerCommunications.toasts.saveTemplateFailedTitle'),
                          description: describeApiError(error, undefined, t('customerCommunications.toasts.genericError')),
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
                  </RequiresPermission>

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
                              <div>{t('customerCommunications.templates.sampleCustomer', { value: sampleValues.customerName })}</div>
                              <div>{t('customerCommunications.templates.sampleVehicle', { brand: sampleValues.vehicleBrand, model: sampleValues.vehicleModel, plate: sampleValues.vehiclePlate })}</div>
                              <div>{t('customerCommunications.templates.sampleApkDate', { value: sampleValues.apkDate })}</div>
                              <div>{t('customerCommunications.templates.sampleCompany', { value: sampleValues.companyName })}</div>
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
                    <Select value={templateCategoryFilter} onValueChange={(value: any) => setTemplateCategoryFilter(value as 'all' | 'apk' | 'maintenance' | 'custom' | 'portal')}>
                      <SelectTrigger className="w-32" data-testid="select-template-category">
                        <SelectValue placeholder={t('customerCommunications.templates.categoryFilterPlaceholder')} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">{t('customerCommunications.templates.categoryAll')}</SelectItem>
                        <SelectItem value="apk">{t('customerCommunications.templates.categoryApkShort')}</SelectItem>
                        <SelectItem value="maintenance">{t('customerCommunications.templates.categoryMaintenance')}</SelectItem>
                        <SelectItem value="custom">{t('customerCommunications.templates.categoryCustom')}</SelectItem>
                        <SelectItem value="portal">{t('customerCommunications.templates.categoryPortalShort')}</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select value={templateLanguageFilter} onValueChange={(value: string) => setTemplateLanguageFilter(value as 'all' | SupportedLanguage)}>
                      <SelectTrigger className="w-36" data-testid="select-template-language" aria-label={t('customerCommunications.templates.languageFilterPlaceholder')}>
                        <SelectValue placeholder={t('customerCommunications.templates.languageFilterPlaceholder')} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">{t('customerCommunications.templates.languageAll')}</SelectItem>
                        {SUPPORTED_LANGUAGES.map((language) => (
                          <SelectItem key={language} value={language}>{LANGUAGE_NAMES[language]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {!canManageEmailTemplates ? (
                  // B-29a §3: the list itself is a query gated outside the
                  // page's own permission family (MANAGE_EMAIL_TEMPLATES,
                  // not MANAGE_NOTIFICATIONS) - a visible hole, not a
                  // genuine "zero templates" state.
                  <NoDataAccess permission={UserPermission.MANAGE_EMAIL_TEMPLATES} />
                ) : savedTemplates.length === 0 ? (
                  <div className="text-center py-8">
                    <Mail className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <h3 className="text-lg font-medium mb-2">{t('customerCommunications.templates.noTemplatesYetTitle')}</h3>
                    <p className="text-muted-foreground mb-4">
                      {t('customerCommunications.templates.noTemplatesYetDescription')}
                    </p>
                    <RequiresPermission anyOf={[UserPermission.MANAGE_EMAIL_TEMPLATES]}>
                      <Button
                        onClick={() => {
                          setEditingTemplate(null);
                          setTemplateName("");
                          setTemplateSubject("");
                          setTemplateContent("");
                          setTemplateCategory("custom");
                        }}
                        className="bg-green-600 hover:bg-green-700"
                        data-testid="button-create-first-template"
                      >
                        <Mail className="h-4 w-4 mr-2" />
                        {t('customerCommunications.templates.createTemplateButton')}
                      </Button>
                    </RequiresPermission>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
                    {filteredTemplates.map((template: any) => (
                      <div key={template.id} className="p-4 border rounded-lg hover:shadow-sm transition-shadow bg-white" data-testid={`template-card-${template.id}`}>
                        <div className="space-y-3">
                          <div className="flex items-start justify-between">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center space-x-2 mb-2">
                                <h4 className="font-medium text-sm truncate">{templateDisplayName(template)}</h4>
                                <Badge className={`text-xs ${getCategoryBadgeColor(template.category)}`}>
                                  {categoryBadgeText(template.category)}
                                </Badge>
                              </div>
                              <p className="text-xs text-muted-foreground mb-2 truncate">{template.subject}</p>
                              <p className="text-xs text-gray-500 mb-2 line-clamp-3 leading-relaxed">
                                {isSystemTemplate(template) ? htmlToPlainText(template.content) : template.content}
                              </p>
                              <div className="text-xs text-muted-foreground space-y-1">
                                <div>{t('customerCommunications.templates.createdLabel', { date: formatDate(template.createdAt) })}</div>
                                {template.lastUsed && (
                                  <div>{t('customerCommunications.templates.lastUsedLabel', { date: formatDate(template.lastUsed) })}</div>
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
                            <RequiresPermission anyOf={[UserPermission.MANAGE_EMAIL_TEMPLATES]}>
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
                            </RequiresPermission>
                            <RequiresPermission anyOf={[UserPermission.MANAGE_EMAIL_TEMPLATES]}>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => beginEditingTemplate(template)}
                                data-testid={`button-edit-${template.id}`}
                                title={t('customerCommunications.templates.editTitle')}
                                className="h-8 px-2 text-xs"
                              >
                                <Edit className="h-3 w-3 mr-1" />
                                {t('customerCommunications.templates.editButton')}
                              </Button>
                            </RequiresPermission>
                            <RequiresPermission anyOf={[UserPermission.MANAGE_EMAIL_TEMPLATES]}>
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
                            </RequiresPermission>
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
          {(() => {
            // Mails, not rows: vehicles nobody rents share one notice to the office.
            const recipients = emailPreview?.recipients ?? [];
            const mailCount = recipients.filter((recipient) => !recipient.office).length + (recipients.some((recipient) => recipient.office) ? 1 : 0);
            const shown = recipients.find((recipient) => recipient.key === previewRecipientKey) ?? recipients[0];
            const isMassSend = mailCount >= MASS_SEND_THRESHOLD;
            const sourceText = emailPreview ? `${emailPreview.subject}\n${emailPreview.content}` : '';
            const emptyFields = shown && !shown.office ? emptyPlaceholders(sourceText, shown) : [];
            const unsupported = unsupportedPlaceholders(sourceText);
            const placeholderLabel = (key: string) => t(`customerCommunications.placeholders.${key}.label`, { defaultValue: key });

            return (
              <>
                <DialogHeader>
                  <DialogTitle>{t('customerCommunications.dialogs.emailPreview.title')}</DialogTitle>
                  <DialogDescription>
                    {t('customerCommunications.dialogs.emailPreview.descriptionReview', { count: mailCount })}
                  </DialogDescription>
                </DialogHeader>

                {emailPreview && shown && (
                  <div className="space-y-6">
                    {/* The mail of the chosen recipient */}
                    <div className="space-y-4">
                      <p className="text-xs text-muted-foreground" data-testid="preview-showing-for">
                        {shown.office
                          ? t('customerCommunications.dialogs.emailPreview.showingForOffice')
                          : t('customerCommunications.dialogs.emailPreview.showingFor', { name: shown.name })}
                      </p>
                      <div>
                        <Label className="text-sm font-medium">{t('customerCommunications.dialogs.emailPreview.subjectLabel')}</Label>
                        <div className="mt-1 p-3 bg-gray-50 rounded border">
                          <p className="font-medium" data-testid="preview-subject">{renderForRecipient(emailPreview.subject, shown)}</p>
                        </div>
                      </div>

                      <div>
                        <Label className="text-sm font-medium">{t('customerCommunications.dialogs.emailPreview.contentLabel')}</Label>
                        <div className="mt-1 p-4 bg-gray-50 rounded border">
                          <pre className="whitespace-pre-wrap text-sm leading-relaxed font-sans" data-testid="preview-content">
                            {renderForRecipient(emailPreview.content, shown)}
                          </pre>
                        </div>
                      </div>

                      {emptyFields.length > 0 && (
                        <p className="text-xs text-amber-700" data-testid="preview-empty-note">
                          {t('customerCommunications.dialogs.emailPreview.emptyNote', { fields: emptyFields.map(placeholderLabel).join(', ') })}
                        </p>
                      )}
                      {unsupported.length > 0 && (
                        <p className="text-xs text-amber-700" data-testid="preview-unsupported-note">
                          {t('customerCommunications.dialogs.emailPreview.unsupportedNote', { fields: unsupported.map((key) => `{${key}}`).join(', ') })}
                        </p>
                      )}
                    </div>

                    {/* Recipients List */}
                    <div>
                      <Label className="text-sm font-medium">
                        {t('customerCommunications.dialogs.emailPreview.recipientsLabel', { count: mailCount })}
                      </Label>
                      <div className="mt-2 max-h-48 overflow-y-auto border rounded">
                        <div className="divide-y">
                          {recipients.map((recipient) => (
                            <div
                              key={recipient.key}
                              className={`p-3 space-y-2 cursor-pointer ${recipient.key === shown.key ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                              onClick={() => setPreviewRecipientKey(recipient.key)}
                              // Keyboard: the row itself (not the controls inside it) takes Enter and Space.
                              tabIndex={0}
                              aria-current={recipient.key === shown.key ? "true" : undefined}
                              onKeyDown={(event) => {
                                if (event.target !== event.currentTarget) return;
                                if (event.key === 'Enter' || event.key === ' ') {
                                  event.preventDefault();
                                  setPreviewRecipientKey(recipient.key);
                                }
                              }}
                              data-testid={`preview-recipient-${recipient.key}`}
                            >
                              <div className="flex justify-between items-start">
                                <div className="space-y-1 flex-1">
                                  <div className="font-medium text-sm">
                                    {recipient.office ? t('customerCommunications.dialogs.emailPreview.officeBadge') : recipient.name}
                                  </div>
                                  {recipient.vehicleLicense && (
                                    <div className="text-xs text-blue-600 font-mono">
                                      {recipient.vehicleLicense}
                                    </div>
                                  )}
                                </div>
                                {recipient.emailField && (
                                  <Badge variant="outline" className="text-xs">
                                    {t(`customerCommunications.emailOptionLabels.${recipient.emailField}`)}
                                  </Badge>
                                )}
                              </div>
                              {/* Email Selection */}
                              <div className="space-y-2" onClick={(event) => event.stopPropagation()}>
                                {recipient.office ? (
                                  <div className="text-xs text-muted-foreground">
                                    {t('customerCommunications.dialogs.emailPreview.officeNote')}
                                  </div>
                                ) : recipient.vehicleId !== null && recipient.emailOptions.length > 1 ? (
                                  <div className="space-y-1">
                                    <Label className="text-xs font-medium">{t('customerCommunications.dialogs.emailPreview.selectEmailLabel')}</Label>
                                    <Select
                                      value={recipient.emailField ?? undefined}
                                      onValueChange={(value) => handleEmailSelection(recipient.key, value)}
                                    >
                                      <SelectTrigger className="w-full h-8 text-xs" data-testid={`preview-email-select-${recipient.key}`}>
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {recipient.emailOptions.map((option) => (
                                          <SelectItem key={option.field} value={option.field}>
                                            <div className="flex items-center justify-between w-full">
                                              <span className="font-medium">{t(`customerCommunications.emailOptionLabels.${option.field}`)}</span>
                                              <span className="text-muted-foreground ml-2">{option.email}</span>
                                            </div>
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </div>
                                ) : recipient.email ? (
                                  <div className="text-xs text-muted-foreground">
                                    <span className="font-medium">{t('customerCommunications.dialogs.emailPreview.emailLabel')}</span> {recipient.email}
                                  </div>
                                ) : (
                                  <div className="text-xs text-red-700">
                                    {t('customerCommunications.dialogs.emailPreview.noAddressNote')}
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
                          {t('customerCommunications.dialogs.emailPreview.readyToSend', { count: mailCount })}
                        </span>
                      </div>
                      <p className="text-xs text-blue-700 mt-1">
                        {t('customerCommunications.dialogs.emailPreview.personalizedNote')}
                      </p>
                    </div>

                    {/* A send to many people needs a second, explicit confirmation (audit A-13-12) */}
                    {isMassSend && (
                      <div className="bg-amber-50 border border-amber-300 rounded p-4 space-y-3" data-testid="mass-send-warning">
                        <div className="flex items-center space-x-2">
                          <AlertTriangle className="h-4 w-4 text-amber-700" />
                          <span className="text-sm font-medium text-amber-900">
                            {t('customerCommunications.dialogs.emailPreview.massSendTitle')}
                          </span>
                        </div>
                        <p className="text-sm text-amber-900">
                          {t('customerCommunications.dialogs.emailPreview.massSendWarning', { count: mailCount })}
                        </p>
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            id="mass-send-acknowledge"
                            checked={massSendAcknowledged}
                            onCheckedChange={(checked) => setMassSendAcknowledged(checked === true)}
                            data-testid="mass-send-acknowledge"
                          />
                          <Label htmlFor="mass-send-acknowledge" className="text-sm text-amber-900">
                            {t('customerCommunications.dialogs.emailPreview.massSendAcknowledge')}
                          </Label>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <DialogFooter>
                  <Button variant="outline" onClick={() => setPreviewDialogOpen(false)}>
                    {t('customerCommunications.dialogs.emailPreview.cancelButton')}
                  </Button>
                  <RequiresPermission anyOf={[UserPermission.MANAGE_NOTIFICATIONS]}>
                    <Button
                      onClick={confirmSendNotifications}
                      disabled={isLoadingNotifications || (isMassSend && !massSendAcknowledged)}
                      className="bg-green-600 hover:bg-green-700"
                      data-testid="button-confirm-send-notifications"
                    >
                      {isLoadingNotifications ? t('customerCommunications.dialogs.emailPreview.sendingButton') : t('customerCommunications.dialogs.emailPreview.confirmSendButton')}
                    </Button>
                  </RequiresPermission>
                </DialogFooter>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      <EmailLogDetailDialog
        row={logDetailRow}
        status={logDetailRow ? emailLogStatus(logDetailRow) : 'sent'}
        kindLabel={logDetailRow ? logKindLabel(logDetailRow.template) : ''}
        onClose={() => setLogDetailRow(null)}
      />

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
                      {categoryBadgeText(selectedTemplateForPreview.category)}
                    </Badge>
                  </div>
                  <div className="font-medium text-sm text-gray-600 mt-1">{t('customerCommunications.dialogs.templatePreview.toLabel')}</div>
                  <div className="font-bold text-lg mt-2">{selectedTemplateForPreview.subject}</div>
                </div>
                <div className="whitespace-pre-wrap text-gray-900">
                  {isSystemTemplate(selectedTemplateForPreview) ? htmlToPlainText(selectedTemplateForPreview.content) : selectedTemplateForPreview.content}
                </div>
              </div>
              <div className="text-xs text-muted-foreground">
                <div><strong>{t('customerCommunications.dialogs.templatePreview.templateLabel')}</strong> {templateDisplayName(selectedTemplateForPreview)}</div>
                <div><strong>{t('customerCommunications.dialogs.templatePreview.categoryLabel')}</strong> {selectedTemplateForPreview.category === 'portal' ? t('customerCommunications.templates.categoryPortalShort') : selectedTemplateForPreview.category || t('customerCommunications.dialogs.templatePreview.defaultCategory')}</div>
                <div><strong>{t('customerCommunications.dialogs.templatePreview.createdLabel')}</strong> {formatDate(selectedTemplateForPreview.createdAt)}</div>
                {selectedTemplateForPreview.lastUsed && (
                  <div><strong>{t('customerCommunications.dialogs.templatePreview.lastUsedLabel')}</strong> {formatDate(selectedTemplateForPreview.lastUsed)}</div>
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setTemplatePreviewDialog(false)}>
              {t('customerCommunications.dialogs.templatePreview.closeButton')}
            </Button>
            {selectedTemplateForPreview && (
              <RequiresPermission anyOf={[UserPermission.MANAGE_EMAIL_TEMPLATES]}>
                <Button
                  data-testid="button-edit-template-from-preview"
                  onClick={() => {
                    setTemplatePreviewDialog(false);
                    beginEditingTemplate(selectedTemplateForPreview);
                  }}
                >
                  <Edit className="mr-2 h-4 w-4" />
                  {t('customerCommunications.dialogs.templatePreview.editTemplateButton')}
                </Button>
              </RequiresPermission>
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
              {t('customerCommunications.dialogs.deleteTemplate.description', { name: templateToDelete ? templateDisplayName(templateToDelete) : '' })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTemplateToDelete(null)}>
              {t('customerCommunications.dialogs.deleteTemplate.cancelButton')}
            </Button>
            <RequiresPermission anyOf={[UserPermission.MANAGE_EMAIL_TEMPLATES]}>
            <Button
              data-testid="button-confirm-delete-template"
              onClick={confirmDeleteTemplate}
              className="bg-red-600 hover:bg-red-700"
            >
              {t('customerCommunications.dialogs.deleteTemplate.deleteButton')}
            </Button>
            </RequiresPermission>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}