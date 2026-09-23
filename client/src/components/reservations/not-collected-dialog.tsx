/**
 * besluiten.md B-32 aanvulling (2026-09-23) — a `booked` reservation nobody
 * ever picked up, whose start date is 30 days or more in the past.
 *
 * B-32's base decision (server/database-storage.ts's `getOverdueReservationsByVehicle`)
 * already made sure a never-collected booking no longer blocks a new one on
 * the same vehicle — it stays "booked" forever unless someone notices it and
 * acts. This dialog is that notice: the reservation calendar opens it by
 * itself the first time a session sees a non-empty list (calendar.tsx), and
 * offers exactly two actions per row — look at the reservation, or cancel it
 * through the existing cascade-aware `CancelReservationDialog`. Nothing here
 * changes a business rule; it only surfaces rows that already existed.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { differenceInDays, parseISO } from "date-fns";
import { AlertTriangle, Calendar, Car, User } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RequiresPermission } from "@/components/ui/requires-permission";
import { CancelReservationDialog } from "@/components/reservations/cancel-reservation-dialog";
import { useHasPermission } from "@/hooks/use-has-permission";
import { UserPermission, type Reservation } from "@shared/schema";
import { formatLicensePlate } from "@/lib/format-utils";
import { safeFormatDate } from "@/lib/safe-date";
import { invalidateByPrefix } from "@/lib/queryClient";

/** Also the query key `calendar.tsx` reads for the toolbar count and the auto-open check — same cache entry, one request. */
export const NOT_COLLECTED_QUERY_KEY = ["/api/reservations/not-collected"];

interface NotCollectedDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Opens the calendar's existing reservation-detail dialog for this row. */
  onViewReservation: (reservation: Reservation) => void;
}

export function NotCollectedDialog({ open, onOpenChange, onViewReservation }: NotCollectedDialogProps) {
  const { t } = useTranslation(["reservations", "common"]);
  const canView = useHasPermission(UserPermission.VIEW_RESERVATIONS, UserPermission.MANAGE_RESERVATIONS);
  const [cancellingId, setCancellingId] = useState<number | null>(null);

  // Gated the same way as the page that owns this dialog: a role with
  // neither right must never even ask the server, regardless of whether the
  // dialog happens to be open (mirrors CancelReservationDialog's own
  // `enabled` gate on its impact query, just keyed on a permission instead of
  // `open`).
  const { data: reservations = [] } = useQuery<Reservation[]>({
    queryKey: NOT_COLLECTED_QUERY_KEY,
    enabled: canView,
  });

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto" data-testid="dialog-not-collected">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-600">
              <AlertTriangle className="h-5 w-5" />
              {t("notCollectedDialog.title")}
            </DialogTitle>
            <DialogDescription>{t("notCollectedDialog.description")}</DialogDescription>
          </DialogHeader>

          {reservations.length === 0 ? (
            <p className="py-6 text-sm text-muted-foreground" data-testid="not-collected-empty">
              {t("notCollectedDialog.empty")}
            </p>
          ) : (
            <div className="space-y-3 mt-4">
              {reservations.map((reservation) => {
                const daysSinceStart = reservation.startDate
                  ? differenceInDays(new Date(), parseISO(reservation.startDate))
                  : 0;

                return (
                  <div
                    key={reservation.id}
                    className="flex items-start justify-between p-4 bg-amber-50 dark:bg-amber-950/30 rounded-lg border border-amber-200 dark:border-amber-800"
                    data-testid={`not-collected-reservation-${reservation.id}`}
                  >
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Car className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">
                          {reservation.vehicle?.brand} {reservation.vehicle?.model}
                        </span>
                        <Badge variant="outline" className="text-xs">
                          {formatLicensePlate(reservation.vehicle?.licensePlate || "")}
                        </Badge>
                      </div>

                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <User className="h-3 w-3" />
                        <span>{reservation.customer?.name || t("spareVehicleAssignmentDialog.unknownCustomer")}</span>
                      </div>

                      <div className="flex items-center gap-2 text-sm">
                        <Calendar className="h-3 w-3 text-muted-foreground" />
                        <span className="text-muted-foreground">
                          {t("notCollectedDialog.periodLabel", {
                            start: safeFormatDate(reservation.startDate, "d MMM yyyy"),
                            end: reservation.endDate
                              ? safeFormatDate(reservation.endDate, "d MMM yyyy")
                              : t("cancelDialog.openEnded"),
                          })}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-2">
                      <Badge variant="secondary" className="shrink-0">
                        {t("notCollectedDialog.daysSinceStart", { count: daysSinceStart })}
                      </Badge>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onViewReservation(reservation)}
                        data-testid={`button-open-not-collected-${reservation.id}`}
                      >
                        {t("notCollectedDialog.openButton")}
                      </Button>
                      <RequiresPermission anyOf={[UserPermission.MANAGE_RESERVATIONS]}>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => setCancellingId(reservation.id)}
                          data-testid={`button-cancel-not-collected-${reservation.id}`}
                        >
                          {t("notCollectedDialog.cancelButton")}
                        </Button>
                      </RequiresPermission>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-close-not-collected">
              {t("common:actions.close")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {cancellingId !== null && (
        <CancelReservationDialog
          open={cancellingId !== null}
          onOpenChange={(next) => {
            if (!next) setCancellingId(null);
          }}
          reservationId={cancellingId}
          onSuccess={() => {
            setCancellingId(null);
            // CancelReservationDialog's own onSuccess already invalidates every
            // "/api/reservations*" query (its prefix covers this one too) —
            // this call is the explicit, self-documenting guarantee for this
            // list specifically, so the row disappears even if that shared
            // prefix ever narrows.
            invalidateByPrefix(NOT_COLLECTED_QUERY_KEY[0]);
          }}
        />
      )}
    </>
  );
}
