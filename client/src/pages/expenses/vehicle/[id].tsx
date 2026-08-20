import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest, invalidateRelatedQueries } from "@/lib/queryClient";
import { useLocation, Link } from "wouter";
import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate, formatCurrency } from "@/lib/format-utils";
import { displayLicensePlate } from "@/lib/utils";
import { Expense, Vehicle } from "@shared/schema";
import { PlusCircle, ArrowLeft, Eye, Trash2, Wrench, CircleDot, AlertTriangle, Hammer, Fuel, Shield, FileText, Sparkles, Package, MoreHorizontal, Disc } from "lucide-react";
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

export default function VehicleExpensesPage() {
  // Get vehicle ID from route parameter using pathname directly
  const [location] = useLocation();
  const { toast } = useToast();
  
  // Extract vehicleId from the URL path more reliably
  const pathSegments = location.split('/');
  const vehicleIdStr = pathSegments[pathSegments.length - 1];
  const vehicleId = !isNaN(parseInt(vehicleIdStr)) ? parseInt(vehicleIdStr) : null;
  
  // State for filtering
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  
  console.log("VehicleExpensesPage - current location:", location);
  console.log("VehicleExpensesPage - path segments:", pathSegments);
  console.log("VehicleExpensesPage - extracted vehicleId:", vehicleId);
  
  // Define query keys for easier reference
  const expenseListQueryKey = ["/api/expenses"];
  const vehicleExpensesQueryKey = vehicleId ? [`/api/expenses/vehicle/${vehicleId}`] : [];
  
  // Fetch expenses for this vehicle
  const { 
    data: expenses, 
    isLoading: isLoadingExpenses, 
    error: expensesError,
    refetch: refetchExpenses 
  } = useQuery<Expense[]>({
    queryKey: vehicleExpensesQueryKey,
    enabled: !!vehicleId,
    retry: 1,
  });
  
  // Define delete expense mutation
  const deleteExpenseMutation = useMutation({
    mutationFn: async (expenseId: number) => {
      const response = await apiRequest("DELETE", `/api/expenses/${expenseId}`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to delete expense');
      }
      return await response.json();
    },
    onSuccess: async () => {
      toast({
        title: "Expense deleted",
        description: "The expense has been successfully deleted."
      });
      
      invalidateRelatedQueries('expenses');
    },
    onError: (error: Error) => {
      toast({
        title: "Error deleting expense",
        description: error.message || "Failed to delete expense. Please try again.",
        variant: "destructive"
      });
    }
  });
  
  // Fetch vehicle details
  const { data: vehicle, isLoading: isLoadingVehicle, error: vehicleError } = useQuery<Vehicle>({
    queryKey: [`/api/vehicles/${vehicleId}`],
    enabled: !!vehicleId,
    retry: 1,
  });
  
  // Log the query results for debugging
  console.log("VehicleExpensesPage - vehicle data:", vehicle);
  console.log("VehicleExpensesPage - expenses data:", expenses);
  console.log("VehicleExpensesPage - errors:", { vehicleError, expensesError });
  
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
    
    const matchesCategory = categoryFilter === "all" || expense.category === categoryFilter;
    
    return matchesSearch && matchesCategory;
  });

  // Calculate totals
  const totalExpenses = filteredExpenses?.reduce((sum, expense) => 
    sum + Number(expense.amount || 0), 0
  ) || 0;
  
  // Group filtered expenses by category for summary
  const totalByCategory = filteredExpenses?.reduce((acc, expense) => {
    const category = expense.category || 'Other';
    const existing = acc.find(item => item.category === category);
    if (existing) {
      existing.amount += Number(expense.amount || 0);
      existing.count += 1;
    } else {
      acc.push({
        category,
        amount: Number(expense.amount || 0),
        count: 1
      });
    }
    return acc;
  }, [] as { category: string; amount: number; count: number }[]) || [];
  
  // Sort categories by total amount (descending)
  const sortedTotalByCategory = totalByCategory.sort((a, b) => b.amount - a.amount);
  const sortedCategories = sortedTotalByCategory.map(item => item.category);
  
  
  if (isLoadingVehicle || !vehicleId) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <div className="flex space-x-2">
            <Button variant="outline" size="sm" asChild>
              <Link href="/expenses">
                <ArrowLeft className="h-4 w-4 mr-2" /> Back to Expenses
              </Link>
            </Button>
            {vehicleId && (
              <Button variant="outline" size="sm" asChild>
                <Link href={`/vehicles/${vehicleId}`}>
                  <ArrowLeft className="h-4 w-4 mr-2" /> Back to Vehicle
                </Link>
              </Button>
            )}
          </div>
        </div>
        <div className="space-y-4">
          <Skeleton className="h-10 w-1/3" />
          <Skeleton className="h-6 w-1/4" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Skeleton className="h-40 md:col-span-2" />
          <Skeleton className="h-40" />
        </div>
      </div>
    );
  }
  
  if (!vehicle) {
    return (
      <div className="text-center py-12">
        <h2 className="text-2xl font-bold">Vehicle Not Found</h2>
        <p className="mt-2 text-muted-foreground">
          The vehicle you are looking for does not exist or has been removed.
        </p>
        <div className="flex space-x-2 mt-6 justify-center">
          <Button variant="outline" asChild>
            <Link href="/expenses">
              <ArrowLeft className="h-4 w-4 mr-2" /> Back to Expenses
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href={`/vehicles/${vehicleId}`}>
              <ArrowLeft className="h-4 w-4 mr-2" /> Back to Vehicle
            </Link>
          </Button>
        </div>
      </div>
    );
  }
  
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex space-x-2">
            <Button variant="outline" size="sm" asChild>
              <Link href="/expenses">
                <ArrowLeft className="h-4 w-4 mr-2" /> Back to Expenses
              </Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link href={`/vehicles/${vehicleId}`}>
                <ArrowLeft className="h-4 w-4 mr-2" /> Back to Vehicle
              </Link>
            </Button>
          </div>
          <h1 className="text-2xl font-bold">
            Expenses for {vehicle.brand} {vehicle.model} ({displayLicensePlate(vehicle.licensePlate)})
          </h1>
        </div>
        <Button asChild>
          <Link href={`/expenses/add?vehicleId=${vehicleId}`}>
            <PlusCircle className="h-4 w-4 mr-2" /> Add Expense
          </Link>
        </Button>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Expense Records</CardTitle>
            <CardDescription>
              {expenses?.length || 0} expense records for this vehicle
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col md:flex-row gap-4 mb-4">
              <Input
                placeholder="Search by category or description..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="max-w-sm"
              />
              
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Filter by category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((category) => (
                    <SelectItem key={category} value={category}>
                      {category === "all" ? "All Categories" : category}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            {isLoadingExpenses ? (
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
                    <p className="text-gray-500">No expenses found matching your search criteria.</p>
                  </div>
                ) : (
                  <Accordion type="multiple" defaultValue={sortedCategories} className="w-full">
                    {sortedCategories.map(category => {
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
                                  {getExpenseIcon(category)}
                                  <Badge variant="outline" className="text-sm font-medium">
                                    {category}
                                  </Badge>
                                </div>
                                <span className="text-gray-500 text-sm">
                                  ({categoryExpenses.length} {categoryExpenses.length === 1 ? 'expense' : 'expenses'})
                                </span>
                              </div>
                              <div className="font-semibold text-right">
                                {formatCurrency(categoryTotal)}
                              </div>
                            </div>
                          </AccordionTrigger>
                          <AccordionContent>
                            <div className="pt-2 pb-4">
                              <div className="space-y-4">
                                <Input 
                                  placeholder="Filter by description..." 
                                  className="max-w-sm"
                                  onChange={(e) => {
                                    // Store the filter value locally
                                    const filterValue = e.target.value.toLowerCase();
                                    
                                    // Get all tables in this accordion content
                                    const tableRows = document.querySelectorAll(`[data-category="${category}"] tbody tr`);
                                    
                                    tableRows.forEach((row) => {
                                      const descriptionEl = row.querySelector('[data-description]');
                                      
                                      const description = descriptionEl?.textContent?.toLowerCase() || '';
                                      
                                      // Check if description matches
                                      const matches = description.includes(filterValue);
                                      
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
                                        <TableHead>Date</TableHead>
                                        <TableHead>Description</TableHead>
                                        <TableHead>Amount</TableHead>
                                        <TableHead></TableHead>
                                      </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                      {categoryExpenses.length === 0 ? (
                                        <TableRow>
                                          <TableCell colSpan={4} className="h-24 text-center">
                                            No expenses in this category.
                                          </TableCell>
                                        </TableRow>
                                      ) : (
                                        categoryExpenses.map((expense) => (
                                          <TableRow key={expense.id}>
                                            <TableCell>{formatDate(expense.date)}</TableCell>
                                            <TableCell data-description>{expense.description || "—"}</TableCell>
                                            <TableCell className="font-medium">{formatCurrency(Number(expense.amount))}</TableCell>
                                            <TableCell className="text-right">
                                              <Link href={`/expenses/${expense.id}`}>
                                                <Button variant="ghost" size="sm">
                                                  View
                                                </Button>
                                              </Link>
                                            </TableCell>
                                          </TableRow>
                                        ))
                                      )}
                                    </TableBody>
                                  </Table>
                                </div>
                                
                                <div className="flex justify-center pt-2">
                                  <Button variant="outline" size="sm" asChild>
                                    <Link href={`/expenses/add?vehicleId=${vehicleId}&category=${category}`}>
                                      <PlusCircle className="h-4 w-4 mr-2" />
                                      Add {category} Expense
                                    </Link>
                                  </Button>
                                </div>
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
            <CardTitle>Expense Summary</CardTitle>
            <CardDescription>
              Total expenses: <span className="font-bold">{formatCurrency(totalExpenses)}</span>
            </CardDescription>
          </CardHeader>
          <CardContent>
            {totalByCategory.length === 0 ? (
              <div className="text-center py-4 text-muted-foreground">
                No expense data available
              </div>
            ) : (
              <div className="space-y-4">
                {totalByCategory.map(({ category, amount, count }) => (
                  <div key={category} className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      {getExpenseIcon(category)}
                      <div>
                        <Badge variant="outline">{category}</Badge>
                        <span className="text-xs text-muted-foreground ml-2">({count} items)</span>
                      </div>
                    </div>
                    <span className="font-medium">{formatCurrency(amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}