/**
 * OPT-010 — "Micro-bewerkdialogen".
 *
 * Changing one field meant opening the full 23-field form and sending the whole
 * row back. That re-send is the mechanism behind BUG-202 (every save failed)
 * and behind BUG-172's lost update: a colleague's edit, made while the form was
 * open, was overwritten by stale values the form still held. The most common
 * customer question of all — "kan ik een dag later inleveren?" — had no working
 * gesture; what remained was dragging in the calendar, or a dialog that hit
 * `/basic` and rewrote the whole row.
 *
 * `edit-contract-number-dialog.tsx` already proved the pattern works and is
 * cheap. These are its three siblings.
 *
 * The risk the report names is a sixth write path without validation, so these
 * dialogs deliberately have no endpoint of their own: each sends only the
 * fields it owns to `PATCH /api/reservations/:id` — the same handler the full
 * form uses, which since FIX-D holds only the fields the request sent and since
 * FIX-F runs the conflict check inside the write transaction (plus the
 * blacklist check, B-07's price recalculation and B-09's maintenance warning).
 */
import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { VehicleSelector } from "@/components/ui/vehicle-selector";
import { CustomerSearchPicker } from "@/components/customers/customer-search-picker";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, invalidateByPrefix } from "@/lib/queryClient";
import type { Customer, Reservation, Vehicle } from "@shared/schema";

/** Exactly the fields each dialog owns. Nothing else may be sent. */
export const QUICK_EDIT_FIELDS = {
  dates: ["startDate", "endDate"],
  customer: ["customerId"],
  vehicle: ["vehicleId"],
} as const;

export type QuickEditKind = keyof typeof QUICK_EDIT_FIELDS;

/**
 * Keeps only the fields this dialog owns. The guard is the point: a micro
 * dialog that sends a field it does not own is the sixth write path the report
 * warns about.
 */
export function onlyOwnedFields(
  kind: QuickEditKind,
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const owned = QUICK_EDIT_FIELDS[kind] as readonly string[];
  return Object.fromEntries(Object.entries(payload).filter(([key]) => owned.includes(key)));
}

interface QuickEditShellProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  testId: string;
  canSave: boolean;
  isSaving: boolean;
  onSave: () => void;
  children: ReactNode;
}

function QuickEditShell({
  open, onOpenChange, title, description, testId, canSave, isSaving, onSave, children,
}: QuickEditShellProps) {
  const { t } = useTranslation(["reservations", "common"]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[460px]" data-testid={testId}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">{children}</div>

        <DialogFooter>
          <Button variant="outline" type="button" onClick={() => onOpenChange(false)} disabled={isSaving}>
            {t('common:actions.cancel')}
          </Button>
          <Button type="button" onClick={onSave} disabled={!canSave} data-testid={`${testId}-save`}>
            {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {t('common:actions.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** The one mutation all three share: same endpoint, same error handling. */
function useQuickEdit(kind: QuickEditKind, reservationId: number, onSaved?: () => void) {
  const { t } = useTranslation(["reservations", "common"]);
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const body = onlyOwnedFields(kind, payload);
      const response = await apiRequest("PATCH", `/api/reservations/${reservationId}`, body);
      return response.json();
    },
    onSuccess: async () => {
      toast({ title: t(`quickEdit.${kind}.savedTitle`) });
      await invalidateByPrefix("/api/reservations");
      await invalidateByPrefix("/api/vehicles");
      onSaved?.();
    },
    onError: (error: any) => {
      // The conflict check lives in the shared handler; a 409 arrives here the
      // same way it does for the full form.
      const raw = String(error?.message ?? "").replace(/^\d+:\s*/, "");
      toast({
        variant: "destructive",
        title: t(`quickEdit.${kind}.failedTitle`),
        description: raw || t('common:messages.tryAgain', { defaultValue: raw }),
      });
    },
  });
}

interface BaseProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reservation: Pick<Reservation, "id" | "startDate" | "endDate" | "customerId" | "vehicleId">;
  onSaved?: () => void;
}

/** "Datums wijzigen" — the answer to "kan ik een dag later inleveren?". */
export function EditDatesDialog({ open, onOpenChange, reservation, onSaved }: BaseProps) {
  const { t } = useTranslation(["reservations", "common"]);
  const [startDate, setStartDate] = useState(reservation.startDate ?? "");
  const [endDate, setEndDate] = useState(reservation.endDate ?? "");

  useEffect(() => {
    if (open) {
      setStartDate(reservation.startDate ?? "");
      setEndDate(reservation.endDate ?? "");
    }
  }, [open, reservation.startDate, reservation.endDate]);

  const save = useQuickEdit("dates", reservation.id, () => { onOpenChange(false); onSaved?.(); });

  const changed = startDate !== (reservation.startDate ?? "") || endDate !== (reservation.endDate ?? "");
  const rangeValid = startDate !== "" && (endDate === "" || endDate >= startDate);

  return (
    <QuickEditShell
      open={open}
      onOpenChange={onOpenChange}
      title={t('quickEdit.dates.title')}
      description={t('quickEdit.dates.description')}
      testId="dialog-quick-edit-dates"
      canSave={changed && rangeValid && !save.isPending}
      isSaving={save.isPending}
      onSave={() => save.mutate({ startDate, endDate: endDate === "" ? null : endDate })}
    >
      <div className="space-y-1.5">
        <Label htmlFor="quick-edit-start">{t('quickEdit.dates.startLabel')}</Label>
        <Input
          id="quick-edit-start"
          type="date"
          value={startDate}
          onChange={(event) => setStartDate(event.target.value)}
          data-testid="input-quick-edit-start"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="quick-edit-end">{t('quickEdit.dates.endLabel')}</Label>
        <Input
          id="quick-edit-end"
          type="date"
          value={endDate}
          onChange={(event) => setEndDate(event.target.value)}
          data-testid="input-quick-edit-end"
        />
      </div>
      {!rangeValid && (
        <p className="text-sm text-destructive" data-testid="quick-edit-dates-invalid">
          {t('quickEdit.dates.invalidRange')}
        </p>
      )}
    </QuickEditShell>
  );
}

/** "Klant wijzigen". */
export function EditCustomerDialog({ open, onOpenChange, reservation, onSaved }: BaseProps) {
  const { t } = useTranslation(["reservations", "common"]);
  const [customerId, setCustomerId] = useState<number | null>(reservation.customerId ?? null);

  useEffect(() => {
    if (open) setCustomerId(reservation.customerId ?? null);
  }, [open, reservation.customerId]);

  const { data: customers = [] } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
    enabled: open,
  });

  const save = useQuickEdit("customer", reservation.id, () => { onOpenChange(false); onSaved?.(); });

  return (
    <QuickEditShell
      open={open}
      onOpenChange={onOpenChange}
      title={t('quickEdit.customer.title')}
      description={t('quickEdit.customer.description')}
      testId="dialog-quick-edit-customer"
      canSave={customerId !== null && customerId !== (reservation.customerId ?? null) && !save.isPending}
      isSaving={save.isPending}
      onSave={() => save.mutate({ customerId })}
    >
      <CustomerSearchPicker
        customers={customers}
        value={customerId}
        onChange={setCustomerId}
        searchPlaceholder={t('quickEdit.customer.searchPlaceholder')}
        emptyText={t('quickEdit.customer.noResults')}
        changeLabel={t('quickEdit.customer.changeLabel')}
        autoFocus
      />
    </QuickEditShell>
  );
}

/** "Voertuig wijzigen". */
export function EditVehicleDialog({ open, onOpenChange, reservation, onSaved }: BaseProps) {
  const { t } = useTranslation(["reservations", "common"]);
  const [vehicleId, setVehicleId] = useState<string>(
    reservation.vehicleId ? String(reservation.vehicleId) : "",
  );

  useEffect(() => {
    if (open) setVehicleId(reservation.vehicleId ? String(reservation.vehicleId) : "");
  }, [open, reservation.vehicleId]);

  const { data: vehicles = [] } = useQuery<Vehicle[]>({
    queryKey: ["/api/vehicles"],
    enabled: open,
  });

  const save = useQuickEdit("vehicle", reservation.id, () => { onOpenChange(false); onSaved?.(); });

  const changed = vehicleId !== "" && vehicleId !== String(reservation.vehicleId ?? "");

  return (
    <QuickEditShell
      open={open}
      onOpenChange={onOpenChange}
      title={t('quickEdit.vehicle.title')}
      description={t('quickEdit.vehicle.description')}
      testId="dialog-quick-edit-vehicle"
      canSave={changed && !save.isPending}
      isSaving={save.isPending}
      onSave={() => save.mutate({ vehicleId: Number(vehicleId) })}
    >
      <VehicleSelector
        vehicles={vehicles}
        value={vehicleId}
        onChange={setVehicleId}
        placeholder={t('quickEdit.vehicle.searchPlaceholder')}
      />
    </QuickEditShell>
  );
}
