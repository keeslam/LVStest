import { useState, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient , invalidateByPrefix } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { 
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle 
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { VehicleSelector } from "@/components/ui/vehicle-selector";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { 
  Upload, 
  FileText, 
  Eye, 
  CheckCircle, 
  AlertCircle,
  Loader2,
  Trash2,
  Edit3
} from "lucide-react";
import { formatCurrency, sumMoney } from "@/lib/format-utils";
import { displayLicensePlate } from "@/lib/utils";
import { Vehicle } from "@shared/schema";

interface ParsedInvoiceLineItem {
  description: string;
  amount: number;
  category: string;
  subcategory?: string;
}

interface ParsedInvoice {
  vendor: string;
  invoiceNumber: string;
  invoiceDate: string;
  currency: string;
  totalAmount: number;
  lineItems: ParsedInvoiceLineItem[];
  vehicleInfo?: {
    licensePlate?: string;
    chassisNumber?: string;
  };
}

interface InvoiceScannerProps {
  selectedVehicleId?: number;
  onExpensesCreated?: (expenses: any[]) => void;
}

const EXPENSE_CATEGORIES = [
  'Maintenance',
  'Tires',
  'Brakes',
  'Damage',
  'Fuel',
  'Insurance',
  'Registration',
  'Cleaning',
  'Accessories',
  'Other'
];

export function InvoiceScanner({ selectedVehicleId, onExpensesCreated }: InvoiceScannerProps) {
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [vehicleId, setVehicleId] = useState<string>(selectedVehicleId?.toString() || '');
  const [scannedInvoice, setScannedInvoice] = useState<{
    invoice: ParsedInvoice;
    invoiceHash: string;
    filePath: string;
    suggestedVehicleId?: number;
  } | null>(null);
  const [editableLineItems, setEditableLineItems] = useState<ParsedInvoiceLineItem[]>([]);
  const [selectedItems, setSelectedItems] = useState<Set<number>>(new Set());
  const [groupByCategory, setGroupByCategory] = useState<boolean>(true);
  const [scanProgress, setScanProgress] = useState(0);
  const [scanStage, setScanStage] = useState('');

  // Auto-match vehicle based on license plate when invoice is scanned
  const autoSelectVehicleFromInvoice = (invoice: ParsedInvoice, vehicles: Vehicle[]) => {
    if (invoice.vehicleInfo?.licensePlate && vehicles) {
      const detectedPlate = invoice.vehicleInfo.licensePlate.replace(/[-\s]/g, '').toUpperCase();
      const matchingVehicle = vehicles.find(vehicle => 
        vehicle.licensePlate.replace(/[-\s]/g, '').toUpperCase() === detectedPlate
      );
      
      if (matchingVehicle && !vehicleId) {
        setVehicleId(matchingVehicle.id.toString());
        toast({
          title: "Vehicle Auto-Selected",
          description: `Found matching vehicle: ${matchingVehicle.brand} ${matchingVehicle.model} (${matchingVehicle.licensePlate})`,
        });
      }
    }
  };

  // Group line items by category
  const groupLineItemsByCategory = (items: ParsedInvoiceLineItem[]): ParsedInvoiceLineItem[] => {
    const grouped = items.reduce((acc, item) => {
      const category = item.category;
      
      if (!acc[category]) {
        acc[category] = {
          description: '',
          amount: 0,
          category: category,
          descriptions: []
        };
      }
      
      acc[category].amount += item.amount;
      acc[category].descriptions.push(item.description);
      
      return acc;
    }, {} as Record<string, { description: string; amount: number; category: string; descriptions: string[] }>);

    // Convert back to array and create combined descriptions
    return Object.values(grouped).map(group => ({
      description: group.descriptions.join(' • '),
      amount: group.amount,
      category: group.category
    }));
  };

  // Toggle grouping and reprocess items
  const toggleGrouping = () => {
    if (!scannedInvoice) return;
    
    const newGrouping = !groupByCategory;
    setGroupByCategory(newGrouping);
    
    const processedItems = newGrouping 
      ? groupLineItemsByCategory(scannedInvoice.invoice.lineItems || [])
      : scannedInvoice.invoice.lineItems || [];
    
    setEditableLineItems(processedItems);
    // Select all items by default when toggling
    const allItemIndices = new Set<number>(processedItems.map((_: any, index: number) => index));
    setSelectedItems(allItemIndices);
  };

  // Fetch vehicles for selection
  const { data: vehicles, isLoading: loadingVehicles } = useQuery<Vehicle[]>({
    queryKey: ['/api/vehicles'],
    enabled: isOpen
  });

  // Scan invoice mutation
  const scanInvoiceMutation = useMutation({
    mutationFn: async ({ file, vehicleId }: { file: File; vehicleId?: string }) => {
      const formData = new FormData();
      formData.append('invoice', file);
      if (vehicleId) {
        formData.append('vehicleId', vehicleId);
      }

      const response = await fetch('/api/expenses/scan', {
        method: 'POST',
        body: formData,
        credentials: 'include'
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to scan invoice');
      }

      return await response.json();
    },
    onSuccess: (data) => {
      setScannedInvoice(data);
      
      // Group by category if enabled
      const processedItems = groupByCategory 
        ? groupLineItemsByCategory(data.invoice.lineItems || [])
        : data.invoice.lineItems || [];
      
      setEditableLineItems(processedItems);
      // Select all items by default
      const allItemIndices = new Set<number>(processedItems.map((_: any, index: number) => index));
      setSelectedItems(allItemIndices);
      
      // Auto-select vehicle if license plate detected and no vehicle selected yet
      if (vehicles && data.invoice) {
        autoSelectVehicleFromInvoice(data.invoice, vehicles);
      }
      
      toast({
        title: "Invoice scanned successfully",
        description: `Found ${processedItems.length} ${groupByCategory ? 'category groups' : 'line items'} from ${data.invoice.vendor}`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to scan invoice",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  // Simulate progress during scanning (matched to actual 3-6 second AI processing time)
  useEffect(() => {
    if (!scanInvoiceMutation.isPending) {
      setScanProgress(0);
      setScanStage('');
      return;
    }

    setScanProgress(0);
    setScanStage('Uploading invoice...');
    
    const stages = [
      { progress: 10, stage: 'Uploading invoice...', delay: 200 },
      { progress: 20, stage: 'Trying fastest AI model...', delay: 600 },
      { progress: 40, stage: 'Reading invoice with AI...', delay: 1200 },
      { progress: 60, stage: 'Processing text & numbers...', delay: 2000 },
      { progress: 75, stage: 'Extracting line items...', delay: 3000 },
      { progress: 85, stage: 'Categorizing expenses...', delay: 4000 },
      { progress: 95, stage: 'Finalizing...', delay: 5000 }
    ];

    const timeouts: NodeJS.Timeout[] = [];
    
    stages.forEach(({ progress, stage, delay }) => {
      const timeout = setTimeout(() => {
        setScanProgress(progress);
        setScanStage(stage);
      }, delay);
      timeouts.push(timeout);
    });

    return () => {
      timeouts.forEach(timeout => clearTimeout(timeout));
    };
  }, [scanInvoiceMutation.isPending]);

  // Create expenses mutation
  const createExpensesMutation = useMutation({
    mutationFn: async (data: {
      invoice: ParsedInvoice;
      vehicleId: string;
      filePath: string;
      invoiceHash: string;
      lineItems: ParsedInvoiceLineItem[];
    }) => {
      const response = await apiRequest("POST", "/api/expenses/from-invoice", data);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to create expenses");
      }
      return await response.json();
    },
    onSuccess: async (data) => {
      toast({
        title: "Expenses created successfully",
        description: `Created ${data.expenses?.length || 0} expense records`,
      });
      
      // Invalidate queries to refresh expense lists
      await invalidateByPrefix('/api/expenses');
      await invalidateByPrefix("/api/expenses/recent");
      
      // Call callback if provided
      if (onExpensesCreated) {
        onExpensesCreated(data.expenses || []);
      }
      
      // Reset and close dialog
      handleReset();
      setIsOpen(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to create expenses",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (selectedFile) {
      if (selectedFile.type !== 'application/pdf') {
        toast({
          title: "Invalid file type",
          description: "Please select a PDF file",
          variant: "destructive",
        });
        return;
      }
      setFile(selectedFile);
    }
  };

  const handleScan = () => {
    if (!file) {
      toast({
        title: "No file selected",
        description: "Please select a PDF invoice to scan",
        variant: "destructive",
      });
      return;
    }

    scanInvoiceMutation.mutate({ file });
  };

  const handleCreateExpenses = () => {
    if (!scannedInvoice || !vehicleId) {
      return;
    }

    // Get selected line items
    const selectedLineItems = editableLineItems.filter((_, index) => selectedItems.has(index));
    
    if (selectedLineItems.length === 0) {
      toast({
        title: "No items selected",
        description: "Please select at least one line item to create expenses",
        variant: "destructive",
      });
      return;
    }

    createExpensesMutation.mutate({
      invoice: scannedInvoice.invoice,
      vehicleId,
      filePath: scannedInvoice.filePath,
      invoiceHash: scannedInvoice.invoiceHash,
      lineItems: selectedLineItems
    });
  };

  const handleReset = () => {
    setFile(null);
    setScannedInvoice(null);
    setEditableLineItems([]);
    setSelectedItems(new Set());
  };

  const updateLineItem = (index: number, field: keyof ParsedInvoiceLineItem, value: string | number) => {
    const updated = [...editableLineItems];
    updated[index] = { ...updated[index], [field]: value };
    setEditableLineItems(updated);
  };

  const toggleItemSelection = (index: number) => {
    const newSelected = new Set(selectedItems);
    if (newSelected.has(index)) {
      newSelected.delete(index);
    } else {
      newSelected.add(index);
    }
    setSelectedItems(newSelected);
  };

  const removeLineItem = (index: number) => {
    const updated = editableLineItems.filter((_, i) => i !== index);
    setEditableLineItems(updated);
    
    // Update selected items indices
    const newSelected = new Set<number>();
    selectedItems.forEach(selectedIndex => {
      if (selectedIndex < index) {
        newSelected.add(selectedIndex);
      } else if (selectedIndex > index) {
        newSelected.add(selectedIndex - 1);
      }
    });
    setSelectedItems(newSelected);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button 
          variant="outline" 
          className="gap-2" 
          data-testid="button-scan-invoice"
        >
          <Upload className="h-4 w-4" />
          Scan Invoice
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Scan Invoice</DialogTitle>
          <DialogDescription>
            Upload a PDF invoice to automatically extract and categorize expenses
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Step 1: File Upload */}
          {!scannedInvoice && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="invoice-file">Upload Invoice PDF</Label>
                <Input
                  id="invoice-file"
                  type="file"
                  accept=".pdf"
                  onChange={handleFileSelect}
                  data-testid="input-invoice-file"
                />
                {file && (
                  <div className="text-sm text-muted-foreground">
                    Selected: {file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)
                  </div>
                )}
              </div>

              {scanInvoiceMutation.isPending && (
                <Card className="bg-blue-50 border-blue-200">
                  <CardContent className="pt-6">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium text-blue-900">{scanStage}</span>
                        <span className="text-blue-700">{scanProgress}%</span>
                      </div>
                      <Progress value={scanProgress} className="h-2" />
                      <p className="text-xs text-blue-600 text-center">
                        AI is analyzing your invoice...
                      </p>
                    </div>
                  </CardContent>
                </Card>
              )}

              <Button 
                onClick={handleScan} 
                disabled={!file || scanInvoiceMutation.isPending}
                className="w-full"
                data-testid="button-start-scan"
              >
                {scanInvoiceMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <FileText className="h-4 w-4 mr-2" />
                    Scan Invoice
                  </>
                )}
              </Button>
            </div>
          )}

          {/* Step 2: Vehicle Selection & Review Scanned Data */}
          {scannedInvoice && (
            <div className="space-y-6">
              {/* Vehicle Selection */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CheckCircle className="h-5 w-5 text-green-600" />
                    Select Vehicle for Expenses
                  </CardTitle>
                  <CardDescription>
                    {scannedInvoice.invoice.vehicleInfo?.licensePlate 
                      ? `Found license plate "${displayLicensePlate(scannedInvoice.invoice.vehicleInfo.licensePlate)}" in invoice. Auto-selected matching vehicle if found.`
                      : "Choose which vehicle these expenses belong to."
                    }
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <VehicleSelector
                      vehicles={vehicles || []}
                      value={vehicleId}
                      onChange={setVehicleId}
                      placeholder="Select a vehicle..."
                      disabled={loadingVehicles}
                      className="w-full"
                    />
                    {scannedInvoice.invoice.vehicleInfo?.licensePlate && !vehicleId && (
                      <div className="text-sm text-amber-600 bg-amber-50 p-3 rounded border border-amber-200">
                        <span className="font-medium">License plate detected:</span> {displayLicensePlate(scannedInvoice.invoice.vehicleInfo.licensePlate)}
                        <br />
                        <span className="text-xs">No matching vehicle found in your system. Please select manually.</span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Invoice Info */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CheckCircle className="h-5 w-5 text-green-600" />
                    Invoice Information
                  </CardTitle>
                  <CardDescription>
                    Review the extracted invoice details
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                      <Label className="text-sm font-medium text-muted-foreground">Vendor</Label>
                      <p className="font-medium">{scannedInvoice.invoice.vendor}</p>
                    </div>
                    <div>
                      <Label className="text-sm font-medium text-muted-foreground">Invoice Number</Label>
                      <p className="font-medium">{scannedInvoice.invoice.invoiceNumber || 'N/A'}</p>
                    </div>
                    <div>
                      <Label className="text-sm font-medium text-muted-foreground">Date</Label>
                      <p className="font-medium">{scannedInvoice.invoice.invoiceDate}</p>
                    </div>
                    <div>
                      <Label className="text-sm font-medium text-muted-foreground">Total</Label>
                      <p className="font-medium text-lg">{formatCurrency(scannedInvoice.invoice.totalAmount)}</p>
                    </div>
                  </div>

                  {scannedInvoice.invoice.vehicleInfo && (
                    <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                      <Label className="text-sm font-medium text-blue-800">Detected Vehicle Info</Label>
                      <div className="grid grid-cols-2 gap-4 mt-2">
                        {scannedInvoice.invoice.vehicleInfo.licensePlate && (
                          <div>
                            <Label className="text-xs text-blue-600">License Plate</Label>
                            <p className="text-sm font-medium">{displayLicensePlate(scannedInvoice.invoice.vehicleInfo.licensePlate)}</p>
                          </div>
                        )}
                        {scannedInvoice.invoice.vehicleInfo.chassisNumber && (
                          <div>
                            <Label className="text-xs text-blue-600">Chassis Number</Label>
                            <p className="text-sm font-medium">{scannedInvoice.invoice.vehicleInfo.chassisNumber}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Line Items */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>Expense Line Items</CardTitle>
                      <CardDescription>
                        Review and edit the extracted expense items. Select which items to create as expenses.
                      </CardDescription>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Label htmlFor="group-toggle" className="text-sm font-medium">
                        Group by category
                      </Label>
                      <Switch
                        id="group-toggle"
                        checked={groupByCategory}
                        onCheckedChange={toggleGrouping}
                      />
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {editableLineItems.length > 0 ? (
                    <div className="space-y-4">
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id="select-all"
                          checked={selectedItems.size === editableLineItems.length}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setSelectedItems(new Set(editableLineItems.map((_, i) => i)));
                            } else {
                              setSelectedItems(new Set());
                            }
                          }}
                        />
                        <Label htmlFor="select-all" className="text-sm font-medium">
                          Select All ({selectedItems.size}/{editableLineItems.length})
                        </Label>
                      </div>

                      <div className="border rounded-lg overflow-hidden">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-12"></TableHead>
                              <TableHead>Description</TableHead>
                              <TableHead>Amount</TableHead>
                              <TableHead>Category</TableHead>
                              <TableHead className="w-12"></TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {editableLineItems.map((item, index) => (
                              <TableRow key={index}>
                                <TableCell>
                                  <Checkbox
                                    checked={selectedItems.has(index)}
                                    onCheckedChange={() => toggleItemSelection(index)}
                                    data-testid={`checkbox-item-${index}`}
                                  />
                                </TableCell>
                                <TableCell>
                                  <Input
                                    value={item.description}
                                    onChange={(e) => updateLineItem(index, 'description', e.target.value)}
                                    className="min-w-[200px]"
                                    data-testid={`input-description-${index}`}
                                  />
                                </TableCell>
                                <TableCell>
                                  <Input
                                    type="number"
                                    step="0.01"
                                    value={item.amount}
                                    onChange={(e) => updateLineItem(index, 'amount', parseFloat(e.target.value) || 0)}
                                    className="w-24"
                                    data-testid={`input-amount-${index}`}
                                  />
                                </TableCell>
                                <TableCell>
                                  <Select
                                    value={item.category}
                                    onValueChange={(value) => updateLineItem(index, 'category', value)}
                                  >
                                    <SelectTrigger className="w-32" data-testid={`select-category-${index}`}>
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {EXPENSE_CATEGORIES.map(category => (
                                        <SelectItem key={category} value={category}>
                                          {category}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </TableCell>
                                <TableCell>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => removeLineItem(index)}
                                    data-testid={`button-remove-${index}`}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>

                      <div className="flex justify-between items-center pt-4 border-t">
                        <div className="text-sm text-muted-foreground">
                          Total selected: {formatCurrency(
                            sumMoney(
                              editableLineItems.filter((_, index) => selectedItems.has(index)),
                              item => item.amount
                            )
                          )}
                        </div>
                        <div className="flex gap-2">
                          <Button variant="outline" onClick={handleReset}>
                            Start Over
                          </Button>
                          <Button 
                            onClick={handleCreateExpenses}
                            disabled={selectedItems.size === 0 || createExpensesMutation.isPending}
                            data-testid="button-create-expenses"
                          >
                            {createExpensesMutation.isPending ? (
                              <>
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                Creating...
                              </>
                            ) : (
                              <>Create {selectedItems.size} Expense(s)</>
                            )}
                          </Button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <AlertCircle className="h-8 w-8 mx-auto mb-2" />
                      <p>No line items found in the invoice</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}