import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
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
import type { Document, Customer, Vehicle, Reservation, InteractiveDamageCheck } from "@shared/schema";
import { LANGUAGE_LOCALES, LANGUAGE_NAMES, SUPPORTED_LANGUAGES, toSupportedLanguage, type SupportedLanguage } from "@shared/languages";
import { withDocumentEmailDefaults } from "@/lib/document-email-templates";

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
  const { t } = useTranslation(["documents", "common"]);
  const { toast } = useToast();
  const [selectedDocIds, setSelectedDocIds] = useState<number[]>([]);
  const [recipientEmail, setRecipientEmail] = useState("");
  const [customEmail, setCustomEmail] = useState("");
  // The mail goes out in the customer's preferred language unless staff pick another one.
  const [language, setLanguage] = useState<SupportedLanguage>(() => toSupportedLanguage(customer?.preferredLanguage));
  const [templateType, setTemplateType] = useState<"contract" | "damage_check" | "combined">("contract");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");

  // Fetch email templates from settings
  const { data: appSettings } = useQuery<AppSetting[]>({
    queryKey: ['/api/app-settings'],
  });

  // Interactive damage checks of this reservation, newest first. They feed the
  // {checkDate}, {mileage} and {fuelLevel} placeholders of the damage-check
  // templates; without a matching check those placeholders are left untouched
  // rather than filled with guesses.
  const { data: reservationDamageChecks = [] } = useQuery<InteractiveDamageCheck[]>({
    queryKey: [`/api/interactive-damage-checks/reservation/${reservation?.id}`],
    enabled: open && !!reservation?.id,
  });

  // The check that belongs to the selected damage-check document: a
  // "(Pickup)"/"(Return)" document picks the check of that type, anything else
  // (unsigned, combined) falls back to the newest check.
  const relevantDamageCheck = (() => {
    if (reservationDamageChecks.length === 0) return undefined;
    const selectedDocs = documents.filter(doc => selectedDocIds.includes(doc.id));
    const damageDoc = selectedDocs.find(doc => isDamageCheckDocument(doc.documentType));
    const type = damageDoc?.documentType?.toLowerCase() || "";
    const wanted = type.includes("pickup") ? "pickup" : type.includes("return") ? "return" : null;
    return (wanted && reservationDamageChecks.find(c => c.checkType === wanted)) || reservationDamageChecks[0];
  })();

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
    
    // Nothing saved yet leaves the fields empty, as before. Once the templates are saved, a
    // language added later (es, pt, it, ro, pl) that staff never filled in reads as its default text.
    const docTemplates = appSettings.find(s => s.key === 'document_email_templates');
    if (!docTemplates?.value) return;
    const template = withDocumentEmailDefaults(docTemplates.value)[templateType][language];
    setSubject(replacePlaceholders(template.subject));
    setMessage(replacePlaceholders(template.message));
  }, [language, templateType, appSettings, customer, vehicle, reservation, relevantDamageCheck]);

  // Set default recipient email and mail language when customer changes
  useEffect(() => {
    if (customer) {
      setLanguage(toSupportedLanguage(customer.preferredLanguage));
      // Priority: emailGeneral > email (A-6-3: the plain address was never suggested)
      // > emailForInvoices > custom
      if (customer.emailGeneral) {
        setRecipientEmail("general");
      } else if (customer.email) {
        setRecipientEmail("main");
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
        ? new Date(reservation.startDate).toLocaleDateString(LANGUAGE_LOCALES[language])
        : '';
      const endDate = reservation.endDate 
        ? new Date(reservation.endDate).toLocaleDateString(LANGUAGE_LOCALES[language])
        : '';
      result = result.replace(/{startDate}/g, startDate);
      result = result.replace(/{endDate}/g, endDate);
    }
    
    // Damage check placeholders - only filled from a real check for this
    // reservation, so a template never goes out with invented figures.
    if (relevantDamageCheck) {
      const locale = LANGUAGE_LOCALES[language];
      if (relevantDamageCheck.checkDate) {
        result = result.replace(/{checkDate}/g, new Date(relevantDamageCheck.checkDate).toLocaleDateString(locale));
      }
      if (relevantDamageCheck.mileage != null) {
        result = result.replace(/{mileage}/g, `${relevantDamageCheck.mileage.toLocaleString(locale)} km`);
      }
      if (relevantDamageCheck.fuelLevel) {
        result = result.replace(/{fuelLevel}/g, relevantDamageCheck.fuelLevel);
      }
    }

    return result;
  };

  // Get actual email address to send to
  const getRecipientEmail = (): string => {
    if (recipientEmail === "custom") return customEmail;
    if (recipientEmail === "general") return customer?.emailGeneral || "";
    if (recipientEmail === "main") return customer?.email || "";
    if (recipientEmail === "invoices") return customer?.emailForInvoices || "";
    return "";
  };

  // Send email mutation
  const sendEmail = useMutation({
    mutationFn: async () => {
      const email = getRecipientEmail();
      if (!email) {
        throw new Error(t('emailDialog.noRecipientEmailSelected'));
      }

      if (selectedDocIds.length === 0) {
        throw new Error(t('emailDialog.noDocumentsSelected'));
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
        title: t('emailDialog.successTitle'),
        description: t('emailDialog.emailSentDescription', { email: getRecipientEmail(), count: docCount }),
      });
      onOpenChange(false);
      // Reset form
      setSelectedDocIds([]);
      setCustomEmail("");
    },
    onError: (error: Error & { code?: string; httpStatus?: number }) => {
      // A-6-3: an answer from the server is worded here, by its stable code - never
      // by showing its English sentence. The messages thrown by this dialog itself
      // (no recipient, no documents) are already translated.
      const description = error.code === "EMAIL_SEND_FAILED"
        ? t('common:documentMail.sendFailed')
        : error.httpStatus !== undefined
          ? t('emailDialog.sendEmailFailed')
          : error.message || t('emailDialog.sendEmailFailed');
      toast({
        title: t('emailDialog.errorTitle'),
        description,
        variant: "destructive",
      });
    },
  });

  const handleSend = () => {
    const email = getRecipientEmail();
    if (!email || !email.includes("@")) {
      toast({
        title: t('emailDialog.invalidEmailTitle'),
        description: t('emailDialog.enterValidEmail'),
        variant: "destructive",
      });
      return;
    }

    if (selectedDocIds.length === 0) {
      toast({
        title: t('emailDialog.noDocumentsTitle'),
        description: t('emailDialog.selectAtLeastOneDocument'),
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

  // A-6-3: the send button used to be disabled without a word. These are the things
  // it is waiting for, in the order the form asks for them.
  const recipientAddress = getRecipientEmail();
  const missing: string[] = [];
  if (selectedDocIds.length === 0) missing.push(t('common:documentMail.missingDocument'));
  if (!recipientAddress || !recipientAddress.includes("@")) missing.push(t('common:documentMail.missingRecipient'));
  if (!subject.trim()) missing.push(t('common:documentMail.missingSubject'));

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
            {t('emailDialog.title')}
          </DialogTitle>
          <DialogDescription>
            {t('emailDialog.description')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Document Selection */}
          <div className="space-y-3">
            <Label className="text-base font-semibold">{t('emailDialog.selectDocuments')}</Label>

            {contracts.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-gray-700">{t('emailDialog.contracts')}</p>
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
                <p className="text-sm font-medium text-gray-700">{t('emailDialog.damageChecks')}</p>
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
                <p className="text-sm font-medium text-gray-700">{t('emailDialog.otherDocuments')}</p>
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
                <p className="text-sm">{t('emailDialog.noDocumentsAvailable')}</p>
              </div>
            )}
          </div>

          {/* Recipient Selection */}
          <div className="space-y-3">
            <Label htmlFor="recipient" className="text-base font-semibold">{t('emailDialog.recipientEmail')}</Label>
            <Select value={recipientEmail} onValueChange={setRecipientEmail}>
              <SelectTrigger id="recipient" data-testid="select-recipient">
                <SelectValue placeholder={t('emailDialog.selectRecipientEmail')} />
              </SelectTrigger>
              <SelectContent>
                {customer?.emailGeneral && (
                  <SelectItem value="general">
                    {t('emailDialog.generalLabel', { email: customer.emailGeneral })}
                  </SelectItem>
                )}
                {customer?.email && (
                  <SelectItem value="main">
                    {t('common:documentMail.mainLabel', { email: customer.email })}
                  </SelectItem>
                )}
                {customer?.emailForInvoices && (
                  <SelectItem value="invoices">
                    {t('emailDialog.invoicesLabel', { email: customer.emailForInvoices })}
                  </SelectItem>
                )}
                <SelectItem value="custom">{t('emailDialog.customEmail')}</SelectItem>
              </SelectContent>
            </Select>

            {recipientEmail === "custom" && (
              <Input
                type="email"
                placeholder={t('emailDialog.enterEmailAddress')}
                value={customEmail}
                onChange={(e) => setCustomEmail(e.target.value)}
                data-testid="input-custom-email"
              />
            )}
          </div>

          {/* Template Selection */}
          <div className="space-y-3">
            <Label htmlFor="template-type" className="text-base font-semibold">{t('emailDialog.emailTemplate')}</Label>
            <Select value={templateType} onValueChange={(val) => setTemplateType(val as "contract" | "damage_check" | "combined")}>
              <SelectTrigger id="template-type" data-testid="select-template-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="contract">{t('emailDialog.contractEmail')}</SelectItem>
                <SelectItem value="damage_check">{t('emailDialog.damageCheckEmail')}</SelectItem>
                <SelectItem value="combined">{t('emailDialog.combinedDocumentsEmail')}</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-gray-500">{t('emailDialog.chooseTemplateHint')}</p>
          </div>

          {/* Language Selection */}
          <div className="space-y-3">
            <Label htmlFor="language" className="text-base font-semibold">{t('emailDialog.emailLanguage')}</Label>
            <Select value={language} onValueChange={(val) => setLanguage(val as SupportedLanguage)}>
              <SelectTrigger id="language" data-testid="select-language">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SUPPORTED_LANGUAGES.map((lang) => (
                  <SelectItem key={lang} value={lang}>{LANGUAGE_NAMES[lang]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Subject */}
          <div className="space-y-3">
            <Label htmlFor="subject" className="text-base font-semibold">{t('emailDialog.subject')}</Label>
            <Input
              id="subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder={t('emailDialog.emailSubjectPlaceholder')}
              data-testid="input-email-subject"
            />
          </div>

          {/* Message */}
          <div className="space-y-3">
            <Label htmlFor="message" className="text-base font-semibold">{t('emailDialog.message')}</Label>
            <Textarea
              id="message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={8}
              placeholder={t('emailDialog.emailMessagePlaceholder')}
              data-testid="textarea-email-message"
            />
          </div>
        </div>

        {/* Actions */}
        {missing.length > 0 && !sendEmail.isPending && (
          <p className="text-sm text-muted-foreground" data-testid="email-send-hint">
            {t('common:documentMail.missingPrefix')} {missing.join("; ")}.
          </p>
        )}
        <div className="flex justify-end gap-3 border-t pt-4">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={sendEmail.isPending}
            data-testid="button-cancel-email"
          >
            {t('common:actions.cancel')}
          </Button>
          <Button
            onClick={handleSend}
            disabled={sendEmail.isPending || missing.length > 0}
            data-testid="button-send-email"
          >
            {sendEmail.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t('emailDialog.sending')}
              </>
            ) : (
              <>
                <Mail className="mr-2 h-4 w-4" />
                {t('emailDialog.sendEmailButton', { count: selectedDocIds.length || 1 })}
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
