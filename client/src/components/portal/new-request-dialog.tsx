import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { usePortalDialogs, type NewRequestPrefill } from "@/hooks/use-portal-dialogs";
import { RequestForm } from "./request-form";

/** New request form in a dialog; after sending, the request itself opens. */
export function NewRequestDialog({ prefill, onClose }: { prefill: NewRequestPrefill | null; onClose: () => void }) {
  const { t } = useTranslation("portal");
  const { openRequest } = usePortalDialogs();
  return (
    <Dialog open={prefill !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg" data-testid="portal-new-request-dialog">
        <DialogHeader><DialogTitle>{prefill?.type && prefill.type !== "other" ? t(`requests.type.${prefill.type}`) : t("requests.new")}</DialogTitle></DialogHeader>
        {prefill && (
          <RequestForm key={`${prefill.type ?? ""}-${prefill.reservationId ?? ""}-${prefill.fineId ?? ""}-${prefill.vehicleId ?? ""}-${prefill.blockId ?? ""}`}
            initialType={prefill.type} reservationId={prefill.reservationId} fineId={prefill.fineId} vehicleId={prefill.vehicleId} startDate={prefill.startDate} endDate={prefill.endDate}
            blockId={prefill.blockId} blockDate={prefill.blockDate}
            onSubmitted={(id) => openRequest(id)} />
        )}
      </DialogContent>
    </Dialog>
  );
}
