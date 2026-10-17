import { useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogFooter,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";
import { releaseIframeFocus } from "@/lib/release-iframe-focus";
import { reportClientAction } from "@/lib/audit-events";

interface HtmlPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** A complete HTML document, rendered in a sandboxed iframe. `null` shows nothing. */
  html: string | null;
  title: string;
  /** Named in the activity log row (`report.print`), e.g. "apk" or the custom report's name. */
  reportName: string;
}

/**
 * The print preview for reports the client renders itself (the overview
 * reports and the report builder). Same dialog, same footer as the PDF
 * preview (PdfPreviewDialog): the employee sees the report first and prints
 * from here, instead of a hidden frame printing "somewhere" on click.
 *
 * The iframe is sandboxed without `allow-scripts`, as the hidden frame was
 * (FIX-R, BUG-102): the report HTML is built from database values and must
 * never run anything. `allow-modals` is what lets print() open the dialog.
 */
export function HtmlPreviewDialog({ open, onOpenChange, html, title, reportName }: HtmlPreviewDialogProps) {
  const { t } = useTranslation(["documents"]);
  const frameRef = useRef<HTMLIFrameElement>(null);

  const handlePrint = () => {
    const frame = frameRef.current;
    if (!frame?.contentWindow) return;
    reportClientAction("report.print", { details: { report: reportName } });
    frame.contentWindow.focus();
    frame.contentWindow.print();
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-6xl w-[90vw] h-[85vh] flex flex-col" data-testid="dialog-report-preview">
        <AlertDialogHeader className="flex-shrink-0">
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>
            {t('indexPage.documentPreviewDescription')}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="flex-1 overflow-hidden border rounded mb-4 bg-white">
          {html && (
            <iframe
              ref={frameRef}
              srcDoc={html}
              sandbox="allow-same-origin allow-modals"
              className="w-full h-full border-0"
              title={title}
              onLoad={(event) => releaseIframeFocus(event.currentTarget)}
              data-testid="iframe-report-preview"
            />
          )}
        </div>
        <AlertDialogFooter className="flex-shrink-0">
          <AlertDialogCancel onClick={() => onOpenChange(false)}>{t('indexPage.closeButton')}</AlertDialogCancel>
          <Button onClick={handlePrint} className="bg-blue-600 hover:bg-blue-700 text-white" data-testid="button-report-preview-print">
            <Printer className="h-4 w-4 mr-2" />
            {t('indexPage.printButton')}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
