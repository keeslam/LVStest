import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronRight, Search } from "lucide-react";
import type { Expense } from "@shared/schema";
import type { ExpenseCategoryGroup, ExpenseSortKey } from "@shared/expense-list";
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Price } from "@/components/ui/price";
import type { SortState } from "@/components/ui/sortable-head";
import { formatExpenseCategory } from "@/lib/format-utils";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { ExpenseRows, ExpenseListTable, EXPENSE_COLUMN_CLASSES, DEFAULT_EXPENSE_SORT, type ExpenseListFilters } from "./expense-list-table";

/** The sort choices in the dialog header: "date:desc" and so on, the same sorts the column headers offer. */
export const DIALOG_SORT_OPTIONS = ["date:desc", "date:asc", "amount:desc", "amount:asc", "plate:asc", "description:asc"] as const;
export const parseSortOption = (value: string): SortState<ExpenseSortKey> => {
  const [key, dir] = value.split(":") as [ExpenseSortKey, "asc" | "desc"];
  return { key, dir };
};
const sortOptionOf = (sort: SortState<ExpenseSortKey>) => `${sort.key}:${sort.dir}`;

/** How many rows a category section shows before it points to the dialog. */
export const CATEGORY_SECTION_ROWS = 5;

/**
 * One section per category in the selection: the count and the sum, the five
 * newest rows, and — when the category holds more — a button that opens the
 * whole category in a dialog with the paged, sortable table. The sections come
 * from GET /api/expenses/summary, so every count and sum spans the entire
 * selection, not only the rows on screen.
 */
export function ExpenseCategorySections({ groups, filters, onDelete }: {
  groups: ExpenseCategoryGroup[];
  filters: ExpenseListFilters;
  onDelete?: (expense: Expense) => void;
}) {
  const { t } = useTranslation(["expenses", "common"]);
  const [openCategory, setOpenCategory] = useState<string | null>(null);
  // The dialog has its own search and sort: the search starts as the page's, the sort newest first.
  const [dialogSearch, setDialogSearch] = useState("");
  const [dialogSort, setDialogSort] = useState<SortState<ExpenseSortKey>>(DEFAULT_EXPENSE_SORT);
  const debouncedDialogSearch = useDebouncedValue(dialogSearch);
  const open = groups.find((g) => g.category === openCategory) ?? null;
  const openDialog = (category: string) => { setDialogSearch(filters.q ?? ""); setDialogSort(DEFAULT_EXPENSE_SORT); setOpenCategory(category); };

  if (groups.length === 0) {
    return (
      <div className="rounded-md border bg-gray-50 p-10 text-center">
        <p className="text-gray-500">{t("expenses:indexPage.noExpensesFound")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="expense-category-sections">
      {groups.map((group) => (
        <section key={group.category} className="rounded-md border" data-testid={`expense-section-${group.category}`} aria-label={formatExpenseCategory(group.category)}>
          <header className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/40 px-4 py-2">
            <div className="flex items-baseline gap-2">
              <h3 className="font-semibold">{formatExpenseCategory(group.category)}</h3>
              <span className="text-xs text-muted-foreground">{t("expenses:indexPage.expenseCount", { count: group.count })}</span>
            </div>
            <span className="font-medium tabular-nums" data-testid={`expense-section-total-${group.category}`}><Price value={group.amount} /></span>
          </header>
          <Table className="table-fixed">
            <TableHeader>
              <TableRow className="[&>th]:h-9 [&>th]:text-xs">
                <TableHead className={EXPENSE_COLUMN_CLASSES.date}>{t("expenses:indexPage.dateColumnHeader")}</TableHead>
                <TableHead className={EXPENSE_COLUMN_CLASSES.plate}>{t("expenses:indexPage.vehicleColumnHeader")}</TableHead>
                <TableHead>{t("expenses:indexPage.descriptionColumnHeader")}</TableHead>
                <TableHead className={EXPENSE_COLUMN_CLASSES.amount}>{t("expenses:indexPage.amountColumnHeaderShort")}</TableHead>
                <TableHead className={EXPENSE_COLUMN_CLASSES.actions} />
              </TableRow>
            </TableHeader>
            <TableBody>
              <ExpenseRows rows={group.recent.slice(0, CATEGORY_SECTION_ROWS)} onDelete={onDelete} showCategory={false} testIdPrefix={`section-${group.category}-expense`} />
            </TableBody>
          </Table>
          {group.count > CATEGORY_SECTION_ROWS && (
            <div className="border-t px-2 py-1">
              <Button variant="ghost" size="sm" className="h-8" onClick={() => openDialog(group.category)} data-testid={`button-expense-section-all-${group.category}`}>
                {t("expenses:indexPage.showAllOfCategory", { count: group.count })}
                <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          )}
        </section>
      ))}

      <Dialog open={open !== null} onOpenChange={(isOpen) => !isOpen && setOpenCategory(null)}>
        <DialogContent className="max-w-5xl" data-testid="expense-category-dialog">
          {open && (
            <>
              <DialogHeader>
                <DialogTitle>{formatExpenseCategory(open.category)}</DialogTitle>
                <DialogDescription>
                  {t("expenses:indexPage.categoryDialogDescription", { count: open.count })}
                  {" · "}
                  <Price value={open.amount} />
                </DialogDescription>
              </DialogHeader>
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative w-full sm:max-w-xs">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                  <Input
                    value={dialogSearch}
                    onChange={(e) => setDialogSearch(e.target.value)}
                    placeholder={t("expenses:indexPage.dialogSearchPlaceholder")}
                    aria-label={t("expenses:indexPage.dialogSearchPlaceholder")}
                    className="h-9 pl-8"
                    data-testid="expense-dialog-search"
                  />
                </div>
                <label className="flex items-center gap-2 text-sm text-muted-foreground sm:ml-auto">
                  {t("expenses:indexPage.sortLabel")}
                  <select
                    className="h-9 rounded-md border bg-background px-2 text-sm text-foreground"
                    value={sortOptionOf(dialogSort)}
                    onChange={(e) => setDialogSort(parseSortOption(e.target.value))}
                    data-testid="expense-dialog-sort"
                  >
                    {DIALOG_SORT_OPTIONS.map((option) => (
                      <option key={option} value={option}>{t(`expenses:indexPage.sortOptions.${option.replace(":", "_")}`)}</option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="max-h-[65vh] overflow-y-auto">
                <ExpenseListTable
                  filters={{ ...filters, category: open.category, q: debouncedDialogSearch }}
                  sort={dialogSort}
                  onSortChange={setDialogSort}
                  onDelete={onDelete}
                  testId={`expenses-${open.category}`}
                  initialPageSize={25}
                />
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
