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
import { getTransportSpareStatus } from "@shared/transport-spare-status";
import { apiRequest, invalidateByPrefix } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useGlobalDialog } from "@/contexts/GlobalDialogContext";
import { TransportDialog } from "@/components/delivery/transport-dialog";
import { RouteOptimizationDialog } from "@/components/delivery/route-optimization-dialog";
import { SparePickupPromptDialog } from "@/components/delivery/spare-pickup-prompt-dialog";
import { TransportViewDialog, type TransportViewData } from "@/components/delivery/transport-view-dialog";
import { formatLicensePlate } from "@/lib/format-utils";
import { Truck, MapPin, Clock, CheckCircle, Package, PackageCheck, Undo2, Navigation, Plus, Pencil, Trash2, Euro, Search, Printer, Loader2, User, Eye } from "lucide-react";
import { differenceInDays } from "date-fns";

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

  // Reservations that need delivery but don't have a real transport row yet — new
  // deliveries auto-get one server-side (see syncDeliveryTransport in
  // database-storage.ts), so this now only catches legacy ones from before that
  // existed. Excluded here so they don't double up with their own transport row
  // once one exists.
  const reservationIdsWithTransport = new Set(transports.map(t => t.reservationId).filter((id): id is number => id != null));
  const deliveryReservations = reservations.filter(r => r.deliveryRequired && !reservationIdsWithTransport.has(r.id));

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

  // --- Transports (loose vehicle movements: swaps, tows, repossessions) ---
  const [transportDialogOpen, setTransportDialogOpen] = useState(false);
  const [editingTransport, setEditingTransport] = useState<VehicleTransport | null>(null);
  const [deletingTransport, setDeletingTransport] = useState<VehicleTransport | null>(null);
  const [pickupPromptTransport, setPickupPromptTransport] = useState<VehicleTransport | null>(null);
  // Whether pickupPromptTransport should hand off to PickupDialog (spare not yet
  // picked up) or ReturnDialog (spare picked up, not yet returned) — same prompt
  // shape, different real dialog underneath.
  const [pickupPromptMode, setPickupPromptMode] = useState<"pickup" | "return">("pickup");
  // Set only when the prompt was opened from the "Mark Completed" guard, so
  // its onResolved (fired either way — "now" or "later") knows to still complete the
  // transport afterward; unset for the row/post-assign triggers, which don't chain
  // into completion.
  const [completeAfterPickupPromptId, setCompleteAfterPickupPromptId] = useState<number | null>(null);
  const { openVehicleDialog, openReservationDialog } = useGlobalDialog();
  const [activeTransportType, setActiveTransportType] = useState<string>("all");
  const [transportStatusFilter, setTransportStatusFilter] = useState<string>("all");
  const [transportSearchQuery, setTransportSearchQuery] = useState("");
  const [routeDialogOpen, setRouteDialogOpen] = useState(false);
  const [selectedRowKeys, setSelectedRowKeys] = useState<string[]>([]);
  const [reportPreviewOpen, setReportPreviewOpen] = useState(false);
  const [reportToPreview, setReportToPreview] = useState<{ id: number; fileName: string } | null>(null);
  const [reportIframeError, setReportIframeError] = useState(false);

  // Unifies the standalone vehicle_transports table with reservation-driven
  // deliveries into one list, so "All transports" and the per-type tabs show
  // both — a delivery is a transport too, it's just recorded on a Reservation
  // instead of a vehicle_transports row.
  type UnifiedRow =
    | { kind: 'transport'; transport: VehicleTransport }
    | { kind: 'delivery'; reservation: Reservation };

  const rowType = (row: UnifiedRow) => row.kind === 'transport' ? row.transport.transportType : 'delivery';
  const rowKey = (row: UnifiedRow) => row.kind === 'transport' ? `t${row.transport.id}` : `r${row.reservation.id}`;
  // Delivery reservations use a different status vocabulary (pending/scheduled/en_route/delivered)
  // than vehicle_transports (scheduled/in_progress/completed/cancelled) — mapped onto the
  // transport vocabulary so one status filter/badge can cover both.
  const rowStatus = (row: UnifiedRow): string => {
    if (row.kind === 'transport') return row.transport.status;
    const s = row.reservation.deliveryStatus || 'pending';
    if (s === 'pending' || s === 'scheduled') return 'scheduled';
    if (s === 'en_route') return 'in_progress';
    return 'completed';
  };

  const allRows = useMemo<UnifiedRow[]>(() => [
    ...transports.map((transport): UnifiedRow => ({ kind: 'transport', transport })),
    ...deliveryReservations.map((reservation): UnifiedRow => ({ kind: 'delivery', reservation })),
  ], [transports, deliveryReservations]);

  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = { all: allRows.length, swap: 0, tow: 0, repossession: 0, delivery: 0, other: 0 };
    allRows.forEach(row => { counts[rowType(row)] = (counts[rowType(row)] || 0) + 1; });
    return counts;
  }, [allRows]);

  const filteredRows = useMemo(() => {
    const query = transportSearchQuery.trim().toLowerCase();
    return allRows.filter(row => {
      if (activeTransportType !== "all" && rowType(row) !== activeTransportType) return false;
      if (transportStatusFilter !== "all" && rowStatus(row) !== transportStatusFilter) return false;
      if (query) {
        const haystack = row.kind === 'transport'
          ? [
              row.transport.vehicle?.brand,
              row.transport.vehicle?.model,
              row.transport.vehicle?.licensePlate,
              row.transport.externalBrand,
              row.transport.externalModel,
              row.transport.externalLicensePlate,
              row.transport.externalOwnerName,
              row.transport.originAddress,
              row.transport.originCity,
              row.transport.destinationAddress,
              row.transport.destinationCity,
              row.transport.driverName,
              row.transport.reason,
              row.transport.notes,
              row.transport.customer?.name,
            ]
          : [
              getCustomerName(row.reservation.customerId),
              getVehicleInfo(row.reservation.vehicleId),
              row.reservation.deliveryAddress,
              row.reservation.deliveryCity,
            ];
        if (!haystack.filter(Boolean).join(" ").toLowerCase().includes(query)) return false;
      }
      return true;
    });
  }, [allRows, activeTransportType, transportStatusFilter, transportSearchQuery]);

  const selectedTransportRows = useMemo(
    () => filteredRows.filter((row): row is Extract<UnifiedRow, { kind: 'transport' }> =>
      row.kind === 'transport' && selectedRowKeys.includes(rowKey(row))
    ),
    [filteredRows, selectedRowKeys]
  );

  // Most recently completed transport, and the next one still ahead — shown as
  // an at-a-glance pair on the dashboard instead of making staff open the table.
  const lastTransport = useMemo(() => {
    return [...transports]
      .filter(t => t.status === 'completed')
      .sort((a, b) => new Date(b.completedDate || b.scheduledDate).getTime() - new Date(a.completedDate || a.scheduledDate).getTime())[0];
  }, [transports]);

  const upcomingTransport = useMemo(() => {
    return [...transports]
      .filter(t => t.status === 'scheduled' || t.status === 'in_progress')
      .sort((a, b) => new Date(a.scheduledDate).getTime() - new Date(b.scheduledDate).getTime())[0];
  }, [transports]);

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

  // A transport with an assigned-but-not-yet-picked-up spare gets the pickup prompt,
  // and one with a picked-up-but-not-yet-returned spare gets the return prompt,
  // instead of completing immediately; anything else (no spare, still TBD, already
  // returned) completes exactly as before.
  const handleCompleteTransportClick = (transport: VehicleTransport) => {
    const spareStatus = getTransportSpareStatus(transport);
    if (spareStatus === 'assigned' || spareStatus === 'picked_up') {
      setPickupPromptMode(spareStatus === 'picked_up' ? 'return' : 'pickup');
      setPickupPromptTransport(transport);
      setCompleteAfterPickupPromptId(transport.id);
    } else {
      completeTransportMutation.mutate(transport.id);
    }
  };

  const handlePickupPromptResolved = () => {
    if (completeAfterPickupPromptId != null) {
      completeTransportMutation.mutate(completeAfterPickupPromptId);
      setCompleteAfterPickupPromptId(null);
    }
  };

  // Printing/generating the transport letter is blocked while a required
  // replacement vehicle is still TBD — validated here (fast feedback) and again on
  // the backend (POST /api/delivery/transports/generate-report), since that endpoint
  // can be called independently of this button.
  const handlePrintTransportClick = (transport: VehicleTransport) => {
    if (getTransportSpareStatus(transport) === 'tbd') {
      toast({
        title: t('dashboardPage.replacementVehicleRequiredTitle'),
        description: t('dashboardPage.replacementVehicleRequiredForPrint'),
        variant: "destructive",
      });
      return;
    }
    generateReportMutation.mutate([transport.id]);
  };

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
      setSelectedRowKeys([]);
    },
    onError: (error: any) => {
      toast({
        title: t('dashboardPage.toasts.generateReportFailedTitle'),
        description: error?.message || t('dashboardPage.toasts.genericTryAgain'),
        variant: "destructive",
      });
    },
  });

  const bulkCompleteTransportMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      await Promise.all(ids.map(id => apiRequest("PATCH", `/api/transports/${id}`, {
        status: "completed",
        completedDate: new Date().toISOString().split("T")[0],
      })));
    },
    onSuccess: (_data, ids) => {
      invalidateByPrefix("/api/transports");
      toast({ title: t('dashboardPage.toasts.transportCompleted') });
      setSelectedRowKeys(prev => prev.filter(key => !ids.some(id => key === `t${id}`)));
    },
    onError: (error: any) => {
      toast({
        title: t('dashboardPage.toasts.updateFailedTitle'),
        description: error?.message || t('dashboardPage.toasts.genericTryAgain'),
        variant: "destructive",
      });
    },
  });

  // Only transport rows are printable/completable in bulk — delivery reservations
  // aren't vehicle_transports rows, so the backend endpoints these call don't know
  // about them. Rows that still need a TBD replacement vehicle are skipped for
  // print, same guard as the single-row button.
  const handleBulkPrint = () => {
    const printable = selectedTransportRows.filter(row => getTransportSpareStatus(row.transport) !== 'tbd');
    if (printable.length === 0) {
      toast({
        title: t('dashboardPage.replacementVehicleRequiredTitle'),
        description: t('dashboardPage.replacementVehicleRequiredForPrint'),
        variant: "destructive",
      });
      return;
    }
    generateReportMutation.mutate(printable.map(row => row.transport.id));
  };

  const handleBulkComplete = () => {
    const completable = selectedTransportRows.filter(row => row.transport.status !== 'completed' && row.transport.status !== 'cancelled');
    if (completable.length === 0) return;
    bulkCompleteTransportMutation.mutate(completable.map(row => row.transport.id));
  };

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

  // Shared between the table's "Replacement Vehicle" column and the read-only
  // view dialog, so the two never drift out of sync with each other.
  const renderReplacementVehicleCell = (transport: VehicleTransport) => {
    const spareStatus = getTransportSpareStatus(transport);
    if (spareStatus === 'not_required') {
      return <span className="text-muted-foreground text-sm">—</span>;
    }
    if (spareStatus === 'tbd') {
      return (
        <div className="flex items-center gap-1">
          <Badge className="bg-amber-100 text-amber-800">{t('dashboardPage.spareStatusTbd')}</Badge>
          <Button
            size="sm"
            variant="outline"
            onClick={() => { setEditingTransport(transport); setTransportDialogOpen(true); }}
            data-testid={`button-select-replacement-${transport.id}`}
          >
            {t('dashboardPage.selectReplacementVehicleButton')}
          </Button>
        </div>
      );
    }
    const label = transport.relatedVehicle
      ? `${transport.relatedVehicle.brand} ${transport.relatedVehicle.model} (${formatLicensePlate(transport.relatedVehicle.licensePlate)})`
      : `#${transport.relatedVehicleId}`;
    return (
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => transport.relatedVehicleId && openVehicleDialog(transport.relatedVehicleId)}
          className="text-blue-600 hover:underline text-sm text-left"
          data-testid={`link-replacement-vehicle-${transport.id}`}
        >
          {label}
        </button>
        {spareStatus === 'assigned' && (
          <Badge className="bg-blue-100 text-blue-800">{t('dashboardPage.spareStatusAssigned')}</Badge>
        )}
        {spareStatus === 'picked_up' && (
          <Badge className="bg-green-100 text-green-800">{t('dashboardPage.spareStatusPickedUp')}</Badge>
        )}
        {spareStatus === 'returned' && (
          <Badge className="bg-gray-100 text-gray-800">{t('dashboardPage.spareStatusReturned')}</Badge>
        )}
      </div>
    );
  };

  // Read-only "view" dialog data — decoupled from VehicleTransport/Reservation so
  // it can present either a real transport row or a reservation-driven delivery
  // (which isn't a vehicle_transports row) with the same component.
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [viewingData, setViewingData] = useState<TransportViewData | null>(null);

  const openTransportView = (transport: VehicleTransport) => {
    setViewingData({
      title: t('dashboardPage.viewTransportSubtitle'),
      vehicleLabel: transport.isExternalVehicle
        ? [transport.externalBrand, transport.externalModel].filter(Boolean).join(' ') +
          (transport.externalLicensePlate ? ` (${formatLicensePlate(transport.externalLicensePlate)})` : '')
        : transport.vehicle
          ? `${transport.vehicle.brand} ${transport.vehicle.model} (${formatLicensePlate(transport.vehicle.licensePlate)})`
          : getVehicleInfo(transport.vehicleId),
      isExternalVehicle: transport.isExternalVehicle,
      replacementVehicleLabel: renderReplacementVehicleCell(transport),
      typeLabel: TRANSPORT_TYPE_LABELS[transport.transportType] || transport.transportType,
      statusBadge: getTransportStatusBadge(transport.status),
      routeLabel: transport.originCity || transport.destinationCity
        ? `${transport.originCity || '?'} → ${transport.destinationCity || '?'}`
        : null,
      scheduledDate: transport.scheduledDate,
      completedDate: transport.completedDate,
      distanceKm: transport.distanceKm,
      tollCost: transport.tollCost,
      billable: transport.billable,
      billableAmount: transport.billableAmount,
      invoicedBadge: transport.billable ? (
        transport.invoiced
          ? <Badge className="bg-green-100 text-green-800 ml-1">{t('dashboardPage.invoicedBadge')}</Badge>
          : <Badge variant="outline" className="ml-1">{t('dashboardPage.notInvoicedBadge')}</Badge>
      ) : undefined,
      customerLabel: transport.customer?.name || (transport.customerId ? getCustomerName(transport.customerId) : null),
      driverName: transport.driverName,
      reason: transport.reason,
      notes: transport.notes,
      onEdit: () => { setViewDialogOpen(false); setEditingTransport(transport); setTransportDialogOpen(true); },
    });
    setViewDialogOpen(true);
  };

  const openDeliveryView = (reservation: Reservation) => {
    setViewingData({
      title: t('dashboardPage.deliveryViewSubtitle', { id: reservation.id }),
      vehicleLabel: getVehicleInfo(reservation.vehicleId),
      typeLabel: TRANSPORT_TYPE_LABELS.delivery,
      statusBadge: getTransportStatusBadge(
        reservation.deliveryStatus === 'en_route' ? 'in_progress'
        : reservation.deliveryStatus === 'delivered' || reservation.deliveryStatus === 'completed' ? 'completed'
        : 'scheduled'
      ),
      routeLabel: reservation.deliveryAddress || reservation.deliveryCity
        ? [reservation.deliveryAddress, reservation.deliveryCity].filter(Boolean).join(', ')
        : null,
      scheduledDate: reservation.startDate,
      billable: !!reservation.deliveryFee,
      billableAmount: reservation.deliveryFee,
      customerLabel: getCustomerName(reservation.customerId),
      onOpenReservation: () => { setViewDialogOpen(false); openReservationDialog(reservation.id); },
    });
    setViewDialogOpen(true);
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex flex-wrap justify-between items-center gap-2">
        <div>
          <h1 className="text-3xl font-bold">{t('dashboardPage.title')}</h1>
          <p className="text-muted-foreground">{t('dashboardPage.subtitle')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setRouteDialogOpen(true)} data-testid="button-route-optimization">
            <Navigation className="h-4 w-4 mr-2" />
            {t('dashboardPage.routeOptimizationButton')}
          </Button>
        </div>
      </div>

      {/* Upcoming transport / last transport / stats — 3 equal-height columns */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-stretch">
        <TransportGlanceCard
          title={t('dashboardPage.upcomingTransportTitle')}
          emptyLabel={t('dashboardPage.noUpcomingTransport')}
          transport={upcomingTransport}
          t={t}
          onView={(transport) => openTransportView(transport)}
        />
        <TransportGlanceCard
          title={t('dashboardPage.lastTransportTitle')}
          emptyLabel={t('dashboardPage.noLastTransport')}
          transport={lastTransport}
          t={t}
          onView={(transport) => openTransportView(transport)}
        />
        <Card className="h-full">
          <CardContent className="p-3 h-full flex flex-col justify-center gap-1.5">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
              <div className="flex items-baseline gap-1.5">
                <span className="text-sm font-bold" data-testid="stat-pending">{pendingDeliveries.length}</span>
                <p className="text-xs text-muted-foreground">{t('dashboardPage.statAwaitingSchedule')}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Package className="h-4 w-4 text-muted-foreground shrink-0" />
              <div className="flex items-baseline gap-1.5">
                <span className="text-sm font-bold" data-testid="stat-scheduled">{scheduledDeliveries.length}</span>
                <p className="text-xs text-muted-foreground">{t('dashboardPage.statReadyForDelivery')}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Truck className="h-4 w-4 text-muted-foreground shrink-0" />
              <div className="flex items-baseline gap-1.5">
                <span className="text-sm font-bold" data-testid="stat-enroute">{enRouteDeliveries.length}</span>
                <p className="text-xs text-muted-foreground">{t('dashboardPage.statInProgress')}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-muted-foreground shrink-0" />
              <div className="flex items-baseline gap-1.5">
                <span className="text-sm font-bold" data-testid="stat-completed">
                  {completedDeliveries.filter(d => {
                    const today = new Date();
                    const deliveryDate = new Date(d.startDate);
                    return differenceInDays(today, deliveryDate) === 0;
                  }).length}
                </span>
                <p className="text-xs text-muted-foreground">{t('dashboardPage.statDeliveriesCompleted')}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* One unified table of every vehicle movement — standalone vehicle_transports
          rows and reservation-driven deliveries alike, since a delivery is a
          transport too. "All" shows everything; the rest filter by type. */}
      <Tabs value={activeTransportType} onValueChange={setActiveTransportType} className="space-y-4">
        {/* On phones the six type tabs overflow the viewport; let the bar
            scroll sideways instead of clipping. Desktop is unaffected. */}
        <div className="overflow-x-auto">
        <TabsList className="w-max">
          <TabsTrigger value="all" data-testid="tab-all-transports">
            {t('dashboardPage.tabAllTransports', { count: typeCounts.all })}
          </TabsTrigger>
          {Object.entries(TRANSPORT_TYPE_LABELS).map(([value, label]) => (
            <TabsTrigger key={value} value={value} data-testid={`tab-type-${value}`}>
              {label} ({typeCounts[value] || 0})
            </TabsTrigger>
          ))}
        </TabsList>
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
                  onClick={() => { setEditingTransport(null); setTransportDialogOpen(true); }}
                  data-testid="button-new-transport"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  {t('dashboardPage.newTransportButton')}
                </Button>
              </div>
            </div>
            {selectedRowKeys.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/50 px-3 py-2 text-sm mt-2">
                <span className="text-muted-foreground">{t('dashboardPage.selectedCount', { count: selectedRowKeys.length })}</span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleBulkPrint}
                  disabled={selectedTransportRows.length === 0 || generateReportMutation.isPending}
                  data-testid="button-bulk-print"
                >
                  {generateReportMutation.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Printer className="h-4 w-4 mr-1" />}
                  {t('dashboardPage.bulkPrintButton')}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleBulkComplete}
                  disabled={selectedTransportRows.length === 0 || bulkCompleteTransportMutation.isPending}
                  data-testid="button-bulk-complete"
                >
                  {bulkCompleteTransportMutation.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <CheckCircle className="h-4 w-4 mr-1" />}
                  {t('dashboardPage.bulkCompleteButton')}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setSelectedRowKeys([])} data-testid="button-clear-selection">
                  {t('dashboardPage.clearSelectionButton')}
                </Button>
              </div>
            )}
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={filteredRows.length > 0 && selectedRowKeys.length === filteredRows.length}
                      onCheckedChange={(checked) => {
                        setSelectedRowKeys(checked ? filteredRows.map(rowKey) : []);
                      }}
                      data-testid="checkbox-select-all-transports"
                    />
                  </TableHead>
                  <TableHead>{t('dashboardPage.columnVehicle')}</TableHead>
                  <TableHead>{t('dashboardPage.columnReplacementVehicle')}</TableHead>
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
                {transportsLoading || reservationsLoading ? (
                  <TableRow>
                    <TableCell colSpan={11} className="text-center py-4">{t('dashboardPage.loadingTransports')}</TableCell>
                  </TableRow>
                ) : filteredRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={11} className="text-center py-4">{t('dashboardPage.noTransportsFound')}</TableCell>
                  </TableRow>
                ) : (
                  filteredRows.map((row) => {
                    const key = rowKey(row);
                    if (row.kind === 'delivery') {
                      const reservation = row.reservation;
                      return (
                        <TableRow key={key} data-testid={`delivery-row-${reservation.id}`}>
                          <TableCell>
                            <Checkbox
                              checked={selectedRowKeys.includes(key)}
                              onCheckedChange={(checked) => {
                                setSelectedRowKeys(prev => checked ? [...prev, key] : prev.filter(k => k !== key));
                              }}
                              data-testid={`checkbox-select-${key}`}
                            />
                          </TableCell>
                          <TableCell className="font-medium">{getVehicleInfo(reservation.vehicleId)}</TableCell>
                          <TableCell><span className="text-muted-foreground text-sm">—</span></TableCell>
                          <TableCell>
                            <Badge variant="outline">{TRANSPORT_TYPE_LABELS.delivery}</Badge>
                          </TableCell>
                          <TableCell>
                            <div className="text-sm">
                              {reservation.deliveryAddress || reservation.deliveryCity ? (
                                <div className="flex items-center gap-1">
                                  <MapPin className="h-3 w-3 text-muted-foreground shrink-0" />
                                  {[reservation.deliveryAddress, reservation.deliveryCity].filter(Boolean).join(', ')}
                                </div>
                              ) : (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>{formatDate(reservation.startDate)}</TableCell>
                          <TableCell><span className="text-muted-foreground text-sm">-</span></TableCell>
                          <TableCell><span className="text-muted-foreground text-sm">-</span></TableCell>
                          <TableCell>
                            {reservation.deliveryFee ? (
                              <div className="flex items-center gap-1 text-sm">
                                <Euro className="h-3 w-3 text-muted-foreground shrink-0" />
                                <Price value={parseFloat(reservation.deliveryFee.toString())} />
                              </div>
                            ) : (
                              <span className="text-muted-foreground text-sm">{t('dashboardPage.notBillable')}</span>
                            )}
                          </TableCell>
                          <TableCell>{getTransportStatusBadge(rowStatus(row))}</TableCell>
                          <TableCell>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => openDeliveryView(reservation)}
                              title={t('dashboardPage.viewButton')}
                              data-testid={`button-view-delivery-${reservation.id}`}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    }

                    const transport = row.transport;
                    return (
                      <TableRow key={key} data-testid={`transport-row-${transport.id}`}>
                        <TableCell>
                          <Checkbox
                            checked={selectedRowKeys.includes(key)}
                            onCheckedChange={(checked) => {
                              setSelectedRowKeys(prev => checked ? [...prev, key] : prev.filter(k => k !== key));
                            }}
                            data-testid={`checkbox-select-transport-${transport.id}`}
                          />
                        </TableCell>
                        <TableCell className="font-medium">
                          {transport.isExternalVehicle ? (
                            <div className="flex items-center gap-1">
                              <span>
                                {[transport.externalBrand, transport.externalModel].filter(Boolean).join(' ')}
                                {transport.externalLicensePlate ? ` (${formatLicensePlate(transport.externalLicensePlate)})` : ''}
                              </span>
                              <Badge variant="outline" className="text-xs" data-testid={`badge-external-vehicle-${transport.id}`}>
                                {t('dashboardPage.externalVehicleBadge')}
                              </Badge>
                            </div>
                          ) : transport.vehicle ? (
                            `${transport.vehicle.brand} ${transport.vehicle.model} (${transport.vehicle.licensePlate})`
                          ) : (
                            getVehicleInfo(transport.vehicleId)
                          )}
                        </TableCell>
                        <TableCell>
                          {renderReplacementVehicleCell(transport)}
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
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => openTransportView(transport)}
                              title={t('dashboardPage.viewButton')}
                              data-testid={`button-view-transport-${transport.id}`}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            {(() => {
                              const canComplete = transport.status !== "completed" && transport.status !== "cancelled";
                              return (
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={() => handleCompleteTransportClick(transport)}
                                  disabled={!canComplete || completeTransportMutation.isPending}
                                  title={canComplete ? t('dashboardPage.markAsCompletedTitle') : t('dashboardPage.alreadyFinalizedTitle')}
                                  data-testid={`button-complete-transport-${transport.id}`}
                                >
                                  <CheckCircle className={`h-4 w-4 ${canComplete ? 'text-green-600' : ''}`} />
                                </Button>
                              );
                            })()}
                            {(() => {
                              const canMarkPickedUp = getTransportSpareStatus(transport) === 'assigned';
                              return (
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={() => { setPickupPromptMode('pickup'); setPickupPromptTransport(transport); }}
                                  disabled={!canMarkPickedUp}
                                  title={canMarkPickedUp ? t('dashboardPage.markSparePickedUpTitle') : t('dashboardPage.spareNotAssignedTitle')}
                                  data-testid={`button-mark-spare-pickup-${transport.id}`}
                                >
                                  <PackageCheck className={`h-4 w-4 ${canMarkPickedUp ? 'text-blue-600' : ''}`} />
                                </Button>
                              );
                            })()}
                            {(() => {
                              const canMarkReturned = getTransportSpareStatus(transport) === 'picked_up';
                              return (
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={() => { setPickupPromptMode('return'); setPickupPromptTransport(transport); }}
                                  disabled={!canMarkReturned}
                                  title={canMarkReturned ? t('dashboardPage.markSpareReturnedTitle') : t('dashboardPage.spareNotPickedUpTitle')}
                                  data-testid={`button-mark-spare-return-${transport.id}`}
                                >
                                  <Undo2 className={`h-4 w-4 ${canMarkReturned ? 'text-orange-600' : ''}`} />
                                </Button>
                              );
                            })()}
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => handlePrintTransportClick(transport)}
                              disabled={generateReportMutation.isPending || getTransportSpareStatus(transport) === 'tbd'}
                              title={getTransportSpareStatus(transport) === 'tbd' ? t('dashboardPage.replacementVehicleRequiredForPrint') : t('dashboardPage.printGenerateReportTitle')}
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
                              title={t('dashboardPage.editButtonTitle')}
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
                    );
                  })
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </Tabs>

      <TransportDialog
        open={transportDialogOpen}
        onOpenChange={setTransportDialogOpen}
        editingTransport={editingTransport}
      />

      <TransportViewDialog
        open={viewDialogOpen}
        onOpenChange={setViewDialogOpen}
        data={viewingData}
      />

      <SparePickupPromptDialog
        transport={pickupPromptTransport}
        onClose={() => setPickupPromptTransport(null)}
        onResolved={handlePickupPromptResolved}
        mode={pickupPromptMode}
      />

      <RouteOptimizationDialog
        open={routeDialogOpen}
        onOpenChange={setRouteDialogOpen}
        reservations={reservations}
        transports={transports}
        vehicles={vehicles}
        customers={customers}
      />

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

// One box for "the last transport" and one for "the next one" — same shape,
// just fed a different transport (or none, if there isn't one yet/anymore).
function TransportGlanceCard({ title, emptyLabel, transport, t, onView }: {
  title: string;
  emptyLabel: string;
  transport: VehicleTransport | undefined;
  t: (key: string, opts?: any) => string;
  onView: (transport: VehicleTransport) => void;
}) {
  return (
    <Card className="h-full">
      <CardHeader className="p-3 pb-1">
        <CardTitle className="text-xs font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent className="p-3 pt-0">
        {!transport ? (
          <p className="text-xs text-muted-foreground">{emptyLabel}</p>
        ) : (
          <div className="space-y-1">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <Truck className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="text-sm font-medium truncate">
                  {transport.isExternalVehicle
                    ? [transport.externalBrand, transport.externalModel].filter(Boolean).join(' ') +
                      (transport.externalLicensePlate ? ` (${formatLicensePlate(transport.externalLicensePlate)})` : '')
                    : transport.vehicle
                      ? `${transport.vehicle.brand} ${transport.vehicle.model} (${formatLicensePlate(transport.vehicle.licensePlate)})`
                      : t('dashboardPage.unknownVehicle')}
                </span>
                {transport.isExternalVehicle && (
                  <Badge variant="outline" className="text-[10px] px-1 py-0 shrink-0">{t('dashboardPage.externalVehicleBadge')}</Badge>
                )}
              </div>
              <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0" onClick={() => onView(transport)} data-testid={`button-view-glance-${transport.id}`}>
                <Eye className="h-3.5 w-3.5" />
              </Button>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <User className="h-3 w-3 shrink-0" />
              <span className="truncate">{transport.customer?.name || transport.externalOwnerName || t('dashboardPage.noCustomerForGlance')}</span>
            </div>
            {(transport.originCity || transport.destinationCity) && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <MapPin className="h-3 w-3 shrink-0" />
                <span className="truncate">{transport.originCity || '?'} → {transport.destinationCity || '?'}</span>
              </div>
            )}
            <div className="text-xs text-muted-foreground">
              {formatDate(transport.scheduledDate)}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
