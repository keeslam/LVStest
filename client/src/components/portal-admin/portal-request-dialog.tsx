import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useFilePreview } from "@/components/documents/use-file-preview";
import type { PortalRequestDto } from "@shared/portal-requests";
import { apiRequest, invalidateByPrefix } from "@/lib/queryClient";
import { useGlobalDialog } from "@/contexts/GlobalDialogContext";
import { useCanManagePortal } from "@/components/portal-admin/accounts-table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { RequestStatusBadge } from "./requests-table";
import { BookingApproval } from "./booking-approval";
import { RequestThread } from "@/components/portal/request-thread";

type ConflictError = Error & { conflicts?: Array<{ id: number; startDate: string; endDate: string | null }> };

/** Staff view of one customer request: take, reply/close, reject, approve. Driven by GlobalDialogContext. */
export function PortalRequestDialog() {
  const { t } = useTranslation("portal");
  const preview = useFilePreview();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { dialogState, closePortalRequestDialog, openCustomerDialog, openReservationDialog, openFineDialog } = useGlobalDialog();
  const canManage = useCanManagePortal();
  const id = dialogState.portalRequest.id;
  const open = dialogState.portalRequest.open && id !== null;
  const key = ["/api/portal-requests", id];
  const { data: r } = useQuery<PortalRequestDto>({ queryKey: key, queryFn: async () => (await apiRequest("GET", `/api/portal-requests/${id}`)).json(), enabled: open });
  const [reply, setReply] = useState("");
  const [approving, setApproving] = useState(false);
  useEffect(() => { setReply(""); setApproving(false); }, [id]);

  const done = () => {
    queryClient.invalidateQueries({ queryKey: key });
    invalidateByPrefix("/api/portal-requests");
    queryClient.invalidateQueries({ queryKey: ["/api/portal-admin/unread-count"] });
  };
  const act = useMutation({
    mutationFn: async ({ url, body }: { url: string; body?: unknown }) => (await apiRequest("POST", url, body)).json(),
    onSuccess: () => { done(); toast({ title: t("admin.requests.dialog.replied") }); },
    onError: (e: ConflictError) => {
      const c = e.conflicts?.[0];
      toast({ title: c ? t("admin.requests.dialog.conflict", { id: c.id, from: c.startDate, to: c.endDate ?? "…" }) : e.message, variant: "destructive" });
    },
  });
  const needReply = () => {
    if (!reply.trim()) { toast({ title: t("admin.requests.dialog.replyRequired"), variant: "destructive" }); return false; }
    return true;
  };
  const isOpen = r?.status === "new" || r?.status === "in_progress";
  const p = (r?.payload ?? {}) as Record<string, string>;

  if (!open) return null;
  return (<>
    {preview.dialog}
    <Dialog open={open} onOpenChange={(o) => !o && closePortalRequestDialog()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">{t("admin.requests.dialog.title", { id })} {r && <RequestStatusBadge status={r.status} />}</DialogTitle>
        </DialogHeader>
        {r && (
          <div className="space-y-4 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{t(`admin.requests.type.${r.type}`)}</span>
              {r.customerId && <Button size="sm" variant="link" className="px-0" onClick={() => openCustomerDialog(r.customerId!, "portal")}>{r.customerName}</Button>}
              <span className="text-muted-foreground">· {r.submittedBy ?? "—"} · {new Date(r.createdAt).toLocaleString()}</span>
            </div>
            {r.reservationId && <div><Label>{t("admin.requests.dialog.reservation")}</Label> <Button size="sm" variant="link" onClick={() => openReservationDialog(r.reservationId!)}>#{r.reservationId} {r.reservationLabel}</Button></div>}
            {r.fineId && <div><Label>{t("admin.requests.dialog.fine")}</Label> <Button size="sm" variant="link" onClick={() => openFineDialog(r.fineId!)}>#{r.fineId}</Button></div>}
            {r.type === "booking" && (
              <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                <div><Label>{t("admin.requests.dialog.vehicle")}</Label><div>{p.vehicleLabel || "—"}</div></div>
                <div><Label>{t("admin.requests.dialog.startDate")}</Label><div>{p.startDate}{p.startTime ? ` ${p.startTime}` : ""}</div></div>
                <div><Label>{t("admin.requests.dialog.endDate")}</Label><div>{p.endDate ? `${p.endDate}${p.endTime ? ` ${p.endTime}` : ""}` : t("admin.requests.dialog.openEnd")}</div></div>
                <div><Label>{t("admin.booking.driver")}</Label><div>{p.driverLabel || "—"}</div></div>
              </div>
            )}
            {r.type === "extension" && <div><Label>{t("admin.requests.dialog.newEndDate")}</Label><div>{p.newEndDate}</div></div>}
            {r.type === "early_return" && <div><Label>{t("admin.requests.dialog.returnDate")}</Label><div>{p.returnDate}</div></div>}
            {r.type === "damage" && (
              <div className="grid grid-cols-2 gap-2">
                <div><Label>{t("admin.requests.dialog.location")}</Label><div>{p.location || "—"}</div></div>
                <div><Label>{t("admin.requests.dialog.occurredAt")}</Label><div>{p.occurredAt || "—"}</div></div>
              </div>
            )}
            {r.type === "other" && <div><Label>{t("admin.requests.dialog.subject")}</Label><div>{p.subject}</div></div>}
            {r.type === "maintenance" && (
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2"><Label>{t("admin.requests.dialog.issue")}</Label><div>{p.issue}</div></div>
                <div><Label>{t("admin.requests.dialog.mileage")}</Label><div>{p.mileage || "—"}{String(p.urgent) === "true" ? ` · ${t("admin.requests.dialog.urgent")}` : ""}</div></div>
              </div>
            )}
            {r.type === "mileage" && <div><Label>{t("admin.requests.dialog.mileage")}</Label><div>{p.mileage}</div></div>}
            <div><Label>{t("admin.requests.dialog.message")}</Label><p className="whitespace-pre-wrap rounded-md bg-muted p-2">{r.message}</p></div>
            {r.attachments.length > 0 && (
              <div>
                <Label>{t("admin.requests.dialog.attachments")}</Label>
                <ul className="list-disc pl-5">
                  {r.attachments.map((a) => <li key={a.id}><button type="button" className="underline" onClick={() => preview.open(`/api/portal-requests/${r.id}/attachments/${a.id}`, a.fileName)}>{a.fileName}</button></li>)}
                </ul>
              </div>
            )}
            <div>
              <Label>{t("admin.requests.dialog.thread")}</Label>
              <div className="mt-1 rounded-md border p-2">
                <RequestThread messages={r.messages} mine="staff" canPost={canManage && isOpen}
                  send={async (body) => (await apiRequest("POST", `/api/portal-requests/${id}/messages`, { body })).json()}
                  onSent={done} placeholder={t("admin.requests.dialog.threadPlaceholder")} testId="staff-thread" />
              </div>
            </div>
            {canManage && isOpen && r.type === "booking" && !approving && (
              <p className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">{t("admin.booking.closeHint")}</p>
            )}
            {canManage && isOpen && r.type === "booking" && approving && (
              <BookingApproval request={r} onApproved={(reservationId) => { done(); setApproving(false); openReservationDialog(reservationId); }} />
            )}
            {canManage && isOpen && (
              <div className="space-y-2 border-t pt-3">
                <Label htmlFor="rq-reply">{t("admin.requests.dialog.reply")}</Label>
                <Textarea id="rq-reply" rows={4} value={reply} onChange={(e) => setReply(e.target.value)} data-testid="textarea-request-reply" />
                <div className="flex flex-wrap gap-2">
                  {r.status === "new" && <Button size="sm" variant="outline" onClick={() => act.mutate({ url: `/api/portal-requests/${id}/take` })}>{t("admin.requests.dialog.take")}</Button>}
                  {(r.type === "extension" || r.type === "early_return") && (
                    <Button size="sm" onClick={() => act.mutate({ url: `/api/portal-requests/${id}/approve` })} data-testid="button-approve-request">{t("admin.requests.dialog.approve")}</Button>
                  )}
                  {r.type === "booking" && !approving && (
                    <Button size="sm" onClick={() => setApproving(true)} data-testid="button-approve-request">{t("admin.booking.open")}</Button>
                  )}
                  {r.type === "booking"
                    ? <Button size="sm" variant="outline" onClick={() => needReply() && act.mutate({ url: `/api/portal-requests/${id}/reply`, body: { reply, status: "in_progress" } })} data-testid="button-answer-request">{t("admin.requests.dialog.replyOnly")}</Button>
                    : <Button size="sm" onClick={() => needReply() && act.mutate({ url: `/api/portal-requests/${id}/reply`, body: { reply, status: "done" } })} data-testid="button-answer-request">{t("admin.requests.dialog.answer")}</Button>}
                  <Button size="sm" variant="destructive" onClick={() => needReply() && act.mutate({ url: `/api/portal-requests/${id}/reply`, body: { reply, status: "rejected" } })}>{t("admin.requests.dialog.reject")}</Button>
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  </>);
}
