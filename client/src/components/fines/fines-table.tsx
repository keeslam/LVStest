import { useState } from "react";
import { formatLicensePlate, formatDateTime, formatCurrency } from "@/lib/format-utils";
import { type Preview, PreviewFooter, TableSearch, textMatches } from "@/components/portal-admin/preview";
import { downloadCsv, csvDateTime, csvNumber } from "@/lib/csv";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import { apiRequest } from "@/lib/queryClient";
import { useGlobalDialog } from "@/contexts/GlobalDialogContext";
import { UserPermission, UserRole } from "@shared/schema";
import { ACTIVE_FINE_STATUSES, LEGACY_FINE_STATUSES, LEGACY_FINE_STATUS_COUNTS_HEADER, type FineStatusValue, type LegacyFineStatusCounts } from "@shared/fines";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RecycleBinDialog } from "@/components/recycle-bin/recycle-bin-dialog";
import { RequiresPermission } from "@/components/ui/requires-permission";
import { useAuth } from "@/hooks/use-auth";
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

export function FinesTable({ customerId, initialPlate, importFileId, preview }: { customerId?: number; initialPlate?: string; importFileId?: number; preview?: Preview }) {
  const { t } = useTranslation("portal");
  const { openFineDialog, openNewFineDialog, openFineImportDialog, openFineImportsDialog } = useGlobalDialog();
  const canManage = useCanManageFines();
  const [binOpen, setBinOpen] = useState(false);
  const [status, setStatus] = useState("");
  const [plate, setPlate] = useState(initialPlate ?? "");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [search, setSearch] = useState("");
  // Kees, 2026-10-19: tick fines and tell their customers, or cancel them, in one go.
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [confirm, setConfirm] = useState<null | "notify" | "cancel">(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const bulk = useMutation({
    mutationFn: async (action: "notify" | "cancel" | "attribute") => (await apiRequest("POST", "/api/fines/bulk", { action, ids: Array.from(selected) })).json() as Promise<{ action: string; done: number[]; skipped: Array<{ id: number; reason: string }> }>,
    onSuccess: (r) => {
      const reasons = Array.from(new Set(r.skipped.map((s) => s.reason))).map((code) => t(`admin.fines.bulk.reasons.${code}`, { defaultValue: code }));
      toast({
        title: t(r.action === "notify" ? "admin.fines.bulk.notifiedTitle" : r.action === "attribute" ? "admin.fines.bulk.attributedTitle" : "admin.fines.bulk.cancelledTitle", { count: r.done.length }),
        description: r.skipped.length > 0 ? `${t("admin.fines.bulk.skipped", { count: r.skipped.length })}: ${reasons.join(", ")}` : undefined,
        variant: r.done.length === 0 ? "destructive" : undefined,
      });
      setSelected(new Set()); setConfirm(null);
      queryClient.invalidateQueries({ queryKey: ["/api/fines"] });
    },
    onError: () => { toast({ title: t("admin.fines.bulk.failed"), variant: "destructive" }); setConfirm(null); },
  });
  const toggle = (id: number) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const filters = { status: status || undefined, customerId, licensePlate: plate.trim() || undefined, from: from || undefined, to: to || undefined, importFileId };
  // B-41 D9: the list answers with an array; the per-status counts of legacy rows travel in a header.
  // They live in the query data, so a list served from the cache keeps them.
  const { data: list } = useQuery<{ rows: FineRow[]; legacyCounts: LegacyFineStatusCounts }>({
    queryKey: ["/api/fines", filters],
    queryFn: async () => {
      const q = new URLSearchParams(Object.entries(filters).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)]));
      const res = await apiRequest("GET", `/api/fines?${q}`);
      let legacyCounts: LegacyFineStatusCounts = {};
      try {
        const parsed = JSON.parse(res.headers.get(LEGACY_FINE_STATUS_COUNTS_HEADER) ?? "{}");
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) legacyCounts = parsed;
      } catch { /* an unreadable header means no legacy rows are announced */ }
      return { rows: (await res.json()) as FineRow[], legacyCounts };
    },
  });
  const data = list?.rows ?? [];
  const legacyCounts = list?.legacyCounts ?? {};
  // The filter offers what a fine can still become; Doorbelast/Betaald/Betwist only while old rows with them exist
  // (and the one currently chosen, so a selection never silently disappears).
  const statusOptions: FineStatusValue[] = [
    ...ACTIVE_FINE_STATUSES,
    ...LEGACY_FINE_STATUSES.filter((s) => (legacyCounts[s] ?? 0) > 0 || s === status),
  ];

  const filtered = data.filter((f) => textMatches(search, f.licensePlate, f.description, f.driverName, f.customerName, f.totalAmount, t(`admin.fines.status.${f.status}`)));
  const rows = preview ? filtered.slice(0, preview.limit) : filtered;
  const canBulk = canManage && !preview;
  const allChosen = rows.length > 0 && rows.every((f) => selected.has(f.id));
  const chosen = data.filter((f) => selected.has(f.id));
  return (
    <div className="space-y-3">
      {!preview && <div className="flex flex-wrap items-center gap-2">
        <TableSearch value={search} onChange={setSearch} testId="fines-search" />
        <select className="rounded-md border px-3 py-2 text-sm" value={status} onChange={(e) => setStatus(e.target.value)} data-testid="select-fine-status">
          <option value="">{t("admin.fines.filters.allStatuses")}</option>
          {statusOptions.map((s) => <option key={s} value={s}>{t(`admin.fines.status.${s}`)}</option>)}
        </select>
        {!customerId && <Input placeholder={t("admin.fines.filters.plate")} value={plate} onChange={(e) => setPlate(e.target.value)} className="w-40" />}
        <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" aria-label={t("admin.fines.filters.from")} />
        <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" aria-label={t("admin.fines.filters.to")} />
        {importFileId && <Badge variant="secondary" data-testid="badge-import-filter">{t("admin.fines.cjib.filteredByFile", { id: importFileId })}</Badge>}
        <Button size="sm" variant="ghost" onClick={() => downloadCsv(`boetes${customerId ? `-klant-${customerId}` : ""}`, ["Kenteken", "Datum", "Omschrijving", "Klant", "Bestuurder", "Bedrag", "Status"],
          filtered.map((f) => [formatLicensePlate(f.licensePlate), csvDateTime(f.offenceAt), f.description, f.customerName ?? "", f.driverName ?? "", csvNumber(f.totalAmount), t(`admin.fines.status.${f.status}`)]))} data-testid="button-export-fines">
          {t("admin.fines.exportCsv")}
        </Button>
        <div className="ml-auto flex gap-2">
          {/* Sub-project C (B-36, B-38): the bin opens for "Prullenbak beheren" (was: role admin); greyed out with the reason otherwise. */}
          <RequiresPermission anyOf={[UserPermission.MANAGE_RECYCLE_BIN]}>
            <Button size="sm" variant="ghost" onClick={() => setBinOpen(true)} data-testid="button-fines-bin">{t("recycleBin:kinds.fine.openButton")}</Button>
          </RequiresPermission>
          {canManage && (<>
            <Button size="sm" variant="outline" onClick={openFineImportsDialog} data-testid="button-cjib-imports">{t("admin.fines.cjib.button")}</Button>
            <Button size="sm" variant="outline" onClick={openFineImportDialog} title={t("admin.fines.import.tooltip")} data-testid="button-import-fines">{t("admin.fines.import.button")}</Button>
            <Button size="sm" onClick={() => openNewFineDialog({ licensePlate: plate || undefined })} title={t("admin.fines.dialog.newTooltip")} data-testid="button-new-fine">
              {t("admin.fines.new")}
            </Button>
          </>)}
        </div>
      </div>}
      {canBulk && selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm dark:bg-blue-950/30" data-testid="fines-bulk-bar">
          <span className="font-medium">{t("admin.fines.bulk.selected", { count: selected.size })}</span>
          <Button size="sm" onClick={() => setConfirm("notify")} data-testid="button-bulk-notify">{t("admin.fines.bulk.notify")}</Button>
          {/* B-64: links the ticked fines without a customer again; nothing is mailed, so no confirmation. */}
          <Button size="sm" variant="outline" disabled={bulk.isPending} onClick={() => bulk.mutate("attribute")} data-testid="button-bulk-attribute">{t("admin.fines.bulk.attribute")}</Button>
          <Button size="sm" variant="outline" onClick={() => setConfirm("cancel")} data-testid="button-bulk-cancel">{t("admin.fines.bulk.cancel")}</Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>{t("admin.fines.bulk.clear")}</Button>
        </div>
      )}
      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(o) => { if (!o) setConfirm(null); }}
        title={confirm === "cancel" ? t("admin.fines.bulk.confirmCancelTitle", { count: selected.size }) : t("admin.fines.bulk.confirmNotifyTitle", { count: selected.size })}
        description={confirm === "cancel" ? t("admin.fines.bulk.confirmCancel") : t("admin.fines.bulk.confirmNotify", { linked: chosen.filter((f) => f.status === "linked").length })}
        confirmLabel={confirm === "cancel" ? t("admin.fines.bulk.cancel") : t("admin.fines.bulk.notify")}
        variant={confirm === "cancel" ? "danger" : "info"}
        isLoading={bulk.isPending}
        onConfirm={() => confirm && bulk.mutate(confirm)}
        confirmTestId="button-bulk-confirm"
      />
      {rows.length === 0 ? <p className="text-sm text-muted-foreground">{t("admin.fines.empty")}</p> : (
        <Table>
          <TableHeader><TableRow>
            {canBulk && <TableHead className="w-8"><Checkbox checked={allChosen} onCheckedChange={(v) => setSelected(v ? new Set(rows.map((f) => f.id)) : new Set())} aria-label={t("admin.fines.bulk.selectAll")} data-testid="checkbox-fines-all" /></TableHead>}
            <TableHead>{t("admin.fines.columns.plate")}</TableHead>
            <TableHead>{t("admin.fines.columns.offenceAt")}</TableHead>
            <TableHead>{t("admin.fines.columns.description")}</TableHead>
            {!customerId && <TableHead>{t("admin.fines.columns.customer")}</TableHead>}
            <TableHead>{t("admin.fines.columns.driver")}</TableHead>
            <TableHead className="text-right">{t("admin.fines.columns.total")}</TableHead>
            <TableHead>{t("admin.fines.columns.status")}</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {rows.map((f) => (
              <TableRow key={f.id} className="cursor-pointer hover:bg-muted/40" onClick={() => openFineDialog(f.id)} data-testid={`row-fine-${f.id}`}>
                {canBulk && <TableCell onClick={(e) => e.stopPropagation()}><Checkbox checked={selected.has(f.id)} onCheckedChange={() => toggle(f.id)} aria-label={t("admin.fines.bulk.select", { plate: formatLicensePlate(f.licensePlate) })} data-testid={`checkbox-fine-${f.id}`} /></TableCell>}
                <TableCell className="font-mono">{formatLicensePlate(f.licensePlate)}</TableCell>
                <TableCell className="whitespace-nowrap">{formatDateTime(f.offenceAt)}</TableCell>
                <TableCell>{f.description}</TableCell>
                {!customerId && <TableCell>{f.customerName ?? "—"}</TableCell>}
                <TableCell>{f.driverName ?? "—"}</TableCell>
                <TableCell className="text-right">{formatCurrency(f.totalAmount)}</TableCell>
                <TableCell><FineStatusBadge status={f.status} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {preview && filtered.length > 0 && <PreviewFooter shown={rows.length} total={filtered.length} onShowAll={preview.onShowAll} />}
      <RecycleBinDialog kind="fine" open={binOpen} onOpenChange={setBinOpen} />
    </div>
  );
}
