import { useState, useEffect } from "react";
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

interface PdfPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  url: string | null;
  title?: string;
}

// Same in-app iframe preview pattern used by the Documents page, so PDFs
// (receipts, etc.) open consistently across the app instead of in a new tab.
export function PdfPreviewDialog({ open, onOpenChange, url, title }: PdfPreviewDialogProps) {
  const { t } = useTranslation(["documents"]);
  const [iframeError, setIframeError] = useState(false);

  useEffect(() => {
    if (open) setIframeError(false);
  }, [open, url]);

  const handlePrint = () => {
    if (!url) return;

    if (!iframeError) {
      const iframe = document.getElementById('pdf-preview-iframe') as HTMLIFrameElement;
      if (iframe && iframe.contentWindow) {
        try {
          iframe.contentWindow.print();
          return;
        } catch (error) {
          console.log('Failed to print from preview iframe:', error);
        }
      }
    }

    const printWindow = window.open(
      url,
      'printWindow',
      'width=800,height=600,scrollbars=yes,resizable=yes,toolbar=no,menubar=no,location=no,status=no'
    );
    if (printWindow) {
      printWindow.onload = () => {
        setTimeout(() => {
          try {
            printWindow.print();
          } catch (error) {
            console.log('Failed to print from popup window:', error);
          }
        }, 500);
      };
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-6xl w-[90vw] h-[85vh] flex flex-col">
        <AlertDialogHeader className="flex-shrink-0">
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>
            {t('indexPage.documentPreviewDescription')}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="flex-1 overflow-hidden border rounded mb-4">
          {url && !iframeError && (
            <iframe
              id="pdf-preview-iframe"
              src={url}
              className="w-full h-full border-0"
              title={t('indexPage.documentPreviewIframeTitle')}
              onError={() => setIframeError(true)}
            />
          )}
          {url && iframeError && (
            <div className="flex flex-col items-center justify-center h-full p-8 text-center">
              <div className="mb-4">
                <svg className="w-16 h-16 mx-auto text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">{t('indexPage.previewBlockedTitle')}</h3>
              <p className="text-gray-600 mb-4">
                {t('indexPage.previewBlockedDescription')}
              </p>
              <Button
                onClick={() => window.open(url, '_blank')}
                variant="outline"
                className="mb-2"
              >
                {t('indexPage.openInNewTabButton')}
              </Button>
            </div>
          )}
        </div>
        <AlertDialogFooter className="flex-shrink-0">
          <AlertDialogCancel onClick={() => onOpenChange(false)}>{t('indexPage.closeButton')}</AlertDialogCancel>
          <Button onClick={handlePrint} className="bg-blue-600 hover:bg-blue-700 text-white">
            <Printer className="h-4 w-4 mr-2" />
            {t('indexPage.printButton')}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
