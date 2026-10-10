import { useState, useMemo, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  RevertHandoverDialog,
  isRevertibleReservation,
  revertOpenerLabelKey,
} from "@/components/reservations/revert-handover-dialog";
import { RequiresPermission } from "@/components/ui/requires-permission";
import { ReservationViewDialog } from "@/components/reservations/reservation-view-dialog";
import { ReservationEditDialog } from "@/components/reservations/reservation-edit-dialog";
import { SpareVehicleAssignmentDialog } from "@/components/reservations/spare-vehicle-assignment-dialog";
import { ConfirmDeleteReservationDialog } from "@/components/reservations/delete-reservation-confirm";
import { cancelRightFor, isPickedUpRightRefusal, pickedUpRefusalOf } from "@/components/reservations/picked-up-cancellation";
import { Eye, Edit, Trash2, Car, History, User, Calendar, FileText, Fuel, MapPin, Phone, Building, Clock, AlertTriangle, CarFront, RotateCcw, Loader2 } from "lucide-react";
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
import { Reservation, Vehicle, UserPermission } from "@shared/schema";
import { formatLicensePlate, formatCurrency } from "@/lib/format-utils";
import { reservationMatchesSearch } from "@/lib/reservation-search";
import { Price } from "@/components/ui/price";
import { parseISO, differenceInDays } from "date-fns";
// BUG-223: Dutch dates on a Dutch screen — formatNl is date-fns' format
// with the nl locale applied, so every call below writes "11 sep 2026".
import { formatNl as format } from "@/lib/format-date-nl";

/**
 * A-5-4 / A-5-5: rows put on screen at once. The audit database had 366 active
 * reservations; rendering them all is what made the dialog open after seconds
 * with nothing to see. More are one click away, and a search always looks at the
 * whole list.
 */
export const RESERVATION_LIST_PAGE_SIZE = 50;

export type ReservationListTab = "current" | "overdue" | "history";

interface ReservationListDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Tab to open on (from a link such as /reservations?list=history). */
  initialTab?: ReservationListTab;
  /** Called with the tab the employee switches to, so the caller can keep the address in step. */
  onTabChange?: (tab: ReservationListTab) => void;
  onViewReservation?: (reservation: Reservation) => void;
  onEditReservation?: (reservation: Reservation) => void;
}

export function ReservationListDialog({ open, onOpenChange, initialTab, onTabChange, onViewReservation, onEditReservation }: ReservationListDialogProps) {
  const { t } = useTranslation("reservations");
  const [tab, setTab] = useState<ReservationListTab>(initialTab ?? "current");
  const [currentLimit, setCurrentLimit] = useState(RESERVATION_LIST_PAGE_SIZE);
  const [overdueLimit, setOverdueLimit] = useState(RESERVATION_LIST_PAGE_SIZE);
  const [historyLimit, setHistoryLimit] = useState(RESERVATION_LIST_PAGE_SIZE);
  // Opening the list (again) starts on the requested tab and the first page.
  useEffect(() => {
    if (!open) return;
    setTab(initialTab ?? "current");
    setCurrentLimit(RESERVATION_LIST_PAGE_SIZE);
    setOverdueLimit(RESERVATION_LIST_PAGE_SIZE);
    setHistoryLimit(RESERVATION_LIST_PAGE_SIZE);
  }, [open, initialTab]);
  const [currentSearch, setCurrentSearch] = useState("");
  const [historySearch, setHistorySearch] = useState("");
  const [overdueSearch, setOverdueSearch] = useState("");
  const [currentSort, setCurrentSort] = useState<{ column: string; direction: 'asc' | 'desc' }>({ column: 'pickup', direction: 'asc' });
  const [historySort, setHistorySort] = useState<{ column: string; direction: 'asc' | 'desc' }>({ column: 'return', direction: 'desc' });
  // A different search or sort starts again from the first page.
  useEffect(() => { setCurrentLimit(RESERVATION_LIST_PAGE_SIZE); }, [currentSearch, currentSort]);
  useEffect(() => { setOverdueLimit(RESERVATION_LIST_PAGE_SIZE); }, [overdueSearch]);
  useEffect(() => { setHistoryLimit(RESERVATION_LIST_PAGE_SIZE); }, [historySearch, historySort]);
  // The one reversal dialog (preview, then confirm), for the reservation with this id.
  const [revertReservationId, setRevertReservationId] = useState<number | null>(null);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [selectedViewReservationId, setSelectedViewReservationId] = useState<number | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedEditReservationId, setSelectedEditReservationId] = useState<number | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [reservationToDelete, setReservationToDelete] = useState<Reservation | null>(null);
  const [assignSpareDialogOpen, setAssignSpareDialogOpen] = useState(false);
  const [reservationToAssignSpare, setReservationToAssignSpare] = useState<Reservation | null>(null);
  const { toast } = useToast();
  
  // Track if child was opened from this list - used to reopen list when child closes
  const openedFromListRef = useRef(false);
  
  // Delete reservation mutation
  const deleteReservationMutation = useMutation({
    // B-33: `confirmPickedUp` travels as a query flag; the server insists on it for a picked-up rental.
    mutationFn: async ({ reservation, confirmPickedUp }: { reservation: Reservation; confirmPickedUp: boolean }) => {
      const response = await apiRequest(
        'DELETE',
        `/api/reservations/${reservation.id}${confirmPickedUp ? '?confirmPickedUp=true' : ''}`,
      );
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to delete reservation');
      }
      return await response.json();
    },
    onSuccess: async () => {
      await invalidateRelatedQueries('reservations');
      toast({
        title: t('listDialog.toasts.deletedTitle'),
        description: t('listDialog.toasts.deletedDescription'),
        variant: "default"
      });
    },
    onError: (error: Error, { reservation }) => {
      // 409: the row had been picked up after this list was loaded. A question,
      // not a failure - ask again, with the date and the contract the server named.
      const refusal = pickedUpRefusalOf(error);
      if (refusal) {
        setReservationToDelete({ ...reservation, status: 'picked_up', ...refusal });
        setDeleteDialogOpen(true);
        return;
      }
      toast({
        title: t('listDialog.toasts.errorTitle'),
        description: isPickedUpRightRefusal(error)
          ? t('pickedUpWarning.rightRequired')
          : error.message || t('listDialog.toasts.deleteFailedFallback'),
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
    let filtered = currentReservations.filter(res => reservationMatchesSearch(res, currentSearch));

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

  const filteredOverdueReservations = useMemo(() => {
    if (!overdueSearch.trim()) return overdueReservations;
    return overdueReservations.filter((res) => reservationMatchesSearch(res, overdueSearch));
  }, [overdueReservations, overdueSearch]);

  // Filter and sort history reservations
  const filteredHistoryReservations = useMemo(() => {
    let filtered = historyReservations.filter(res => reservationMatchesSearch(res, historySearch));

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
        return <Badge className="bg-blue-100 text-blue-800">{t('form.statuses.booked')}</Badge>;
      case 'picked_up':
        return <Badge className="bg-green-100 text-green-800">{t('form.statuses.pickedUp')}</Badge>;
      case 'returned':
        return <Badge className="bg-yellow-100 text-yellow-800">{t('form.statuses.returned')}</Badge>;
      case 'completed':
        return <Badge className="bg-gray-100 text-gray-800">{t('form.statuses.completed')}</Badge>;
      case 'cancelled':
        return <Badge className="bg-red-100 text-red-800">{t('form.statuses.cancelled')}</Badge>;
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

  const handleAssignSpare = (e: React.MouseEvent, reservation: Reservation) => {
    e.stopPropagation();
    e.preventDefault();
    setReservationToAssignSpare(reservation);
    setAssignSpareDialogOpen(true);
  };

  const confirmDelete = ({ confirmPickedUp }: { confirmPickedUp: boolean }) => {
    if (reservationToDelete) {
      deleteReservationMutation.mutate({ reservation: reservationToDelete, confirmPickedUp });
    }
    setReservationToDelete(null);
  };

  const getDuration = (startDate: string | null, endDate: string | null) => {
    if (!startDate || !endDate) return null;
    const days = differenceInDays(parseISO(endDate), parseISO(startDate)) + 1; // Inclusive of both days
    return t('form.dayCount', { count: days });
  };

  // Reservation Card Component - Compact
  const ReservationCard = ({ reservation }: { reservation: Reservation }) => {
    const duration = getDuration(reservation.startDate, reservation.endDate);
    
    return (
      <div className="bg-white border rounded-md hover:bg-gray-50 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" role="button" tabIndex={0}
        onClick={(e) => handleView(e, reservation)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") handleView(e as unknown as React.MouseEvent, reservation); }}
        data-testid={`reservation-card-${reservation.id}`}>
        <div className="p-2 grid grid-cols-[auto_1fr_1fr_1fr_1fr_auto] gap-3 items-center">
          {/* ID & Status */}
          <div className="flex items-center gap-2">
            <span className="font-mono font-bold text-sm">#{reservation.id}</span>
            {getStatusBadge(reservation.status)}
          </div>

          {/* Vehicle */}
          <div className="min-w-0">
            {reservation.placeholderSpare ? (
              <div className="bg-orange-100 text-orange-800 px-1.5 py-0.5 rounded text-xs font-mono font-bold inline-block">
                {t('indexPage.tbdBadge')}
              </div>
            ) : (
              <div className="bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded text-xs font-mono font-bold inline-block">
                {formatLicensePlate(reservation.vehicle?.licensePlate || '-')}
              </div>
            )}
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
              <span className="text-gray-500">{t('listDialog.outLabel')}</span>
              <span className="font-medium">{reservation.startDate ? format(parseISO(reservation.startDate), 'd MMM yyyy') : '-'}</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-gray-500">{t('listDialog.inLabel')}</span>
              <span className="font-medium">{reservation.endDate ? format(parseISO(reservation.endDate), 'd MMM yyyy') : '-'}</span>
              {duration && <span className="text-gray-400">({duration})</span>}
            </div>
          </div>

          {/* Mileage & Price */}
          <div className="text-xs">
            <div className="flex items-center gap-2">
              <span className="text-gray-500">{t('listDialog.kmLabel')}</span>
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
            {reservation.placeholderSpare && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs px-2 bg-orange-500 text-white hover:bg-orange-600 border-orange-500"
                onClick={(e) => handleAssignSpare(e, reservation)}
                data-testid={`assign-spare-btn-${reservation.id}`}
              >
                <CarFront className="h-3.5 w-3.5 mr-1" />
                {t('listDialog.assignVehicleButton')}
              </Button>
            )}
            {isRevertibleReservation(reservation) && (
              <RequiresPermission anyOf={[UserPermission.REVERT_HANDOVER]}>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0"
                  title={t(revertOpenerLabelKey(reservation))}
                  onClick={(e) => { e.stopPropagation(); setRevertReservationId(reservation.id); }}
                  data-testid={`button-revert-handover-${reservation.id}`}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </Button>
              </RequiresPermission>
            )}
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={(e) => handleView(e, reservation)} data-testid={`view-btn-${reservation.id}`}>
              <Eye className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={(e) => handleEdit(e, reservation)} data-testid={`edit-btn-${reservation.id}`}>
              <Edit className="h-3.5 w-3.5" />
            </Button>
            {/* B-33: a picked-up rental needs the new right, every other row manage_reservations (the route's own guards). */}
            <RequiresPermission allOf={cancelRightFor(reservation)}>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-600 hover:text-red-700 hover:bg-red-50" onClick={(e) => { e.stopPropagation(); handleDelete(reservation); }} data-testid={`delete-btn-${reservation.id}`}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </RequiresPermission>
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

  // "50 van 366" and the button for the next page; nothing when everything is on screen.
  const renderPager = (
    name: ReservationListTab,
    total: number,
    limit: number,
    setLimit: (next: number) => void,
  ) => {
    if (total === 0) return null;
    const shown = Math.min(limit, total);
    const remaining = total - shown;
    return (
      <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
        <span data-testid={`list-shown-${name}`}>{t("listDialog.shownOfTotal", { shown, total })}</span>
        {remaining > 0 && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => setLimit(limit + RESERVATION_LIST_PAGE_SIZE)}
            data-testid={`button-load-more-${name}`}
          >
            {t("listDialog.showMore", { count: Math.min(RESERVATION_LIST_PAGE_SIZE, remaining) })}
          </Button>
        )}
      </div>
    );
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="w-[95vw] max-w-[95vw] max-h-[90vh]" data-testid="dialog-reservation-list">
          <DialogHeader>
            <DialogTitle>{t('listDialog.title')}</DialogTitle>
            <DialogDescription>
              {t('listDialog.description')}
            </DialogDescription>
          </DialogHeader>

          <Tabs
            value={tab}
            onValueChange={(next) => {
              setTab(next as ReservationListTab);
              onTabChange?.(next as ReservationListTab);
            }}
            className="w-full"
          >
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="current" className="flex items-center gap-2">
                <Car className="h-4 w-4" />
                {t('listDialog.currentTab', { count: currentReservations.length })}
              </TabsTrigger>
              <TabsTrigger value="overdue" className="flex items-center gap-2">
                <AlertTriangle className={`h-4 w-4 ${overdueReservations.length > 0 ? 'text-red-500' : ''}`} />
                {t('listDialog.overdueTab', { count: overdueReservations.length })}
              </TabsTrigger>
              <TabsTrigger value="history" className="flex items-center gap-2">
                <History className="h-4 w-4" />
                {t('listDialog.historyTab', { count: historyReservations.length })}
              </TabsTrigger>
            </TabsList>

            {/* Current Reservations Tab */}
            <TabsContent value="current" className="mt-2">
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <Input
                    placeholder={t('listDialog.searchPlaceholder')}
                    value={currentSearch}
                    onChange={(e) => setCurrentSearch(e.target.value)}
                    className="flex-1 h-8 text-sm"
                    data-testid="input-current-search"
                  />
                  <div className="flex items-center gap-1 text-xs text-gray-500">
                    <Button variant={currentSort.column === 'pickup' ? 'secondary' : 'ghost'} size="sm" className="h-7 text-xs px-2" onClick={() => toggleCurrentSort('pickup')}>
                      {t('listDialog.sortPickup')} {currentSort.column === 'pickup' && (currentSort.direction === 'asc' ? '↑' : '↓')}
                    </Button>
                    <Button variant={currentSort.column === 'customer' ? 'secondary' : 'ghost'} size="sm" className="h-7 text-xs px-2" onClick={() => toggleCurrentSort('customer')}>
                      {t('listDialog.sortCustomer')} {currentSort.column === 'customer' && (currentSort.direction === 'asc' ? '↑' : '↓')}
                    </Button>
                    <Button variant={currentSort.column === 'plate' ? 'secondary' : 'ghost'} size="sm" className="h-7 text-xs px-2" onClick={() => toggleCurrentSort('plate')}>
                      {t('listDialog.sortPlate')} {currentSort.column === 'plate' && (currentSort.direction === 'asc' ? '↑' : '↓')}
                    </Button>
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {t('listDialog.activeCount', { count: filteredCurrentReservations.length })}
                  </span>
                </div>

                <div className="border rounded-md overflow-hidden">
                  <ScrollArea className="h-[calc(70vh-180px)]">
                    <div className="divide-y">
                      {isLoadingReservations ? (
                        <div className="flex items-center justify-center gap-2 py-8 text-gray-500" role="status" data-testid="reservation-list-loading">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          {t('listDialog.loading')}
                        </div>
                      ) : filteredCurrentReservations.length === 0 ? (
                        <div className="text-center py-8 text-gray-500">{t('listDialog.noActiveReservations')}</div>
                      ) : (
                        filteredCurrentReservations.slice(0, currentLimit).map((reservation) => (
                          <ReservationCard key={reservation.id} reservation={reservation} />
                        ))
                      )}
                    </div>
                  </ScrollArea>
                </div>
                {renderPager("current", filteredCurrentReservations.length, currentLimit, setCurrentLimit)}
              </div>
            </TabsContent>

            {/* Overdue Tab */}
            <TabsContent value="overdue" className="mt-2">
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <Input
                    placeholder={t('listDialog.searchPlaceholder')}
                    value={overdueSearch}
                    onChange={(e) => setOverdueSearch(e.target.value)}
                    className="flex-1 h-8 text-sm"
                    data-testid="input-overdue-search"
                  />
                  <span className="text-xs text-muted-foreground whitespace-nowrap">{filteredOverdueReservations.length} / {overdueReservations.length}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-red-600 font-medium flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4" />
                    {t('listDialog.overdueHint')}
                  </span>
                </div>

                <div className="border rounded-md overflow-hidden">
                  <ScrollArea className="h-[calc(70vh-180px)]">
                    <div className="divide-y">
                      {filteredOverdueReservations.length === 0 ? (
                        <div className="text-center py-8 text-gray-500">{t('listDialog.noOverdueReservations')}</div>
                      ) : (
                        filteredOverdueReservations.slice(0, overdueLimit).map((reservation) => {
                          const daysOverdue = reservation.endDate 
                            ? differenceInDays(new Date(), parseISO(reservation.endDate))
                            : 0;
                          
                          return (
                            <div
                              key={reservation.id}
                              className="p-3 bg-red-50 hover:bg-red-100 transition-colors cursor-pointer"
                              role="button" tabIndex={0}
                              onClick={(e) => handleView(e, reservation)}
                              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") handleView(e as unknown as React.MouseEvent, reservation); }}
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
                                      {t('listDialog.daysOverdue', { count: daysOverdue })}
                                    </Badge>
                                  </div>
                                  <div className="flex items-center gap-4 text-sm text-gray-600">
                                    <span className="flex items-center gap-1">
                                      <User className="h-3 w-3" />
                                      {reservation.customer?.name || t('listDialog.unknownCustomer')}
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
                                      {t('listDialog.dueLabel', { date: reservation.endDate ? format(parseISO(reservation.endDate), 'd MMM') : 'N/A' })}
                                    </span>
                                  </div>
                                </div>
                                <div className="flex gap-1">
                                  <Button size="sm" variant="outline" onClick={(e) => handleView(e, reservation)}>
                                    <Eye className="h-3 w-3 mr-1" />
                                    {t('listDialog.viewButton')}
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
                {renderPager("overdue", filteredOverdueReservations.length, overdueLimit, setOverdueLimit)}
              </div>
            </TabsContent>

            {/* History Tab */}
            <TabsContent value="history" className="mt-2">
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <Input
                    placeholder={t('listDialog.searchPlaceholder')}
                    value={historySearch}
                    onChange={(e) => setHistorySearch(e.target.value)}
                    className="flex-1 h-8 text-sm"
                    data-testid="input-history-search"
                  />
                  <div className="flex items-center gap-1 text-xs text-gray-500">
                    <Button variant={historySort.column === 'return' ? 'secondary' : 'ghost'} size="sm" className="h-7 text-xs px-2" onClick={() => toggleHistorySort('return')}>
                      {t('listDialog.sortReturn')} {historySort.column === 'return' && (historySort.direction === 'asc' ? '↑' : '↓')}
                    </Button>
                    <Button variant={historySort.column === 'customer' ? 'secondary' : 'ghost'} size="sm" className="h-7 text-xs px-2" onClick={() => toggleHistorySort('customer')}>
                      {t('listDialog.sortCustomer')} {historySort.column === 'customer' && (historySort.direction === 'asc' ? '↑' : '↓')}
                    </Button>
                    <Button variant={historySort.column === 'plate' ? 'secondary' : 'ghost'} size="sm" className="h-7 text-xs px-2" onClick={() => toggleHistorySort('plate')}>
                      {t('listDialog.sortPlate')} {historySort.column === 'plate' && (historySort.direction === 'asc' ? '↑' : '↓')}
                    </Button>
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {t('listDialog.completedCount', { count: filteredHistoryReservations.length })}
                  </span>
                </div>

                <div className="border rounded-md overflow-hidden">
                  <ScrollArea className="h-[calc(70vh-180px)]">
                    <div className="divide-y">
                      {isLoadingReservations ? (
                        <div className="flex items-center justify-center gap-2 py-8 text-gray-500" role="status" data-testid="reservation-list-loading">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          {t('listDialog.loading')}
                        </div>
                      ) : filteredHistoryReservations.length === 0 ? (
                        <div className="text-center py-8 text-gray-500">{t('listDialog.noCompletedReservations')}</div>
                      ) : (
                        filteredHistoryReservations.slice(0, historyLimit).map((reservation) => (
                          <ReservationCard key={reservation.id} reservation={reservation} />
                        ))
                      )}
                    </div>
                  </ScrollArea>
                </div>
                {renderPager("history", filteredHistoryReservations.length, historyLimit, setHistoryLimit)}
              </div>
            </TabsContent>
          </Tabs>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {t('listDialog.closeButton')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reversal dialog: preview of what happens, then confirm (sub-project C, Task 4) */}
      {revertReservationId !== null && (
        <RevertHandoverDialog
          open
          onOpenChange={(isOpen) => {
            if (!isOpen) setRevertReservationId(null);
          }}
          reservationId={revertReservationId}
          onReverted={() => {
            invalidateByPrefix('/api/reservations');
          }}
        />
      )}

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
            title: t('listDialog.toasts.updatedTitle'),
            description: t('listDialog.toasts.updatedDescription'),
          });
        }}
      />

      {/* Assign Spare Vehicle Dialog — turns a TBD placeholder into an assigned
          spare, right from this list, same dialog the "Beheer vervangende
          voertuigen" widget uses. */}
      {reservationToAssignSpare && (
        <SpareVehicleAssignmentDialog
          open={assignSpareDialogOpen}
          onOpenChange={(isOpen) => {
            setAssignSpareDialogOpen(isOpen);
            if (!isOpen) setReservationToAssignSpare(null);
          }}
          placeholderReservations={[reservationToAssignSpare]}
        />
      )}

      {/* Delete Reservation Confirmation Dialog */}
      <ConfirmDeleteReservationDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        reservation={reservationToDelete}
        title={t('listDialog.deleteDialog.title')}
        description={t('listDialog.deleteDialog.description', { id: reservationToDelete?.id })}
        confirmLabel={t('listDialog.deleteDialog.confirmLabel')}
        onConfirm={confirmDelete}
        onCancel={() => setReservationToDelete(null)}
      />
    </>
  );
}
