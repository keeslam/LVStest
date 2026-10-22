import { invalidateByPrefix } from "@/lib/queryClient";
import { useTranslation } from "react-i18next";
import { useState, useMemo, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useSearch } from "wouter";
import { useGlobalDialog } from "@/contexts/GlobalDialogContext";
import { ReservationAddDialog } from "@/components/reservations/reservation-add-dialog";
import { CustomerAddDialog } from "@/components/customers/customer-add-dialog";
import { CustomerViewDialog } from "@/components/customers/customer-view-dialog";
import { CustomerDeleteDialog } from "@/components/customers/customer-delete-dialog";
import { RecycleBinDialog } from "@/components/recycle-bin/recycle-bin-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DataTable } from "@/components/ui/data-table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ColumnDef } from "@tanstack/react-table";
import { Customer, Driver, UserPermission } from "@shared/schema";
import type { CustomerReservationStats } from "@shared/reservation-list";
import { RequiresPermission } from "@/components/ui/requires-permission";
import { formatPhoneNumber } from "@/lib/format-utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { usePortalAccounts } from "@/hooks/use-portal-accounts";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { X, Filter, ArrowUpDown, Archive } from "lucide-react";
import { subDays } from "date-fns";
import { useHasPermission } from "@/hooks/use-has-permission";
import { customerMatchesSearch } from "@/lib/customer-search";

type EnrichedCustomer = Customer & {
  reservationCount: number;
  lastReservationDate: Date | null;
  hasActiveRentals: boolean;
  driverCount: number;
  isRecent: boolean;
  isComplete: boolean;
};

export default function CustomersIndex() {
  const { t } = useTranslation(["customers", "common"]);
  const [searchQuery, setSearchQuery] = useState("");
  const [viewDialogCustomerId, setViewDialogCustomerId] = useState<number | null>(null);
  const [sortBy, setSortBy] = useState("name-asc");
  const [filters, setFilters] = useState<Set<string>>(new Set());
  // Page-level dialog state — dialogs must not live inside table cells because
  // cells are remounted on every refetch-driven re-render, which would close an
  // open dialog on its own (e.g. seconds after a save when refreshes land).
  const [reserveCustomerId, setReserveCustomerId] = useState<string | null>(null);
  const [deleteCustomerTarget, setDeleteCustomerTarget] = useState<Customer | null>(null);
  const [recycleBinOpen, setRecycleBinOpen] = useState(false);
  const queryClient = useQueryClient();
  // B-63: a bell notification links here as /customers?customer=12&tab=drivers.
  const search = useSearch();
  const { openCustomerDialog } = useGlobalDialog();
  useEffect(() => {
    const params = new URLSearchParams(search);
    const id = Number(params.get("customer"));
    if (Number.isInteger(id) && id > 0) openCustomerDialog(id, params.get("tab") ?? undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);
  
  const { data: customers, isLoading } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
  });

  // The page's own permission is VIEW_CUSTOMERS/MANAGE_CUSTOMERS; this query
  // needs the reservation family instead (GET /api/reservations,
  // routes.ts:2829). It only enriches each row (rental-count/last-rental
  // stats, fact sheet row 4) - the customer list itself comes from
  // /api/customers above and stays intact - so a denied user just sees rows
  // without those stats, left out silently, no NoDataAccess.
  const canViewReservations = useHasPermission(UserPermission.VIEW_RESERVATIONS, UserPermission.MANAGE_RESERVATIONS);
  // BUG-205 phase B (2026-10-19): per customer the count, the latest reservation and whether a car is
  // out, worked out by the server instead of downloading every reservation.
  const { data: reservationStats } = useQuery<CustomerReservationStats[]>({
    queryKey: ["/api/reservations/customer-stats"],
    enabled: canViewReservations,
  });
  const statsByCustomer = useMemo(() => new Map((reservationStats ?? []).map((s) => [s.customerId, s])), [reservationStats]);

  const { data: drivers } = useQuery<Driver[]>({
    queryKey: ["/api/drivers"],
  });
  // B-63: the search also finds a customer by one of its drivers.
  const driverNamesByCustomer = useMemo(() => {
    const map = new Map<number, string[]>();
    for (const d of drivers ?? []) {
      if (!d.customerId) continue;
      const names = map.get(d.customerId) ?? [];
      names.push(d.displayName);
      map.set(d.customerId, names);
    }
    return map;
  }, [drivers]);

  const handleCustomerAdded = () => {
    // Refresh the customers list when a new customer is added
    invalidateByPrefix("/api/customers");
  };

  // Create enriched customer data with computed fields
  const enrichedCustomers = useMemo<EnrichedCustomer[]>(() => {
    if (!customers) return [];

    const thirtyDaysAgo = subDays(new Date(), 30);

    return customers.map(customer => {
      const stats = statsByCustomer.get(customer.id);
      // Count reservations
      const reservationCount = stats?.count ?? 0;
      // Most recent reservation (by when it was made)
      const lastReservationDate = stats?.lastCreatedAt ? new Date(stats.lastCreatedAt) : null;
      // Has an active rental (status 'picked_up')
      const hasActiveRentals = stats?.hasActiveRental ?? false;
      
      // Count drivers for this customer
      const driverCount = drivers?.filter(d => d.customerId === customer.id).length || 0;
      
      // Check if created in last 30 days
      const isRecent = customer.createdAt ? new Date(customer.createdAt) > thirtyDaysAgo : false;
      
      // Check if profile is complete (has email AND phone AND address)
      const isComplete = !!(customer.email && customer.phone && customer.address);

      return {
        ...customer,
        reservationCount,
        lastReservationDate,
        hasActiveRentals,
        driverCount,
        isRecent,
        isComplete,
      };
    });
  }, [customers, statsByCustomer, drivers]);

  // Apply sorting
  const sortedCustomers = useMemo(() => {
    const sorted = [...enrichedCustomers];

    switch (sortBy) {
      case "name-asc":
        sorted.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case "name-desc":
        sorted.sort((a, b) => b.name.localeCompare(a.name));
        break;
      case "newest":
        sorted.sort((a, b) => {
          const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return dateB - dateA;
        });
        break;
      case "oldest":
        sorted.sort((a, b) => {
          const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return dateA - dateB;
        });
        break;
      case "most-rentals":
        sorted.sort((a, b) => b.reservationCount - a.reservationCount);
        break;
      case "recent-activity":
        sorted.sort((a, b) => {
          const dateA = a.lastReservationDate?.getTime() || 0;
          const dateB = b.lastReservationDate?.getTime() || 0;
          return dateB - dateA;
        });
        break;
      case "active-rentals":
        sorted.sort((a, b) => {
          if (a.hasActiveRentals && !b.hasActiveRentals) return -1;
          if (!a.hasActiveRentals && b.hasActiveRentals) return 1;
          return a.name.localeCompare(b.name);
        });
        break;
    }

    return sorted;
  }, [enrichedCustomers, sortBy]);

  // Apply filters (AND combined)
  const filteredCustomers = useMemo(() => {
    let filtered = sortedCustomers;

    // Apply search query
    if (searchQuery) {
      filtered = filtered.filter(customer => customerMatchesSearch(customer, searchQuery, driverNamesByCustomer.get(customer.id)));
    }

    // Apply filters
    if (filters.has("recent-customers")) {
      filtered = filtered.filter(c => c.isRecent);
    }
    if (filters.has("frequent-customers")) {
      filtered = filtered.filter(c => c.reservationCount >= 3);
    }
    if (filters.has("complete-profile")) {
      filtered = filtered.filter(c => c.isComplete);
    }
    if (filters.has("incomplete-profile")) {
      filtered = filtered.filter(c => !c.isComplete);
    }
    if (filters.has("active-rentals")) {
      filtered = filtered.filter(c => c.hasActiveRentals);
    }
    if (filters.has("has-drivers")) {
      filtered = filtered.filter(c => c.driverCount > 0);
    }
    if (filters.has("business")) {
      filtered = filtered.filter(c => c.customerType === "business");
    }
    if (filters.has("individual")) {
      filtered = filtered.filter(c => c.customerType === "individual");
    }

    return filtered;
  }, [sortedCustomers, searchQuery, filters, driverNamesByCustomer]);

  // Toggle filter
  const toggleFilter = (filterKey: string) => {
    const newFilters = new Set(filters);
    if (newFilters.has(filterKey)) {
      newFilters.delete(filterKey);
    } else {
      newFilters.add(filterKey);
    }
    setFilters(newFilters);
  };

  // Clear all filters
  const clearFilters = () => {
    setFilters(new Set());
  };

  // Filter options
  const filterOptions = [
    { key: "recent-customers", label: t('indexPage.filterRecentCustomers') },
    { key: "frequent-customers", label: t('indexPage.filterFrequentCustomers') },
    { key: "complete-profile", label: t('indexPage.filterCompleteProfile') },
    { key: "incomplete-profile", label: t('indexPage.filterIncompleteProfile') },
    { key: "active-rentals", label: t('indexPage.filterActiveRentals') },
    { key: "has-drivers", label: t('indexPage.filterHasDrivers') },
    { key: "business", label: t('indexPage.filterBusiness') },
    { key: "individual", label: t('indexPage.filterIndividual') },
  ];
  
  // Define table columns with sortable headers
  const portalAccounts = usePortalAccounts();
  const columns: ColumnDef<Customer>[] = [
    {
      accessorKey: "name",
      header: () => (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setSortBy(sortBy === "name-asc" ? "name-desc" : "name-asc")}
          data-testid="header-sort-name"
          className="-ml-3"
        >
          {t('indexPage.columnName')}
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => (
        <div className="font-medium">{row.getValue("name")}</div>
      ),
    },
    {
      accessorKey: "email",
      header: t('indexPage.columnEmail'),
      cell: ({ row }) => {
        const email = row.getValue("email") as string;
        const accounts = portalAccounts.forCustomer(row.original.id);
        return (
          <span className="flex flex-wrap items-center gap-1.5">
            {email || "—"}
            {accounts.length > 0 && (
              <Badge variant="outline" className="text-xs" title={accounts.map((a) => a.email).join(", ")} data-testid={`badge-portal-${row.original.id}`}>
                {t('indexPage.portalBadge', { count: accounts.length })}
              </Badge>
            )}
          </span>
        );
      },
    },
    {
      accessorKey: "phone",
      header: t('indexPage.columnPhone'),
      cell: ({ row }) => {
        const phone = row.getValue("phone") as string;
        return phone ? formatPhoneNumber(phone) : "—";
      },
    },
    {
      accessorKey: "city",
      header: t('indexPage.columnCity'),
      cell: ({ row }) => {
        const city = row.getValue("city") as string;
        return city || "—";
      },
    },
    {
      id: "actions",
      cell: ({ row }) => {
        const customer = row.original;
        
        return (
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              data-testid={`button-view-customer-${customer.id}`}
              onClick={() => setViewDialogCustomerId(customer.id)}
            >
              {t('common:actions.view')}
            </Button>
            <RequiresPermission anyOf={[UserPermission.MANAGE_RESERVATIONS]}>
              <Button
                variant="outline"
                size="sm"
                data-testid={`button-reserve-customer-${customer.id}`}
                onClick={() => setReserveCustomerId(customer.id.toString())}
              >
                {t('indexPage.newReservationButton')}
              </Button>
            </RequiresPermission>
            <RequiresPermission anyOf={[UserPermission.MANAGE_CUSTOMERS]}>
              <Button
                variant="destructive"
                size="sm"
                data-testid={`button-delete-customer-${customer.id}`}
                onClick={() => setDeleteCustomerTarget(customer)}
              >
                {t('common:actions.delete')}
              </Button>
            </RequiresPermission>
          </div>
        );
      },
    },
  ];
  
  return (
    <div className="space-y-6">
      {/* Page-level dialogs. Kept here (not inside table cells) so they survive
          table refetches that would otherwise unmount an open dialog. */}
      {reserveCustomerId !== null && (
        <ReservationAddDialog
          key={reserveCustomerId}
          initialCustomerId={reserveCustomerId}
          open={true}
          onOpenChange={(next) => {
            if (!next) setReserveCustomerId(null);
          }}
          onSuccess={() => {
            setReserveCustomerId(null);
          }}
        />
      )}
      {deleteCustomerTarget !== null && (
        <CustomerDeleteDialog
          key={deleteCustomerTarget.id}
          customerId={deleteCustomerTarget.id}
          customerName={deleteCustomerTarget.name}
          open={true}
          onOpenChange={(next) => {
            if (!next) setDeleteCustomerTarget(null);
          }}
          onSuccess={handleCustomerAdded}
        />
      )}

      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">{t('indexPage.title')}</h1>
        <div className="flex flex-wrap gap-2">
          {/* Sub-project C (B-36, B-38): this screen's own bin; greyed out with the
              reason unless the account holds "Prullenbak beheren". */}
          <RequiresPermission anyOf={[UserPermission.MANAGE_RECYCLE_BIN]}>
            <Button
              variant="outline"
              onClick={() => setRecycleBinOpen(true)}
              data-testid="button-open-recycle-bin-customers"
            >
              <Archive className="h-4 w-4 mr-2" />
              {t('recycleBin:kinds.customer.openButton')}
            </Button>
          </RequiresPermission>
          <CustomerAddDialog onSuccess={handleCustomerAdded} />
        </div>
      </div>
      <RecycleBinDialog
        kind="customer"
        open={recycleBinOpen}
        onOpenChange={setRecycleBinOpen}
      />

      <Card>
        <CardHeader>
          <CardTitle>{t('indexPage.cardTitle')}</CardTitle>
          <CardDescription>
            {t('indexPage.cardDescription')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Search, Sort, and Filter Controls */}
            <div className="flex flex-wrap gap-4 items-center">
              <Input
                placeholder={t('indexPage.searchPlaceholder')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="max-w-sm"
                data-testid="input-search-customers"
              />

              {/* Sort Dropdown */}
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="w-[200px]" data-testid="select-sort-customers">
                  <SelectValue placeholder={t('indexPage.sortPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="name-asc">{t('indexPage.sortNameAsc')}</SelectItem>
                  <SelectItem value="name-desc">{t('indexPage.sortNameDesc')}</SelectItem>
                  <SelectItem value="newest">{t('indexPage.sortNewest')}</SelectItem>
                  <SelectItem value="oldest">{t('indexPage.sortOldest')}</SelectItem>
                  <SelectItem value="most-rentals">{t('indexPage.sortMostRentals')}</SelectItem>
                  <SelectItem value="recent-activity">{t('indexPage.sortRecentActivity')}</SelectItem>
                  <SelectItem value="active-rentals">{t('indexPage.sortActiveRentals')}</SelectItem>
                </SelectContent>
              </Select>

              {/* Filter Dropdown */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" data-testid="button-filter-customers">
                    <Filter className="h-4 w-4 mr-2" />
                    {t('indexPage.filtersButton')} {filters.size > 0 && `(${filters.size})`}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-80" align="start">
                  <div className="space-y-4">
                    <div className="font-semibold">{t('indexPage.filterCustomersTitle')}</div>
                    <div className="space-y-2">
                      {filterOptions.map((option) => (
                        <div key={option.key} className="flex items-center space-x-2">
                          <Checkbox
                            id={option.key}
                            checked={filters.has(option.key)}
                            onCheckedChange={() => toggleFilter(option.key)}
                            data-testid={`checkbox-filter-${option.key}`}
                          />
                          <label
                            htmlFor={option.key}
                            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                          >
                            {option.label}
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
              
              {/* Clear Filters Button - Only show when filters are active */}
              {filters.size > 0 && (
                <Button
                  variant="ghost"
                  onClick={clearFilters}
                  data-testid="button-clear-filters"
                >
                  {t('indexPage.clearFiltersButton')}
                  <X className="h-4 w-4 ml-2" />
                </Button>
              )}
            </div>
            
            {/* Active Filter Badges */}
            {filters.size > 0 && (
              <div className="flex flex-wrap gap-2">
                {Array.from(filters).map((filterKey) => {
                  const filterOption = filterOptions.find(opt => opt.key === filterKey);
                  return (
                    <Badge 
                      key={filterKey} 
                      variant="secondary" 
                      className="px-3 py-1"
                      data-testid={`badge-filter-${filterKey}`}
                    >
                      {filterOption?.label}
                      <button
                        onClick={() => toggleFilter(filterKey)}
                        className="ml-2 hover:text-destructive"
                        data-testid={`button-remove-filter-${filterKey}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  );
                })}
              </div>
            )}
            
            {/* Data Table */}
            {isLoading ? (
              <div className="flex justify-center items-center h-64">
                <svg className="animate-spin h-8 w-8 text-primary-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              </div>
            ) : (
              <DataTable
                columns={columns}
                data={filteredCustomers || []}
                // A click on the row opens the customer, same as the Bekijken button.
                onRowClick={(customer) => setViewDialogCustomerId(customer.id)}
              />
            )}
          </div>
        </CardContent>
      </Card>
      
      {/* Customer View Dialog - Rendered outside table to prevent state loss */}
      {viewDialogCustomerId && (
        <CustomerViewDialog 
          customerId={viewDialogCustomerId}
          open={true}
          onOpenChange={(open) => {
            if (!open) setViewDialogCustomerId(null);
          }}
        />
      )}
    </div>
  );
}
