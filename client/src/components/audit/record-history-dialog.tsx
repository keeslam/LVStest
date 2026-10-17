import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RecordHistory, type RecordHistoryResourceType } from "@/components/audit/record-history";

interface RecordHistoryDialogProps {
  resourceType: RecordHistoryResourceType;
  /** The record whose history is shown; `null` keeps the dialog closed. */
  resourceId: number | null;
  /** Named in the title, e.g. the document's file name. */
  label?: string | null;
  onClose: () => void;
}

/**
 * The record history in a dialog of its own, for records that have no detail
 * dialog to put a "Geschiedenis" section in - a document is a card with four
 * actions, not a page.
 */
export function RecordHistoryDialog({ resourceType, resourceId, label, onClose }: RecordHistoryDialogProps) {
  const { t } = useTranslation("common");
  return (
    <Dialog open={resourceId !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto" data-testid={`record-history-dialog-${resourceType}`}>
        <DialogHeader>
          <DialogTitle>
            {t('recordHistory.title')}{label ? ` - ${label}` : ''}
          </DialogTitle>
          <DialogDescription>{t('recordHistory.description')}</DialogDescription>
        </DialogHeader>
        {resourceId !== null && (
          <RecordHistory resourceType={resourceType} resourceId={resourceId} showHeading={false} />
        )}
      </DialogContent>
    </Dialog>
  );
}
