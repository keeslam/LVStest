import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, LayoutList, Search, Truck } from "lucide-react";
import type { Expense } from "@shared/schema";
import type { ExpenseCategoryGroup, ExpenseSortKey, ExpenseVehicleGroup } from "@shared/expense-list";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Price } from "@/components/ui/price";
import { SortableHead, nextSort, stableSort, type SortState } from "@/components/ui/sortable-head";
import { formatExpenseCategory, formatLicensePlate } from "@/lib/format-utils";
import { formatDateNl } from "@/lib/format-date-nl";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { cn } from "@/lib/utils";
import { ExpenseListTable, EXPENSE_COLUMN_CLASSES, DEFAULT_EXPENSE_SORT, expenseQueryParams, type ExpenseListFilters } from "./expense-list-table";

/** The sort choices in the dialog header: "date:desc" and so on, the same sorts the column headers offer. */
export const DIALOG_SORT_OPTIONS = ["date:desc", "date:asc", "amount:desc", "amount:asc", "plate:asc", "description:asc"] as const;
export const parseSortOption = (value: string): SortState<ExpenseSortKey> => {
  const [key, dir] = value.split(":") as [ExpenseSortKey, "asc" | "desc"];
  return { key, dir };
};
const sortOptionOf = (sort: SortState<ExpenseSortKey>) => `${sort.key}:${sort.dir}`;
/** Newest first for the date, A-Z or small-to-large for the rest; the same as the paged table. */
const defaultDir = (key: ExpenseSortKey) => (key === "date" ? "desc" : "asc");

/** How many rows (vehicles) a category section shows before it points to the dialog. */
export const CATEGORY_SECTION_ROWS = 5;

/** The vehicles of one selection, one row each, newest cost first (GET /api/expenses/by-vehicle). */
function useVehicleGroups(filters: ExpenseListFilters) {
  return useQuery<ExpenseVehicleGroup[]>({
    queryKey: ["/api/expenses/by-vehicle", expenseQueryParams(filters)],
    staleTime: 0,
  });
}

/** The vehicle a dialog is opened for, with the selection it was opened from. */
interface OpenVehicle {
  category: string;
  group: ExpenseVehicleGroup;
}

/**
 * One section per category in the selection, folded until clicked: the count
 * and the sum in the headline and, unfolded, one row per vehicle (2026-10-18):
 * a vehicle with several costs in the category shows once, with the number of
 * costs, the sum and its newest date. A click on a vehicle opens all its costs
 * of that category in a dialog. When the category holds more than five costs,
 * a button opens the whole category in a dialog, per vehicle or as a paged
 * list of every cost. Every dialog has a search box and sortable column headers.
 * The counts and sums come from GET /api/expenses/summary, so they span the
 * entire selection, not only the rows on screen.
 */
export function ExpenseCategorySections({ groups, filters, onDelete }: {
  groups: ExpenseCategoryGroup[];
  filters: ExpenseListFilters;
  onDelete?: (expense: Expense) => void;
}) {
  const { t } = useTranslation(["expenses", "common"]);
  const [openCategory, setOpenCategory] = useState<string | null>(null);
  /** The categories unfolded by a click; every section starts folded. */
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const toggle = (category: string) => setExpanded((cur) => {
    const next = new Set(cur);
    if (next.has(category)) next.delete(category); else next.add(category);
    return next;
  });
  // The category dialog has its own search and sort: the search starts as the page's, the sort newest first.
  const [dialogSearch, setDialogSearch] = useState("");
  const [dialogSort, setDialogSort] = useState<SortState<ExpenseSortKey>>(DEFAULT_EXPENSE_SORT);
  const [dialogView, setDialogView] = useState<"vehicles" | "expenses">("vehicles");
  const debouncedDialogSearch = useDebouncedValue(dialogSearch);
  const open = groups.find((g) => g.category === openCategory) ?? null;
  const openDialog = (category: string) => { setDialogSearch(filters.q ?? ""); setDialogSort(DEFAULT_EXPENSE_SORT); setDialogView("vehicles"); setOpenCategory(category); };

  // The vehicle dialog: every cost of one vehicle within one category, with the same search and sort.
  const [openVehicle, setOpenVehicle] = useState<OpenVehicle | null>(null);
  const [vehicleSearch, setVehicleSearch] = useState("");
  const [vehicleSort, setVehicleSort] = useState<SortState<ExpenseSortKey>>(DEFAULT_EXPENSE_SORT);
  const debouncedVehicleSearch = useDebouncedValue(vehicleSearch);
  const openVehicleDialog = (category: string, group: ExpenseVehicleGroup, search: string) => {
    setVehicleSearch(search);
    setVehicleSort(DEFAULT_EXPENSE_SORT);
    setOpenVehicle({ category, group });
  };

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
          {/* Collapsed until clicked: with a dozen categories the page stays one screen of headlines. */}
          <button
            type="button"
            className={cn("flex w-full flex-wrap items-center justify-between gap-2 rounded-md bg-muted/40 px-4 py-2 text-left hover:bg-muted", expanded.has(group.category) && "rounded-b-none border-b")}
            aria-expanded={expanded.has(group.category)}
            aria-controls={`expense-section-body-${group.category}`}
            onClick={() => toggle(group.category)}
            data-testid={`button-expense-section-toggle-${group.category}`}
          >
            <span className="flex items-baseline gap-2">
              <ChevronRight className={cn("h-4 w-4 self-center text-muted-foreground transition-transform", expanded.has(group.category) && "rotate-90")} aria-hidden="true" />
              <span className="font-semibold">{formatExpenseCategory(group.category)}</span>
              <span className="text-xs text-muted-foreground">{t("expenses:indexPage.expenseCount", { count: group.count })}</span>
            </span>
            <span className="font-medium tabular-nums" data-testid={`expense-section-total-${group.category}`}><Price value={group.amount} /></span>
          </button>
          {expanded.has(group.category) && (
            <div id={`expense-section-body-${group.category}`}>
              <CategorySectionVehicles
                filters={{ ...filters, category: group.category }}
                testIdPrefix={`section-${group.category}-vehicle`}
                onOpen={(vehicle) => openVehicleDialog(group.category, vehicle, filters.q ?? "")}
              />
              {group.count > CATEGORY_SECTION_ROWS && (
                <div className="border-t px-2 py-1">
                  <Button variant="ghost" size="sm" className="h-8" onClick={() => openDialog(group.category)} data-testid={`button-expense-section-all-${group.category}`}>
                    {t("expenses:indexPage.showAllOfCategory", { count: group.count })}
                    <ChevronRight className="ml-1 h-4 w-4" />
                  </Button>
                </div>
              )}
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
              <DialogToolbar
                search={dialogSearch}
                onSearch={setDialogSearch}
                sort={dialogSort}
                onSort={setDialogSort}
                placeholder={t("expenses:indexPage.dialogSearchPlaceholder")}
                testIdPrefix="expense-dialog"
              >
                <div className="inline-flex rounded-md border p-0.5" role="group" aria-label={t("expenses:indexPage.viewLabel")}>
                  <Button size="sm" variant={dialogView === "vehicles" ? "secondary" : "ghost"} className={cn("h-7", dialogView === "vehicles" && "shadow-sm")} aria-pressed={dialogView === "vehicles"} onClick={() => setDialogView("vehicles")} data-testid="button-dialog-view-vehicles">
                    <Truck className="mr-1.5 h-4 w-4" />{t("expenses:indexPage.dialogViewByVehicle")}
                  </Button>
                  <Button size="sm" variant={dialogView === "expenses" ? "secondary" : "ghost"} className={cn("h-7", dialogView === "expenses" && "shadow-sm")} aria-pressed={dialogView === "expenses"} onClick={() => setDialogView("expenses")} data-testid="button-dialog-view-expenses">
                    <LayoutList className="mr-1.5 h-4 w-4" />{t("expenses:indexPage.viewTable")}
                  </Button>
                </div>
              </DialogToolbar>
              <div className="max-h-[65vh] overflow-y-auto">
                {dialogView === "vehicles" ? (
                  <VehicleGroupDialogTable
                    filters={{ ...filters, category: open.category, q: debouncedDialogSearch }}
                    sort={dialogSort}
                    onSortChange={setDialogSort}
                    testId={`vehicles-${open.category}`}
                    onOpen={(vehicle) => openVehicleDialog(open.category, vehicle, debouncedDialogSearch)}
                  />
                ) : (
                  <ExpenseListTable
                    filters={{ ...filters, category: open.category, q: debouncedDialogSearch }}
                    sort={dialogSort}
                    onSortChange={setDialogSort}
                    onDelete={onDelete}
                    testId={`expenses-${open.category}`}
                    initialPageSize={25}
                    showCategory={false}
                  />
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={openVehicle !== null} onOpenChange={(isOpen) => !isOpen && setOpenVehicle(null)}>
        <DialogContent className="max-w-5xl" data-testid="expense-vehicle-dialog">
          {openVehicle && (
            <>
              <DialogHeader>
                <DialogTitle>
                  {openVehicle.group.licensePlate ? formatLicensePlate(openVehicle.group.licensePlate) : "—"}
                  <span className="ml-2 text-base font-normal text-muted-foreground">{[openVehicle.group.brand, openVehicle.group.model].filter(Boolean).join(" ")}</span>
                </DialogTitle>
                <DialogDescription>
                  {formatExpenseCategory(openVehicle.category)}
                  {" · "}
                  {t("expenses:indexPage.categoryDialogDescription", { count: openVehicle.group.count })}
                  {" · "}
                  <Price value={openVehicle.group.amount} />
                </DialogDescription>
              </DialogHeader>
              <DialogToolbar
                search={vehicleSearch}
                onSearch={setVehicleSearch}
                sort={vehicleSort}
                onSort={setVehicleSort}
                placeholder={t("expenses:indexPage.vehicleDialogSearchPlaceholder")}
                testIdPrefix="expense-vehicle-dialog"
              />
              <div className="max-h-[65vh] overflow-y-auto">
                <ExpenseListTable
                  filters={{ ...filters, category: openVehicle.category, vehicleId: String(openVehicle.group.vehicleId), q: debouncedVehicleSearch }}
                  sort={vehicleSort}
                  onSortChange={setVehicleSort}
                  onDelete={onDelete}
                  testId={`expenses-${openVehicle.category}-vehicle-${openVehicle.group.vehicleId}`}
                  initialPageSize={25}
                  showCategory={false}
                />
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** The header of a dialog on this page: a search box, the sort picker, and room for a view switch. */
function DialogToolbar({ search, onSearch, sort, onSort, placeholder, testIdPrefix, children }: {
  search: string;
  onSearch: (value: string) => void;
  sort: SortState<ExpenseSortKey>;
  onSort: (sort: SortState<ExpenseSortKey>) => void;
  placeholder: string;
  testIdPrefix: string;
  children?: React.ReactNode;
}) {
  const { t } = useTranslation(["expenses"]);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative w-full sm:max-w-xs">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder={placeholder}
          aria-label={placeholder}
          className="h-9 pl-8"
          data-testid={`${testIdPrefix}-search`}
        />
      </div>
      {children}
      <label className="flex items-center gap-2 text-sm text-muted-foreground sm:ml-auto">
        {t("expenses:indexPage.sortLabel")}
        <select
          className="h-9 rounded-md border bg-background px-2 text-sm text-foreground"
          value={sortOptionOf(sort)}
          onChange={(e) => onSort(parseSortOption(e.target.value))}
          data-testid={`${testIdPrefix}-sort`}
        >
          {DIALOG_SORT_OPTIONS.map((option) => (
            <option key={option} value={option}>{t(`expenses:indexPage.sortOptions.${option.replace(":", "_")}`)}</option>
          ))}
        </select>
      </label>
    </div>
  );
}

/** The newest few vehicles of one category inside its unfolded section. */
function CategorySectionVehicles({ filters, testIdPrefix, onOpen }: {
  filters: ExpenseListFilters;
  testIdPrefix: string;
  onOpen: (group: ExpenseVehicleGroup) => void;
}) {
  const { t } = useTranslation(["expenses"]);
  const { data, isLoading, isError } = useVehicleGroups(filters);
  if (isLoading) return <p className="px-4 py-3 text-sm text-muted-foreground" role="status">{t("expenses:indexPage.loading")}</p>;
  if (isError) return <p className="px-4 py-3 text-sm text-red-700" role="alert">{t("expenses:indexPage.loadError")}</p>;
  return (
    <Table className="min-w-[40rem] table-fixed">
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
        <VehicleGroupRows groups={(data ?? []).slice(0, CATEGORY_SECTION_ROWS)} onOpen={onOpen} testIdPrefix={testIdPrefix} />
      </TableBody>
    </Table>
  );
}

/** What the description column says for a vehicle: its one description, or how many costs it has. */
function useGroupDescription() {
  const { t } = useTranslation(["expenses"]);
  return useCallback((group: ExpenseVehicleGroup) =>
    group.count > 1 ? t("expenses:indexPage.selectionCount", { count: group.count }) : (group.lastDescription || "—"), [t]);
}

/**
 * One row per vehicle: the newest date (the range as a tooltip), the plate in
 * bold with brand and model beside it, the description of its one cost or the
 * number of costs, and the sum. A click anywhere on the row opens the vehicle.
 */
function VehicleGroupRows({ groups, onOpen, testIdPrefix }: {
  groups: ExpenseVehicleGroup[];
  onOpen: (group: ExpenseVehicleGroup) => void;
  testIdPrefix: string;
}) {
  const { t } = useTranslation(["expenses"]);
  const describe = useGroupDescription();
  return (
    <>
      {groups.map((group) => {
        const plate = group.licensePlate ? formatLicensePlate(group.licensePlate) : "—";
        const several = group.count > 1;
        const range = group.firstDate !== group.lastDate
          ? t("expenses:indexPage.dateRange", { from: formatDateNl(group.firstDate, "short"), to: formatDateNl(group.lastDate, "short") })
          : undefined;
        return (
          <TableRow key={group.vehicleId} className="cursor-pointer [&>td]:py-1.5" onClick={() => onOpen(group)} data-testid={`${testIdPrefix}-${group.vehicleId}`}>
            <TableCell className="whitespace-nowrap tabular-nums text-muted-foreground" title={range}>{formatDateNl(group.lastDate, "short")}</TableCell>
            <TableCell className="max-w-0">
              <span className="block truncate" title={`${plate} · ${group.brand ?? ""} ${group.model ?? ""}`.trim()}>
                <span className="font-semibold">{plate}</span>
                <span className="ml-2 text-xs text-muted-foreground">{group.brand} {group.model}</span>
              </span>
            </TableCell>
            <TableCell className="max-w-0">
              <span className={cn("block truncate", several && "font-medium")} title={several ? undefined : group.lastDescription || undefined}>{describe(group)}</span>
            </TableCell>
            <TableCell className="whitespace-nowrap text-right tabular-nums font-medium">
              <Price value={group.amount} />
            </TableCell>
            <TableCell className="whitespace-nowrap text-right">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={(e) => { e.stopPropagation(); onOpen(group); }}
                aria-label={t("expenses:indexPage.openVehicleCosts", { plate })}
                title={t("expenses:indexPage.openVehicleCosts", { plate })}
                data-testid={`button-open-${testIdPrefix}-${group.vehicleId}`}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </TableCell>
          </TableRow>
        );
      })}
    </>
  );
}

/**
 * Every vehicle of one category in the dialog, sortable by its column headers.
 * The search goes to the server (it looks at every cost, so "olie" keeps the
 * vehicles with an oil bill); the sort happens here, on the date of the newest
 * cost, the plate, the description column and the sum.
 */
function VehicleGroupDialogTable({ filters, sort, onSortChange, testId, onOpen }: {
  filters: ExpenseListFilters;
  sort: SortState<ExpenseSortKey>;
  onSortChange: (sort: SortState<ExpenseSortKey>) => void;
  testId: string;
  onOpen: (group: ExpenseVehicleGroup) => void;
}) {
  const { t } = useTranslation(["expenses"]);
  const describe = useGroupDescription();
  const { data, isLoading, isError } = useVehicleGroups(filters);
  const sorted = useMemo(() => {
    const compare: Record<string, (a: ExpenseVehicleGroup, b: ExpenseVehicleGroup) => number> = {
      date: (a, b) => a.lastDate.localeCompare(b.lastDate),
      plate: (a, b) => (a.licensePlate ?? "").localeCompare(b.licensePlate ?? ""),
      description: (a, b) => describe(a).localeCompare(describe(b), "nl", { numeric: true, sensitivity: "base" }),
      amount: (a, b) => a.amount - b.amount,
      category: () => 0,
    };
    return stableSort(data ?? [], compare[sort.key], sort.dir);
  }, [data, sort, describe]);
  const head = (key: ExpenseSortKey, label: string, className: string) =>
    <SortableHead label={label} sortKey={key} sort={sort} onSort={(k) => onSortChange(nextSort(sort, k, defaultDir))} testId={`sort-${testId}-${key}`} className={className} />;

  if (isLoading) return <p className="py-6 text-center text-sm text-muted-foreground" role="status">{t("expenses:indexPage.loading")}</p>;
  if (isError) return <p className="rounded-md border bg-red-50 p-4 text-sm text-red-700" role="alert">{t("expenses:indexPage.loadError")}</p>;
  if (sorted.length === 0) {
    return (
      <div className="rounded-md border bg-gray-50 p-10 text-center">
        <p className="text-gray-500">{t("expenses:indexPage.noExpensesFound")}</p>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <div className="rounded-md border">
        <Table className="min-w-[40rem] table-fixed">
          <TableHeader className="sticky top-0 z-10 bg-background">
            <TableRow>
              {head("date", t("expenses:indexPage.dateColumnHeader"), EXPENSE_COLUMN_CLASSES.date)}
              {head("plate", t("expenses:indexPage.vehicleColumnHeader"), EXPENSE_COLUMN_CLASSES.plate)}
              {head("description", t("expenses:indexPage.descriptionColumnHeader"), EXPENSE_COLUMN_CLASSES.description)}
              {head("amount", t("expenses:indexPage.amountColumnHeaderShort"), cn(EXPENSE_COLUMN_CLASSES.amount, "[&>button]:ml-auto [&>button]:flex-row-reverse"))}
              <TableHead className={EXPENSE_COLUMN_CLASSES.actions} />
            </TableRow>
          </TableHeader>
          <TableBody>
            <VehicleGroupRows groups={sorted} onOpen={onOpen} testIdPrefix={`${testId}-row`} />
          </TableBody>
        </Table>
      </div>
      <p className="text-sm text-muted-foreground" data-testid={`${testId}-count`}>{t("expenses:indexPage.vehicleCount", { count: sorted.length })}</p>
    </div>
  );
}
