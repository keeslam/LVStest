/**
 * Sub-project C, Task 4 (besluiten B-30, B-39; spec
 * docs/superpowers/specs/2026-10-09-terugdraaien-prullenbak-design.md §2.4).
 *
 * The ONE place a pickup, a return or a cancellation is undone. Before this
 * dialog there were five separate controls (StatusChangeDialog, the vehicle
 * quick button, the calendar hover card, the completed-rentals list and the
 * dashboard vehicle dialog); some reverted with a single click, none showed
 * what would happen to the vehicle, and none asked about a lower odometer.
 *
 * It asks `GET /api/reservations/:id/revert-preview` what the server WOULD do,
 * says so in plain Dutch, and only `POST /api/reservations/:id/revert` changes
 * anything - carrying the `planHash` of the plan on screen, so the server can
 * refuse (409 REVERT_PLAN_CHANGED) when the rental or the vehicle moved on in
 * between. A refusal comes with the current plan; it replaces the one shown and
 * the odometer tick has to be given again.
 *
 * The client branches on the stable `code` of a refusal, never on the English
 * `message` the server sends alongside (constraints.md).
 */
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Loader2, RotateCcw } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, getQueryFn, invalidateByPrefix } from "@/lib/queryClient";
import { formatFuelLevel, formatReservationStatus } from "@/lib/format-utils";
import { REVERT_CODES, type RevertPlan } from "@shared/revert-codes";

/** What `POST /api/reservations/:id/revert` answers on success. */
export interface RevertResult {
  plan: RevertPlan;
  reservation: { id: number; status?: string | null } & Record<string, unknown>;
}

interface RevertHandoverDialogProps {
  reservationId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Runs after the revert succeeded and the caches were told; the dialog closes itself. */
  onReverted?: (result: RevertResult) => void | Promise<void>;
}

/** The statuses the engine can undo: a pickup, a return (also legacy `returned`) and a cancellation. */
const REVERTIBLE_STATUSES = new Set(["picked_up", "returned", "completed", "cancelled"]);

/**
 * Whether a reservation row can be offered a reversal at all. Every opener uses
 * this one rule; the server decides the rest (preview, `blocked`).
 */
export function isRevertibleReservation(reservation: { status?: string | null; type?: string | null }): boolean {
  if (reservation.type === "maintenance_block") return false;
  return REVERTIBLE_STATUSES.has(String(reservation.status ?? "").toLowerCase());
}

/** `reservations:revertHandover.opener.*` key for the label of an opener. */
export function revertOpenerLabelKey(reservation: { status?: string | null }): string {
  return reservation.status === "cancelled" ? "revertHandover.opener.cancelled" : "revertHandover.opener.handover";
}

/** The two bookkeeping columns per handover are not shown: they are not data the desk entered. */
const HIDDEN_CLEARS = /^vehicle(Mileage|Fuel)Before(Pickup|Return)$/;

type PreviewResult = { ok: true; plan: RevertPlan } | { ok: false; status: number | null };

interface RevertRefusal extends Error {
  code?: string;
  httpStatus?: number;
  plan?: RevertPlan;
  currentMileage?: number | null;
  restoreToMileage?: number | null;
}

export function RevertHandoverDialog({ reservationId, open, onOpenChange, onReverted }: RevertHandoverDialogProps) {
  const { t, i18n } = useTranslation("reservations");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [confirmedMileage, setConfirmedMileage] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);

  const previewUrl = `/api/reservations/${reservationId}/revert-preview`;
  const previewKey = [previewUrl];

  // The failure is part of the answer, not an exception: a thrown GET would
  // reach the global "could not load the data" toast, in English, from the
  // server's message. Here the dialog says it itself, in Dutch.
  const readPreview = getQueryFn<RevertPlan>({ on401: "throw" });
  const preview = useQuery<PreviewResult>({
    queryKey: previewKey,
    enabled: open && reservationId > 0 && !finished,
    // A plan is a statement about THIS moment: never reuse an older one.
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: "always",
    queryFn: async (context) => {
      try {
        const plan = await readPreview(context);
        return plan ? { ok: true, plan } : { ok: false, status: null };
      } catch (error) {
        return { ok: false, status: (error as RevertRefusal).httpStatus ?? null };
      }
    },
  });

  const plan = preview.data?.ok ? preview.data.plan : null;
  const planHash = plan?.planHash ?? null;

  useEffect(() => {
    if (open) {
      setConfirmedMileage(false);
      setErrorText(null);
      setFinished(false);
    }
  }, [open, reservationId]);

  // Any change of the plan on screen - a refusal that brought a newer one, or a
  // refetch - means the person has not seen THIS plan yet: the tick starts over.
  useEffect(() => {
    setConfirmedMileage(false);
  }, [planHash]);

  const km = (value: number | null | undefined) =>
    value === null || value === undefined ? t("revertHandover.unknown") : new Intl.NumberFormat(i18n.language).format(value);
  const fuel = (value: string | null | undefined) =>
    value === null || value === undefined || value === "" ? t("revertHandover.unknown") : formatFuelLevel(value);

  const textFor = (key: string, fallbackKey: string, values: Record<string, unknown> = {}) =>
    i18n.exists(`reservations:${key}`) ? t(key, values) : t(fallbackKey, values);

  const describeRefusal = (error: RevertRefusal): string => {
    switch (error.code) {
      case REVERT_CODES.MILEAGE_DECREASE_CONFIRMATION_REQUIRED:
        return t("revertHandover.errors.MILEAGE_DECREASE_CONFIRMATION_REQUIRED", {
          from: km(error.currentMileage ?? error.plan?.vehicle.current.mileage),
          to: km(error.restoreToMileage ?? error.plan?.vehicle.restoreTo?.mileage),
        });
      case REVERT_CODES.REVERT_PLAN_CHANGED:
      case REVERT_CODES.VEHICLE_NOT_FREE:
      case REVERT_CODES.VEHICLE_NOT_FOR_RENTAL:
      case REVERT_CODES.VEHICLE_NOT_FOUND:
      case REVERT_CODES.INVALID_STATUS_TRANSITION:
        return t(`revertHandover.errors.${error.code}`);
      default:
        if (error.httpStatus === 403) return t("revertHandover.errors.forbidden");
        if (error.httpStatus === 404) return t("revertHandover.errors.notFound");
        return t("revertHandover.errors.generic");
    }
  };

  const revertMutation = useMutation({
    mutationFn: async (shown: RevertPlan) => {
      const response = await apiRequest("POST", `/api/reservations/${reservationId}/revert`, {
        confirmMileageDecrease: shown.requiresMileageConfirmation && confirmedMileage,
        planHash: shown.planHash,
      });
      return (await response.json()) as RevertResult;
    },
    onMutate: () => setErrorText(null),
    onSuccess: async (result) => {
      setFinished(true);
      const cancelled = result.plan.fromStatus === "cancelled";
      toast({
        title: t(cancelled ? "revertHandover.toasts.successTitleCancelled" : "revertHandover.toasts.successTitle"),
        description: t("revertHandover.toasts.successDescription", {
          id: reservationId,
          status: formatReservationStatus(result.plan.toStatus ?? ""),
        }),
      });
      // Close first: a still-mounted preview would be refetched by the
      // invalidation below and answer "nothing to undo" for the new state.
      onOpenChange(false);
      await Promise.all([
        invalidateByPrefix("/api/reservations"),
        invalidateByPrefix("/api/vehicles"),
        invalidateByPrefix("/api/documents"),
      ]);
      await onReverted?.(result);
    },
    onError: (thrown) => {
      const error = thrown as RevertRefusal;
      setErrorText(describeRefusal(error));
      if (error.plan) {
        // The server's refusal carries the plan as it stands NOW: show that one
        // at once, so the person never keeps looking at the stale overview.
        queryClient.setQueryData<PreviewResult>(previewKey, { ok: true, plan: error.plan });
      }
      if (error.code === REVERT_CODES.REVERT_PLAN_CHANGED) {
        // ...and reload the preview from the server, so what is confirmed next
        // is exactly what the preview route says now (planHash included).
        void queryClient.invalidateQueries({ queryKey: previewKey });
      }
    },
  });

  const cancellation = plan?.fromStatus === "cancelled";
  const blockedText = plan?.blocked
    ? textFor(`revertHandover.blocked.${plan.blocked.code}`, "revertHandover.blocked.unknown")
    : null;
  const confirmDisabled =
    !plan ||
    plan.toStatus === null ||
    !!plan.blocked ||
    (plan.requiresMileageConfirmation && !confirmedMileage) ||
    revertMutation.isPending;

  const vehicleLines: string[] = [];
  if (plan) {
    const { current, restoreTo, reason } = plan.vehicle;
    if (restoreTo) {
      if (restoreTo.mileage !== null) {
        vehicleLines.push(
          restoreTo.mileage === current.mileage
            ? t("revertHandover.mileageSame", { km: km(restoreTo.mileage) })
            : t("revertHandover.mileageChange", { from: km(current.mileage), to: km(restoreTo.mileage) }),
        );
      }
      if (restoreTo.fuel !== null) {
        vehicleLines.push(
          restoreTo.fuel === current.fuel
            ? t("revertHandover.fuelSame", { fuel: fuel(restoreTo.fuel) })
            : t("revertHandover.fuelChange", { from: fuel(current.fuel), to: fuel(restoreTo.fuel) }),
        );
      }
    } else {
      vehicleLines.push(reason ? t(`revertHandover.vehicleReason.${reason}`) : t("revertHandover.vehicleUnchanged"));
    }
  }

  const clears = (plan?.clears ?? []).filter((key) => !HIDDEN_CLEARS.test(key));
  // The vehicle block already says why a reading stays; do not say it twice.
  const warnings = (plan?.warnings ?? []).filter((code) => code !== plan?.vehicle.reason);

  const documentLabel = (documentType: string) => {
    if (/damage check/i.test(documentType)) return t("revertHandover.documentTypes.damageCheck");
    if (/contract/i.test(documentType)) return t("revertHandover.documentTypes.contract");
    return documentType;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto" data-testid="dialog-revert-handover">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RotateCcw className="h-5 w-5" />
            {t(cancellation ? "revertHandover.titleCancelled" : "revertHandover.title")}
          </DialogTitle>
          <DialogDescription>{t("revertHandover.description", { id: reservationId })}</DialogDescription>
        </DialogHeader>

        {preview.isLoading ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground" data-testid="revert-loading">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t("revertHandover.loading")}
          </p>
        ) : !plan ? (
          <div
            className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900"
            role="alert"
            data-testid="revert-error"
          >
            {t(preview.data && !preview.data.ok && preview.data.status === 404 ? "revertHandover.errors.previewNotFound" : "revertHandover.errors.previewFailed")}
          </div>
        ) : (
          <div className="space-y-3 text-sm">
            <p className="font-medium" data-testid="revert-status">
              {t("revertHandover.statusLine", {
                from: formatReservationStatus(plan.fromStatus),
                to: plan.toStatus ? formatReservationStatus(plan.toStatus) : "—",
              })}
            </p>

            {blockedText && (
              <div
                className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-red-900"
                data-testid="revert-blocked"
              >
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <p>{blockedText}</p>
              </div>
            )}

            {clears.length > 0 && (
              <div data-testid="revert-clears">
                <p className="font-medium">{t("revertHandover.clearsTitle")}</p>
                <ul className="list-disc pl-5">
                  {clears.map((key) => (
                    <li key={key}>{t(`revertHandover.fields.${key}`, { defaultValue: key })}</li>
                  ))}
                </ul>
              </div>
            )}

            <div data-testid="revert-vehicle">
              <p className="font-medium">{t("revertHandover.vehicleTitle")}</p>
              <ul className="list-disc pl-5">
                {vehicleLines.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>

            {plan.documentsToMarkStale.length > 0 && (
              <div data-testid="revert-documents">
                <p className="font-medium">{t("revertHandover.documentsTitle")}</p>
                <ul className="list-disc pl-5">
                  {plan.documentsToMarkStale.map((document) => (
                    <li key={document.id}>{documentLabel(document.documentType)}</li>
                  ))}
                </ul>
              </div>
            )}

            {warnings.length > 0 && (
              <div
                className="rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-900"
                data-testid="revert-warnings"
              >
                <p className="flex items-center gap-2 font-medium">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  {t("revertHandover.warningsTitle")}
                </p>
                <ul className="list-disc pl-5">
                  {warnings.map((code) => (
                    <li key={code}>{textFor(`revertHandover.warnings.${code}`, "revertHandover.warnings.unknown", { code })}</li>
                  ))}
                </ul>
              </div>
            )}

            {plan.requiresMileageConfirmation && (
              <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-red-900">
                <Checkbox
                  id="confirm-mileage-decrease"
                  data-testid="checkbox-confirm-mileage-decrease"
                  checked={confirmedMileage}
                  onCheckedChange={(next) => setConfirmedMileage(next === true)}
                />
                <Label htmlFor="confirm-mileage-decrease" className="font-normal leading-snug">
                  {t("revertHandover.confirmMileage", {
                    from: km(plan.vehicle.current.mileage),
                    to: km(plan.vehicle.restoreTo?.mileage),
                  })}
                </Label>
              </div>
            )}
          </div>
        )}

        {errorText && (
          <div
            className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900"
            role="alert"
            data-testid="revert-error"
          >
            {errorText}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" type="button" onClick={() => onOpenChange(false)} data-testid="button-cancel-revert">
            {t("revertHandover.cancelButton")}
          </Button>
          {plan && (
            <Button
              type="button"
              variant="destructive"
              disabled={confirmDisabled}
              onClick={() => revertMutation.mutate(plan)}
              data-testid="button-confirm-revert"
            >
              {revertMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t("revertHandover.confirming")}
                </>
              ) : (
                <>
                  <RotateCcw className="mr-2 h-4 w-4" />
                  {t(cancellation ? "revertHandover.confirmButtonCancelled" : "revertHandover.confirmButton")}
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
