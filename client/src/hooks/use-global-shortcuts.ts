/**
 * OPT-021 — the one global key handler.
 *
 * Installed once, by MainLayout. The decision "is this a shortcut at all" lives
 * in `@/lib/keyboard-shortcuts` and is tested there; this hook only owns the
 * listener's lifetime and the dispatch.
 */
import { useEffect } from "react";
import { matchShortcut, type ShortcutAction } from "@/lib/keyboard-shortcuts";

export type ShortcutHandlers = Partial<Record<ShortcutAction, () => void>>;

export function useGlobalShortcuts(handlers: ShortcutHandlers, enabled: boolean = true): void {
  useEffect(() => {
    if (!enabled) return;

    const onKeyDown = (event: KeyboardEvent) => {
      const action = matchShortcut({
        key: event.key,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        altKey: event.altKey,
        shiftKey: event.shiftKey,
        target: event.target,
      });
      if (!action) return;
      const handler = handlers[action];
      if (!handler) return;
      // Only once the shortcut is going to do something: a key we do not
      // handle must keep its browser meaning.
      event.preventDefault();
      handler();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // The handler object is rebuilt on every render of the layout; depending on
    // it would reinstall the listener constantly. The individual callbacks are
    // what matter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, handlers.search, handlers.newReservation, handlers.scan, handlers.help]);
}
