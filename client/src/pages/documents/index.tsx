import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
import { useToast } from "@/hooks/use-toast";
import { Document, Vehicle } from "@shared/schema";
import { formatDate, formatFileSize } from "@/lib/format-utils";
import { displayLicensePlate } from "@/lib/utils";
import { apiRequest , invalidateByPrefix } from "@/lib/queryClient";
import PDFTemplateEditor from "./template-editor";
import TransportReportTemplateEditor from "./transport-report-template-editor";
import { FileEdit, Star, Trash2, Printer, Eye, ChevronDown, ChevronRight, Image, Plus, X, Edit, Settings as SettingsIcon, Truck } from "lucide-react";
import DamageCheckTemplateStudio from "@/pages/settings/damage-check-template-studio";
import { useAuth } from "@/hooks/use-auth";
import { UserRole } from "@shared/schema";

export default function DocumentsIndex() {
  const { t } = useTranslation("documents");
  const [searchQuery, setSearchQuery] = useState("");
  const [vehicleFilter, setVehicleFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [documentToDelete, setDocumentToDelete] = useState<Document | null>(null);
  const [printDialogOpen, setPrintDialogOpen] = useState(false);
  const [documentToPrint, setDocumentToPrint] = useState<Document | null>(null);
  const [iframeError, setIframeError] = useState(false);
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [documentToEmail, setDocumentToEmail] = useState<Document | null>(null);
  const [emailRecipients, setEmailRecipients] = useState('');
  const [emailSubject, setEmailSubject] = useState('');
  const [emailMessage, setEmailMessage] = useState('');
  const [expandedVehicles, setExpandedVehicles] = useState<Set<string>>(new Set());
  const [expandedDocumentTypes, setExpandedDocumentTypes] = useState<Set<string>>(new Set());
  const [itemsPerPage] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);
  const [templateDeleteDialogOpen, setTemplateDeleteDialogOpen] = useState(false);
  const [templateToDelete, setTemplateToDelete] = useState<any | null>(null);
  const [templateEditorDialogOpen, setTemplateEditorDialogOpen] = useState(false);
  const [transportTemplateEditorDialogOpen, setTransportTemplateEditorDialogOpen] = useState(false);
  
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Fetch documents
  const { data: documents, isLoading: isLoadingDocuments } = useQuery<Document[]>({
    queryKey: ["/api/documents"],
  });
  
  // Fetch vehicles for filter
  const { data: vehicles } = useQuery<Vehicle[]>({
    queryKey: ["/api/vehicles"],
  });
  
  // Fetch templates
  const { data: templates, isLoading: isLoadingTemplates } = useQuery({
    queryKey: ['/api/pdf-templates'],
  });

  // Fetch transport report templates
  const { data: transportTemplates, isLoading: isLoadingTransportTemplates } = useQuery<any[]>({
    queryKey: ['/api/transport-report-templates'],
  });
  
  // Delete document mutation
  const deleteDocumentMutation = useMutation({
    mutationFn: async (documentId: number) => {
      const response = await apiRequest('DELETE', `/api/documents/${documentId}`);
      return response;
    },
    onSuccess: () => {
      toast({
        title: t('indexPage.toasts.documentDeletedTitle'),
        description: t('indexPage.toasts.documentDeletedDescription'),
      });
      invalidateByPrefix("/api/documents");
      setDeleteDialogOpen(false);
      setDocumentToDelete(null);
    },
    onError: (error: any) => {
      toast({
        title: t('indexPage.toasts.errorTitle'),
        description: error.message || t('indexPage.toasts.deleteDocumentFailed'),
        variant: "destructive",
      });
    },
  });

  // Email document mutation
  const emailDocumentMutation = useMutation({
    mutationFn: async (emailData: { documentId: number; recipients: string; subject: string; message: string }) => {
      const response = await apiRequest('POST', `/api/documents/${emailData.documentId}/email`, emailData);
      return response;
    },
    onSuccess: () => {
      toast({
        title: t('indexPage.toasts.emailSentTitle'),
        description: t('indexPage.toasts.emailSentDescription'),
      });
      setEmailDialogOpen(false);
      setDocumentToEmail(null);
      setEmailRecipients('');
      setEmailSubject('');
      setEmailMessage('');
    },
    onError: (error: any) => {
      toast({
        title: t('indexPage.toasts.errorTitle'),
        description: error.message || t('indexPage.toasts.sendEmailFailed'),
        variant: "destructive",
      });
    },
  });

  // Delete template mutation
  const deleteTemplateMutation = useMutation({
    mutationFn: async (templateId: number) => {
      const response = await apiRequest('DELETE', `/api/pdf-templates/${templateId}`);
      return response;
    },
    onSuccess: () => {
      toast({
        title: t('indexPage.toasts.templateDeletedTitle'),
        description: t('indexPage.toasts.templateDeletedDescription'),
      });
      invalidateByPrefix("/api/pdf-templates");
      setTemplateDeleteDialogOpen(false);
      setTemplateToDelete(null);
    },
    onError: (error: any) => {
      toast({
        title: t('indexPage.toasts.errorTitle'),
        description: error.message || t('indexPage.toasts.deleteTemplateFailed'),
        variant: "destructive",
      });
    },
  });
  
  // Handle delete document
  const handleDeleteDocument = (document: Document) => {
    setDocumentToDelete(document);
    setDeleteDialogOpen(true);
  };
  
  // Confirm delete document
  const confirmDeleteDocument = () => {
    if (documentToDelete) {
      deleteDocumentMutation.mutate(documentToDelete.id);
    }
  };

  // Handle email document
  const handleEmailDocument = (document: Document) => {
    setDocumentToEmail(document);
    setEmailSubject(t('indexPage.emailDefaults.subject', { fileName: document.fileName }));
    setEmailMessage(t('indexPage.emailDefaults.message', {
      fileName: document.fileName,
      documentType: document.documentType,
      uploadDate: new Date(document.uploadDate || '').toLocaleDateString(),
    }));
    setEmailDialogOpen(true);
  };

  // Confirm send email
  const confirmSendEmail = () => {
    if (documentToEmail && emailRecipients.trim()) {
      emailDocumentMutation.mutate({
        documentId: documentToEmail.id,
        recipients: emailRecipients,
        subject: emailSubject,
        message: emailMessage,
      });
    }
  };

  // Check if document can be emailed (only damage and contract documents)
  const canEmailDocument = (documentType: string) => {
    const emailableTypes = ['damage', 'contract'];
    return emailableTypes.some(type => documentType.toLowerCase().includes(type));
  };

  // Handle delete template
  const handleDeleteTemplate = (template: any) => {
    setTemplateToDelete(template);
    setTemplateDeleteDialogOpen(true);
  };

  // Confirm delete template
  const confirmDeleteTemplate = () => {
    if (templateToDelete) {
      deleteTemplateMutation.mutate(templateToDelete.id);
    }
  };
  
  // Handle view document - opens the in-app preview dialog (iframe-embedded,
  // with a fallback to a new tab if the browser blocks the embedded preview)
  // rather than a window.open() popup, which popup blockers frequently kill.
  const handleViewDocument = (document: Document) => {
    setDocumentToPrint(document);
    setIframeError(false);
    setPrintDialogOpen(true);
  };

  // Handle print document - same in-app dialog; its footer has a Print button
  const handlePrintDocument = (document: Document) => {
    setDocumentToPrint(document);
    setIframeError(false);
    setPrintDialogOpen(true);
  };
  
  // Print the document directly without downloads
  const printDocument = () => {
    if (documentToPrint) {
      console.log('Attempting to print document:', documentToPrint.fileName);
      
      // First try to print from the visible iframe if it's working
      if (!iframeError) {
        const iframe = document.getElementById('print-preview-iframe') as HTMLIFrameElement;
        if (iframe && iframe.contentWindow) {
          try {
            console.log('Trying to print from visible iframe...');
            iframe.contentWindow.print();
            console.log('Print from visible iframe succeeded');
            return; // Success, exit function
          } catch (error) {
            console.log('Failed to print from preview iframe:', error);
            console.log('Trying popup window approach...');
          }
        }
      }
      
      // Alternative approach: Print-specific popup window
      console.log('Using popup window for direct printing...');
      
      const printUrl = `/api/documents/view/${documentToPrint.id}`;
      
      // Create a small popup window specifically for printing
      const printWindow = window.open(
        printUrl, 
        'printWindow',
        'width=800,height=600,scrollbars=yes,resizable=yes,toolbar=no,menubar=no,location=no,status=no'
      );
      
      if (printWindow) {
        // Wait for the document to load, then print and close
        printWindow.onload = () => {
          setTimeout(() => {
            try {
              console.log('Print window loaded, attempting to print...');
              printWindow.print();
              console.log('Print command sent successfully');
              
              // Close the popup after printing (with a delay)
              setTimeout(() => {
                if (!printWindow.closed) {
                  printWindow.close();
                  console.log('Print window closed');
                }
              }, 2000);
              
              // Show success message
              toast({
                title: t('indexPage.toasts.printingStartedTitle'),
                description: t('indexPage.toasts.printingStartedDescription'),
                duration: 3000,
              });

            } catch (error) {
              console.error('Failed to print from popup window:', error);
              printWindow.close();

              // Last resort fallback message
              toast({
                title: t('indexPage.toasts.printFailedTitle'),
                description: t('indexPage.toasts.printFailedDescription'),
                variant: "destructive",
                duration: 5000,
              });
            }
          }, 1500); // Give time for content to fully load
        };

        // Handle case where popup is blocked
        printWindow.onerror = () => {
          console.error('Print popup window failed to load');
          toast({
            title: t('indexPage.toasts.popupBlockedTitle'),
            description: t('indexPage.toasts.popupBlockedDescription'),
            variant: "destructive",
            duration: 5000,
          });
        };
      } else {
        console.error('Failed to open print popup window');
        toast({
          title: t('indexPage.toasts.popupBlockedTitle'),
          description: t('indexPage.toasts.popupBlockedDescription'),
          variant: "destructive",
          duration: 5000,
        });
      }
    }
  };
  
  // Handle iframe load error
  const handleIframeError = () => {
    setIframeError(true);
  };
  
  // Helper function to normalize document types - combine all contract types
  const normalizeDocumentType = (type: string): string => {
    // Combine all contract types into a single "Contracts" category
    if (type.toLowerCase().includes('contract')) {
      return "Contracts";
    }
    return type;
  };
  
  // Get unique document types (normalized to group versioned contracts)
  const documentTypes = documents 
    ? ["all", ...new Set(documents.map(doc => normalizeDocumentType(doc.documentType)))]
    : ["all"];
  
  // Filter documents based on search, vehicle and type filters
  const filteredDocuments = documents?.filter(doc => {
    const searchLower = searchQuery.toLowerCase();
    const matchesSearch = (
      doc.fileName.toLowerCase().includes(searchLower) ||
      doc.documentType.toLowerCase().includes(searchLower) ||
      (doc.notes && doc.notes.toLowerCase().includes(searchLower))
    );
    
    const matchesVehicle = vehicleFilter === "all" || (doc.vehicleId != null ? doc.vehicleId.toString() : "general") === vehicleFilter;
    // Match both exact type and normalized type for versioned contracts
    const matchesType = typeFilter === "all" || 
                        doc.documentType === typeFilter || 
                        normalizeDocumentType(doc.documentType) === typeFilter;
    
    return matchesSearch && matchesVehicle && matchesType;
  });
  
  // Group documents by vehicle, then by category (using normalized types).
  // Documents with no vehicle (general reports spanning multiple vehicles,
  // e.g. a transports summary) are grouped under the "general" pseudo-key so
  // they reuse the same expand/collapse/pagination UI as a vehicle's card.
  const documentsByVehicle = filteredDocuments?.reduce((acc, doc) => {
    const normalizedType = normalizeDocumentType(doc.documentType);
    const groupKey = doc.vehicleId != null ? doc.vehicleId.toString() : "general";
    if (!acc[groupKey]) {
      acc[groupKey] = {};
    }
    if (!acc[groupKey][normalizedType]) {
      acc[groupKey][normalizedType] = [];
    }
    acc[groupKey][normalizedType].push(doc);
    return acc;
  }, {} as Record<string, Record<string, Document[]>>) || {};
  
  // Helper function to get document icon based on content type
  const getDocumentIcon = (contentType: string) => {
    if (contentType.startsWith('image/')) {
      return (
        <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-image text-gray-600">
          <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
          <circle cx="9" cy="9" r="2" />
          <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
        </svg>
      );
    } else if (contentType === 'application/pdf') {
      return (
        <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-file-text text-gray-600">
          <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" x2="8" y1="13" y2="13" />
          <line x1="16" x2="8" y1="17" y2="17" />
          <line x1="10" x2="8" y1="9" y2="9" />
        </svg>
      );
    } else {
      return (
        <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-file text-gray-600">
          <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
          <polyline points="14 2 14 8 20 8" />
        </svg>
      );
    }
  };
  
  // Helper function to get vehicle details
  const getVehicleName = (vehicleId: number) => {
    const vehicle = vehicles?.find(v => v.id === vehicleId);
    return vehicle 
      ? `${displayLicensePlate(vehicle.licensePlate)} - ${vehicle.brand} ${vehicle.model}`
      : `Vehicle #${vehicleId}`;
  };
  
  // Toggle vehicle expansion
  const toggleVehicle = (vehicleId: string) => {
    setExpandedVehicles(prev => {
      const newSet = new Set(prev);
      if (newSet.has(vehicleId)) {
        newSet.delete(vehicleId);
      } else {
        newSet.add(vehicleId);
      }
      return newSet;
    });
  };

  // Toggle document type expansion
  const toggleDocumentType = (vehicleId: string, documentType: string) => {
    const key = `${vehicleId}-${documentType}`;
    setExpandedDocumentTypes(prev => {
      const newSet = new Set(prev);
      if (newSet.has(key)) {
        newSet.delete(key);
      } else {
        newSet.add(key);
      }
      return newSet;
    });
  };
  
  // Pagination logic
  const vehicleIds = Object.keys(documentsByVehicle);
  const totalPages = Math.ceil(vehicleIds.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedVehicleIds = vehicleIds.slice(startIndex, endIndex);
  
  const [activeTab, setActiveTab] = useState("library");
  
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">{t('indexPage.title')}</h1>
        <Link href="/documents/upload">
          <Button>
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-upload mr-2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" x2="12" y1="3" y2="15" />
            </svg>
            {t('indexPage.uploadDocumentButton')}
          </Button>
        </Link>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="library">{t('indexPage.tabLibrary')}</TabsTrigger>
          <TabsTrigger value="template-editor">{t('indexPage.tabContractTemplates')}</TabsTrigger>
          <TabsTrigger value="transport-templates" data-testid="tab-transport-templates">{t('indexPage.tabTransportTemplates')}</TabsTrigger>
          <TabsTrigger value="damage-check">{t('indexPage.tabDamageCheckTemplates')}</TabsTrigger>
        </TabsList>

        <TabsContent value="library">
          <Card>
            <CardHeader>
              <CardTitle>{t('indexPage.libraryCardTitle')}</CardTitle>
              <CardDescription>
                {t('indexPage.libraryCardDescription')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col md:flex-row gap-4 mb-6">
                <Input
                  placeholder={t('indexPage.searchPlaceholder')}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="max-w-sm"
                />

                <div className="flex gap-4">
                  <Select value={vehicleFilter} onValueChange={setVehicleFilter}>
                    <SelectTrigger className="w-[200px]">
                      <SelectValue placeholder={t('indexPage.filterByVehiclePlaceholder')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t('indexPage.allVehicles')}</SelectItem>
                      <SelectItem value="general">{t('indexPage.generalReports')}</SelectItem>
                      {vehicles?.map((vehicle) => (
                        <SelectItem key={vehicle.id} value={vehicle.id.toString()}>
                          {displayLicensePlate(vehicle.licensePlate)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select value={typeFilter} onValueChange={setTypeFilter}>
                    <SelectTrigger className="w-[200px]">
                      <SelectValue placeholder={t('indexPage.filterByTypePlaceholder')} />
                    </SelectTrigger>
                    <SelectContent>
                      {documentTypes.map((type) => (
                        <SelectItem key={type} value={type}>
                          {type === "all" ? t('indexPage.allDocumentTypes') : type}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {isLoadingDocuments ? (
                <div className="flex justify-center items-center h-64">
                  <svg className="animate-spin h-8 w-8 text-primary-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                </div>
              ) : filteredDocuments?.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  {t('indexPage.noDocumentsFound')}
                </div>
              ) : (
                <>
                  {/* Summary Stats */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                    <Card>
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm text-gray-500">{t('indexPage.statTotalVehicles')}</p>
                            <p className="text-2xl font-bold">{vehicleIds.length}</p>
                          </div>
                          <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center">
                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-blue-600">
                              <path d="M14 16H9m10 0h3v-3.15a1 1 0 0 0-.84-.99L16 11l-2.7-3.6a1 1 0 0 0-.8-.4H5.24a2 2 0 0 0-1.8 1.1l-.8 1.63A6 6 0 0 0 2 12.42V16h2"/>
                              <circle cx="6.5" cy="16.5" r="2.5"/>
                              <circle cx="16.5" cy="16.5" r="2.5"/>
                            </svg>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm text-gray-500">{t('indexPage.statTotalDocuments')}</p>
                            <p className="text-2xl font-bold">{filteredDocuments?.length || 0}</p>
                          </div>
                          <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-green-600">
                              <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>
                              <polyline points="14 2 14 8 20 8"/>
                            </svg>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm text-gray-500">{t('indexPage.statDocumentTypes')}</p>
                            <p className="text-2xl font-bold">{documentTypes.length - 1}</p>
                          </div>
                          <div className="w-12 h-12 rounded-full bg-purple-100 flex items-center justify-center">
                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-purple-600">
                              <path d="M4 6h16M4 10h16M4 14h16M4 18h16"/>
                            </svg>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  <div className="space-y-4">
                    {paginatedVehicleIds.map((vehicleId) => {
                      const categoriesByType = documentsByVehicle[vehicleId];
                      const totalDocs = Object.values(categoriesByType).reduce((sum: number, docs) => sum + (docs as Document[]).length, 0);
                      const isExpanded = expandedVehicles.has(vehicleId);
                      
                      return (
                        <Card key={vehicleId} className="overflow-hidden">
                          <button
                            onClick={() => toggleVehicle(vehicleId)}
                            className="w-full text-left p-4 hover:bg-gray-50 transition-colors"
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                {isExpanded ? (
                                  <ChevronDown className="h-5 w-5 text-gray-500" />
                                ) : (
                                  <ChevronRight className="h-5 w-5 text-gray-500" />
                                )}
                                <h3 className="text-lg font-semibold text-gray-900">
                                  {vehicleId === "general" ? t('indexPage.generalReports') : getVehicleName(parseInt(vehicleId))}
                                </h3>
                              </div>
                              <Badge variant="secondary" className="text-sm">
                                {t('indexPage.documentCount', { count: totalDocs })}
                              </Badge>
                            </div>
                          </button>
                          
                          {isExpanded && (
                            <div className="border-t p-4 space-y-6">
                              {Object.entries(categoriesByType).map(([documentType, docs]) => {
                                const documentList = docs as Document[];
                                const typeKey = `${vehicleId}-${documentType}`;
                                const isTypeExpanded = expandedDocumentTypes.has(typeKey);
                                
                                return (
                            <div key={typeKey} className="space-y-4">
                              <button
                                onClick={() => toggleDocumentType(vehicleId, documentType)}
                                className="w-full flex items-center gap-3 hover:bg-gray-50 p-2 rounded-lg transition-colors"
                              >
                                <div className="flex items-center gap-2 flex-1">
                                  {isTypeExpanded ? (
                                    <ChevronDown className="h-5 w-5 text-gray-500" />
                                  ) : (
                                    <ChevronRight className="h-5 w-5 text-gray-500" />
                                  )}
                                  
                                  {/* Category-specific icon */}
                                  {documentType.toLowerCase().includes('contract') && (
                                    <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center">
                                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-600">
                                        <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>
                                        <polyline points="14 2 14 8 20 8"/>
                                        <path d="M9 15h6M9 11h6"/>
                                      </svg>
                                    </div>
                                  )}
                                  {documentType.toLowerCase().includes('damage') && (
                                    <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center">
                                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-red-600">
                                        <path d="M12 9v4m0 4h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"/>
                                      </svg>
                                    </div>
                                  )}
                                  {documentType.toLowerCase().includes('apk') && (
                                    <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
                                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-green-600">
                                        <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                                      </svg>
                                    </div>
                                  )}
                                  {documentType.toLowerCase().includes('maintenance') && (
                                    <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-600">
                                        <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
                                      </svg>
                                    </div>
                                  )}
                                  {documentType.toLowerCase().includes('insurance') && (
                                    <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center">
                                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-purple-600">
                                        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/>
                                        <path d="m9 12 2 2 4-4"/>
                                      </svg>
                                    </div>
                                  )}
                                  {!['contract', 'damage', 'apk', 'maintenance', 'insurance'].some(keyword => 
                                    documentType.toLowerCase().includes(keyword)) && (
                                    <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
                                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-600">
                                        <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>
                                        <polyline points="14 2 14 8 20 8"/>
                                      </svg>
                                    </div>
                                  )}
                                  
                                  <h4 className="text-lg font-medium text-gray-800">
                                    {documentType}
                                  </h4>
                                  <Badge variant="outline" className="ml-2">
                                    {documentList.length}
                                  </Badge>
                                </div>
                              </button>
                              
                              {isTypeExpanded && (
                              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pl-11">
                                {documentList.map((doc) => (
                                  <Card key={doc.id} className="overflow-hidden hover:shadow-md transition-shadow">
                                    <div className="bg-gradient-to-br from-gray-50 to-gray-100 p-6 flex items-center justify-center">
                                      {getDocumentIcon(doc.contentType)}
                                    </div>
                                    <CardContent className="p-4">
                                      <h5 className="font-medium mb-2 truncate" title={doc.fileName}>
                                        {doc.fileName}
                                      </h5>
                                      
                                      <div className="flex items-center text-sm text-gray-500 mb-2">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1">
                                          <path d="M8 2v4m8-4v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/>
                                        </svg>
                                        <span>{formatDate(doc.uploadDate?.toString() || "")}</span>
                                      </div>
                                      
                                      {doc.notes && (
                                        <p className="text-sm text-gray-600 mb-3 line-clamp-2" title={doc.notes}>
                                          {doc.notes}
                                        </p>
                                      )}
                                      
                                      <div className="flex items-center text-xs text-gray-500 mb-3">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1">
                                          <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>
                                        </svg>
                                        {formatFileSize(doc.fileSize)}
                                      </div>
                                      
                                      <div className="flex justify-between items-center gap-2">
                                        <button 
                                          onClick={() => handleViewDocument(doc)}
                                          className="text-blue-600 hover:text-blue-800 text-sm flex items-center gap-1 transition-colors"
                                          data-testid={`button-view-document-${doc.id}`}
                                        >
                                          <Eye className="h-3.5 w-3.5" />
                                          {t('indexPage.viewButton')}
                                        </button>
                                        
                                        <a 
                                          href={`/api/documents/download/${doc.id}`} 
                                          className="text-gray-600 hover:text-gray-800 text-sm flex items-center gap-1 transition-colors"
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          data-testid={`link-download-document-${doc.id}`}
                                        >
                                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                                            <polyline points="7 10 12 15 17 10"/>
                                            <line x1="12" x2="12" y1="15" y2="3"/>
                                          </svg>
                                          {t('indexPage.downloadButton')}
                                        </a>
                                        
                                        {canEmailDocument(doc.documentType) && (
                                          <button 
                                            onClick={() => handleEmailDocument(doc)}
                                            className="text-purple-600 hover:text-purple-800 text-sm flex items-center gap-1 transition-colors"
                                            data-testid={`button-email-document-${doc.id}`}
                                          >
                                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                                              <polyline points="22,6 12,13 2,6"/>
                                            </svg>
                                            {t('indexPage.emailButton')}
                                          </button>
                                        )}

                                        <button
                                          onClick={() => handlePrintDocument(doc)}
                                          className="text-green-600 hover:text-green-800 text-sm flex items-center gap-1 transition-colors"
                                          data-testid={`button-print-document-${doc.id}`}
                                        >
                                          <Printer className="h-3.5 w-3.5" />
                                          {t('indexPage.printButton')}
                                        </button>
                                        <button
                                          onClick={() => handleDeleteDocument(doc)}
                                          className="text-red-600 hover:text-red-800 text-sm flex items-center gap-1 transition-colors"
                                          data-testid={`button-delete-document-${doc.id}`}
                                        >
                                          <Trash2 className="h-3.5 w-3.5" />
                                          {t('indexPage.deleteButton')}
                                        </button>
                                      </div>
                                    </CardContent>
                                  </Card>
                                ))}
                              </div>
                              )}
                            </div>
                                );
                              })}
                            </div>
                          )}
                        </Card>
                      );
                    })}
                  </div>

                  {/* Pagination Controls */}
                  {totalPages > 1 && (
                    <div className="flex items-center justify-center gap-2 mt-6">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                        disabled={currentPage === 1}
                      >
                        {t('indexPage.previousButton')}
                      </Button>
                      <div className="flex items-center gap-2">
                        {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                          <Button
                            key={page}
                            variant={currentPage === page ? "default" : "outline"}
                            size="sm"
                            onClick={() => setCurrentPage(page)}
                            className="w-10"
                          >
                            {page}
                          </Button>
                        ))}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                        disabled={currentPage === totalPages}
                      >
                        {t('indexPage.nextButton')}
                      </Button>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="template-editor">
          <Card>
            <CardHeader>
              <CardTitle>{t('indexPage.contractTemplateEditorTitle')}</CardTitle>
              <CardDescription>
                {t('indexPage.contractTemplateEditorDescription')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="mb-6">
                <p className="mb-4">{t('indexPage.openTemplateEditorIntro')}</p>
                <Button onClick={() => setTemplateEditorDialogOpen(true)} data-testid="button-open-template-editor">
                  <FileEdit className="mr-2 h-4 w-4" />
                  {t('indexPage.openTemplateEditorButton')}
                </Button>
              </div>

              {isLoadingTemplates ? (
                <div className="flex justify-center items-center h-32">
                  <svg className="animate-spin h-8 w-8 text-primary-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                </div>
              ) : templates && Array.isArray(templates) && templates.length > 0 ? (
                <div>
                  <h3 className="text-lg font-medium mb-4 border-b pb-2">{t('indexPage.availableTemplatesTitle')}</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {templates.map((template: any) => (
                      <Card key={template.id} className="overflow-hidden">
                        <div className="bg-gray-100 p-2 flex items-center justify-center aspect-[8.5/11] relative">
                          {template.backgroundPreviewPath ? (
                            <img 
                              src={`/${template.backgroundPreviewPath}`} 
                              alt={`Preview of ${template.name}`}
                              className="w-full h-full object-contain"
                              onError={(e) => {
                                // Fallback to icon if image fails to load
                                e.currentTarget.style.display = 'none';
                                const parent = e.currentTarget.parentElement;
                                if (parent) {
                                  const icon = parent.querySelector('.fallback-icon') as HTMLElement;
                                  if (icon) icon.style.display = 'block';
                                }
                              }}
                            />
                          ) : null}
                          <svg 
                            xmlns="http://www.w3.org/2000/svg" 
                            width="40" 
                            height="40" 
                            viewBox="0 0 24 24" 
                            fill="none" 
                            stroke="currentColor" 
                            strokeWidth="1" 
                            strokeLinecap="round" 
                            strokeLinejoin="round" 
                            className={`fallback-icon lucide lucide-file-text text-gray-600 ${template.backgroundPreviewPath ? 'hidden' : 'block'}`}
                          >
                            <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                            <polyline points="14 2 14 8 20 8" />
                            <line x1="16" x2="8" y1="13" y2="13" />
                            <line x1="16" x2="8" y1="17" y2="17" />
                            <line x1="10" x2="8" y1="9" y2="9" />
                          </svg>
                        </div>
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between">
                            <h4 className="font-medium mb-1 truncate" title={template.name}>
                              {template.name}
                            </h4>
                            {template.isDefault && (
                              <Badge variant="secondary" className="ml-2">
                                <Star className="h-3 w-3 mr-1" />
                                {t('indexPage.defaultBadge')}
                              </Badge>
                            )}
                          </div>
                          
                          <div className="mt-4 flex justify-between items-center gap-2">
                            <div className="flex gap-2">
                              <Button 
                                variant="outline" 
                                size="sm" 
                                onClick={() => setTemplateEditorDialogOpen(true)}
                                data-testid={`button-edit-template-${template.id}`}
                              >
                                <FileEdit className="h-3 w-3 mr-1" />
                                {t('indexPage.editButton')}
                              </Button>
                              <a
                                href={`/api/pdf-templates/${template.id}/preview`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-9 px-3 py-2"
                                data-testid={`button-preview-template-${template.id}`}
                              >
                                {t('indexPage.previewButton')}
                              </a>
                            </div>
                            <Button 
                              variant="outline" 
                              size="sm" 
                              onClick={() => handleDeleteTemplate(template)}
                              className="text-red-600 hover:text-red-700 hover:bg-red-50"
                              data-testid={`button-delete-template-${template.id}`}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  {t('indexPage.noTemplatesFound')}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="transport-templates">
          <Card>
            <CardHeader>
              <CardTitle>{t('indexPage.transportTemplateEditorTitle')}</CardTitle>
              <CardDescription>
                {t('indexPage.transportTemplateEditorDescription')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="mb-6">
                <p className="mb-4">{t('indexPage.openTransportTemplateEditorIntro')}</p>
                <Button onClick={() => setTransportTemplateEditorDialogOpen(true)} data-testid="button-open-transport-template-editor">
                  <FileEdit className="mr-2 h-4 w-4" />
                  {t('indexPage.openTemplateEditorButton')}
                </Button>
              </div>

              {isLoadingTransportTemplates ? (
                <div className="flex justify-center items-center h-32">
                  <svg className="animate-spin h-8 w-8 text-primary-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                </div>
              ) : transportTemplates && transportTemplates.length > 0 ? (
                <div>
                  <h3 className="text-lg font-medium mb-4 border-b pb-2">{t('indexPage.availableTemplatesTitle')}</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {transportTemplates.map((template: any) => (
                      <Card key={template.id} className="overflow-hidden">
                        <div className="bg-gray-100 p-2 flex items-center justify-center aspect-[8.5/11] relative">
                          {template.backgroundPreviewPath ? (
                            <img
                              src={`/${template.backgroundPreviewPath}`}
                              alt={`Preview of ${template.name}`}
                              className="w-full h-full object-contain"
                            />
                          ) : (
                            <Truck className="h-10 w-10 text-gray-400" />
                          )}
                        </div>
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between">
                            <h4 className="font-medium mb-1 truncate" title={template.name}>
                              {template.name}
                            </h4>
                            {template.isDefault && (
                              <Badge variant="secondary" className="ml-2">
                                <Star className="h-3 w-3 mr-1" />
                                {t('indexPage.defaultBadge')}
                              </Badge>
                            )}
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            className="mt-3 w-full"
                            onClick={() => setTransportTemplateEditorDialogOpen(true)}
                          >
                            <FileEdit className="h-3 w-3 mr-1" />
                            {t('indexPage.editButton')}
                          </Button>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  {t('indexPage.noTemplatesFound')}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="damage-check">
          <div className="space-y-6">
            <DamageCheckManager />
            <DiagramTemplateManager />
          </div>
        </TabsContent>
      </Tabs>
      
      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('indexPage.deleteDocumentTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('indexPage.deleteDocumentDescription', { fileName: documentToDelete?.fileName })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common:actions.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteDocument}
              className="bg-red-600 hover:bg-red-700"
              disabled={deleteDocumentMutation.isPending}
            >
              {deleteDocumentMutation.isPending ? t('indexPage.deletingButton') : t('indexPage.deleteButton')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Template Confirmation Dialog */}
      <AlertDialog open={templateDeleteDialogOpen} onOpenChange={setTemplateDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('indexPage.deletePdfTemplateTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('indexPage.deletePdfTemplateDescription', { name: templateToDelete?.name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common:actions.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteTemplate}
              className="bg-red-600 hover:bg-red-700"
              disabled={deleteTemplateMutation.isPending}
              data-testid="button-confirm-delete-template"
            >
              {deleteTemplateMutation.isPending ? t('indexPage.deletingButton') : t('indexPage.deleteButton')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      
      {/* Document Preview Dialog (view and/or print) */}
      <AlertDialog open={printDialogOpen} onOpenChange={setPrintDialogOpen}>
        <AlertDialogContent className="max-w-6xl w-[90vw] h-[85vh] flex flex-col">
          <AlertDialogHeader className="flex-shrink-0">
            <AlertDialogTitle>{documentToPrint?.fileName}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('indexPage.documentPreviewDescription')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex-1 overflow-hidden border rounded mb-4">
            {documentToPrint && !iframeError && (
              <iframe
                id="print-preview-iframe"
                src={`/api/documents/view/${documentToPrint.id}`}
                className="w-full h-full border-0"
                title={t('indexPage.documentPreviewIframeTitle')}
                onError={handleIframeError}
              />
            )}
            {documentToPrint && iframeError && (
              <div className="flex flex-col items-center justify-center h-full p-8 text-center">
                <div className="mb-4">
                  <svg className="w-16 h-16 mx-auto text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h3 className="text-lg font-medium text-gray-900 mb-2">{t('indexPage.previewBlockedTitle')}</h3>
                <p className="text-gray-600 mb-4">
                  {t('indexPage.previewBlockedDescription')}
                </p>
                <Button
                  onClick={() => window.open(`/api/documents/view/${documentToPrint.id}`, '_blank')}
                  variant="outline"
                  className="mb-2"
                >
                  {t('indexPage.openInNewTabButton')}
                </Button>
              </div>
            )}
          </div>
          <AlertDialogFooter className="flex-shrink-0">
            <AlertDialogCancel onClick={() => setPrintDialogOpen(false)}>{t('indexPage.closeButton')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={printDocument}
              className="bg-blue-600 hover:bg-blue-700"
            >
              <Printer className="h-4 w-4 mr-2" />
              {t('indexPage.printButton')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      
      {/* Email Document Dialog */}
      <AlertDialog open={emailDialogOpen} onOpenChange={setEmailDialogOpen}>
        <AlertDialogContent className="max-w-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>{t('indexPage.emailDocumentTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('indexPage.emailDocumentDescription', { fileName: documentToEmail?.fileName })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="email-recipients">{t('indexPage.recipientsLabel')}</Label>
              <Input
                id="email-recipients"
                placeholder={t('indexPage.recipientsPlaceholder')}
                value={emailRecipients}
                onChange={(e) => setEmailRecipients(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="email-subject">{t('indexPage.subjectLabel')}</Label>
              <Input
                id="email-subject"
                value={emailSubject}
                onChange={(e) => setEmailSubject(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="email-message">{t('indexPage.messageLabel')}</Label>
              <textarea
                id="email-message"
                rows={4}
                className="w-full mt-1 px-3 py-2 border border-input rounded-md resize-none focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
                value={emailMessage}
                onChange={(e) => setEmailMessage(e.target.value)}
                placeholder={t('indexPage.messagePlaceholder')}
              />
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common:actions.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmSendEmail}
              disabled={!emailRecipients.trim() || emailDocumentMutation.isPending}
              className="bg-purple-600 hover:bg-purple-700"
            >
              {emailDocumentMutation.isPending ? (
                <>
                  <svg className="animate-spin h-4 w-4 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  {t('indexPage.sendingButton')}
                </>
              ) : (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                    <polyline points="22,6 12,13 2,6"/>
                  </svg>
                  {t('indexPage.sendEmailButton')}
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Template Editor Dialog */}
      <Dialog open={templateEditorDialogOpen} onOpenChange={setTemplateEditorDialogOpen}>
        <DialogContent className="max-w-[95vw] w-[95vw] h-[95vh] max-h-[95vh] p-0 overflow-hidden flex flex-col">
          <DialogHeader className="px-6 pt-6 pb-4 flex-shrink-0 border-b">
            <DialogTitle>{t('indexPage.contractTemplateEditorTitle')}</DialogTitle>
            <DialogDescription>
              {t('indexPage.contractTemplateEditorDialogDescription')}
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto overflow-x-hidden">
            <PDFTemplateEditor onClose={() => setTemplateEditorDialogOpen(false)} />
          </div>
        </DialogContent>
      </Dialog>

      {/* Transport Report Template Editor Dialog */}
      <Dialog open={transportTemplateEditorDialogOpen} onOpenChange={setTransportTemplateEditorDialogOpen}>
        <DialogContent className="max-w-[95vw] w-[95vw] h-[95vh] max-h-[95vh] p-0 overflow-hidden flex flex-col">
          <DialogHeader className="px-6 pt-6 pb-4 flex-shrink-0 border-b">
            <DialogTitle>{t('indexPage.transportTemplateEditorTitle')}</DialogTitle>
            <DialogDescription>
              {t('indexPage.transportTemplateEditorDialogDescription')}
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto overflow-x-hidden">
            <TransportReportTemplateEditor onClose={() => setTransportTemplateEditorDialogOpen(false)} />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Damage Check Manager Component
function DamageCheckManager() {
  const { t } = useTranslation("documents");
  const [studioOpen, setStudioOpen] = useState(false);
  const { user } = useAuth();
  const isAdmin = user?.role === UserRole.ADMIN;

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <div>
            <CardTitle>{t('indexPage.damageCheck.cardTitle')}</CardTitle>
            <CardDescription>
              {t('indexPage.damageCheck.cardDescription')}
            </CardDescription>
          </div>
          <Button
            variant="outline"
            onClick={() => setStudioOpen(true)}
            data-testid="button-open-damage-check-studio"
          >
            <SettingsIcon className="mr-2 h-4 w-4" />
            {t('indexPage.damageCheck.openStudioButton')}
          </Button>
        </div>
      </CardHeader>

      <Dialog open={studioOpen} onOpenChange={setStudioOpen}>
        <DialogContent className="max-w-[98vw] w-[98vw] max-h-[98vh] h-[98vh] flex flex-col p-0 gap-0" data-testid="dialog-damage-check-studio">
          <DialogHeader className="px-4 py-2 border-b">
            <DialogTitle>{t('indexPage.damageCheck.cardTitle')}</DialogTitle>
            <DialogDescription className="sr-only">
              {t('indexPage.damageCheck.dialogDescription')}
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-hidden bg-background">
            {studioOpen && <DamageCheckTemplateStudio embedded isAdmin={isAdmin} />}
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function DiagramTemplateManager() {
  const { t } = useTranslation("documents");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<any | null>(null);
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [yearFrom, setYearFrom] = useState("");
  const [yearTo, setYearTo] = useState("");
  const [description, setDescription] = useState("");
  const [diagramFile, setDiagramFile] = useState<File | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [templateToDelete, setTemplateToDelete] = useState<any | null>(null);

  // Fetch all diagram templates
  const { data: templates = [] } = useQuery<any[]>({
    queryKey: ['/api/vehicle-diagram-templates'],
  });

  // Upload mutation
  const uploadMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      const response = await fetch('/api/vehicle-diagram-templates', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Upload failed');
      }

      return response.json();
    },
    onSuccess: () => {
      invalidateByPrefix('/api/vehicle-diagram-templates');
      toast({
        title: t('indexPage.diagramTemplates.toasts.successTitle'),
        description: t('indexPage.diagramTemplates.toasts.uploadedDescription'),
      });
      setUploadDialogOpen(false);
      resetForm();
    },
    onError: (error: Error) => {
      toast({
        title: t('indexPage.diagramTemplates.toasts.errorTitle'),
        description: error.message || t('indexPage.diagramTemplates.toasts.uploadFailed'),
        variant: "destructive",
      });
    },
  });

  // Edit mutation
  const editMutation = useMutation({
    mutationFn: async ({ id, formData }: { id: number; formData: FormData }) => {
      const response = await fetch(`/api/vehicle-diagram-templates/${id}`, {
        method: 'PATCH',
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Update failed');
      }

      return response.json();
    },
    onSuccess: () => {
      invalidateByPrefix('/api/vehicle-diagram-templates');
      toast({
        title: t('indexPage.diagramTemplates.toasts.successTitle'),
        description: t('indexPage.diagramTemplates.toasts.updatedDescription'),
      });
      setEditDialogOpen(false);
      setEditingTemplate(null);
      resetForm();
    },
    onError: (error: Error) => {
      toast({
        title: t('indexPage.diagramTemplates.toasts.errorTitle'),
        description: error.message || t('indexPage.diagramTemplates.toasts.updateFailed'),
        variant: "destructive",
      });
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await apiRequest('DELETE', `/api/vehicle-diagram-templates/${id}`);
      return response;
    },
    onSuccess: () => {
      invalidateByPrefix('/api/vehicle-diagram-templates');
      toast({
        title: t('indexPage.diagramTemplates.toasts.successTitle'),
        description: t('indexPage.diagramTemplates.toasts.deletedDescription'),
      });
      setDeleteDialogOpen(false);
      setTemplateToDelete(null);
    },
    onError: (error: Error) => {
      toast({
        title: t('indexPage.diagramTemplates.toasts.errorTitle'),
        description: error.message || t('indexPage.diagramTemplates.toasts.deleteFailed'),
        variant: "destructive",
      });
    },
  });

  const resetForm = () => {
    setMake("");
    setModel("");
    setYearFrom("");
    setYearTo("");
    setDescription("");
    setDiagramFile(null);
  };

  const handleUpload = () => {
    if (!make || !model || !diagramFile) {
      toast({
        title: t('indexPage.diagramTemplates.toasts.validationErrorTitle'),
        description: t('indexPage.diagramTemplates.toasts.makeModelImageRequired'),
        variant: "destructive",
      });
      return;
    }

    const formData = new FormData();
    formData.append('make', make);
    formData.append('model', model);
    if (yearFrom) formData.append('yearFrom', yearFrom);
    if (yearTo) formData.append('yearTo', yearTo);
    if (description) formData.append('description', description);
    formData.append('diagram', diagramFile);

    uploadMutation.mutate(formData);
  };

  const handleEdit = (template: any) => {
    setEditingTemplate(template);
    setMake(template.make || "");
    setModel(template.model || "");
    setYearFrom(template.yearFrom?.toString() || "");
    setYearTo(template.yearTo?.toString() || "");
    setDescription(template.description || "");
    setDiagramFile(null); // Don't pre-fill file
    setEditDialogOpen(true);
  };

  const handleUpdate = () => {
    if (!editingTemplate || !make || !model) {
      toast({
        title: t('indexPage.diagramTemplates.toasts.validationErrorTitle'),
        description: t('indexPage.diagramTemplates.toasts.makeModelRequired'),
        variant: "destructive",
      });
      return;
    }

    const formData = new FormData();
    formData.append('make', make);
    formData.append('model', model);
    if (yearFrom) formData.append('yearFrom', yearFrom);
    if (yearTo) formData.append('yearTo', yearTo);
    if (description) formData.append('description', description);
    if (diagramFile) formData.append('diagram', diagramFile); // Only if new image uploaded

    editMutation.mutate({ id: editingTemplate.id, formData });
  };

  const handleDelete = (template: any) => {
    setTemplateToDelete(template);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (templateToDelete) {
      deleteMutation.mutate(templateToDelete.id);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <div>
            <CardTitle>{t('indexPage.diagramTemplates.cardTitle')}</CardTitle>
            <CardDescription>
              {t('indexPage.diagramTemplates.cardDescription')}
            </CardDescription>
          </div>
          <Button onClick={() => setUploadDialogOpen(true)} data-testid="button-upload-diagram-template">
            <Plus className="h-4 w-4 mr-2" />
            {t('indexPage.diagramTemplates.addButton')}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {templates.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <Image className="h-16 w-16 mx-auto mb-4 text-gray-400" />
            <p className="text-lg font-medium mb-2">{t('indexPage.diagramTemplates.noTemplatesTitle')}</p>
            <p className="text-sm">{t('indexPage.diagramTemplates.noTemplatesDescription')}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {templates.map((template) => (
              <Card key={template.id} className="overflow-hidden">
                <div className="aspect-video bg-gray-100 relative">
                  <img
                    src={`/api/vehicle-diagram-templates/${template.id}/image`}
                    alt={`${template.make} ${template.model} diagram`}
                    className="w-full h-full object-contain"
                  />
                </div>
                <div className="p-4">
                  <h4 className="font-medium text-lg">{template.make} {template.model}</h4>
                  {(template.yearFrom || template.yearTo) && (
                    <p className="text-sm text-gray-600">
                      {t('indexPage.diagramTemplates.yearsLabel', { from: template.yearFrom || '...', to: template.yearTo || '...' })}
                    </p>
                  )}
                  {template.description && (
                    <p className="text-sm text-gray-600 mt-2">{template.description}</p>
                  )}
                  <p className="text-xs text-gray-500 mt-2">
                    {t('indexPage.diagramTemplates.addedLabel', { date: formatDate(template.createdAt) })}
                  </p>
                  <div className="flex gap-2 mt-3">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => handleEdit(template)}
                      data-testid={`button-edit-diagram-template-${template.id}`}
                    >
                      <Edit className="h-4 w-4 mr-2" />
                      {t('indexPage.diagramTemplates.editButton')}
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      className="flex-1"
                      onClick={() => handleDelete(template)}
                      data-testid={`button-delete-diagram-template-${template.id}`}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      {t('indexPage.diagramTemplates.deleteButton')}
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </CardContent>

      {/* Upload Dialog */}
      <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('indexPage.diagramTemplates.addDialogTitle')}</DialogTitle>
            <DialogDescription>
              {t('indexPage.diagramTemplates.addDialogDescription')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="make">{t('indexPage.diagramTemplates.makeLabel')}</Label>
                <Input
                  id="make"
                  placeholder={t('indexPage.diagramTemplates.makePlaceholder')}
                  value={make}
                  onChange={(e) => setMake(e.target.value)}
                  data-testid="input-make"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="model">{t('indexPage.diagramTemplates.modelLabel')}</Label>
                <Input
                  id="model"
                  placeholder={t('indexPage.diagramTemplates.modelPlaceholder')}
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  data-testid="input-model"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="yearFrom">{t('indexPage.diagramTemplates.yearFromLabel')}</Label>
                <Input
                  id="yearFrom"
                  type="number"
                  placeholder={t('indexPage.diagramTemplates.yearFromPlaceholder')}
                  value={yearFrom}
                  onChange={(e) => setYearFrom(e.target.value)}
                  data-testid="input-year-from"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="yearTo">{t('indexPage.diagramTemplates.yearToLabel')}</Label>
                <Input
                  id="yearTo"
                  type="number"
                  placeholder={t('indexPage.diagramTemplates.yearToPlaceholder')}
                  value={yearTo}
                  onChange={(e) => setYearTo(e.target.value)}
                  data-testid="input-year-to"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">{t('indexPage.diagramTemplates.descriptionLabel')}</Label>
              <Input
                id="description"
                placeholder={t('indexPage.diagramTemplates.descriptionPlaceholder')}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                data-testid="input-description"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="diagram">{t('indexPage.diagramTemplates.diagramImageLabel')}</Label>
              <Input
                id="diagram"
                type="file"
                accept="image/*"
                onChange={(e) => setDiagramFile(e.target.files?.[0] || null)}
                data-testid="input-diagram-file"
              />
              {diagramFile && (
                <p className="text-sm text-gray-600">{t('indexPage.diagramTemplates.selectedFileLabel', { filename: diagramFile.name })}</p>
              )}
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setUploadDialogOpen(false)}>
              {t('indexPage.diagramTemplates.cancelButton')}
            </Button>
            <Button
              onClick={handleUpload}
              disabled={uploadMutation.isPending || !diagramFile || !make || !model}
              data-testid="button-submit-upload-diagram"
            >
              {uploadMutation.isPending ? t('indexPage.diagramTemplates.uploadingButton') : t('indexPage.diagramTemplates.uploadButton')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={(open) => {
        setEditDialogOpen(open);
        if (!open) {
          setEditingTemplate(null);
          resetForm();
        }
      }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('indexPage.diagramTemplates.editDialogTitle')}</DialogTitle>
            <DialogDescription>
              {t('indexPage.diagramTemplates.editDialogDescription')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-make">{t('indexPage.diagramTemplates.makeLabel')}</Label>
                <Input
                  id="edit-make"
                  placeholder={t('indexPage.diagramTemplates.makePlaceholder')}
                  value={make}
                  onChange={(e) => setMake(e.target.value)}
                  data-testid="input-edit-make"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-model">{t('indexPage.diagramTemplates.modelLabel')}</Label>
                <Input
                  id="edit-model"
                  placeholder={t('indexPage.diagramTemplates.modelPlaceholder')}
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  data-testid="input-edit-model"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-yearFrom">{t('indexPage.diagramTemplates.yearFromLabel')}</Label>
                <Input
                  id="edit-yearFrom"
                  type="number"
                  placeholder={t('indexPage.diagramTemplates.yearFromPlaceholder')}
                  value={yearFrom}
                  onChange={(e) => setYearFrom(e.target.value)}
                  data-testid="input-edit-year-from"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-yearTo">{t('indexPage.diagramTemplates.yearToLabel')}</Label>
                <Input
                  id="edit-yearTo"
                  type="number"
                  placeholder={t('indexPage.diagramTemplates.yearToPlaceholder')}
                  value={yearTo}
                  onChange={(e) => setYearTo(e.target.value)}
                  data-testid="input-edit-year-to"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-description">{t('indexPage.diagramTemplates.descriptionLabel')}</Label>
              <Input
                id="edit-description"
                placeholder={t('indexPage.diagramTemplates.descriptionPlaceholder')}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                data-testid="input-edit-description"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-diagram">{t('indexPage.diagramTemplates.newDiagramImageLabel')}</Label>
              <Input
                id="edit-diagram"
                type="file"
                accept="image/*"
                onChange={(e) => setDiagramFile(e.target.files?.[0] || null)}
                data-testid="input-edit-diagram-file"
              />
              {diagramFile && (
                <p className="text-sm text-green-600">{t('indexPage.diagramTemplates.newImageSelectedLabel', { filename: diagramFile.name })}</p>
              )}
              {!diagramFile && (
                <p className="text-xs text-gray-500">{t('indexPage.diagramTemplates.leaveEmptyHint')}</p>
              )}
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => {
              setEditDialogOpen(false);
              setEditingTemplate(null);
              resetForm();
            }}>
              {t('indexPage.diagramTemplates.cancelButton')}
            </Button>
            <Button
              onClick={handleUpdate}
              disabled={editMutation.isPending || !make || !model}
              data-testid="button-submit-edit-diagram"
            >
              {editMutation.isPending ? t('indexPage.diagramTemplates.updatingButton') : t('indexPage.diagramTemplates.updateButton')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('indexPage.diagramTemplates.deleteDialogTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('indexPage.diagramTemplates.deleteDialogDescription', { make: templateToDelete?.make, model: templateToDelete?.model })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('indexPage.diagramTemplates.cancelButton')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-red-600 hover:bg-red-700"
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? t('indexPage.deletingButton') : t('indexPage.deleteButton')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

// PDF Layout Preview Component
function PDFLayoutPreview({ formValues }: { formValues: any }) {
  const [zoom, setZoom] = useState(0.5);
  const scale = zoom; // User-controlled zoom
  const pageWidth = 595 * scale; // A4 width in pts
  const pageHeight = 842 * scale; // A4 height in pts
  
  const headerColor = `rgb(${formValues.headerColorR || 51}, ${formValues.headerColorG || 77}, ${formValues.headerColorB || 153})`;
  const fontSize = (formValues.fontSize || 9) * scale;
  const headerFontSize = (formValues.headerFontSize || 14) * scale;
  const checkboxSize = (formValues.checkboxSize || 10) * scale;
  const sidebarWidth = (formValues.sidebarWidth || 130) * scale;
  const columnSpacing = (formValues.columnSpacing || 5) * scale;
  const checklistHeight = (formValues.checklistHeight || 280) * scale;
  
  // Calculate column widths
  const contentWidth = pageWidth - 30 * scale; // Accounting for margins
  const mainContentWidth = contentWidth - sidebarWidth;
  const damageTypes = ['Kapot', 'Gat', 'Kras', 'Deuk', 'Ster', 'Beschadigd', 'Ontbreekt', 'Vuil'];
  const numColumns = damageTypes.length;
  const columnWidth = (mainContentWidth - (columnSpacing * (numColumns - 1))) / numColumns;
  const categories = ['Interieur', 'Exterieur', 'Afweez Check'];

  const handleZoomIn = () => setZoom(prev => Math.min(prev + 0.1, 1.5));
  const handleZoomOut = () => setZoom(prev => Math.max(prev - 0.1, 0.3));
  const handleZoomReset = () => setZoom(0.5);

  return (
    <div className="flex flex-col h-full">
      {/* Zoom Controls */}
      <div className="flex items-center justify-between mb-3 pb-3 border-b">
        <div className="text-sm text-gray-600">
          Zoom: {Math.round(zoom * 100)}%
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleZoomOut}
            disabled={zoom <= 0.3}
            data-testid="button-zoom-out"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"/>
              <path d="m21 21-4.3-4.3"/>
              <line x1="8" x2="14" y1="11" y2="11"/>
            </svg>
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleZoomReset}
            data-testid="button-zoom-reset"
          >
            {Math.round(zoom * 100)}%
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleZoomIn}
            disabled={zoom >= 1.5}
            data-testid="button-zoom-in"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"/>
              <path d="m21 21-4.3-4.3"/>
              <line x1="11" x2="11" y1="8" y2="14"/>
              <line x1="8" x2="14" y1="11" y2="11"/>
            </svg>
          </Button>
        </div>
      </div>

      {/* Preview Content */}
      <div className="flex-1 bg-gray-100 p-4 rounded-lg overflow-auto">
        <div 
          className="bg-white shadow-lg mx-auto"
          style={{ width: pageWidth, minHeight: pageHeight }}
        >
        {/* Header */}
        {formValues.showLogo && (
          <div 
            className="text-white font-bold flex items-center justify-center"
            style={{ 
              backgroundColor: headerColor,
              fontSize: headerFontSize,
              padding: 8 * scale,
            }}
          >
            {formValues.companyName || 'COMPANY NAME'}
          </div>
        )}
        
        {/* Contract & Customer Info Section */}
        <div style={{ padding: 8 * scale, fontSize: fontSize }}>
          <div className="grid grid-cols-3 gap-1">
            <div className="text-gray-600">Contract Nr: <span className="text-black font-semibold">2025-001234</span></div>
            <div className="text-gray-600">Datum: <span className="text-black">21-10-2025 14:30</span></div>
            <div className="text-gray-600">Locatie: <span className="text-black">Amsterdam CS</span></div>
            <div className="text-gray-600">Klant: <span className="text-black">Jan de Vries</span></div>
            <div className="text-gray-600">Telefoon: <span className="text-black">06-12345678</span></div>
            <div className="text-gray-600">Email: <span className="text-black">jan@email.nl</span></div>
          </div>
        </div>

        {/* Vehicle Data Section */}
        {formValues.showVehicleData && (
          <div style={{ padding: 8 * scale, borderTop: '1px solid #e5e7eb' }}>
            <div className="font-semibold" style={{ fontSize: fontSize * 1.1, marginBottom: 4 * scale }}>
              Voertuig Gegevens
            </div>
            <div className="grid grid-cols-3 gap-1" style={{ fontSize }}>
              <div className="text-gray-600">Kenteken: <span className="text-black font-semibold">AB-123-CD</span></div>
              <div className="text-gray-600">Merk: <span className="text-black">Mercedes-Benz</span></div>
              <div className="text-gray-600">Model: <span className="text-black">E-Klasse</span></div>
              <div className="text-gray-600">Brandstof: <span className="text-black">Diesel</span></div>
              <div className="text-gray-600">Kilometerstand: <span className="text-black">45.230 km</span></div>
              <div className="text-gray-600">Brandstof Niveau: <span className="text-black">3/4 Vol</span></div>
            </div>
          </div>
        )}

        {/* Damage Check Detailed Items */}
        <div style={{ padding: 8 * scale, borderTop: '1px solid #e5e7eb' }}>
          <div className="font-semibold mb-2" style={{ fontSize: fontSize * 1.1, marginBottom: 4 * scale }}>
            Schade Inspectie Checklist
          </div>
          
          <div className="grid grid-cols-2 gap-3" style={{ gap: 6 * scale, fontSize }}>
            {/* Interieur Section */}
            <div>
              <div className="font-semibold mb-1" style={{ fontSize: fontSize * 1.05, marginBottom: 2 * scale, color: headerColor }}>
                Interieur
              </div>
              <div className="space-y-1" style={{ marginTop: 2 * scale }}>
                {[
                  'Binnenzijde auto schoon',
                  'Vloermatten ja',
                  'Bekleding heel',
                  'Asbak schoon',
                  'Reservewiel goed',
                  'Krik aanwezig',
                  'Wielsleutel ja',
                  'Matten ja',
                  'Hoofdsteunen goed'
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-1" style={{ gap: 2 * scale, marginTop: 1 * scale }}>
                    <div className="border-2 border-gray-400" style={{ width: checkboxSize, height: checkboxSize, minWidth: checkboxSize }} />
                    <span style={{ fontSize: fontSize * 0.9 }}>{item}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Exterieur Section */}
            <div>
              <div className="font-semibold mb-1" style={{ fontSize: fontSize * 1.05, marginBottom: 2 * scale, color: headerColor }}>
                Exterieur
              </div>
              <div className="space-y-1" style={{ marginTop: 2 * scale }}>
                {[
                  'Buitenzijde auto schoon',
                  'Wieldoppen LA',
                  'Kentekemplaten voor',
                  'Spiegelkap links',
                  'Spiegelkap rechts',
                  'Spiegelglas L+R goed',
                  'Antenne goed',
                  'Ruitenwisser goed',
                  'Deurvanger goed',
                  'Werkende sloten ja',
                  'Mistlampen voor goed'
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-1" style={{ gap: 2 * scale, marginTop: 1 * scale }}>
                    <div className="border-2 border-gray-400" style={{ width: checkboxSize, height: checkboxSize, minWidth: checkboxSize }} />
                    <span style={{ fontSize: fontSize * 0.9 }}>{item}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Aflever Check Section */}
            <div>
              <div className="font-semibold mb-1" style={{ fontSize: fontSize * 1.05, marginBottom: 2 * scale, color: headerColor }}>
                Aflever Check
              </div>
              <div className="space-y-1" style={{ marginTop: 2 * scale }}>
                {[
                  'Olie - water',
                  'Ruitenproeiervloeistof',
                  'Verlichting',
                  'Bandenspanning incl. reservewiel',
                  'Kachelfan',
                  'Hoedenplank',
                  'IJskrabber',
                  'Gaan alle deuren open'
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-1" style={{ gap: 2 * scale, marginTop: 1 * scale }}>
                    <div className="border-2 border-gray-400" style={{ width: checkboxSize, height: checkboxSize, minWidth: checkboxSize }} />
                    <span style={{ fontSize: fontSize * 0.9 }}>{item}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Documenten Section */}
            <div>
              <div className="font-semibold mb-1" style={{ fontSize: fontSize * 1.05, marginBottom: 2 * scale, color: headerColor }}>
                Documenten
              </div>
              <div className="space-y-1" style={{ marginTop: 2 * scale }}>
                {[
                  'Kentekenpapieren',
                  'Geldige groene kaart',
                  'Europees schadeformulier',
                  'Tankpas aanwezig',
                  'Sleutels compleet'
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-1" style={{ gap: 2 * scale, marginTop: 1 * scale }}>
                    <div className="border-2 border-gray-400" style={{ width: checkboxSize, height: checkboxSize, minWidth: checkboxSize }} />
                    <span style={{ fontSize: fontSize * 0.9 }}>{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Diagram Section */}
        {formValues.showDiagram && (
          <div style={{ padding: 8 * scale, borderTop: '1px solid #e5e7eb' }}>
            <div className="font-semibold" style={{ fontSize: fontSize * 1.1, marginBottom: 4 * scale }}>
              Voertuig Diagram - Schade Locaties
            </div>
            <div className="bg-white border border-gray-300 p-2 flex items-center justify-center" style={{ minHeight: 120 * scale }}>
              {/* Simple Car SVG Diagram */}
              <svg width={250 * scale} height={100 * scale} viewBox="0 0 250 100" xmlns="http://www.w3.org/2000/svg">
                {/* Car Body */}
                <rect x="40" y="40" width="170" height="40" fill="#e5e7eb" stroke="#374151" strokeWidth="2"/>
                {/* Car Roof */}
                <path d="M 70 40 L 90 20 L 160 20 L 180 40 Z" fill="#d1d5db" stroke="#374151" strokeWidth="2"/>
                {/* Windows */}
                <rect x="95" y="25" width="25" height="12" fill="#93c5fd" stroke="#374151" strokeWidth="1"/>
                <rect x="130" y="25" width="25" height="12" fill="#93c5fd" stroke="#374151" strokeWidth="1"/>
                {/* Wheels */}
                <circle cx="70" cy="80" r="12" fill="#1f2937" stroke="#374151" strokeWidth="2"/>
                <circle cx="70" cy="80" r="6" fill="#6b7280"/>
                <circle cx="180" cy="80" r="12" fill="#1f2937" stroke="#374151" strokeWidth="2"/>
                <circle cx="180" cy="80" r="6" fill="#6b7280"/>
                {/* Headlights */}
                <circle cx="208" cy="50" r="4" fill="#fef08a" stroke="#374151" strokeWidth="1"/>
                <circle cx="208" cy="65" r="4" fill="#fef08a" stroke="#374151" strokeWidth="1"/>
                {/* Sample damage markers */}
                <circle cx="100" cy="45" r="3" fill="#ef4444" stroke="#991b1b" strokeWidth="1"/>
                <text x="100" y="48" fontSize="8" fill="white" textAnchor="middle" fontWeight="bold">1</text>
                <circle cx="150" cy="55" r="3" fill="#ef4444" stroke="#991b1b" strokeWidth="1"/>
                <text x="150" y="58" fontSize="8" fill="white" textAnchor="middle" fontWeight="bold">2</text>
                <circle cx="190" cy="42" r="3" fill="#ef4444" stroke="#991b1b" strokeWidth="1"/>
                <text x="190" y="45" fontSize="8" fill="white" textAnchor="middle" fontWeight="bold">3</text>
              </svg>
            </div>
            <div className="text-xs text-gray-500 mt-1" style={{ fontSize: fontSize * 0.8 }}>
              Rode markers tonen schade locaties zoals ingevoerd tijdens inspectie
            </div>
          </div>
        )}

        {/* Remarks Section */}
        {formValues.showRemarks && (
          <div style={{ padding: 8 * scale, borderTop: '1px solid #e5e7eb' }}>
            <div className="font-semibold" style={{ fontSize: fontSize * 1.1, marginBottom: 4 * scale }}>
              Remarks
            </div>
            <div className="border border-gray-300" style={{ height: 20 * scale, padding: 4 * scale }}>
              <span className="text-gray-400" style={{ fontSize }}>Notes and remarks...</span>
            </div>
          </div>
        )}

        {/* Signatures Section */}
        {formValues.showSignatures && (
          <div style={{ padding: 8 * scale, borderTop: '1px solid #e5e7eb' }}>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <div className="font-semibold" style={{ fontSize }}>Customer Signature</div>
                <div className="border-b-2 border-gray-400 mt-2" style={{ height: 20 * scale }} />
              </div>
              <div>
                <div className="font-semibold" style={{ fontSize }}>Staff Signature</div>
                <div className="border-b-2 border-gray-400 mt-2" style={{ height: 20 * scale }} />
              </div>
            </div>
          </div>
        )}
        </div>
      </div>
    </div>
  );
}
