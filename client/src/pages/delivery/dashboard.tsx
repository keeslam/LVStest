import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
import { formatDate, formatCurrency } from "@/lib/format-utils";
import { Reservation, Customer, Vehicle, VehicleTransport } from "@shared/schema";
import { apiRequest, invalidateByPrefix } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { TransportDialog } from "@/components/delivery/transport-dialog";
import { Truck, MapPin, Clock, CheckCircle, Package, Navigation, Plus, Pencil, Trash2, Euro, Route, Receipt } from "lucide-react";
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
              <TableCell>{reservation.deliveryFee ? formatCurrency(parseFloat(reservation.deliveryFee.toString())) : '-'}</TableCell>
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

  const filteredTransports = useMemo(() => {
    return transports.filter(t => {
      if (transportTypeFilter !== "all" && t.transportType !== transportTypeFilter) return false;
      if (transportStatusFilter !== "all" && t.status !== transportStatusFilter) return false;
      return true;
    });
  }, [transports, transportTypeFilter, transportStatusFilter]);

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

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Delivery Dashboard</h1>
          <p className="text-muted-foreground">Manage vehicle delivery, transport and pickup services</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" data-testid="button-route-optimization">
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

      {/* Delivery Tabs */}
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
          <TabsTrigger value="transports" data-testid="tab-transports">
            Transports ({transports.length})
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

        <TabsContent value="transports" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Toll Cost This Month</CardTitle>
                <Route className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="stat-toll-cost-month">{formatCurrency(tollCostThisMonth)}</div>
                <p className="text-xs text-muted-foreground">What we've paid in tolls</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Pending Customer Billing</CardTitle>
                <Receipt className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="stat-pending-billing">{formatCurrency(pendingBillableAmount)}</div>
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
                  <CardDescription>Swaps, tows, repossessions and other standalone vehicle movements</CardDescription>
                </div>
                <div className="flex flex-wrap gap-2">
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
                      <TableCell colSpan={9} className="text-center py-4">Loading transports...</TableCell>
                    </TableRow>
                  ) : filteredTransports.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center py-4">No transports found</TableCell>
                    </TableRow>
                  ) : (
                    filteredTransports.map((transport) => (
                      <TableRow key={transport.id} data-testid={`transport-row-${transport.id}`}>
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
                        <TableCell>{transport.tollCost ? formatCurrency(Number(transport.tollCost)) : '-'}</TableCell>
                        <TableCell>
                          {transport.billable ? (
                            <div className="flex items-center gap-1 text-sm">
                              <Euro className="h-3 w-3 text-muted-foreground shrink-0" />
                              {transport.billableAmount ? formatCurrency(Number(transport.billableAmount)) : '-'}
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
    </div>
  );
}
