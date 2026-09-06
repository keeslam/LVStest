import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Ban, Plus, Trash2 } from "lucide-react";
import type { Customer } from "@shared/schema";
import type { PortalBlacklistEntryDto } from "@shared/portal-types";
import { apiRequest } from "@/lib/queryClient";
import { formatLicensePlate } from "@/lib/format-utils";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SearchListPicker } from "@/components/ui/search-list-picker";
import { CustomerSearchPicker } from "@/components/customers/customer-search-picker";
import { useToast } from "@/hooks/use-toast";
import { useCanManagePortal } from "./accounts-table";

interface VehicleRow { id: number; licensePlate: string; brand: string; model: string; offeredOnline: boolean }
const KEY = ["/api/portal-admin/blacklist"];

/** Anything that shows blacklist data: this list, the customer dialog, the vehicle dialog and the online-vehicles list. */
const touchesBlacklist = (key: readonly unknown[]) => key.some((k) => typeof k === "string" && (k.includes("blacklist") || k.includes("vehicles-online")));

/**
 * Every vehicle/customer block in one place. Same table the customer and
 * vehicle dialogs edit, so a block made here is respected there and vice versa.
 */
export function BlacklistTable({ initialPlate, initialCustomerId }: { initialPlate?: string; initialCustomerId?: number }) {
  const { t } = useTranslation("portal");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const canManage = useCanManagePortal();
  const [search, setSearch] = useState(initialPlate ?? "");
  const [adding, setAdding] = useState(false);
  const [vehicleId, setVehicleId] = useState<number | null>(null);
  const [customerId, setCustomerId] = useState<number | null>(initialCustomerId ?? null);
  const [reason, setReason] = useState("");

  const { data = [], isLoading } = useQuery<PortalBlacklistEntryDto[]>({ queryKey: KEY, queryFn: async () => (await apiRequest("GET", KEY[0])).json() });
  const { data: vehicles = [] } = useQuery<VehicleRow[]>({ queryKey: ["/api/portal-admin/vehicles-online"], queryFn: async () => (await apiRequest("GET", "/api/portal-admin/vehicles-online")).json(), enabled: adding });
  const { data: customers = [] } = useQuery<Customer[]>({ queryKey: ["/api/customers"], enabled: adding });

  const invalidate = () => queryClient.invalidateQueries({ predicate: (q) => touchesBlacklist(q.queryKey) });
  const add = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", KEY[0], { vehicleId, customerId, reason: reason || undefined });
      return res.json();
    },
    onSuccess: () => { invalidate(); toast({ title: t("admin.blacklist.added") }); setVehicleId(null); setReason(""); setAdding(false); },
    onError: (e: Error) => toast({ title: e.message.replace(/^\d+:\s*/, ""), variant: "destructive" }),
  });
  const remove = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `${KEY[0]}/${id}`),
    onSuccess: () => { invalidate(); toast({ title: t("admin.blacklist.removed") }); },
  });

  const q = search.trim().toLowerCase();
  const rows = useMemo(() => data.filter((r) => !q || `${r.licensePlate} ${formatLicensePlate(r.licensePlate)} ${r.brand} ${r.model} ${r.customerName} ${r.reason ?? ""}`.toLowerCase().includes(q)), [data, q]);
  const vehicleItems = vehicles.map((v) => ({ id: v.id, label: `${v.brand} ${v.model} · ${formatLicensePlate(v.licensePlate)}`, sub: v.offeredOnline ? t("admin.vehicles.offered") : null, search: v.licensePlate }));

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">{t("admin.blacklist.hint")}</p>
      <div className="flex flex-wrap items-center gap-2">
        <Input placeholder={t("admin.blacklist.search")} value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" data-testid="blacklist-search" />
        <span className="text-sm text-muted-foreground">{t("admin.blacklist.count", { n: rows.length })}</span>
        {canManage && !adding && <Button size="sm" onClick={() => setAdding(true)} data-testid="button-blacklist-add"><Plus className="mr-1.5 h-4 w-4" />{t("admin.blacklist.add")}</Button>}
      </div>

      {adding && (
        <div className="grid gap-3 rounded-lg border bg-muted/30 p-3 md:grid-cols-2" data-testid="blacklist-add-form">
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
            <Button size="sm" variant="outline" onClick={() => setAdding(false)}>{t("admin.blacklist.cancel")}</Button>
            <Button size="sm" disabled={!vehicleId || !customerId || add.isPending} onClick={() => add.mutate()} data-testid="button-blacklist-save"><Ban className="mr-1.5 h-4 w-4" />{t("admin.blacklist.block")}</Button>
          </div>
        </div>
      )}

      {!isLoading && rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">{q ? t("admin.blacklist.noMatch") : t("admin.blacklist.empty")}</p>
      ) : (
        <Table>
          <TableHeader><TableRow>
            <TableHead>{t("admin.vehicles.columns.plate")}</TableHead>
            <TableHead>{t("admin.vehicles.columns.vehicle")}</TableHead>
            <TableHead>{t("admin.blacklist.customer")}</TableHead>
            <TableHead>{t("admin.blacklist.reason")}</TableHead>
            <TableHead>{t("admin.blacklist.since")}</TableHead>
            {canManage && <TableHead className="w-10" />}
          </TableRow></TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id} data-testid={`blacklist-row-${r.id}`}>
                <TableCell className="font-mono">{formatLicensePlate(r.licensePlate)}</TableCell>
                <TableCell>{r.brand} {r.model} {r.offeredOnline && <Badge variant="secondary" className="ml-1">{t("admin.vehicles.offered")}</Badge>}</TableCell>
                <TableCell>{r.customerName}</TableCell>
                <TableCell className="max-w-xs truncate text-muted-foreground" title={r.reason ?? undefined}>{r.reason || "—"}</TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">{new Date(r.createdAt).toLocaleDateString()}</TableCell>
                {canManage && (
                  <TableCell>
                    <Button size="icon" variant="ghost" title={t("admin.blacklist.unblock")} onClick={() => remove.mutate(r.id)} disabled={remove.isPending} data-testid={`button-blacklist-remove-${r.id}`}><Trash2 className="h-4 w-4" /></Button>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
