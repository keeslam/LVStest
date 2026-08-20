import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Mail, FileText, Loader2, AlertCircle } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { isContractDocument, isDamageCheckDocument } from "@shared/document-types";
import type { Document, Customer, Vehicle, Reservation } from "@shared/schema";

interface EmailDocumentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  documents: Document[];
  customer?: Customer;
  vehicle?: Vehicle;
  reservation?: Reservation;
  defaultDocumentIds?: number[];
}

type AppSetting = {
  id: number;
  key: string;
  value: any;
};

export function EmailDocumentDialog({
  open,
  onOpenChange,
  documents,
  customer,
  vehicle,
  reservation,
  defaultDocumentIds = [],
}: EmailDocumentDialogProps) {
  const { toast } = useToast();
  const [selectedDocIds, setSelectedDocIds] = useState<number[]>([]);
  const [recipientEmail, setRecipientEmail] = useState("");
  const [customEmail, setCustomEmail] = useState("");
  const [language, setLanguage] = useState<"en" | "nl">("nl");
  const [templateType, setTemplateType] = useState<"contract" | "damage_check" | "combined">("contract");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");

  // Fetch email templates from settings
  const { data: appSettings } = useQuery<AppSetting[]>({
    queryKey: ['/api/app-settings'],
  });

  // Update selected documents when dialog opens or defaultDocumentIds changes
  useEffect(() => {
    if (open && defaultDocumentIds.length > 0) {
      setSelectedDocIds(defaultDocumentIds);
    }
  }, [open, defaultDocumentIds]);

  // Auto-select template based on selected documents
  useEffect(() => {
    // If multiple documents are selected, use combined template
    if (selectedDocIds.length > 1) {
      setTemplateType('combined');
      return;
    }
    
    // For single document, detect type and use appropriate template
    const selectedDocs = documents.filter(doc => selectedDocIds.includes(doc.id));
    const hasContract = selectedDocs.some(doc => isContractDocument(doc.documentType));
    const hasDamageCheck = selectedDocs.some(doc => isDamageCheckDocument(doc.documentType));
    
    if (hasContract) {
      setTemplateType('contract');
    } else if (hasDamageCheck) {
      setTemplateType('damage_check');
    }
  }, [selectedDocIds, documents]);

  // Load template when language or template type changes
  useEffect(() => {
    if (!appSettings || !templateType) return;
    
    const docTemplates = appSettings.find(s => s.key === 'document_email_templates');
    if (docTemplates?.value && docTemplates.value[templateType]) {
      const template = docTemplates.value[templateType][language];
      if (template) {
        setSubject(replacePlaceholders(template.subject));
        setMessage(replacePlaceholders(template.message));
      }
    }
  }, [language, templateType, appSettings, customer, vehicle, reservation]);

  // Set default recipient email when customer changes
  useEffect(() => {
    if (customer) {
      // Priority: emailGeneral > emailForInvoices > custom
      if (customer.emailGeneral) {
        setRecipientEmail("general");
      } else if (customer.emailForInvoices) {
        setRecipientEmail("invoices");
      } else {
        setRecipientEmail("custom");
        setCustomEmail("");
      }
    }
  }, [customer]);

  // Replace placeholders in templates
  const replacePlaceholders = (text: string): string => {
    if (!text) return "";
    
    let result = text;
    
    // Customer name
    if (customer) {
      const customerName = customer.companyName 
        ? customer.companyName
        : `${customer.firstName || ''} ${customer.lastName || ''}`.trim();
      result = result.replace(/{customerName}/g, customerName);
    }
    
    // Vehicle plate
    if (vehicle) {
      result = result.replace(/{vehiclePlate}/g, vehicle.licensePlate || '');
    }
    
    // Reservation dates
    if (reservation) {
      const startDate = reservation.startDate 
        ? new Date(reservation.startDate).toLocaleDateString(language === 'nl' ? 'nl-NL' : 'en-US')
        : '';
      const endDate = reservation.endDate 
        ? new Date(reservation.endDate).toLocaleDateString(language === 'nl' ? 'nl-NL' : 'en-US')
        : '';
      result = result.replace(/{startDate}/g, startDate);
      result = result.replace(/{endDate}/g, endDate);
    }
    
    // Damage check specific placeholders (only replace if we have actual damage check data)
    // TODO: Pass damage check data as props to properly fill these placeholders
    // For now, we leave them as placeholders if we don't have the data
    // This prevents sending incorrect information to customers
    
    return result;
  };

  // Get actual email address to send to
  const getRecipientEmail = (): string => {
    if (recipientEmail === "custom") return customEmail;
    if (recipientEmail === "general") return customer?.emailGeneral || "";
    if (recipientEmail === "invoices") return customer?.emailForInvoices || "";
    return "";
  };

  // Send email mutation
  const sendEmail = useMutation({
    mutationFn: async () => {
      const email = getRecipientEmail();
      if (!email) {
        throw new Error("No recipient email selected");
      }
      
      if (selectedDocIds.length === 0) {
        throw new Error("No documents selected");
      }

      // Send all documents in one email with multiple attachments
      await apiRequest('POST', '/api/email/send-documents', {
        documentIds: selectedDocIds,
        recipientEmail: email,
        subject,
        message,
      });
    },
    onSuccess: () => {
      const docCount = selectedDocIds.length;
      toast({
        title: "Success",
        description: `Email sent successfully to ${getRecipientEmail()} with ${docCount} document${docCount > 1 ? 's' : ''} attached`,
      });
      onOpenChange(false);
      // Reset form
      setSelectedDocIds([]);
      setCustomEmail("");
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to send email",
        variant: "destructive",
      });
    },
  });

  const handleSend = () => {
    const email = getRecipientEmail();
    if (!email || !email.includes("@")) {
      toast({
        title: "Invalid Email",
        description: "Please enter a valid email address",
        variant: "destructive",
      });
      return;
    }
    
    if (selectedDocIds.length === 0) {
      toast({
        title: "No Documents",
        description: "Please select at least one document to send",
        variant: "destructive",
      });
      return;
    }

    sendEmail.mutate();
  };

  const handleDocumentToggle = (docId: number, checked: boolean) => {
    if (checked) {
      setSelectedDocIds(prev => [...prev, docId]);
    } else {
      setSelectedDocIds(prev => prev.filter(id => id !== docId));
    }
  };

  // Group documents by type
  const contracts = documents.filter(doc => isContractDocument(doc.documentType));
  const damageChecks = documents.filter(doc => isDamageCheckDocument(doc.documentType));
  const otherDocs = documents.filter(doc => !isContractDocument(doc.documentType) && !isDamageCheckDocument(doc.documentType));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Email Documents to Customer
          </DialogTitle>
          <DialogDescription>
            Select documents, recipient, and language for sending to customer
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Document Selection */}
          <div className="space-y-3">
            <Label className="text-base font-semibold">Select Documents</Label>
            
            {contracts.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-gray-700">Contracts</p>
                {contracts.map(doc => (
                  <div key={doc.id} className="flex items-center space-x-2 p-2 border rounded hover:bg-gray-50">
                    <Checkbox
                      id={`doc-${doc.id}`}
                      checked={selectedDocIds.includes(doc.id)}
                      onCheckedChange={(checked) => handleDocumentToggle(doc.id, checked as boolean)}
                      data-testid={`checkbox-document-${doc.id}`}
                    />
                    <label htmlFor={`doc-${doc.id}`} className="flex-1 cursor-pointer text-sm">
                      <FileText className="h-4 w-4 inline mr-2" />
                      {doc.fileName}
                    </label>
                  </div>
                ))}
              </div>
            )}

            {damageChecks.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-gray-700">Damage Checks</p>
                {damageChecks.map(doc => (
                  <div key={doc.id} className="flex items-center space-x-2 p-2 border rounded hover:bg-gray-50">
                    <Checkbox
                      id={`doc-${doc.id}`}
                      checked={selectedDocIds.includes(doc.id)}
                      onCheckedChange={(checked) => handleDocumentToggle(doc.id, checked as boolean)}
                      data-testid={`checkbox-document-${doc.id}`}
                    />
                    <label htmlFor={`doc-${doc.id}`} className="flex-1 cursor-pointer text-sm">
                      <FileText className="h-4 w-4 inline mr-2" />
                      {doc.fileName}
                    </label>
                  </div>
                ))}
              </div>
            )}

            {otherDocs.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-gray-700">Other Documents</p>
                {otherDocs.map(doc => (
                  <div key={doc.id} className="flex items-center space-x-2 p-2 border rounded hover:bg-gray-50">
                    <Checkbox
                      id={`doc-${doc.id}`}
                      checked={selectedDocIds.includes(doc.id)}
                      onCheckedChange={(checked) => handleDocumentToggle(doc.id, checked as boolean)}
                      data-testid={`checkbox-document-${doc.id}`}
                    />
                    <label htmlFor={`doc-${doc.id}`} className="flex-1 cursor-pointer text-sm">
                      <FileText className="h-4 w-4 inline mr-2" />
                      {doc.fileName}
                    </label>
                  </div>
                ))}
              </div>
            )}

            {documents.length === 0 && (
              <div className="p-4 border border-dashed rounded text-center text-gray-500">
                <AlertCircle className="h-8 w-8 mx-auto mb-2 text-gray-400" />
                <p className="text-sm">No documents available</p>
              </div>
            )}
          </div>

          {/* Recipient Selection */}
          <div className="space-y-3">
            <Label htmlFor="recipient" className="text-base font-semibold">Recipient Email</Label>
            <Select value={recipientEmail} onValueChange={setRecipientEmail}>
              <SelectTrigger id="recipient" data-testid="select-recipient">
                <SelectValue placeholder="Select recipient email" />
              </SelectTrigger>
              <SelectContent>
                {customer?.emailGeneral && (
                  <SelectItem value="general">
                    General: {customer.emailGeneral}
                  </SelectItem>
                )}
                {customer?.emailForInvoices && (
                  <SelectItem value="invoices">
                    Invoices: {customer.emailForInvoices}
                  </SelectItem>
                )}
                <SelectItem value="custom">Custom Email</SelectItem>
              </SelectContent>
            </Select>
            
            {recipientEmail === "custom" && (
              <Input
                type="email"
                placeholder="Enter email address"
                value={customEmail}
                onChange={(e) => setCustomEmail(e.target.value)}
                data-testid="input-custom-email"
              />
            )}
          </div>

          {/* Template Selection */}
          <div className="space-y-3">
            <Label htmlFor="template-type" className="text-base font-semibold">Email Template</Label>
            <Select value={templateType} onValueChange={(val) => setTemplateType(val as "contract" | "damage_check" | "combined")}>
              <SelectTrigger id="template-type" data-testid="select-template-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="contract">Contract Email</SelectItem>
                <SelectItem value="damage_check">Damage Check Email</SelectItem>
                <SelectItem value="combined">Combined Documents Email</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-gray-500">Choose which template to use for this email</p>
          </div>

          {/* Language Selection */}
          <div className="space-y-3">
            <Label htmlFor="language" className="text-base font-semibold">Email Language</Label>
            <Select value={language} onValueChange={(val) => setLanguage(val as "en" | "nl")}>
              <SelectTrigger id="language" data-testid="select-language">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="en">English</SelectItem>
                <SelectItem value="nl">Dutch (Nederlands)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Subject */}
          <div className="space-y-3">
            <Label htmlFor="subject" className="text-base font-semibold">Subject</Label>
            <Input
              id="subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Email subject"
              data-testid="input-email-subject"
            />
          </div>

          {/* Message */}
          <div className="space-y-3">
            <Label htmlFor="message" className="text-base font-semibold">Message</Label>
            <Textarea
              id="message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={8}
              placeholder="Email message"
              data-testid="textarea-email-message"
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 border-t pt-4">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={sendEmail.isPending}
            data-testid="button-cancel-email"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSend}
            disabled={sendEmail.isPending || selectedDocIds.length === 0 || !getRecipientEmail()}
            data-testid="button-send-email"
          >
            {sendEmail.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Mail className="mr-2 h-4 w-4" />
                Send Email{selectedDocIds.length > 1 ? 's' : ''}
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
