import { describeApiError } from "@/lib/api-error";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Ban, Plus, Trash2, Pencil, X } from "lucide-react";
import type { Customer } from "@shared/schema";
import type { PortalBlacklistEntryDto } from "@shared/portal-types";
import { apiRequest } from "@/lib/queryClient";
import { formatLicensePlate, formatDate } from "@/lib/format-utils";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SearchListPicker } from "@/components/ui/search-list-picker";
import { CustomerSearchPicker } from "@/components/customers/customer-search-picker";
import { SortableHead, nextSort, stableSort, type SortState } from "@/components/ui/sortable-head";
import { TablePager, usePager } from "@/components/ui/table-pager";
import { useToast } from "@/hooks/use-toast";
import { useCanManagePortal } from "./accounts-table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface VehicleRow { id: number; licensePlate: string; brand: string; model: string; offeredOnline: boolean }
const KEY = ["/api/portal-admin/blacklist"];

/** Anything that shows blacklist data: this list, the customer dialog, the vehicle dialog and the online-vehicles list. */
const touchesBlacklist = (key: readonly unknown[]) => key.some((k) => typeof k === "string" && (k.includes("blacklist") || k.includes("vehicles-online")));

export type BlacklistSortKey = "plate" | "vehicle" | "customer" | "reason" | "since";
/** Eén klant of één voertuig uitgelicht: klik op de naam of het kenteken in een rij. */
export type BlacklistFocus = { kind: "customer"; id: number; label: string } | { kind: "vehicle"; id: number; label: string } | null;
export interface BlacklistFilters { search: string; onlyOnline: boolean; focus: BlacklistFocus }

export function filterBlacklist(rows: PortalBlacklistEntryDto[], f: BlacklistFilters): PortalBlacklistEntryDto[] {
  const q = f.search.trim().toLowerCase();
  return rows.filter((r) =>
    (!f.onlyOnline || r.offeredOnline) &&
    (!f.focus || (f.focus.kind === "customer" ? r.customerId === f.focus.id : r.vehicleId === f.focus.id)) &&
    (!q || `${r.licensePlate} ${formatLicensePlate(r.licensePlate)} ${r.brand} ${r.model} ${r.customerName} ${r.reason ?? ""}`.toLowerCase().includes(q)),
  );
}

export function sortBlacklist(rows: PortalBlacklistEntryDto[], sort: SortState<BlacklistSortKey>): PortalBlacklistEntryDto[] {
  const vehicle = (r: PortalBlacklistEntryDto) => `${r.brand} ${r.model}`.toLocaleLowerCase();
  const compare = (a: PortalBlacklistEntryDto, b: PortalBlacklistEntryDto): number => {
    switch (sort.key) {
      case "plate": return a.licensePlate.localeCompare(b.licensePlate, "nl");
      case "vehicle": return vehicle(a).localeCompare(vehicle(b), "nl") || a.licensePlate.localeCompare(b.licensePlate, "nl");
      case "customer": return a.customerName.localeCompare(b.customerName, "nl", { sensitivity: "base" }) || vehicle(a).localeCompare(vehicle(b), "nl");
      case "reason": return (a.reason ?? "").localeCompare(b.reason ?? "", "nl", { sensitivity: "base" });
      case "since": return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    }
  };
  return stableSort(rows, compare, sort.dir);
}

/**
 * Every vehicle/customer block in one place. Same table the customer and
 * vehicle dialogs edit, so a block made here is respected there and vice versa.
 * Gebouwd voor duizenden blokkades: zoeken, filter op online voertuigen, één
 * klant of voertuig uitlichten, sorteerbare koppen en pagina's van 50.
 */
export function BlacklistTable({ initialPlate, initialCustomerId }: { initialPlate?: string; initialCustomerId?: number }) {
  const { t } = useTranslation("portal");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const canManage = useCanManagePortal();
  const [filters, setFilters] = useState<BlacklistFilters>({ search: initialPlate ?? "", onlyOnline: false, focus: null });
  const [sort, setSort] = useState<SortState<BlacklistSortKey>>({ key: "since", dir: "desc" });
  const [adding, setAdding] = useState(false);
  /** Entry being edited in the same form; null while adding. */
  const [editing, setEditing] = useState<PortalBlacklistEntryDto | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<PortalBlacklistEntryDto | null>(null);
  const [vehicleId, setVehicleId] = useState<number | null>(null);
  const [customerId, setCustomerId] = useState<number | null>(initialCustomerId ?? null);
  const [reason, setReason] = useState("");
  const formOpen = adding || editing !== null;
  const startEdit = (r: PortalBlacklistEntryDto) => { setEditing(r); setAdding(false); setVehicleId(r.vehicleId); setCustomerId(r.customerId); setReason(r.reason ?? ""); };
  const closeForm = () => { setAdding(false); setEditing(null); setVehicleId(null); setReason(""); };

  const { data = [], isLoading } = useQuery<PortalBlacklistEntryDto[]>({ queryKey: KEY, queryFn: async () => (await apiRequest("GET", KEY[0])).json() });
  const { data: vehicles = [] } = useQuery<VehicleRow[]>({ queryKey: ["/api/portal-admin/vehicles-online"], queryFn: async () => (await apiRequest("GET", "/api/portal-admin/vehicles-online")).json(), enabled: formOpen });
  const { data: customers = [] } = useQuery<Customer[]>({ queryKey: ["/api/customers"], enabled: formOpen });

  const invalidate = () => queryClient.invalidateQueries({ predicate: (q) => touchesBlacklist(q.queryKey) });
  const add = useMutation({
    mutationFn: async () => {
      const res = editing
        ? await apiRequest("PATCH", `${KEY[0]}/${editing.id}`, { vehicleId, customerId, reason: reason || null })
        : await apiRequest("POST", KEY[0], { vehicleId, customerId, reason: reason || undefined });
      return res.json();
    },
    onSuccess: () => { invalidate(); toast({ title: t(editing ? "admin.blacklist.updated" : "admin.blacklist.added") }); closeForm(); },
    onError: (e: Error) => toast({ title: describeApiError(e), variant: "destructive" }),
  });
  const remove = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `${KEY[0]}/${id}`),
    onSuccess: () => { invalidate(); toast({ title: t("admin.blacklist.removed") }); setConfirmRemove(null); },
    onError: (e: Error) => toast({ title: describeApiError(e), variant: "destructive" }),
  });

  const update = (p: Partial<BlacklistFilters>) => setFilters((f) => ({ ...f, ...p }));
  const hasFilter = filters.search.trim() !== "" || filters.onlyOnline || filters.focus !== null;
  const filtered = useMemo(() => filterBlacklist(data, filters), [data, filters]);
  const sorted = useMemo(() => sortBlacklist(filtered, sort), [filtered, sort]);
  const pager = usePager(sorted);
  const customerCount = useMemo(() => new Set(data.map((r) => r.customerId)).size, [data]);
  const vehicleItems = vehicles.map((v) => ({ id: v.id, label: `${v.brand} ${v.model} · ${formatLicensePlate(v.licensePlate)}`, sub: v.offeredOnline ? t("admin.vehicles.offered") : null, search: v.licensePlate }));
  const toggleSort = (key: BlacklistSortKey) => setSort((cur) => nextSort(cur, key, (k) => (k === "since" ? "desc" : "asc")));
  const head = (key: BlacklistSortKey, label: string, className?: string) =>
    <SortableHead label={label} sortKey={key} sort={sort} onSort={toggleSort} testId={`sort-blacklist-${key}`} className={className} />;
  const focusButton = "rounded px-1 -mx-1 text-left hover:bg-muted hover:underline";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm text-muted-foreground">{t("admin.blacklist.hint")}</p>
        <p className="text-sm font-medium whitespace-nowrap" data-testid="blacklist-summary">{t("admin.blacklist.summary", { n: data.length, customers: customerCount })}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Input placeholder={t("admin.blacklist.search")} value={filters.search} onChange={(e) => update({ search: e.target.value })} className="w-72" data-testid="blacklist-search" />
        <Button size="sm" variant={filters.onlyOnline ? "default" : "outline"} aria-pressed={filters.onlyOnline} onClick={() => update({ onlyOnline: !filters.onlyOnline })} data-testid="blacklist-only-online">
          {t("admin.blacklist.onlyOnline")}
        </Button>
        {filters.focus && (
          <Badge variant="secondary" className="gap-1 py-1 pr-1 font-normal" data-testid="blacklist-focus">
            {t(filters.focus.kind === "customer" ? "admin.blacklist.focusCustomer" : "admin.blacklist.focusVehicle", { label: filters.focus.label })}
            <button type="button" className="rounded-full p-0.5 hover:bg-background" onClick={() => update({ focus: null })} aria-label={t("admin.blacklist.clearFocus")} data-testid="blacklist-focus-clear"><X className="h-3 w-3" /></button>
          </Badge>
        )}
        {hasFilter && (
          <Button size="sm" variant="ghost" onClick={() => setFilters({ search: "", onlyOnline: false, focus: null })} data-testid="blacklist-clear-filters">
            <X className="h-4 w-4" /> {t("admin.blacklist.clearFilters")}
          </Button>
        )}
        <span className="ml-auto text-sm text-muted-foreground" data-testid="blacklist-count">
          {hasFilter ? t("admin.blacklist.countFiltered", { n: sorted.length, total: data.length }) : t("admin.blacklist.count", { n: data.length })}
        </span>
        {canManage && !formOpen && <Button size="sm" onClick={() => { setEditing(null); setAdding(true); }} data-testid="button-blacklist-add"><Plus className="mr-1.5 h-4 w-4" />{t("admin.blacklist.add")}</Button>}
      </div>

      <Dialog open={formOpen} onOpenChange={(o) => !o && closeForm()}>
        <DialogContent className="max-w-2xl" data-testid="blacklist-add-form">
          <DialogHeader>
            <DialogTitle>{editing ? t("admin.blacklist.editTitle", { plate: formatLicensePlate(editing.licensePlate), customer: editing.customerName }) : t("admin.blacklist.add")}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 md:grid-cols-2">
          <div>
            <Label>{t("admin.blacklist.vehicle")}</Label>
            <SearchListPicker items={vehicleItems} value={vehicleId} onChange={setVehicleId} searchPlaceholder={t("admin.vehicles.search")} emptyText={t("admin.blacklist.noVehicle")} changeLabel={t("admin.blacklist.change")}
              hintText={(shown, total) => t("admin.blacklist.moreShown", { shown, total })} searchFrom={0} maxShown={6} listOnlyWhenTyping testId="blacklist-vehicle" />
          </div>
          <div>
            <Label>{t("admin.blacklist.customer")}</Label>
            <CustomerSearchPicker customers={customers} value={customerId} onChange={setCustomerId} searchPlaceholder={t("admin.blacklist.searchCustomer")} emptyText={t("admin.blacklist.noCustomer")} changeLabel={t("admin.blacklist.change")}
              hintText={(shown, total) => t("admin.blacklist.moreShown", { shown, total })} />
          </div>
          <div className="md:col-span-2">
            <Label htmlFor="bl-reason">{t("admin.blacklist.reason")}</Label>
            <Input id="bl-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("admin.blacklist.reasonPlaceholder")} data-testid="blacklist-reason" />
          </div>
          <div className="flex justify-end gap-2 md:col-span-2">
            <Button size="sm" variant="outline" onClick={closeForm}>{t("admin.blacklist.cancel")}</Button>
            <Button size="sm" disabled={!vehicleId || !customerId || add.isPending} onClick={() => add.mutate()} data-testid="button-blacklist-save">
              {editing ? <><Pencil className="mr-1.5 h-4 w-4" />{t("admin.blacklist.saveChanges")}</> : <><Ban className="mr-1.5 h-4 w-4" />{t("admin.blacklist.block")}</>}
            </Button>
          </div>
          </div>
        </DialogContent>
      </Dialog>

      {!isLoading && sorted.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">{hasFilter ? t("admin.blacklist.noMatch") : t("admin.blacklist.empty")}</p>
      ) : (
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-background shadow-[0_1px_0_0_hsl(var(--border))]"><TableRow>
            {head("plate", t("admin.vehicles.columns.plate"), "w-32")}
            {head("vehicle", t("admin.vehicles.columns.vehicle"))}
            {head("customer", t("admin.blacklist.customer"))}
            {head("reason", t("admin.blacklist.reason"))}
            {head("since", t("admin.blacklist.since"), "w-32")}
            {canManage && <TableHead className="w-24" />}
          </TableRow></TableHeader>
          <TableBody>
            {pager.rows.map((r) => (
              <TableRow key={r.id} className="[&>td]:py-2" data-testid={`blacklist-row-${r.id}`}>
                <TableCell className="whitespace-nowrap font-mono text-sm">
                  <button type="button" className={focusButton} title={t("admin.blacklist.showVehicle")} onClick={() => update({ focus: { kind: "vehicle", id: r.vehicleId, label: formatLicensePlate(r.licensePlate) } })} data-testid={`blacklist-focus-vehicle-${r.id}`}>
                    {formatLicensePlate(r.licensePlate)}
                  </button>
                </TableCell>
                <TableCell>
                  <span className="font-medium">{r.brand} {r.model}</span>
                  {r.offeredOnline && <Badge variant="outline" className="ml-2 border-green-200 bg-green-50 font-normal text-green-800">{t("admin.vehicles.offered")}</Badge>}
                </TableCell>
                <TableCell>
                  <button type="button" className={cn(focusButton, "font-medium")} title={t("admin.blacklist.showCustomer")} onClick={() => update({ focus: { kind: "customer", id: r.customerId, label: r.customerName } })} data-testid={`blacklist-focus-customer-${r.id}`}>
                    {r.customerName}
                  </button>
                </TableCell>
                <TableCell className="max-w-xs truncate text-muted-foreground" title={r.reason ?? undefined}>{r.reason || "—"}</TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">{formatDate(r.createdAt)}</TableCell>
                {canManage && (
                  <TableCell className="whitespace-nowrap">
                    <Button size="icon" variant="ghost" className="h-8 w-8" title={t("admin.blacklist.edit")} onClick={() => startEdit(r)} data-testid={`button-blacklist-edit-${r.id}`}><Pencil className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8" title={t("admin.blacklist.unblock")} onClick={() => setConfirmRemove(r)} data-testid={`button-blacklist-remove-${r.id}`}><Trash2 className="h-4 w-4" /></Button>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <TablePager {...pager} testId="blacklist" />

      {/* Lifting a block lets the customer rent the vehicle again, so ask first. */}
      <AlertDialog open={confirmRemove !== null} onOpenChange={(o) => !o && setConfirmRemove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("admin.blacklist.confirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmRemove && t("admin.blacklist.confirmText", { plate: formatLicensePlate(confirmRemove.licensePlate), vehicle: `${confirmRemove.brand} ${confirmRemove.model}`, customer: confirmRemove.customerName })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("admin.blacklist.cancel")}</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => confirmRemove && remove.mutate(confirmRemove.id)} data-testid="button-blacklist-confirm-remove">{t("admin.blacklist.unblock")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
