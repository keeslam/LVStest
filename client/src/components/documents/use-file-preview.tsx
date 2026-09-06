import { useState, type ReactNode } from "react";
import { PdfPreviewDialog } from "./pdf-preview-dialog";

/**
 * One way to open a PDF or image inside the app instead of in a new tab:
 * `const preview = useFilePreview();` then `preview.open(url, title)` and render
 * `{preview.dialog}` once in the component. Wraps the app-wide PdfPreviewDialog.
 */
export function useFilePreview(): { open: (url: string, title?: string) => void; dialog: ReactNode } {
  const [file, setFile] = useState<{ url: string; title?: string } | null>(null);
  return {
    open: (url, title) => setFile({ url, title }),
    dialog: <PdfPreviewDialog open={file !== null} onOpenChange={(o) => { if (!o) setFile(null); }} url={file?.url ?? null} title={file?.title} />,
  };
}
