import { useState, useMemo, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { StatusChangeDialog } from "@/components/reservations/status-change-dialog";
import { ReservationViewDialog } from "@/components/reservations/reservation-view-dialog";
import { ReservationEditDialog } from "@/components/reservations/reservation-edit-dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Eye, Edit, Trash2, Car, History, User, Calendar, FileText, Fuel, MapPin, Phone, Building, Clock, AlertTriangle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient, invalidateRelatedQueries , invalidateByPrefix } from "@/lib/queryClient";
import { Reservation, Vehicle } from "@shared/schema";
import { formatLicensePlate, formatCurrency } from "@/lib/format-utils";
import { Price } from "@/components/ui/price";
import { format, parseISO, differenceInDays } from "date-fns";

interface ReservationListDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onViewReservation?: (reservation: Reservation) => void;
  onEditReservation?: (reservation: Reservation) => void;
}

export function ReservationListDialog({ open, onOpenChange, onViewReservation, onEditReservation }: ReservationListDialogProps) {
  const [currentSearch, setCurrentSearch] = useState("");
  const [historySearch, setHistorySearch] = useState("");
  const [currentSort, setCurrentSort] = useState<{ column: string; direction: 'asc' | 'desc' }>({ column: 'pickup', direction: 'asc' });
  const [historySort, setHistorySort] = useState<{ column: string; direction: 'asc' | 'desc' }>({ column: 'return', direction: 'desc' });
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [selectedReservation, setSelectedReservation] = useState<Reservation | null>(null);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [selectedViewReservationId, setSelectedViewReservationId] = useState<number | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedEditReservationId, setSelectedEditReservationId] = useState<number | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [reservationToDelete, setReservationToDelete] = useState<Reservation | null>(null);
  const { toast } = useToast();
  
  // Track if child was opened from this list - used to reopen list when child closes
  const openedFromListRef = useRef(false);
  
  // Delete reservation mutation
  const deleteReservationMutation = useMutation({
    mutationFn: async (reservationId: number) => {
      const response = await apiRequest('DELETE', `/api/reservations/${reservationId}`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to delete reservation');
      }
      return await response.json();
    },
    onSuccess: async () => {
      await invalidateRelatedQueries('reservations');
      toast({
        title: "Reservation deleted",
        description: "The reservation has been successfully deleted.",
        variant: "default"
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete reservation",
        variant: "destructive"
      });
    }
  });
  
  // Fetch reservations
  const { data: reservations, isLoading: isLoadingReservations } = useQuery<Reservation[]>({
    queryKey: ["/api/reservations"],
    enabled: open,
  });

  // Fetch overdue reservations
  const { data: overdueReservations = [] } = useQuery<Reservation[]>({
    queryKey: ['/api/reservations/overdue'],
    enabled: open,
  });

  // Split reservations into current and history
  const { currentReservations, historyReservations } = useMemo(() => {
    if (!reservations) return { currentReservations: [], historyReservations: [] };
    
    const current: Reservation[] = [];
    const history: Reservation[] = [];
    
    reservations.forEach(res => {
      if (res.type === 'maintenance_block') return;
      
      if (res.status === 'booked' || res.status === 'picked_up') {
        current.push(res);
      } else if (res.status === 'completed' || res.status === 'returned' || res.status === 'cancelled') {
        history.push(res);
      }
    });
    
    return { currentReservations: current, historyReservations: history };
  }, [reservations]);

  // Toggle sort helper
  const toggleCurrentSort = (column: string) => {
    setCurrentSort(prev => ({
      column,
      direction: prev.column === column && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const toggleHistorySort = (column: string) => {
    setHistorySort(prev => ({
      column,
      direction: prev.column === column && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  // Filter and sort current reservations
  const filteredCurrentReservations = useMemo(() => {
    let filtered = currentReservations.filter(res => {
      if (!currentSearch) return true;
      const search = currentSearch.toLowerCase();
      return (
        res.vehicle?.licensePlate?.toLowerCase().includes(search) ||
        res.vehicle?.brand?.toLowerCase().includes(search) ||
        res.vehicle?.model?.toLowerCase().includes(search) ||
        res.customer?.companyName?.toLowerCase().includes(search) ||
        res.customer?.name?.toLowerCase().includes(search) ||
        res.contractNumber?.toLowerCase().includes(search) ||
        res.id.toString().includes(search)
      );
    });

    return filtered.sort((a, b) => {
      const dir = currentSort.direction === 'asc' ? 1 : -1;
      switch (currentSort.column) {
        case 'pickup':
          return dir * (new Date(a.startDate || 0).getTime() - new Date(b.startDate || 0).getTime());
        case 'return':
          return dir * (new Date(a.endDate || 0).getTime() - new Date(b.endDate || 0).getTime());
        case 'customer':
          return dir * (a.customer?.companyName || a.customer?.name || '').localeCompare(b.customer?.companyName || b.customer?.name || '');
        case 'plate':
          return dir * (a.vehicle?.licensePlate || '').localeCompare(b.vehicle?.licensePlate || '');
        default:
          return dir * (new Date(a.startDate || 0).getTime() - new Date(b.startDate || 0).getTime());
      }
    });
  }, [currentReservations, currentSearch, currentSort]);

  // Filter and sort history reservations
  const filteredHistoryReservations = useMemo(() => {
    let filtered = historyReservations.filter(res => {
      if (!historySearch) return true;
      const search = historySearch.toLowerCase();
      return (
        res.vehicle?.licensePlate?.toLowerCase().includes(search) ||
        res.vehicle?.brand?.toLowerCase().includes(search) ||
        res.vehicle?.model?.toLowerCase().includes(search) ||
        res.customer?.companyName?.toLowerCase().includes(search) ||
        res.customer?.name?.toLowerCase().includes(search) ||
        res.contractNumber?.toLowerCase().includes(search) ||
        res.id.toString().includes(search)
      );
    });

    return filtered.sort((a, b) => {
      const dir = historySort.direction === 'asc' ? 1 : -1;
      switch (historySort.column) {
        case 'pickup':
          return dir * (new Date(a.startDate || 0).getTime() - new Date(b.startDate || 0).getTime());
        case 'return':
          return dir * (new Date(a.endDate || 0).getTime() - new Date(b.endDate || 0).getTime());
        case 'customer':
          return dir * (a.customer?.companyName || a.customer?.name || '').localeCompare(b.customer?.companyName || b.customer?.name || '');
        case 'plate':
          return dir * (a.vehicle?.licensePlate || '').localeCompare(b.vehicle?.licensePlate || '');
        default:
          return dir * (new Date(b.endDate || 0).getTime() - new Date(a.endDate || 0).getTime());
      }
    });
  }, [historyReservations, historySearch, historySort]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'booked':
        return <Badge className="bg-blue-100 text-blue-800">Booked</Badge>;
      case 'picked_up':
        return <Badge className="bg-green-100 text-green-800">Picked Up</Badge>;
      case 'returned':
        return <Badge className="bg-yellow-100 text-yellow-800">Returned</Badge>;
      case 'completed':
        return <Badge className="bg-gray-100 text-gray-800">Completed</Badge>;
      case 'cancelled':
        return <Badge className="bg-red-100 text-red-800">Cancelled</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const handleView = (e: React.MouseEvent, reservation: Reservation) => {
    e.stopPropagation();
    e.preventDefault();
    
    if (onViewReservation) {
      onViewReservation(reservation);
    } else {
      // Close parent list, mark that we opened from list, then open child
      openedFromListRef.current = true;
      onOpenChange(false);
      setSelectedViewReservationId(reservation.id);
      setViewDialogOpen(true);
    }
  };

  const handleEdit = (e: React.MouseEvent, reservation: Reservation) => {
    e.stopPropagation();
    e.preventDefault();
    
    if (onEditReservation) {
      onEditReservation(reservation);
    } else {
      // Close parent list, mark that we opened from list, then open child
      openedFromListRef.current = true;
      onOpenChange(false);
      setSelectedEditReservationId(reservation.id);
      setEditDialogOpen(true);
    }
  };

  const handleDelete = (reservation: Reservation) => {
    setReservationToDelete(reservation);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (reservationToDelete) {
      deleteReservationMutation.mutate(reservationToDelete.id);
    }
    setReservationToDelete(null);
  };

  const getDuration = (startDate: string | null, endDate: string | null) => {
    if (!startDate || !endDate) return null;
    const days = differenceInDays(parseISO(endDate), parseISO(startDate)) + 1; // Inclusive of both days
    return days === 1 ? '1 day' : `${days} days`;
  };

  // Reservation Card Component - Compact
  const ReservationCard = ({ reservation }: { reservation: Reservation }) => {
    const duration = getDuration(reservation.startDate, reservation.endDate);
    
    return (
      <div className="bg-white border rounded-md hover:bg-gray-50 transition-colors" data-testid={`reservation-card-${reservation.id}`}>
        <div className="p-2 grid grid-cols-[auto_1fr_1fr_1fr_1fr_auto] gap-3 items-center">
          {/* ID & Status */}
          <div className="flex items-center gap-2">
            <span className="font-mono font-bold text-sm">#{reservation.id}</span>
            {getStatusBadge(reservation.status)}
          </div>

          {/* Vehicle */}
          <div className="min-w-0">
            <div className="bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded text-xs font-mono font-bold inline-block">
              {formatLicensePlate(reservation.vehicle?.licensePlate || '-')}
            </div>
            <div className="text-xs text-gray-600 truncate">{reservation.vehicle?.brand} {reservation.vehicle?.model}</div>
          </div>

          {/* Customer */}
          <div className="min-w-0">
            <div className="text-sm font-medium truncate">
              {reservation.customer?.companyName || reservation.customer?.name || '-'}
            </div>
            {reservation.contractNumber && (
              <div className="text-xs text-gray-500 font-mono">{reservation.contractNumber}</div>
            )}
          </div>

          {/* Dates */}
          <div className="text-xs">
            <div className="flex items-center gap-1">
              <span className="text-gray-500">Out:</span>
              <span className="font-medium">{reservation.startDate ? format(parseISO(reservation.startDate), 'dd MMM yy') : '-'}</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-gray-500">In:</span>
              <span className="font-medium">{reservation.endDate ? format(parseISO(reservation.endDate), 'dd MMM yy') : '-'}</span>
              {duration && <span className="text-gray-400">({duration})</span>}
            </div>
          </div>

          {/* Mileage & Price */}
          <div className="text-xs">
            <div className="flex items-center gap-2">
              <span className="text-gray-500">KM:</span>
              <span className="font-mono">{reservation.pickupMileage?.toLocaleString() || '-'}</span>
              <span className="text-gray-400">→</span>
              <span className="font-mono">{reservation.returnMileage?.toLocaleString() || '-'}</span>
            </div>
            {reservation.totalPrice && (
              <div className="font-semibold text-green-700">{<Price value={Number(reservation.totalPrice)} />}</div>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-0.5">
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={(e) => handleView(e, reservation)} data-testid={`view-btn-${reservation.id}`}>
              <Eye className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={(e) => handleEdit(e, reservation)} data-testid={`edit-btn-${reservation.id}`}>
              <Edit className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-600 hover:text-red-700 hover:bg-red-50" onClick={() => handleDelete(reservation)} data-testid={`delete-btn-${reservation.id}`}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
        
        {/* Notes - inline if present */}
        {reservation.notes && (
          <div className="px-2 pb-2 -mt-1">
            <div className="text-xs text-gray-500 bg-gray-50 rounded px-2 py-1 italic truncate">{reservation.notes}</div>
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="w-[95vw] max-w-[95vw] max-h-[90vh]" data-testid="dialog-reservation-list">
          <DialogHeader>
            <DialogTitle>Reservations</DialogTitle>
            <DialogDescription>
              View and manage all reservations
            </DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="current" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="current" className="flex items-center gap-2">
                <Car className="h-4 w-4" />
                Current ({currentReservations.length})
              </TabsTrigger>
              <TabsTrigger value="overdue" className="flex items-center gap-2">
                <AlertTriangle className={`h-4 w-4 ${overdueReservations.length > 0 ? 'text-red-500' : ''}`} />
                Overdue ({overdueReservations.length})
              </TabsTrigger>
              <TabsTrigger value="history" className="flex items-center gap-2">
                <History className="h-4 w-4" />
                History ({historyReservations.length})
              </TabsTrigger>
            </TabsList>

            {/* Current Reservations Tab */}
            <TabsContent value="current" className="mt-2">
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <Input
                    placeholder="Search by plate, customer, contract, ID..."
                    value={currentSearch}
                    onChange={(e) => setCurrentSearch(e.target.value)}
                    className="flex-1 h-8 text-sm"
                    data-testid="input-current-search"
                  />
                  <div className="flex items-center gap-1 text-xs text-gray-500">
                    <Button variant={currentSort.column === 'pickup' ? 'secondary' : 'ghost'} size="sm" className="h-7 text-xs px-2" onClick={() => toggleCurrentSort('pickup')}>
                      Pickup {currentSort.column === 'pickup' && (currentSort.direction === 'asc' ? '↑' : '↓')}
                    </Button>
                    <Button variant={currentSort.column === 'customer' ? 'secondary' : 'ghost'} size="sm" className="h-7 text-xs px-2" onClick={() => toggleCurrentSort('customer')}>
                      Customer {currentSort.column === 'customer' && (currentSort.direction === 'asc' ? '↑' : '↓')}
                    </Button>
                    <Button variant={currentSort.column === 'plate' ? 'secondary' : 'ghost'} size="sm" className="h-7 text-xs px-2" onClick={() => toggleCurrentSort('plate')}>
                      Plate {currentSort.column === 'plate' && (currentSort.direction === 'asc' ? '↑' : '↓')}
                    </Button>
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {filteredCurrentReservations.length} active
                  </span>
                </div>
                
                <div className="border rounded-md overflow-hidden">
                  <ScrollArea className="h-[calc(70vh-180px)]">
                    <div className="divide-y">
                      {isLoadingReservations ? (
                        <div className="text-center py-8 text-gray-500">Loading...</div>
                      ) : filteredCurrentReservations.length === 0 ? (
                        <div className="text-center py-8 text-gray-500">No active reservations found</div>
                      ) : (
                        filteredCurrentReservations.map((reservation) => (
                          <ReservationCard key={reservation.id} reservation={reservation} />
                        ))
                      )}
                    </div>
                  </ScrollArea>
                </div>
              </div>
            </TabsContent>

            {/* Overdue Tab */}
            <TabsContent value="overdue" className="mt-2">
              <div className="space-y-2">
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-sm text-red-600 font-medium flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4" />
                    Vehicles that should have been returned but customer still has them
                  </span>
                </div>
                
                <div className="border rounded-md overflow-hidden">
                  <ScrollArea className="h-[calc(70vh-180px)]">
                    <div className="divide-y">
                      {overdueReservations.length === 0 ? (
                        <div className="text-center py-8 text-gray-500">No overdue reservations</div>
                      ) : (
                        overdueReservations.map((reservation) => {
                          const daysOverdue = reservation.endDate 
                            ? differenceInDays(new Date(), parseISO(reservation.endDate))
                            : 0;
                          
                          return (
                            <div 
                              key={reservation.id}
                              className="p-3 bg-red-50 hover:bg-red-100 transition-colors"
                              data-testid={`overdue-item-${reservation.id}`}
                            >
                              <div className="flex items-start justify-between">
                                <div className="flex-1">
                                  <div className="flex items-center gap-2 mb-1">
                                    <span className="font-medium">
                                      {formatLicensePlate(reservation.vehicle?.licensePlate || '')}
                                    </span>
                                    <span className="text-sm text-gray-600">
                                      {reservation.vehicle?.brand} {reservation.vehicle?.model}
                                    </span>
                                    <Badge variant="destructive" className="text-xs">
                                      {daysOverdue} day{daysOverdue !== 1 ? 's' : ''} overdue
                                    </Badge>
                                  </div>
                                  <div className="flex items-center gap-4 text-sm text-gray-600">
                                    <span className="flex items-center gap-1">
                                      <User className="h-3 w-3" />
                                      {reservation.customer?.name || 'Unknown'}
                                    </span>
                                    {reservation.customer?.phone && (
                                      <a 
                                        href={`tel:${reservation.customer.phone}`}
                                        className="flex items-center gap-1 text-blue-600 hover:underline"
                                      >
                                        <Phone className="h-3 w-3" />
                                        {reservation.customer.phone}
                                      </a>
                                    )}
                                    <span className="flex items-center gap-1">
                                      <Calendar className="h-3 w-3" />
                                      Due: {reservation.endDate ? format(parseISO(reservation.endDate), 'MMM d') : 'N/A'}
                                    </span>
                                  </div>
                                </div>
                                <div className="flex gap-1">
                                  <Button size="sm" variant="outline" onClick={(e) => handleView(e, reservation)}>
                                    <Eye className="h-3 w-3 mr-1" />
                                    View
                                  </Button>
                                </div>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </ScrollArea>
                </div>
              </div>
            </TabsContent>

            {/* History Tab */}
            <TabsContent value="history" className="mt-2">
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <Input
                    placeholder="Search by plate, customer, contract, ID..."
                    value={historySearch}
                    onChange={(e) => setHistorySearch(e.target.value)}
                    className="flex-1 h-8 text-sm"
                    data-testid="input-history-search"
                  />
                  <div className="flex items-center gap-1 text-xs text-gray-500">
                    <Button variant={historySort.column === 'return' ? 'secondary' : 'ghost'} size="sm" className="h-7 text-xs px-2" onClick={() => toggleHistorySort('return')}>
                      Return {historySort.column === 'return' && (historySort.direction === 'asc' ? '↑' : '↓')}
                    </Button>
                    <Button variant={historySort.column === 'customer' ? 'secondary' : 'ghost'} size="sm" className="h-7 text-xs px-2" onClick={() => toggleHistorySort('customer')}>
                      Customer {historySort.column === 'customer' && (historySort.direction === 'asc' ? '↑' : '↓')}
                    </Button>
                    <Button variant={historySort.column === 'plate' ? 'secondary' : 'ghost'} size="sm" className="h-7 text-xs px-2" onClick={() => toggleHistorySort('plate')}>
                      Plate {historySort.column === 'plate' && (historySort.direction === 'asc' ? '↑' : '↓')}
                    </Button>
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {filteredHistoryReservations.length} completed
                  </span>
                </div>
                
                <div className="border rounded-md overflow-hidden">
                  <ScrollArea className="h-[calc(70vh-180px)]">
                    <div className="divide-y">
                      {isLoadingReservations ? (
                        <div className="text-center py-8 text-gray-500">Loading...</div>
                      ) : filteredHistoryReservations.length === 0 ? (
                        <div className="text-center py-8 text-gray-500">No completed reservations found</div>
                      ) : (
                        filteredHistoryReservations.map((reservation) => (
                          <ReservationCard key={reservation.id} reservation={reservation} />
                        ))
                      )}
                    </div>
                  </ScrollArea>
                </div>
              </div>
            </TabsContent>
          </Tabs>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Status Change Dialog */}
      <StatusChangeDialog
        open={statusDialogOpen}
        onOpenChange={setStatusDialogOpen}
        reservationId={selectedReservation?.id || 0}
        initialStatus={selectedReservation?.status || "booked"}
        initialFuelData={selectedReservation ? {
          fuelLevelPickup: selectedReservation.fuelLevelPickup,
          fuelLevelReturn: selectedReservation.fuelLevelReturn,
          fuelCost: selectedReservation.fuelCost ? Number(selectedReservation.fuelCost) : null,
          fuelCardNumber: selectedReservation.fuelCardNumber,
          fuelNotes: selectedReservation.fuelNotes,
        } : undefined}
        onStatusChanged={() => {
          invalidateByPrefix('/api/reservations');
        }}
      />

      {/* Reservation View Dialog */}
      <ReservationViewDialog
        open={viewDialogOpen}
        onOpenChange={(isOpen) => {
          setViewDialogOpen(isOpen);
          // Reopen parent list when child closes (if opened from list)
          if (!isOpen && openedFromListRef.current) {
            openedFromListRef.current = false;
            setTimeout(() => onOpenChange(true), 50);
          }
        }}
        reservationId={selectedViewReservationId}
        onEdit={(reservationId) => {
          // Keep the flag set since we're going to edit
          setSelectedEditReservationId(reservationId);
          setViewDialogOpen(false);
          setEditDialogOpen(true);
        }}
      />

      {/* Reservation Edit Dialog */}
      <ReservationEditDialog
        open={editDialogOpen}
        onOpenChange={(isOpen) => {
          setEditDialogOpen(isOpen);
          // Reopen parent list when child closes (if opened from list)
          if (!isOpen && openedFromListRef.current) {
            openedFromListRef.current = false;
            setTimeout(() => onOpenChange(true), 50);
          }
        }}
        reservationId={selectedEditReservationId}
        onSuccess={(updatedReservation) => {
          invalidateRelatedQueries('reservations', {
            id: updatedReservation.id,
            vehicleId: updatedReservation.vehicleId ?? undefined,
            customerId: updatedReservation.customerId ?? undefined
          });
          toast({
            title: "Reservation updated",
            description: "The reservation has been successfully updated",
          });
        }}
      />

      {/* Delete Reservation Confirmation Dialog */}
      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title="Delete Reservation"
        description={`Are you sure you want to delete reservation #${reservationToDelete?.id}? This action cannot be undone.`}
        variant="danger"
        confirmLabel="Delete"
        onConfirm={confirmDelete}
        onCancel={() => setReservationToDelete(null)}
      />
    </>
  );
}
