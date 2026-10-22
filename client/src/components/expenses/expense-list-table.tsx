import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { Eye, Trash2 } from "lucide-react";
import type { Expense } from "@shared/schema";
import type { ExpensePage, ExpenseSortKey, SortDirection } from "@shared/expense-list";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SortableHead, nextSort, type SortState } from "@/components/ui/sortable-head";
import { TablePager } from "@/components/ui/table-pager";
import { Price } from "@/components/ui/price";
import { formatExpenseCategory, formatLicensePlate } from "@/lib/format-utils";
import { formatDateNl } from "@/lib/format-date-nl";
import { useGlobalDialog } from "@/contexts/GlobalDialogContext";
import { cn } from "@/lib/utils";

/** The filters a list is narrowed on; the same names GET /api/expenses reads. */
export interface ExpenseListFilters {
  vehicleId?: string;
  category?: string;
  from?: string;
  to?: string;
  q?: string;
  /** B-64: only costs without a receipt. */
  noReceipt?: boolean;
}

/** The query-string object for a selection: only the filters that are set. */
/** B-64: an attached file or a typed receipt link both count as a receipt. */
export function hasReceipt(expense: Pick<Expense, "receiptFilePath" | "receiptUrl">): boolean {
  return Boolean(expense.receiptFilePath?.trim() || expense.receiptUrl?.trim());
}

export function expenseQueryParams(filters: ExpenseListFilters): Record<string, string | undefined> {
  return {
    vehicleId: filters.vehicleId || undefined,
    category: filters.category || undefined,
    from: filters.from || undefined,
    to: filters.to || undefined,
    q: filters.q?.trim() || undefined,
    noReceipt: filters.noReceipt ? "1" : undefined,
  };
}

export const DEFAULT_EXPENSE_SORT: SortState<ExpenseSortKey> = { key: "date", dir: "desc" };
/** Newest first for the date, A-Z or small-to-large for the rest. */
const defaultDir = (key: ExpenseSortKey): SortDirection => (key === "date" ? "desc" : "asc");

/**
 * One compact row per expense: a short date, the plate in bold with the
 * brand and model small beside it, the category as a badge, the description
 * cut off with the full text as a tooltip, and the amount right-aligned in
 * tabular figures. A click anywhere on the row opens the cost (2026-10-18).
 * The same rows serve the paged list and the dialogs.
 */
export function ExpenseRows({ rows, onDelete, testIdPrefix = "row-expense", showCategory = true }: {
  rows: Expense[];
  onDelete?: (expense: Expense) => void;
  testIdPrefix?: string;
  /** Off inside a category section, where every row is of that category already. */
  showCategory?: boolean;
}) {
  const { t } = useTranslation(["expenses", "common"]);
  const { openExpenseDialog } = useGlobalDialog();
  return (
    <>
      {rows.map((expense) => (
        <TableRow key={expense.id} className="cursor-pointer [&>td]:py-1.5" onClick={() => openExpenseDialog(expense.id)} data-testid={`${testIdPrefix}-${expense.id}`}>
          <TableCell className="whitespace-nowrap tabular-nums text-muted-foreground">{formatDateNl(expense.date, "short")}</TableCell>
          <TableCell className="max-w-0">
              {expense.vehicle ? (
                <span className="block truncate" title={`${formatLicensePlate(expense.vehicle.licensePlate)} · ${expense.vehicle.brand} ${expense.vehicle.model}`}>
                  <span className="font-semibold">{formatLicensePlate(expense.vehicle.licensePlate)}</span>
                  <span className="ml-2 text-xs text-muted-foreground">{expense.vehicle.brand} {expense.vehicle.model}</span>
                </span>
              ) : "—"}
          </TableCell>
          {showCategory && (
            <TableCell className="whitespace-nowrap">
              <Badge variant="outline" className="font-normal">{formatExpenseCategory(expense.category)}</Badge>
            </TableCell>
          )}
          <TableCell className="max-w-0">
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="truncate" title={expense.description || undefined}>{expense.description || "—"}</span>
              {/* B-64: a cost with no attached receipt and no receipt link. */}
              {!hasReceipt(expense) && (
                <Badge variant="outline" className="shrink-0 border-amber-300 bg-amber-50 px-1.5 py-0 text-[11px] font-normal text-amber-800" data-testid={`badge-no-receipt-${expense.id}`}>
                  {t("expenses:noReceipt.badge")}
                </Badge>
              )}
            </span>
          </TableCell>
          <TableCell className="whitespace-nowrap text-right tabular-nums font-medium">
            <Price value={Number(expense.amount) || 0} />
          </TableCell>
          <TableCell className="whitespace-nowrap text-right">
            <div className="flex justify-end gap-0.5">
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={(e) => { e.stopPropagation(); openExpenseDialog(expense.id); }} aria-label={t("common:actions.view")} title={t("common:actions.view")} data-testid={`button-view-expense-${expense.id}`}>
                <Eye className="h-4 w-4" />
              </Button>
              {onDelete && (
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-600 hover:bg-red-50 hover:text-red-700" onClick={(e) => { e.stopPropagation(); onDelete(expense); }} aria-label={t("expenses:detailsPage.deleteButton")} title={t("expenses:detailsPage.deleteButton")} data-testid={`button-delete-expense-${expense.id}`}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          </TableCell>
        </TableRow>
      ))}
    </>
  );
}

/** The column widths the rows above are laid out for; shared with the plain (unsorted) header. */
export const EXPENSE_COLUMN_CLASSES = {
  date: "w-28",
  plate: "w-48",
  category: "w-32",
  description: "",
  amount: "w-36 whitespace-nowrap text-right",
  actions: "w-20",
} as const;

/**
 * The Kostenoverzicht table for thousands of rows: the server sorts and pages
 * (GET /api/expenses?page=&pageSize=&sort=&dir=), so only one page travels to
 * the browser while `total` and `totalAmount` cover the whole selection. A
 * change of filter or sort jumps back to page 1.
 */
export function ExpenseListTable({ filters, onDelete, testId = "expenses", initialPageSize = 50, className, sort: controlledSort, onSortChange, showCategory = true }: {
  filters: ExpenseListFilters;
  onDelete?: (expense: Expense) => void;
  testId?: string;
  initialPageSize?: number;
  className?: string;
  /** Hand in both to keep the sort outside (the category dialog has a sort picker in its header). */
  sort?: SortState<ExpenseSortKey>;
  onSortChange?: (sort: SortState<ExpenseSortKey>) => void;
  /** Off in a dialog for one category, where every row is of that category already. */
  showCategory?: boolean;
}) {
  const { t } = useTranslation(["expenses", "common"]);
  const [ownSort, setOwnSort] = useState<SortState<ExpenseSortKey>>(DEFAULT_EXPENSE_SORT);
  const sort = controlledSort ?? ownSort;
  const setSort = (next: SortState<ExpenseSortKey>) => { setOwnSort(next); onSortChange?.(next); };
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const params = expenseQueryParams(filters);
  const selection = JSON.stringify(params);
  useEffect(() => { setPage(1); }, [selection, sort, pageSize]);

  const { data, isLoading, isError } = useQuery<ExpensePage>({
    queryKey: ["/api/expenses", { ...params, sort: sort.key, dir: sort.dir, page, pageSize }],
    placeholderData: keepPreviousData,
    staleTime: 0,
  });
  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const toggleSort = (key: ExpenseSortKey) => setSort(nextSort(sort, key, defaultDir));
  const head = (key: ExpenseSortKey, label: string, className: string) =>
    <SortableHead label={label} sortKey={key} sort={sort} onSort={toggleSort} testId={`sort-${testId}-${key}`} className={className} />;

  if (isLoading) {
    return (
      <div className="flex h-40 items-center justify-center" role="status" aria-label={t("expenses:indexPage.loading")}>
        <svg className="h-8 w-8 animate-spin text-primary-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      </div>
    );
  }
  if (isError) {
    return <p className="rounded-md border bg-red-50 p-4 text-sm text-red-700" role="alert">{t("expenses:indexPage.loadError")}</p>;
  }
  if (total === 0) {
    return (
      <div className="rounded-md border bg-gray-50 p-10 text-center">
        <p className="text-gray-500">{t("expenses:indexPage.noExpensesFound")}</p>
      </div>
    );
  }

  return (
    <div className={cn("space-y-3", className)}>
      <div className="rounded-md border">
        <Table className="min-w-[44rem] table-fixed">
          <TableHeader className="sticky top-0 z-10 bg-background">
            <TableRow>
              {head("date", t("expenses:indexPage.dateColumnHeader"), EXPENSE_COLUMN_CLASSES.date)}
              {head("plate", t("expenses:indexPage.vehicleColumnHeader"), EXPENSE_COLUMN_CLASSES.plate)}
              {showCategory && head("category", t("expenses:indexPage.categoryColumnHeader"), EXPENSE_COLUMN_CLASSES.category)}
              {head("description", t("expenses:indexPage.descriptionColumnHeader"), EXPENSE_COLUMN_CLASSES.description)}
              {head("amount", t("expenses:indexPage.amountColumnHeaderShort"), cn(EXPENSE_COLUMN_CLASSES.amount, "[&>button]:ml-auto [&>button]:flex-row-reverse"))}
              <TableHead className={EXPENSE_COLUMN_CLASSES.actions} />
            </TableRow>
          </TableHeader>
          <TableBody>
            <ExpenseRows rows={data?.rows ?? []} onDelete={onDelete} showCategory={showCategory} />
          </TableBody>
        </Table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
        <span data-testid={`${testId}-rows-shown`}>
          {t("expenses:indexPage.rowsShown", { shown: data?.rows.length ?? 0, count: total })}
        </span>
        <TablePager page={page} pageCount={pageCount} pageSize={pageSize} total={total} setPage={setPage} setPageSize={setPageSize} testId={testId} />
      </div>
    </div>
  );
}
