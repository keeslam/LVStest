import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { CalendarClock, Car, Check, Link2, Loader2, X } from "lucide-react";
import { replacementWanted, type OnlineAppointmentDto } from "@shared/online-appointments";
import { UserPermission } from "@shared/schema";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useHasPermission } from "@/hooks/use-has-permission";
import { apiRequest, invalidateByPrefix } from "@/lib/queryClient";
import { describeApiError, parseApiError } from "@/lib/api-error";
import { displayLicensePlate } from "@/lib/utils";

export const ONLINE_APPOINTMENTS_KEY = ["/api/online-appointments"];
export const ONLINE_APPOINTMENTS_COUNT_KEY = ["/api/online-appointments/count"];

type Action = "confirm" | "cancel" | "dismiss" | "link";
/** The codes the server answers with that have a sentence of their own. */
const KNOWN_ERRORS = ["ALREADY_HANDLED", "RENTAL_NOT_ACTIVE", "RENTAL_NOT_ON_DATE", "WEEKEND", "IN_PAST", "NO_DATE", "NOT_FOUND"];

const dutchDate = (iso: string) => (iso ? iso.split("-").reverse().join("-") : "-");

/**
 * Appointments made in the garage's online planner. They are already in the maintenance planner as "te bevestigen";
 * here staff confirm them once they have confirmed them in the planner, cancel them, or link a mail that could not be
 * matched to a rental. Mail text is only ever shown as text.
 */
export function OnlineAppointmentsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useTranslation("maintenance");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const canManage = useHasPermission(UserPermission.MANAGE_RESERVATIONS, UserPermission.MANAGE_MAINTENANCE);
  const { data: items = [], isLoading } = useQuery<OnlineAppointmentDto[]>({ queryKey: ONLINE_APPOINTMENTS_KEY, enabled: open });
  const [cancelling, setCancelling] = useState<OnlineAppointmentDto | null>(null);
  const [rentalNumbers, setRentalNumbers] = useState<Record<number, string>>({});

  const act = useMutation({
    mutationFn: async ({ id, action, body }: { id: number; action: Action; body?: unknown }) =>
      (await apiRequest("POST", `/api/online-appointments/${id}/${action}`, body)).json(),
    onSuccess: (_r, { action }) => {
      queryClient.invalidateQueries({ queryKey: ONLINE_APPOINTMENTS_KEY });
      queryClient.invalidateQueries({ queryKey: ONLINE_APPOINTMENTS_COUNT_KEY });
      invalidateByPrefix("/api/reservations");
      invalidateByPrefix("/api/maintenance");
      toast({ title: t(`onlineAppointments.done.${action}`) });
    },
    onError: (e) => {
      const { code } = parseApiError(e);
      const description = code && KNOWN_ERRORS.includes(code) ? t(`onlineAppointments.errors.${code}`) : describeApiError(e as Error);
      toast({ title: t("onlineAppointments.failed"), description, variant: "destructive" });
      if (code === "ALREADY_HANDLED") queryClient.invalidateQueries({ queryKey: ONLINE_APPOINTMENTS_KEY });
    },
  });

  const pending = items.filter((a) => a.status === "pending");
  const review = items.filter((a) => a.status === "review");

  const details = (a: OnlineAppointmentDto) => (
    <div className="min-w-0 space-y-1 text-sm">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="flex items-center gap-1 font-semibold">
          <CalendarClock className="h-4 w-4" />{dutchDate(a.date)}{a.time ? ` · ${a.time}` : ""}
        </span>
        {a.plate && (
          <span className="flex items-center gap-1">
            <Car className="h-4 w-4" />{displayLicensePlate(a.plate)} {[a.brand, a.model].filter(Boolean).join(" ")}
          </span>
        )}
        {(a.customerLabel || a.customerName) && <span className="text-muted-foreground">{a.customerLabel || a.customerName}</span>}
      </div>
      {a.workItems.length > 0 && <div className="break-words">{a.workItems.join(", ")}</div>}
      {replacementWanted(a.replacement) && (
        <Badge variant="secondary" data-testid={`appointment-replacement-${a.id}`}>{t("onlineAppointments.replacement")}</Badge>
      )}
    </div>
  );

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto" data-testid="online-appointments-dialog">
          <DialogHeader>
            <DialogTitle>{t("onlineAppointments.title")}</DialogTitle>
            <DialogDescription>{t("onlineAppointments.description")}</DialogDescription>
          </DialogHeader>
          {isLoading ? (
            <div className="flex justify-center p-6"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : items.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground" data-testid="online-appointments-empty">{t("onlineAppointments.empty")}</p>
          ) : (
            <div className="space-y-5">
              {pending.length > 0 && (
                <section className="space-y-2">
                  <h3 className="text-sm font-semibold">{t("onlineAppointments.toConfirm", { count: pending.length })}</h3>
                  {pending.map((a) => (
                    <div key={a.id} className="flex flex-col gap-3 rounded-lg border border-dashed border-amber-400 p-3 sm:flex-row sm:items-center sm:justify-between" data-testid={`appointment-${a.id}`}>
                      {details(a)}
                      {canManage && (
                        <div className="flex shrink-0 flex-wrap gap-2">
                          <Button size="sm" disabled={act.isPending} onClick={() => act.mutate({ id: a.id, action: "confirm" })} data-testid={`appointment-confirm-${a.id}`}>
                            <Check className="mr-1 h-4 w-4" />{t("onlineAppointments.confirm")}
                          </Button>
                          <Button size="sm" variant="outline" disabled={act.isPending} onClick={() => setCancelling(a)} data-testid={`appointment-cancel-${a.id}`}>
                            <X className="mr-1 h-4 w-4" />{t("onlineAppointments.cancel")}
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                </section>
              )}
              {review.length > 0 && (
                <section className="space-y-2">
                  <h3 className="text-sm font-semibold">{t("onlineAppointments.toCheck", { count: review.length })}</h3>
                  {review.map((a) => (
                    <div key={a.id} className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/40" data-testid={`appointment-${a.id}`}>
                      {details(a)}
                      <p className="text-xs text-amber-900 dark:text-amber-200" data-testid={`appointment-reason-${a.id}`}>
                        {a.reviewReason ? t(`onlineAppointments.reasons.${a.reviewReason}`) : ""}
                      </p>
                      {canManage && (
                        <div className="flex flex-wrap items-center gap-2">
                          {a.date && a.reviewReason !== "unreadable" && (
                            <>
                              <Input
                                className="h-8 w-44 bg-background"
                                inputMode="numeric"
                                aria-label={t("onlineAppointments.rentalNumber")}
                                placeholder={t("onlineAppointments.rentalNumber")}
                                value={rentalNumbers[a.id] ?? ""}
                                onChange={(e) => setRentalNumbers({ ...rentalNumbers, [a.id]: e.target.value.replace(/\D/g, "").slice(0, 9) })}
                                data-testid={`appointment-rental-${a.id}`}
                              />
                              <Button
                                size="sm"
                                disabled={act.isPending || !rentalNumbers[a.id]}
                                onClick={() => act.mutate({ id: a.id, action: "link", body: { rentalId: Number(rentalNumbers[a.id]) } })}
                                data-testid={`appointment-link-${a.id}`}
                              >
                                <Link2 className="mr-1 h-4 w-4" />{t("onlineAppointments.link")}
                              </Button>
                            </>
                          )}
                          <Button size="sm" variant="outline" className="bg-background" disabled={act.isPending} onClick={() => act.mutate({ id: a.id, action: "dismiss" })} data-testid={`appointment-dismiss-${a.id}`}>
                            {t("onlineAppointments.dismiss")}
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                </section>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={cancelling !== null} onOpenChange={(o) => !o && setCancelling(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("onlineAppointments.cancelTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("onlineAppointments.cancelText")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("onlineAppointments.keep")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { if (cancelling) act.mutate({ id: cancelling.id, action: "cancel" }); setCancelling(null); }}
              data-testid="appointment-cancel-yes"
            >
              {t("onlineAppointments.cancel")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
