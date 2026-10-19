import { useState } from "react";
import { formatLicensePlate } from "@/lib/format-utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useFilePreview } from "@/components/documents/use-file-preview";
import type { PortalFineDto } from "@shared/fines";
import { PortalApiError, portalFetch, portalQueryFn } from "@/lib/portal-api";
import { useToast } from "@/hooks/use-toast";
import { usePortalAuth } from "@/hooks/use-portal-auth";
import { usePortalDialogs } from "@/hooks/use-portal-dialogs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { DetailRow } from "./reservation-dialog";
import { btnPrimary } from "./ui";
import { formatPortalCurrency, formatPortalDateTimeMedium } from "@/lib/portal-format";

/** One fine as the customer sees it: what, when, how much, and a way to ask about it. */
export function FineDialog({ id, onClose }: { id: number | null; onClose: () => void }) {
  const { t } = useTranslation("portal");
  const preview = useFilePreview();
  const { me } = usePortalAuth();
  const { openNewRequest } = usePortalDialogs();
  const { data: f, isLoading, isError } = useQuery<PortalFineDto>({ queryKey: ["portal", `/api/portal/fines/${id}`], queryFn: portalQueryFn, enabled: id !== null });
  // Kees, 2026-10-18: several drivers shared the car, so the admin says who drove.
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [who, setWho] = useState("");
  const setDriver = useMutation({
    mutationFn: () => portalFetch<PortalFineDto>("POST", `/api/portal/fines/${id}/driver`, { driverId: Number(who) }),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["portal"] }); toast({ title: t("fines.whoDrove.saved") }); setWho(""); },
    onError: (e) => toast({ title: t(`errors.${e instanceof PortalApiError ? e.code : "PORTAL_SERVER_ERROR"}`, { defaultValue: (e as Error).message }), variant: "destructive" }),
  });

  return (<>
    <Dialog open={id !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl" data-testid="portal-fine-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {t("fines.detailTitle")} #{id}
          </DialogTitle>
          <DialogDescription className="sr-only">{t("fines.detailDescription")}</DialogDescription>
        </DialogHeader>
        {isError ? <p className="p-6 text-center text-sm text-muted-foreground">{t("errors.PORTAL_NOT_FOUND")}</p> : isLoading || !f ? <div className="flex justify-center p-6"><Loader2 className="h-5 w-5 animate-spin" /></div> : (
          <div className="space-y-3">
            <dl className="space-y-1">
              <DetailRow label={t("fines.fields.plate")} value={formatLicensePlate(f.licensePlate)} />
              <DetailRow label={t("fines.fields.offenceAt")} value={formatPortalDateTimeMedium(f.offenceAt)} />
              <DetailRow label={t("fines.fields.description")} value={f.description} />
              <DetailRow label={t("fines.fields.reference")} value={f.reference} />
              <DetailRow label={t("fines.fields.driver")} value={f.driver?.displayName} />
              <DetailRow label={t("fines.fields.amount")} value={formatPortalCurrency(f.amount)} />
              <DetailRow label={t("fines.fields.note")} value={f.customerNote} />
            </dl>
            {!f.driver && (f.driverOptions?.length ?? 0) > 0 && (
              <div className="space-y-2 rounded-md border border-[#f4d7a8] bg-[#faeeda] p-3 text-sm text-[#633806]" data-testid="fine-who-drove">
                <p>{t("fines.whoDrove.explain")}</p>
                <div className="flex flex-wrap items-center gap-2">
                  <select className="min-w-[12rem] rounded-md border bg-white px-2 py-1.5 text-sm text-[#0f172a]" value={who} onChange={(e) => setWho(e.target.value)} aria-label={t("fines.whoDrove.label")} data-testid="select-fine-driver">
                    <option value="">{t("fines.whoDrove.label")}</option>
                    {f.driverOptions!.map((d) => <option key={d.id} value={d.id}>{d.displayName}</option>)}
                  </select>
                  <Button size="sm" className={btnPrimary} onClick={() => setDriver.mutate()} disabled={!who || setDriver.isPending} data-testid="button-save-fine-driver">{t("fines.whoDrove.save")}</Button>
                </div>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              {f.hasLetter && <Button size="sm" variant="outline" onClick={() => preview.open(`/api/portal/fines/${f.id}/letter`, t("fines.letter"))} data-testid="button-fine-letter">{t("fines.letter")}</Button>}
              {me?.settings.canSubmitRequests && <Button size="sm" className={btnPrimary} onClick={() => openNewRequest({ type: "fine_question", fineId: f.id })} data-testid="button-fine-ask">{t("fines.ask")}</Button>}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
    {preview.dialog}
  </>);
}
