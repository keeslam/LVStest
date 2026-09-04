import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { apiRequest } from "@/lib/queryClient";
import { useGlobalDialog } from "@/contexts/GlobalDialogContext";
import { useAuth } from "@/hooks/use-auth";
import { UserPermission, UserRole } from "@shared/schema";
import { FineStatus } from "@shared/fines";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { FineStatusBadge } from "./fine-status-badge";

export interface FineRow {
  id: number; licensePlate: string; offenceAt: string; description: string; amount: string; adminFee: string; totalAmount: string;
  status: string; customerId: number | null; customerName: string | null; driverName: string | null; reservationId: number | null;
}

function hasStaffPermission(user: { role?: string; permissions?: unknown } | null | undefined, ...perms: string[]): boolean {
  if (!user) return false;
  if (user.role === UserRole.ADMIN) return true;
  const list = (user.permissions as string[] | undefined) ?? [];
  return perms.some((p) => list.includes(p));
}

export function useCanManageFines(): boolean {
  const { user } = useAuth();
  return hasStaffPermission(user, UserPermission.MANAGE_FINES);
}

export function useCanViewFines(): boolean {
  const { user } = useAuth();
  return hasStaffPermission(user, UserPermission.VIEW_FINES, UserPermission.MANAGE_FINES);
}

export function FinesTable({ customerId, initialPlate, importFileId }: { customerId?: number; initialPlate?: string; importFileId?: number }) {
  const { t } = useTranslation("portal");
  const { openFineDialog, openNewFineDialog, openFineImportDialog, openFineImportsDialog } = useGlobalDialog();
  const canManage = useCanManageFines();
  const [status, setStatus] = useState("");
  const [plate, setPlate] = useState(initialPlate ?? "");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const filters = { status: status || undefined, customerId, licensePlate: plate.trim() || undefined, from: from || undefined, to: to || undefined, importFileId };
  const { data = [] } = useQuery<FineRow[]>({
    queryKey: ["/api/fines", filters],
    queryFn: async () => {
      const q = new URLSearchParams(Object.entries(filters).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)]));
      return (await apiRequest("GET", `/api/fines?${q}`)).json();
    },
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <select className="rounded-md border px-3 py-2 text-sm" value={status} onChange={(e) => setStatus(e.target.value)} data-testid="select-fine-status">
          <option value="">{t("admin.fines.filters.allStatuses")}</option>
          {Object.values(FineStatus).map((s) => <option key={s} value={s}>{t(`admin.fines.status.${s}`)}</option>)}
        </select>
        {!customerId && <Input placeholder={t("admin.fines.filters.plate")} value={plate} onChange={(e) => setPlate(e.target.value)} className="w-40" />}
        <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" aria-label={t("admin.fines.filters.from")} />
        <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" aria-label={t("admin.fines.filters.to")} />
        {importFileId && <Badge variant="secondary" data-testid="badge-import-filter">{t("admin.fines.cjib.filteredByFile", { id: importFileId })}</Badge>}
        {canManage && (<div className="ml-auto flex gap-2">
          <Button size="sm" variant="outline" onClick={openFineImportsDialog} data-testid="button-cjib-imports">{t("admin.fines.cjib.button")}</Button>
          <Button size="sm" variant="outline" onClick={openFineImportDialog} data-testid="button-import-fines">{t("admin.fines.import.button")}</Button>
          <Button size="sm" onClick={() => openNewFineDialog({ licensePlate: plate || undefined })} data-testid="button-new-fine">
            {t("admin.fines.new")}
          </Button>
        </div>)}
      </div>
      {data.length === 0 ? <p className="text-sm text-muted-foreground">{t("admin.fines.empty")}</p> : (
        <Table>
          <TableHeader><TableRow>
            <TableHead>{t("admin.fines.columns.plate")}</TableHead>
            <TableHead>{t("admin.fines.columns.offenceAt")}</TableHead>
            <TableHead>{t("admin.fines.columns.description")}</TableHead>
            {!customerId && <TableHead>{t("admin.fines.columns.customer")}</TableHead>}
            <TableHead>{t("admin.fines.columns.driver")}</TableHead>
            <TableHead className="text-right">{t("admin.fines.columns.total")}</TableHead>
            <TableHead>{t("admin.fines.columns.status")}</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {data.map((f) => (
              <TableRow key={f.id} className="cursor-pointer hover:bg-muted/40" onClick={() => openFineDialog(f.id)} data-testid={`row-fine-${f.id}`}>
                <TableCell className="font-mono">{f.licensePlate}</TableCell>
                <TableCell className="whitespace-nowrap">{new Date(f.offenceAt).toLocaleString()}</TableCell>
                <TableCell>{f.description}</TableCell>
                {!customerId && <TableCell>{f.customerName ?? "—"}</TableCell>}
                <TableCell>{f.driverName ?? "—"}</TableCell>
                <TableCell className="text-right">€ {f.totalAmount}</TableCell>
                <TableCell><FineStatusBadge status={f.status} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
