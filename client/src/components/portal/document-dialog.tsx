import { useTranslation } from "react-i18next";
import type { PortalDocumentDto } from "@shared/portal-types";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";

const PREVIEWABLE = /\.(pdf|png|jpe?g|gif|webp)$/i;

/** Shows a contract or damage form inline (PDF/image) with a download button. */
export function DocumentDialog({ document, onClose }: { document: PortalDocumentDto | null; onClose: () => void }) {
  const { t } = useTranslation("portal");
  const d = document;
  const inlineUrl = d ? `/api/portal/documents/${d.id}/download?inline=1` : "";
  const downloadUrl = d ? `/api/portal/documents/${d.id}/download` : "";
  const canPreview = Boolean(d && PREVIEWABLE.test(d.fileName));
  const isImage = Boolean(d && /\.(png|jpe?g|gif|webp)$/i.test(d.fileName));

  return (
    <Dialog open={d !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[92vh] max-w-4xl flex-col" data-testid="portal-document-dialog">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2 pr-8">
            <span className="rounded bg-muted px-1.5 py-0.5 text-xs font-normal">{d ? t(`documents.${d.kind}`) : ""}</span>
            <span className="truncate">{d?.fileName}</span>
          </DialogTitle>
        </DialogHeader>
        {d && (
          <div className="flex-1 overflow-hidden rounded-md border bg-muted/30">
            {canPreview ? (
              isImage
                ? <img src={inlineUrl} alt={d.fileName} className="mx-auto max-h-[70vh] object-contain" />
                : <iframe src={inlineUrl} title={d.fileName} className="h-[70vh] w-full" />
            ) : (
              <p className="p-6 text-center text-sm text-muted-foreground">{t("documents.noPreview")}</p>
            )}
          </div>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>{t("actions.cancel")}</Button>
          <Button asChild><a href={downloadUrl} target="_blank" rel="noopener"><Download className="mr-1 h-4 w-4" />{t("actions.download")}</a></Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
