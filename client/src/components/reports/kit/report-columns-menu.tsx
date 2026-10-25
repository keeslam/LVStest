/**
 * Rapporten herontwerp deel 3, Task 3: the Kolommen button next to the search field of a fixed
 * report list. A tick per column of the report (hide/show) and per extra field (plate, make, model
 * of the car, customer name: only those the user may see), and "Terug naar standaard".
 * The choice is kept per user by useReportColumns.
 */
import { useTranslation } from "react-i18next";
import { Columns3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { ReportColumnsChoice } from "./use-report-columns";

interface MenuColumn { id: string; label: string }

export function ReportColumnsMenu({ reportId, columns, extras, value, onChange }: {
  reportId: string;
  columns: MenuColumn[];
  extras: MenuColumn[];
  /** The stored choice; null = the standard columns. */
  value: ReportColumnsChoice | null;
  /** null = back to the standard columns. */
  onChange: (next: ReportColumnsChoice | null) => void;
}) {
  const { t } = useTranslation("reports");
  const hidden = new Set(value?.hidden ?? []);
  const extra = new Set(value?.extra ?? []);
  const ownIds = new Set(columns.map((c) => c.id));
  const extraIds = new Set(extras.map((c) => c.id));
  const shownCount = columns.filter((c) => !hidden.has(c.id)).length;

  // Unknown ids are dropped when the choice is written again.
  const change = (nextHidden: Set<string>, nextExtra: Set<string>) => onChange({
    hidden: columns.map((c) => c.id).filter((id) => nextHidden.has(id) && ownIds.has(id)),
    extra: extras.map((c) => c.id).filter((id) => nextExtra.has(id) && extraIds.has(id)),
  });
  const toggle = (set: Set<string>, id: string, on: boolean) => {
    const next = new Set(set);
    if (on) next.add(id); else next.delete(id);
    return next;
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8" data-testid="button-report-columns" data-report-id={reportId}>
          <Columns3 className="mr-1 h-4 w-4" aria-hidden="true" />{t("reportKit.columns.button")}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 space-y-3 p-3" data-testid="report-columns-menu">
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">{t("reportKit.columns.shown")}</p>
          {columns.map((c) => {
            const checked = !hidden.has(c.id);
            // The last shown column cannot be switched off: a table needs at least one column.
            const last = checked && shownCount <= 1;
            return (
              <label key={c.id} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={checked}
                  disabled={last}
                  onCheckedChange={(on) => change(toggle(hidden, c.id, on !== true), extra)}
                  data-testid={`report-column-toggle-${c.id}`}
                />
                {c.label}
              </label>
            );
          })}
        </div>
        {extras.length > 0 && (
          <div className="space-y-2 border-t pt-2">
            <p className="text-xs font-medium text-muted-foreground">{t("reportKit.columns.extra")}</p>
            {extras.map((c) => (
              <label key={c.id} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={extra.has(c.id)}
                  onCheckedChange={(on) => change(hidden, toggle(extra, c.id, on === true))}
                  data-testid={`report-column-extra-${c.id}`}
                />
                {c.label}
              </label>
            ))}
          </div>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="w-full"
          onClick={() => onChange(null)}
          disabled={value === null}
          data-testid="button-report-columns-reset"
        >
          {t("reportKit.columns.reset")}
        </Button>
      </PopoverContent>
    </Popover>
  );
}
