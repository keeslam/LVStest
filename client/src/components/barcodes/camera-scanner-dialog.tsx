import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface CameraScannerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onScan: (code: string) => void;
}

const REGION_ID = "barcode-camera-region";

// One Html5Qrcode instance per open dialog; always stopped+cleared on close or
// unmount so a second open never runs two camera streams at once.
export function CameraScannerDialog({ open, onOpenChange, onScan }: CameraScannerDialogProps) {
  const { t } = useTranslation(["barcodes"]);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setErrorKey(null);

    const scanner = new Html5Qrcode(REGION_ID, {
      formatsToSupport: [
        Html5QrcodeSupportedFormats.CODE_128,
        Html5QrcodeSupportedFormats.QR_CODE,
      ],
      verbose: false,
    });
    scannerRef.current = scanner;

    scanner
      .start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 280, height: 140 } },
        (decodedText) => {
          if (cancelled) return;
          cancelled = true;
          onScan(decodedText);
          onOpenChange(false);
        },
        () => { /* per-frame decode misses are expected; ignore */ }
      )
      .catch((error: unknown) => {
        const message = String(error);
        if (message.includes("NotAllowedError") || message.includes("Permission")) {
          setErrorKey("camera.permissionDenied");
        } else if (message.includes("NotFoundError") || message.includes("no camera")) {
          setErrorKey("camera.noCamera");
        } else {
          setErrorKey("camera.startError");
        }
      });

    return () => {
      cancelled = true;
      const current = scannerRef.current;
      scannerRef.current = null;
      if (current) {
        // stop() rejects if start() never succeeded; clear() is safe after.
        current.stop().catch(() => {}).finally(() => current.clear());
      }
    };
  }, [open, onScan, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("camera.dialogTitle")}</DialogTitle>
          <DialogDescription>{t("camera.dialogDescription")}</DialogDescription>
        </DialogHeader>
        {errorKey ? (
          <div className="border border-red-200 bg-red-50 text-red-700 rounded-md p-4">
            {t(errorKey)}
          </div>
        ) : (
          <div id={REGION_ID} className="w-full overflow-hidden rounded-md" />
        )}
        <Button variant="outline" onClick={() => onOpenChange(false)}>
          {t("camera.closeButton")}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
