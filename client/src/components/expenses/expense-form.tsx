import { useState, useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { apiRequest , invalidateByPrefix, invalidateRelatedQueries } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { insertExpenseSchema } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  Form, 
  FormControl, 
  FormDescription, 
  FormField, 
  FormItem, 
  FormLabel, 
  FormMessage 
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Vehicle } from "@shared/schema";
import { format } from "date-fns";
import { formatFileSize } from "@/lib/format-utils";
import { SearchableCombobox, type ComboboxOption } from "@/components/ui/searchable-combobox";
import { VehicleSelector } from "@/components/ui/vehicle-selector";
import { InvoiceScanner } from "@/components/invoice-scanner";


// Expense categories
const expenseCategories = [
  "Maintenance",
  "Tires",
  "Brakes",
  "Damage",
  "Fuel",
  "Insurance",
  "Registration",
  "Cleaning",
  "Accessories",
  "Other"
];

// Maximum file size (25 MB) - matching server configuration
const MAX_FILE_SIZE = 25 * 1024 * 1024;

// Allowed file types
const ACCEPTED_FILE_TYPES = [
  "application/pdf",
  "application/x-pdf",
  "text/pdf",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/gif"
];

// Extended schema with validation
const formSchema = insertExpenseSchema.extend({
  vehicleId: z.number({
    required_error: "Please select a vehicle",
    invalid_type_error: "Please select a vehicle",
  }),
  category: z.string().min(1, "Category is required"),
  amount: z.number({
    required_error: "Amount is required",
    invalid_type_error: "Amount must be a number",
  }).min(0, "Amount must be positive"),
  date: z.string().min(1, "Date is required"),
  receiptFile: z
    .instanceof(File)
    .optional()
    .refine((file) => {
      if (!file) return true;
      return file.size <= MAX_FILE_SIZE;
    }, {
      message: `File size must be less than ${formatFileSize(MAX_FILE_SIZE)}.`,
    })
    .refine((file) => {
      if (!file) return true;
      return ACCEPTED_FILE_TYPES.includes(file.type);
    }, {
      message: "File type not supported.",
    }),
});

interface ExpenseFormProps {
  editMode?: boolean;
  initialData?: any;
  preselectedVehicleId?: number | null;
  preselectedCategory?: string | null;
  onSuccess?: () => void;
}

export function ExpenseForm({ 
  editMode = false, 
  initialData, 
  preselectedVehicleId,
  preselectedCategory,
  onSuccess
}: ExpenseFormProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [_, navigate] = useLocation();
  const [vehicleId, setVehicleId] = useState<number | null>(null);
  const [receiptTab, setReceiptTab] = useState<string>("url");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [formInitialized, setFormInitialized] = useState(false);
  const [recentVehicles, setRecentVehicles] = useState<string[]>([]);
  
  // Fetch vehicles for select field
  const { data: vehicles, isLoading: isLoadingVehicles } = useQuery<Vehicle[]>({
    queryKey: ["/api/vehicles"],
  });
  
  // Create vehicle options for the combobox
  const vehicleOptions = useMemo(() => {
    if (!vehicles) return [];
    
    return vehicles.map(vehicle => ({
      value: vehicle.id.toString(),
      label: `${vehicle.licensePlate} - ${vehicle.brand} ${vehicle.model}`,
      description: vehicle.fuel || undefined,
      group: vehicle.vehicleType || 'Other',
      tags: vehicle.vehicleType ? [vehicle.vehicleType] : [],
    }));
  }, [vehicles]);
  
  // Get today's date in YYYY-MM-DD format
  const today = format(new Date(), "yyyy-MM-dd");
  
  // Set vehicle ID from preselectedVehicleId prop
  useEffect(() => {
    if (preselectedVehicleId && preselectedVehicleId > 0) {
      console.log("Setting vehicleId from preselectedVehicleId:", preselectedVehicleId);
      setVehicleId(preselectedVehicleId);
      
      // If form is already initialized, update the vehicleId field
      if (formInitialized && !editMode) {
        form.setValue("vehicleId", preselectedVehicleId);
      }
    }
  }, [preselectedVehicleId, formInitialized, editMode]);
  
  // Set category from preselectedCategory prop
  useEffect(() => {
    if (preselectedCategory && !editMode && formInitialized) {
      // Check if it's a valid category and capitalize first letter to match options
      const normalizedCategory = preselectedCategory.charAt(0).toUpperCase() + preselectedCategory.slice(1).toLowerCase();
      
      if (expenseCategories.includes(normalizedCategory)) {
        console.log("Setting category from preselectedCategory:", normalizedCategory);
        form.setValue("category", normalizedCategory);
      }
    }
  }, [preselectedCategory, formInitialized, editMode]);
  
  // Setup form with react-hook-form and zod validation
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: initialData || {
      vehicleId: 0, // Will be updated after initialization
      category: "",
      amount: 0,
      date: today,
      description: "",
      receiptUrl: "",
    },
  });
  
  // When the form is first created, update with the vehicleId from preselectedVehicleId prop
  useEffect(() => {
    // Only run this once after the form is initialized
    if (!formInitialized) {
      if (vehicleId && vehicleId > 0 && !editMode) {
        // Log that we're setting from vehicleId state variable
        console.log("Setting form value from vehicleId state:", vehicleId);
        form.setValue("vehicleId", vehicleId);
        setFormInitialized(true);
      } else {
        // Otherwise, just mark as initialized
        setFormInitialized(true);
      }
    }
  }, [vehicleId, form, editMode, formInitialized]);
  
  // Handle file selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    
    if (file) {
      setSelectedFile(file);
      form.setValue("receiptFile", file);
    }
  };
  
  const createExpenseMutation = useMutation({
    mutationFn: async (data: z.infer<typeof formSchema>) => {
      // If we have a file, we need to use FormData instead of JSON
      if (selectedFile && receiptTab === "upload") {
        console.log("Preparing expense with receipt file upload", {
          file: selectedFile,
          filename: selectedFile.name,
          type: selectedFile.type,
          size: selectedFile.size
        });
        
        const formData = new FormData();
        
        // Add all the regular fields
        formData.append("vehicleId", data.vehicleId.toString());
        formData.append("category", data.category);
        formData.append("amount", data.amount.toString());
        formData.append("date", data.date);
        
        if (data.description) {
          formData.append("description", data.description);
        }
        
        // Add the file
        formData.append("receiptFile", selectedFile, selectedFile.name);
        
        console.log("FormData prepared, sending request to:", 
          editMode ? `/api/expenses/${initialData?.id}/with-receipt` : "/api/expenses/with-receipt");
        
        // Use fetch directly instead of apiRequest which is JSON-only
        const response = await fetch(
          editMode ? `/api/expenses/${initialData?.id}/with-receipt` : "/api/expenses/with-receipt", 
          {
            method: editMode ? "PATCH" : "POST",
            body: formData,
            credentials: "include",
          }
        );
        
        if (!response.ok) {
          const errorData = await response.json();
          console.error("Error response from server:", errorData);
          throw new Error(errorData.message || "Failed to upload receipt");
        }
        
        const result = await response.json();
        console.log("Server response:", result);
        return result;
      } else {
        console.log("Sending regular JSON expense without file");
        // Regular JSON request for URL-based receipts
        return await apiRequest(
          editMode ? "PATCH" : "POST", 
          editMode ? `/api/expenses/${initialData?.id}` : "/api/expenses", 
          data
        );
      }
    },
    onSuccess: async (result) => {
      // Extract vehicle ID from result or use current vehicleId state
      const expenseVehicleId = result?.vehicleId || vehicleId || (result && 'id' in result ? result.id : null);
      
      // Use the new unified invalidation system
      const { invalidateRelatedQueries } = await import("@/lib/queryClient");
      invalidateRelatedQueries('expenses', { 
        id: result?.id,
        vehicleId: expenseVehicleId || vehicleId 
      });
      
      // Show success message
      toast({
        title: `Expense ${editMode ? "updated" : "recorded"} successfully`,
        description: `The expense has been ${editMode ? "updated" : "added"} to the system.`,
      });
      
      // Call custom onSuccess callback if provided
      if (onSuccess) {
        onSuccess();
        // Skip all navigation when onSuccess is provided (dialog mode)
        return;
      }
      
      console.log("Created expense with response:", result);
      
      // Navigation logic only for non-dialog mode (when no onSuccess callback)
      if (!editMode) {
        // Navigate back to expenses page
        navigate("/expenses");
      }
      
      // Navigate to the vehicle expenses page when a vehicle ID is available
      if (expenseVehicleId) {
        navigate(`/expenses/vehicle/${expenseVehicleId}`);
      } else if (result && result.id) {
        // Fallback to the expense details page if no vehicle ID but we have expense ID
        navigate(`/expenses/${result.id}`);
      } else {
        // Last fallback to expenses list
        navigate("/expenses");
      }
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Failed to ${editMode ? "update" : "record"} expense: ${error.message}`,
        variant: "destructive",
      });
    },
  });
  
  // Get the selected vehicle object
  const selectedVehicle = useMemo(() => {
    if (!vehicles || !form.getValues().vehicleId) return null;
    return vehicles.find(v => v.id === form.getValues().vehicleId);
  }, [vehicles, form?.getValues().vehicleId]);
  
  const onSubmit = (data: z.infer<typeof formSchema>) => {
    createExpenseMutation.mutate(data);
  };
  
  return (
    <Card>
      <CardHeader>
        <CardTitle>{editMode ? "Edit Expense" : "Record New Expense"}</CardTitle>
      </CardHeader>
      <CardContent>
        {/* Invoice Scanner Section */}
        {!editMode && (
          <div className="mb-8">
            <InvoiceScanner
              onExpensesCreated={(expenses) => {
                // When expenses are created via scanner, refresh and close dialog
                invalidateByPrefix("/api/expenses");
                if (onSuccess) {
                  onSuccess();
                }
              }}
            />
          </div>
        )}
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Vehicle Selection */}
              <FormField
                control={form.control}
                name="vehicleId"
                render={({ field }) => (
                  <FormItem className="md:col-span-2">
                    <FormLabel>Vehicle</FormLabel>
                    <FormControl>
                      <VehicleSelector
                        vehicles={vehicles || []}
                        value={field.value > 0 ? field.value.toString() : ""}
                        onChange={(value) => field.onChange(parseInt(value))}
                        placeholder="Search and select a vehicle..."
                        disabled={vehicleId !== null}
                        recentVehicleIds={recentVehicles}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              {/* Expense Details */}
              <FormField
                control={form.control}
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Category</FormLabel>
                    <Select 
                      onValueChange={field.onChange} 
                      defaultValue={field.value}
                      value={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select expense category" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {expenseCategories.map((category) => (
                          <SelectItem key={category} value={category}>
                            {category}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Amount (€)</FormLabel>
                    <FormControl>
                      <Input 
                        type="number" 
                        step="0.01" 
                        min="0" 
                        placeholder="0.00" 
                        {...field}
                        onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Date</FormLabel>
                    <FormControl>
                      <Input type="date" max={today} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem className="md:col-span-2">
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="Describe the expense (e.g. Oil change, New tires, etc.)" 
                        className="min-h-[80px]"
                        {...field}
                        value={field.value || ''}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <div className="md:col-span-2">
                <FormLabel className="mb-2 block">Receipt</FormLabel>
                <Tabs defaultValue="url" value={receiptTab} onValueChange={setReceiptTab}>
                  <TabsList className="mb-4">
                    <TabsTrigger value="url">URL</TabsTrigger>
                    <TabsTrigger value="upload">Upload File</TabsTrigger>
                  </TabsList>
                  
                  <TabsContent value="url">
                    <FormField
                      control={form.control}
                      name="receiptUrl"
                      render={({ field }) => (
                        <FormItem>
                          <FormControl>
                            <Input placeholder="URL to receipt image or document" {...field} value={field.value || ''} />
                          </FormControl>
                          <FormDescription>
                            Enter a URL to an online receipt or invoice
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </TabsContent>
                  
                  <TabsContent value="upload">
                    <div className="space-y-4">
                      <div className="flex items-center justify-center w-full">
                        <label 
                          htmlFor="receipt-file-upload" 
                          className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer bg-muted/50 hover:bg-muted/80"
                        >
                          <div className="flex flex-col items-center justify-center pt-5 pb-6">
                            <svg className="w-8 h-8 mb-3 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path>
                            </svg>
                            <p className="mb-2 text-sm text-muted-foreground"><span className="font-semibold">Click to upload</span> or drag and drop</p>
                            <p className="text-xs text-muted-foreground">PDF, PNG, JPG or GIF (max. 25MB)</p>
                          </div>
                          <input 
                            id="receipt-file-upload" 
                            type="file" 
                            className="hidden" 
                            accept=".pdf,.png,.jpg,.jpeg,.gif"
                            onChange={handleFileChange}
                          />
                        </label>
                      </div>
                      
                      {selectedFile && (
                        <div className="p-3 bg-muted/50 rounded-lg flex items-center justify-between">
                          <div className="flex items-center space-x-2">
                            <svg className="w-6 h-6 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                            </svg>
                            <div className="text-sm">
                              <div className="font-medium truncate max-w-[150px] sm:max-w-[300px]">{selectedFile.name}</div>
                              <div className="text-muted-foreground text-xs">{formatFileSize(selectedFile.size)}</div>
                            </div>
                          </div>
                          <Button 
                            type="button" 
                            variant="ghost" 
                            size="sm"
                            onClick={() => {
                              setSelectedFile(null);
                              form.setValue("receiptFile", undefined as any);
                            }}
                          >
                            <svg className="w-4 h-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                            </svg>
                          </Button>
                        </div>
                      )}
                      
                      <FormDescription>
                        Upload a PDF receipt or invoice directly. PDF documents up to 25MB are supported to accommodate larger files such as detailed invoices. The file will be stored securely and organized by vehicle license plate.
                      </FormDescription>
                      {form.formState.errors.receiptFile && (
                        <p className="text-sm font-medium text-destructive">
                          {form.formState.errors.receiptFile.message}
                        </p>
                      )}
                    </div>
                  </TabsContent>
                </Tabs>
              </div>
            </div>
            
            <div className="flex justify-end space-x-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  if (onSuccess) {
                    onSuccess();
                  } else {
                    vehicleId ? navigate(`/expenses/vehicle/${vehicleId}`) : navigate("/expenses");
                  }
                }}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createExpenseMutation.isPending}
              >
                {createExpenseMutation.isPending ? (
                  <span className="flex items-center">
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Saving...
                  </span>
                ) : (
                  editMode ? "Update Expense" : "Record Expense"
                )}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
