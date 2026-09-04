import type { Customer } from "@shared/schema";
import { SearchListPicker } from "@/components/ui/search-list-picker";

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

export const customerLabel = (c: Customer) => `${c.companyName || c.name}${c.debtorNumber ? ` (${c.debtorNumber})` : ""}`;

/** Inline customer picker (search box + list, no popover) on top of SearchListPicker. */
export function CustomerSearchPicker({ customers, ...rest }: Props) {
  const items = customers.map((c) => ({ id: c.id, label: c.companyName || c.name, sub: c.debtorNumber ?? null, search: `${c.name} ${c.email ?? ""}` }));
  return <SearchListPicker items={items} testId="customer-picker" {...rest} />;
}
