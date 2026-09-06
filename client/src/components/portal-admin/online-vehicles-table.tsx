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

interface OnlineVehicleRow {
  id: number; licensePlate: string; brand: string; model: string; vehicleType: string | null; availabilityStatus: string;
  offeredOnline: boolean; onlineDescription: string | null; dailyPrice: string | null; monthlyPrice: string | null;
  /** How many customers are blocked for this vehicle. */
  blockedCustomers: number;
}
const KEY = ["/api/portal-admin/vehicles-online"];

export function OnlineVehiclesTable() {
  const { t } = useTranslation("portal");
  const queryClient = useQueryClient();
  const canManage = useCanManagePortal();
  const { openPortalListDialog } = useGlobalDialog();
  const [search, setSearch] = useState("");
  const [onlyOffered, setOnlyOffered] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
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
    onError: (_e, _v, ctx) => { if (ctx?.previous) queryClient.setQueryData(KEY, ctx.previous); },
    onSettled: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
  const bulk = useMutation({
    mutationFn: (offeredOnline: boolean) => apiRequest("POST", "/api/portal-admin/vehicles-online/bulk", { ids: [...selected], offeredOnline }),
    onSuccess: () => { setSelected(new Set()); queryClient.invalidateQueries({ queryKey: KEY }); },
  });

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
          <Button size="sm" onClick={() => bulk.mutate(true)}>{t("admin.vehicles.bulkOn")} ({selected.size})</Button>
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
              <TableCell><Checkbox checked={selected.has(v.id)} onCheckedChange={() => toggleSel(v.id)} disabled={!canManage} /></TableCell>
              <TableCell className="font-mono">{v.licensePlate}</TableCell>
              <TableCell>{v.brand} {v.model}</TableCell>
              <TableCell>{v.availabilityStatus}</TableCell>
              <TableCell><Switch checked={v.offeredOnline} disabled={!canManage} onCheckedChange={(on) => patch.mutate({ id: v.id, body: { offeredOnline: on } })} /></TableCell>
              <TableCell>
                <Input defaultValue={v.onlineDescription ?? ""} disabled={!canManage}
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
    </div>
  );
}
