import { useTranslation } from "react-i18next";
import { useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, invalidateByPrefix } from "@/lib/queryClient";
import { describeApiError } from "@/lib/api-error";

interface CopyQuoteDialogProps {
  /** The quote to copy; null = closed. */
  quoteId: number | null;
  onOpenChange: (open: boolean) => void;
  /** Called with the new quote after a successful copy (the caller opens it). */
  onCopied: (newQuote: { id: number; quoteNumber: string }) => void;
}

/**
 * Asks "copy the attachments (dealer quote) too?" with Ja / Nee / Annuleren. Shared by the
 * quote list and the quote editor (Task 8).
 */
export function CopyQuoteDialog({ quoteId, onOpenChange, onCopied }: CopyQuoteDialogProps) {
  const { t } = useTranslation("leaseQuotes");
  const { toast } = useToast();

  const copy = useMutation({
    mutationFn: async (withAttachments: boolean) => {
      const res = await apiRequest("POST", `/api/lease-quotes/${quoteId}/copy`, { withAttachments });
      return (await res.json()) as { id: number; quoteNumber: string };
    },
    onSuccess: async (created) => {
      await invalidateByPrefix("/api/lease-quotes");
      toast({ title: t("copy.done", { number: created.quoteNumber }) });
      onOpenChange(false);
      onCopied(created);
    },
    onError: (error) => {
      toast({ title: t("copy.failed"), description: describeApiError(error), variant: "destructive" });
    },
  });

  return (
    <Dialog open={quoteId !== null} onOpenChange={(open) => { if (!copy.isPending) onOpenChange(open); }}>
      <DialogContent data-testid="dialog-copy-lease-quote">
        <DialogHeader>
          <DialogTitle>{t("copy.question")}</DialogTitle>
          <DialogDescription>{t("copy.description")}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" disabled={copy.isPending} onClick={() => onOpenChange(false)} data-testid="button-copy-cancel">
            {t("copy.cancel")}
          </Button>
          <Button variant="outline" disabled={copy.isPending} onClick={() => copy.mutate(false)} data-testid="button-copy-no">
            {t("copy.no")}
          </Button>
          <Button disabled={copy.isPending} onClick={() => copy.mutate(true)} data-testid="button-copy-yes">
            {t("copy.yes")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
