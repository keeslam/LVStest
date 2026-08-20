import { ExpenseForm } from "@/components/expenses/expense-form";
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Expense } from "@shared/schema";
import { Skeleton } from "@/components/ui/skeleton";

export default function ExpenseAdd() {
  const [vehicleId, setVehicleId] = useState<number | null>(null);
  const [location] = useLocation();
  const [isEditMode, setIsEditMode] = useState(false);
  const [expenseId, setExpenseId] = useState<number | null>(null);
  
  // State for preselected category
  const [preselectedCategory, setPreselectedCategory] = useState<string | null>(null);
  
  // Check if we're in edit mode by looking at the URL pattern
  useEffect(() => {
    // First, check if we're in edit mode by matching the URL pattern
    const editMatch = location.match(/\/expenses\/edit\/(\d+)/);
    if (editMatch && editMatch[1]) {
      const id = parseInt(editMatch[1]);
      console.log("Edit mode detected for expense ID:", id);
      setIsEditMode(true);
      setExpenseId(id);
    } else {
      // If we're not in edit mode, check for query parameters
      const urlParams = new URLSearchParams(window.location.search);
      
      // Check for vehicleId parameter
      const vehicleIdParam = urlParams.get("vehicleId");
      if (vehicleIdParam) {
        console.log("Found vehicleId in URL:", vehicleIdParam);
        setVehicleId(Number(vehicleIdParam));
      }
      
      // Check for category parameter
      const categoryParam = urlParams.get("category");
      if (categoryParam) {
        console.log("Found category in URL:", categoryParam);
        setPreselectedCategory(categoryParam);
      }
    }
  }, [location]);
  
  // Fetch expense data if in edit mode
  const { data: expense, isLoading } = useQuery<Expense>({
    queryKey: [`/api/expenses/${expenseId}`],
    enabled: isEditMode && !!expenseId,
  });
  
  if (isEditMode && isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Edit Expense</h1>
        <div className="space-y-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      </div>
    );
  }
  
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">
        {isEditMode ? "Edit Expense" : "Record New Expense"}
      </h1>
      <ExpenseForm 
        editMode={isEditMode}
        initialData={expense}
        preselectedVehicleId={isEditMode ? null : vehicleId}
        preselectedCategory={isEditMode ? null : preselectedCategory}
      />
    </div>
  );
}
