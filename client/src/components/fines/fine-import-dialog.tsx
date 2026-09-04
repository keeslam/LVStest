import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Loader2, Upload, CheckCircle2, AlertTriangle } from "lucide-react";
import { apiRequest, invalidateByPrefix } from "@/lib/queryClient";
import { useGlobalDialog } from "@/contexts/GlobalDialogContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import type { PortalConfig } from "@shared/portal-types";
import type { FineScanResult } from "@shared/fines";
import { linkVerdict, scanLetter, scanToForm, type FineFormFields } from "./fine-scan";

type ItemStatus = "pending" | "scanning" | "ready" | "error" | "duplicate" | "creating" | "created";
interface Item {
  key: string; file: File; status: ItemStatus; include: boolean;
  result?: FineScanResult; error?: string; form: FineFormFields; created?: { id: number; status: string };
}
const ACCEPT = /\.(pdf|jpe?g|png)$/i;

/**
 * Bulk import: drop a stack of fine letters, each one is read by AI, staff
 * correct what is uncertain, then every ticked row becomes a fine (letter
 * attached, auto-attributed) through the normal POST /api/fines.
 */
export function FineImportDialog() {
  const { t } = useTranslation("portal");
  const { dialogState, closeFineImportDialog, openFineDialog } = useGlobalDialog();
  const open = dialogState.fineImport.open;
  const { data: config } = useQuery<PortalConfig>({
    queryKey: ["/api/portal-admin/config"],
    queryFn: async () => (await apiRequest("GET", "/api/portal-admin/config")).json(),
    enabled: open,
  });
  const [items, setItems] = useState<Item[]>([]);
  const [dragging, setDragging] = useState(false);
  const [creating, setCreating] = useState(false);
  const busy = useRef(false);
  const update = (key: string, patch: Partial<Item>) => setItems((list) => list.map((i) => (i.key === key ? { ...i, ...patch } : i)));

  useEffect(() => { if (!open) { setItems([]); setCreating(false); } }, [open]);

  // Scan queue: one letter at a time, in the order they were added.
  useEffect(() => {
    if (busy.current) return;
    const next = items.find((i) => i.status === "pending");
    if (!next) return;
    busy.current = true;
    update(next.key, { status: "scanning" });
    scanLetter(next.file)
      .then((result) => update(next.key, {
        result, form: scanToForm(result.parsed),
        status: result.duplicateOf ? "duplicate" : "ready", include: !result.duplicateOf,
      }))
      .catch((e: Error) => update(next.key, { status: "error", error: e.message, include: false }))
      .finally(() => { busy.current = false; setItems((l) => [...l]); });
  }, [items]);

  const addFiles = (files: FileList | File[]) => {
    const fresh = Array.from(files).filter((f) => ACCEPT.test(f.name)).map<Item>((file) => ({
      key: `${file.name}-${file.size}-${Date.now()}-${Math.random()}`, file, status: "pending", include: true,
      form: { licensePlate: "", offenceAt: "", receivedAt: "", reference: "", description: "", amount: "" },
    }));
    setItems((l) => [...l, ...fresh]);
  };
  const onDrop = (e: DragEvent) => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files); };
  const onPick = (e: ChangeEvent<HTMLInputElement>) => { if (e.target.files) addFiles(e.target.files); e.target.value = ""; };
  const setField = (key: string, field: keyof FineFormFields, value: string) =>
    setItems((l) => l.map((i) => (i.key === key ? { ...i, form: { ...i.form, [field]: value } } : i)));

  const toCreate = items.filter((i) => i.include && (i.status === "ready" || i.status === "duplicate") && i.form.licensePlate && i.form.offenceAt && i.form.amount && i.form.description);
  async function createAll() {
    setCreating(true);
    for (const item of toCreate) {
      update(item.key, { status: "creating" });
      const body = new FormData();
      Object.entries(item.form).forEach(([k, v]) => { if (v !== "") body.append(k, k === "offenceAt" ? new Date(v).toISOString() : v); });
      if (config) body.append("adminFee", String(config.fineAdminFee));
      body.append("letterFile", item.file);
      try {
        const res = await fetch("/api/fines", { method: "POST", body, credentials: "include" });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message ?? res.statusText);
        const { fine } = await res.json();
        update(item.key, { status: "created", created: { id: fine.id, status: fine.status }, include: false });
      } catch (e) {
        update(item.key, { status: "error", error: (e as Error).message, include: false });
      }
    }
    invalidateByPrefix("/api/fines");
    setCreating(false);
  }

  const created = items.filter((i) => i.status === "created");
  const statusBadge = (i: Item) => {
    const map: Record<ItemStatus, string> = { pending: "secondary", scanning: "secondary", ready: "default", error: "destructive", duplicate: "destructive", creating: "secondary", created: "default" };
    return (
      <Badge variant={map[i.status] as any} className={i.status === "created" ? "bg-green-600 hover:bg-green-600" : ""}>
        {(i.status === "scanning" || i.status === "creating") && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
        {t(`admin.fines.import.status.${i.status}`)}
      </Badge>
    );
  };
  const verdictCell = (i: Item) => {
    if (i.created) return <button type="button" className="underline text-sm" onClick={() => openFineDialog(i.created!.id)}>#{i.created.id} · {t(`admin.fines.status.${i.created.status}`)}</button>;
    if (i.error) return <span className="text-xs text-destructive">{i.error}</span>;
    if (!i.result) return null;
    const v = linkVerdict(i.result, t);
    return (
      <span className={`flex items-center gap-1 text-xs ${v.kind === "ok" ? "text-green-700" : "text-amber-700"}`}>
        {v.kind === "ok" ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0" /> : <AlertTriangle className="h-3.5 w-3.5 shrink-0" />}
        {v.text}{i.result.duplicateOf ? ` · ${t("admin.fines.scan.duplicate", { id: i.result.duplicateOf.id })}` : ""}
      </span>
    );
  };
  const low = (i: Item, k: keyof FineScanResult["parsed"]["confidence"]) => i.result?.parsed.confidence[k] === "low" ? "border-amber-500" : "";
  const editable = (i: Item) => i.status === "ready" || i.status === "duplicate" || i.status === "error";

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !creating && closeFineImportDialog()}>
      <DialogContent className="max-w-[95vw] max-h-[90vh] flex flex-col">
        <DialogHeader><DialogTitle>{t("admin.fines.import.title")}</DialogTitle></DialogHeader>
        <div className="flex-1 overflow-auto space-y-3">
          <label onDragOver={(e) => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={onDrop}
            className={`flex cursor-pointer flex-col items-center justify-center gap-1 rounded-md border-2 border-dashed p-6 text-sm text-muted-foreground ${dragging ? "border-primary bg-muted/50" : ""}`}
            data-testid="fine-import-dropzone">
            <Upload className="h-5 w-5" />
            {t("admin.fines.import.drop")}
            <input type="file" multiple accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={onPick} data-testid="input-fine-import-files" />
          </label>

          {items.length > 0 && (
            <Table>
              <TableHeader><TableRow>
                <TableHead className="w-8" />
                <TableHead>{t("admin.fines.import.columns.file")}</TableHead>
                <TableHead>{t("admin.fines.fields.plate")}</TableHead>
                <TableHead>{t("admin.fines.fields.offenceAt")}</TableHead>
                <TableHead>{t("admin.fines.fields.amount")}</TableHead>
                <TableHead>{t("admin.fines.fields.description")}</TableHead>
                <TableHead>{t("admin.fines.fields.reference")}</TableHead>
                <TableHead>{t("admin.fines.import.columns.link")}</TableHead>
                <TableHead>{t("admin.fines.import.columns.status")}</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {items.map((i) => (
                  <TableRow key={i.key} data-testid={`fine-import-row-${i.status}`}>
                    <TableCell><Checkbox checked={i.include} disabled={!editable(i) || creating} onCheckedChange={(v) => update(i.key, { include: Boolean(v) })} /></TableCell>
                    <TableCell className="max-w-[140px] truncate text-xs" title={i.file.name}>{i.file.name}</TableCell>
                    <TableCell><Input value={i.form.licensePlate} disabled={!editable(i)} onChange={(e) => setField(i.key, "licensePlate", e.target.value)} className={`h-8 w-28 font-mono ${low(i, "licensePlate")}`} /></TableCell>
                    <TableCell><Input type="datetime-local" value={i.form.offenceAt} disabled={!editable(i)} onChange={(e) => setField(i.key, "offenceAt", e.target.value)} className={`h-8 w-44 ${low(i, "offenceAt")}`} /></TableCell>
                    <TableCell><Input type="number" step="0.01" min="0" value={i.form.amount} disabled={!editable(i)} onChange={(e) => setField(i.key, "amount", e.target.value)} className={`h-8 w-24 ${low(i, "amount")}`} /></TableCell>
                    <TableCell><Input value={i.form.description} disabled={!editable(i)} onChange={(e) => setField(i.key, "description", e.target.value)} className="h-8 min-w-[200px]" /></TableCell>
                    <TableCell><Input value={i.form.reference} disabled={!editable(i)} onChange={(e) => setField(i.key, "reference", e.target.value)} className={`h-8 w-32 ${low(i, "reference")}`} /></TableCell>
                    <TableCell className="max-w-[220px]">{verdictCell(i)}</TableCell>
                    <TableCell>{statusBadge(i)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
        <div className="flex items-center justify-between gap-2 border-t pt-3">
          <span className="text-sm text-muted-foreground">
            {created.length > 0
              ? t("admin.fines.import.summary", { created: created.length, linked: created.filter((i) => i.created?.status === "linked").length })
              : t("admin.fines.import.files", { n: items.length })}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" disabled={creating} onClick={closeFineImportDialog}>{t("admin.dialog.close")}</Button>
            <Button disabled={creating || toCreate.length === 0} onClick={createAll} data-testid="button-fine-import-create">
              {creating && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}{t("admin.fines.import.create", { n: toCreate.length })}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
