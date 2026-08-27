import { Dialog, DialogContent } from "@/components/ui/dialog";
import { NotificationsPanel } from "@/components/notifications/notifications-panel";

interface NotificationsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Called (in addition to closing this dialog) when the panel navigates
  // to a real page, e.g. so a parent dialog this is stacked on top of
  // closes too instead of being left open behind the new page.
  onNavigateAway?: () => void;
}

export function NotificationsDialog({ open, onOpenChange, onNavigateAway }: NotificationsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <NotificationsPanel onNavigateAway={() => { onOpenChange(false); onNavigateAway?.(); }} />
      </DialogContent>
    </Dialog>
  );
}
