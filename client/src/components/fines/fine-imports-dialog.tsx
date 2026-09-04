import { useRef } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Loader2, Upload, RefreshCw, Download } from "lucide-react";
import type { FineImportFile } from "@shared/schema";
import type { CjibRunSummary } from "@shared/fines";
import { apiRequest, invalidateByPrefix } from "@/lib/queryClient";
import { useGlobalDialog } from "@/contexts/GlobalDialogContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useCanManageFines } from "./fines-table";

interface ImportStatus { enabled: boolean; host: string; running: boolean; lastRun: CjibRunSummary | null; scheduledMinutes: number | null }

/** Log of received/uploaded CJIB files with "fetch now" and manual upload. Rows open the fines of that file. */
export function FineImportsDialog() {
  const { t } = useTranslation("portal");
  const { toast } = useToast();
  const { dialogState, closeFineImportsDialog, openPortalListDialog } = useGlobalDialog();
  const open = dialogState.fineImports.open;
  const canManage = useCanManageFines();
  const fileInput = useRef<HTMLInputElement>(null);
  const { data: files = [] } = useQuery<FineImportFile[]>({ queryKey: ["/api/fines/imports"], queryFn: async () => (await apiRequest("GET", "/api/fines/imports")).json(), enabled: open });
  const { data: status } = useQuery<ImportStatus>({ queryKey: ["/api/fines/imports/status"], queryFn: async () => (await apiRequest("GET", "/api/fines/imports/status")).json(), enabled: open, refetchInterval: open ? 15_000 : false });

  const done = () => invalidateByPrefix("/api/fines");
  const run = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/fines/imports/run")).json() as Promise<CjibRunSummary>,
    onSuccess: (s) => { done(); toast({ title: t("admin.fines.cjib.runDone", { files: s.files, created: s.created, linked: s.linked }), description: s.errors.join("\n") || undefined, variant: s.errors.length ? "destructive" : "default" }); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });
  const upload = useMutation({
    mutationFn: async (file: File) => {
      const body = new FormData(); body.append("file", file);
      const res = await fetch("/api/fines/imports/upload", { method: "POST", body, credentials: "include" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message ?? res.statusText);
      return res.json() as Promise<{ file: FineImportFile; skipped: boolean }>;
    },
    onSuccess: ({ file, skipped }) => {
      done();
      toast({ title: skipped ? t("admin.fines.cjib.uploadSkipped") : t("admin.fines.cjib.uploadDone", { created: file.recordsCreated, linked: file.recordsLinked }), variant: file.status === "failed" ? "destructive" : "default", description: file.errorMessage ?? undefined });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const sourceLabel = (s: string) => t(`admin.fines.cjib.source.${s}`, { defaultValue: s });
  const fmt = (iso: string | Date | null) => (iso ? new Date(iso).toLocaleString() : "—");

  return (
    <Dialog open={open} onOpenChange={(o) => !o && closeFineImportsDialog()}>
      <DialogContent className="max-w-[95vw] max-h-[90vh] flex flex-col">
        <DialogHeader><DialogTitle>{t("admin.fines.cjib.importsTitle")}</DialogTitle></DialogHeader>
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/30 p-3 text-sm">
          <div className="space-y-0.5">
            <div>
              {status?.enabled
                ? <Badge className="bg-green-600 hover:bg-green-600">{t("admin.fines.cjib.statusOn", { minutes: status.scheduledMinutes ?? "?" })}</Badge>
                : <Badge variant="secondary">{t("admin.fines.cjib.statusOff")}</Badge>}
              {status?.running && <span className="ml-2 inline-flex items-center gap-1 text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />{t("admin.fines.cjib.running")}</span>}
            </div>
            <div className="text-muted-foreground">
              {status?.lastRun
                ? t("admin.fines.cjib.lastRun", { at: fmt(status.lastRun.finishedAt), files: status.lastRun.files, created: status.lastRun.created, errors: status.lastRun.errors.length })
                : t("admin.fines.cjib.noRun")}
            </div>
          </div>
          {canManage && (
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => run.mutate()} disabled={run.isPending || !status?.host} data-testid="button-cjib-run">
                {run.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1.5 h-4 w-4" />}{t("admin.fines.cjib.runNow")}
              </Button>
              <Button size="sm" variant="outline" onClick={() => fileInput.current?.click()} disabled={upload.isPending} data-testid="button-cjib-upload">
                {upload.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Upload className="mr-1.5 h-4 w-4" />}{t("admin.fines.cjib.upload")}
              </Button>
              <input ref={fileInput} type="file" accept=".xml,.csv,.txt" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) upload.mutate(f); e.target.value = ""; }} data-testid="input-cjib-upload" />
            </div>
          )}
        </div>
        <div className="flex-1 overflow-auto">
          {files.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">{t("admin.fines.cjib.empty")}</p> : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>{t("admin.fines.cjib.columns.receivedAt")}</TableHead>
                <TableHead>{t("admin.fines.cjib.columns.file")}</TableHead>
                <TableHead>{t("admin.fines.cjib.columns.source")}</TableHead>
                <TableHead className="text-right">{t("admin.fines.cjib.columns.total")}</TableHead>
                <TableHead className="text-right">{t("admin.fines.cjib.columns.created")}</TableHead>
                <TableHead className="text-right">{t("admin.fines.cjib.columns.linked")}</TableHead>
                <TableHead className="text-right">{t("admin.fines.cjib.columns.duplicate")}</TableHead>
                <TableHead className="text-right">{t("admin.fines.cjib.columns.failed")}</TableHead>
                <TableHead>{t("admin.fines.cjib.columns.status")}</TableHead>
                <TableHead />
              </TableRow></TableHeader>
              <TableBody>
                {files.map((f) => (
                  <TableRow key={f.id} className="cursor-pointer hover:bg-muted/40" onClick={() => { closeFineImportsDialog(); openPortalListDialog("fines", { importFileId: f.id }); }} data-testid={`import-file-${f.id}`}>
                    <TableCell className="whitespace-nowrap">{fmt(f.receivedAt)}</TableCell>
                    <TableCell className="max-w-[220px] truncate" title={f.fileName}>{f.fileName}</TableCell>
                    <TableCell>{sourceLabel(f.source)}</TableCell>
                    <TableCell className="text-right">{f.recordsTotal}</TableCell>
                    <TableCell className="text-right">{f.recordsCreated}</TableCell>
                    <TableCell className="text-right">{f.recordsLinked}</TableCell>
                    <TableCell className="text-right">{f.recordsDuplicate}</TableCell>
                    <TableCell className={`text-right ${f.recordsFailed ? "text-destructive" : ""}`}>{f.recordsFailed}</TableCell>
                    <TableCell>
                      {f.status === "failed" ? <Badge variant="destructive" title={f.errorMessage ?? ""}>{t("admin.fines.cjib.failed")}</Badge> : <Badge variant="secondary">{t("admin.fines.cjib.processed")}</Badge>}
                      {f.errorMessage && <div className="max-w-[240px] truncate text-xs text-destructive" title={f.errorMessage}>{f.errorMessage}</div>}
                    </TableCell>
                    <TableCell>
                      {f.rawPath && <a href={`/api/fines/imports/${f.id}/file`} onClick={(e) => e.stopPropagation()} className="text-muted-foreground hover:text-foreground" title={t("admin.fines.cjib.download")}><Download className="h-4 w-4" /></a>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
