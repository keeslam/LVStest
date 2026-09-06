import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useFilePreview } from "@/components/documents/use-file-preview";
import { RequestThread } from "./request-thread";
import type { PortalRequestDto } from "@shared/portal-requests";
import { portalQueryFn, portalFetch, PortalApiError } from "@/lib/portal-api";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { usePortalDialogs } from "@/hooks/use-portal-dialogs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";
import { DetailRow } from "./reservation-dialog";
import { StatusBadge } from "./ui";

/** Three steps: submitted, in progress, handled (or rejected). */
function RequestProgress({ status }: { status: string }) {
  const { t } = useTranslation("portal");
  const steps = ["new", "in_progress", status === "rejected" ? "rejected" : "done"];
  const reached = status === "new" ? 0 : status === "in_progress" ? 1 : 2;
  const colour = status === "rejected" ? "bg-[#e24b4a]" : "bg-[#1d9e75]";
  return (
    <ol className="flex items-center gap-2" aria-label={t("requests.progress")}>
      {steps.map((s, i) => (
        <li key={s} className="flex flex-1 items-center gap-2">
          <span className={`h-2.5 flex-1 rounded-full ${i <= reached ? colour : "bg-[#e6e8f0]"}`} />
          <span className={`hidden whitespace-nowrap text-xs sm:inline ${i <= reached ? "font-medium text-[#0f172a]" : "text-[#94a3b8]"}`}>{t(`requests.status.${s}`)}</span>
        </li>
      ))}
    </ol>
  );
}

/** One request the customer submitted, with Lam Groep's reply. */
export function RequestDialog({ id, onClose }: { id: number | null; onClose: () => void }) {
  const { t } = useTranslation("portal");
  const preview = useFilePreview();
  const { openReservation, openFine } = usePortalDialogs();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const withdraw = useMutation({
    mutationFn: () => portalFetch("DELETE", `/api/portal/requests/${id}`),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["portal"] }); toast({ title: t("requests.withdrawn") }); onClose(); },
    onError: (e) => toast({ title: e instanceof PortalApiError ? e.message : t("errors.PORTAL_SERVER_ERROR"), variant: "destructive" }),
  });
  const { data: r, isLoading, isError } = useQuery<PortalRequestDto>({ queryKey: ["portal", `/api/portal/requests/${id}`], queryFn: portalQueryFn, enabled: id !== null });
  const p = (r?.payload ?? {}) as Record<string, string>;

  return (<>
    <Dialog open={id !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg" data-testid="portal-request-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {t("requests.detailTitle")} #{id}
            {r && <StatusBadge kind="request" status={r.status} label={t(`requests.status.${r.status}`)} />}
          </DialogTitle>
        </DialogHeader>
        {isError ? <p className="p-6 text-center text-sm text-muted-foreground">{t("errors.PORTAL_NOT_FOUND")}</p> : isLoading || !r ? <div className="flex justify-center p-6"><Loader2 className="h-5 w-5 animate-spin" /></div> : (
          <div className="space-y-3">
            <RequestProgress status={r.status} />
            <dl className="space-y-1">
              <DetailRow label={t("requests.chooseType")} value={t(`requests.type.${r.type}`)} />
              <DetailRow label={t("requests.date")} value={new Date(r.createdAt).toLocaleString()} />
              {r.reservationId && (
                <div className="grid gap-0.5 text-sm sm:grid-cols-3 sm:gap-2"><dt className="text-muted-foreground">{t("requests.form.reservation")}</dt>
                  <dd className="sm:col-span-2"><button type="button" className="underline" onClick={() => openReservation(r.reservationId!)}>#{r.reservationId}</button></dd></div>
              )}
              {r.fineId && (
                <div className="grid gap-0.5 text-sm sm:grid-cols-3 sm:gap-2"><dt className="text-muted-foreground">{t("requests.form.fine")}</dt>
                  <dd className="sm:col-span-2"><button type="button" className="underline" onClick={() => openFine(r.fineId!)}>#{r.fineId}</button></dd></div>
              )}
              {r.type === "booking" && <>
                <DetailRow label={t("requests.form.vehicle")} value={p.vehicleLabel} />
                <DetailRow label={t("requests.form.startDate")} value={p.startTime ? `${p.startDate} ${p.startTime}` : p.startDate} />
                <DetailRow label={t("requests.form.endDateDetail")} value={p.endDate ? (p.endTime ? `${p.endDate} ${p.endTime}` : p.endDate) : t("requests.form.openEnd")} />
                {p.driverLabel && <DetailRow label={t("requests.form.driver")} value={p.driverLabel} />}
              </>}
              {r.type === "extension" && <DetailRow label={t("requests.form.newEndDate")} value={p.newEndDate} />}
              {r.type === "early_return" && <DetailRow label={t("requests.form.returnDate")} value={p.returnDate} />}
              {r.type === "damage" && <><DetailRow label={t("requests.form.location")} value={p.location} /><DetailRow label={t("requests.form.occurredAt")} value={p.occurredAt} /></>}
              {r.type === "other" && <DetailRow label={t("requests.form.subject")} value={p.subject} />}
              {r.type === "maintenance" && <><DetailRow label={t("requests.form.issue")} value={p.issue} /><DetailRow label={t("requests.form.mileage")} value={p.mileage} />{p.urgent === "true" || (p.urgent as unknown) === true ? <DetailRow label={t("requests.form.urgent")} value={t("requests.form.yes")} /> : null}</>}
              {r.type === "mileage" && <DetailRow label={t("requests.form.mileage")} value={p.mileage} />}
            </dl>
            <p className="whitespace-pre-wrap rounded-md bg-muted p-2 text-sm">{r.message}</p>
            {r.status === "new" && (
              <div className="flex justify-end">
                <Button size="sm" variant="outline" disabled={withdraw.isPending} onClick={() => withdraw.mutate()} data-testid="button-withdraw-request">{t("requests.withdraw")}</Button>
              </div>
            )}
            {r.attachments.length > 0 && (
              <div className="text-sm">
                <div className="font-medium">{t("requests.attachments")}</div>
                <ul className="list-disc pl-5">
                  {r.attachments.map((a) => <li key={a.id}><button type="button" className="underline" onClick={() => preview.open(`/api/portal/requests/${r.id}/attachments/${a.id}`, a.fileName)}>{a.fileName}</button></li>)}
                </ul>
              </div>
            )}
            <div>
              <h3 className="mb-1 text-sm font-semibold">{t("thread.title")}</h3>
              <RequestThread messages={r.messages} mine="customer" canPost={r.status === "new" || r.status === "in_progress"}
                send={(body) => portalFetch("POST", `/api/portal/requests/${r.id}/messages`, { body })}
                onSent={() => queryClient.invalidateQueries({ queryKey: ["portal"] })} testId="portal-thread" />
              {(r.status === "done" || r.status === "rejected") && <p className="mt-1 text-xs text-muted-foreground">{t("thread.closed")}</p>}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
    {preview.dialog}
  </>);
}
