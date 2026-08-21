import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import TransportReportTemplateEditor from "@/pages/documents/transport-report-template-editor";
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
import { formatDate, formatCurrency, sumMoney } from "@/lib/format-utils";
import { Price } from "@/components/ui/price";
import { Reservation, Customer, Vehicle, VehicleTransport } from "@shared/schema";
import { apiRequest, invalidateByPrefix } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { TransportDialog } from "@/components/delivery/transport-dialog";
import { RouteOptimizationDialog } from "@/components/delivery/route-optimization-dialog";
import { Truck, MapPin, Clock, CheckCircle, Package, Navigation, Plus, Pencil, Trash2, Euro, Route, Receipt, Search, Printer, FileText, Settings2, Loader2 } from "lucide-react";
import { differenceInDays, isSameMonth, isSameYear } from "date-fns";

const TRANSPORT_TYPE_LABELS: Record<string, string> = {
  swap: "Swap",
  tow: "Tow",
  repossession: "Repossession",
  delivery: "Delivery",
  other: "Other",
};

export default function DeliveryDashboard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch reservations with delivery service
  const { data: reservations = [], isLoading: reservationsLoading } = useQuery<Reservation[]>({
    queryKey: ["/api/reservations"],
  });

  const { data: customers = [] } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
  });

  const { data: vehicles = [] } = useQuery<Vehicle[]>({
    queryKey: ["/api/vehicles"],
  });

  const { data: transports = [], isLoading: transportsLoading } = useQuery<VehicleTransport[]>({
    queryKey: ["/api/transports"],
  });

  // Filter reservations that have delivery service
  const deliveryReservations = reservations.filter(r => r.deliveryRequired);

  // Categorize by delivery status
  const pendingDeliveries = deliveryReservations.filter(r =>
    !r.deliveryStatus || r.deliveryStatus === 'pending'
  );
  const scheduledDeliveries = deliveryReservations.filter(r =>
    r.deliveryStatus === 'scheduled'
  );
  const enRouteDeliveries = deliveryReservations.filter(r =>
    r.deliveryStatus === 'en_route'
  );
  const completedDeliveries = deliveryReservations.filter(r =>
    r.deliveryStatus === 'delivered' || r.deliveryStatus === 'completed'
  );

  const getCustomerName = (customerId: number | null) => {
    const customer = customers.find(c => c.id === customerId);
    return customer?.name || 'Unknown';
  };

  const getVehicleInfo = (vehicleId: number | null) => {
    const vehicle = vehicles.find(v => v.id === vehicleId);
    return vehicle ? `${vehicle.brand} ${vehicle.model} (${vehicle.licensePlate})` : 'Unknown';
  };

  const getStatusBadge = (status?: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="secondary" data-testid={`badge-status-pending`}>Pending</Badge>;
      case 'scheduled':
        return <Badge className="bg-blue-100 text-blue-800" data-testid={`badge-status-scheduled`}>Scheduled</Badge>;
      case 'en_route':
        return <Badge className="bg-amber-100 text-amber-800" data-testid={`badge-status-en-route`}>En Route</Badge>;
      case 'delivered':
      case 'completed':
        return <Badge className="bg-green-100 text-green-800" data-testid={`badge-status-completed`}>Delivered</Badge>;
      default:
        return <Badge variant="outline" data-testid={`badge-status-unknown`}>Unknown</Badge>;
    }
  };

  const renderDeliveryTable = (deliveries: Reservation[], testIdPrefix: string) => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Reservation</TableHead>
          <TableHead>Customer</TableHead>
          <TableHead>Vehicle</TableHead>
          <TableHead>Address</TableHead>
          <TableHead>Delivery Date</TableHead>
          <TableHead>Fee</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {deliveries.length === 0 ? (
          <TableRow>
            <TableCell colSpan={8} className="text-center py-4">
              No deliveries in this category
            </TableCell>
          </TableRow>
        ) : (
          deliveries.map((reservation) => (
            <TableRow key={reservation.id} data-testid={`${testIdPrefix}-row-${reservation.id}`}>
              <TableCell className="font-medium">#{reservation.id}</TableCell>
              <TableCell>{getCustomerName(reservation.customerId)}</TableCell>
              <TableCell>{getVehicleInfo(reservation.vehicleId)}</TableCell>
              <TableCell>
                <div className="text-sm">
                  <div>{reservation.deliveryAddress}</div>
                  {reservation.deliveryCity && (
                    <div className="text-muted-foreground">
                      {reservation.deliveryPostalCode} {reservation.deliveryCity}
                    </div>
                  )}
                </div>
              </TableCell>
              <TableCell>{formatDate(reservation.startDate)}</TableCell>
              <TableCell>{reservation.deliveryFee ? <Price value={parseFloat(reservation.deliveryFee.toString())} /> : '-'}</TableCell>
              <TableCell>{getStatusBadge(reservation.deliveryStatus || 'pending')}</TableCell>
              <TableCell>
                <Button size="sm" variant="outline" data-testid={`button-view-${reservation.id}`}>
                  View
                </Button>
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );

  // --- Transports (loose vehicle movements: swaps, tows, repossessions) ---
  const [transportDialogOpen, setTransportDialogOpen] = useState(false);
  const [editingTransport, setEditingTransport] = useState<VehicleTransport | null>(null);
  const [deletingTransport, setDeletingTransport] = useState<VehicleTransport | null>(null);
  const [transportTypeFilter, setTransportTypeFilter] = useState<string>("all");
  const [transportStatusFilter, setTransportStatusFilter] = useState<string>("all");
  const [transportSearchQuery, setTransportSearchQuery] = useState("");
  const [routeDialogOpen, setRouteDialogOpen] = useState(false);
  const [selectedTransportIds, setSelectedTransportIds] = useState<number[]>([]);
  const [templateEditorOpen, setTemplateEditorOpen] = useState(false);
  const [reportPreviewOpen, setReportPreviewOpen] = useState(false);
  const [reportToPreview, setReportToPreview] = useState<{ id: number; fileName: string } | null>(null);
  const [reportIframeError, setReportIframeError] = useState(false);

  const filteredTransports = useMemo(() => {
    const query = transportSearchQuery.trim().toLowerCase();
    return transports.filter(t => {
      if (transportTypeFilter !== "all" && t.transportType !== transportTypeFilter) return false;
      if (transportStatusFilter !== "all" && t.status !== transportStatusFilter) return false;
      if (query) {
        const haystack = [
          t.vehicle?.brand,
          t.vehicle?.model,
          t.vehicle?.licensePlate,
          t.originAddress,
          t.originCity,
          t.destinationAddress,
          t.destinationCity,
          t.driverName,
          t.reason,
          t.notes,
          t.customer?.name,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });
  }, [transports, transportTypeFilter, transportStatusFilter, transportSearchQuery]);

  const now = new Date();
  const tollCostThisMonth = useMemo(() => {
    return transports
      .filter(t => t.tollCost && isSameMonth(new Date(t.scheduledDate), now) && isSameYear(new Date(t.scheduledDate), now))
      .reduce((sum, t) => sum + Math.round(Number(t.tollCost) * 100), 0) / 100;
  }, [transports]);

  const pendingBillableAmount = useMemo(() => {
    return transports
      .filter(t => t.billable && !t.invoiced && t.billableAmount)
      .reduce((sum, t) => sum + Math.round(Number(t.billableAmount) * 100), 0) / 100;
  }, [transports]);

  const scheduledTransportsCount = transports.filter(t => t.status === "scheduled" || t.status === "in_progress").length;

  const deleteTransportMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/transports/${id}`);
    },
    onSuccess: () => {
      invalidateByPrefix("/api/transports");
      toast({ title: "Transport deleted" });
      setDeletingTransport(null);
    },
    onError: (error: any) => {
      toast({
        title: "Failed to delete transport",
        description: error?.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const completeTransportMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("PATCH", `/api/transports/${id}`, {
        status: "completed",
        completedDate: new Date().toISOString().split("T")[0],
      });
    },
    onSuccess: () => {
      invalidateByPrefix("/api/transports");
      toast({ title: "Transport marked as completed" });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to update transport",
        description: error?.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const generateReportMutation = useMutation({
    mutationFn: async (transportIds: number[]) => {
      const res = await apiRequest("POST", "/api/delivery/transports/generate-report", { transportIds });
      return res.json() as Promise<{ id: number; fileName: string }>;
    },
    onSuccess: (document) => {
      invalidateByPrefix("/api/documents");
      setReportIframeError(false);
      setReportToPreview(document);
      setReportPreviewOpen(true);
      setSelectedTransportIds([]);
    },
    onError: (error: any) => {
      toast({
        title: "Failed to generate report",
        description: error?.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  // Calling .print() on the embedded preview iframe doesn't reliably open the
  // OS print dialog (printer selection) — the browser's PDF viewer inside a
  // framed/sandboxed context tends to silently fall back to a download instead,
  // with no exception to catch. Opening the PDF in its own top-level window and
  // printing that is what actually gets a real print dialog with printer choice.
  const printGeneratedReport = () => {
    if (!reportToPreview) return;
    const printUrl = `/api/documents/view/${reportToPreview.id}`;
    const printWindow = window.open(printUrl, "transportReportPrintWindow", "width=900,height=700");
    if (!printWindow) {
      toast({
        title: "Popup blocked",
        description: "Please allow popups for this site, then click Print again.",
        variant: "destructive",
      });
      return;
    }
    printWindow.addEventListener("load", () => {
      setTimeout(() => printWindow.print(), 600);
    });
  };

  const getTransportStatusBadge = (status: string) => {
    switch (status) {
      case 'scheduled':
        return <Badge className="bg-blue-100 text-blue-800">Scheduled</Badge>;
      case 'in_progress':
        return <Badge className="bg-amber-100 text-amber-800">In Progress</Badge>;
      case 'completed':
        return <Badge className="bg-green-100 text-green-800">Completed</Badge>;
      case 'cancelled':
        return <Badge variant="outline" className="text-muted-foreground">Cancelled</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const printTransports = () => {
    const escapeHtml = (value: unknown) =>
      String(value ?? '').replace(/[&<>"']/g, (char) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
      }[char] as string));

    const rows = filteredTransports.map((t) => {
      const vehicleLabel = t.vehicle
        ? `${t.vehicle.brand} ${t.vehicle.model} (${t.vehicle.licensePlate})`
        : getVehicleInfo(t.vehicleId);
      const route = [t.originCity, t.destinationCity].filter(Boolean).join(' → ') || '-';
      const billing = t.billable
        ? `${t.billableAmount ? formatCurrency(Number(t.billableAmount)) : '-'} (${t.invoiced ? 'Invoiced' : 'Not invoiced'})`
        : 'Not billable';
      return `
        <tr>
          <td>${escapeHtml(vehicleLabel)}</td>
          <td>${escapeHtml(TRANSPORT_TYPE_LABELS[t.transportType] || t.transportType)}</td>
          <td>${escapeHtml(route)}</td>
          <td>${escapeHtml(formatDate(t.scheduledDate))}</td>
          <td>${t.distanceKm ? escapeHtml(`${Number(t.distanceKm)} km`) : '-'}</td>
          <td>${t.tollCost ? escapeHtml(formatCurrency(Number(t.tollCost))) : '-'}</td>
          <td>${escapeHtml(billing)}</td>
          <td>${escapeHtml(t.status)}</td>
        </tr>
      `;
    }).join('');

    const totalToll = sumMoney(filteredTransports.filter(t => t.tollCost), t => Number(t.tollCost));
    const totalBillable = sumMoney(filteredTransports.filter(t => t.billable && !t.invoiced), t => Number(t.billableAmount || 0));

    const printFrame = document.createElement('iframe');
    printFrame.style.position = 'fixed';
    printFrame.style.right = '0';
    printFrame.style.bottom = '0';
    printFrame.style.width = '0';
    printFrame.style.height = '0';
    printFrame.style.border = '0';
    document.body.appendChild(printFrame);

    printFrame.onload = () => {
      const doc = printFrame.contentDocument || printFrame.contentWindow?.document;
      if (!doc) {
        console.error('Could not create print document');
        document.body.removeChild(printFrame);
        return;
      }

      doc.head.innerHTML = `
        <title>Vehicle Transports</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.5; color: #333; padding: 20px; }
          h1 { font-size: 22px; margin-bottom: 4px; }
          .meta { color: #666; font-size: 13px; margin-bottom: 16px; }
          .summary { display: flex; gap: 24px; margin-bottom: 20px; }
          .summary div { background: #f9f9f9; border-radius: 6px; padding: 10px 16px; }
          .summary .value { font-size: 18px; font-weight: bold; }
          .summary .label { font-size: 12px; color: #666; }
          table { width: 100%; border-collapse: collapse; }
          th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #ddd; font-size: 13px; }
          th { background-color: #f2f2f2; }
        </style>
      `;

      doc.body.innerHTML = `
        <h1>Vehicle Transports</h1>
        <div class="meta">Generated ${escapeHtml(new Date().toLocaleString())}${filteredTransports.length !== transports.length ? ` &middot; ${filteredTransports.length} of ${transports.length} shown (filtered)` : ''}</div>
        <div class="summary">
          <div><div class="value">${escapeHtml(formatCurrency(totalToll))}</div><div class="label">Total toll cost</div></div>
          <div><div class="value">${escapeHtml(formatCurrency(totalBillable))}</div><div class="label">Pending customer billing</div></div>
          <div><div class="value">${filteredTransports.length}</div><div class="label">Transports listed</div></div>
        </div>
        <table>
          <thead>
            <tr><th>Vehicle</th><th>Type</th><th>Route</th><th>Date</th><th>Distance</th><th>Toll Cost</th><th>Billing</th><th>Status</th></tr>
          </thead>
          <tbody>${rows || '<tr><td colspan="8">No transports</td></tr>'}</tbody>
        </table>
      `;

      setTimeout(() => {
        printFrame.contentWindow?.print();
        setTimeout(() => document.body.removeChild(printFrame), 1000);
      }, 250);
    };

    printFrame.src = 'about:blank';
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Transport Dashboard</h1>
          <p className="text-muted-foreground">Deliveries, swaps, tows, repossessions and other vehicle movements — deliveries are transports too</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setRouteDialogOpen(true)} data-testid="button-route-optimization">
            <Navigation className="h-4 w-4 mr-2" />
            Route Optimization
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="stat-pending">{pendingDeliveries.length}</div>
            <p className="text-xs text-muted-foreground">Awaiting schedule</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Scheduled</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="stat-scheduled">{scheduledDeliveries.length}</div>
            <p className="text-xs text-muted-foreground">Ready for delivery</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">En Route</CardTitle>
            <Truck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="stat-enroute">{enRouteDeliveries.length}</div>
            <p className="text-xs text-muted-foreground">In progress</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Completed Today</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="stat-completed">
              {completedDeliveries.filter(d => {
                const today = new Date();
                const deliveryDate = new Date(d.startDate);
                return differenceInDays(today, deliveryDate) === 0;
              }).length}
            </div>
            <p className="text-xs text-muted-foreground">Deliveries completed</p>
          </CardContent>
        </Card>
      </div>

      {/* Transport Tabs — "Deliveries" is a reservation-driven view (a delivery
          is scheduled as part of a rental); "All Transports" is the standalone
          vehicle_transports table, which already has its own transportType
          'delivery' for loose deliveries not tied to a reservation. Both are
          transports; this just groups the reservation-flavored ones together
          instead of flattening them into one 5-tab row. */}
      <Tabs defaultValue="transports" className="space-y-4">
        <TabsList>
          <TabsTrigger value="transports" data-testid="tab-transports">
            All Transports ({transports.length})
          </TabsTrigger>
          <TabsTrigger value="deliveries" data-testid="tab-deliveries">
            Deliveries ({deliveryReservations.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="deliveries" className="space-y-4">
          <Tabs defaultValue="pending" className="space-y-4">
            <TabsList>
              <TabsTrigger value="pending" data-testid="tab-pending">
                Pending ({pendingDeliveries.length})
              </TabsTrigger>
              <TabsTrigger value="scheduled" data-testid="tab-scheduled">
                Scheduled ({scheduledDeliveries.length})
              </TabsTrigger>
              <TabsTrigger value="enroute" data-testid="tab-enroute">
                En Route ({enRouteDeliveries.length})
              </TabsTrigger>
              <TabsTrigger value="completed" data-testid="tab-completed">
                Completed ({completedDeliveries.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="pending" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Pending Deliveries</CardTitle>
                  <CardDescription>Deliveries awaiting scheduling</CardDescription>
                </CardHeader>
                <CardContent>
                  {renderDeliveryTable(pendingDeliveries, 'pending')}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="scheduled" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Scheduled Deliveries</CardTitle>
                  <CardDescription>Deliveries ready to begin</CardDescription>
                </CardHeader>
                <CardContent>
                  {renderDeliveryTable(scheduledDeliveries, 'scheduled')}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="enroute" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>En Route Deliveries</CardTitle>
                  <CardDescription>Deliveries currently in progress</CardDescription>
                </CardHeader>
                <CardContent>
                  {renderDeliveryTable(enRouteDeliveries, 'enroute')}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="completed" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Completed Deliveries</CardTitle>
                  <CardDescription>Successfully delivered vehicles</CardDescription>
                </CardHeader>
                <CardContent>
                  {renderDeliveryTable(completedDeliveries, 'completed')}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </TabsContent>

        <TabsContent value="transports" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Toll Cost This Month</CardTitle>
                <Route className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="stat-toll-cost-month"><Price value={tollCostThisMonth} /></div>
                <p className="text-xs text-muted-foreground">What we've paid in tolls</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Pending Customer Billing</CardTitle>
                <Receipt className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="stat-pending-billing"><Price value={pendingBillableAmount} /></div>
                <p className="text-xs text-muted-foreground">Billable, not yet invoiced</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Active Jobs</CardTitle>
                <Truck className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="stat-active-transports">{scheduledTransportsCount}</div>
                <p className="text-xs text-muted-foreground">Scheduled or in progress</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div>
                  <CardTitle>Vehicle Transports</CardTitle>
                  <CardDescription>Deliveries, swaps, tows, repossessions and other standalone vehicle movements — filter by type below</CardDescription>
                </div>
                <div className="flex flex-wrap gap-2">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      value={transportSearchQuery}
                      onChange={(e) => setTransportSearchQuery(e.target.value)}
                      placeholder="Search transports..."
                      className="w-[200px] pl-8"
                      data-testid="input-search-transports"
                    />
                  </div>
                  <Select value={transportTypeFilter} onValueChange={setTransportTypeFilter}>
                    <SelectTrigger className="w-[150px]" data-testid="select-filter-transport-type">
                      <SelectValue placeholder="All types" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Types</SelectItem>
                      {Object.entries(TRANSPORT_TYPE_LABELS).map(([value, label]) => (
                        <SelectItem key={value} value={value}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={transportStatusFilter} onValueChange={setTransportStatusFilter}>
                    <SelectTrigger className="w-[150px]" data-testid="select-filter-transport-status">
                      <SelectValue placeholder="All statuses" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Statuses</SelectItem>
                      <SelectItem value="scheduled">Scheduled</SelectItem>
                      <SelectItem value="in_progress">In Progress</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                      <SelectItem value="cancelled">Cancelled</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    variant="outline"
                    onClick={printTransports}
                    disabled={filteredTransports.length === 0}
                    data-testid="button-print-transports"
                  >
                    <Printer className="h-4 w-4 mr-2" />
                    Print
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => generateReportMutation.mutate(selectedTransportIds)}
                    disabled={selectedTransportIds.length === 0 || generateReportMutation.isPending}
                    data-testid="button-generate-report"
                  >
                    {generateReportMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <FileText className="h-4 w-4 mr-2" />
                    )}
                    Generate Report{selectedTransportIds.length > 0 ? ` (${selectedTransportIds.length})` : ""}
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setTemplateEditorOpen(true)}
                    title="Manage report templates"
                    data-testid="button-manage-report-templates"
                  >
                    <Settings2 className="h-4 w-4" />
                  </Button>
                  <Button
                    onClick={() => { setEditingTransport(null); setTransportDialogOpen(true); }}
                    data-testid="button-new-transport"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    New Transport
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        checked={filteredTransports.length > 0 && selectedTransportIds.length === filteredTransports.length}
                        onCheckedChange={(checked) => {
                          setSelectedTransportIds(checked ? filteredTransports.map(t => t.id) : []);
                        }}
                        data-testid="checkbox-select-all-transports"
                      />
                    </TableHead>
                    <TableHead>Vehicle</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Route</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Distance</TableHead>
                    <TableHead>Toll Cost</TableHead>
                    <TableHead>Billing</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transportsLoading ? (
                    <TableRow>
                      <TableCell colSpan={10} className="text-center py-4">Loading transports...</TableCell>
                    </TableRow>
                  ) : filteredTransports.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={10} className="text-center py-4">No transports found</TableCell>
                    </TableRow>
                  ) : (
                    filteredTransports.map((transport) => (
                      <TableRow key={transport.id} data-testid={`transport-row-${transport.id}`}>
                        <TableCell>
                          <Checkbox
                            checked={selectedTransportIds.includes(transport.id)}
                            onCheckedChange={(checked) => {
                              setSelectedTransportIds(prev =>
                                checked ? [...prev, transport.id] : prev.filter(id => id !== transport.id)
                              );
                            }}
                            data-testid={`checkbox-select-transport-${transport.id}`}
                          />
                        </TableCell>
                        <TableCell className="font-medium">
                          {transport.vehicle
                            ? `${transport.vehicle.brand} ${transport.vehicle.model} (${transport.vehicle.licensePlate})`
                            : getVehicleInfo(transport.vehicleId)}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{TRANSPORT_TYPE_LABELS[transport.transportType] || transport.transportType}</Badge>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">
                            {transport.originCity || transport.destinationCity ? (
                              <div className="flex items-center gap-1">
                                <MapPin className="h-3 w-3 text-muted-foreground shrink-0" />
                                {transport.originCity || '?'} → {transport.destinationCity || '?'}
                              </div>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>{formatDate(transport.scheduledDate)}</TableCell>
                        <TableCell>{transport.distanceKm ? `${Number(transport.distanceKm)} km` : '-'}</TableCell>
                        <TableCell>{transport.tollCost ? <Price value={Number(transport.tollCost)} /> : '-'}</TableCell>
                        <TableCell>
                          {transport.billable ? (
                            <div className="flex items-center gap-1 text-sm">
                              <Euro className="h-3 w-3 text-muted-foreground shrink-0" />
                              {transport.billableAmount ? <Price value={Number(transport.billableAmount)} /> : '-'}
                              {transport.invoiced ? (
                                <Badge className="bg-green-100 text-green-800 ml-1">Invoiced</Badge>
                              ) : (
                                <Badge variant="outline" className="ml-1">Not invoiced</Badge>
                              )}
                            </div>
                          ) : (
                            <span className="text-muted-foreground text-sm">Not billable</span>
                          )}
                        </TableCell>
                        <TableCell>{getTransportStatusBadge(transport.status)}</TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            {transport.status !== "completed" && transport.status !== "cancelled" && (
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => completeTransportMutation.mutate(transport.id)}
                                disabled={completeTransportMutation.isPending}
                                title="Mark as completed"
                                data-testid={`button-complete-transport-${transport.id}`}
                              >
                                <CheckCircle className="h-4 w-4 text-green-600" />
                              </Button>
                            )}
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => generateReportMutation.mutate([transport.id])}
                              disabled={generateReportMutation.isPending}
                              title="Print / generate report"
                              data-testid={`button-print-transport-${transport.id}`}
                            >
                              {generateReportMutation.isPending ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Printer className="h-4 w-4" />
                              )}
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => { setEditingTransport(transport); setTransportDialogOpen(true); }}
                              data-testid={`button-edit-transport-${transport.id}`}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => setDeletingTransport(transport)}
                              data-testid={`button-delete-transport-${transport.id}`}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <TransportDialog
        open={transportDialogOpen}
        onOpenChange={setTransportDialogOpen}
        editingTransport={editingTransport}
      />

      <RouteOptimizationDialog
        open={routeDialogOpen}
        onOpenChange={setRouteDialogOpen}
        reservations={reservations}
        transports={transports}
        vehicles={vehicles}
        customers={customers}
      />

      <Dialog open={templateEditorOpen} onOpenChange={setTemplateEditorOpen}>
        <DialogContent className="max-w-[95vw] w-[95vw] h-[95vh] max-h-[95vh] p-0 overflow-hidden flex flex-col">
          <DialogHeader className="px-6 pt-6 pb-4 flex-shrink-0 border-b">
            <DialogTitle>Transport Report Template Editor</DialogTitle>
            <DialogDescription>
              Design the driver-facing report — drag fields onto the page, one big page per transport
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto overflow-x-hidden">
            <TransportReportTemplateEditor onClose={() => setTemplateEditorOpen(false)} />
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deletingTransport} onOpenChange={(open) => !open && setDeletingTransport(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this transport?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove this transport record. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingTransport && deleteTransportMutation.mutate(deletingTransport.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete-transport"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Report preview dialog - opens automatically once a report finishes generating,
          so the driver report can be reviewed and printed right away instead of only
          being saved to Documents. */}
      <AlertDialog open={reportPreviewOpen} onOpenChange={setReportPreviewOpen}>
        <AlertDialogContent className="max-w-6xl w-[90vw] h-[85vh] flex flex-col">
          <AlertDialogHeader className="flex-shrink-0">
            <AlertDialogTitle>{reportToPreview?.fileName}</AlertDialogTitle>
            <AlertDialogDescription>
              Report generated and saved to Documents — review and print below
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex-1 overflow-hidden border rounded mb-4">
            {reportToPreview && !reportIframeError && (
              <iframe
                id="transport-report-preview-iframe"
                src={`/api/documents/view/${reportToPreview.id}`}
                className="w-full h-full border-0"
                title="Transport Report Preview"
                onError={() => setReportIframeError(true)}
              />
            )}
            {reportToPreview && reportIframeError && (
              <div className="flex flex-col items-center justify-center h-full p-8 text-center">
                <p className="text-muted-foreground mb-4">
                  Your browser blocked the inline preview. You can still open it in a new tab to print it.
                </p>
                <Button
                  onClick={() => window.open(`/api/documents/view/${reportToPreview.id}`, "_blank", "noopener,noreferrer")}
                  variant="outline"
                >
                  Open in New Tab
                </Button>
              </div>
            )}
          </div>
          <AlertDialogFooter className="flex-shrink-0">
            <AlertDialogCancel onClick={() => setReportPreviewOpen(false)}>Close</AlertDialogCancel>
            <AlertDialogAction onClick={printGeneratedReport} className="bg-blue-600 hover:bg-blue-700">
              <Printer className="h-4 w-4 mr-2" />
              Print
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
