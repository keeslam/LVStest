import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { InvoiceScanner } from "@/components/invoice-scanner";
import {
  Table,
  TableBody,
  TableCaption,
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
import { formatDate, formatCurrency } from "@/lib/format-utils";
import { Price } from "@/components/ui/price";
import { formatLicensePlate } from "@/lib/format-utils";
import { apiRequest, invalidateRelatedQueries } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useGlobalDialog } from "@/contexts/GlobalDialogContext";
import {
  ChevronDown,
  ChevronUp,
  PlusCircle,
  Wrench,
  Disc,
  SquareAsterisk,
  ShieldAlert,
  Hammer,
  FileQuestion,
  Eye,
  Trash2,
} from "lucide-react";

export default function ExpensesIndex() {
  const { t } = useTranslation(["expenses", "common"]);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [expenseToDelete, setExpenseToDelete] = useState<Expense | null>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { openExpenseDialog } = useGlobalDialog();
  
  // Define query key for easier reference and consistent usage
  const expensesQueryKey = ["/api/expenses"];
  
  // Delete expense mutation
  const deleteExpenseMutation = useMutation({
    mutationFn: async (expenseId: number) => {
      const response = await apiRequest("DELETE", `/api/expenses/${expenseId}`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to delete expense");
      }
      return await response.json();
    },
    onSuccess: async (data, expenseId) => {
      toast({
        title: t('viewDialog.expenseDeletedTitle'),
        description: t('viewDialog.expenseDeletedDescription'),
      });
      
      // Use unified invalidation system for comprehensive cache updates
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
        description: error.message || t('viewDialog.deleteExpenseErrorDescription'),
        variant: "destructive",
      });
    }
  });
  
  const handleDeleteExpense = (expense: Expense) => {
    setExpenseToDelete(expense);
    setDeleteDialogOpen(true);
  };
  
  // State to track if component has mounted for auto-refresh
  const [hasMounted, setHasMounted] = useState(false);
  
  // Force refresh on component mount to ensure we have latest data
  useEffect(() => {
    if (!hasMounted) {
      console.log("Forcing a refresh of the expenses list on initial mount");
      invalidateRelatedQueries('expenses');
      setHasMounted(true);
    }
  }, [hasMounted, queryClient, expensesQueryKey]);
  
  const { 
    data: expenses, 
    isLoading, 
    error,
    refetch: refetchExpenses
  } = useQuery<Expense[]>({
    queryKey: expensesQueryKey,
    retry: 1,
    refetchOnMount: true, // Always refetch when component mounts
    refetchOnWindowFocus: true, // Refetch when window regains focus
    staleTime: 0, // Consider data always stale to force refetch
  });
  
  // Get unique categories from expenses
  const categoriesWithAmounts = expenses
    ? expenses.reduce((acc, expense) => {
        const category = expense.category || "Unknown";
        acc[category] = (acc[category] || 0) + Number(expense.amount || 0);
        return acc;
      }, {} as Record<string, number>)
    : {};
  
  // Sort categories by amount (descending) to match the sidebar order
  const allCategories = Object.entries(categoriesWithAmounts)
    .sort((a, b) => b[1] - a[1])
    .map(([category]) => category);
    
  const categories = ["all", ...allCategories];
  
  // Function to get category icon
  const getCategoryIcon = (category: string) => {
    switch (category.toLowerCase()) {
      case 'maintenance':
        return <Wrench className="h-5 w-5 text-blue-500" />;
      case 'tires':
        return <Disc className="h-5 w-5 text-green-500" />;
      case 'front window':
        return <SquareAsterisk className="h-5 w-5 text-purple-500" />;
      case 'damage':
        return <ShieldAlert className="h-5 w-5 text-red-500" />;
      case 'repair':
        return <Hammer className="h-5 w-5 text-orange-500" />;
      default:
        return <FileQuestion className="h-5 w-5 text-gray-500" />;
    }
  };

  // Category values are stored verbatim in the database (and aren't restricted to the
  // fixed dropdown list - older/seeded data can be lowercase or entirely custom), so
  // they stay as-is; only recognized categories get a translated display label, looked
  // up case-insensitively the same way getCategoryIcon() above matches on category.
  const EXPENSE_CATEGORY_KEYS: Record<string, string> = {
    "maintenance": "maintenance",
    "tires": "tires",
    "brakes": "brakes",
    "damage": "damage",
    "fuel": "fuel",
    "insurance": "insurance",
    "registration": "registration",
    "cleaning": "cleaning",
    "accessories": "accessories",
    "other": "other",
  };

  const categoryLabel = (category: string) => {
    const key = EXPENSE_CATEGORY_KEYS[category.toLowerCase()];
    return key ? t(`form.categories.${key}`, { defaultValue: category }) : category;
  };

  // Filter expenses based on search query and category filter
  const filteredExpenses = expenses?.filter(expense => {
    if (!expense) return false;
    
    const searchLower = searchQuery.toLowerCase();
    const licensePlate = expense.vehicle?.licensePlate || '';
    const description = expense.description || '';
    const category = expense.category || '';
    
    // Remove any dashes from license plate for search
    const normalizedLicensePlate = licensePlate.replace(/-/g, '').toLowerCase();
    const searchWithoutDashes = searchLower.replace(/-/g, '');
    
    const matchesSearch = 
      // Search with original format
      licensePlate.toLowerCase().includes(searchLower) ||
      // Search with normalized format (no dashes)
      normalizedLicensePlate.includes(searchWithoutDashes) ||
      description.toLowerCase().includes(searchLower) ||
      category.toLowerCase().includes(searchLower);
    
    const matchesCategory = categoryFilter === "all" || expense.category === categoryFilter;
    
    return matchesSearch && matchesCategory;
  });
  
  // Calculate total amount for filtered expenses
  const totalAmount = filteredExpenses?.reduce((sum, expense) => 
    sum + Number(expense.amount || 0), 0
  ) || 0;
  
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">{t('indexPage.pageTitle')}</h1>
        <div className="flex gap-2">
          <InvoiceScanner
            onExpensesCreated={(expenses) => {
              console.log('Expenses created from invoice:', expenses);
              // Refresh the expenses list
              invalidateRelatedQueries('expenses');
            }}
          />
          <Link href="/expenses/add">
            <Button>
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-plus mr-2">
                <line x1="12" x2="12" y1="5" y2="19" />
                <line x1="5" x2="19" y1="12" y2="12" />
              </svg>
              {t('indexPage.recordExpenseButton')}
            </Button>
          </Link>
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
            <div className="flex flex-col md:flex-row gap-4 mb-4">
              <Input
                placeholder={t('indexPage.searchPlaceholder')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="max-w-sm"
              />

              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder={t('indexPage.filterByCategoryPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((category) => (
                    <SelectItem key={category} value={category}>
                      {category === "all" ? t('indexPage.allCategoriesOption') : categoryLabel(category)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            {isLoading ? (
              <div className="flex justify-center items-center h-64">
                <svg className="animate-spin h-8 w-8 text-primary-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              </div>
            ) : (
              <>
                {!filteredExpenses?.length ? (
                  <div className="text-center p-10 border rounded-md bg-gray-50">
                    <p className="text-gray-500">{t('indexPage.noExpensesFound')}</p>
                  </div>
                ) : (
                  <Accordion type="multiple" defaultValue={[]} className="w-full">
                    {allCategories.map(category => {
                      // Filter expenses for this category
                      const categoryExpenses = filteredExpenses.filter(
                        expense => expense.category === category
                      );
                      
                      // Skip if no expenses in this category after filtering
                      if (categoryExpenses.length === 0) return null;
                      
                      // Calculate total for this category
                      const categoryTotal = categoryExpenses.reduce(
                        (sum, expense) => sum + Number(expense.amount || 0), 0
                      );
                      
                      return (
                        <AccordionItem key={category} value={category}>
                          <AccordionTrigger className="hover:bg-gray-50 px-4 py-3 rounded-md">
                            <div className="flex justify-between items-center w-full">
                              <div className="flex items-center gap-3">
                                <div className="flex items-center gap-2">
                                  {getCategoryIcon(category)}
                                  <Badge variant="outline" className="text-sm font-medium">
                                    {categoryLabel(category)}
                                  </Badge>
                                </div>
                                <span className="text-gray-500 text-sm">
                                  {t('indexPage.expenseCount', { count: categoryExpenses.length })}
                                </span>
                              </div>
                              <div className="font-semibold text-right">
                                {<Price value={categoryTotal} />}
                              </div>
                            </div>
                          </AccordionTrigger>
                          <AccordionContent>
                            <div className="pt-2 pb-4">
                              {/* Custom implementation with license plate filter support */}
                              <div className="space-y-4">
                                <Input 
                                  placeholder={t('indexPage.filterByLicensePlateOrDescriptionPlaceholder')}
                                  className="max-w-sm"
                                  onChange={(e) => {
                                    // Store the filter value locally
                                    const filterValue = e.target.value.toLowerCase();
                                    
                                    // Get all tables in this accordion content
                                    const tableRows = document.querySelectorAll(`[data-category="${category}"] tbody tr`);
                                    
                                    tableRows.forEach((row) => {
                                      const licensePlateEl = row.querySelector('[data-license-plate]');
                                      const descriptionEl = row.querySelector('[data-description]');
                                      
                                      const licensePlate = licensePlateEl?.getAttribute('data-license-plate')?.toLowerCase() || '';
                                      const description = descriptionEl?.textContent?.toLowerCase() || '';
                                      
                                      // Normalize license plates for searching (remove dashes)
                                      const normalizedLicensePlate = licensePlate.replace(/-/g, '');
                                      const normalizedFilter = filterValue.replace(/-/g, '');
                                      
                                      // Check if either field matches
                                      const matches = 
                                        licensePlate.includes(filterValue) || 
                                        normalizedLicensePlate.includes(normalizedFilter) ||
                                        description.includes(filterValue);
                                      
                                      // Show/hide based on match
                                      if (row instanceof HTMLElement) {
                                        row.style.display = matches || filterValue === '' ? '' : 'none';
                                      }
                                    });
                                  }}
                                />
                                
                                <div className="rounded-md border" data-category={category}>
                                  <Table>
                                    <TableHeader>
                                      <TableRow>
                                        <TableHead>{t('indexPage.dateColumnHeader')}</TableHead>
                                        <TableHead>{t('indexPage.vehicleColumnHeader')}</TableHead>
                                        <TableHead>{t('indexPage.descriptionColumnHeader')}</TableHead>
                                        <TableHead>{t('indexPage.amountColumnHeader')}</TableHead>
                                        <TableHead></TableHead>
                                      </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                      {categoryExpenses.length === 0 ? (
                                        <TableRow>
                                          <TableCell colSpan={5} className="h-24 text-center">
                                            {t('indexPage.noExpensesFoundInCategory')}
                                          </TableCell>
                                        </TableRow>
                                      ) : (
                                        categoryExpenses.map((expense) => (
                                          <TableRow key={expense.id}>
                                            <TableCell>{formatDate(expense.date || '')}</TableCell>
                                            <TableCell>
                                              {expense.vehicle ? (
                                                <div data-license-plate={expense.vehicle.licensePlate}>
                                                  <div className="font-medium">{formatLicensePlate(expense.vehicle.licensePlate)}</div>
                                                  <div className="text-sm text-gray-500">{expense.vehicle.brand} {expense.vehicle.model}</div>
                                                </div>
                                              ) : "—"}
                                            </TableCell>
                                            <TableCell data-description>
                                              {expense.description || "—"}
                                            </TableCell>
                                            <TableCell>
                                              <span className="font-medium">{<Price value={Number(expense.amount) || 0} />}</span>
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
                                                  data-testid={`button-delete-expense-${expense.id}`}
                                                >
                                                  <Trash2 className="h-4 w-4" />
                                                </Button>
                                              </div>
                                            </TableCell>
                                          </TableRow>
                                        ))
                                      )}
                                    </TableBody>
                                  </Table>
                                </div>
                              </div>
                              <div className="mt-2 flex justify-end">
                                <Link href={`/expenses/add?category=${encodeURIComponent(category)}`}>
                                  <Button size="sm" variant="outline" className="gap-1">
                                    <PlusCircle size={16} />
                                    {t('indexPage.addCategoryExpenseButton', { category: categoryLabel(category) })}
                                  </Button>
                                </Link>
                              </div>
                            </div>
                          </AccordionContent>
                        </AccordionItem>
                      );
                    })}
                  </Accordion>
                )}
              </>
            )}
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle>{t('indexPage.summaryTitle')}</CardTitle>
            <CardDescription>{t('indexPage.summaryDescription')}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              <div>
                <h3 className="text-sm font-medium text-gray-500 mb-1">{t('indexPage.totalExpensesLabel')}</h3>
                <p className="text-3xl font-bold">{<Price value={totalAmount} />}</p>
              </div>

              {!isLoading && (
                <div className="space-y-4">
                  <h4 className="text-sm font-medium text-gray-500">{t('indexPage.byCategoryLabel')}</h4>
                  {Object.entries(
                    filteredExpenses?.reduce((acc, expense) => {
                      const category = expense.category;
                      acc[category] = (acc[category] || 0) + Number(expense.amount || 0);
                      return acc;
                    }, {} as Record<string, number>) || {}
                  )
                    .sort((a, b) => b[1] - a[1])
                    .map(([category, amount]) => (
                      <div key={category} className="flex justify-between items-center">
                        <div className="flex items-center gap-2">
                          {getCategoryIcon(category)}
                          <span>{categoryLabel(category)}</span>
                        </div>
                        <span className="font-medium">{<Price value={amount} />}</span>
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
