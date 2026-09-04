import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ScanSearch, Loader2 } from "lucide-react";
import { apiRequest, invalidateByPrefix } from "@/lib/queryClient";
import { useGlobalDialog } from "@/contexts/GlobalDialogContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import type { PortalConfig } from "@shared/portal-types";
import type { FineScanResult } from "@shared/fines";
import { ScanSummary, scanLetter, scanToForm } from "./fine-scan";

const EMPTY = { licensePlate: "", offenceAt: "", receivedAt: "", reference: "", description: "", amount: "", adminFee: "", internalNotes: "" };

/** Staff enter a fine, by hand or by scanning the letter; after saving the FineDialog opens with the attribution result. */
export function NewFineDialog() {
  const { t } = useTranslation("portal");
  const { toast } = useToast();
  const { dialogState, closeNewFineDialog, openFineDialog } = useGlobalDialog();
  const open = dialogState.newFine.open;
  const { data: config } = useQuery<PortalConfig>({
    queryKey: ["/api/portal-admin/config"],
    queryFn: async () => (await apiRequest("GET", "/api/portal-admin/config")).json(),
    enabled: open,
  });
  const [form, setForm] = useState(EMPTY);
  const [file, setFile] = useState<File | null>(null);
  const [scan, setScan] = useState<FineScanResult | null>(null);
  useEffect(() => {
    if (!open) return;
    setForm((f) => ({ ...f, licensePlate: dialogState.newFine.licensePlate ?? f.licensePlate, adminFee: f.adminFee || (config ? String(config.fineAdminFee) : "") }));
  }, [open, config, dialogState.newFine.licensePlate]);

  const doScan = useMutation({
    mutationFn: () => scanLetter(file!),
    onSuccess: (result) => {
      setScan(result);
      setForm((f) => ({ ...f, ...scanToForm(result.parsed, f) }));
      toast({ title: t("admin.fines.scan.done") });
    },
    onError: (e: Error) => toast({ title: t("admin.fines.scan.failed"), description: e.message, variant: "destructive" }),
  });

  const save = useMutation({
    mutationFn: async () => {
      const body = new FormData();
      Object.entries(form).forEach(([k, v]) => { if (v !== "") body.append(k, k === "offenceAt" ? new Date(v).toISOString() : v); });
      if (file) body.append("letterFile", file);
      const res = await fetch("/api/fines", { method: "POST", body, credentials: "include" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message ?? res.statusText);
      return res.json() as Promise<{ fine: { id: number; status: string } }>;
    },
    onSuccess: ({ fine }) => {
      invalidateByPrefix("/api/fines");
      setForm(EMPTY); setFile(null); setScan(null);
      closeNewFineDialog();
      openFineDialog(fine.id);
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });
  const set = (k: keyof typeof form) => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm({ ...form, [k]: e.target.value });
  function submit(e: FormEvent) { e.preventDefault(); save.mutate(); }
  const low = (k: keyof FineScanResult["parsed"]["confidence"]) => scan && scan.parsed.confidence[k] === "low" ? "border-amber-500" : "";

  return (
    <Dialog open={open} onOpenChange={(o) => !o && closeNewFineDialog()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{t("admin.fines.dialog.newTitle")}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="rounded-md border bg-muted/30 p-3 space-y-2">
            <Label htmlFor="nf-letter">{t("admin.fines.fields.letter")}</Label>
            <div className="flex items-center gap-2">
              <Input id="nf-letter" type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setScan(null); }} className="flex-1" data-testid="input-fine-letter" />
              <Button type="button" size="sm" variant="secondary" disabled={!file || doScan.isPending} onClick={() => doScan.mutate()} data-testid="button-scan-fine-letter">
                {doScan.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <ScanSearch className="mr-1.5 h-4 w-4" />}
                {doScan.isPending ? t("admin.fines.scan.scanning") : t("admin.fines.scan.button")}
              </Button>
            </div>
            {scan && <ScanSummary result={scan} onOpenDuplicate={(id) => { closeNewFineDialog(); openFineDialog(id); }} />}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label htmlFor="nf-plate">{t("admin.fines.fields.plate")}</Label><Input id="nf-plate" value={form.licensePlate} onChange={set("licensePlate")} required className={low("licensePlate")} data-testid="input-fine-plate" /></div>
            <div><Label htmlFor="nf-at">{t("admin.fines.fields.offenceAt")}</Label><Input id="nf-at" type="datetime-local" value={form.offenceAt} onChange={set("offenceAt")} required className={low("offenceAt")} data-testid="input-fine-offence-at" /></div>
            <div><Label htmlFor="nf-recv">{t("admin.fines.fields.receivedAt")}</Label><Input id="nf-recv" type="date" value={form.receivedAt} onChange={set("receivedAt")} /></div>
            <div><Label htmlFor="nf-ref">{t("admin.fines.fields.reference")}</Label><Input id="nf-ref" value={form.reference} onChange={set("reference")} className={low("reference")} /></div>
            <div><Label htmlFor="nf-amount">{t("admin.fines.fields.amount")}</Label><Input id="nf-amount" type="number" step="0.01" min="0" value={form.amount} onChange={set("amount")} required className={low("amount")} data-testid="input-fine-amount" /></div>
            <div><Label htmlFor="nf-fee">{t("admin.fines.fields.adminFee")}</Label><Input id="nf-fee" type="number" step="0.01" min="0" value={form.adminFee} onChange={set("adminFee")} /></div>
          </div>
          <div><Label htmlFor="nf-desc">{t("admin.fines.fields.description")}</Label><Input id="nf-desc" value={form.description} onChange={set("description")} required data-testid="input-fine-description" /></div>
          <div><Label htmlFor="nf-notes">{t("admin.fines.fields.internalNotes")}</Label><Textarea id="nf-notes" rows={2} value={form.internalNotes} onChange={set("internalNotes")} /></div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={closeNewFineDialog}>{t("admin.dialog.cancel")}</Button>
            <Button type="submit" disabled={save.isPending} data-testid="button-save-fine">{t("admin.fines.dialog.save")}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
