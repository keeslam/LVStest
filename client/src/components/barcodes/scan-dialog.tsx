import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ScanLine } from "lucide-react";
import { ScanPanel } from "@/components/barcodes/scan-panel";

interface ScanDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ScanDialog({ open, onOpenChange }: ScanDialogProps) {
  const { t } = useTranslation(["barcodes", "common"]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ScanLine className="h-6 w-6" />
            {t("scanPage.title")}
          </DialogTitle>
          <DialogDescription>{t("scanPage.description")}</DialogDescription>
        </DialogHeader>

        <ScanPanel active={open} />
      </DialogContent>
    </Dialog>
  );
}
