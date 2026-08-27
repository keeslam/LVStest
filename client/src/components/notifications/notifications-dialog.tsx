import { Dialog, DialogContent } from "@/components/ui/dialog";
import { NotificationsPanel } from "@/components/notifications/notifications-panel";

interface NotificationsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function NotificationsDialog({ open, onOpenChange }: NotificationsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <NotificationsPanel />
      </DialogContent>
    </Dialog>
  );
}
