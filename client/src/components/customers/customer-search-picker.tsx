import { useMemo, useState } from "react";
import type { Customer } from "@shared/schema";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Check, Search } from "lucide-react";

interface Props {
  customers: Customer[];
  value: number | null;
  onChange: (id: number | null) => void;
  searchPlaceholder: string;
  emptyText: string;
  changeLabel: string;
  hintText?: (shown: number, total: number) => string;
  autoFocus?: boolean;
}

const MAX_SHOWN = 8;
export const customerLabel = (c: Customer) => `${c.companyName || c.name}${c.debtorNumber ? ` (${c.debtorNumber})` : ""}`;

/**
 * Inline customer picker: a search box with the matches listed right under it,
 * no popover. Works the same on a phone as on a desktop; the chosen customer
 * collapses to one row with a "change" button.
 */
export function CustomerSearchPicker({ customers, value, onChange, searchPlaceholder, emptyText, changeLabel, hintText, autoFocus }: Props) {
  const [query, setQuery] = useState("");
  const selected = value !== null ? customers.find((c) => c.id === value) : undefined;
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? customers.filter((c) => `${c.companyName ?? ""} ${c.name} ${c.debtorNumber ?? ""} ${c.email ?? ""}`.toLowerCase().includes(q)) : customers;
    return list;
  }, [customers, query]);
  const shown = matches.slice(0, MAX_SHOWN);

  if (selected) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm" data-testid="customer-picker-selected">
        <span className="flex items-center gap-2 truncate"><Check className="h-4 w-4 shrink-0 text-green-700" />{customerLabel(selected)}</span>
        <Button type="button" size="sm" variant="ghost" onClick={() => { onChange(null); setQuery(""); }} data-testid="customer-picker-change">{changeLabel}</Button>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={searchPlaceholder} className="pl-9" autoFocus={autoFocus} data-testid="customer-picker-search" />
      </div>
      <ul className="max-h-56 divide-y overflow-y-auto rounded-md border" role="listbox">
        {shown.length === 0 && <li className="px-3 py-3 text-sm text-muted-foreground">{emptyText}</li>}
        {shown.map((c) => (
          <li key={c.id}>
            <button type="button" role="option" aria-selected={false} onClick={() => onChange(c.id)}
              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted/60 focus:bg-muted/60 focus:outline-none"
              data-testid={`customer-picker-option-${c.id}`}>
              <span className="truncate">{c.companyName || c.name}</span>
              {c.debtorNumber && <span className="shrink-0 text-xs text-muted-foreground">{c.debtorNumber}</span>}
            </button>
          </li>
        ))}
      </ul>
      {hintText && matches.length > shown.length && <p className="text-xs text-muted-foreground">{hintText(shown.length, matches.length)}</p>}
    </div>
  );
}
