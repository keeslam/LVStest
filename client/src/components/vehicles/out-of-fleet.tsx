/**
 * Punt 7 (Kees, 2026-10-20) — "Uit de vloot halen" on the vehicle card, the
 * block that says since when and why, and "Terug in de vloot". Nothing is
 * deleted: reservations, costs, documents and contracts stay with the vehicle.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation } from "@tanstack/react-query";
import { Archive, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, invalidateByPrefix } from "@/lib/queryClient";
import { parseApiError, describeApiError } from "@/lib/api-error";
import { officeToday } from "@/lib/office-date";
import { formatLicensePlate } from "@/lib/format-utils";
import { formatDutchDate } from "@shared/booking-warnings";
import { OUT_OF_FLEET_BLOCKED_CODE, OUT_OF_FLEET_REASONS, isOutOfFleet, type OutOfFleetReason } from "@shared/out-of-fleet";

type VehicleLike = {
  id: number;
  licensePlate: string;
  outOfFleetDate?: string | null;
  outOfFleetReason?: string | null;
  outOfFleetSalePrice?: string | number | null;
  outOfFleetBuyer?: string | null;
  outOfFleetNote?: string | null;
};

interface BlockingReservation { id: number; startDate: string; endDate: string | null; status: string; type: string }

function refresh(vehicleId: number) {
  invalidateByPrefix(`/api/vehicles/${vehicleId}`);
  invalidateByPrefix("/api/vehicles");
}

/** The button(s) in the card header: take out, or bring back. */
export function OutOfFleetControl({ vehicle }: { vehicle: VehicleLike }) {
  const { t } = useTranslation(["vehicles", "common"]);
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [confirmBack, setConfirmBack] = useState(false);
  const [date, setDate] = useState(officeToday());
  const [reason, setReason] = useState<OutOfFleetReason>("sold");
  const [salePrice, setSalePrice] = useState("");
  const [buyer, setBuyer] = useState("");
  const [note, setNote] = useState("");
  const [blocking, setBlocking] = useState<BlockingReservation[] | null>(null);

  const takeOut = useMutation({
    mutationFn: async () => apiRequest("POST", `/api/vehicles/${vehicle.id}/out-of-fleet`, {
      date, reason, salePrice: reason === "sold" ? salePrice : null, buyer: reason === "sold" ? buyer : null, note,
    }),
    onSuccess: () => {
      setOpen(false);
      refresh(vehicle.id);
      toast({ title: t("outOfFleet.doneTitle"), description: t("outOfFleet.doneDescription") });
    },
    onError: (error: any) => {
      if (error?.code === OUT_OF_FLEET_BLOCKED_CODE || parseApiError(error).code === OUT_OF_FLEET_BLOCKED_CODE) {
        setBlocking(Array.isArray(error?.blockingReservations) ? error.blockingReservations : []);
        return;
      }
      toast({ variant: "destructive", title: t("outOfFleet.failedTitle"), description: describeApiError(error) });
    },
  });

  const bringBack = useMutation({
    mutationFn: async () => apiRequest("POST", `/api/vehicles/${vehicle.id}/back-in-fleet`, {}),
    onSuccess: () => {
      setConfirmBack(false);
      refresh(vehicle.id);
      toast({ title: t("outOfFleet.backTitle") });
    },
    onError: (error) => toast({ variant: "destructive", title: t("outOfFleet.failedTitle"), description: describeApiError(error) }),
  });

  if (isOutOfFleet(vehicle)) {
    return (
      <>
        <Button variant="outline" onClick={() => setConfirmBack(true)} data-testid="button-back-in-fleet">
          <Undo2 className="h-4 w-4 mr-2" />
          {t("outOfFleet.backButton")}
        </Button>
        <ConfirmDialog
          open={confirmBack}
          onOpenChange={setConfirmBack}
          title={t("outOfFleet.backConfirmTitle", { plate: formatLicensePlate(vehicle.licensePlate) })}
          description={t("outOfFleet.backConfirmDescription")}
          confirmLabel={t("outOfFleet.backButton")}
          variant="info"
          isLoading={bringBack.isPending}
          onConfirm={() => bringBack.mutate()}
        />
      </>
    );
  }

  return (
    <>
      <Button variant="outline" onClick={() => { setBlocking(null); setDate(officeToday()); setOpen(true); }} data-testid="button-out-of-fleet">
        <Archive className="h-4 w-4 mr-2" />
        {t("outOfFleet.button")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("outOfFleet.title", { plate: formatLicensePlate(vehicle.licensePlate) })}</DialogTitle>
            <DialogDescription>{t("outOfFleet.description")}</DialogDescription>
          </DialogHeader>

          {blocking ? (
            <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-900 space-y-2" data-testid="out-of-fleet-blocked">
              <p className="font-medium">{t("outOfFleet.blocked")}</p>
              <ul className="list-disc pl-5">
                {blocking.map((r) => (
                  <li key={r.id}>
                    {t(r.type === "maintenance_block" ? "outOfFleet.blockingMaintenance" : "outOfFleet.blockingRental", {
                      id: r.id, start: formatDutchDate(r.startDate), end: r.endDate ? formatDutchDate(r.endDate) : "…",
                    })}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="oof-date">{t("outOfFleet.dateLabel")}</Label>
                <Input id="oof-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} data-testid="input-out-of-fleet-date" />
              </div>
              <div className="space-y-1">
                <Label>{t("outOfFleet.reasonLabel")}</Label>
                <Select value={reason} onValueChange={(v) => setReason(v as OutOfFleetReason)}>
                  <SelectTrigger data-testid="select-out-of-fleet-reason"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {OUT_OF_FLEET_REASONS.map((r) => <SelectItem key={r} value={r}>{t(`outOfFleet.reasons.${r}`)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {reason === "sold" && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="oof-price">{t("outOfFleet.salePriceLabel")}</Label>
                    <Input id="oof-price" inputMode="decimal" placeholder="0,00" value={salePrice} onChange={(e) => setSalePrice(e.target.value)} data-testid="input-out-of-fleet-price" />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="oof-buyer">{t("outOfFleet.buyerLabel")}</Label>
                    <Input id="oof-buyer" value={buyer} onChange={(e) => setBuyer(e.target.value)} data-testid="input-out-of-fleet-buyer" />
                  </div>
                </div>
              )}
              <div className="space-y-1">
                <Label htmlFor="oof-note">{t("outOfFleet.noteLabel")}</Label>
                <Textarea id="oof-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} data-testid="input-out-of-fleet-note" />
              </div>
              <p className="text-xs text-muted-foreground">{t("outOfFleet.keepsHistory")}</p>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>{t("common:actions.cancel")}</Button>
            {!blocking && (
              <Button onClick={() => takeOut.mutate()} disabled={takeOut.isPending || !date} data-testid="button-confirm-out-of-fleet">
                {t("outOfFleet.confirm")}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** The block on the card of a vehicle that is out of the fleet. */
export function OutOfFleetBanner({ vehicle }: { vehicle: VehicleLike }) {
  const { t } = useTranslation("vehicles");
  if (!isOutOfFleet(vehicle)) return null;
  const reason = vehicle.outOfFleetReason && (OUT_OF_FLEET_REASONS as readonly string[]).includes(vehicle.outOfFleetReason)
    ? t(`outOfFleet.reasons.${vehicle.outOfFleetReason}`) : vehicle.outOfFleetReason;
  const price = vehicle.outOfFleetSalePrice != null && vehicle.outOfFleetSalePrice !== ""
    ? `€ ${Number(vehicle.outOfFleetSalePrice).toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : null;
  return (
    <div className="rounded-lg border border-gray-300 bg-gray-100 p-4 text-sm" data-testid="out-of-fleet-banner">
      <p className="font-semibold flex items-center gap-2">
        <Archive className="h-4 w-4" />
        {t("outOfFleet.bannerTitle", { date: formatDutchDate(vehicle.outOfFleetDate) })}
      </p>
      <p className="mt-1 text-gray-700">
        {[reason, price, vehicle.outOfFleetBuyer].filter(Boolean).join(" · ")}
      </p>
      {vehicle.outOfFleetNote && <p className="mt-1 text-gray-600 whitespace-pre-line">{vehicle.outOfFleetNote}</p>}
      <p className="mt-2 text-xs text-gray-500">{t("outOfFleet.bannerHint")}</p>
    </div>
  );
}
