import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Search, Maximize2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/**
 * A table inside a customer dialog shows only its first few rows; the rest
 * lives in its own dialog with search and filters. Tables accept `preview`
 * and render `PreviewFooter` themselves, so the row count is always right.
 */
export interface Preview { limit: number; onShowAll: () => void }
export const PREVIEW_ROWS = 5;

export function PreviewFooter({ shown, total, onShowAll }: { shown: number; total: number; onShowAll: () => void }) {
  const { t } = useTranslation("portal");
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 pt-2 text-xs text-muted-foreground">
      <span>{t("admin.preview.shown", { shown, total })}</span>
      <Button size="sm" variant="outline" onClick={onShowAll} data-testid="button-show-all"><Maximize2 className="mr-1.5 h-3.5 w-3.5" />{t("admin.preview.showAll")}</Button>
    </div>
  );
}

/** Free-text search box for the full view of a table. */
export function TableSearch({ value, onChange, placeholder, testId = "table-search" }: { value: string; onChange: (v: string) => void; placeholder?: string; testId?: string }) {
  const { t } = useTranslation("portal");
  return (
    <div className="relative w-full sm:max-w-xs">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder ?? t("admin.preview.search")} className="pl-9" data-testid={testId} />
    </div>
  );
}

/** Matches typed text against any of the given fields, ignoring case and plate dashes. */
export function textMatches(query: string, ...fields: Array<string | number | null | undefined>): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const text = fields.filter((f) => f !== null && f !== undefined && f !== "").join(" ").toLowerCase();
  const flat = (v: string) => v.replace(/[-\s]/g, "");
  return text.includes(q) || flat(text).includes(flat(q));
}

/**
 * Card with a preview table and a dialog holding the full table. `render`
 * gets the preview settings (or undefined for the full view) so one table
 * component serves both.
 */
export function PreviewSection({ title, render, testId }: { title: string; render: (preview: Preview | undefined) => ReactNode; testId?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="rounded-lg border bg-card" data-testid={testId}>
        <div className="border-b px-4 py-2.5 text-base font-semibold">{title}</div>
        <div className="p-4">{render({ limit: PREVIEW_ROWS, onShowAll: () => setOpen(true) })}</div>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex max-h-[90vh] max-w-5xl flex-col" data-testid={testId ? `${testId}-dialog` : undefined}>
          <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
          <div className="min-h-0 flex-1 overflow-auto">{open && render(undefined)}</div>
        </DialogContent>
      </Dialog>
    </>
  );
}
