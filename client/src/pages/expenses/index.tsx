import { describeApiError } from "@/lib/api-error";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchableCombobox, type ComboboxOption } from "@/components/ui/searchable-combobox";
import { InvoiceScanner } from "@/components/invoice-scanner";
import { InvoiceInboxButton } from "@/components/expenses/invoice-inbox-dialog";
import { ExpenseAddDialog } from "@/components/expenses/expense-add-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { Expense } from "@shared/schema";
import { EXPENSE_CATEGORIES } from "@shared/expense-categories";
import { formatDate, plateMatches, formatExpenseCategory, formatLicensePlate, sumMoney } from "@/lib/format-utils";
import { Price, useHidePrices } from "@/components/ui/price";
import { downloadCsv, csvDate, csvNumber } from "@/lib/csv";
import { apiRequest, invalidateRelatedQueries } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useGlobalDialog } from "@/contexts/GlobalDialogContext";
import { Download, Eye, PlusCircle, Trash2 } from "lucide-react";

const ALL = "all";
/** The list shows this many rows at first; "Meer tonen" adds another page. The total always counts every row. */
const PAGE_SIZE = 100;

/** The category as one key, whatever casing an older row was written in (A-9-1). */
const categoryKey = (expense: Expense) => (expense.category || "").trim().toLowerCase();

/**
 * Kostenbeheer (A-9-8): one list of every expense with filters for vehicle
 * (searchable by plate), period and category, a total for what is shown, and a
 * CSV export of exactly that selection. The filters are sent to
 * GET /api/expenses (vehicleId, from, to, category); the unfiltered list is the
 * source of the choices in the vehicle and category pickers, so it needs no
 * vehicle permission of its own.
 */
export default function ExpensesIndex() {
  const { t } = useTranslation(["expenses", "common"]);
  const hidePrices = useHidePrices();
  const [searchQuery, setSearchQuery] = useState("");
  const [vehicleFilter, setVehicleFilter] = useState(ALL);
  const [categoryFilter, setCategoryFilter] = useState(ALL);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [expenseToDelete, setExpenseToDelete] = useState<Expense | null>(null);
  const { toast } = useToast();
  const { openExpenseDialog } = useGlobalDialog();

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

  const hasServerFilter = vehicleFilter !== ALL || categoryFilter !== ALL || from !== "" || to !== "";

  // Everything: the base list and the source of the picker choices. Always on, as it was.
  const { data: allExpenses, isLoading: isLoadingAll } = useQuery<Expense[]>({
    queryKey: ["/api/expenses"],
    retry: 1,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    staleTime: 0,
  });

  // The selection: only fetched while a filter is set; the object in the key becomes the query string.
  const { data: selectedExpenses, isLoading: isLoadingSelected } = useQuery<Expense[]>({
    queryKey: ["/api/expenses", {
      vehicleId: vehicleFilter === ALL ? undefined : vehicleFilter,
      category: categoryFilter === ALL ? undefined : categoryFilter,
      from: from || undefined,
      to: to || undefined,
    }],
    enabled: hasServerFilter,
    retry: 1,
    staleTime: 0,
  });

  const isLoading = hasServerFilter ? isLoadingSelected : isLoadingAll;
  const baseRows = (hasServerFilter ? selectedExpenses : allExpenses) ?? [];

  const vehicleOptions = useMemo<ComboboxOption[]>(() => {
    const seen = new Map<number, ComboboxOption>();
    for (const expense of allExpenses ?? []) {
      if (!expense.vehicle || seen.has(expense.vehicleId)) continue;
      seen.set(expense.vehicleId, {
        value: String(expense.vehicleId),
        label: formatLicensePlate(expense.vehicle.licensePlate),
        description: `${expense.vehicle.brand} ${expense.vehicle.model}`,
        // The picker searches label, value, description and tags: the plate without dashes must match too.
        tags: [expense.vehicle.licensePlate],
      });
    }
    return [
      { value: ALL, label: t('indexPage.allVehiclesOption') },
      ...Array.from(seen.values()).sort((a, b) => a.label.localeCompare(b.label)),
    ];
  }, [allExpenses, t]);

  // The canonical categories, plus any other label an older row still carries.
  const categoryChoices = useMemo(() => {
    const extra = new Set<string>();
    for (const expense of allExpenses ?? []) {
      const key = categoryKey(expense);
      if (key && !(EXPENSE_CATEGORIES as readonly string[]).includes(key)) extra.add(key);
    }
    return [...EXPENSE_CATEGORIES, ...Array.from(extra).sort()];
  }, [allExpenses]);

  const rows = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return baseRows
      .filter((expense) => {
        if (!query) return true;
        return plateMatches(expense.vehicle?.licensePlate, query)
          || (expense.description || "").toLowerCase().includes(query)
          || categoryKey(expense).includes(query)
          || formatExpenseCategory(expense.category).toLowerCase().includes(query);
      })
      .sort((a, b) => (b.date || "").localeCompare(a.date || "") || b.id - a.id);
  }, [baseRows, searchQuery]);

  const totalAmount = sumMoney(rows, (expense) => expense.amount);
  const totalsByCategory = useMemo(() => {
    const groups = new Map<string, Expense[]>();
    for (const expense of rows) {
      const key = categoryKey(expense);
      groups.set(key, [...(groups.get(key) ?? []), expense]);
    }
    return Array.from(groups.entries())
      .map(([category, items]) => ({ category, amount: sumMoney(items, (e) => e.amount), count: items.length }))
      .sort((a, b) => b.amount - a.amount);
  }, [rows]);

  const visibleRows = rows.slice(0, visibleCount);

  const clearFilters = () => {
    setSearchQuery("");
    setVehicleFilter(ALL);
    setCategoryFilter(ALL);
    setFrom("");
    setTo("");
    setVisibleCount(PAGE_SIZE);
  };
  const anyFilter = hasServerFilter || searchQuery !== "";

  const exportCsv = () => {
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
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-between items-center gap-2">
        <h1 className="text-2xl font-bold">{t('indexPage.pageTitle')}</h1>
        <div className="flex flex-wrap gap-2">
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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4" data-testid="expense-filters">
              <div className="space-y-1">
                <Label>{t('indexPage.vehicleFilterLabel')}</Label>
                <SearchableCombobox
                  options={vehicleOptions}
                  value={vehicleFilter}
                  onChange={(value) => { setVehicleFilter(value); setVisibleCount(PAGE_SIZE); }}
                  placeholder={t('indexPage.allVehiclesOption')}
                  searchPlaceholder={t('indexPage.vehicleSearchPlaceholder')}
                  emptyMessage={t('indexPage.noVehicleFound')}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="expense-filter-from">{t('indexPage.fromLabel')}</Label>
                <Input id="expense-filter-from" type="date" value={from} max={to || undefined} onChange={(e) => { setFrom(e.target.value); setVisibleCount(PAGE_SIZE); }} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="expense-filter-to">{t('indexPage.toLabel')}</Label>
                <Input id="expense-filter-to" type="date" value={to} min={from || undefined} onChange={(e) => { setTo(e.target.value); setVisibleCount(PAGE_SIZE); }} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="expense-filter-category">{t('indexPage.categoryFilterLabel')}</Label>
                <Select value={categoryFilter} onValueChange={(value) => { setCategoryFilter(value); setVisibleCount(PAGE_SIZE); }}>
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

            <div className="flex flex-col md:flex-row gap-3 mb-4 md:items-center">
              <Input
                placeholder={t('indexPage.searchPlaceholder')}
                aria-label={t('indexPage.searchPlaceholder')}
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setVisibleCount(PAGE_SIZE); }}
                className="max-w-sm"
              />
              {anyFilter && (
                <Button variant="ghost" size="sm" onClick={clearFilters} data-testid="button-clear-expense-filters">
                  {t('indexPage.clearFilters')}
                </Button>
              )}
              {!hidePrices && (
                <Button variant="outline" size="sm" className="md:ml-auto" onClick={exportCsv} disabled={rows.length === 0} data-testid="button-export-expenses">
                  <Download className="mr-2 h-4 w-4" />
                  {t('indexPage.exportCsv')}
                </Button>
              )}
            </div>

            {isLoading ? (
              <div className="flex justify-center items-center h-64" role="status" aria-label={t('indexPage.loading')}>
                <svg className="animate-spin h-8 w-8 text-primary-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              </div>
            ) : rows.length === 0 ? (
              <div className="text-center p-10 border rounded-md bg-gray-50">
                <p className="text-gray-500">{t('indexPage.noExpensesFound')}</p>
              </div>
            ) : (
              <>
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('indexPage.dateColumnHeader')}</TableHead>
                        <TableHead>{t('indexPage.vehicleColumnHeader')}</TableHead>
                        <TableHead>{t('indexPage.categoryColumnHeader')}</TableHead>
                        <TableHead>{t('indexPage.descriptionColumnHeader')}</TableHead>
                        <TableHead className="text-right">{t('indexPage.amountColumnHeader')}</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {visibleRows.map((expense) => (
                        <TableRow key={expense.id} data-testid={`row-expense-${expense.id}`}>
                          <TableCell>{formatDate(expense.date || '')}</TableCell>
                          <TableCell>
                            {expense.vehicle ? (
                              <div>
                                <div className="font-medium">{formatLicensePlate(expense.vehicle.licensePlate)}</div>
                                <div className="text-sm text-gray-500">{expense.vehicle.brand} {expense.vehicle.model}</div>
                              </div>
                            ) : "—"}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="font-medium">{formatExpenseCategory(expense.category)}</Badge>
                          </TableCell>
                          <TableCell>{expense.description || "—"}</TableCell>
                          <TableCell className="text-right">
                            <span className="font-medium"><Price value={Number(expense.amount) || 0} /></span>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex gap-1 justify-end">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => openExpenseDialog(expense.id)}
                                data-testid={`button-view-expense-${expense.id}`}
                              >
                                <Eye className="h-4 w-4 mr-1" />
                                {t('common:actions.view')}
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDeleteExpense(expense)}
                                className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                aria-label={t('detailsPage.deleteButton')}
                                data-testid={`button-delete-expense-${expense.id}`}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-gray-500">
                  <span data-testid="expense-rows-shown">{t('indexPage.rowsShown', { shown: visibleRows.length, count: rows.length })}</span>
                  {visibleRows.length < rows.length && (
                    <Button variant="outline" size="sm" onClick={() => setVisibleCount((count) => count + PAGE_SIZE)} data-testid="button-show-more-expenses">
                      {t('indexPage.showMore')}
                    </Button>
                  )}
                </div>
              </>
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
                <p className="text-3xl font-bold" data-testid="expense-total"><Price value={totalAmount} /></p>
              </div>

              {!isLoading && totalsByCategory.length > 0 && (
                <div className="space-y-4">
                  <h4 className="text-sm font-medium text-gray-500">{t('indexPage.byCategoryLabel')}</h4>
                  {totalsByCategory.map(({ category, amount, count }) => (
                    <div key={category} className="flex justify-between items-center gap-2" data-testid={`summary-category-${category}`}>
                      <div>
                        <span>{formatExpenseCategory(category)}</span>
                        <span className="ml-2 text-xs text-gray-500">{t('indexPage.expenseCount', { count })}</span>
                      </div>
                      <span className="font-medium"><Price value={amount} /></span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

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
