import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { PortalRequestDto } from "@shared/portal-requests";
import { portalQueryFn } from "@/lib/portal-api";
import { usePortalDialogs } from "@/hooks/use-portal-dialogs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { DetailRow } from "./reservation-dialog";

/** One request the customer submitted, with Lam Groep's reply. */
export function RequestDialog({ id, onClose }: { id: number | null; onClose: () => void }) {
  const { t } = useTranslation("portal");
  const { openReservation, openFine } = usePortalDialogs();
  const { data: r, isLoading, isError } = useQuery<PortalRequestDto>({ queryKey: ["portal", `/api/portal/requests/${id}`], queryFn: portalQueryFn, enabled: id !== null });
  const p = (r?.payload ?? {}) as Record<string, string>;

  return (
    <Dialog open={id !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg" data-testid="portal-request-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {t("requests.detailTitle")} #{id}
            {r && <Badge variant={r.status === "done" ? "default" : r.status === "rejected" ? "destructive" : "outline"}>{t(`requests.status.${r.status}`)}</Badge>}
          </DialogTitle>
        </DialogHeader>
        {isError ? <p className="p-6 text-center text-sm text-muted-foreground">{t("errors.PORTAL_NOT_FOUND")}</p> : isLoading || !r ? <div className="flex justify-center p-6"><Loader2 className="h-5 w-5 animate-spin" /></div> : (
          <div className="space-y-3">
            <dl className="space-y-1">
              <DetailRow label={t("requests.chooseType")} value={t(`requests.type.${r.type}`)} />
              <DetailRow label={t("requests.date")} value={new Date(r.createdAt).toLocaleString()} />
              {r.reservationId && (
                <div className="grid grid-cols-3 gap-2 text-sm"><dt className="text-muted-foreground">{t("requests.form.reservation")}</dt>
                  <dd className="col-span-2"><button type="button" className="underline" onClick={() => openReservation(r.reservationId!)}>#{r.reservationId}</button></dd></div>
              )}
              {r.fineId && (
                <div className="grid grid-cols-3 gap-2 text-sm"><dt className="text-muted-foreground">{t("requests.form.fine")}</dt>
                  <dd className="col-span-2"><button type="button" className="underline" onClick={() => openFine(r.fineId!)}>#{r.fineId}</button></dd></div>
              )}
              {r.type === "extension" && <DetailRow label={t("requests.form.newEndDate")} value={p.newEndDate} />}
              {r.type === "early_return" && <DetailRow label={t("requests.form.returnDate")} value={p.returnDate} />}
              {r.type === "damage" && <><DetailRow label={t("requests.form.location")} value={p.location} /><DetailRow label={t("requests.form.occurredAt")} value={p.occurredAt} /></>}
              {r.type === "other" && <DetailRow label={t("requests.form.subject")} value={p.subject} />}
            </dl>
            <p className="whitespace-pre-wrap rounded-md bg-muted p-2 text-sm">{r.message}</p>
            {r.attachments.length > 0 && (
              <div className="text-sm">
                <div className="font-medium">{t("requests.attachments")}</div>
                <ul className="list-disc pl-5">
                  {r.attachments.map((a) => <li key={a.id}><a className="underline" href={`/api/portal/requests/${r.id}/attachments/${a.id}`} target="_blank" rel="noopener">{a.fileName}</a></li>)}
                </ul>
              </div>
            )}
            <div>
              <h3 className="mb-1 text-sm font-semibold">{t("requests.reply")}</h3>
              {r.staffReply
                ? <><p className="whitespace-pre-wrap rounded-md border p-2 text-sm" data-testid="portal-request-reply">{r.staffReply}</p>{r.repliedAt && <p className="mt-1 text-xs text-muted-foreground">{new Date(r.repliedAt).toLocaleString()}</p>}</>
                : <p className="text-sm text-muted-foreground">{t("requests.noReply")}</p>}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
