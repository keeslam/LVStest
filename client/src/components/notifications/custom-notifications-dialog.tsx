import { Dialog, DialogContent } from "@/components/ui/dialog";
import { CustomNotificationsPanel } from "@/components/notifications/custom-notifications-panel";

interface CustomNotificationsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CustomNotificationsDialog({ open, onOpenChange }: CustomNotificationsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <CustomNotificationsPanel onBack={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}
