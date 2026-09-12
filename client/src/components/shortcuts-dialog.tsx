/**
 * OPT-021 — "plus een overzichtje van de sneltoetsen".
 *
 * A shortcut nobody can discover is not a shortcut. This list is built from
 * `SHORTCUTS`, the same constant the handler is checked against, so the
 * overview cannot drift away from what the keys actually do.
 */
import { useTranslation } from "react-i18next";
import { Keyboard } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { SHORTCUTS } from "@/lib/keyboard-shortcuts";

interface ShortcutsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ShortcutsDialog({ open, onOpenChange }: ShortcutsDialogProps) {
  const { t } = useTranslation("common");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px]" data-testid="dialog-shortcuts">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Keyboard className="h-5 w-5" />
            {t('shortcuts.title')}
          </DialogTitle>
          <DialogDescription>{t('shortcuts.description')}</DialogDescription>
        </DialogHeader>

        <ul className="space-y-2" data-testid="shortcuts-list">
          {SHORTCUTS.map((shortcut) => (
            <li
              key={shortcut.action}
              className="flex items-center justify-between gap-4"
              data-testid={`shortcut-${shortcut.action}`}
            >
              <span className="text-sm">{t(`shortcuts.actions.${shortcut.action}`)}</span>
              <span className="flex gap-1">
                {shortcut.keys.map((key) => (
                  <kbd
                    key={key}
                    className="rounded border bg-muted px-2 py-0.5 font-mono text-xs"
                  >
                    {key}
                  </kbd>
                ))}
              </span>
            </li>
          ))}
        </ul>

        <p className="text-xs text-muted-foreground">{t('shortcuts.scannerNote')}</p>
      </DialogContent>
    </Dialog>
  );
}
