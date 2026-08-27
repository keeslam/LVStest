import { useState, useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { insertDriverSchema, Driver } from "@shared/schema";
import { z } from "zod";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { capitalizeName } from "@/lib/format-utils";
import { COUNTRIES } from "@shared/countries";
import { SearchableCombobox, type ComboboxOption } from "@/components/ui/searchable-combobox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const driverFormSchema = insertDriverSchema.omit({
  customerId: true,
  createdBy: true,
  updatedBy: true,
  licenseFilePath: true,
}).extend({
  displayName: z.string().min(1, "Display name is required"),
  licenseFile: z.any().optional(),
});

type DriverFormValues = z.infer<typeof driverFormSchema>;

interface DriverDialogProps {
  customerId: number;
  driver?: Driver;
  children: React.ReactNode;
  onSuccess?: (createdDriverId?: number) => void;
}

export function DriverDialog({ customerId, driver, children, onSuccess }: DriverDialogProps) {
  const { t } = useTranslation(["customers", "common"]);
  const [open, setOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [scrollPosition, setScrollPosition] = useState(0);
  const { toast } = useToast();
  const isEdit = !!driver;

  // Fetch country usage statistics
  const { data: countryStats = [] } = useQuery<{ country: string; count: number }[]>({
    queryKey: ['/api/drivers/countries/usage'],
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  // Create sorted country options with smart ordering
  const countryOptions = useMemo<ComboboxOption[]>(() => {
    // Create a map of country usage counts
    const usageMap = new Map(countryStats.map(stat => [stat.country, stat.count]));
    
    // Sort countries: most used first, then alphabetically
    const sortedCountries = [...COUNTRIES].sort((a, b) => {
      const usageA = usageMap.get(a) || 0;
      const usageB = usageMap.get(b) || 0;
      
      // If usage counts differ, sort by usage (descending)
      if (usageA !== usageB) {
        return usageB - usageA;
      }
      
      // If same usage, sort alphabetically
      return a.localeCompare(b);
    });
    
    return sortedCountries.map(country => {
      const usageCount = usageMap.get(country);
      return {
        value: country,
        label: country,
        tags: usageCount ? [`${usageCount} driver${usageCount > 1 ? 's' : ''}`] : undefined,
      };
    });
  }, [countryStats]);

  const form = useForm<DriverFormValues>({
    resolver: zodResolver(driverFormSchema),
    defaultValues: {
      displayName: driver?.displayName ?? "",
      firstName: driver?.firstName ?? "",
      lastName: driver?.lastName ?? "",
      email: driver?.email ?? "",
      phone: driver?.phone ?? "",
      driverLicenseNumber: driver?.driverLicenseNumber ?? "",
      licenseExpiry: driver?.licenseExpiry ?? "",
      licenseOrigin: driver?.licenseOrigin ?? "Netherlands",
      isPrimaryDriver: driver?.isPrimaryDriver ?? false,
      status: driver?.status ?? "active",
      notes: driver?.notes ?? "",
      preferredLanguage: driver?.preferredLanguage ?? "nl",
    },
  });

  // Reset form when the dialog opens or the driver being edited changes.
  // Guarded so a background refetch (new `driver` object reference from the
  // parent's query) never wipes unsaved edits or a selected license file.
  const lastResetKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!open) {
      lastResetKeyRef.current = null;
      return;
    }
    const resetKey = String(driver?.id ?? "new");
    if (
      lastResetKeyRef.current === resetKey &&
      (form.formState.isDirty || selectedFile)
    ) {
      return;
    }
    lastResetKeyRef.current = resetKey;
    form.reset({
      displayName: driver?.displayName ?? "",
      firstName: driver?.firstName ?? "",
      lastName: driver?.lastName ?? "",
      email: driver?.email ?? "",
      phone: driver?.phone ?? "",
      driverLicenseNumber: driver?.driverLicenseNumber ?? "",
      licenseExpiry: driver?.licenseExpiry ?? "",
      licenseOrigin: driver?.licenseOrigin ?? "Netherlands",
      isPrimaryDriver: driver?.isPrimaryDriver ?? false,
      status: driver?.status ?? "active",
      notes: driver?.notes ?? "",
      preferredLanguage: driver?.preferredLanguage ?? "nl",
    });
    setSelectedFile(null);
  }, [open, driver, form, selectedFile]);

  const mutation = useMutation({
    mutationFn: async (data: DriverFormValues) => {
      // Save current scroll position before mutation
      setScrollPosition(window.scrollY || document.documentElement.scrollTop);
      
      const url = isEdit ? `/api/drivers/${driver.id}` : `/api/customers/${customerId}/drivers`;
      const method = isEdit ? 'PATCH' : 'POST';
      
      let response;
      if (selectedFile) {
        // Use FormData when file is present
        const formData = new FormData();
        formData.append('body', JSON.stringify(data));
        formData.append('licenseFile', selectedFile);
        
        response = await fetch(url, {
          method,
          body: formData,
          credentials: 'include',
        });
      } else {
        // Use JSON when no file
        response = await apiRequest(method, url, data);
      }
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Failed to ${isEdit ? 'update' : 'create'} driver`);
      }
      return await response.json();
    },
    onSuccess: async (data: Driver) => {
      toast({
        title: isEdit ? t('driverForm.updatedTitle') : t('driverForm.addedTitle'),
        description: isEdit ? t('driverForm.updatedDescription') : t('driverForm.addedDescription'),
        variant: "default"
      });
      
      // Close the dialog
      setOpen(false);
      
      // Reset form and call success callback
      form.reset();
      
      // Call the parent's onSuccess callback which triggers refetch
      onSuccess?.(data.id);
      
      // Restore scroll position
      window.scrollTo({ top: scrollPosition, behavior: 'instant' });
    },
    onError: (error: Error) => {
      toast({
        title: t('common:status.error'),
        description: error.message || (isEdit ? t('driverForm.updateFailedDescription') : t('driverForm.addFailedDescription')),
        variant: "destructive"
      });
    }
  });

  const onSubmit = (data: DriverFormValues) => {
    mutation.mutate(data);
  };

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {children}
      </DialogTrigger>
      <DialogContent 
        className="max-w-2xl max-h-[90vh] overflow-y-auto"
        onPointerDownOutside={(e) => {
          // Prevent accidental clicks outside from closing the dialog while editing
          e.preventDefault();
        }}
        onInteractOutside={(e) => {
          // Prevent interactions outside from closing the dialog while editing
          e.preventDefault();
        }}
        onEscapeKeyDown={(e) => {
          // Stop escape key from propagating to parent dialog
          e.stopPropagation();
        }}
      >
        <DialogHeader>
          <DialogTitle>{isEdit ? t('driverForm.editTitle') : t('driverForm.addTitle')}</DialogTitle>
          <DialogDescription>
            {isEdit ? t('driverForm.editDescription') : t('driverForm.addDescription')}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form 
            onSubmit={(e) => {
              e.stopPropagation();
              form.handleSubmit(onSubmit)(e);
            }} 
            className="space-y-4"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="displayName"
                render={({ field }) => (
                  <FormItem className="md:col-span-2">
                    <FormLabel>{t('driverForm.displayName')}</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="John Doe"
                        data-testid="input-display-name"
                        onChange={(e) => field.onChange(capitalizeName(e.target.value))}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="firstName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('driverForm.firstName')}</FormLabel>
                    <FormControl>
                      <Input 
                        {...field} 
                        value={field.value ?? ""} 
                        placeholder="John" 
                        data-testid="input-first-name"
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
                    <FormLabel>{t('driverForm.lastName')}</FormLabel>
                    <FormControl>
                      <Input 
                        {...field} 
                        value={field.value ?? ""} 
                        placeholder="Doe" 
                        data-testid="input-last-name"
                        onChange={(e) => field.onChange(capitalizeName(e.target.value))}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('driverForm.email')}</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value ?? ""} type="email" placeholder="john@example.com" data-testid="input-email" />
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
                    <FormLabel>{t('driverForm.phone')}</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value ?? ""} placeholder="+31 6 12345678" data-testid="input-phone" />
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
                      <Input {...field} value={field.value ?? ""} placeholder="1234567890" data-testid="input-license-number" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="licenseOrigin"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('driverForm.licenseOrigin')}</FormLabel>
                    <FormControl>
                      <SearchableCombobox
                        options={countryOptions}
                        value={field.value ?? ""}
                        onChange={field.onChange}
                        placeholder={t('driverForm.selectCountry')}
                        searchPlaceholder={t('driverForm.searchCountries')}
                        emptyMessage={t('driverForm.noCountriesFound')}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="licenseExpiry"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('driverForm.licenseExpiryDate')}</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value ?? ""} type="date" data-testid="input-license-expiry" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormItem className="md:col-span-2">
                <FormLabel>{t('driverForm.licenseCopyLabel')}</FormLabel>
                <FormControl>
                  <Input
                    type="file"
                    accept="image/*,.pdf"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        setSelectedFile(file);
                      }
                    }}
                    data-testid="input-license-file"
                  />
                </FormControl>
                {selectedFile && (
                  <p className="text-sm text-muted-foreground mt-1">
                    {t('driverForm.selectedFile', { name: selectedFile.name })}
                  </p>
                )}
                {driver?.licenseFilePath && !selectedFile && (
                  <p className="text-sm text-muted-foreground mt-1">
                    {t('driverForm.currentFile', { name: driver.licenseFilePath.split('/').pop() })}
                  </p>
                )}
                <p className="text-sm text-muted-foreground">
                  {t('driverForm.uploadHint')}
                </p>
              </FormItem>

              <FormField
                control={form.control}
                name="preferredLanguage"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('driverForm.preferredLanguageLabel')}</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value || "nl"}>
                      <FormControl>
                        <SelectTrigger data-testid="select-language">
                          <SelectValue placeholder={t('driverForm.selectLanguage')} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="nl">{t('common:language.dutch')}</SelectItem>
                        <SelectItem value="en">{t('common:language.english')}</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('common:fields.status')}</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value || "active"}>
                      <FormControl>
                        <SelectTrigger data-testid="select-status">
                          <SelectValue placeholder={t('driverForm.selectStatus')} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="active">{t('common:status.active')}</SelectItem>
                        <SelectItem value="inactive">{t('common:status.inactive')}</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="isPrimaryDriver"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border p-4 md:col-span-2">
                    <div className="space-y-0.5">
                      <FormLabel>{t('driverView.primaryDriver')}</FormLabel>
                      <div className="text-sm text-gray-500">
                        {t('driverForm.primaryDriverHint')}
                      </div>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        data-testid="switch-primary-driver"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem className="md:col-span-2">
                    <FormLabel>{t('common:fields.notes')}</FormLabel>
                    <FormControl>
                      <Textarea {...field} value={field.value ?? ""} placeholder={t('driverForm.notesPlaceholder')} rows={3} data-testid="textarea-notes" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                data-testid="button-cancel"
              >
                {t('common:actions.cancel')}
              </Button>
              <Button
                type="submit"
                disabled={mutation.isPending}
                data-testid="button-submit"
              >
                {mutation.isPending ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    {isEdit ? t('driverForm.updating') : t('driverForm.adding')}
                  </>
                ) : (
                  isEdit ? t('driverForm.updateDriver') : t('driverForm.addDriver')
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
