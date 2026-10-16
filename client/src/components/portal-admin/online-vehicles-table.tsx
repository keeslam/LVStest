import { describeApiError } from "@/lib/api-error";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SortableHead, nextSort, stableSort, type SortState } from "@/components/ui/sortable-head";
import { useCanManagePortal } from "./accounts-table";
import { useGlobalDialog } from "@/contexts/GlobalDialogContext";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

/**
 * "Voertuigen online": welke auto's klanten in het portaal kunnen huren.
 * Gebouwd voor een vloot van honderden tot duizend auto's: filters op
 * zoekterm, status, merk en online/offline, sorteerbare kolomkoppen, pagina's
 * van 50 en een selectiebalk voor bulk online/offline. De omschrijving voor
 * klanten is alleen bewerkbaar bij auto's die online staan; offline auto's
 * houden de rij rustig.
 */

export interface OnlineVehicleRow {
  id: number; licensePlate: string; brand: string; model: string; vehicleType: string | null; availabilityStatus: string;
  offeredOnline: boolean; onlineDescription: string | null; dailyPrice: string | null; monthlyPrice: string | null;
  /** How many customers are blocked for this vehicle. */
  blockedCustomers: number;
}
const KEY = ["/api/portal-admin/vehicles-online"];
// Same statuses the server refuses a booking for (NOT_RENTABLE in server/services/portal-storage.ts).
const NOT_RENTABLE = ["not_for_rental", "needs_fixing"];
/** Volgorde van de statusfilter en van de statussortering: van inzetbaar naar niet. */
const STATUS_ORDER = ["available", "scheduled", "rented", "needs_fixing", "not_for_rental"];
const STATUS_CLASS: Record<string, string> = {
  available: "border-green-200 bg-green-50 text-green-800",
  scheduled: "border-amber-200 bg-amber-50 text-amber-800",
  rented: "border-blue-200 bg-blue-50 text-blue-800",
  needs_fixing: "border-red-200 bg-red-50 text-red-800",
  not_for_rental: "border-gray-200 bg-gray-100 text-gray-700",
};
export const PAGE_SIZES = [25, 50, 100, 250] as const;

export type VehicleSortKey = "plate" | "vehicle" | "status" | "online" | "blocked";
export type OnlineFilter = "all" | "online" | "offline";

export interface VehicleFilters { search: string; status: string; brand: string; online: OnlineFilter }

export function filterVehicles(rows: OnlineVehicleRow[], f: VehicleFilters): OnlineVehicleRow[] {
  const q = f.search.trim().toLowerCase();
  return rows.filter((v) =>
    (f.online === "all" || (f.online === "online") === v.offeredOnline) &&
    (!f.status || v.availabilityStatus === f.status) &&
    (!f.brand || v.brand === f.brand) &&
    (!q || `${v.licensePlate} ${v.brand} ${v.model} ${v.onlineDescription ?? ""}`.toLowerCase().includes(q)),
  );
}

export function sortVehicles(rows: OnlineVehicleRow[], sort: SortState<VehicleSortKey>): OnlineVehicleRow[] {
  const name = (v: OnlineVehicleRow) => `${v.brand} ${v.model}`.toLocaleLowerCase();
  const compare = (a: OnlineVehicleRow, b: OnlineVehicleRow): number => {
    switch (sort.key) {
      case "plate": return a.licensePlate.localeCompare(b.licensePlate, "nl");
      case "vehicle": return name(a).localeCompare(name(b), "nl") || a.licensePlate.localeCompare(b.licensePlate, "nl");
      case "status": return STATUS_ORDER.indexOf(a.availabilityStatus) - STATUS_ORDER.indexOf(b.availabilityStatus) || name(a).localeCompare(name(b), "nl");
      case "online": return Number(b.offeredOnline) - Number(a.offeredOnline) || name(a).localeCompare(name(b), "nl");
      case "blocked": return b.blockedCustomers - a.blockedCustomers || name(a).localeCompare(name(b), "nl");
    }
  };
  return stableSort(rows, compare, sort.dir);
}

export function OnlineVehiclesTable() {
  const { t } = useTranslation("portal");
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const canManage = useCanManagePortal();
  const { openPortalListDialog } = useGlobalDialog();
  const [filters, setFilters] = useState<VehicleFilters>({ search: "", status: "", brand: "", online: "all" });
  const [sort, setSort] = useState<SortState<VehicleSortKey>>({ key: "vehicle", dir: "asc" });
  const [pageSize, setPageSize] = useState<number>(50);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  // Putting a car online that cannot be rented is allowed, but only after staff saw the warning.
  const [warn, setWarn] = useState<{ ids: number[]; bulk: boolean } | null>(null);
  const { data = [], isLoading } = useQuery<OnlineVehicleRow[]>({ queryKey: KEY, queryFn: async () => (await apiRequest("GET", KEY[0])).json() });

  const patch = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Partial<OnlineVehicleRow> }) => apiRequest("PATCH", `/api/portal-admin/vehicles-online/${id}`, body),
    // Flip the row in place; the list keeps its order and only the changed cell moves.
    onMutate: async ({ id, body }) => {
      await queryClient.cancelQueries({ queryKey: KEY });
      const previous = queryClient.getQueryData<OnlineVehicleRow[]>(KEY);
      queryClient.setQueryData<OnlineVehicleRow[]>(KEY, (rows) => rows?.map((r) => (r.id === id ? { ...r, ...body } : r)));
      return { previous };
    },
    onSuccess: (_r, { id, body }) => {
      const plate = queryClient.getQueryData<OnlineVehicleRow[]>(KEY)?.find((r) => r.id === id)?.licensePlate ?? "";
      if (body.offeredOnline !== undefined) toast({ title: t(body.offeredOnline ? "admin.vehicles.nowOnline" : "admin.vehicles.nowOffline", { plate }) });
      else toast({ title: t("admin.vehicles.descriptionSaved", { plate }) });
    },
    onError: (e: Error, _v, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(KEY, ctx.previous);
      toast({ title: describeApiError(e), variant: "destructive" });
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
  const bulk = useMutation({
    mutationFn: (offeredOnline: boolean) => apiRequest("POST", "/api/portal-admin/vehicles-online/bulk", { ids: [...selected], offeredOnline }),
    onSuccess: (_r, offeredOnline) => {
      toast({ title: t(offeredOnline ? "admin.vehicles.bulkOnDone" : "admin.vehicles.bulkOffDone", { n: selected.size }) });
      setSelected(new Set());
      queryClient.invalidateQueries({ queryKey: KEY });
    },
    onError: (e: Error) => toast({ title: describeApiError(e), variant: "destructive" }),
  });
  const statusLabel = (status: string) => t(`admin.vehicles.status.${status}`, { defaultValue: status });
  const notRentable = (id: number) => NOT_RENTABLE.includes(data.find((r) => r.id === id)?.availabilityStatus ?? "");
  const setOnline = (ids: number[], bulk: boolean) => {
    if (ids.some(notRentable)) { setWarn({ ids, bulk }); return; }
    if (bulk) startBulk(true); else patch.mutate({ id: ids[0], body: { offeredOnline: true } });
  };
  const startBulk = (on: boolean) => bulk.mutate(on);
  const warning = (() => {
    if (!warn) return "";
    const bad = data.filter((r) => warn.ids.includes(r.id) && NOT_RENTABLE.includes(r.availabilityStatus));
    return warn.bulk
      ? t("admin.vehicles.notRentableBulk", { n: bad.length, list: bad.map((r) => r.licensePlate).join(", ") })
      : t("admin.vehicles.notRentableConfirm", { plate: bad[0]?.licensePlate ?? "", status: statusLabel(bad[0]?.availabilityStatus ?? "") });
  })();

  const brands = useMemo(() => [...new Set(data.map((v) => v.brand).filter(Boolean))].sort((a, b) => a.localeCompare(b, "nl")), [data]);
  const statuses = useMemo(() => STATUS_ORDER.filter((s) => data.some((v) => v.availabilityStatus === s)), [data]);
  const filtered = useMemo(() => filterVehicles(data, filters), [data, filters]);
  const sorted = useMemo(() => sortVehicles(filtered, sort), [filtered, sort]);
  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const rows = sorted.slice((safePage - 1) * pageSize, safePage * pageSize);
  const onlineCount = data.filter((v) => v.offeredOnline).length;
  const hasFilter = filters.search.trim() !== "" || filters.status !== "" || filters.brand !== "" || filters.online !== "all";

  // Een ander filter of een andere sortering begint weer op pagina 1.
  useEffect(() => { setPage(1); }, [filters, sort, pageSize]);

  const update = (patchFilters: Partial<VehicleFilters>) => setFilters((f) => ({ ...f, ...patchFilters }));
  const toggleSel = (id: number) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const pageIds = rows.map((v) => v.id);
  const allOnPage = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const someOnPage = pageIds.some((id) => selected.has(id));
  const togglePage = () => setSelected((s) => {
    const n = new Set(s);
    if (allOnPage) pageIds.forEach((id) => n.delete(id)); else pageIds.forEach((id) => n.add(id));
    return n;
  });
  const selectAllFiltered = () => setSelected(new Set(sorted.map((v) => v.id)));
  const toggleSort = (key: VehicleSortKey) => setSort((cur) => nextSort(cur, key));
  const head = (key: VehicleSortKey, label: string, className?: string) =>
    <SortableHead label={label} sortKey={key} sort={sort} onSort={toggleSort} testId={`sort-vehicle-${key}`} className={className} />;

  const segment = (value: OnlineFilter, label: string) => (
    <button
      type="button"
      onClick={() => update({ online: value })}
      className={cn("px-3 py-1.5 text-sm first:rounded-l-md last:rounded-r-md border -ml-px first:ml-0", filters.online === value ? "bg-primary text-primary-foreground border-primary z-10" : "bg-background hover:bg-muted")}
      aria-pressed={filters.online === value}
      data-testid={`filter-online-${value}`}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm text-muted-foreground">{t("admin.vehicles.hint")}</p>
        <p className="text-sm font-medium" data-testid="vehicles-online-summary">{t("admin.vehicles.summary", { online: onlineCount, total: data.length })}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input placeholder={t("admin.vehicles.search")} value={filters.search} onChange={(e) => update({ search: e.target.value })} className="w-56" data-testid="vehicles-search" />
        <div className="flex" role="group" aria-label={t("admin.vehicles.onlineFilter")}>
          {segment("all", t("admin.vehicles.filterAll"))}
          {segment("online", t("admin.vehicles.filterOnline"))}
          {segment("offline", t("admin.vehicles.filterOffline"))}
        </div>
        <select className="h-9 rounded-md border bg-background px-2 text-sm" value={filters.status} onChange={(e) => update({ status: e.target.value })} aria-label={t("admin.vehicles.columns.status")} data-testid="filter-vehicle-status">
          <option value="">{t("admin.vehicles.allStatuses")}</option>
          {statuses.map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}
        </select>
        <select className="h-9 rounded-md border bg-background px-2 text-sm" value={filters.brand} onChange={(e) => update({ brand: e.target.value })} aria-label={t("admin.vehicles.brand")} data-testid="filter-vehicle-brand">
          <option value="">{t("admin.vehicles.allBrands")}</option>
          {brands.map((b) => <option key={b} value={b}>{b}</option>)}
        </select>
        {hasFilter && (
          <Button size="sm" variant="ghost" onClick={() => setFilters({ search: "", status: "", brand: "", online: "all" })} data-testid="vehicles-clear-filters">
            <X className="h-4 w-4" /> {t("admin.vehicles.clearFilters")}
          </Button>
        )}
        <span className="ml-auto text-sm text-muted-foreground" data-testid="vehicles-count">
          {hasFilter ? t("admin.vehicles.countFiltered", { n: sorted.length, total: data.length }) : t("admin.vehicles.count", { n: data.length })}
        </span>
      </div>

      {canManage && selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2" data-testid="vehicles-selection-bar">
          <span className="text-sm font-medium">{t("admin.vehicles.selectedCount", { n: selected.size })}</span>
          {!hasFilter || selected.size >= sorted.length ? null : (
            <Button size="sm" variant="link" className="h-auto p-0" onClick={selectAllFiltered} data-testid="vehicles-select-all-filtered">
              {t("admin.vehicles.selectAllFiltered", { n: sorted.length })}
            </Button>
          )}
          <span className="flex-1" />
          <Button size="sm" onClick={() => setOnline([...selected], true)}>{t("admin.vehicles.bulkOn")}</Button>
          <Button size="sm" variant="outline" onClick={() => bulk.mutate(false)}>{t("admin.vehicles.bulkOff")}</Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>{t("admin.vehicles.clearSelection")}</Button>
        </div>
      )}

      <Table>
        <TableHeader className="sticky top-0 z-10 bg-background shadow-[0_1px_0_0_hsl(var(--border))]"><TableRow>
          <TableHead className="w-8">
            <Checkbox checked={allOnPage ? true : someOnPage ? "indeterminate" : false} onCheckedChange={togglePage} disabled={!canManage || rows.length === 0} aria-label={t("admin.vehicles.selectPage")} data-testid="vehicles-select-page" />
          </TableHead>
          {head("plate", t("admin.vehicles.columns.plate"), "w-32")}
          {head("vehicle", t("admin.vehicles.columns.vehicle"))}
          {head("status", t("admin.vehicles.columns.status"), "w-40")}
          {head("online", t("admin.vehicles.offered"), "w-24")}
          <TableHead>{t("admin.vehicles.description")}</TableHead>
          {head("blocked", t("admin.vehicles.blocked"), "w-32")}
        </TableRow></TableHeader>
        <TableBody>
          {rows.length === 0 && (
            <TableRow><TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
              {isLoading ? t("admin.vehicles.loading") : hasFilter ? t("admin.vehicles.emptyFiltered") : t("admin.vehicles.empty")}
            </TableCell></TableRow>
          )}
          {rows.map((v) => (
            <TableRow key={v.id} className={cn("[&>td]:py-2", selected.has(v.id) && "bg-primary/5")} data-testid={`row-vehicle-${v.id}`}>
              <TableCell><Checkbox checked={selected.has(v.id)} onCheckedChange={() => toggleSel(v.id)} disabled={!canManage} aria-label={t("admin.vehicles.selectRow", { plate: v.licensePlate })} /></TableCell>
              <TableCell className="whitespace-nowrap font-mono text-sm">{v.licensePlate}</TableCell>
              <TableCell>
                <div className="font-medium leading-tight">{v.brand} {v.model}</div>
                {v.vehicleType && <div className="text-xs text-muted-foreground">{v.vehicleType}</div>}
              </TableCell>
              <TableCell>
                <Badge variant="outline" className={cn("font-normal whitespace-nowrap", STATUS_CLASS[v.availabilityStatus])}>{statusLabel(v.availabilityStatus)}</Badge>
              </TableCell>
              <TableCell><Switch checked={v.offeredOnline} disabled={!canManage} aria-label={t("admin.vehicles.offeredFor", { plate: v.licensePlate })}
                onCheckedChange={(on) => (on ? setOnline([v.id], false) : patch.mutate({ id: v.id, body: { offeredOnline: false } }))} /></TableCell>
              <TableCell>
                {v.offeredOnline ? (
                  <Input key={v.onlineDescription ?? ""} defaultValue={v.onlineDescription ?? ""} disabled={!canManage} className="h-8 max-w-md" placeholder={t("admin.vehicles.descriptionPlaceholder")} aria-label={t("admin.vehicles.descriptionFor", { plate: v.licensePlate })}
                    onBlur={(e) => { if (e.target.value !== (v.onlineDescription ?? "")) patch.mutate({ id: v.id, body: { onlineDescription: e.target.value || null } }); }} />
                ) : (
                  <span className="text-sm text-muted-foreground truncate block max-w-md" title={v.onlineDescription ?? undefined}>{v.onlineDescription || "—"}</span>
                )}
              </TableCell>
              <TableCell>
                {v.blockedCustomers > 0 ? (
                  <Button size="sm" variant="secondary" className="h-7" onClick={() => openPortalListDialog("blacklist", { plate: v.licensePlate })} data-testid={`button-blocked-${v.id}`}>
                    {t("admin.vehicles.blockedFor", { n: v.blockedCustomers })}
                  </Button>
                ) : <span className="text-sm text-muted-foreground">—</span>}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {sorted.length > PAGE_SIZES[0] && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm" data-testid="vehicles-pagination">
          <label className="flex items-center gap-2 text-muted-foreground">
            {t("admin.vehicles.perPage")}
            <select className="h-8 rounded-md border bg-background px-2 text-sm" value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))} data-testid="vehicles-page-size">
              {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">
              {t("admin.vehicles.pageRange", { from: (safePage - 1) * pageSize + 1, to: Math.min(safePage * pageSize, sorted.length), total: sorted.length })}
            </span>
            <Button variant="outline" size="sm" className="h-8 w-8 p-0" disabled={safePage <= 1} onClick={() => setPage(safePage - 1)} aria-label={t("admin.vehicles.prevPage")} data-testid="vehicles-prev-page"><ChevronLeft className="h-4 w-4" /></Button>
            <span data-testid="vehicles-page-indicator">{safePage} / {pageCount}</span>
            <Button variant="outline" size="sm" className="h-8 w-8 p-0" disabled={safePage >= pageCount} onClick={() => setPage(safePage + 1)} aria-label={t("admin.vehicles.nextPage")} data-testid="vehicles-next-page"><ChevronRight className="h-4 w-4" /></Button>
          </div>
        </div>
      )}

      {warn && (
        <ConfirmDialog
          open
          onOpenChange={(o) => { if (!o) setWarn(null); }}
          variant="warning"
          title={t("admin.vehicles.notRentableTitle")}
          description={warning}
          confirmLabel={t("admin.vehicles.offerAnyway")}
          cancelLabel={t("admin.dialog.cancel")}
          onConfirm={() => {
            if (warn.bulk) startBulk(true); else patch.mutate({ id: warn.ids[0], body: { offeredOnline: true } });
          }}
        />
      )}
    </div>
  );
}
