/**
 * OPT-021 — "Een kleine set sneltoetsen voor het baliewerk".
 *
 * There were none: the counter is a keyboard-and-scanner workplace and the
 * product was entirely mouse-driven. The risk the report names is the whole
 * reason this is a module of its own rather than a `keydown` listener inside a
 * component:
 *
 *   "Een globale letter-sneltoets die afvuurt terwijl de scanner een code
 *    intikt is schadelijker dan geen sneltoets."
 *
 * A USB/Bluetooth barcode scanner emulates a keyboard. It types a code — which
 * contains letters — into whatever has focus, and finishes with Enter. So a
 * bare-letter shortcut must never fire while focus is in any text entry: an
 * input, a textarea, a contenteditable, a select, or the scan field. That
 * exclusion is the point of the feature, and `shouldIgnoreShortcut()` decides
 * it on its own, testably.
 */
export type ShortcutAction = "search" | "newReservation" | "scan" | "help";

export interface ShortcutKeyEvent {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  target?: EventTarget | null;
}

const TEXT_ENTRY_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);

/**
 * True when the keystroke belongs to whatever the employee is typing into, and
 * must therefore be left alone.
 */
export function shouldIgnoreShortcut(target: EventTarget | null | undefined): boolean {
  if (!target || typeof (target as HTMLElement).tagName !== "string") return false;
  const element = target as HTMLElement;

  if (TEXT_ENTRY_TAGS.has(element.tagName)) return true;
  if (element.isContentEditable) return true;
  // Radix comboboxes and menus put focus on a div with a role; typing there is
  // type-ahead, not a shortcut.
  const role = element.getAttribute ? element.getAttribute("role") : null;
  if (role === "textbox" || role === "combobox" || role === "searchbox") return true;
  // The scan panel's field, whatever element it is rendered as. Deliberately
  // explicit: this is the one the scanner types into.
  if (element.closest && element.closest("[data-scan-input]")) return true;
  return false;
}

/**
 * Which action this keystroke means, or null.
 *
 * Ctrl/Cmd+K is the only combination, and it is allowed to fire from inside a
 * text field because nothing types it by accident. Every bare letter is
 * refused there.
 */
export function matchShortcut(event: ShortcutKeyEvent): ShortcutAction | null {
  const key = event.key;
  const withModifier = !!(event.ctrlKey || event.metaKey);

  // Ctrl+K / Cmd+K — focus the search box. Works anywhere.
  if (withModifier && !event.altKey && (key === "k" || key === "K")) return "search";

  // Everything below is a bare key: never while something is being typed.
  if (withModifier || event.altKey) return null;
  if (shouldIgnoreShortcut(event.target)) return null;

  if (key === "/") return "search";
  if (key === "n" || key === "N") return "newReservation";
  if (key === "s" || key === "S") return "scan";
  if (key === "?") return "help";
  return null;
}

export type DocumentedShortcut = ShortcutAction | "escape" | "enter";

/** The overview dialog's content, so the list and the handler cannot drift. */
export const SHORTCUTS: Array<{ action: DocumentedShortcut; keys: string[] }> = [
  { action: "search", keys: ["Ctrl+K", "/"] },
  { action: "newReservation", keys: ["N"] },
  { action: "scan", keys: ["S"] },
  { action: "help", keys: ["?"] },
  { action: "escape", keys: ["Esc"] },
  { action: "enter", keys: ["Enter"] },
];
