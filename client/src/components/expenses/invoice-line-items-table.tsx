import { useId } from "react";
import { useTranslation } from "react-i18next";
import { Trash2 } from "lucide-react";
import { EXPENSE_CATEGORIES, type InboxLineItem } from "@shared/invoice-inbox";
import { formatExpenseCategory } from "@/lib/format-utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export interface InvoiceLineItemsTableProps {
  items: InboxLineItem[];
  selected: Set<number>;
  onItemsChange: (items: InboxLineItem[]) => void;
  onSelectedChange: (selected: Set<number>) => void;
}

/**
 * The editable invoice lines, shared by the manual scanner dialog and the
 * review dialog of mailed invoices. Controlled: the parent owns both the lines
 * and the selection (indices into `items`).
 */
export function InvoiceLineItemsTable({ items, selected, onItemsChange, onSelectedChange }: InvoiceLineItemsTableProps) {
  const { t } = useTranslation("expenses");
  const selectAllId = useId();

  const update = (index: number, patch: Partial<InboxLineItem>) => {
    onItemsChange(items.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  };
  const toggle = (index: number) => {
    const next = new Set(selected);
    if (next.has(index)) next.delete(index); else next.add(index);
    onSelectedChange(next);
  };
  const remove = (index: number) => {
    onItemsChange(items.filter((_, i) => i !== index));
    // Indices above the removed line shift down by one.
    const next = new Set<number>();
    selected.forEach((i) => { if (i < index) next.add(i); else if (i > index) next.add(i - 1); });
    onSelectedChange(next);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Checkbox
          id={selectAllId}
          checked={items.length > 0 && selected.size === items.length}
          onCheckedChange={(checked) => onSelectedChange(checked ? new Set(items.map((_, i) => i)) : new Set())}
          data-testid="checkbox-select-all"
        />
        <Label htmlFor={selectAllId} className="text-sm font-medium">
          {t("invoiceScanner.selectAll", { selected: selected.size, total: items.length })}
        </Label>
      </div>

      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12"></TableHead>
              <TableHead>{t("invoiceScanner.descriptionCol")}</TableHead>
              <TableHead>{t("invoiceScanner.amountCol")}</TableHead>
              <TableHead>{t("invoiceScanner.categoryCol")}</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item, index) => (
              <TableRow key={index}>
                <TableCell>
                  <Checkbox checked={selected.has(index)} onCheckedChange={() => toggle(index)} data-testid={`checkbox-item-${index}`} />
                </TableCell>
                <TableCell>
                  <Input value={item.description} onChange={(e) => update(index, { description: e.target.value })} className="min-w-[200px]" data-testid={`input-description-${index}`} />
                </TableCell>
                <TableCell>
                  <Input type="number" step="0.01" value={item.amount} onChange={(e) => update(index, { amount: parseFloat(e.target.value) || 0 })} className="w-24" data-testid={`input-amount-${index}`} />
                </TableCell>
                <TableCell>
                  <Select value={item.category} onValueChange={(value) => update(index, { category: value })}>
                    <SelectTrigger className="w-32" data-testid={`select-category-${index}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {EXPENSE_CATEGORIES.map((category) => (
                        <SelectItem key={category} value={category}>{formatExpenseCategory(category)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  {/* M9: an icon with no text reads as "button" to a screen reader. */}
                  <Button variant="ghost" size="sm" onClick={() => remove(index)} aria-label={t("invoiceScanner.removeLine")} data-testid={`button-remove-${index}`}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
