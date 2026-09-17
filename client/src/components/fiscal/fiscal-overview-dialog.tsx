import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { OverviewPanel } from "./overview-panel";

/** The fiscal overview as a dialog on the Klantenportaal page (besluit F-13). */
export function FiscalOverviewDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useTranslation("fiscal");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto" data-testid="dialog-fiscal-overview">
        <DialogHeader>
          <DialogTitle>{t("overviewDialog.title")}</DialogTitle>
          <DialogDescription>{t("overviewDialog.hint")}</DialogDescription>
        </DialogHeader>
        {open && <OverviewPanel />}
      </DialogContent>
    </Dialog>
  );
}
