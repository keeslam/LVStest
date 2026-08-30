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
  const onScanRef = useRef(onScan);
  const onOpenChangeRef = useRef(onOpenChange);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  // Keep latest callbacks in refs to prevent effect restarts on parent re-render.
  useEffect(() => {
    onScanRef.current = onScan;
    onOpenChangeRef.current = onOpenChange;
  });

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setErrorKey(null);

    // Browsers only expose the camera in a secure context (https:// or
    // localhost). Over plain http:// on any other host, getUserMedia is
    // blocked WITHOUT ever showing a permission prompt — detect that up
    // front and explain it, instead of a misleading "permission denied".
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setErrorKey("camera.insecureContext");
      return;
    }

    // Defer scanner creation one frame to ensure DialogContent portal is mounted.
    const frameId = requestAnimationFrame(() => {
      if (cancelled) return;
      if (!document.getElementById(REGION_ID)) {
        setErrorKey("camera.startError");
        return;
      }

      let scanner: Html5Qrcode;
      try {
        scanner = new Html5Qrcode(REGION_ID, {
          formatsToSupport: [
            Html5QrcodeSupportedFormats.CODE_128,
            Html5QrcodeSupportedFormats.QR_CODE,
          ],
          verbose: false,
        });
      } catch (error: unknown) {
        setErrorKey("camera.startError");
        return;
      }

      if (cancelled) {
        try { scanner.clear(); } catch {}
        return;
      }

      scannerRef.current = scanner;

      scanner
        .start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 280, height: 140 } },
          (decodedText) => {
            if (cancelled) return;
            cancelled = true;
            onScanRef.current(decodedText);
            onOpenChangeRef.current(false);
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
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(frameId);
      const current = scannerRef.current;
      scannerRef.current = null;
      if (current) {
        // stop() can throw synchronously if never started; always clear even if stop fails.
        try {
          const maybe = current.stop();
          if (maybe && typeof (maybe as Promise<void>).catch === "function") {
            (maybe as Promise<void>).catch(() => {}).finally(() => { try { current.clear(); } catch {} });
          } else {
            try { current.clear(); } catch {}
          }
        } catch {
          try { current.clear(); } catch {}
        }
      }
    };
  }, [open]);

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
