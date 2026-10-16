import { useTranslation } from "react-i18next";
import { BookOpen } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ManualReader } from "@/components/manual/manual-reader";

interface ManualDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Handleiding: de gebruikershandleiding als dialoog vanuit het gebruikersmenu. */
export function ManualDialog({ open, onOpenChange }: ManualDialogProps) {
  const { t } = useTranslation("nav");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[90vh] max-w-6xl flex-col gap-4 p-4 md:p-6" data-testid="manual-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-primary-600" />
            {t("manual.title")}
          </DialogTitle>
          <DialogDescription>{t("manual.description")}</DialogDescription>
        </DialogHeader>
        {open && <ManualReader className="min-h-0 flex-1" />}
      </DialogContent>
    </Dialog>
  );
}
