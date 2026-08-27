import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiRequest, invalidateByPrefix } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Customer, Settings, Vehicle, VehicleTransport } from "@shared/schema";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { VehicleSelector } from "@/components/ui/vehicle-selector";
import { SearchableCombobox } from "@/components/ui/searchable-combobox";
import { Loader2 } from "lucide-react";

const transportFormSchema = z.object({
  vehicleId: z.string().min(1, "Please select a vehicle"),
  relatedVehicleId: z.string().optional(),
  transportType: z.enum(["swap", "tow", "repossession", "delivery", "other"], {
    required_error: "Please select a transport type",
  }),
  status: z.enum(["scheduled", "in_progress", "completed", "cancelled"]).default("scheduled"),
  scheduledDate: z.string().min(1, "Scheduled date is required"),
  completedDate: z.string().optional(),
  originAddress: z.string().optional(),
  originCity: z.string().optional(),
  destinationAddress: z.string().optional(),
  destinationCity: z.string().optional(),
  distanceKm: z.union([z.string(), z.number()]).optional(),
  tollCost: z.union([z.string(), z.number()]).optional(),
  isBreakdownOrMaintenance: z.boolean().default(false),
  billable: z.boolean().default(false),
  customerId: z.string().optional(),
  billableAmount: z.union([z.string(), z.number()]).optional(),
  invoiced: z.boolean().default(false),
  driverName: z.string().optional(),
  reason: z.string().optional(),
  notes: z.string().optional(),
});

type TransportFormData = z.infer<typeof transportFormSchema>;

const TRANSPORT_TYPE_VALUES = ["swap", "tow", "repossession", "delivery", "other"] as const;

interface TransportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingTransport?: VehicleTransport | null;
}

export function TransportDialog({ open, onOpenChange, editingTransport }: TransportDialogProps) {
  const { t } = useTranslation(["delivery", "common"]);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isEditMode = !!editingTransport;

  const { data: customers = [] } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
    enabled: open,
  });

  const { data: vehicles = [] } = useQuery<Vehicle[]>({
    queryKey: ["/api/vehicles"],
    enabled: open,
  });

  const { data: settings } = useQuery<Settings>({
    queryKey: ["/api/system-settings"],
    enabled: open,
  });

  const form = useForm<TransportFormData>({
    resolver: zodResolver(transportFormSchema),
    defaultValues: {
      vehicleId: "",
      relatedVehicleId: "",
      transportType: "swap",
      status: "scheduled",
      scheduledDate: new Date().toISOString().split("T")[0],
      completedDate: "",
      originAddress: "",
      originCity: "",
      destinationAddress: "",
      destinationCity: "",
      distanceKm: "",
      tollCost: "",
      isBreakdownOrMaintenance: false,
      billable: false,
      customerId: "",
      billableAmount: "",
      invoiced: false,
      driverName: "",
      reason: "",
      notes: "",
    },
  });

  useEffect(() => {
    if (!open) return;
    if (editingTransport) {
      form.reset({
        vehicleId: editingTransport.vehicleId?.toString() ?? "",
        relatedVehicleId: editingTransport.relatedVehicleId?.toString() ?? "",
        transportType: editingTransport.transportType as TransportFormData["transportType"],
        status: editingTransport.status as TransportFormData["status"],
        scheduledDate: editingTransport.scheduledDate,
        completedDate: editingTransport.completedDate ?? "",
        originAddress: editingTransport.originAddress ?? "",
        originCity: editingTransport.originCity ?? "",
        destinationAddress: editingTransport.destinationAddress ?? "",
        destinationCity: editingTransport.destinationCity ?? "",
        distanceKm: editingTransport.distanceKm ?? "",
        tollCost: editingTransport.tollCost ?? "",
        isBreakdownOrMaintenance: editingTransport.isBreakdownOrMaintenance,
        billable: editingTransport.billable,
        customerId: editingTransport.customerId?.toString() ?? "",
        billableAmount: editingTransport.billableAmount ?? "",
        invoiced: editingTransport.invoiced,
        driverName: editingTransport.driverName ?? "",
        reason: editingTransport.reason ?? "",
        notes: editingTransport.notes ?? "",
      });
    } else {
      form.reset({
        vehicleId: "",
        relatedVehicleId: "",
        transportType: "swap",
        status: "scheduled",
        scheduledDate: new Date().toISOString().split("T")[0],
        completedDate: "",
        originAddress: settings?.depotAddress || "",
        originCity: settings?.depotCity || "",
        destinationAddress: "",
        destinationCity: "",
        distanceKm: "",
        tollCost: "",
        isBreakdownOrMaintenance: false,
        billable: false,
        customerId: "",
        billableAmount: "",
        invoiced: false,
        driverName: "",
        reason: "",
        notes: "",
      });
    }
  }, [open, editingTransport, form]);

  // The depot address loads asynchronously (fetched only once the dialog opens), so it
  // can arrive after the reset above already ran with it still undefined. Fill it in
  // then too, but only if the user hasn't already typed something in its place.
  useEffect(() => {
    if (!open || isEditMode) return;
    if (!settings?.depotAddress && !settings?.depotCity) return;
    if (form.getValues("originAddress") || form.getValues("originCity")) return;
    form.setValue("originAddress", settings.depotAddress || "");
    form.setValue("originCity", settings.depotCity || "");
  }, [open, isEditMode, settings, form]);

  const transportTypeWatch = form.watch("transportType");
  const billableWatch = form.watch("billable");
  const distanceKmWatch = form.watch("distanceKm");
  const originAddressWatch = form.watch("originAddress");
  const originCityWatch = form.watch("originCity");
  const destinationAddressWatch = form.watch("destinationAddress");
  const destinationCityWatch = form.watch("destinationCity");

  const customerOptions = useMemo(
    () => customers.map(c => ({ value: c.id.toString(), label: c.name })),
    [customers]
  );

  // The driver usually returns to base empty after the job — that return leg still
  // costs toll, so the suggestion defaults to round-trip distance. Toggle off for
  // one-way jobs (e.g. the vehicle itself is what's coming back).
  const [roundTrip, setRoundTrip] = useState(true);

  // Suggest a toll cost from the configured €/km rate — the user can still edit it.
  const tollRatePerKm = settings?.tollRatePerKm ? Number(settings.tollRatePerKm) : 0.15;
  const applySuggestedTollCost = () => {
    const km = Number(distanceKmWatch);
    if (!km || km <= 0) return;
    const multiplier = roundTrip ? 2 : 1;
    form.setValue("tollCost", (km * multiplier * tollRatePerKm).toFixed(2));
  };

  const canEstimateDistance = !!(originAddressWatch || originCityWatch) && !!(destinationAddressWatch || destinationCityWatch);

  const estimateDistanceMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/delivery/estimate-distance", {
        originAddress: originAddressWatch,
        originCity: originCityWatch,
        destinationAddress: destinationAddressWatch,
        destinationCity: destinationCityWatch,
      });
      return res.json() as Promise<{ distanceKm: number; isRoadDistance: boolean }>;
    },
    onSuccess: (data) => {
      form.setValue("distanceKm", data.distanceKm.toString());
      if (!data.isRoadDistance) {
        toast({
          title: t('transportDialog.distanceCalculatedTitle'),
          description: t('transportDialog.distanceCalculatedDescription'),
        });
      }
    },
    onError: (error: any) => {
      toast({
        title: t('transportDialog.couldntCalculateTitle'),
        description: error?.message || t('transportDialog.checkAddresses'),
        variant: "destructive",
      });
    },
  });

  const mutation = useMutation({
    mutationFn: async (data: TransportFormData) => {
      const payload = {
        ...data,
        vehicleId: parseInt(data.vehicleId),
        relatedVehicleId: data.relatedVehicleId ? parseInt(data.relatedVehicleId) : null,
        customerId: data.customerId ? parseInt(data.customerId) : null,
        distanceKm: data.distanceKm === "" || data.distanceKm == null ? null : Number(data.distanceKm),
        tollCost: data.tollCost === "" || data.tollCost == null ? null : Number(data.tollCost),
        billableAmount: data.billableAmount === "" || data.billableAmount == null ? null : Number(data.billableAmount),
        completedDate: data.completedDate || null,
      };
      if (isEditMode) {
        const res = await apiRequest("PATCH", `/api/transports/${editingTransport!.id}`, payload);
        return res.json();
      }
      const res = await apiRequest("POST", "/api/transports", payload);
      return res.json();
    },
    onSuccess: () => {
      invalidateByPrefix("/api/transports");
      toast({
        title: isEditMode ? t('transportDialog.transportUpdated') : t('transportDialog.transportLogged'),
        description: isEditMode ? t('transportDialog.transportUpdatedDescription') : t('transportDialog.transportLoggedDescription'),
      });
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast({
        title: t('transportDialog.saveFailedTitle'),
        description: error?.message || t('transportDialog.checkFormTryAgain'),
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: TransportFormData) => mutation.mutate(data);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditMode ? t('transportDialog.editTitle') : t('transportDialog.addTitle')}</DialogTitle>
          <DialogDescription>
            {t('transportDialog.description')}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="transportType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('transportDialog.type')}</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-transport-type">
                          <SelectValue placeholder={t('transportDialog.selectType')} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {TRANSPORT_TYPE_VALUES.map((value) => (
                          <SelectItem key={value} value={value}>{t(`transportDialog.typeLabels.${value}`)}</SelectItem>
                        ))}
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
                    <FormLabel>{t('transportDialog.status')}</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-transport-status">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="scheduled">{t('transportDialog.statusScheduled')}</SelectItem>
                        <SelectItem value="in_progress">{t('transportDialog.statusInProgress')}</SelectItem>
                        <SelectItem value="completed">{t('transportDialog.statusCompleted')}</SelectItem>
                        <SelectItem value="cancelled">{t('transportDialog.statusCancelled')}</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="vehicleId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('transportDialog.vehicle')}</FormLabel>
                  <FormControl>
                    <VehicleSelector
                      vehicles={vehicles}
                      value={field.value}
                      onChange={field.onChange}
                      placeholder={t('transportDialog.searchSelectVehicle')}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {transportTypeWatch === "swap" && (
              <FormField
                control={form.control}
                name="relatedVehicleId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('transportDialog.replacementVehicle')} <span className="text-muted-foreground font-normal">{t('transportDialog.replacementVehicleHint')}</span></FormLabel>
                    <FormControl>
                      <VehicleSelector
                        vehicles={vehicles}
                        value={field.value ?? ""}
                        onChange={field.onChange}
                        placeholder={t('transportDialog.searchSelectReplacementVehicle')}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="scheduledDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('transportDialog.scheduledDate')}</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} data-testid="input-transport-scheduled-date" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="completedDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('transportDialog.completedDate')} <span className="text-muted-foreground font-normal">{t('transportDialog.optional')}</span></FormLabel>
                    <FormControl>
                      <Input type="date" {...field} value={field.value ?? ""} data-testid="input-transport-completed-date" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="originAddress"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('transportDialog.from')} <span className="text-muted-foreground font-normal">{t('transportDialog.optional')}</span></FormLabel>
                    <FormControl>
                      <Input placeholder={t('transportDialog.streetAddress')} {...field} value={field.value ?? ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="originCity"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>&nbsp;</FormLabel>
                    <FormControl>
                      <Input placeholder={t('transportDialog.city')} {...field} value={field.value ?? ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="destinationAddress"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('transportDialog.to')} <span className="text-muted-foreground font-normal">{t('transportDialog.optional')}</span></FormLabel>
                    <FormControl>
                      <Input placeholder={t('transportDialog.streetAddress')} {...field} value={field.value ?? ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="destinationCity"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>&nbsp;</FormLabel>
                    <FormControl>
                      <Input placeholder={t('transportDialog.city')} {...field} value={field.value ?? ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
              <FormField
                control={form.control}
                name="distanceKm"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('transportDialog.distanceKm')} <span className="text-muted-foreground font-normal">{t('transportDialog.optional')}</span></FormLabel>
                    <div className="flex gap-2">
                      <FormControl>
                        <Input type="number" step="0.1" min="0" placeholder="0" {...field} value={field.value ?? ""} />
                      </FormControl>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => estimateDistanceMutation.mutate()}
                        disabled={!canEstimateDistance || estimateDistanceMutation.isPending}
                        data-testid="button-calculate-distance"
                      >
                        {estimateDistanceMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : t('transportDialog.calculate')}
                      </Button>
                    </div>
                    <FormDescription>{t('transportDialog.distanceDescription')}</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="tollCost"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('transportDialog.tollCost')} <span className="text-muted-foreground font-normal">{t('transportDialog.optional')}</span></FormLabel>
                    <div className="flex gap-2">
                      <FormControl>
                        <Input type="number" step="0.01" min="0" placeholder="0.00" {...field} value={field.value ?? ""} />
                      </FormControl>
                      <Button type="button" variant="outline" size="sm" onClick={applySuggestedTollCost} disabled={!distanceKmWatch}>
                        {t('transportDialog.suggest')}
                      </Button>
                    </div>
                    <FormDescription>{t('transportDialog.tollRateDescription', { rate: tollRatePerKm.toFixed(2) })}</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="flex items-center gap-2 -mt-2">
              <Checkbox
                checked={roundTrip}
                onCheckedChange={(checked) => setRoundTrip(checked === true)}
                id="round-trip-toggle"
                data-testid="checkbox-round-trip"
              />
              <label htmlFor="round-trip-toggle" className="text-sm text-muted-foreground">
                {t('transportDialog.roundTrip')}
              </label>
            </div>

            {transportTypeWatch === "swap" && (
              <FormField
                control={form.control}
                name="isBreakdownOrMaintenance"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={(checked) => {
                          field.onChange(checked);
                          if (checked) form.setValue("billable", false);
                        }}
                        data-testid="checkbox-breakdown-or-maintenance"
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel>{t('transportDialog.breakdownSwapLabel')}</FormLabel>
                      <FormDescription>{t('transportDialog.breakdownSwapDescription')}</FormDescription>
                    </div>
                  </FormItem>
                )}
              />
            )}

            <FormField
              control={form.control}
              name="billable"
              render={({ field }) => (
                <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      data-testid="checkbox-transport-billable"
                    />
                  </FormControl>
                  <div className="space-y-1 leading-none">
                    <FormLabel>{t('transportDialog.billableLabel')}</FormLabel>
                    <FormDescription>{t('transportDialog.billableDescription')}</FormDescription>
                  </div>
                </FormItem>
              )}
            />

            {billableWatch && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pl-4 border-l-2">
                <FormField
                  control={form.control}
                  name="customerId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('transportDialog.customer')}</FormLabel>
                      <FormControl>
                        <SearchableCombobox
                          options={customerOptions}
                          value={field.value ?? ""}
                          onChange={field.onChange}
                          placeholder={t('transportDialog.searchCustomers')}
                          emptyMessage={t('transportDialog.noCustomersFound')}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="billableAmount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('transportDialog.amountToCharge')}</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.01" min="0" placeholder="0.00" {...field} value={field.value ?? ""} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="invoiced"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center gap-2 space-y-0 md:col-span-2">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          data-testid="checkbox-transport-invoiced"
                        />
                      </FormControl>
                      <FormLabel className="!mt-0">{t('transportDialog.alreadyInvoiced')}</FormLabel>
                    </FormItem>
                  )}
                />
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="driverName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('transportDialog.driver')} <span className="text-muted-foreground font-normal">{t('transportDialog.optional')}</span></FormLabel>
                    <FormControl>
                      <Input placeholder={t('transportDialog.whoPerformedTransport')} {...field} value={field.value ?? ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="reason"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('transportDialog.reason')} <span className="text-muted-foreground font-normal">{t('transportDialog.optional')}</span></FormLabel>
                    <FormControl>
                      <Input placeholder={t('transportDialog.reasonPlaceholder')} {...field} value={field.value ?? ""} />
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
                  <FormLabel>{t('common:fields.notes')} <span className="text-muted-foreground font-normal">{t('transportDialog.optional')}</span></FormLabel>
                  <FormControl>
                    <Textarea rows={2} {...field} value={field.value ?? ""} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                {t('common:actions.cancel')}
              </Button>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isEditMode ? t('transportDialog.saveChanges') : t('transportDialog.addTitle')}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
