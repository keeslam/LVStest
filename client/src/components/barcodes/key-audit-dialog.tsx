import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Camera, KeyRound, RotateCcw } from "lucide-react";
import { CameraScannerDialog } from "./camera-scanner-dialog";
import { formatLicensePlate } from "@/lib/format-utils";
import { Vehicle } from "@shared/schema";

interface KeyAuditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type ScannedEntry = { plate: string; spare: boolean };

type ViewState = "scanning" | "result";

// Physical key-cabinet audit: scan every key hanging in the cabinet, then
// compare the scanned set against every vehicle that's expected to be there
// (i.e. not currently out on rental) to surface what's missing or shouldn't
// be there.
export function KeyAuditDialog({ open, onOpenChange }: KeyAuditDialogProps) {
  const { t } = useTranslation(["barcodes", "common"]);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [alreadyScanned, setAlreadyScanned] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [scanned, setScanned] = useState<Map<number, ScannedEntry>>(new Map());
  const [view, setView] = useState<ViewState>("scanning");
  const inputRef = useRef<HTMLInputElement>(null);
  // Synchronous mirror of `scanned` so the scan handler can check membership
  // and commit updates outside of a setState updater — React Strict Mode
  // double-invokes updaters, so they must stay pure (no setState calls inside).
  const scannedRef = useRef<Map<number, ScannedEntry>>(new Map());

  const { data: vehicles = [] } = useQuery<Vehicle[]>({ queryKey: ["/api/vehicles"] });

  const expected = useMemo(
    () => vehicles.filter(v => v.availabilityStatus !== "rented"),
    [vehicles],
  );

  useEffect(() => {
    if (open) {
      setCode("");
      setError(null);
      setAlreadyScanned(false);
      scannedRef.current = new Map();
      setScanned(new Map());
      setView("scanning");
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const lookup = async (raw: string) => {
    if (isLoading) return; // a fast hardware scanner can fire faster than a fetch resolves
    const trimmed = raw.trim();
    if (!trimmed) return;
    setIsLoading(true);
    setError(null);
    setAlreadyScanned(false);
    try {
      const response = await fetch(`/api/barcodes/${encodeURIComponent(trimmed)}`, { credentials: "include" });
      if (response.status === 404) {
        setError(t("keyAudit.unknownCode", { code: trimmed }));
        return;
      }
      if (!response.ok) {
        setError(t("scanPage.lookupError"));
        return;
      }
      const data = await response.json();
      if (data.type === "reservation") {
        setError(t("keyAudit.notAVehicle"));
        return;
      }
      if (data.type !== "vehicle") {
        setError(t("keyAudit.unknownCode", { code: trimmed }));
        return;
      }

      const vehicle: Vehicle = data.vehicle;
      if (scannedRef.current.has(vehicle.id)) {
        setAlreadyScanned(true);
      } else {
        scannedRef.current.set(vehicle.id, {
          plate: formatLicensePlate(vehicle.licensePlate),
          spare: !!data.scannedSpareKey,
        });
        setScanned(new Map(scannedRef.current));
      }
    } catch {
      setError(t("scanPage.lookupError"));
    } finally {
      setIsLoading(false);
      setCode("");
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;
    lookup(code);
  };

  const missing = expected.filter(v => !scanned.has(v.id));
  const unexpected = Array.from(scanned.keys())
    .map(id => vehicles.find(v => v.id === id))
    .filter((v): v is Vehicle => !!v && v.availabilityStatus === "rented");

  const handleReset = () => {
    scannedRef.current = new Map();
    setScanned(new Map());
    setView("scanning");
    setCode("");
    setError(null);
    setAlreadyScanned(false);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5" />
            {t("keyAudit.title")}
          </DialogTitle>
          <DialogDescription>{t("keyAudit.description")}</DialogDescription>
        </DialogHeader>

        {view === "scanning" ? (
          <>
            <form onSubmit={handleSubmit} className="flex gap-2">
              <Input
                ref={inputRef}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder={t("scanPage.inputPlaceholder")}
                aria-label={t("scanPage.inputPlaceholder")}
                autoComplete="off"
                data-testid="input-key-audit-scan"
              />
              <Button type="submit" disabled={isLoading || !code.trim()}>
                {isLoading ? t("scanPage.scanning") : t("scanPage.searchButton")}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setCameraOpen(true)}
                title={t("scanPage.cameraButton")}
                aria-label={t("scanPage.cameraButton")}
              >
                <Camera className="h-4 w-4" />
              </Button>
            </form>

            {error && (
              <div className="border border-red-200 bg-red-50 text-red-700 rounded-md p-3 text-sm" role="alert">
                {error}
              </div>
            )}
            {alreadyScanned && !error && (
              <div className="text-sm text-muted-foreground" data-testid="text-key-audit-already-scanned">
                {t("keyAudit.alreadyScanned")}
              </div>
            )}

            <div className="text-sm text-muted-foreground" data-testid="text-key-audit-count">
              {t("keyAudit.scannedCount", { scanned: scanned.size, expected: expected.length })}
            </div>

            <Button
              className="justify-center"
              onClick={() => setView("result")}
              data-testid="button-key-audit-finish"
            >
              {t("keyAudit.finishButton")}
            </Button>

            <CameraScannerDialog open={cameraOpen} onOpenChange={setCameraOpen} onScan={lookup} />
          </>
        ) : (
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-red-700 mb-2">{t("keyAudit.missingHeading")}</h3>
              {missing.length === 0 ? (
                <p className="text-sm text-muted-foreground" data-testid="text-key-audit-none-missing">
                  {t("keyAudit.noneMissing")}
                </p>
              ) : (
                <ul className="space-y-1" data-testid="list-key-audit-missing">
                  {missing.map(v => (
                    <li
                      key={v.id}
                      className="border border-red-200 bg-red-50 text-red-700 rounded-md px-3 py-2 text-sm"
                    >
                      {formatLicensePlate(v.licensePlate)} — {v.brand} {v.model}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {unexpected.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-amber-700 mb-2">{t("keyAudit.unexpectedHeading")}</h3>
                <ul className="space-y-1" data-testid="list-key-audit-unexpected">
                  {unexpected.map(v => (
                    <li
                      key={v.id}
                      className="border border-amber-200 bg-amber-50 text-amber-700 rounded-md px-3 py-2 text-sm"
                    >
                      {formatLicensePlate(v.licensePlate)} — {v.brand} {v.model}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <Button
              variant="outline"
              className="justify-center"
              onClick={handleReset}
              data-testid="button-key-audit-reset"
            >
              <RotateCcw className="h-4 w-4 mr-2" />
              {t("keyAudit.resetButton")}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
