import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Eye, ExternalLink, Trash2, Wrench, CircleDot, AlertTriangle, Hammer, Fuel, Shield, FileText, Sparkles, Package, MoreHorizontal, Disc, ChevronLeft, ChevronRight, Printer } from "lucide-react";
import { formatDate, formatCurrency, sumMoney } from "@/lib/format-utils";
import { Price } from "@/components/ui/price";
import { Expense, Vehicle } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { apiRequest , invalidateByPrefix } from "@/lib/queryClient";
import { useGlobalDialog } from "@/contexts/GlobalDialogContext";
import { ExpenseAddDialog } from "./expense-add-dialog";
import { PdfPreviewDialog } from "@/components/documents/pdf-preview-dialog";

// Category values are stored verbatim in the database (and aren't restricted to the
// fixed dropdown list - older/seeded data can be lowercase or entirely custom), so
// they stay as-is; only recognized categories get a translated display label, looked
// up case-insensitively the same way getExpenseIcon() below matches on category.
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

// Function to get expense icon based on category
function getExpenseIcon(category: string) {
  switch (category.toLowerCase()) {
    case "maintenance":
      return <Wrench className="h-4 w-4 text-blue-600" />;
    case "tires":
      return <CircleDot className="h-4 w-4 text-green-600" />;
    case "brakes":
      return <Disc className="h-4 w-4 text-red-600" />;
    case "damage":
      return <AlertTriangle className="h-4 w-4 text-yellow-600" />;
    case "repair":
      return <Hammer className="h-4 w-4 text-orange-600" />;
    case "fuel":
      return <Fuel className="h-4 w-4 text-purple-600" />;
    case "insurance":
      return <Shield className="h-4 w-4 text-cyan-600" />;
    case "registration":
      return <FileText className="h-4 w-4 text-indigo-600" />;
    case "cleaning":
      return <Sparkles className="h-4 w-4 text-pink-600" />;
    case "accessories":
      return <Package className="h-4 w-4 text-amber-600" />;
    default:
      return <MoreHorizontal className="h-4 w-4 text-gray-600" />;
  }
}

interface ExpenseViewDialogProps {
  vehicleId: number;
  children?: React.ReactNode;
  onSuccess?: () => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

const ITEMS_PER_PAGE = 5;

export function ExpenseViewDialog({
  vehicleId,
  children,
  onSuccess,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
}: ExpenseViewDialogProps) {
  const { t } = useTranslation(["expenses", "common"]);
  const categoryLabel = (category: string) => {
    const key = EXPENSE_CATEGORY_KEYS[category.toLowerCase()];
    return key ? t(`form.categories.${key}`, { defaultValue: category }) : category;
  };
  const { openExpenseDialog } = useGlobalDialog();
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen = isControlled ? (controlledOnOpenChange as (open: boolean) => void) : setInternalOpen;
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [categoryPages, setCategoryPages] = useState<Record<string, number>>({});
  const [receiptPreviewExpense, setReceiptPreviewExpense] = useState<Expense | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Get current page for a category, default to 1
  const getCategoryPage = (category: string) => categoryPages[category] || 1;
  
  // Set page for a category
  const setCategoryPage = (category: string, page: number) => {
    setCategoryPages(prev => ({ ...prev, [category]: page }));
  };

  // Fetch expenses for this vehicle
  const { data: expenses, isLoading: isLoadingExpenses } = useQuery<Expense[]>({
    queryKey: [`/api/expenses/vehicle/${vehicleId}`],
    enabled: open,
  });

  // Fetch vehicle details
  const { data: vehicle, isLoading: isLoadingVehicle } = useQuery<Vehicle>({
    queryKey: [`/api/vehicles/${vehicleId}`],
    enabled: open,
  });

  // Delete expense mutation
  const deleteExpenseMutation = useMutation({
    mutationFn: async (expenseId: number) => {
      const response = await apiRequest("DELETE", `/api/expenses/${expenseId}`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || t('viewDialog.deleteExpenseErrorDescription'));
      }
      return await response.json();
    },
    onSuccess: async () => {
      toast({
        title: t('viewDialog.expenseDeletedTitle'),
        description: t('viewDialog.expenseDeletedDescription')
      });

      // Invalidate all relevant queries
      invalidateByPrefix("/api/expenses");
      invalidateByPrefix(`/api/expenses/vehicle/${vehicleId}`);

      if (onSuccess) {
        onSuccess();
      }
    },
    onError: (error: Error) => {
      toast({
        title: t('viewDialog.deleteExpenseErrorTitle'),
        description: error.message || t('viewDialog.deleteExpenseErrorDescription'),
        variant: "destructive"
      });
    }
  });

  // Get unique categories from expenses
  const allCategories = [...new Set(expenses?.map(expense => expense.category) || [])];
  const categories = ["all", ...allCategories];

  // Filter expenses based on search and category
  const filteredExpenses = expenses?.filter((expense) => {
    const searchLower = searchQuery.toLowerCase();
    const description = expense.description || '';
    const category = expense.category || '';
    
    const matchesSearch = 
      description.toLowerCase().includes(searchLower) ||
      category.toLowerCase().includes(searchLower);
    
    const matchesCategory = categoryFilter === "all" || category === categoryFilter;
    
    return matchesSearch && matchesCategory;
  }) || [];

  // Calculate total and category breakdown
  const totalExpenses = sumMoney(filteredExpenses, expense => expense.amount);
  
  // Group expenses by category with sorting (most recent first)
  const expensesByCategory = allCategories.map(category => {
    const categoryExpenses = (expenses?.filter(expense => expense.category === category) || [])
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    
    return {
      category,
      expenses: categoryExpenses,
      amount: sumMoney(categoryExpenses, expense => expense.amount),
      count: categoryExpenses.length
    };
  }).filter(item => item.count > 0)
    .sort((a, b) => b.amount - a.amount); // Sort categories by total amount

  // Custom trigger or default "View All Expenses" button
  const trigger = children || (
    <Button 
      size="sm" 
      variant="outline"
      data-testid={`button-view-expenses-${vehicleId}`}
    >
      <Eye className="mr-2 h-4 w-4" />
      {t('viewDialog.viewAllExpenses')}
    </Button>
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!isControlled && (
        <DialogTrigger asChild>
          {trigger}
        </DialogTrigger>
      )}
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-blue-500" />
            {isLoadingVehicle ? (
              t('viewDialog.vehicleExpenses')
            ) : vehicle ? (
              t('viewDialog.titleWithVehicle', { brand: vehicle.brand, model: vehicle.model, plate: vehicle.licensePlate })
            ) : (
              t('viewDialog.vehicleExpenses')
            )}
          </DialogTitle>
          <DialogDescription>
            {t('viewDialog.description')}
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4 space-y-6">
          {/* Action Bar */}
          <div className="flex justify-between items-center">
            <div className="flex gap-4 items-center">
              <Input
                placeholder={t('viewDialog.searchPlaceholder')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-64"
              />
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder={t('viewDialog.filterByCategory')} />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((category) => (
                    <SelectItem key={category} value={category}>
                      {category === "all" ? t('viewDialog.allCategories') : categoryLabel(category)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <ExpenseAddDialog vehicleId={vehicleId} onSuccess={onSuccess} />
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">{t('viewDialog.totalExpenses')}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{<Price value={totalExpenses} />}</div>
                <p className="text-xs text-muted-foreground">
                  {t('viewDialog.expenseCount', { count: filteredExpenses.length })}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">{t('viewDialog.categories')}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{allCategories.length}</div>
                <p className="text-xs text-muted-foreground">
                  {t('viewDialog.differentExpenseTypes')}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">{t('viewDialog.averageExpense')}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {filteredExpenses.length > 0 ? formatCurrency(totalExpenses / filteredExpenses.length) : formatCurrency(0)}
                </div>
                <p className="text-xs text-muted-foreground">
                  {t('viewDialog.perExpenseRecord')}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Expenses by Category - Collapsible */}
          {isLoadingExpenses ? (
            <div className="flex justify-center p-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : expensesByCategory.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              {t('viewDialog.noExpensesRecorded')}
            </div>
          ) : (
            <Accordion type="multiple" defaultValue={[]} className="w-full">
              {expensesByCategory.map(({ category, expenses: categoryExpenses, amount, count }) => {
                const currentPage = getCategoryPage(category);
                const totalPages = Math.ceil(count / ITEMS_PER_PAGE);
                const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
                const endIndex = startIndex + ITEMS_PER_PAGE;
                const paginatedExpenses = categoryExpenses.slice(startIndex, endIndex);
                
                return (
                  <AccordionItem key={category} value={category}>
                    <AccordionTrigger className="hover:bg-gray-50 px-4 py-3 rounded-md">
                      <div className="flex justify-between items-center w-full">
                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-2">
                            {getExpenseIcon(category)}
                            <Badge variant="outline" className="text-sm font-medium">
                              {categoryLabel(category)}
                            </Badge>
                          </div>
                          <span className="text-gray-500 text-sm">
                            ({t('viewDialog.expenseCount', { count })})
                          </span>
                        </div>
                        <div className="font-semibold text-right">
                          {<Price value={amount} />}
                        </div>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="pt-2 pb-4">
                        <div className="rounded-md border">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>{t('viewDialog.descriptionCol')}</TableHead>
                                <TableHead>{t('viewDialog.dateCol')}</TableHead>
                                <TableHead className="text-right">{t('viewDialog.amountCol')}</TableHead>
                                <TableHead className="text-center">{t('viewDialog.actionsCol')}</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {paginatedExpenses.map((expense) => (
                                <TableRow key={expense.id}>
                                  <TableCell>
                                    <div>
                                      <p className="font-medium">{expense.description || t('viewDialog.noDescription')}</p>
                                      {expense.receiptUrl && (
                                        <p className="text-xs text-muted-foreground">{t('viewDialog.hasReceipt')}</p>
                                      )}
                                    </div>
                                  </TableCell>
                                  <TableCell>{formatDate(expense.date)}</TableCell>
                                  <TableCell className="text-right font-medium">
                                    {<Price value={Number(expense.amount)} />}
                                  </TableCell>
                                  <TableCell className="text-center">
                                    <div className="flex items-center justify-center gap-1">
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => openExpenseDialog(expense.id, true)}
                                        className="h-8 w-8 p-0"
                                        title={t('common:actions.view')}
                                      >
                                        <ExternalLink className="h-4 w-4" />
                                      </Button>
                                      {expense.receiptUrl && (
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={() => expense.receiptUrl && window.open(expense.receiptUrl, '_blank')}
                                          className="h-8 w-8 p-0"
                                          title={t('viewDialog.viewReceiptTitle')}
                                        >
                                          <Eye className="h-4 w-4" />
                                        </Button>
                                      )}
                                      {expense.receiptFilePath && (
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={() => setReceiptPreviewExpense(expense)}
                                          className="h-8 w-8 p-0"
                                          title={t('viewDialog.printReceiptTitle')}
                                        >
                                          <Printer className="h-4 w-4" />
                                        </Button>
                                      )}
                                      <AlertDialog>
                                        <AlertDialogTrigger asChild>
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-8 w-8 p-0 text-red-600 hover:text-red-800"
                                            title={t('viewDialog.deleteExpenseTitle')}
                                          >
                                            <Trash2 className="h-4 w-4" />
                                          </Button>
                                        </AlertDialogTrigger>
                                        <AlertDialogContent>
                                          <AlertDialogHeader>
                                            <AlertDialogTitle>{t('viewDialog.deleteExpenseTitle')}</AlertDialogTitle>
                                            <AlertDialogDescription>
                                              {t('viewDialog.deleteExpenseConfirmPrefix', { category: categoryLabel(expense.category).toLowerCase() })}{<Price value={Number(expense.amount)} />}{t('viewDialog.deleteExpenseConfirmSuffix')}
                                            </AlertDialogDescription>
                                          </AlertDialogHeader>
                                          <AlertDialogFooter>
                                            <AlertDialogCancel>{t('common:actions.cancel')}</AlertDialogCancel>
                                            <AlertDialogAction
                                              onClick={() => deleteExpenseMutation.mutate(expense.id)}
                                              className="bg-red-600 hover:bg-red-700"
                                            >
                                              {t('viewDialog.delete')}
                                            </AlertDialogAction>
                                          </AlertDialogFooter>
                                        </AlertDialogContent>
                                      </AlertDialog>
                                    </div>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                        
                        {/* Pagination Controls */}
                        {totalPages > 1 && (
                          <div className="flex items-center justify-between mt-4 px-2">
                            <p className="text-sm text-muted-foreground">
                              {t('viewDialog.showingRange', { from: startIndex + 1, to: Math.min(endIndex, count), count })}
                            </p>
                            <div className="flex gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setCategoryPage(category, currentPage - 1)}
                                disabled={currentPage === 1}
                              >
                                <ChevronLeft className="h-4 w-4" />
                                {t('viewDialog.previous')}
                              </Button>
                              <div className="flex items-center gap-1">
                                {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                                  <Button
                                    key={page}
                                    variant={currentPage === page ? "default" : "outline"}
                                    size="sm"
                                    onClick={() => setCategoryPage(category, page)}
                                    className="w-8 h-8 p-0"
                                  >
                                    {page}
                                  </Button>
                                ))}
                              </div>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setCategoryPage(category, currentPage + 1)}
                                disabled={currentPage === totalPages}
                              >
                                {t('viewDialog.next')}
                                <ChevronRight className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>
          )}
        </div>

        <PdfPreviewDialog
          open={!!receiptPreviewExpense}
          onOpenChange={(open) => !open && setReceiptPreviewExpense(null)}
          url={receiptPreviewExpense ? `/api/expenses/${receiptPreviewExpense.id}/receipt` : null}
          title={t('viewDialog.printReceiptTitle')}
        />
      </DialogContent>
    </Dialog>
  );
}
