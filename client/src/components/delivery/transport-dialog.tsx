import { useEffect, useMemo, useState } from "react";
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

const TRANSPORT_TYPE_LABELS: Record<string, string> = {
  swap: "Vehicle Swap",
  tow: "Tow",
  repossession: "Repossession",
  delivery: "Delivery",
  other: "Other",
};

interface TransportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingTransport?: VehicleTransport | null;
}

export function TransportDialog({ open, onOpenChange, editingTransport }: TransportDialogProps) {
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
          title: "Distance calculated",
          description: "The routing service was unreachable, so this is a straight-line estimate, not actual driving distance.",
        });
      }
    },
    onError: (error: any) => {
      toast({
        title: "Couldn't calculate distance",
        description: error?.message || "Check that both addresses are complete, or enter the distance manually.",
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
        title: isEditMode ? "Transport updated" : "Transport logged",
        description: isEditMode ? "The transport job has been updated." : "The transport job has been recorded.",
      });
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast({
        title: "Failed to save transport",
        description: error?.message || "Please check the form and try again.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: TransportFormData) => mutation.mutate(data);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditMode ? "Edit Transport" : "Log Transport"}</DialogTitle>
          <DialogDescription>
            Record a standalone vehicle movement — a swap, tow, or repossession — separate from a normal rental delivery.
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
                    <FormLabel>Type</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-transport-type">
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {Object.entries(TRANSPORT_TYPE_LABELS).map(([value, label]) => (
                          <SelectItem key={value} value={value}>{label}</SelectItem>
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
                    <FormLabel>Status</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-transport-status">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="scheduled">Scheduled</SelectItem>
                        <SelectItem value="in_progress">In Progress</SelectItem>
                        <SelectItem value="completed">Completed</SelectItem>
                        <SelectItem value="cancelled">Cancelled</SelectItem>
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
                  <FormLabel>Vehicle</FormLabel>
                  <FormControl>
                    <VehicleSelector
                      vehicles={vehicles}
                      value={field.value}
                      onChange={field.onChange}
                      placeholder="Search and select a vehicle..."
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
                    <FormLabel>Replacement Vehicle <span className="text-muted-foreground font-normal">(the one being swapped in)</span></FormLabel>
                    <FormControl>
                      <VehicleSelector
                        vehicles={vehicles}
                        value={field.value ?? ""}
                        onChange={field.onChange}
                        placeholder="Search and select the replacement vehicle..."
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
                    <FormLabel>Scheduled Date</FormLabel>
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
                    <FormLabel>Completed Date <span className="text-muted-foreground font-normal">(optional)</span></FormLabel>
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
                    <FormLabel>From <span className="text-muted-foreground font-normal">(optional)</span></FormLabel>
                    <FormControl>
                      <Input placeholder="Street address" {...field} value={field.value ?? ""} />
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
                      <Input placeholder="City" {...field} value={field.value ?? ""} />
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
                    <FormLabel>To <span className="text-muted-foreground font-normal">(optional)</span></FormLabel>
                    <FormControl>
                      <Input placeholder="Street address" {...field} value={field.value ?? ""} />
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
                      <Input placeholder="City" {...field} value={field.value ?? ""} />
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
                    <FormLabel>Distance (km) <span className="text-muted-foreground font-normal">(optional)</span></FormLabel>
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
                        {estimateDistanceMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Calculate"}
                      </Button>
                    </div>
                    <FormDescription>Calculated driving distance from the From/To addresses above</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="tollCost"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Toll Cost (€) <span className="text-muted-foreground font-normal">(optional)</span></FormLabel>
                    <div className="flex gap-2">
                      <FormControl>
                        <Input type="number" step="0.01" min="0" placeholder="0.00" {...field} value={field.value ?? ""} />
                      </FormControl>
                      <Button type="button" variant="outline" size="sm" onClick={applySuggestedTollCost} disabled={!distanceKmWatch}>
                        Suggest
                      </Button>
                    </div>
                    <FormDescription>€{tollRatePerKm.toFixed(2)}/km — configurable in Settings</FormDescription>
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
                Round trip — suggestion includes the empty return leg
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
                      <FormLabel>Breakdown or maintenance swap</FormLabel>
                      <FormDescription>Our own cost, not the customer's — not billed by default. Check "Bill this to a customer" below to override.</FormDescription>
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
                    <FormLabel>Bill this to a customer</FormLabel>
                    <FormDescription>Charge the customer for this transport, separate from what it cost us in toll</FormDescription>
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
                      <FormLabel>Customer</FormLabel>
                      <FormControl>
                        <SearchableCombobox
                          options={customerOptions}
                          value={field.value ?? ""}
                          onChange={field.onChange}
                          placeholder="Search customers..."
                          emptyMessage="No customers found"
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
                      <FormLabel>Amount to Charge (€)</FormLabel>
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
                      <FormLabel className="!mt-0">Already invoiced to the customer</FormLabel>
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
                    <FormLabel>Driver <span className="text-muted-foreground font-normal">(optional)</span></FormLabel>
                    <FormControl>
                      <Input placeholder="Who performed the transport" {...field} value={field.value ?? ""} />
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
                    <FormLabel>Reason <span className="text-muted-foreground font-normal">(optional)</span></FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. Non-payment, breakdown" {...field} value={field.value ?? ""} />
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
                  <FormLabel>Notes <span className="text-muted-foreground font-normal">(optional)</span></FormLabel>
                  <FormControl>
                    <Textarea rows={2} {...field} value={field.value ?? ""} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isEditMode ? "Save Changes" : "Log Transport"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
