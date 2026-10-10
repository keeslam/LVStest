import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { apiRequest } from "@/lib/queryClient";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useCanManagePortal } from "./accounts-table";
import { useGlobalDialog } from "@/contexts/GlobalDialogContext";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/hooks/use-toast";

interface OnlineVehicleRow {
  id: number; licensePlate: string; brand: string; model: string; vehicleType: string | null; availabilityStatus: string;
  offeredOnline: boolean; onlineDescription: string | null; dailyPrice: string | null; monthlyPrice: string | null;
  /** How many customers are blocked for this vehicle. */
  blockedCustomers: number;
}
const KEY = ["/api/portal-admin/vehicles-online"];
// Same statuses the server refuses a booking for (NOT_RENTABLE in server/services/portal-storage.ts).
const NOT_RENTABLE = ["not_for_rental", "needs_fixing"];

export function OnlineVehiclesTable() {
  const { t } = useTranslation("portal");
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const canManage = useCanManagePortal();
  const { openPortalListDialog } = useGlobalDialog();
  const [search, setSearch] = useState("");
  const [onlyOffered, setOnlyOffered] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  // Putting a car online that cannot be rented is allowed, but only after staff saw the warning.
  const [warn, setWarn] = useState<{ ids: number[]; bulk: boolean } | null>(null);
  const { data = [] } = useQuery<OnlineVehicleRow[]>({ queryKey: KEY, queryFn: async () => (await apiRequest("GET", KEY[0])).json() });

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
      toast({ title: e.message, variant: "destructive" });
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
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
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

  const q = search.trim().toLowerCase();
  const rows = data
    .filter((v) => (!onlyOffered || v.offeredOnline) && (!q || `${v.licensePlate} ${v.brand} ${v.model}`.toLowerCase().includes(q)))
    .sort((x, y) => x.brand.localeCompare(y.brand) || x.model.localeCompare(y.model) || x.licensePlate.localeCompare(y.licensePlate));
  const toggleSel = (id: number) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">{t("admin.vehicles.hint")}</p>
      <div className="flex flex-wrap items-center gap-2">
        <Input placeholder={t("admin.vehicles.search")} value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
        <Button size="sm" variant={onlyOffered ? "default" : "outline"} onClick={() => setOnlyOffered(!onlyOffered)}>{t("admin.vehicles.onlyOffered")}</Button>
        {canManage && selected.size > 0 && (<>
          <Button size="sm" onClick={() => setOnline([...selected], true)}>{t("admin.vehicles.bulkOn")} ({selected.size})</Button>
          <Button size="sm" variant="outline" onClick={() => bulk.mutate(false)}>{t("admin.vehicles.bulkOff")} ({selected.size})</Button>
        </>)}
      </div>
      <Table>
        <TableHeader><TableRow>
          <TableHead className="w-8" />
          <TableHead>{t("admin.vehicles.columns.plate")}</TableHead>
          <TableHead>{t("admin.vehicles.columns.vehicle")}</TableHead>
          <TableHead>{t("admin.vehicles.columns.status")}</TableHead>
          <TableHead>{t("admin.vehicles.offered")}</TableHead>
          <TableHead>{t("admin.vehicles.description")}</TableHead>
          <TableHead>{t("admin.vehicles.blocked")}</TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {rows.map((v) => (
            <TableRow key={v.id}>
              <TableCell><Checkbox checked={selected.has(v.id)} onCheckedChange={() => toggleSel(v.id)} disabled={!canManage} aria-label={t("admin.vehicles.selectRow", { plate: v.licensePlate })} /></TableCell>
              <TableCell className="font-mono">{v.licensePlate}</TableCell>
              <TableCell>{v.brand} {v.model}</TableCell>
              <TableCell>{statusLabel(v.availabilityStatus)}</TableCell>
              <TableCell><Switch checked={v.offeredOnline} disabled={!canManage} aria-label={t("admin.vehicles.offeredFor", { plate: v.licensePlate })}
                onCheckedChange={(on) => (on ? setOnline([v.id], false) : patch.mutate({ id: v.id, body: { offeredOnline: false } }))} /></TableCell>
              <TableCell>
                <Input defaultValue={v.onlineDescription ?? ""} disabled={!canManage} aria-label={t("admin.vehicles.descriptionFor", { plate: v.licensePlate })}
                  onBlur={(e) => { if (e.target.value !== (v.onlineDescription ?? "")) patch.mutate({ id: v.id, body: { onlineDescription: e.target.value || null } }); }} />
              </TableCell>
              <TableCell>
                <Button size="sm" variant={v.blockedCustomers > 0 ? "secondary" : "ghost"} onClick={() => openPortalListDialog("blacklist", { plate: v.licensePlate })} data-testid={`button-blocked-${v.id}`}>
                  {v.blockedCustomers > 0 ? t("admin.vehicles.blockedFor", { n: v.blockedCustomers }) : t("admin.vehicles.blockNone")}
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
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
