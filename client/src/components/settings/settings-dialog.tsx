import { Dialog, DialogContent } from "@/components/ui/dialog";
import { SettingsPanel } from "@/components/settings/settings-panel";

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <SettingsPanel />
      </DialogContent>
    </Dialog>
  );
}
