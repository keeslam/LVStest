/**
 * A PDF opened in an <iframe> takes the keyboard focus the moment its viewer has loaded. From then on
 * Escape goes to the viewer, not to the page, so a preview dialog "ignores Escape" (audit 2026-10-09,
 * A-10-3 / A-10-4). Calling this from the iframe's `onLoad` hands the focus back to the dialog around
 * it once, shortly after the viewer grabbed it; clicking into the PDF afterwards keeps working as
 * usual (and a click outside the dialog, or its close button, still closes it).
 *
 * The delay is the viewer's own: it focuses itself a moment after `load`, so an immediate call
 * would be overwritten.
 */
export function releaseIframeFocus(frame: HTMLIFrameElement | null, delayMs = 250): void {
  if (!frame) return;
  window.setTimeout(() => {
    if (document.activeElement !== frame) return;
    const dialog = frame.closest<HTMLElement>('[role="dialog"], [role="alertdialog"]');
    dialog?.focus();
  }, delayMs);
}
