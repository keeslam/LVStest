import { v } from "@/lib/zod-i18n";
import { describeApiError } from "@/lib/api-error";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { DuplicateWarning } from "@/components/customers/duplicate-warning";
import { useGlobalDialog } from "@/contexts/GlobalDialogContext";
import { apiRequest, invalidateRelatedQueries } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { insertCustomerSchema } from "@shared/schema";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  Form, 
  FormControl, 
  FormDescription, 
  FormField, 
  FormItem, 
  FormLabel, 
  FormMessage 
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { capitalizeName, capitalizeWords } from "@/lib/format-utils";

// Extended schema with validation
export const formSchema = insertCustomerSchema.extend({
  name: z.string().min(2, v("nameMin", { count: 2 })),
  // Make all fields optional with empty string fallback
  email: z.string().email(v("invalidEmail")).optional().or(z.literal("")),
  phone: z.string().optional().or(z.literal("")),
  debtorNumber: z.string().optional().or(z.literal("")),
  firstName: z.string().optional().or(z.literal("")),
  lastName: z.string().optional().or(z.literal("")),
  companyName: z.string().optional().or(z.literal("")),
  driverName: z.string().optional().or(z.literal("")),
  contactPerson: z.string().optional().or(z.literal("")),
  emailForMOT: z.string().email(v("invalidEmail")).optional().or(z.literal("")),
  emailForInvoices: z.string().email(v("invalidEmail")).optional().or(z.literal("")),
  emailGeneral: z.string().email(v("invalidEmail")).optional().or(z.literal("")),
  driverPhone: z.string().optional().or(z.literal("")),
  streetName: z.string().optional().or(z.literal("")),
  address: z.string().optional().or(z.literal("")),
  city: z.string().optional().or(z.literal("")),
  postalCode: z.string().optional().or(z.literal("")),
  country: z.string().optional().or(z.literal("")),
  driverLicenseNumber: z.string().optional().or(z.literal("")),
  chamberOfCommerceNumber: z.string().optional().or(z.literal("")),
  rsin: z.string().optional().or(z.literal("")),
  vatNumber: z.string().optional().or(z.literal("")),
  status: z.string().optional().or(z.literal("")),
  statusDate: z.string().optional().or(z.literal("")),
  notes: z.string().optional().or(z.literal("")),
  // Corporate/Business fields
  customerType: z.string().optional().or(z.literal("business")),
  accountManager: z.string().optional().or(z.literal("")),
  billingAddress: z.string().optional().or(z.literal("")),
  billingCity: z.string().optional().or(z.literal("")),
  billingPostalCode: z.string().optional().or(z.literal("")),
  corporateDiscount: z.string().optional().or(z.literal("")),
  paymentTermDays: z.string().optional().or(z.literal("")),
  creditLimit: z.string().optional().or(z.literal("")),
  billingContactName: z.string().optional().or(z.literal("")),
  billingContactEmail: z.string().email(v("invalidEmail")).optional().or(z.literal("")),
  billingContactPhone: z.string().optional().or(z.literal(""))
});

// B-35 final wave item 2 — the two 409 debtor-number conflict codes only
// ever differed in which i18n key they show under the field; a lookup table
// removes the near-duplicate `if`/`else if` branches. An unrecognised (or
// missing) `code` finds nothing here and falls through to the generic toast
// below, unchanged; a recognised one shows the field message only (A-4-4).
const DEBTOR_NUMBER_CONFLICT_ERROR_KEYS: Record<string, string> = {
  DEBTOR_NUMBER_TAKEN: 'form.debtorNumberTakenError',
  DEBTOR_NUMBER_IN_RECYCLE_BIN: 'form.debtorNumberInRecycleBinError',
};

interface CustomerFormProps {
  editMode?: boolean;
  initialData?: any;
  onSuccess?: (data: any) => void;
  redirectToList?: boolean;
  /**
   * Closes the caller's own dialog when "Annuleren" is pressed and
   * `redirectToList` is false. Without this, an embedded form (a dialog
   * that mounted it with `onSuccess` and `redirectToList={false}`) had no
   * way to tell its own dialog to close on cancel — it only reset the form
   * fields, leaving the dialog open (found while building B-35's E2E test,
   * see task-4-report.md's "Finding").
   */
  onCancel?: () => void;
  /** Reports whether the form holds unsaved input (see hooks/use-unsaved-changes-guard.ts). */
  onDirtyChange?: (dirty: boolean) => void;
}

export function CustomerForm({
  editMode = false,
  initialData,
  onSuccess,
  redirectToList = true,
  onCancel,
  onDirtyChange,
}: CustomerFormProps) {
  const { t } = useTranslation(["customers", "common"]);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [_, navigate] = useLocation();
  const { openCustomerDialog } = useGlobalDialog();
  
  // Helper function to transform null values to empty strings and numbers to strings
  const transformInitialData = (data: any) => {
    if (!data) return null;
    
    // Create a new object with the same properties as data
    const transformed = { ...data };
    
    // Replace null values with empty strings and convert numbers to strings
    Object.keys(transformed).forEach(key => {
      if (transformed[key] === null) {
        transformed[key] = "";
      } else if (typeof transformed[key] === 'number') {
        transformed[key] = transformed[key].toString();
      }
    });
    
    return transformed;
  };

  // Controlled so a server error on a field of the first tab can bring that tab to the front.
  const [activeTab, setActiveTab] = useState("basic");

  // Setup form with react-hook-form and zod validation
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: transformInitialData(initialData) || {
      // Basic info
      name: "",
      debtorNumber: "",
      firstName: "",
      lastName: "",
      companyName: "",
      driverName: "",
      contactPerson: "",
      
      // Communication
      email: "",
      emailForMOT: "",
      emailForInvoices: "",
      emailGeneral: "",
      phone: "",
      driverPhone: "",
      
      // Address
      streetName: "",
      address: "",
      city: "",
      postalCode: "",
      country: "Nederland",
      
      // Identification
      driverLicenseNumber: "",
      chamberOfCommerceNumber: "",
      rsin: "", 
      vatNumber: "",
      
      // Status
      status: "",
      statusDate: "",
      
      notes: "",
      
      // Corporate/Business fields
      customerType: "business",
      accountManager: "",
      billingAddress: "",
      billingCity: "",
      billingPostalCode: "",
      corporateDiscount: "",
      paymentTermDays: "",
      creditLimit: "",
      billingContactName: "",
      billingContactEmail: "",
      billingContactPhone: ""
    },
  });

  // A-3-10 / A-4-8: tell the dialog around us whether something was typed, so closing can ask first.
  const isDirty = form.formState.isDirty;
  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  // OPT-019: watched so the duplicate warning appears while the form is being
  // filled in, not after the record has been created.
  const watchedEmail = form.watch("email");
  const watchedPhone = form.watch("phone");

  const createCustomerMutation = useMutation({
    mutationFn: async (data: z.infer<typeof formSchema>) => {
      const response = await fetch(
        editMode ? `/api/customers/${initialData?.id}` : "/api/customers", 
        {
          method: editMode ? "PATCH" : "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(data)
        }
      );
      
      if (!response.ok) {
        const errorData = await response.json();
        const error = new Error(errorData.message || "Failed to create customer");
        // B-35 — copy the server's fields (field/code/conflictingCustomerName/…)
        // onto the thrown Error, the same way apiRequest's throwIfResNotOk
        // (client/src/lib/queryClient.ts) does, so onError below can turn a
        // specific 409 into a field-level message instead of only a toast.
        Object.assign(error, errorData);
        throw error;
      }
      
      return await response.json();
    },
    onSuccess: async (data) => {
      console.log("Customer created/updated successfully:", data);
      
      // Use the helper function to properly invalidate all related queries
      await invalidateRelatedQueries("customers", editMode ? initialData?.id : undefined);
      
      // Show success message
      toast({
        title: editMode ? t('form.savedTitleUpdated') : t('form.savedTitleCreated'),
        description: editMode ? t('form.savedDescriptionUpdated') : t('form.savedDescriptionCreated'),
      });
      
      // Call the onSuccess callback if provided
      if (onSuccess) {
        onSuccess(data);
      } 
      // Or navigate back to customers list if redirectToList is true
      else if (redirectToList) {
        navigate("/customers");
      }
    },
    onError: (error: Error & { code?: string; conflictingCustomerName?: string }) => {
      // B-35 — the server names exactly which customer already holds the
      // debtor number (live, or sitting in the recycle bin); show that under
      // the field itself. A-4-4: that Dutch field message is the whole answer; the
      // generic toast below (which carried the English server sentence) is for every
      // other error only.
      const debtorNumberErrorKey = error.code ? DEBTOR_NUMBER_CONFLICT_ERROR_KEYS[error.code] : undefined;
      if (debtorNumberErrorKey) {
        form.setError("debtorNumber", {
          type: "server",
          message: t(debtorNumberErrorKey, { name: error.conflictingCustomerName }),
        });
        // The field lives on the "basic" tab: if the 409 arrives while another tab is open the
        // message would sit on an unmounted field and the user would see nothing. Show the tab and
        // focus the field once it is mounted again.
        setActiveTab("basic");
        setTimeout(() => form.setFocus("debtorNumber"), 0);
        return;
      }
      toast({
        title: t('common:status.error'),
        description: editMode
          ? t('form.saveFailedDescriptionUpdate', { error: describeApiError(error) })
          : t('form.saveFailedDescriptionCreate', { error: describeApiError(error) }),
        variant: "destructive",
      });
    },
  });
  
  const onSubmit = (data: z.infer<typeof formSchema>) => {
    console.log("Form submitted!", data);
    
    // Transform empty strings to null and strings to numbers for numeric fields
    const transformedData = {
      ...data,
      corporateDiscount: data.corporateDiscount === "" ? null : data.corporateDiscount ? parseFloat(data.corporateDiscount) : null,
      paymentTermDays: data.paymentTermDays === "" ? null : data.paymentTermDays ? parseInt(data.paymentTermDays) : null,
      creditLimit: data.creditLimit === "" ? null : data.creditLimit ? parseFloat(data.creditLimit) : null,
    } as any;
    
    console.log("Transformed data:", transformedData);
    createCustomerMutation.mutate(transformedData);
  };
  
  return (
    <Card>
      <CardHeader>
        <CardTitle>{editMode ? t('editDialog.title') : t('addDialog.title')}</CardTitle>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form 
            onSubmit={(e) => {
              e.stopPropagation();
              console.log("Form errors:", form.formState.errors);
              form.handleSubmit(onSubmit)(e);
            }} 
            className="space-y-6"
          >
            {/* A-4-6: only the name is required; say what the other documents need. */}
            <div
              className="rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground"
              data-testid="text-customer-required-hint"
            >
              {t('form.requiredHint')}
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="grid grid-cols-4 mb-6">
                <TabsTrigger value="basic">{t('form.tabBasicInfo')}</TabsTrigger>
                <TabsTrigger value="contact">{t('form.tabContact')}</TabsTrigger>
                <TabsTrigger value="company">{t('form.tabCompany')}</TabsTrigger>
                <TabsTrigger value="additional">{t('form.tabAdditional')}</TabsTrigger>
              </TabsList>
              
              {/* Basic Information Tab */}
              <TabsContent value="basic" className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Personal Information */}
                  <div className="space-y-4 md:col-span-2">
                    <h3 className="text-lg font-medium">{t('details.personalInformation')}</h3>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="customerType"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t('form.customerType')}</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value || "business"}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder={t('form.selectCustomerType')} />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="business">{t('form.business')}</SelectItem>
                                <SelectItem value="individual">{t('form.individual')}</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="debtorNumber"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t('details.debtorNumber')}</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="123456"
                                data-testid="input-debtor-number"
                                {...field}
                                onChange={(e) => {
                                  field.onChange(e);
                                  // B-35 — a server-side conflict (set manually
                                  // in onError above) must never survive a
                                  // correction; clear it the moment the value
                                  // changes, same instant as the user's own edit.
                                  if (form.formState.errors.debtorNumber) {
                                    form.clearErrors("debtorNumber");
                                  }
                                }}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="name"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t('details.fullName')}</FormLabel>
                            <FormControl>
                              <Input 
                                placeholder={t('form.placeholders.fullName')} 
                                {...field}
                                onChange={(e) => field.onChange(capitalizeName(e.target.value))}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="firstName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t('details.firstName')}</FormLabel>
                            <FormControl>
                              <Input 
                                placeholder={t('form.placeholders.firstName')} 
                                {...field}
                                onChange={(e) => field.onChange(capitalizeName(e.target.value))}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      <FormField
                        control={form.control}
                        name="lastName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t('details.lastName')}</FormLabel>
                            <FormControl>
                              <Input 
                                placeholder={t('form.placeholders.lastName')} 
                                {...field}
                                onChange={(e) => field.onChange(capitalizeName(e.target.value))}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="driverName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t('details.driverName')}</FormLabel>
                            <FormControl>
                              <Input 
                                placeholder={t('form.placeholders.fullName')} 
                                {...field}
                                onChange={(e) => field.onChange(capitalizeName(e.target.value))}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      <FormField
                        control={form.control}
                        name="driverLicenseNumber"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t('driverForm.licenseNumber')}</FormLabel>
                            <FormControl>
                              <Input placeholder={t('form.licenseNumberPlaceholder')} {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>
                  
                  {/* Address Information */}
                  <div className="space-y-4 md:col-span-2">
                    <h3 className="text-lg font-medium">{t('details.addressInformation')}</h3>

                    <FormField
                      control={form.control}
                      name="streetName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('details.streetName')}</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder={t('form.placeholders.street')} 
                              {...field}
                              onChange={(e) => field.onChange(capitalizeWords(e.target.value))}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="address"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('form.streetAddress')}</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder={t('form.placeholders.streetAddress')} 
                              {...field}
                              onChange={(e) => field.onChange(capitalizeWords(e.target.value))}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="postalCode"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t('common:fields.postalCode')}</FormLabel>
                            <FormControl>
                              <Input placeholder="1234 AB" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      <FormField
                        control={form.control}
                        name="city"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t('common:fields.city')}</FormLabel>
                            <FormControl>
                              <Input 
                                placeholder="Amsterdam" 
                                {...field}
                                onChange={(e) => field.onChange(capitalizeWords(e.target.value))}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    
                    <FormField
                      control={form.control}
                      name="country"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('common:fields.country')}</FormLabel>
                          <FormControl>
                            <Input placeholder="Nederland" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>
              </TabsContent>
              
              {/* Contact Information Tab */}
              <TabsContent value="contact" className="space-y-6">
                <div className="space-y-4">
                  <h3 className="text-lg font-medium">{t('form.communicationDetails')}</h3>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('details.primaryEmail')}</FormLabel>
                          <FormControl>
                            <Input type="email" placeholder={t('form.placeholders.email')} {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="phone"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('details.primaryPhone')}</FormLabel>
                          <FormControl>
                            <Input placeholder="+31 6 12345678" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  {/* OPT-019 - names an existing customer with the same e-mail
                      or phone number. A warning, never a block. */}
                  <DuplicateWarning
                    kind="customer"
                    email={watchedEmail}
                    phone={watchedPhone}
                    excludeId={editMode ? initialData?.id ?? null : null}
                    onOpen={openCustomerDialog}
                  />

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="emailForMOT"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('form.emailForApkInspection')}</FormLabel>
                          <FormControl>
                            <Input type="email" placeholder="apk@example.com" {...field} />
                          </FormControl>
                          <FormDescription>{t('form.emailForApkDescription')}</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="emailForInvoices"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('details.emailForInvoices')}</FormLabel>
                          <FormControl>
                            <Input type="email" placeholder="invoices@example.com" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="emailGeneral"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('details.generalEmail')}</FormLabel>
                          <FormControl>
                            <Input type="email" placeholder="info@example.com" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="driverPhone"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('details.driverPhone')}</FormLabel>
                          <FormControl>
                            <Input placeholder="+31 6 87654321" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>
              </TabsContent>
              
              {/* Company Information Tab */}
              <TabsContent value="company" className="space-y-6">
                <div className="space-y-4">
                  <h3 className="text-lg font-medium">{t('form.companyDetails')}</h3>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="companyName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('details.companyName')}</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder={t('form.placeholders.companyName')} 
                              {...field}
                              onChange={(e) => field.onChange(capitalizeWords(e.target.value))}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="contactPerson"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('details.contactPerson')}</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder={t('form.placeholders.contactPerson')} 
                              {...field}
                              onChange={(e) => field.onChange(capitalizeName(e.target.value))}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="chamberOfCommerceNumber"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('form.kvkNumberCoc')}</FormLabel>
                          <FormControl>
                            <Input placeholder="12345678" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="vatNumber"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('details.vatNumber')}</FormLabel>
                          <FormControl>
                            <Input placeholder="NL123456789B01" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  
                  <FormField
                    control={form.control}
                    name="rsin"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('form.rsinLabel')}</FormLabel>
                        <FormControl>
                          <Input placeholder="123456789" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                
                <div className="space-y-4 mt-6">
                  <h3 className="text-lg font-medium">{t('form.billingContact')}</h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <FormField
                      control={form.control}
                      name="billingContactName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('form.billingContactName')}</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder={t('form.placeholders.billingContact')} 
                              {...field}
                              onChange={(e) => field.onChange(capitalizeName(e.target.value))}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="billingContactEmail"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('form.billingContactEmail')}</FormLabel>
                          <FormControl>
                            <Input type="email" placeholder={t('form.placeholders.billingEmail')} {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="billingContactPhone"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('form.billingContactPhone')}</FormLabel>
                          <FormControl>
                            <Input placeholder="+31 20 1234567" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="accountManager"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('form.accountManager')}</FormLabel>
                          <FormControl>
                            <Input placeholder={t('form.assignedAccountManagerPlaceholder')} {...field} />
                          </FormControl>
                          <FormDescription>{t('form.accountManagerDescription')}</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="corporateDiscount"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('form.corporateDiscount')}</FormLabel>
                          <FormControl>
                            <Input type="number" step="0.01" placeholder="0.00" {...field} />
                          </FormControl>
                          <FormDescription>{t('form.corporateDiscountDescription')}</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  
                  <div className="space-y-4">
                    <h4 className="text-sm font-medium">{t('form.billingAddressSection')}</h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <FormField
                        control={form.control}
                        name="billingAddress"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t('form.billingAddress')}</FormLabel>
                            <FormControl>
                              <Input 
                                placeholder={t('form.placeholders.billingAddress')} 
                                {...field}
                                onChange={(e) => field.onChange(capitalizeWords(e.target.value))}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      <FormField
                        control={form.control}
                        name="billingCity"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t('form.billingCity')}</FormLabel>
                            <FormControl>
                              <Input 
                                placeholder="Amsterdam" 
                                {...field}
                                onChange={(e) => field.onChange(capitalizeWords(e.target.value))}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      <FormField
                        control={form.control}
                        name="billingPostalCode"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t('form.billingPostalCode')}</FormLabel>
                            <FormControl>
                              <Input placeholder="1234 AB" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>
                </div>
              </TabsContent>
              
              {/* Additional Information Tab */}
              <TabsContent value="additional" className="space-y-6">
                <div className="space-y-4">
                  <h3 className="text-lg font-medium">{t('form.statusAndAdditional')}</h3>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="status"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('common:fields.status')}</FormLabel>
                          <FormControl>
                            <Input placeholder={t('common:status.active')} {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="statusDate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('details.statusDate')}</FormLabel>
                          <FormControl>
                            <Input type="date" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="notes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('common:fields.notes')}</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder={t('form.notesPlaceholder')}
                            className="min-h-[100px]"
                            {...field} 
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </TabsContent>
            </Tabs>
            
            <div className="flex justify-end space-x-2 pt-4 border-t">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  if (redirectToList) {
                    navigate("/customers");
                  } else if (onCancel) {
                    // Embedded form (a dialog): the caller owns the open
                    // state, so it closes its own dialog. Radix unmounts
                    // `DialogContent` on close, which discards this form's
                    // `useForm()` state along with it — nothing else to reset.
                    onCancel();
                  } else {
                    // No caller-supplied close handler: at least clear the
                    // fields, matching the pre-existing behaviour.
                    form.reset();
                  }
                }}
              >
                {t('common:actions.cancel')}
              </Button>
              <Button
                type="submit"
                disabled={createCustomerMutation.isPending}
              >
                {createCustomerMutation.isPending ? (
                  <span className="flex items-center">
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    {t('common:status.saving')}
                  </span>
                ) : (
                  editMode ? t('form.updateCustomer') : t('addDialog.trigger')
                )}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
