import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
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

export default function DeliveryDashboard() {
  const { t } = useTranslation("delivery");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const TRANSPORT_TYPE_LABELS: Record<string, string> = {
    swap: t('transportDialog.typeLabels.swap'),
    tow: t('transportDialog.typeLabels.tow'),
    repossession: t('transportDialog.typeLabels.repossession'),
    delivery: t('transportDialog.typeLabels.delivery'),
    other: t('transportDialog.typeLabels.other'),
  };

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
    return customer?.name || t('dashboardPage.deliveryStatus.unknown');
  };

  const getVehicleInfo = (vehicleId: number | null) => {
    const vehicle = vehicles.find(v => v.id === vehicleId);
    return vehicle ? `${vehicle.brand} ${vehicle.model} (${vehicle.licensePlate})` : t('dashboardPage.deliveryStatus.unknown');
  };

  const getStatusBadge = (status?: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="secondary" data-testid={`badge-status-pending`}>{t('dashboardPage.deliveryStatus.pending')}</Badge>;
      case 'scheduled':
        return <Badge className="bg-blue-100 text-blue-800" data-testid={`badge-status-scheduled`}>{t('dashboardPage.deliveryStatus.scheduled')}</Badge>;
      case 'en_route':
        return <Badge className="bg-amber-100 text-amber-800" data-testid={`badge-status-en-route`}>{t('dashboardPage.deliveryStatus.enRoute')}</Badge>;
      case 'delivered':
      case 'completed':
        return <Badge className="bg-green-100 text-green-800" data-testid={`badge-status-completed`}>{t('dashboardPage.deliveryStatus.delivered')}</Badge>;
      default:
        return <Badge variant="outline" data-testid={`badge-status-unknown`}>{t('dashboardPage.deliveryStatus.unknown')}</Badge>;
    }
  };

  const renderDeliveryTable = (deliveries: Reservation[], testIdPrefix: string) => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t('dashboardPage.columnReservation')}</TableHead>
          <TableHead>{t('dashboardPage.columnCustomer')}</TableHead>
          <TableHead>{t('dashboardPage.columnVehicle')}</TableHead>
          <TableHead>{t('dashboardPage.columnAddress')}</TableHead>
          <TableHead>{t('dashboardPage.columnDeliveryDate')}</TableHead>
          <TableHead>{t('dashboardPage.columnFee')}</TableHead>
          <TableHead>{t('dashboardPage.columnStatus')}</TableHead>
          <TableHead>{t('dashboardPage.columnActions')}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {deliveries.length === 0 ? (
          <TableRow>
            <TableCell colSpan={8} className="text-center py-4">
              {t('dashboardPage.noDeliveriesInCategory')}
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
                  {t('dashboardPage.viewButton')}
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
      toast({ title: t('dashboardPage.toasts.transportDeleted') });
      setDeletingTransport(null);
    },
    onError: (error: any) => {
      toast({
        title: t('dashboardPage.toasts.deleteFailedTitle'),
        description: error?.message || t('dashboardPage.toasts.genericTryAgain'),
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
      toast({ title: t('dashboardPage.toasts.transportCompleted') });
    },
    onError: (error: any) => {
      toast({
        title: t('dashboardPage.toasts.updateFailedTitle'),
        description: error?.message || t('dashboardPage.toasts.genericTryAgain'),
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
        title: t('dashboardPage.toasts.generateReportFailedTitle'),
        description: error?.message || t('dashboardPage.toasts.genericTryAgain'),
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
        title: t('dashboardPage.toasts.popupBlockedTitle'),
        description: t('dashboardPage.toasts.popupBlockedDescription'),
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
        return <Badge className="bg-blue-100 text-blue-800">{t('transportDialog.statusScheduled')}</Badge>;
      case 'in_progress':
        return <Badge className="bg-amber-100 text-amber-800">{t('transportDialog.statusInProgress')}</Badge>;
      case 'completed':
        return <Badge className="bg-green-100 text-green-800">{t('transportDialog.statusCompleted')}</Badge>;
      case 'cancelled':
        return <Badge variant="outline" className="text-muted-foreground">{t('transportDialog.statusCancelled')}</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const printTransports = () => {
    const tt = t;
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
        ? `${t.billableAmount ? formatCurrency(Number(t.billableAmount)) : '-'} (${t.invoiced ? tt('dashboardPage.invoicedBadge') : tt('dashboardPage.notInvoicedBadge')})`
        : tt('dashboardPage.notBillable');
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
        <title>${escapeHtml(tt('dashboardPage.printReport.docTitle'))}</title>
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
        <h1>${escapeHtml(tt('dashboardPage.printReport.heading'))}</h1>
        <div class="meta">${escapeHtml(tt('dashboardPage.printReport.generatedLabel', { date: new Date().toLocaleString() }))}${filteredTransports.length !== transports.length ? ` ${escapeHtml(tt('dashboardPage.printReport.shownFiltered', { shown: filteredTransports.length, total: transports.length }))}` : ''}</div>
        <div class="summary">
          <div><div class="value">${escapeHtml(formatCurrency(totalToll))}</div><div class="label">${escapeHtml(tt('dashboardPage.printReport.totalTollCost'))}</div></div>
          <div><div class="value">${escapeHtml(formatCurrency(totalBillable))}</div><div class="label">${escapeHtml(tt('dashboardPage.printReport.pendingCustomerBilling'))}</div></div>
          <div><div class="value">${filteredTransports.length}</div><div class="label">${escapeHtml(tt('dashboardPage.printReport.transportsListed'))}</div></div>
        </div>
        <table>
          <thead>
            <tr><th>${escapeHtml(tt('dashboardPage.columnVehicle'))}</th><th>${escapeHtml(tt('dashboardPage.columnType'))}</th><th>${escapeHtml(tt('dashboardPage.columnRoute'))}</th><th>${escapeHtml(tt('dashboardPage.columnDate'))}</th><th>${escapeHtml(tt('dashboardPage.columnDistance'))}</th><th>${escapeHtml(tt('dashboardPage.columnTollCost'))}</th><th>${escapeHtml(tt('dashboardPage.columnBilling'))}</th><th>${escapeHtml(tt('dashboardPage.columnStatus'))}</th></tr>
          </thead>
          <tbody>${rows || `<tr><td colspan="8">${escapeHtml(tt('dashboardPage.printReport.noTransports'))}</td></tr>`}</tbody>
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
          <h1 className="text-3xl font-bold">{t('dashboardPage.title')}</h1>
          <p className="text-muted-foreground">{t('dashboardPage.subtitle')}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setRouteDialogOpen(true)} data-testid="button-route-optimization">
            <Navigation className="h-4 w-4 mr-2" />
            {t('dashboardPage.routeOptimizationButton')}
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('dashboardPage.statPending')}</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="stat-pending">{pendingDeliveries.length}</div>
            <p className="text-xs text-muted-foreground">{t('dashboardPage.statAwaitingSchedule')}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('dashboardPage.statScheduled')}</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="stat-scheduled">{scheduledDeliveries.length}</div>
            <p className="text-xs text-muted-foreground">{t('dashboardPage.statReadyForDelivery')}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('dashboardPage.statEnRoute')}</CardTitle>
            <Truck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="stat-enroute">{enRouteDeliveries.length}</div>
            <p className="text-xs text-muted-foreground">{t('dashboardPage.statInProgress')}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('dashboardPage.statCompletedToday')}</CardTitle>
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
            <p className="text-xs text-muted-foreground">{t('dashboardPage.statDeliveriesCompleted')}</p>
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
            {t('dashboardPage.tabAllTransports', { count: transports.length })}
          </TabsTrigger>
          <TabsTrigger value="deliveries" data-testid="tab-deliveries">
            {t('dashboardPage.tabDeliveries', { count: deliveryReservations.length })}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="deliveries" className="space-y-4">
          <Tabs defaultValue="pending" className="space-y-4">
            <TabsList>
              <TabsTrigger value="pending" data-testid="tab-pending">
                {t('dashboardPage.tabPending', { count: pendingDeliveries.length })}
              </TabsTrigger>
              <TabsTrigger value="scheduled" data-testid="tab-scheduled">
                {t('dashboardPage.tabScheduled', { count: scheduledDeliveries.length })}
              </TabsTrigger>
              <TabsTrigger value="enroute" data-testid="tab-enroute">
                {t('dashboardPage.tabEnroute', { count: enRouteDeliveries.length })}
              </TabsTrigger>
              <TabsTrigger value="completed" data-testid="tab-completed">
                {t('dashboardPage.tabCompleted', { count: completedDeliveries.length })}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="pending" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>{t('dashboardPage.pendingDeliveriesTitle')}</CardTitle>
                  <CardDescription>{t('dashboardPage.pendingDeliveriesDescription')}</CardDescription>
                </CardHeader>
                <CardContent>
                  {renderDeliveryTable(pendingDeliveries, 'pending')}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="scheduled" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>{t('dashboardPage.scheduledDeliveriesTitle')}</CardTitle>
                  <CardDescription>{t('dashboardPage.scheduledDeliveriesDescription')}</CardDescription>
                </CardHeader>
                <CardContent>
                  {renderDeliveryTable(scheduledDeliveries, 'scheduled')}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="enroute" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>{t('dashboardPage.enRouteDeliveriesTitle')}</CardTitle>
                  <CardDescription>{t('dashboardPage.enRouteDeliveriesDescription')}</CardDescription>
                </CardHeader>
                <CardContent>
                  {renderDeliveryTable(enRouteDeliveries, 'enroute')}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="completed" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>{t('dashboardPage.completedDeliveriesTitle')}</CardTitle>
                  <CardDescription>{t('dashboardPage.completedDeliveriesDescription')}</CardDescription>
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
                <CardTitle className="text-sm font-medium">{t('dashboardPage.tollCostThisMonthTitle')}</CardTitle>
                <Route className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="stat-toll-cost-month"><Price value={tollCostThisMonth} /></div>
                <p className="text-xs text-muted-foreground">{t('dashboardPage.tollCostThisMonthDescription')}</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{t('dashboardPage.pendingCustomerBillingTitle')}</CardTitle>
                <Receipt className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="stat-pending-billing"><Price value={pendingBillableAmount} /></div>
                <p className="text-xs text-muted-foreground">{t('dashboardPage.pendingCustomerBillingDescription')}</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{t('dashboardPage.activeJobsTitle')}</CardTitle>
                <Truck className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="stat-active-transports">{scheduledTransportsCount}</div>
                <p className="text-xs text-muted-foreground">{t('dashboardPage.activeJobsDescription')}</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div>
                  <CardTitle>{t('dashboardPage.vehicleTransportsTitle')}</CardTitle>
                  <CardDescription>{t('dashboardPage.vehicleTransportsDescription')}</CardDescription>
                </div>
                <div className="flex flex-wrap gap-2">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      value={transportSearchQuery}
                      onChange={(e) => setTransportSearchQuery(e.target.value)}
                      placeholder={t('dashboardPage.searchTransportsPlaceholder')}
                      className="w-[200px] pl-8"
                      data-testid="input-search-transports"
                    />
                  </div>
                  <Select value={transportTypeFilter} onValueChange={setTransportTypeFilter}>
                    <SelectTrigger className="w-[150px]" data-testid="select-filter-transport-type">
                      <SelectValue placeholder={t('dashboardPage.allTypesPlaceholder')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t('dashboardPage.allTypes')}</SelectItem>
                      {Object.entries(TRANSPORT_TYPE_LABELS).map(([value, label]) => (
                        <SelectItem key={value} value={value}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={transportStatusFilter} onValueChange={setTransportStatusFilter}>
                    <SelectTrigger className="w-[150px]" data-testid="select-filter-transport-status">
                      <SelectValue placeholder={t('dashboardPage.allStatusesPlaceholder')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t('dashboardPage.allStatuses')}</SelectItem>
                      <SelectItem value="scheduled">{t('transportDialog.statusScheduled')}</SelectItem>
                      <SelectItem value="in_progress">{t('transportDialog.statusInProgress')}</SelectItem>
                      <SelectItem value="completed">{t('transportDialog.statusCompleted')}</SelectItem>
                      <SelectItem value="cancelled">{t('transportDialog.statusCancelled')}</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    variant="outline"
                    onClick={printTransports}
                    disabled={filteredTransports.length === 0}
                    data-testid="button-print-transports"
                  >
                    <Printer className="h-4 w-4 mr-2" />
                    {t('dashboardPage.printButton')}
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
                    {selectedTransportIds.length > 0
                      ? t('dashboardPage.generateReportButtonWithCount', { count: selectedTransportIds.length })
                      : t('dashboardPage.generateReportButton')}
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setTemplateEditorOpen(true)}
                    title={t('dashboardPage.manageReportTemplatesTitle')}
                    data-testid="button-manage-report-templates"
                  >
                    <Settings2 className="h-4 w-4" />
                  </Button>
                  <Button
                    onClick={() => { setEditingTransport(null); setTransportDialogOpen(true); }}
                    data-testid="button-new-transport"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    {t('dashboardPage.newTransportButton')}
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
                    <TableHead>{t('dashboardPage.columnVehicle')}</TableHead>
                    <TableHead>{t('dashboardPage.columnType')}</TableHead>
                    <TableHead>{t('dashboardPage.columnRoute')}</TableHead>
                    <TableHead>{t('dashboardPage.columnDate')}</TableHead>
                    <TableHead>{t('dashboardPage.columnDistance')}</TableHead>
                    <TableHead>{t('dashboardPage.columnTollCost')}</TableHead>
                    <TableHead>{t('dashboardPage.columnBilling')}</TableHead>
                    <TableHead>{t('dashboardPage.columnStatus')}</TableHead>
                    <TableHead>{t('dashboardPage.columnActions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transportsLoading ? (
                    <TableRow>
                      <TableCell colSpan={10} className="text-center py-4">{t('dashboardPage.loadingTransports')}</TableCell>
                    </TableRow>
                  ) : filteredTransports.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={10} className="text-center py-4">{t('dashboardPage.noTransportsFound')}</TableCell>
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
                                <Badge className="bg-green-100 text-green-800 ml-1">{t('dashboardPage.invoicedBadge')}</Badge>
                              ) : (
                                <Badge variant="outline" className="ml-1">{t('dashboardPage.notInvoicedBadge')}</Badge>
                              )}
                            </div>
                          ) : (
                            <span className="text-muted-foreground text-sm">{t('dashboardPage.notBillable')}</span>
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
                                title={t('dashboardPage.markAsCompletedTitle')}
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
                              title={t('dashboardPage.printGenerateReportTitle')}
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
            <DialogTitle>{t('dashboardPage.templateEditorTitle')}</DialogTitle>
            <DialogDescription>
              {t('dashboardPage.templateEditorDescription')}
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
            <AlertDialogTitle>{t('dashboardPage.deleteTransportTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('dashboardPage.deleteTransportDescription')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common:actions.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingTransport && deleteTransportMutation.mutate(deletingTransport.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete-transport"
            >
              {t('common:actions.delete')}
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
              {t('dashboardPage.reportPreviewDescription')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex-1 overflow-hidden border rounded mb-4">
            {reportToPreview && !reportIframeError && (
              <iframe
                id="transport-report-preview-iframe"
                src={`/api/documents/view/${reportToPreview.id}`}
                className="w-full h-full border-0"
                title={t('dashboardPage.reportPreviewIframeTitle')}
                onError={() => setReportIframeError(true)}
              />
            )}
            {reportToPreview && reportIframeError && (
              <div className="flex flex-col items-center justify-center h-full p-8 text-center">
                <p className="text-muted-foreground mb-4">
                  {t('dashboardPage.previewBlockedMessage')}
                </p>
                <Button
                  onClick={() => window.open(`/api/documents/view/${reportToPreview.id}`, "_blank", "noopener,noreferrer")}
                  variant="outline"
                >
                  {t('dashboardPage.openInNewTabButton')}
                </Button>
              </div>
            )}
          </div>
          <AlertDialogFooter className="flex-shrink-0">
            <AlertDialogCancel onClick={() => setReportPreviewOpen(false)}>{t('common:actions.close')}</AlertDialogCancel>
            <AlertDialogAction onClick={printGeneratedReport} className="bg-blue-600 hover:bg-blue-700">
              <Printer className="h-4 w-4 mr-2" />
              {t('dashboardPage.printButton')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
