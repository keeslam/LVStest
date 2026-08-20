import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Reservation, VehicleTransport, Vehicle, Customer } from "@shared/schema";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { MapPin, Navigation, Loader2, AlertTriangle, ExternalLink } from "lucide-react";
import { formatDate } from "@/lib/format-utils";

interface RouteStop {
  id: string;
  label: string;
  type: "delivery" | "transport";
  address?: string;
  city?: string;
  postalCode?: string;
}

interface OptimizedStop extends RouteStop {
  lat: number;
  lon: number;
  distanceFromPreviousKm: number;
}

interface OptimizeRouteResult {
  order: OptimizedStop[];
  failedStops: RouteStop[];
  totalDistanceKm: number;
  mapsUrl: string | null;
  depotUsed: boolean;
  depotCoords: { lat: number; lon: number } | null;
  isRoadDistance: boolean;
}

interface RouteOptimizationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reservations: Reservation[];
  transports: VehicleTransport[];
  vehicles: Vehicle[];
  customers: Customer[];
}

const TRANSPORT_TYPE_LABELS: Record<string, string> = {
  swap: "Swap",
  tow: "Tow",
  repossession: "Repossession",
  delivery: "Delivery",
  other: "Transport",
};

export function RouteOptimizationDialog({
  open,
  onOpenChange,
  reservations,
  transports,
  vehicles,
  customers,
}: RouteOptimizationDialogProps) {
  const { toast } = useToast();
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [result, setResult] = useState<OptimizeRouteResult | null>(null);

  const getVehicleLabel = (vehicleId: number | null) => {
    const vehicle = vehicles.find((v) => v.id === vehicleId);
    return vehicle ? `${vehicle.brand} ${vehicle.model} (${vehicle.licensePlate})` : "Unknown vehicle";
  };

  const getCustomerName = (customerId: number | null) => {
    return customers.find((c) => c.id === customerId)?.name || "Unknown customer";
  };

  const stops = useMemo<RouteStop[]>(() => {
    const deliveryStops: RouteStop[] = reservations
      .filter(
        (r) =>
          r.deliveryRequired &&
          (r.deliveryStatus === "scheduled" || !r.deliveryStatus || r.deliveryStatus === "pending") &&
          r.startDate === selectedDate
      )
      .map((r) => ({
        id: `reservation-${r.id}`,
        label: `#${r.id} — ${getVehicleLabel(r.vehicleId)} → ${getCustomerName(r.customerId)}`,
        type: "delivery" as const,
        address: r.deliveryAddress ?? undefined,
        city: r.deliveryCity ?? undefined,
        postalCode: r.deliveryPostalCode ?? undefined,
      }));

    const transportStops: RouteStop[] = transports
      .filter((t) => (t.status === "scheduled" || t.status === "in_progress") && t.scheduledDate === selectedDate)
      .map((t) => {
        // For a tow/repossession, the address that matters is where the vehicle currently
        // sits (origin); for a delivery/swap it's where it's going (destination).
        const useOrigin = t.transportType === "tow" || t.transportType === "repossession";
        const address = useOrigin ? t.originAddress : t.destinationAddress ?? t.originAddress;
        const city = useOrigin ? t.originCity : t.destinationCity ?? t.originCity;
        return {
          id: `transport-${t.id}`,
          label: `${TRANSPORT_TYPE_LABELS[t.transportType] || t.transportType} — ${getVehicleLabel(t.vehicleId)}`,
          type: "transport" as const,
          address: address ?? undefined,
          city: city ?? undefined,
          postalCode: undefined,
        };
      });

    return [...deliveryStops, ...transportStops];
  }, [reservations, transports, vehicles, customers, selectedDate]);

  const stopsWithAddress = stops.filter((s) => s.address || s.city);
  const stopsWithoutAddress = stops.filter((s) => !s.address && !s.city);

  const optimizeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/delivery/optimize-route", { stops: stopsWithAddress });
      return res.json() as Promise<OptimizeRouteResult>;
    },
    onSuccess: (data) => {
      setResult(data);
      if (data.failedStops.length > 0) {
        toast({
          title: "Route optimized with warnings",
          description: `${data.failedStops.length} stop(s) couldn't be located and were left out.`,
        });
      }
    },
    onError: (error: any) => {
      toast({
        title: "Failed to optimize route",
        description: error?.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) setResult(null);
    onOpenChange(nextOpen);
  };

  // Google Maps preview shown right in the dialog, with the full route drawn and a
  // live drive-time estimate. Uses the legacy `output=embed` parameter, which is the
  // only way to embed real driving directions without a Google Maps API key — it's
  // undocumented, so if Google ever retires it this iframe will simply stop
  // rendering (the "Open in Google Maps" link below uses the modern, supported URL
  // scheme and is unaffected either way).
  const embedMapUrl = useMemo(() => {
    if (!result || result.order.length === 0) return null;
    const points = [
      ...(result.depotCoords ? [result.depotCoords] : []),
      ...result.order.map((s) => ({ lat: s.lat, lon: s.lon })),
    ];
    if (points.length < 2) return null; // need at least an origin and a destination to draw a route
    const [origin, ...rest] = points;
    const saddr = `${origin.lat},${origin.lon}`;
    const daddr = rest.map((p) => `${p.lat},${p.lon}`).join("+to:");
    return `https://www.google.com/maps?saddr=${saddr}&daddr=${daddr}&output=embed`;
  }, [result]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-[95vw] sm:max-w-2xl lg:max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Route Optimization</DialogTitle>
          <DialogDescription>
            Plan an efficient visiting order for a day's deliveries and transports, with real driving distances.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="route-date">Date</Label>
            <Input
              id="route-date"
              type="date"
              value={selectedDate}
              onChange={(e) => {
                setSelectedDate(e.target.value);
                setResult(null);
              }}
              data-testid="input-route-date"
            />
          </div>

          {stops.length === 0 ? (
            <p className="text-sm text-muted-foreground">No scheduled deliveries or transports on this date.</p>
          ) : (
            <div className="space-y-2">
              <p className="text-sm font-medium">{stopsWithAddress.length} stop(s) with an address on {formatDate(selectedDate)}</p>
              {stopsWithoutAddress.length > 0 && (
                <div className="flex items-start gap-2 text-sm text-amber-700 bg-amber-50 rounded-md p-2">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{stopsWithoutAddress.length} stop(s) have no address on file and are excluded: {stopsWithoutAddress.map((s) => s.label).join(", ")}</span>
                </div>
              )}
            </div>
          )}

          {result && (
            <div className="space-y-3 border rounded-md p-3">
              {!result.depotUsed && (
                <div className="flex items-start gap-2 text-sm text-amber-700 bg-amber-50 rounded-md p-2">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>No depot address is set in Settings, so the route starts from the first stop instead of your home base.</span>
                </div>
              )}
              {result.failedStops.length > 0 && (
                <div className="flex items-start gap-2 text-sm text-amber-700 bg-amber-50 rounded-md p-2">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>Couldn't locate: {result.failedStops.map((s) => s.label).join(", ")}</span>
                </div>
              )}
              {!result.isRoadDistance && (
                <div className="flex items-start gap-2 text-sm text-amber-700 bg-amber-50 rounded-md p-2">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>The routing service was unreachable, so distances below are straight-line estimates, not actual driving distance.</span>
                </div>
              )}
              <ol className="space-y-2">
                {result.order.map((stop, index) => (
                  <li key={stop.id} className="flex items-start gap-3" data-testid={`route-stop-${index}`}>
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                      {index + 1}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{stop.label}</span>
                        <Badge variant="outline" className="text-xs">{stop.type === "delivery" ? "Delivery" : "Transport"}</Badge>
                      </div>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <MapPin className="h-3 w-3" />
                        {stop.address ? `${stop.address}, ` : ""}{stop.city}
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground whitespace-nowrap">
                      +{stop.distanceFromPreviousKm} km
                    </div>
                  </li>
                ))}
              </ol>
              <div className="flex items-center justify-between pt-2 border-t">
                <span className="text-sm font-medium">Total distance {result.isRoadDistance ? "(driving route)" : "(straight-line estimate)"}</span>
                <span className="text-sm font-semibold">{result.totalDistanceKm} km</span>
              </div>
              {embedMapUrl && (
                <div className="space-y-1">
                  <iframe
                    title="Route preview map"
                    src={embedMapUrl}
                    className="w-full h-64 lg:h-96 rounded-md border"
                    loading="lazy"
                    data-testid="route-map-preview"
                  />
                  <p className="text-xs text-muted-foreground">
                    The map above is calculated independently by Google and may show a slightly different distance/time than the total above.
                  </p>
                </div>
              )}
              {result.mapsUrl && (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => window.open(result.mapsUrl!, "_blank", "noopener,noreferrer")}
                  data-testid="link-open-in-maps"
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Open in Google Maps (new tab)
                </Button>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Close
          </Button>
          <Button
            onClick={() => optimizeMutation.mutate()}
            disabled={stopsWithAddress.length === 0 || optimizeMutation.isPending}
            data-testid="button-optimize-route"
          >
            {optimizeMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Navigation className="mr-2 h-4 w-4" />
            )}
            {optimizeMutation.isPending ? "Optimizing..." : "Optimize Route"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
