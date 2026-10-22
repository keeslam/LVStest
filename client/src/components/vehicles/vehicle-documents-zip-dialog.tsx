import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Document } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { describeApiError } from "@/lib/api-error";
import { formatDate } from "@/lib/format-utils";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Download, Loader2 } from "lucide-react";

/**
 * B-65 (Kees, 2026-10-22): all documents of a vehicle as one ZIP. Every document starts
 * ticked; untick what should stay out. The server reads the files; a missing one is listed
 * in "ontbrekend.txt" inside the ZIP instead of failing the download.
 */
export function VehicleDocumentsZipDialog({ open, onOpenChange, vehicleId, documents }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vehicleId: number;
  documents: Document[];
}) {
  const { t } = useTranslation("vehicles");
  const { toast } = useToast();
  const [chosen, setChosen] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  // Every time the dialog opens, all documents are ticked again.
  useEffect(() => { if (open) setChosen(new Set(documents.map((d) => d.id))); }, [open, documents]);

  const toggle = (id: number) => setChosen((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const allChosen = documents.length > 0 && chosen.size === documents.length;

  const download = async () => {
    setBusy(true);
    try {
      const response = await apiRequest("POST", `/api/vehicle-documents/${vehicleId}/zip`, { ids: Array.from(chosen) });
      const blob = await response.blob();
      const name = /filename="([^"]+)"/.exec(response.headers.get("Content-Disposition") ?? "")?.[1] ?? "documenten.zip";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast({ title: t("details.documents.zip.done", { count: chosen.size }) });
      onOpenChange(false);
    } catch (error) {
      toast({ title: describeApiError(error as Error), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{t("details.documents.zip.title")}</DialogTitle>
          <DialogDescription>{t("details.documents.zip.description")}</DialogDescription>
        </DialogHeader>
        <label className="flex items-center gap-2 border-b pb-2 text-sm font-medium">
          <Checkbox checked={allChosen} onCheckedChange={(v) => setChosen(v ? new Set(documents.map((d) => d.id)) : new Set())} data-testid="checkbox-zip-all" />
          {t("details.documents.zip.all", { count: documents.length })}
        </label>
        <ul className="flex-1 space-y-1 overflow-y-auto py-1" data-testid="zip-document-list">
          {documents.map((d) => (
            <li key={d.id}>
              <label className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm hover:bg-muted/50">
                <Checkbox checked={chosen.has(d.id)} onCheckedChange={() => toggle(d.id)} data-testid={`checkbox-zip-doc-${d.id}`} />
                <Badge variant="outline" className="shrink-0 font-normal">{d.documentType}</Badge>
                <span className="min-w-0 flex-1 truncate" title={d.fileName}>{d.fileName}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{formatDate(d.uploadDate)}</span>
              </label>
            </li>
          ))}
        </ul>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t("common:actions.cancel")}</Button>
          <Button onClick={download} disabled={chosen.size === 0 || busy} data-testid="button-download-zip">
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
            {t("details.documents.zip.download", { count: chosen.size })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
