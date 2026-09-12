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
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="dialog-scan">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ScanLine className="h-6 w-6" />
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <ScanPanel active={open} intent={intent} />
      </DialogContent>
    </Dialog>
  );
}
