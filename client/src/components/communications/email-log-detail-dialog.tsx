import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatDateTimeNl } from "@/lib/format-date-nl";
import { EmailFailureReasons } from "@/components/communications/email-failure-reasons";

// One row of GET /api/email-logs (shared/schema.ts, emailLogs). Two kinds live
// in the same table: one row per send attempt (recipient + result set, written
// by sendEmail) and one summary row per notification run (recipient null, the
// run's totals and every error it collected).
export interface EmailLogRow {
  id: number;
  template: string;
  subject: string;
  recipients: number;
  emailsSent: number;
  emailsFailed: number;
  failureReason: string | null;
  sentAt: string;
  recipient: string | null;
  result: string | null;
  vehicleIds?: number[] | null;
  documentId?: number | null;
}

export type EmailLogStatus = "sent" | "failed" | "partial";

interface EmailLogDetailDialogProps {
  row: EmailLogRow | null;
  status: EmailLogStatus;
  kindLabel: string;
  onClose: () => void;
}

/**
 * A row of the e-mail log, opened (audit 2026-10-09, module 13, UX remark: a
 * sent e-mail could not be opened from the log). The log keeps the result of a
 * send, not its body, and the dialog says so instead of leaving the question open.
 */
export function EmailLogDetailDialog({ row, status, kindLabel, onClose }: EmailLogDetailDialogProps) {
  const { t } = useTranslation("notifications");
  const key = (name: string) => t(`customerCommunications.history.${name}`);

  return (
    <Dialog open={row !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto" data-testid="dialog-email-log-detail">
        {row && (
          <>
            <DialogHeader>
              <DialogTitle className="break-words pr-6">{row.subject}</DialogTitle>
              <DialogDescription>{key("detailDescription")}</DialogDescription>
            </DialogHeader>

            <dl className="grid grid-cols-[8rem_1fr] gap-x-3 gap-y-2 text-sm">
              <dt className="text-muted-foreground">{key("detailStatus")}</dt>
              <dd data-testid="email-log-detail-status">
                <Badge variant={status === "sent" ? "default" : "destructive"}>
                  {t(`customerCommunications.history.statusLabels.${status}`)}
                </Badge>
              </dd>

              <dt className="text-muted-foreground">{key("detailKind")}</dt>
              <dd data-testid="email-log-detail-kind">{kindLabel}</dd>

              <dt className="text-muted-foreground">{key("detailSentAt")}</dt>
              <dd>{formatDateTimeNl(row.sentAt)}</dd>

              {row.recipient ? (
                <>
                  <dt className="text-muted-foreground">{key("detailRecipient")}</dt>
                  <dd className="break-all" data-testid="email-log-detail-recipient">{row.recipient}</dd>
                </>
              ) : (
                <>
                  <dt className="text-muted-foreground">{key("detailRecipients")}</dt>
                  <dd data-testid="email-log-detail-recipient">
                    {t("customerCommunications.history.recipientsCount", { count: row.recipients })}
                    {" · "}
                    {t("customerCommunications.history.roundCounts", { sent: row.emailsSent, failed: row.emailsFailed })}
                  </dd>
                </>
              )}

              {!row.recipient && Array.isArray(row.vehicleIds) && row.vehicleIds.length > 0 && (
                <>
                  <dt className="text-muted-foreground">{key("detailVehicles")}</dt>
                  <dd>{row.vehicleIds.length}</dd>
                </>
              )}

              {row.documentId ? (
                <>
                  <dt className="text-muted-foreground">{key("detailDocument")}</dt>
                  <dd>#{row.documentId}</dd>
                </>
              ) : null}
            </dl>

            {row.failureReason && (
              <div className="p-2 bg-yellow-50 rounded border border-yellow-200">
                <EmailFailureReasons reason={row.failureReason} testIdPrefix="email-log-detail" />
              </div>
            )}

            <p className="text-xs text-muted-foreground" data-testid="email-log-detail-body-note">
              {key("detailBodyNote")}
            </p>

            <DialogFooter>
              <Button variant="outline" onClick={onClose} data-testid="button-email-log-detail-close">
                {key("detailClose")}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
