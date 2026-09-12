/**
 * OPT-013 — "Elke uitgaande mail loggen en de status tonen".
 *
 * FIX-M built the server half: an `email_logs` row per attempt, success and
 * failure, with an SMTP timeout. What the proposal is actually about is the
 * question it wanted answered — "heeft de klant het contract gekregen?" — and
 * that question is asked at the counter, about one document, not in a flat log
 * nobody opens. The measured state was three failed sends leaving `email_logs`
 * unchanged at 12, with no notification, no flag on the document and no audit
 * line; the employee who missed the toast could never check afterwards.
 *
 * This is that line, on the document: "verzonden op … aan …" or "verzenden
 * mislukt", with the server's own reason.
 */
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { MailCheck, MailX } from "lucide-react";
import { formatDateTimeNl } from "@/lib/format-date-nl";

export interface DocumentMailAttempt {
  id: number;
  recipient: string | null;
  result: string | null;
  failureReason: string | null;
  sentAt: string;
  subject: string | null;
}

export function documentMailStatusUrl(documentId: number): string {
  return `/api/documents/${documentId}/email-status`;
}

/**
 * The line to show: the most recent attempt. A failure after a success is the
 * one that matters — it is the state the document is in now.
 */
export function latestAttempt(attempts: DocumentMailAttempt[]): DocumentMailAttempt | null {
  if (!attempts || attempts.length === 0) return null;
  return [...attempts].sort((a, b) => (a.sentAt < b.sentAt ? 1 : a.sentAt > b.sentAt ? -1 : b.id - a.id))[0];
}

interface DocumentMailStatusProps {
  documentId: number;
  /** Skip the request until the row is actually on screen. */
  enabled?: boolean;
}

export function DocumentMailStatus({ documentId, enabled = true }: DocumentMailStatusProps) {
  const { t } = useTranslation("documents");

  const { data } = useQuery<{ attempts: DocumentMailAttempt[] }>({
    queryKey: [documentMailStatusUrl(documentId)],
    enabled: enabled && Number.isInteger(documentId) && documentId > 0,
    retry: false,
    staleTime: 30_000,
  });

  const attempt = latestAttempt(data?.attempts ?? []);
  // Never sent: say nothing. An empty line for every document that was never
  // meant to be mailed would be noise.
  if (!attempt) return null;

  const failed = attempt.result === "failed";

  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs ${failed ? "text-destructive" : "text-emerald-700"}`}
      data-testid={`document-mail-status-${documentId}`}
    >
      {failed ? <MailX className="h-3.5 w-3.5" /> : <MailCheck className="h-3.5 w-3.5" />}
      {failed
        ? t('mailStatus.failed', { reason: attempt.failureReason || t('mailStatus.unknownReason') })
        : t('mailStatus.sent', {
            date: formatDateTimeNl(attempt.sentAt),
            recipient: attempt.recipient || t('mailStatus.unknownRecipient'),
          })}
    </span>
  );
}
