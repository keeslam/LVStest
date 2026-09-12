/**
 * FIX-Q (BUG-225) — "Klikken naast de nieuwe-reserveringsdialoog gooit alles
 * weg wat er is ingetypt."
 *
 * Radix closes a dialog on any pointer-down outside it. For a read-only dialog
 * that is right; for a half-filled reservation form it throws away ten minutes
 * of typing with no warning and no undo. The rule is one line — "an accidental
 * click on the backdrop is not a decision, the X and Cancel are" — and it lives
 * here so it can be tested against a real Radix dialog without mounting the
 * 3 000-line reservation form behind it.
 */

export interface DirtyCloseGuardOptions {
  /** Read at event time: the form's dirty flag lives in a ref, not in state. */
  isDirty: () => boolean;
  /** Told once per blocked close, so the user learns why nothing happened. */
  onBlocked: () => void;
}

/**
 * Returns a handler for `onPointerDownOutside` / `onInteractOutside`.
 * `true` means "handled, the dialog stays open"; `false` means "not my case,
 * carry on with the other checks".
 */
export function createDirtyCloseGuard({ isDirty, onBlocked }: DirtyCloseGuardOptions) {
  return function keepOpenBecauseDirty(event: { preventDefault: () => void }): boolean {
    if (!isDirty()) return false;
    event.preventDefault();
    onBlocked();
    return true;
  };
}
