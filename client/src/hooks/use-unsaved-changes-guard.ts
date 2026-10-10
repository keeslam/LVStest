import { useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

/**
 * A-3-10, A-4-8 (audit 2026-10-09): Escape, a click next to the dialog and
 * "Annuleren" threw away what was typed in the vehicle and customer forms
 * without a word. The reservation dialogs already protect their forms
 * (`components/dialogs/dirty-close-guard.ts`, which blocks the backdrop click
 * with a toast). This hook is the shared version: every way of closing goes
 * through `requestClose`, which closes at once while the form is clean and
 * asks "Wijzigingen verwerpen?" while it is dirty.
 *
 * Usage:
 *   const guard = useUnsavedChangesGuard({ close: () => setOpen(false) });
 *   <Dialog open={open} onOpenChange={guard.onOpenChange}>
 *   <Form onDirtyChange={guard.setDirty} onCancel={guard.requestClose} />
 *   <ConfirmDialog {...guard.confirmProps} />
 *
 * A successful save closes the dialog directly (`close()`), which also marks
 * the form clean in the hook; the form itself reports clean again when it mounts,
 * so a reopened dialog never asks about the previous session.
 *
 * Switching the reservation dialogs and the three document editors to this
 * hook is left for the final wave.
 */
export interface UnsavedChangesGuardOptions {
  /** Actually closes the dialog. Called straight away when clean, after the user agrees when dirty. */
  close: () => void;
  /** Opens the dialog; only needed for a `<Dialog onOpenChange>` that also has a trigger. */
  open?: () => void;
}

export function useUnsavedChangesGuard({ close, open }: UnsavedChangesGuardOptions) {
  const { t } = useTranslation("common");
  // A ref: the form reports dirtiness on every keystroke and the guard reads it
  // only when a close is requested, so no re-render is needed.
  const dirtyRef = useRef(false);
  const [asking, setAsking] = useState(false);

  const setDirty = useCallback((dirty: boolean) => {
    dirtyRef.current = dirty;
  }, []);

  const finishClose = useCallback(() => {
    dirtyRef.current = false;
    setAsking(false);
    close();
  }, [close]);

  /** Escape, the X, a backdrop click and the Annuleren button all arrive here. */
  const requestClose = useCallback(() => {
    if (dirtyRef.current) {
      setAsking(true);
      return;
    }
    finishClose();
  }, [finishClose]);

  /** For `<Dialog onOpenChange>`: opening is never guarded, closing always is. */
  const onOpenChange = useCallback(
    (next: boolean) => {
      if (next) {
        open?.();
        return;
      }
      // Radix only calls the topmost layer's onOpenChange, so a nested dialog's own
      // close never reaches this one; a stacked clean form must still close on Escape.
      requestClose();
    },
    [open, requestClose],
  );

  return {
    setDirty,
    requestClose,
    onOpenChange,
    /** Props for `<ConfirmDialog />`: keep editing is the default, discarding needs the explicit button. */
    confirmProps: {
      open: asking,
      onOpenChange: setAsking,
      title: t("discardChanges.title"),
      description: t("discardChanges.description"),
      confirmLabel: t("discardChanges.confirm"),
      cancelLabel: t("discardChanges.keep"),
      variant: "warning" as const,
      onConfirm: finishClose,
      confirmTestId: "button-discard-changes",
    },
  };
}
