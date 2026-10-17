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
import { withPrintIntent } from "@/lib/audit-events";
import { EmailDocumentDialog } from "@/components/documents/email-document-dialog";
import { UserPermission, type Document, type Reservation } from "@shared/schema";
import { CONTRACT_ERROR_CODES, type ContractErrorCode } from "@shared/contract-error-codes";

export type HandoverDocumentKind = "contract" | "damageCheck";

/**
 * B-34 — one i18n key per `ContractErrorCode` this dialog knows how to word.
 * Deliberately a *subset* of `CONTRACT_ERROR_CODES`: `TEMPLATE_NOT_FOUND` has
 * no entry here on purpose (see `contractFailureText` below) — the pickup and
 * retry routes this dialog reads never send an explicit `templateId`, so this
 * dialog cannot ever cause that code, and any sentence for it would need the
 * template's name, which the server sends only inside its English `message`
 * (never as its own field) — reading it out of there would be exactly the
 * "translate by matching English text" the besluiten forbid. Untranslated
 * codes fall back to the server's own text, same as an unrecognised one.
 */
const CONTRACT_ERROR_REASON_KEYS: Partial<Record<ContractErrorCode, string>> = {
  NO_TEMPLATE: "pickupReturn.handoverResult.errorReasons.NO_TEMPLATE",
  NO_DEFAULT_TEMPLATE: "pickupReturn.handoverResult.errorReasons.NO_DEFAULT_TEMPLATE",
  TEMPLATE_WITHOUT_FIELDS: "pickupReturn.handoverResult.errorReasons.TEMPLATE_WITHOUT_FIELDS",
  TEMPLATE_BACKGROUND_MISSING: "pickupReturn.handoverResult.errorReasons.TEMPLATE_BACKGROUND_MISSING",
  NO_VEHICLE: "pickupReturn.handoverResult.errorReasons.NO_VEHICLE",
  PLACEHOLDER_RESERVATION: "pickupReturn.handoverResult.errorReasons.PLACEHOLDER_RESERVATION",
  NO_CUSTOMER: "pickupReturn.handoverResult.errorReasons.NO_CUSTOMER",
  MAINTENANCE_BLOCK: "pickupReturn.handoverResult.errorReasons.MAINTENANCE_BLOCK",
  RENDER_FAILED: "pickupReturn.handoverResult.errorReasons.RENDER_FAILED",
};

// Fix round 1 (B-34 controller finding #3): the server now sends the offending
// template's own name (`templateName`, alongside `code`) for TEMPLATE_WITHOUT_FIELDS
// — `server/services/pdf-template-selection.ts` `withFields()`. When it is
// present, `{{name}}` is restored in the sentence above; a name-less fallback
// key covers the (currently theoretical) case of a template row with no name
// and the code path with no name at all, so the sentence is never left with a
// literal, un-interpolated "{{name}}".
const TEMPLATE_WITHOUT_FIELDS_UNKNOWN_KEY = "pickupReturn.handoverResult.errorReasons.TEMPLATE_WITHOUT_FIELDS_UNKNOWN";

function isContractErrorCode(code: unknown): code is ContractErrorCode {
  return typeof code === "string" && (CONTRACT_ERROR_CODES as readonly string[]).includes(code);
}

/**
 * The text shown for a failed contract: the stable `code` decides it, never
 * the server's English `message` — that stays only as the untranslated
 * fallback for a code this dialog does not know (or none at all), exactly as
 * before B-34. `templateName` is only ever read for TEMPLATE_WITHOUT_FIELDS.
 */
function contractFailureText(
  t: (key: string, options?: Record<string, unknown>) => string,
  code: string | null | undefined,
  detail: string | null | undefined,
  fallback: string,
  templateName?: string | null,
): string {
  if (isContractErrorCode(code)) {
    if (code === "TEMPLATE_WITHOUT_FIELDS") {
      return templateName
        ? t(CONTRACT_ERROR_REASON_KEYS.TEMPLATE_WITHOUT_FIELDS!, { name: templateName })
        : t(TEMPLATE_WITHOUT_FIELDS_UNKNOWN_KEY);
    }
    const key = CONTRACT_ERROR_REASON_KEYS[code];
    if (key) return t(key, { detail: detail ?? "" });
  }
  return fallback;
}

interface HandoverResultDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reservation: Reservation;
  /** The document the handover route created, or null when it could not. */
  document: Document | null;
  /** What the server said went wrong, when it said anything. */
  errorMessage?: string | null;
  /** B-34 — the stable reason `code` alongside `errorMessage`, when the pickup
   *  route sent one (`contractErrorCode`). Decides which Dutch/English
   *  sentence is shown; `errorMessage` itself is only ever a fallback. */
  errorCode?: string | null;
  /** Fix round 1 (B-34) — the offending template's own name
   *  (`contractErrorTemplateName`), read only for TEMPLATE_WITHOUT_FIELDS. */
  errorTemplateName?: string | null;
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
  // `intent=print`: the server logs this request as a print, not a view.
  return window.open(withPrintIntent(`/api/documents/view/${documentId}`), "documentPrintWindow", "width=900,height=700");
}

export function HandoverResultDialog({
  open,
  onOpenChange,
  reservation,
  document,
  errorMessage,
  errorCode,
  errorTemplateName,
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
      // B-34 — `apiRequest` (client/src/lib/queryClient.ts) merges the JSON
      // body onto the thrown error, so `error.code` is the same stable code
      // the pickup route sends; translate by that, never by matching
      // `error.message` (which is the server's own English text — the only
      // thing shown, unchanged, when the code is missing or not one of ours).
      toast({
        variant: "destructive",
        title: t('pickupReturn.handoverResult.retryFailed'),
        description: contractFailureText(t, error?.code, error?.message, error?.message, error?.templateName),
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
                : contractFailureText(
                    t,
                    errorCode,
                    errorMessage,
                    errorMessage || t('pickupReturn.handoverResult.failedDescription'),
                    errorTemplateName,
                  )}
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
