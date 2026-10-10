import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ScanLine } from "lucide-react";
import { ScanPanel } from "@/components/barcodes/scan-panel";
import type { HandoverKind } from "@/lib/handover-choice";

interface ScanDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** OPT-002 - which handover the employee came here to start, if any. */
  intent?: HandoverKind | null;
}

export function ScanDialog({ open, onOpenChange, intent = null }: ScanDialogProps) {
  const { t } = useTranslation(["barcodes", "common"]);
  // A-6-5: while a pickup/return form is open on top, this window steps aside
  // (hidden, not closed - closing would throw the form away with it).
  const [handoverActive, setHandoverActive] = useState(false);
  // Derived instead of reset by an effect: a window closed with a handover form still open keeps
  // handoverActive true until the panel remounts and reports false, but it is only ever hidden
  // while it is open, so it never comes back hidden and there is no intermediate state to render.
  const handoverHidden = open && handoverActive;

  const title = intent === "pickup"
    ? t("scanPage.intent.pickupTitle")
    : intent === "return"
      ? t("scanPage.intent.returnTitle")
      : t("scanPage.title");
  const description = intent
    ? t("scanPage.intent.description")
    : t("scanPage.description");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={`max-w-2xl max-h-[90vh] overflow-y-auto ${handoverHidden ? "invisible" : ""}`}
        data-testid="dialog-scan"
        data-handover-active={handoverHidden ? "true" : "false"}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ScanLine className="h-6 w-6" />
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <ScanPanel
          active={open}
          intent={intent}
          onHandoverActiveChange={setHandoverActive}
          onHandoverFinished={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
