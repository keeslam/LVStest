import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Copy, ExternalLink, Loader2, MessageSquare, CalendarClock } from "lucide-react";
import type { PortalReservationDto } from "@shared/portal-types";
import { vehicleName } from "@shared/vehicle-name";
import { portalQueryFn } from "@/lib/portal-api";
import { usePortalAuth } from "@/hooks/use-portal-auth";
import { usePortalDialogs } from "@/hooks/use-portal-dialogs";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatLicensePlate } from "@/lib/format-utils";
import { formatPortalDate } from "@/lib/portal-format";
import { Plate, btnPrimary } from "./ui";

/** A value the garage's agenda will ask for, with a button to copy it. */
function CopyRow({ label, value, testId }: { label: string; value: string; testId: string }) {
  const { t } = useTranslation("portal");
  const { toast } = useToast();
  const copy = async () => {
    try { await navigator.clipboard.writeText(value); toast({ title: t("apk.copied", { what: label }) }); } catch { /* no clipboard access: the value is on screen */ }
  };
  return (
    <div className="flex items-center justify-between gap-2 text-sm">
      <div><div className="text-xs text-muted-foreground">{label}</div><div className="font-medium">{value}</div></div>
      <Button type="button" size="sm" variant="ghost" className="h-8 w-8 shrink-0 p-0" onClick={copy} aria-label={t("apk.copy", { what: label })} data-testid={`apk-copy-${testId}`}><Copy className="h-4 w-4" /></Button>
    </div>
  );
}

/** "apk": APK inplannen for a rental. "maintenance": Onderhoud melden, with or without the rental it is about. */
export type PlanMode = "apk" | "maintenance";

/**
 * The choice behind "APK inplannen" and "Onderhoud melden": send a request (the form opens with the rental filled in; staff plan
 * it), or pick a day and time yourself in the garage's own online agenda, shown here. That page belongs to the garage software,
 * so it cannot be filled in or trimmed from our side; next to it stand the car's details and what to tick.
 * Without a configured agenda only the request is offered.
 */
export function ApkDialog({ open, reservationId, mode = "apk", onClose }: { open: boolean; reservationId: number | null; mode?: PlanMode; onClose: () => void }) {
  const { t: tr } = useTranslation("portal");
  // Wording that differs per mode lives under "maintenancePlan."; what both share only under "apk.".
  const prefix = mode === "maintenance" ? "maintenancePlan" : "apk";
  const t = (key: string, opts?: Record<string, unknown>) => tr(`${prefix}.${key}`, { ...opts, defaultValue: tr(`apk.${key}`, opts) });
  const { me } = usePortalAuth();
  const { openNewRequest } = usePortalDialogs();
  const [planner, setPlanner] = useState(false);
  const url = `/api/portal/reservations/${reservationId}`;
  const { data: r, isLoading } = useQuery<PortalReservationDto>({ queryKey: ["portal", url], queryFn: portalQueryFn, enabled: open && reservationId !== null });
  const plannerUrl = me?.info.apkPlannerUrl ?? "";
  const v = r?.vehicle;
  const close = () => { setPlanner(false); onClose(); };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) close(); }}>
      <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto" data-testid="portal-apk-dialog" aria-describedby="apk-dialog-description">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription id="apk-dialog-description" className="sr-only">{t("description")}</DialogDescription>
        </DialogHeader>
        {reservationId !== null && (isLoading || !r) ? <div className="flex justify-center p-6"><Loader2 className="h-5 w-5 animate-spin" /></div> : (
          <div className="space-y-4">
            {v && (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl bg-muted/40 p-3 text-sm" data-testid="apk-vehicle">
                <span className="font-medium">{vehicleName(v.brand, v.model)}</span><Plate value={v.licensePlate} />
                {mode === "apk" && v.apkDate && <span className="text-muted-foreground">{t("expires", { date: formatPortalDate(v.apkDate) })}</span>}
              </div>
            )}

            <div className={`grid gap-3 ${plannerUrl ? "sm:grid-cols-2" : ""}`}>
              <div className="flex flex-col gap-2 rounded-xl border p-4">
                <div className="flex items-center gap-2 font-semibold"><MessageSquare className="h-4 w-4" />{t("requestTitle")}</div>
                <p className="flex-1 text-sm text-muted-foreground">{t("requestText")}</p>
                <Button className={`${btnPrimary} w-full sm:w-auto sm:self-start`} onClick={() => openNewRequest({ type: mode, reservationId: r?.id })} data-testid="button-apk-request">{t("requestButton")}</Button>
              </div>
              {plannerUrl && (
                <div className="flex flex-col gap-2 rounded-xl border p-4">
                  <div className="flex items-center gap-2 font-semibold"><CalendarClock className="h-4 w-4" />{t("selfTitle")}</div>
                  <p className="flex-1 text-sm text-muted-foreground">{t("selfText")}</p>
                  <Button variant={planner ? "outline" : "default"} className={`${planner ? "" : btnPrimary} w-full sm:w-auto sm:self-start`} onClick={() => setPlanner((p) => !p)} data-testid="button-apk-planner">{planner ? t("hidePlanner") : t("showPlanner")}</Button>
                </div>
              )}
            </div>

            {plannerUrl && planner && (
              <div className="grid gap-4 lg:grid-cols-[16rem_minmax(0,1fr)]" data-testid="apk-planner">
                <div className="space-y-3 rounded-xl border bg-[#f6f7ff] p-3">
                  <p className="text-sm font-semibold text-[#1a1d62]">{t("tickOnly")}</p>
                  {v && <>
                    <p className="text-xs text-muted-foreground">{t("carDetails")}</p>
                    <CopyRow label={t("plate")} value={formatLicensePlate(v.licensePlate)} testId="plate" />
                    <CopyRow label={t("brandModel")} value={vehicleName(v.brand, v.model)} testId="model" />
                  </>}
                  {mode === "maintenance" && <p className="text-xs text-muted-foreground" data-testid="plan-self-note">{t("selfNote")}</p>}
                  <a href={plannerUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs underline" data-testid="apk-planner-external"><ExternalLink className="h-3.5 w-3.5" />{t("openExternal")}</a>
                </div>
                <iframe src={plannerUrl} title={t("plannerTitle")} className="h-[30rem] w-full rounded-xl border bg-white" referrerPolicy="no-referrer" data-testid="apk-planner-frame" />
              </div>
            )}

            <div className="flex justify-end"><Button type="button" variant="outline" onClick={close} data-testid="button-apk-back">{tr("actions.cancel")}</Button></div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
