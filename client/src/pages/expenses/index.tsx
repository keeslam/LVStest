import { describeApiError } from "@/lib/api-error";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchableCombobox, type ComboboxOption } from "@/components/ui/searchable-combobox";
import { InvoiceScanner } from "@/components/invoice-scanner";
import { InvoiceInboxButton } from "@/components/expenses/invoice-inbox-dialog";
import { ExpenseAddDialog } from "@/components/expenses/expense-add-dialog";
import { ExpenseListTable, expenseQueryParams, type ExpenseListFilters } from "@/components/expenses/expense-list-table";
import { ExpenseCategorySections, CATEGORY_SECTION_ROWS } from "@/components/expenses/expense-category-sections";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Expense, UserPermission } from "@shared/schema";
import type { ExpenseFacets, ExpenseSummary } from "@shared/expense-list";
import { RequiresPermission } from "@/components/ui/requires-permission";
import { RecycleBinDialog } from "@/components/recycle-bin/recycle-bin-dialog";
import { EXPENSE_CATEGORIES } from "@shared/expense-categories";
import { formatExpenseCategory, formatLicensePlate } from "@/lib/format-utils";
import { EXPENSE_PERIODS, expensePeriodRange, matchingExpensePeriod, type ExpensePeriod } from "@/lib/expense-periods";
import { Price, useHidePrices } from "@/components/ui/price";
import { downloadCsv, csvDate, csvNumber } from "@/lib/csv";
import { apiRequest, invalidateByPrefix, invalidateRelatedQueries, queryKeyUrl, throwIfResNotOk } from "@/lib/queryClient";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useToast } from "@/hooks/use-toast";
import { Archive, Download, LayoutList, Rows3, PlusCircle } from "lucide-react";
import { cn } from "@/lib/utils";

const ALL = "all";
type View = "categories" | "table";

/**
 * Kostenbeheer (A-9-8, rebuilt 2026-10-16 for thousands of rows): filters for
 * vehicle, period (with quick choices), category and free text; a section per
 * category with its newest rows, or one paged and sortable table; the count
 * and sum of the whole selection; and a CSV export of exactly that selection.
 * Nothing here loads the whole table: the list is paged by the server, the
 * sums come from /api/expenses/summary and the picker choices from /facets.
 */
export default function ExpensesIndex() {
  const { t } = useTranslation(["expenses", "common"]);
  const hidePrices = useHidePrices();
  const [searchQuery, setSearchQuery] = useState("");
  const [vehicleFilter, setVehicleFilter] = useState(ALL);
  const [categoryFilter, setCategoryFilter] = useState(ALL);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  // B-64: only the costs without a receipt, to chase the missing ones.
  const [noReceipt, setNoReceipt] = useState(false);
  const [view, setView] = useState<View>("categories");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [expenseToDelete, setExpenseToDelete] = useState<Expense | null>(null);
  const [binOpen, setBinOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const { toast } = useToast();
  const debouncedSearch = useDebouncedValue(searchQuery);

  const deleteExpenseMutation = useMutation({
    mutationFn: async (expenseId: number) => {
      const response = await apiRequest("DELETE", `/api/expenses/${expenseId}`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to delete expense");
      }
      return await response.json();
    },
    onSuccess: async (_data, expenseId) => {
      toast({
        title: t('viewDialog.expenseDeletedTitle'),
        description: t('viewDialog.expenseDeletedDescription'),
      });
      await invalidateRelatedQueries('expenses', {
        id: expenseId,
        vehicleId: expenseToDelete?.vehicleId
      });
      // Sub-project D (B-41 D8): the expense is in the recycle bin now; a bin list cached from before is stale.
      invalidateByPrefix("/api/deleted-records");
      setDeleteDialogOpen(false);
      setExpenseToDelete(null);
    },
    onError: (error: Error) => {
      toast({
        title: t('viewDialog.deleteExpenseErrorTitle'),
        description: describeApiError(error, undefined, t('viewDialog.deleteExpenseErrorDescription')),
        variant: "destructive",
      });
    }
  });

  const handleDeleteExpense = (expense: Expense) => {
    setExpenseToDelete(expense);
    setDeleteDialogOpen(true);
  };

  const filters: ExpenseListFilters = {
    vehicleId: vehicleFilter === ALL ? undefined : vehicleFilter,
    category: categoryFilter === ALL ? undefined : categoryFilter,
    from: from || undefined,
    to: to || undefined,
    q: debouncedSearch,
    noReceipt,
  };
  const params = expenseQueryParams(filters);
  const anyFilter = Object.values(params).some((value) => value !== undefined);

  // The picker choices: every vehicle with an expense and every category in use.
  const { data: facets } = useQuery<ExpenseFacets>({ queryKey: ["/api/expenses/facets"], retry: 1 });
  // The selection per category, with the newest rows of each; also the count and sum on top.
  const { data: summary, isLoading: isLoadingSummary, isError: summaryFailed } = useQuery<ExpenseSummary>({
    queryKey: ["/api/expenses/summary", { ...params, recent: CATEGORY_SECTION_ROWS }],
    retry: 1,
    staleTime: 0,
  });

  const vehicleOptions = useMemo<ComboboxOption[]>(() => [
    { value: ALL, label: t('indexPage.allVehiclesOption') },
    ...(facets?.vehicles ?? [])
      .map((vehicle) => ({
        value: String(vehicle.id),
        label: formatLicensePlate(vehicle.licensePlate),
        description: `${vehicle.brand} ${vehicle.model}`,
        // The picker searches label, value, description and tags: the plate without dashes must match too.
        tags: [vehicle.licensePlate],
      }))
      .sort((a, b) => a.label.localeCompare(b.label)),
  ], [facets, t]);

  // The canonical categories, plus any other label an older row still carries.
  const categoryChoices = useMemo(() => {
    const extra = (facets?.categories ?? []).filter((key) => !(EXPENSE_CATEGORIES as readonly string[]).includes(key));
    return [...EXPENSE_CATEGORIES, ...extra];
  }, [facets]);

  const activePeriod = matchingExpensePeriod(from, to);
  const choosePeriod = (period: ExpensePeriod) => {
    if (activePeriod === period) { setFrom(""); setTo(""); return; }
    const range = expensePeriodRange(period);
    setFrom(range.from);
    setTo(range.to);
  };

  const clearFilters = () => {
    setSearchQuery("");
    setVehicleFilter(ALL);
    setCategoryFilter(ALL);
    setFrom("");
    setTo("");
    setNoReceipt(false);
  };

  // The whole selection, newest first, whatever page is on screen.
  const exportCsv = async () => {
    setExporting(true);
    try {
      const response = await apiRequest("GET", queryKeyUrl(["/api/expenses", { ...params, sort: "date", dir: "desc" }]));
      await throwIfResNotOk(response);
      const rows: Expense[] = await response.json();
      downloadCsv(
        "kosten",
        [t('indexPage.dateColumnHeader'), t('indexPage.licensePlateColumnHeader'), t('indexPage.categoryColumnHeader'), t('indexPage.descriptionColumnHeader'), t('indexPage.amountColumnHeader')],
        rows.map((expense) => [
          csvDate(expense.date),
          expense.vehicle ? formatLicensePlate(expense.vehicle.licensePlate) : "",
          formatExpenseCategory(expense.category),
          expense.description ?? "",
          csvNumber(expense.amount),
        ]),
      );
    } catch (error) {
      toast({ title: t('indexPage.exportFailed'), description: describeApiError(error as Error), variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  const total = summary?.total ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-between items-center gap-2">
        <h1 className="text-2xl font-bold">{t('indexPage.pageTitle')}</h1>
        <div className="flex flex-wrap gap-2">
          {/* Sub-project D (B-41 D8): this screen's own bin; greyed out with the reason
              unless the account holds "Prullenbak beheren". */}
          <RequiresPermission anyOf={[UserPermission.MANAGE_RECYCLE_BIN]}>
            <Button variant="outline" onClick={() => setBinOpen(true)} data-testid="button-expenses-bin">
              <Archive className="mr-2 h-4 w-4" />
              {t('recycleBin:kinds.expense.openButton')}
            </Button>
          </RequiresPermission>
          <InvoiceInboxButton />
          <InvoiceScanner
            onExpensesCreated={() => {
              invalidateRelatedQueries('expenses');
            }}
          />
          {/* A-9-7: the same dialog the dashboard opens; /expenses/add now opens it too. */}
          <ExpenseAddDialog>
            <Button data-testid="button-record-expense">
              <PlusCircle className="mr-2 h-4 w-4" />
              {t('indexPage.recordExpenseButton')}
            </Button>
          </ExpenseAddDialog>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card className="md:col-span-3">
          <CardHeader>
            <CardTitle>{t('indexPage.tableTitle')}</CardTitle>
            <CardDescription>
              {t('indexPage.tableDescription')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-3" data-testid="expense-filters">
              <div className="space-y-1">
                <Label>{t('indexPage.vehicleFilterLabel')}</Label>
                <SearchableCombobox
                  options={vehicleOptions}
                  value={vehicleFilter}
                  onChange={setVehicleFilter}
                  placeholder={t('indexPage.allVehiclesOption')}
                  searchPlaceholder={t('indexPage.vehicleSearchPlaceholder')}
                  emptyMessage={t('indexPage.noVehicleFound')}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="expense-filter-from">{t('indexPage.fromLabel')}</Label>
                <Input id="expense-filter-from" type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="expense-filter-to">{t('indexPage.toLabel')}</Label>
                <Input id="expense-filter-to" type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="expense-filter-category">{t('indexPage.categoryFilterLabel')}</Label>
                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                  <SelectTrigger id="expense-filter-category" aria-label={t('indexPage.categoryFilterLabel')}>
                    <SelectValue placeholder={t('indexPage.filterByCategoryPlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>{t('indexPage.allCategoriesOption')}</SelectItem>
                    {categoryChoices.map((category) => (
                      <SelectItem key={category} value={category}>{formatExpenseCategory(category)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 mb-3">
              <Input
                placeholder={t('indexPage.searchPlaceholder')}
                aria-label={t('indexPage.searchPlaceholder')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full sm:max-w-xs"
                data-testid="expense-search"
              />
              <div className="flex gap-1" role="group" aria-label={t('indexPage.quickPeriodLabel')}>
                {EXPENSE_PERIODS.map((period) => (
                  <Button key={period} size="sm" variant={activePeriod === period ? "default" : "outline"} aria-pressed={activePeriod === period} onClick={() => choosePeriod(period)} data-testid={`button-period-${period}`}>
                    {t(`indexPage.period.${period}`)}
                  </Button>
                ))}
              </div>
              <Button size="sm" variant={noReceipt ? "default" : "outline"} aria-pressed={noReceipt} onClick={() => setNoReceipt(!noReceipt)} data-testid="button-filter-no-receipt">
                {t('noReceipt.filter')}
              </Button>
              {anyFilter && (
                <Button variant="ghost" size="sm" onClick={clearFilters} data-testid="button-clear-expense-filters">
                  {t('indexPage.clearFilters')}
                </Button>
              )}
              {!hidePrices && (
                <Button variant="outline" size="sm" className="ml-auto" onClick={exportCsv} disabled={total === 0 || exporting} data-testid="button-export-expenses">
                  <Download className="mr-2 h-4 w-4" />
                  {t('indexPage.exportCsv')}
                </Button>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 mb-3 text-sm">
              <p className="text-muted-foreground" data-testid="expense-selection-summary" aria-live="polite">
                {summary ? (
                  <>
                    <span className="font-medium text-foreground">{t('indexPage.selectionCount', { count: summary.total })}</span>
                    {" · "}
                    {t('indexPage.selectionTotal')} <span className="font-medium text-foreground tabular-nums"><Price value={summary.totalAmount} /></span>
                  </>
                ) : summaryFailed ? t('indexPage.loadError') : t('indexPage.loading')}
              </p>
              <div className="inline-flex rounded-md border p-0.5" role="group" aria-label={t('indexPage.viewLabel')}>
                <Button size="sm" variant={view === "categories" ? "secondary" : "ghost"} className={cn("h-7", view === "categories" && "shadow-sm")} aria-pressed={view === "categories"} onClick={() => setView("categories")} data-testid="button-view-categories">
                  <Rows3 className="mr-1.5 h-4 w-4" />{t('indexPage.viewByCategory')}
                </Button>
                <Button size="sm" variant={view === "table" ? "secondary" : "ghost"} className={cn("h-7", view === "table" && "shadow-sm")} aria-pressed={view === "table"} onClick={() => setView("table")} data-testid="button-view-table">
                  <LayoutList className="mr-1.5 h-4 w-4" />{t('indexPage.viewTable')}
                </Button>
              </div>
            </div>

            {view === "table" ? (
              <ExpenseListTable filters={filters} onDelete={handleDeleteExpense} />
            ) : isLoadingSummary ? (
              <div className="flex h-40 items-center justify-center" role="status" aria-label={t('indexPage.loading')}>
                <svg className="h-8 w-8 animate-spin text-primary-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              </div>
            ) : summaryFailed ? (
              <p className="rounded-md border bg-red-50 p-4 text-sm text-red-700" role="alert">{t('indexPage.loadError')}</p>
            ) : (
              <ExpenseCategorySections groups={summary?.byCategory ?? []} filters={filters} onDelete={handleDeleteExpense} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('indexPage.summaryTitle')}</CardTitle>
            <CardDescription>{anyFilter ? t('indexPage.summaryDescriptionFiltered') : t('indexPage.summaryDescription')}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              <div>
                <h3 className="text-sm font-medium text-gray-500 mb-1">{anyFilter ? t('indexPage.filteredTotalLabel') : t('indexPage.totalExpensesLabel')}</h3>
                <p className="text-3xl font-bold tabular-nums" data-testid="expense-total"><Price value={summary?.totalAmount ?? 0} /></p>
              </div>

              {summary && summary.byCategory.length > 0 && (
                <div className="space-y-3">
                  <h4 className="text-sm font-medium text-gray-500">{t('indexPage.byCategoryLabel')}</h4>
                  {summary.byCategory.map(({ category, amount, count }) => (
                    <div key={category} className="flex justify-between items-center gap-2 text-sm" data-testid={`summary-category-${category}`}>
                      <div className="min-w-0">
                        <span>{formatExpenseCategory(category)}</span>
                        <span className="ml-2 text-xs text-gray-500">{t('indexPage.expenseCount', { count })}</span>
                      </div>
                      <span className="font-medium tabular-nums whitespace-nowrap"><Price value={amount} /></span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <RecycleBinDialog kind="expense" open={binOpen} onOpenChange={setBinOpen} />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('detailsPage.confirmDeleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('detailsPage.confirmDeleteDescription')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common:actions.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => expenseToDelete && deleteExpenseMutation.mutate(expenseToDelete.id)}
              disabled={deleteExpenseMutation.isPending}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleteExpenseMutation.isPending ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  {t('detailsPage.deletingButton')}
                </>
              ) : (
                <>{t('detailsPage.deleteButton')}</>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
