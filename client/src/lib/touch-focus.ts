/**
 * iPad and phones: a touch screen without mouse or trackpad. Focusing a text
 * field there pops up the on-screen keyboard, so opening a dialog or picker
 * must not put the cursor in its first field on its own. The employee taps
 * the field when they want to type.
 *
 * An iPad with a trackpad reports a fine pointer and keeps desktop behaviour;
 * with a hardware keyboard (or a Bluetooth scanner) iOS shows no on-screen
 * keyboard anyway, but a scan field then needs one tap first.
 */
export function isTouchOnly(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(hover: none) and (pointer: coarse)").matches;
}

/** Focus a field, except on a touch-only screen where that opens the keyboard. */
export function focusUnlessTouch(el: HTMLElement | null | undefined): void {
  if (el && !isTouchOnly()) el.focus();
}

/**
 * Radix onOpenAutoFocus handler for DialogContent / PopoverContent: on a
 * touch-only screen focus the container itself (focus trap and Escape keep
 * working) instead of the first input. A caller's own handler runs first and
 * wins when it calls preventDefault().
 */
export function touchSafeOpenAutoFocus(
  own: ((event: Event) => void) | undefined,
  container: () => HTMLElement | null,
): (event: Event) => void {
  return (event) => {
    own?.(event);
    if (event.defaultPrevented || !isTouchOnly()) return;
    event.preventDefault();
    container()?.focus({ preventScroll: true });
  };
}
