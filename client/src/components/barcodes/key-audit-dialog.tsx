import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Camera, KeyRound, Printer, RotateCcw } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { apiRequest, invalidateByPrefix } from "@/lib/queryClient";
import { describeApiError } from "@/lib/api-error";
import { useToast } from "@/hooks/use-toast";
import { printKeyAudit } from "./key-audit-print";
import type { KeyAudit } from "@shared/schema";
import { KEY_AUDIT_NOTE_MAX } from "@shared/key-audit";
import { CameraScannerDialog } from "./camera-scanner-dialog";
import { formatLicensePlate } from "@/lib/format-utils";
import { Vehicle } from "@shared/schema";

export type KeyAuditMode = "main" | "spare";

interface KeyAuditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // "spare" audits the second key cabinet: only spare-key labels count, and the
  // set that should be hanging there is a different one.
  mode?: KeyAuditMode;
}

type ScannedEntry = { plate: string; spare: boolean };

type ViewState = "scanning" | "result";

// Physical key-cabinet audit: scan every key hanging in the cabinet, then
// compare the scanned set against every vehicle that's expected to be there
// (i.e. not currently out on rental) to surface what's missing or shouldn't
// be there.
export function KeyAuditDialog({ open, onOpenChange, mode = "main" }: KeyAuditDialogProps) {
  const isSpare = mode === "spare";
  const { t } = useTranslation(["barcodes", "common"]);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [alreadyScanned, setAlreadyScanned] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [scanned, setScanned] = useState<Map<number, ScannedEntry>>(new Map());
  const [view, setView] = useState<ViewState>("scanning");
  // A-3-12: the plate of the key that was scanned last, shown in green until the next scan.
  const [lastScanned, setLastScanned] = useState<string | null>(null);
  // Punt 15 / OPT-032: the note goes on the saved audit and its print; the saved audit is printed.
  const [note, setNote] = useState("");
  const [savedAudit, setSavedAudit] = useState<KeyAudit | null>(null);
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  // Synchronous mirror of `scanned` so the scan handler can check membership
  // and commit updates outside of a setState updater — React Strict Mode
  // double-invokes updaters, so they must stay pure (no setState calls inside).
  const scannedRef = useRef<Map<number, ScannedEntry>>(new Map());

  const { data: vehicles = [] } = useQuery<Vehicle[]>({ queryKey: ["/api/vehicles"] });

  const expected = useMemo(
    () => vehicles.filter(v => !v.outOfFleetDate && (
      isSpare
        // A spare key stays in the cabinet while the car is out - unless it was
        // handed to the customer, or the vehicle has no spare key at all.
        ? !!v.spareKey && !v.spareKeyWithCustomer
        : v.availabilityStatus !== "rented"
    )),
    [vehicles, isSpare],
  );

  useEffect(() => {
    if (open) {
      setCode("");
      setError(null);
      setAlreadyScanned(false);
      scannedRef.current = new Map();
      setScanned(new Map());
      setLastScanned(null);
      setView("scanning");
      setNote("");
      setSavedAudit(null);
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
      const scannedSpare = !!data.scannedSpareKey;
      // Scanning a main key during a spare audit (or the other way round) would
      // silently tick off the wrong key, so it is refused instead.
      if (isSpare && !scannedSpare) {
        setError(t("keyAudit.notASpareKey"));
        return;
      }
      if (!isSpare && scannedSpare) {
        setError(t("keyAudit.notAMainKey"));
        return;
      }
      if (scannedRef.current.has(vehicle.id)) {
        setAlreadyScanned(true);
      } else {
        scannedRef.current.set(vehicle.id, {
          plate: formatLicensePlate(vehicle.licensePlate),
          spare: scannedSpare,
        });
        setScanned(new Map(scannedRef.current));
        setLastScanned(formatLicensePlate(vehicle.licensePlate));
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
  // Kees, 2026-10-20: a spare key that is with a customer is not expected in the cabinet,
  // but it is written down — with the customer's name from the vehicle card.
  const withCustomer = isSpare
    ? vehicles.filter(v => !v.outOfFleetDate && !!v.spareKey && !!v.spareKeyWithCustomer && !scanned.has(v.id))
    : [];
  const withCustomerList = withCustomer.length > 0 && (
    <div>
      <h3 className="text-sm font-semibold text-blue-700 mb-1">{t("keyAudit.withCustomerHeading", { count: withCustomer.length })}</h3>
      <ul className="space-y-1 max-h-48 overflow-y-auto" data-testid="list-key-audit-with-customer">
        {withCustomer.map((v) => (
          <li key={v.id} className="border border-blue-200 bg-blue-50 text-blue-800 rounded-md px-3 py-1 text-sm">
            {formatLicensePlate(v.licensePlate)} — {v.brand} {v.model} · {v.spareKeyCustomerName || t("keyAudit.unknownCustomer")}
          </li>
        ))}
      </ul>
    </div>
  );
  // Newest first, so the key that was just scanned is at the top of the list.
  const scannedList = Array.from(scanned.values()).reverse();
  const unexpected = Array.from(scanned.keys())
    .map(id => vehicles.find(v => v.id === id))
    .filter((v): v is Vehicle => !!v && (
      isSpare
        // Hanging in the cabinet while the records say otherwise
        ? (!v.spareKey || !!v.spareKeyWithCustomer)
        : v.availabilityStatus === "rented"
    ));

  // Punt 15 / OPT-032: "Afronden" saves the audit for good; the result shows whether that worked.
  const save = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/key-audits", {
        mode,
        expectedCount: expected.length,
        missingIds: missing.map((v) => v.id),
        unexpectedIds: unexpected.map((v) => v.id),
        scannedIds: Array.from(scanned.keys()),
        withCustomerIds: withCustomer.map((v) => v.id),
        note: note.trim() || null,
      });
      return (await res.json()) as KeyAudit;
    },
    onSuccess: (audit) => {
      setSavedAudit(audit);
      invalidateByPrefix("/api/key-audits");
    },
    onError: (err) => toast({ variant: "destructive", title: t("keyAudit.saveFailedTitle"), description: describeApiError(err) }),
  });

  const finish = () => {
    setView("result");
    save.mutate();
  };

  const handleReset = () => {
    setNote("");
    setSavedAudit(null);
    scannedRef.current = new Map();
    setScanned(new Map());
    setLastScanned(null);
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
            {t(isSpare ? "keyAudit.spareTitle" : "keyAudit.title")}
          </DialogTitle>
          <DialogDescription>{t(isSpare ? "keyAudit.spareDescription" : "keyAudit.description")}</DialogDescription>
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
              {t(isSpare ? "keyAudit.spareScannedCount" : "keyAudit.scannedCount", { scanned: scanned.size, expected: expected.length })}
            </div>

            {lastScanned && !error && !alreadyScanned && (
              <div
                className="border border-green-200 bg-green-50 text-green-800 rounded-md p-3 text-sm font-medium"
                data-testid="text-key-audit-last-scanned"
                role="status"
              >
                {t("keyAudit.justScanned", { plate: lastScanned })}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <h3 className="text-sm font-semibold text-green-800 mb-1">
                  {t("keyAudit.scannedHeading", { count: scannedList.length })}
                </h3>
                {scannedList.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("keyAudit.noneScannedYet")}</p>
                ) : (
                  <ul className="space-y-1 max-h-48 overflow-y-auto" data-testid="list-key-audit-scanned">
                    {scannedList.map((entry) => (
                      <li key={entry.plate} className="border border-green-200 bg-green-50 text-green-800 rounded-md px-3 py-1 text-sm">
                        {entry.plate}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <h3 className="text-sm font-semibold text-red-700 mb-1">
                  {t("keyAudit.pendingHeading", { count: missing.length })}
                </h3>
                {missing.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("keyAudit.nonePending")}</p>
                ) : (
                  <ul className="space-y-1 max-h-48 overflow-y-auto" data-testid="list-key-audit-pending">
                    {missing.map((v) => (
                      <li key={v.id} className="border rounded-md px-3 py-1 text-sm">
                        {formatLicensePlate(v.licensePlate)} — {v.brand} {v.model}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
            {withCustomerList}

            <div className="space-y-1">
              <Label htmlFor="key-audit-note">{t("keyAudit.noteLabel")}</Label>
              <Textarea
                id="key-audit-note"
                rows={2}
                maxLength={KEY_AUDIT_NOTE_MAX}
                placeholder={t("keyAudit.notePlaceholder")}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                data-testid="input-key-audit-note"
              />
            </div>

            <Button
              className="justify-center"
              onClick={finish}
              data-testid="button-key-audit-finish"
            >
              {t("keyAudit.finishButton")}
            </Button>

            <CameraScannerDialog open={cameraOpen} onOpenChange={setCameraOpen} onScan={lookup} />
          </>
        ) : (
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-red-700 mb-2">{t(isSpare ? "keyAudit.spareMissingHeading" : "keyAudit.missingHeading")}</h3>
              {missing.length === 0 ? (
                <p className="text-sm text-muted-foreground" data-testid="text-key-audit-none-missing">
                  {t(isSpare ? "keyAudit.spareNoneMissing" : "keyAudit.noneMissing")}
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

            {withCustomerList}

            {unexpected.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-amber-700 mb-2">{t(isSpare ? "keyAudit.spareUnexpectedHeading" : "keyAudit.unexpectedHeading")}</h3>
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

            <p className="text-sm text-muted-foreground" data-testid="text-key-audit-saved">
              {save.isPending ? t("keyAudit.saving") : savedAudit ? t("keyAudit.saved") : save.isError ? t("keyAudit.notSaved") : ""}
            </p>
            {save.isError && (
              <Button variant="outline" className="justify-center" onClick={() => save.mutate()} data-testid="button-key-audit-retry-save">
                {t("keyAudit.retrySave")}
              </Button>
            )}

            <Button
              className="justify-center"
              disabled={!savedAudit}
              onClick={() => savedAudit && printKeyAudit(savedAudit)}
              data-testid="button-key-audit-print"
            >
              <Printer className="h-4 w-4 mr-2" />
              {t("keyAudit.printButton")}
            </Button>

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
