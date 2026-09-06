import { useTranslation } from "react-i18next";
import type { PortalDocumentDto } from "@shared/portal-types";
import { PdfPreviewDialog } from "@/components/documents/pdf-preview-dialog";

/** A contract or damage form in the app-wide PDF viewer (same one staff use). */
export function DocumentDialog({ document, onClose }: { document: PortalDocumentDto | null; onClose: () => void }) {
  const { t } = useTranslation("portal");
  const d = document;
  return (
    <PdfPreviewDialog open={d !== null} onOpenChange={(o) => !o && onClose()}
      url={d ? `/api/portal/documents/${d.id}/download?inline=1` : null}
      title={d ? `${t(`documents.${d.kind}`)} · ${d.fileName}` : undefined} />
  );
}
