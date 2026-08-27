import { useQuery, useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { queryClient, apiRequest, invalidateRelatedQueries } from "@/lib/queryClient";
import { useLocation, Link, useNavigate } from "wouter";
import { 
  ArrowLeft, 
  Calendar, 
  FileText, 
  Tag, 
  Truck, 
  FileCheck, 
  Pencil,
  Trash2,
  AlertCircle
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { 
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardHeader, 
  CardTitle 
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate, formatCurrency } from "@/lib/format-utils";
import { Price } from "@/components/ui/price";
import { displayLicensePlate } from "@/lib/utils";
import { Expense, Vehicle } from "@shared/schema";

export default function ExpenseDetailsPage() {
  const { t } = useTranslation(["expenses", "common"]);
  // Get expense ID from route parameter
  const [location, navigate] = useLocation();
  const { toast } = useToast();
  console.log("Current location:", location);
  
  // Parse the expense ID from the URL directly
  const expenseId = location.match(/\/expenses\/(\d+)/)?.[1] ? 
    parseInt(location.match(/\/expenses\/(\d+)/)?.[1] as string) : 
    null;
  
  console.log("Parsed expense ID:", expenseId);
  
  // Fetch expense details
  const { data: expense, isLoading, error: expenseError } = useQuery<Expense>({
    queryKey: [`/api/expenses/${expenseId}`],
    enabled: !!expenseId,
    retry: 1,
    onSuccess: (data) => console.log("Successfully loaded expense:", data),
    onError: (err) => console.error("Error loading expense:", err)
  });
  
  // Fetch associated vehicle details if expense is loaded
  const { data: vehicle, isLoading: isLoadingVehicle } = useQuery<Vehicle>({
    queryKey: [`/api/vehicles/${expense?.vehicleId}`],
    enabled: !!expense?.vehicleId,
    retry: 1,
  });
  
  // Define query keys for consistent usage and proper cache invalidation
  const mainExpensesQueryKey = ["/api/expenses"];
  const vehicleExpensesQueryKey = expense?.vehicleId ? [`/api/expenses/vehicle/${expense.vehicleId}`] : [];
  const currentExpenseQueryKey = [`/api/expenses/${expenseId}`];
  
  // Delete expense mutation
  const deleteExpenseMutation = useMutation({
    mutationFn: async () => {
      if (!expenseId) throw new Error("No expense ID provided");
      const response = await apiRequest("DELETE", `/api/expenses/${expenseId}`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to delete expense");
      }
      return await response.json();
    },
    onSuccess: async () => {
      toast({
        title: t('viewDialog.expenseDeletedTitle'),
        description: t('viewDialog.expenseDeletedDescription'),
      });
      
      // Use unified invalidation system for comprehensive cache updates
      await invalidateRelatedQueries('expenses', { 
        id: Number(expenseId),
        vehicleId: expense?.vehicleId 
      });
      
      // Navigate back to expenses list
      navigate("/expenses");
    },
    onError: (error: Error) => {
      toast({
        title: t('viewDialog.deleteExpenseErrorTitle'),
        description: error.message || t('viewDialog.deleteExpenseErrorDescription'),
        variant: "destructive",
      });
    }
  });
  
  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="sm" asChild>
            <Link href="/expenses">
              <ArrowLeft className="h-4 w-4 mr-2" /> {t('detailsPage.backToExpenses')}
            </Link>
          </Button>
        </div>
        <div className="space-y-4">
          <Skeleton className="h-10 w-1/3" />
          <Skeleton className="h-6 w-1/4" />
        </div>
        <Card>
          <CardContent className="p-6">
            <div className="space-y-4">
              <Skeleton className="h-6 w-full" />
              <Skeleton className="h-6 w-2/3" />
              <Skeleton className="h-6 w-1/2" />
              <Skeleton className="h-6 w-full" />
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }
  
  if (!expense) {
    return (
      <div className="text-center py-12">
        <h2 className="text-2xl font-bold">{t('detailsPage.expenseNotFoundTitle')}</h2>
        <p className="mt-2 text-muted-foreground">
          {t('detailsPage.expenseNotFoundDescription')}
        </p>
        <Button variant="outline" className="mt-6" asChild>
          <Link href="/expenses">
            <ArrowLeft className="h-4 w-4 mr-2" /> Back to Expenses
          </Link>
        </Button>
      </div>
    );
  }
  
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="sm" asChild>
            <Link href="/expenses">
              <ArrowLeft className="h-4 w-4 mr-2" /> {t('detailsPage.backToExpenses')}
            </Link>
          </Button>
          <h1 className="text-2xl font-bold">
            {t('detailsPage.pageTitle')}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" asChild>
            <Link href={`/expenses/edit/${expenseId}`}>
              <Pencil className="h-4 w-4 mr-2" /> {t('detailsPage.editExpenseButton')}
            </Link>
          </Button>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive">
                <Trash2 className="h-4 w-4 mr-2" /> {t('detailsPage.deleteButton')}
              </Button>
            </AlertDialogTrigger>
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
                  onClick={() => deleteExpenseMutation.mutate()}
                  disabled={deleteExpenseMutation.isPending}
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
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>{t('detailsPage.expenseInfoTitle')}</CardTitle>
            <CardDescription>
              {t('detailsPage.expenseInfoDescription')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground mb-1">{t('detailsPage.dateLabel')}</h3>
                    <div className="flex items-center">
                      <Calendar className="h-4 w-4 mr-2 text-primary" />
                      <span>{formatDate(expense.date)}</span>
                    </div>
                  </div>
                  
                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground mb-1">{t('detailsPage.categoryLabel')}</h3>
                    <div className="flex items-center">
                      <Tag className="h-4 w-4 mr-2 text-primary" />
                      <Badge>{expense.category}</Badge>
                    </div>
                  </div>
                  
                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground mb-1">{t('detailsPage.amountLabel')}</h3>
                    <div className="text-xl font-bold">
                      {<Price value={Number(expense.amount || 0)} />}
                    </div>
                  </div>
                </div>
                
                <div className="space-y-4">
                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground mb-1">{t('detailsPage.vehicleLabel')}</h3>
                    <div className="flex items-center">
                      <Truck className="h-4 w-4 mr-2 text-primary" />
                      {isLoadingVehicle ? (
                        <Skeleton className="h-6 w-28" />
                      ) : vehicle ? (
                        <Link href={`/vehicles/${vehicle.id}`} className="text-blue-600 hover:underline">
                          {vehicle.brand} {vehicle.model} ({displayLicensePlate(vehicle.licensePlate)})
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">{t('detailsPage.vehicleNotFound')}</span>
                      )}
                    </div>
                  </div>

                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground mb-1">{t('detailsPage.descriptionLabel')}</h3>
                    <div className="flex items-start">
                      <FileText className="h-4 w-4 mr-2 mt-1 text-primary" />
                      <p className="text-sm">
                        {expense.description || t('detailsPage.noDescriptionProvided')}
                      </p>
                    </div>
                  </div>

                  {expense.receiptFilePath && (
                    <div>
                      <h3 className="text-sm font-medium text-muted-foreground mb-1">{t('detailsPage.receiptLabel')}</h3>
                      <div className="flex items-center">
                        <FileCheck className="h-4 w-4 mr-2 text-primary" />
                        <a
                          href={`/api/expenses/${expense.id}/receipt`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:underline"
                        >
                          {t('detailsPage.viewReceiptLink')}
                        </a>
                      </div>
                    </div>
                  )}
                </div>
              </div>
              
              <div className="border-t pt-4 mt-4">
                <div className="flex justify-between text-sm text-muted-foreground">
                  <div>{t('detailsPage.createdLabel', { date: expense.createdAt ? formatDate(expense.createdAt) : t('detailsPage.notAvailable') })}</div>
                  {expense.createdBy && <div>{t('detailsPage.byLabel', { name: expense.createdBy })}</div>}
                </div>
                {expense.updatedAt && expense.createdAt && expense.updatedAt !== expense.createdAt && (
                  <div className="flex justify-between text-sm text-muted-foreground mt-1">
                    <div>{t('detailsPage.updatedLabel', { date: formatDate(expense.updatedAt) })}</div>
                    {expense.updatedBy && <div>{t('detailsPage.byLabel', { name: expense.updatedBy })}</div>}
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
        
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{t('detailsPage.quickActionsTitle')}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {vehicle && (
                  <Button variant="outline" className="w-full justify-start" asChild>
                    <Link href={`/expenses/vehicle/${vehicle.id}`}>
                      <Truck className="h-4 w-4 mr-2" />
                      {t('detailsPage.viewAllVehicleExpensesButton')}
                    </Link>
                  </Button>
                )}
                <Button variant="outline" className="w-full justify-start" asChild>
                  <Link href={`/expenses/add?vehicleId=${expense.vehicleId}`}>
                    <FileText className="h-4 w-4 mr-2" />
                    {t('detailsPage.addAnotherExpenseButton')}
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
