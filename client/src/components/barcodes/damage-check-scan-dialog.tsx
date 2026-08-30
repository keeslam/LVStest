import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Camera, ScanLine, ArrowRight } from "lucide-react";
import { CameraScannerDialog } from "./camera-scanner-dialog";
import { Vehicle } from "@shared/schema";

// Projection served by GET /api/barcodes/:code (see server/routes.ts).
type ScanReservation = {
  id: number;
  status: string;
  startDate: string;
  endDate: string | null;
  customer: { name: string } | null;
};

export interface DamageCheckScanResult {
  vehicleId: number;
  checkType: "pickup" | "return";
  reservationId?: number;
}

interface DamageCheckScanDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Fired after a successful scan; the caller opens the damage check with these values. */
  onResolved: (result: DamageCheckScanResult, vehicle: Vehicle) => void;
  /** Fired when the user chooses to continue without scanning. */
  onSkip: () => void;
}

// Pre-step for the dashboard's "start damage check" quick action: scan the
// barcode on the vehicle key label and the damage check opens with the right
// vehicle AND the right check type — a picked-up rental gets the return
// check, an upcoming/started-but-not-picked-up rental gets the pickup check.
export function DamageCheckScanDialog({ open, onOpenChange, onResolved, onSkip }: DamageCheckScanDialogProps) {
  const { t } = useTranslation(["barcodes", "common"]);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setCode("");
      setError(null);
      // Focus after the dialog portal mounts so USB scanners land here.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const lookup = async (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) return;
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/barcodes/${encodeURIComponent(trimmed)}`, { credentials: "include" });
      if (response.status === 404) {
        setError(t("scanPage.notFound", { code: trimmed }));
        return;
      }
      if (!response.ok) {
        setError(t("scanPage.lookupError"));
        return;
      }
      const data = await response.json();
      if (data.type !== "vehicle") {
        // A reservation barcode still identifies a vehicle when one is linked.
        if (data.type === "reservation" && data.vehicle) {
          const reservation: ScanReservation = data.reservation;
          onResolved(
            {
              vehicleId: data.vehicle.id,
              checkType: reservation.status === "picked_up" ? "return" : "pickup",
              reservationId: reservation.id,
            },
            data.vehicle,
          );
          return;
        }
        setError(t("scanPage.notFound", { code: trimmed }));
        return;
      }

      const vehicle: Vehicle = data.vehicle;
      const active: ScanReservation | null = data.activeReservation;
      const upcoming: ScanReservation | null = data.upcomingReservation;

      // Picked up → the vehicle is coming back: return check.
      // Otherwise (booked/upcoming or no reservation) → pickup check.
      const checkType: "pickup" | "return" = active?.status === "picked_up" ? "return" : "pickup";
      const reservationId = active?.id ?? upcoming?.id;

      onResolved({ vehicleId: vehicle.id, checkType, reservationId }, vehicle);
    } catch {
      setError(t("scanPage.lookupError"));
    } finally {
      setIsLoading(false);
      setCode("");
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    lookup(code);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ScanLine className="h-5 w-5" />
            {t("damageScan.dialogTitle")}
          </DialogTitle>
          <DialogDescription>{t("damageScan.description")}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex gap-2">
          <Input
            ref={inputRef}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder={t("scanPage.inputPlaceholder")}
            aria-label={t("scanPage.inputPlaceholder")}
            autoComplete="off"
            data-testid="input-damage-check-scan"
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

        <Button variant="ghost" className="justify-center" onClick={onSkip} data-testid="button-damage-check-skip-scan">
          {t("damageScan.skipButton")}
          <ArrowRight className="h-4 w-4 ml-2" />
        </Button>

        <CameraScannerDialog open={cameraOpen} onOpenChange={setCameraOpen} onScan={lookup} />
      </DialogContent>
    </Dialog>
  );
}
