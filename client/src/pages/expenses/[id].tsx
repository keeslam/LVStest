import { useQuery, useMutation } from "@tanstack/react-query";
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
import { displayLicensePlate } from "@/lib/utils";
import { Expense, Vehicle } from "@shared/schema";

export default function ExpenseDetailsPage() {
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
        title: "Expense deleted",
        description: "The expense has been successfully deleted.",
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
        title: "Error deleting expense",
        description: error.message || "Failed to delete expense. Please try again.",
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
              <ArrowLeft className="h-4 w-4 mr-2" /> Back to Expenses
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
        <h2 className="text-2xl font-bold">Expense Not Found</h2>
        <p className="mt-2 text-muted-foreground">
          The expense you are looking for does not exist or has been removed.
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
              <ArrowLeft className="h-4 w-4 mr-2" /> Back to Expenses
            </Link>
          </Button>
          <h1 className="text-2xl font-bold">
            Expense Details
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" asChild>
            <Link href={`/expenses/edit/${expenseId}`}>
              <Pencil className="h-4 w-4 mr-2" /> Edit Expense
            </Link>
          </Button>
          
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive">
                <Trash2 className="h-4 w-4 mr-2" /> Delete
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete this expense record. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
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
                      Deleting...
                    </>
                  ) : (
                    <>Delete</>
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
            <CardTitle>Expense Information</CardTitle>
            <CardDescription>
              Details about this expense record
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground mb-1">Date</h3>
                    <div className="flex items-center">
                      <Calendar className="h-4 w-4 mr-2 text-primary" />
                      <span>{formatDate(expense.date)}</span>
                    </div>
                  </div>
                  
                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground mb-1">Category</h3>
                    <div className="flex items-center">
                      <Tag className="h-4 w-4 mr-2 text-primary" />
                      <Badge>{expense.category}</Badge>
                    </div>
                  </div>
                  
                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground mb-1">Amount</h3>
                    <div className="text-xl font-bold">
                      {formatCurrency(Number(expense.amount || 0))}
                    </div>
                  </div>
                </div>
                
                <div className="space-y-4">
                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground mb-1">Vehicle</h3>
                    <div className="flex items-center">
                      <Truck className="h-4 w-4 mr-2 text-primary" />
                      {isLoadingVehicle ? (
                        <Skeleton className="h-6 w-28" />
                      ) : vehicle ? (
                        <Link href={`/vehicles/${vehicle.id}`} className="text-blue-600 hover:underline">
                          {vehicle.brand} {vehicle.model} ({displayLicensePlate(vehicle.licensePlate)})
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">Vehicle not found</span>
                      )}
                    </div>
                  </div>
                  
                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground mb-1">Description</h3>
                    <div className="flex items-start">
                      <FileText className="h-4 w-4 mr-2 mt-1 text-primary" />
                      <p className="text-sm">
                        {expense.description || "No description provided"}
                      </p>
                    </div>
                  </div>
                  
                  {expense.receiptFilePath && (
                    <div>
                      <h3 className="text-sm font-medium text-muted-foreground mb-1">Receipt</h3>
                      <div className="flex items-center">
                        <FileCheck className="h-4 w-4 mr-2 text-primary" />
                        <a
                          href={`/api/expenses/${expense.id}/receipt`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:underline"
                        >
                          View Receipt
                        </a>
                      </div>
                    </div>
                  )}
                </div>
              </div>
              
              <div className="border-t pt-4 mt-4">
                <div className="flex justify-between text-sm text-muted-foreground">
                  <div>Created: {expense.createdAt ? formatDate(expense.createdAt) : 'N/A'}</div>
                  {expense.createdBy && <div>By: {expense.createdBy}</div>}
                </div>
                {expense.updatedAt && expense.createdAt && expense.updatedAt !== expense.createdAt && (
                  <div className="flex justify-between text-sm text-muted-foreground mt-1">
                    <div>Updated: {formatDate(expense.updatedAt)}</div>
                    {expense.updatedBy && <div>By: {expense.updatedBy}</div>}
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
        
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {vehicle && (
                  <Button variant="outline" className="w-full justify-start" asChild>
                    <Link href={`/expenses/vehicle/${vehicle.id}`}>
                      <Truck className="h-4 w-4 mr-2" />
                      View All Vehicle Expenses
                    </Link>
                  </Button>
                )}
                <Button variant="outline" className="w-full justify-start" asChild>
                  <Link href={`/expenses/add?vehicleId=${expense.vehicleId}`}>
                    <FileText className="h-4 w-4 mr-2" />
                    Add Another Expense
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