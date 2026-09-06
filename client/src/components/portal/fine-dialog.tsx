import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { PortalFineDto } from "@shared/fines";
import { portalQueryFn } from "@/lib/portal-api";
import { usePortalAuth } from "@/hooks/use-portal-auth";
import { usePortalDialogs } from "@/hooks/use-portal-dialogs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { DetailRow } from "./reservation-dialog";
import { StatusBadge, btnPrimary } from "./ui";

/** One fine as the customer sees it: what, when, how much, and a way to ask about it. */
export function FineDialog({ id, onClose }: { id: number | null; onClose: () => void }) {
  const { t } = useTranslation("portal");
  const { me } = usePortalAuth();
  const { openNewRequest } = usePortalDialogs();
  const { data: f, isLoading, isError } = useQuery<PortalFineDto>({ queryKey: ["portal", `/api/portal/fines/${id}`], queryFn: portalQueryFn, enabled: id !== null });

  return (
    <Dialog open={id !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg" data-testid="portal-fine-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {t("fines.detailTitle")} #{id}
            {f && <StatusBadge kind="fine" status={f.status} label={t(`fines.status.${f.status}`, { defaultValue: f.status })} />}
          </DialogTitle>
        </DialogHeader>
        {isError ? <p className="p-6 text-center text-sm text-muted-foreground">{t("errors.PORTAL_NOT_FOUND")}</p> : isLoading || !f ? <div className="flex justify-center p-6"><Loader2 className="h-5 w-5 animate-spin" /></div> : (
          <div className="space-y-3">
            <dl className="space-y-1">
              <DetailRow label={t("fines.fields.plate")} value={f.licensePlate} />
              <DetailRow label={t("fines.fields.offenceAt")} value={new Date(f.offenceAt).toLocaleString()} />
              <DetailRow label={t("fines.fields.description")} value={f.description} />
              <DetailRow label={t("fines.fields.reference")} value={f.reference} />
              <DetailRow label={t("fines.fields.driver")} value={f.driver?.displayName} />
              <DetailRow label={t("fines.fields.amount")} value={`€ ${f.amount}`} />
              <DetailRow label={t("fines.fields.note")} value={f.customerNote} />
            </dl>
            <div className="flex flex-wrap gap-2">
              {f.hasLetter && <Button asChild size="sm" variant="outline"><a href={`/api/portal/fines/${f.id}/letter`} target="_blank" rel="noopener">{t("fines.letter")}</a></Button>}
              {me?.settings.canSubmitRequests && <Button size="sm" className={btnPrimary} onClick={() => openNewRequest({ type: "fine_question", fineId: f.id })} data-testid="button-fine-ask">{t("fines.ask")}</Button>}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
