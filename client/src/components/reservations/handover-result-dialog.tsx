/**
 * OPT-005 — "Contract bevestigen en direct afdrukken/mailen in de
 * ophaaldialoog".
 *
 * Before this, the pickup dialog showed "Ophalen voltooid / Contract is
 * gegenereerd" unconditionally — the server caught a failed PDF in a `catch`
 * that only logged and still answered 200 — and handing the contract to the
 * customer meant closing the dialog, reopening the reservation, scrolling to
 * the documents section, expanding the document and opening the preview: four
 * clicks of pure navigation, 50x a day.
 *
 * The handover routes now return the document they created (or the reason they
 * could not). This dialog states which of the two happened and offers the two
 * things the employee came to do.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation } from "@tanstack/react-query";
import { CheckCircle2, AlertTriangle, Printer, Mail, RefreshCw } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RequiresPermission } from "@/components/ui/requires-permission";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, invalidateByPrefix } from "@/lib/queryClient";
import { EmailDocumentDialog } from "@/components/documents/email-document-dialog";
import { UserPermission, type Document, type Reservation } from "@shared/schema";

export type HandoverDocumentKind = "contract" | "damageCheck";

interface HandoverResultDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reservation: Reservation;
  /** The document the handover route created, or null when it could not. */
  document: Document | null;
  /** What the server said went wrong, when it said anything. */
  errorMessage?: string | null;
  kind: HandoverDocumentKind;
  /** Called after the employee closes this dialog. */
  onDone?: () => void;
}

/**
 * Printing: the same route the delivery dashboard prints through. A framed PDF
 * viewer silently falls back to a download, so the document is opened in its
 * own top-level window, which is what gets a real print dialog.
 */
export function openDocumentForPrint(documentId: number): Window | null {
  return window.open(`/api/documents/view/${documentId}`, "documentPrintWindow", "width=900,height=700");
}

export function HandoverResultDialog({
  open,
  onOpenChange,
  reservation,
  document,
  errorMessage,
  kind,
  onDone,
}: HandoverResultDialogProps) {
  const { t } = useTranslation(["reservations", "common"]);
  const { toast } = useToast();
  const [emailOpen, setEmailOpen] = useState(false);
  const [current, setCurrent] = useState<Document | null>(document);

  // Keep following the prop while the dialog is closed; once it is open the
  // local copy is what a retry updates.
  if (!open && current !== document) setCurrent(document);

  const retry = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/reservations/${reservation.id}/contract`, {});
      return (await response.json()) as { contractDocument: Document };
    },
    onSuccess: async (data) => {
      setCurrent(data.contractDocument);
      await invalidateByPrefix(`/api/documents/reservation/${reservation.id}`);
      toast({ title: t('pickupReturn.handoverResult.retrySucceeded') });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: t('pickupReturn.handoverResult.retryFailed'),
        description: error?.message,
      });
    },
  });

  const close = () => {
    onOpenChange(false);
    onDone?.();
  };

  const ready = !!current;

  return (
    <>
      <Dialog open={open} onOpenChange={(next) => { if (!next) close(); }}>
        <DialogContent className="sm:max-w-[480px]" data-testid="dialog-handover-result">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {ready ? (
                <CheckCircle2 className="h-5 w-5 text-green-600" />
              ) : (
                <AlertTriangle className="h-5 w-5 text-amber-600" />
              )}
              {ready
                ? t(`pickupReturn.handoverResult.${kind}ReadyTitle`)
                : t(`pickupReturn.handoverResult.${kind}FailedTitle`)}
            </DialogTitle>
            <DialogDescription>
              {ready
                ? t('pickupReturn.handoverResult.readyDescription', { fileName: current!.fileName })
                : errorMessage || t('pickupReturn.handoverResult.failedDescription')}
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="flex-col gap-2 sm:flex-row">
            {ready ? (
              <>
                <Button
                  variant="outline"
                  onClick={() => openDocumentForPrint(current!.id)}
                  data-testid="button-handover-print"
                >
                  <Printer className="mr-2 h-4 w-4" />
                  {t('pickupReturn.handoverResult.print')}
                </Button>
                <Button onClick={() => setEmailOpen(true)} data-testid="button-handover-email">
                  <Mail className="mr-2 h-4 w-4" />
                  {t('pickupReturn.handoverResult.email')}
                </Button>
              </>
            ) : (
              kind === "contract" && (
                // POST /api/reservations/:id/contract chains two hasPermission
                // middlewares (routes.ts:5135) — both must pass, i.e. an AND,
                // not an OR: the first real `allOf` case in this codebase.
                <RequiresPermission allOf={[UserPermission.MANAGE_RESERVATIONS, UserPermission.MANAGE_DOCUMENTS]}>
                  <Button
                    onClick={() => retry.mutate()}
                    disabled={retry.isPending}
                    data-testid="button-handover-retry"
                  >
                    <RefreshCw className={`mr-2 h-4 w-4 ${retry.isPending ? "animate-spin" : ""}`} />
                    {t('pickupReturn.handoverResult.retry')}
                  </Button>
                </RequiresPermission>
              )
            )}
            <Button variant="ghost" onClick={close} data-testid="button-handover-close">
              {t('common:actions.close')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {current && (
        <EmailDocumentDialog
          open={emailOpen}
          onOpenChange={setEmailOpen}
          documents={[current]}
          defaultDocumentIds={[current.id]}
          customer={(reservation as any).customer}
          vehicle={(reservation as any).vehicle}
          reservation={reservation}
        />
      )}
    </>
  );
}
