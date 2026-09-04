import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Check, Search } from "lucide-react";

export interface PickerItem {
  id: number;
  label: string;
  /** Small grey text at the right (debtor number, status, …). */
  sub?: string | null;
  /** Extra text that should match a search but is not shown. */
  search?: string;
}

interface Props {
  items: PickerItem[];
  value: number | null;
  onChange: (id: number | null) => void;
  searchPlaceholder: string;
  emptyText: string;
  changeLabel: string;
  /** "8 van 120 getoond, typ om te verfijnen." */
  hintText?: (shown: number, total: number) => string;
  /** Show the list without a search box when there are at most this many items. */
  searchFrom?: number;
  maxShown?: number;
  autoFocus?: boolean;
  testId?: string;
}

/**
 * Search box with the matches listed right under it: no popover, so it works
 * the same on a phone as on a desktop and inside any dialog. The chosen item
 * collapses to one row with a "change" button.
 */
export function SearchListPicker({ items, value, onChange, searchPlaceholder, emptyText, changeLabel, hintText, searchFrom = 0, maxShown = 8, autoFocus, testId = "picker" }: Props) {
  const [query, setQuery] = useState("");
  const selected = value !== null ? items.find((i) => i.id === value) : undefined;
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? items.filter((i) => `${i.label} ${i.sub ?? ""} ${i.search ?? ""}`.toLowerCase().includes(q)) : items;
  }, [items, query]);
  const shown = matches.slice(0, maxShown);

  if (selected) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm" data-testid={`${testId}-selected`}>
        <span className="flex items-center gap-2 truncate"><Check className="h-4 w-4 shrink-0 text-green-700" />{selected.label}{selected.sub ? <span className="text-xs text-muted-foreground">{selected.sub}</span> : null}</span>
        <Button type="button" size="sm" variant="ghost" onClick={() => { onChange(null); setQuery(""); }} data-testid={`${testId}-change`}>{changeLabel}</Button>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {items.length > searchFrom && (
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={searchPlaceholder} className="pl-9" autoFocus={autoFocus} data-testid={`${testId}-search`} />
        </div>
      )}
      <ul className="max-h-56 divide-y overflow-y-auto rounded-md border" role="listbox">
        {shown.length === 0 && <li className="px-3 py-3 text-sm text-muted-foreground">{emptyText}</li>}
        {shown.map((i) => (
          <li key={i.id}>
            <button type="button" role="option" aria-selected={false} onClick={() => onChange(i.id)}
              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted/60 focus:bg-muted/60 focus:outline-none"
              data-testid={`${testId}-option-${i.id}`}>
              <span className="truncate">{i.label}</span>
              {i.sub && <span className="shrink-0 text-xs text-muted-foreground">{i.sub}</span>}
            </button>
          </li>
        ))}
      </ul>
      {hintText && matches.length > shown.length && <p className="text-xs text-muted-foreground">{hintText(shown.length, matches.length)}</p>}
    </div>
  );
}
