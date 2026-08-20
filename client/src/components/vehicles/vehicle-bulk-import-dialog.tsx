import { useState, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { FileText, Check, X, AlertCircle, Upload, UploadCloud, Download, ArrowLeft } from "lucide-react";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { apiRequest , invalidateByPrefix } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import * as XLSX from "xlsx";

// Dutch to English header mapping - covers many variations
const HEADER_MAPPING: Record<string, string> = {
  // License plate variations
  'kenteken': 'licensePlate',
  'kent': 'licensePlate',
  'license plate': 'licensePlate',
  'licenseplate': 'licensePlate',
  'nummerplaat': 'licensePlate',
  'registratie': 'licensePlate',
  'reg': 'licensePlate',
  'plate': 'licensePlate',
  
  // Brand + Model combined (will be split later)
  'merk & type': 'brandAndModel',
  'merk en type': 'brandAndModel',
  'merk/type': 'brandAndModel',
  'merk en model': 'brandAndModel',
  'merk & model': 'brandAndModel',
  
  // Brand variations
  'merk': 'brand',
  'brand': 'brand',
  'fabrikant': 'brand',
  'make': 'brand',
  
  // Model variations
  'model': 'model',
  'type': 'model',
  'uitvoering': 'model',
  
  // Vehicle type variations
  'voertuigsoort': 'vehicleType',
  'vehicle type': 'vehicleType',
  'vehicletype': 'vehicleType',
  'soort': 'vehicleType',
  'voertuig': 'vehicleType',
  'categorie': 'vehicleType',
  
  // Fuel variations
  'brandstof': 'fuel',
  'fuel': 'fuel',
  'brandstofsoort': 'fuel',
  'diesel/benzine': 'fuel',
  'diesel / benzine': 'fuel',
  
  // Company/BV variations
  'bedrijf': 'company',
  'company': 'company',
  'firma': 'company',
  'bv': 'company',
  'onderneming': 'company',
  'bv / opnaam': 'registeredTo',
  'bv/opnaam': 'registeredTo',
  'bv /opnaam': 'registeredTo',
  
  // Registered to variations
  'op naam': 'registeredTo',
  'opnaam': 'registeredTo',
  'op_naam': 'registeredTo',
  'registered to': 'registeredTo',
  'registeredto': 'registeredTo',
  'tenaamstelling': 'registeredTo',
  
  // Chassis number variations
  'chassisnummer': 'chassisNumber',
  'chassis': 'chassisNumber',
  'vin': 'chassisNumber',
  'chassis number': 'chassisNumber',
  'chassisnr': 'chassisNumber',
  
  // APK date variations
  'apk tot': 'apkDate',
  'apk': 'apkDate',
  'apk datum': 'apkDate',
  'apk date': 'apkDate',
  'apk vervaldatum': 'apkDate',
  
  // GPS variations
  'gps': 'gps',
  
  // Roadside assistance
  'pechhulp': 'roadsideAssistance',
  'roadside assistance': 'roadsideAssistance',
  'wegenwacht': 'roadsideAssistance',
  
  // Spare key
  'reservesleutel': 'spareKey',
  'spare key': 'spareKey',
  'extra sleutel': 'spareKey',
  
  // Winter tires
  'winter b.': 'winterTires',
  'winterbanden': 'winterTires',
  'winter tires': 'winterTires',
  'winterbanden aanwezig': 'winterTires',
  
  // Tire size
  'bandenmaat': 'tireSize',
  'tire size': 'tireSize',
  'tiresize': 'tireSize',
  'banden maat': 'tireSize',
  
  // EuroZone
  'eurozone': 'euroZone',
  'euro zone': 'euroZone',
  'euro': 'euroZone',
  
  // Internal appointments/notes
  'afspraken intern.': 'internalAppointments',
  'afspraken intern': 'internalAppointments',
  'interne afspraken': 'internalAppointments',
  'internal appointments': 'internalAppointments',
  
  // BV/Opnaam date
  'bv /opnaam datum': 'companyDate',
  'bv/opnaam datum': 'companyDate',
  'bv / opnaam datum': 'companyDate',
  
  // Production date variations
  'productie datum': 'productionDate',
  'productiedatum': 'productionDate',
  'production date': 'productionDate',
  'productiondate': 'productionDate',
  'bouwjaar': 'productionDate',
  'bouw jaar': 'productionDate',
  'jaar': 'productionDate',
  'year': 'productionDate',
  'datum eerste toelating': 'productionDate',
  'eerste toelating': 'productionDate',
  
  // Notes/remarks
  'notes': 'remarks',
  'opmerkingen': 'remarks',
  'remarks': 'remarks',
  'notities': 'remarks',
  'algemene info per auto': 'generalInfo',
};

// Display names for preview table
const DISPLAY_NAMES: Record<string, string> = {
  'licensePlate': 'License Plate',
  'brand': 'Brand',
  'model': 'Model',
  'brandAndModel': 'Brand & Model',
  'vehicleType': 'Vehicle Type',
  'fuel': 'Fuel',
  'company': 'Company',
  'registeredTo': 'BV/Opnaam',
  'companyDate': 'BV/Opnaam Date',
  'chassisNumber': 'Chassis Number',
  'apkDate': 'APK Date',
  'gps': 'GPS',
  'euroZone': 'EuroZone',
  'roadsideAssistance': 'Roadside Assistance',
  'spareKey': 'Spare Key',
  'winterTires': 'Winter Tires',
  'tireSize': 'Tire Size',
  'productionDate': 'Production Date',
  'internalAppointments': 'Internal Notes',
  'remarks': 'Remarks',
  'generalInfo': 'General Info',
};

// Form schema for license plate input
const licensePlateFormSchema = z.object({
  licensePlates: z.string().min(1, "Please enter at least one license plate"),
});

type LicensePlateFormValues = z.infer<typeof licensePlateFormSchema>;

interface ParsedVehicle {
  licensePlate?: string;
  brand?: string;
  model?: string;
  vehicleType?: string;
  fuel?: string;
  company?: string;
  registeredTo?: string;
  chassisNumber?: string;
  productionDate?: string;
  _isValid?: boolean;
  _errors?: string[];
  [key: string]: string | boolean | string[] | undefined;
}

interface VehicleBulkImportDialogProps {
  children?: React.ReactNode;
  onSuccess?: () => void;
}

export function VehicleBulkImportDialog({ children, onSuccess }: VehicleBulkImportDialogProps) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("manual");
  const [importProgress, setImportProgress] = useState(0);
  const [importResults, setImportResults] = useState<{
    imported: any[];
    failed: any[];
  } | null>(null);
  
  // CSV preview state
  const [csvPreviewData, setCsvPreviewData] = useState<ParsedVehicle[] | null>(null);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form for license plate input
  const licensePlateForm = useForm<LicensePlateFormValues>({
    resolver: zodResolver(licensePlateFormSchema),
    defaultValues: {
      licensePlates: "",
    },
  });

  // Reset dialog state when closing
  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    if (!newOpen) {
      setImportResults(null);
      setImportProgress(0);
      licensePlateForm.reset();
      setCsvPreviewData(null);
      setCsvHeaders([]);
      setSelectedFile(null);
      setActiveTab("manual");
    }
  };

  // Helper function to convert Excel serial date to ISO date string
  const convertExcelDate = (value: any): string | null => {
    if (value === null || value === undefined || value === '') return null;
    
    // If it's already a Date object (from XLSX with cellDates: true)
    if (value instanceof Date && !isNaN(value.getTime())) {
      return value.toISOString().split('T')[0];
    }
    
    // If it's a number (Excel serial date)
    if (typeof value === 'number') {
      // Excel dates start from January 1, 1900 (serial 1)
      // Excel incorrectly treats 1900 as a leap year, so we use Dec 30, 1899 as epoch
      const excelEpoch = new Date(1899, 11, 30); // Dec 30, 1899
      const date = new Date(excelEpoch.getTime() + value * 24 * 60 * 60 * 1000);
      if (!isNaN(date.getTime())) {
        console.log(`Converted Excel serial number ${value} to date ${date.toISOString().split('T')[0]}`);
        return date.toISOString().split('T')[0];
      }
    }
    
    // If it's a string that looks like an Excel serial number (5 digits)
    const strValue = String(value).trim();
    if (/^\d{5}$/.test(strValue)) {
      const serial = parseInt(strValue, 10);
      const excelEpoch = new Date(1899, 11, 30);
      const date = new Date(excelEpoch.getTime() + serial * 24 * 60 * 60 * 1000);
      if (!isNaN(date.getTime())) {
        console.log(`Converted Excel serial string ${strValue} to date ${date.toISOString().split('T')[0]}`);
        return date.toISOString().split('T')[0];
      }
    }
    
    // Try parsing as a regular date string (handles dd/mm/yyyy, dd-mm-yyyy, etc.)
    // First try Dutch format (dd/mm/yyyy or dd-mm-yyyy)
    const dutchMatch = strValue.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
    if (dutchMatch) {
      const day = parseInt(dutchMatch[1], 10);
      const month = parseInt(dutchMatch[2], 10) - 1; // JavaScript months are 0-indexed
      let year = parseInt(dutchMatch[3], 10);
      if (year < 100) year += 2000; // Convert 24 to 2024
      const date = new Date(year, month, day);
      if (!isNaN(date.getTime())) {
        console.log(`Converted Dutch date ${strValue} to ${date.toISOString().split('T')[0]}`);
        return date.toISOString().split('T')[0];
      }
    }
    
    // Return original string if it already looks like a valid date
    if (/^\d{4}-\d{2}-\d{2}$/.test(strValue)) {
      return strValue;
    }
    
    // Return null if not a recognizable date format
    return null;
  };

  // List of date fields that need conversion
  const DATE_FIELDS = ['apkDate', 'companyDate', 'productionDate', 'registeredToDate'];

  // Validate and process rows from either CSV or XLSX
  const processRows = (rawHeaders: string[], rows: any[][]): { headers: string[], data: ParsedVehicle[], invalidCount: number } => {
    // Map Dutch headers to English field names
    const mappedHeaders = rawHeaders.map(header => {
      const normalized = String(header || '').toLowerCase().trim();
      return HEADER_MAPPING[normalized] || normalized;
    });

    const data: ParsedVehicle[] = [];
    let invalidCount = 0;
    
    for (const values of rows) {
      if (values.length === 0 || (values.length === 1 && !values[0])) continue;
      
      const row: ParsedVehicle = {};
      mappedHeaders.forEach((header, index) => {
        const value = values[index];
        if (value !== undefined && value !== null && value !== '') {
          // Check if this is a date field that needs conversion
          if (DATE_FIELDS.includes(header)) {
            const convertedDate = convertExcelDate(value);
            if (convertedDate) {
              row[header] = convertedDate;
              console.log(`Date field ${header}: raw value "${value}" -> converted "${convertedDate}"`);
            } else {
              // Store the original value if we couldn't convert it
              row[header] = String(value).trim();
              console.log(`Date field ${header}: could not convert "${value}", keeping as-is`);
            }
          } else {
            row[header] = String(value).trim();
          }
        }
      });
      
      // Handle combined brand & model field - split into separate fields
      if (row.brandAndModel && !row.brand) {
        const combined = String(row.brandAndModel);
        // Try to split on first space - brand is usually first word
        const parts = combined.split(/\s+/);
        if (parts.length >= 2) {
          row.brand = parts[0];
          row.model = parts.slice(1).join(' ');
        } else {
          row.brand = combined;
          row.model = '';
        }
      }
      
      // Extract tire size from remarks or generalInfo field (patterns like 165/65/R14, 205/55R16, etc.)
      if (!row.tireSize) {
        const textToSearch = [row.remarks, row.generalInfo, row.internalAppointments].filter(Boolean).join(' ');
        if (textToSearch) {
          // Match tire size patterns: 165/65/R14, 205/55R16, 185/60 R15, 165/65R14, etc.
          const tireSizePattern = /\b(\d{3}\/\d{2,3}\s*\/?R?\s*\d{2})\b/i;
          const match = textToSearch.match(tireSizePattern);
          if (match) {
            row.tireSize = match[1].replace(/\s+/g, '').toUpperCase();
            console.log(`Extracted tire size "${row.tireSize}" from text`);
            
            // Clean up the source fields by removing the tire size and related words
            const cleanupField = (text: string | undefined): string => {
              if (!text) return '';
              let cleaned = text
                // Remove the tire size pattern
                .replace(tireSizePattern, '')
                // Remove Dutch tire-related words (case insensitive)
                .replace(/\bbandenm(aa)?t\.?\b/gi, '')
                .replace(/\bbandenmaat\b/gi, '')
                .replace(/\bbandenmt\b/gi, '')
                .replace(/\bbanden\s*maat\b/gi, '')
                .replace(/\btire\s*size\b/gi, '')
                // Clean up extra whitespace and punctuation
                .replace(/\s*[:\-,;]\s*$/g, '')
                .replace(/^\s*[:\-,;]\s*/g, '')
                .replace(/\s+/g, ' ')
                .trim();
              return cleaned;
            };
            
            // Apply cleanup to the fields where we searched
            if (row.remarks && typeof row.remarks === 'string') {
              row.remarks = cleanupField(row.remarks);
            }
            if (row.generalInfo && typeof row.generalInfo === 'string') {
              row.generalInfo = cleanupField(row.generalInfo);
            }
            if (row.internalAppointments && typeof row.internalAppointments === 'string') {
              row.internalAppointments = cleanupField(row.internalAppointments);
            }
          }
        }
      }
      
      // Validate row
      const errors: string[] = [];
      if (!row.licensePlate) {
        errors.push("Missing license plate");
      }
      
      row._isValid = errors.length === 0;
      row._errors = errors;
      
      if (!row._isValid) {
        invalidCount++;
      }
      
      // Include all rows (even invalid ones) so user can see what's wrong
      if (row.licensePlate || Object.keys(row).filter(k => !k.startsWith('_')).length > 0) {
        data.push(row);
      }
    }

    // Build headers list from mapped headers + any dynamically extracted fields
    let headers = mappedHeaders.filter(h => Object.keys(DISPLAY_NAMES).includes(h));
    
    // Check if any rows have extracted tireSize and add to headers if so
    const hasTireSize = data.some(row => row.tireSize);
    if (hasTireSize && !headers.includes('tireSize')) {
      // Insert tireSize after winterTires if present, otherwise at end
      const winterTiresIndex = headers.indexOf('winterTires');
      if (winterTiresIndex >= 0) {
        headers.splice(winterTiresIndex + 1, 0, 'tireSize');
      } else {
        headers.push('tireSize');
      }
    }
    
    return { 
      headers, 
      data,
      invalidCount 
    };
  };

  // Parse CSV content
  const parseCSV = (content: string): { headers: string[], data: ParsedVehicle[], invalidCount: number } => {
    const lines = content.split(/\r?\n/).filter(line => line.trim() !== '');
    if (lines.length < 2) {
      return { headers: [], data: [], invalidCount: 0 };
    }

    // Parse header row - handle both comma and semicolon delimiters
    const delimiter = lines[0].includes(';') ? ';' : ',';
    const rawHeaders = lines[0].split(delimiter).map(h => h.trim().replace(/"/g, ''));
    
    // Parse data rows
    const rows: string[][] = [];
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(delimiter).map(v => v.trim().replace(/"/g, ''));
      rows.push(values);
    }

    return processRows(rawHeaders, rows);
  };

  // Parse XLSX content
  const parseXLSX = (arrayBuffer: ArrayBuffer): { headers: string[], data: ParsedVehicle[], invalidCount: number } => {
    try {
      const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      
      console.log("XLSX Sheet names:", workbook.SheetNames);
      console.log("Using sheet:", firstSheetName);
      
      // Convert to array of arrays with raw values
      const sheetData: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false, dateNF: 'yyyy-mm-dd' });
      
      console.log("XLSX first row (headers):", sheetData[0]);
      console.log("XLSX total rows:", sheetData.length);
      
      // Log first 5 data rows to debug
      for (let i = 1; i <= Math.min(5, sheetData.length - 1); i++) {
        console.log(`XLSX data row ${i}:`, sheetData[i]);
      }
      
      if (sheetData.length < 2) {
        return { headers: [], data: [], invalidCount: 0 };
      }
      
      const rawHeaders = sheetData[0].map(h => String(h || '').trim());
      
      // Filter out completely empty rows
      const dataRows = sheetData.slice(1).filter(row => {
        if (!Array.isArray(row)) return false;
        // Check if row has at least one non-empty cell
        return row.some(cell => cell !== undefined && cell !== null && cell !== '');
      });
      
      console.log(`XLSX filtered data rows (non-empty): ${dataRows.length}`);
      if (dataRows[0]) {
        console.log("First non-empty data row:", dataRows[0]);
      }
      console.log("Raw headers found:", rawHeaders);
      
      // Show which headers are mapped
      rawHeaders.forEach(h => {
        const normalized = h.toLowerCase().trim();
        const mapped = HEADER_MAPPING[normalized];
        console.log(`Header "${h}" -> normalized "${normalized}" -> mapped to "${mapped || 'NOT MAPPED'}"`);
      });
      
      return processRows(rawHeaders, dataRows);
    } catch (error) {
      console.error("Error parsing XLSX:", error);
      return { headers: [], data: [], invalidCount: 0 };
    }
  };

  // Handle file selection
  const handleFileSelect = (file: File) => {
    setSelectedFile(file);
    const isExcel = file.name.endsWith('.xlsx') || file.name.endsWith('.xls');
    
    const reader = new FileReader();
    reader.onload = (e) => {
      let result: { headers: string[], data: ParsedVehicle[], invalidCount: number };
      
      if (isExcel) {
        const arrayBuffer = e.target?.result as ArrayBuffer;
        result = parseXLSX(arrayBuffer);
      } else {
        const content = e.target?.result as string;
        result = parseCSV(content);
      }
      
      const { headers, data, invalidCount } = result;
      
      if (data.length === 0) {
        toast({
          title: "Invalid File",
          description: "No valid vehicle data found. Make sure the first row contains headers and subsequent rows contain data.",
          variant: "destructive",
        });
        return;
      }
      
      setCsvHeaders(headers);
      setCsvPreviewData(data);
      
      const validCount = data.length - invalidCount;
      if (invalidCount > 0) {
        toast({
          title: "File Loaded with Warnings",
          description: `Found ${validCount} valid vehicles and ${invalidCount} rows with errors.`,
          variant: "destructive",
        });
      } else {
        toast({
          title: "File Loaded",
          description: `Found ${data.length} vehicles ready for import.`,
        });
      }
    };
    
    if (isExcel) {
      reader.readAsArrayBuffer(file);
    } else {
      reader.readAsText(file);
    }
  };

  // Handle license plate bulk import
  const importMutation = useMutation({
    mutationFn: async (licensePlates: string[]) => {
      const response = await apiRequest("POST", "/api/vehicles/bulk-import-plates", { licensePlates });
      return response.json();
    },
    onSuccess: (data: { imported: any[], failed: any[] }) => {
      invalidateByPrefix("/api/vehicles");
      setImportResults(data);
      toast({
        title: "Import Complete",
        description: `Successfully imported ${data.imported.length} vehicles. ${data.failed.length} failed.`,
        variant: data.failed.length > 0 ? "destructive" : "default",
      });
      
      if (onSuccess) {
        onSuccess();
      }
    },
    onError: (error) => {
      toast({
        title: "Import Failed",
        description: "An error occurred during the import process. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Handle CSV bulk import
  const csvImportMutation = useMutation({
    mutationFn: async (vehicles: ParsedVehicle[]) => {
      const response = await apiRequest("POST", "/api/vehicles/bulk-import-csv", { vehicles });
      return response.json();
    },
    onSuccess: (data: { imported: any[], failed: any[] }) => {
      invalidateByPrefix("/api/vehicles");
      setImportResults(data);
      setCsvPreviewData(null);
      setCsvHeaders([]);
      setSelectedFile(null);
      toast({
        title: "Import Complete",
        description: `Successfully imported ${data.imported.length} vehicles. ${data.failed.length} failed.`,
        variant: data.failed.length > 0 ? "destructive" : "default",
      });
      
      if (onSuccess) {
        onSuccess();
      }
    },
    onError: (error) => {
      toast({
        title: "Import Failed",
        description: "An error occurred during the CSV import process. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Handle license plate form submission
  const onSubmitLicensePlates = (values: LicensePlateFormValues) => {
    setImportResults(null);
    setImportProgress(0);
    
    // Parse license plates (handles both comma-separated and line-by-line)
    const licensePlatesText = values.licensePlates;
    const licensePlates = licensePlatesText
      .split(/[\n,]/)
      .map((plate) => plate.trim())
      .filter((plate) => plate !== "");
    
    if (licensePlates.length === 0) {
      toast({
        title: "No License Plates Found",
        description: "Please enter at least one valid license plate.",
        variant: "destructive",
      });
      return;
    }

    // Start the import process
    setImportProgress(5);
    importMutation.mutate(licensePlates);
  };

  // Handle CSV import confirmation - only import valid rows
  const handleConfirmCsvImport = () => {
    if (!csvPreviewData || csvPreviewData.length === 0) return;
    
    // Filter to only valid rows and remove internal validation fields
    const validVehicles = csvPreviewData
      .filter(v => v._isValid !== false)
      .map(({ _isValid, _errors, ...vehicle }) => vehicle);
    
    if (validVehicles.length === 0) {
      toast({
        title: "No Valid Vehicles",
        description: "All rows have validation errors. Please fix them and try again.",
        variant: "destructive",
      });
      return;
    }
    
    csvImportMutation.mutate(validVehicles);
  };
  
  // Count valid vehicles for button display
  const validVehicleCount = csvPreviewData?.filter(v => v._isValid !== false).length || 0;

  // Clear preview and go back to upload
  const handleClearPreview = () => {
    setCsvPreviewData(null);
    setCsvHeaders([]);
    setSelectedFile(null);
  };

  // Custom trigger or default bulk import button
  const trigger = children || (
    <Button variant="outline" data-testid="button-bulk-import">
      <Download className="mr-2 h-4 w-4" />
      Bulk Import
    </Button>
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {trigger}
      </DialogTrigger>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Bulk Import Vehicles</DialogTitle>
          <DialogDescription>
            Import multiple vehicles at once using license plates or CSV file
          </DialogDescription>
        </DialogHeader>
        
        <div className="mt-4">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="w-full grid grid-cols-2 mb-6">
              <TabsTrigger value="manual">
                <FileText className="mr-2 h-4 w-4" />
                Manual Entry
              </TabsTrigger>
              <TabsTrigger value="csv">
                <UploadCloud className="mr-2 h-4 w-4" />
                CSV Upload
              </TabsTrigger>
            </TabsList>

            <TabsContent value="manual">
              <Card>
                <CardHeader>
                  <CardTitle>Enter License Plates</CardTitle>
                  <CardDescription>
                    Enter one license plate per line, or separate them with commas.
                    Vehicle data will be automatically fetched from the RDW database.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Form {...licensePlateForm}>
                    <form onSubmit={licensePlateForm.handleSubmit(onSubmitLicensePlates)} className="space-y-4">
                      <FormField
                        control={licensePlateForm.control}
                        name="licensePlates"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>License Plates</FormLabel>
                            <FormControl>
                              <Textarea
                                placeholder="Enter license plates here, one per line or comma-separated. E.g.&#10;AA-BB-12&#10;XY-12-ZZ&#10;12-ABC-3"
                                rows={6}
                                {...field}
                              />
                            </FormControl>
                            <FormDescription>
                              Example formats: "AA-BB-12" or "AABB12" or "12-ABC-3"
                            </FormDescription>
                          </FormItem>
                        )}
                      />
                      <Button 
                        type="submit" 
                        className="w-full"
                        disabled={importMutation.isPending}
                        data-testid="button-start-import"
                      >
                        {importMutation.isPending ? (
                          <>Processing Import...</>
                        ) : (
                          <>Start Import</>
                        )}
                      </Button>
                    </form>
                  </Form>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="csv">
              {!csvPreviewData ? (
                <Card>
                  <CardHeader>
                    <CardTitle>Upload File</CardTitle>
                    <CardDescription>
                      Upload a CSV or Excel file with vehicle data. The first row should contain headers (e.g., Kenteken, Merk, Model, etc.)
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div 
                      className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center cursor-pointer hover:border-gray-400 transition-colors"
                      onClick={() => fileInputRef.current?.click()}
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const file = e.dataTransfer.files?.[0];
                        if (file && (file.name.endsWith('.csv') || file.name.endsWith('.xlsx') || file.name.endsWith('.xls'))) {
                          handleFileSelect(file);
                        }
                      }}
                    >
                      <Upload className="mx-auto h-8 w-8 text-gray-400" />
                      <h3 className="mt-2 text-sm font-semibold">Drag and drop your file here</h3>
                      <p className="text-xs text-gray-500 mt-1">Supports CSV and Excel (.xlsx, .xls) files</p>
                      <input
                        ref={fileInputRef}
                        type="file"
                        className="hidden"
                        accept=".csv,.xlsx,.xls"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            handleFileSelect(file);
                          }
                        }}
                        data-testid="input-csv-file"
                      />
                      <Button 
                        type="button" 
                        variant="outline" 
                        className="mt-4"
                        onClick={(e) => {
                          e.stopPropagation();
                          fileInputRef.current?.click();
                        }}
                        data-testid="button-browse-files"
                      >
                        Browse Files
                      </Button>
                    </div>
                    
                    <div className="mt-4 p-4 bg-gray-50 rounded-md">
                      <h4 className="text-sm font-medium mb-2">Expected CSV Format:</h4>
                      <p className="text-xs text-gray-600">
                        First row: Headers (Kenteken, Merk, Model, Voertuigsoort, Brandstof, Bedrijf, Op naam, Chassisnummer, Productie datum)
                      </p>
                      <p className="text-xs text-gray-600 mt-1">
                        Following rows: Vehicle data
                      </p>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="flex items-center gap-2">
                          Preview Import Data
                          <Badge variant="secondary">{csvPreviewData.length} vehicles</Badge>
                        </CardTitle>
                        <CardDescription>
                          Review the data below before confirming the import
                          {selectedFile && <span className="ml-2 text-xs">({selectedFile.name})</span>}
                        </CardDescription>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleClearPreview}
                        data-testid="button-back-to-upload"
                      >
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        Back
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-[300px] rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-[50px]">#</TableHead>
                            {csvHeaders.map((header) => (
                              <TableHead key={header}>
                                {DISPLAY_NAMES[header] || header}
                              </TableHead>
                            ))}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {csvPreviewData.map((vehicle, index) => (
                            <TableRow key={index} className={vehicle._isValid === false ? 'bg-red-50' : ''}>
                              <TableCell className="font-medium">
                                <div className="flex items-center gap-2">
                                  {index + 1}
                                  {vehicle._isValid === false && (
                                    <AlertCircle className="h-4 w-4 text-red-500" title={vehicle._errors?.join(', ')} />
                                  )}
                                </div>
                              </TableCell>
                              {csvHeaders.map((header) => (
                                <TableCell key={header} className={header === 'licensePlate' && !vehicle[header] ? 'text-red-500' : ''}>
                                  {String(vehicle[header] || '-')}
                                </TableCell>
                              ))}
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </ScrollArea>
                    
                    <div className="flex gap-4 mt-4">
                      <Button
                        variant="outline"
                        className="flex-1"
                        onClick={handleClearPreview}
                        disabled={csvImportMutation.isPending}
                      >
                        Cancel
                      </Button>
                      <Button
                        className="flex-1"
                        onClick={handleConfirmCsvImport}
                        disabled={csvImportMutation.isPending || validVehicleCount === 0}
                        data-testid="button-confirm-csv-import"
                      >
                        {csvImportMutation.isPending ? (
                          <>Processing Import...</>
                        ) : validVehicleCount === 0 ? (
                          <>No Valid Vehicles to Import</>
                        ) : (
                          <>Confirm Import ({validVehicleCount} vehicles)</>
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}
            </TabsContent>
          </Tabs>

          {(importMutation.isPending || csvImportMutation.isPending) && (
            <Card className="mt-6">
              <CardHeader>
                <CardTitle>Import Progress</CardTitle>
              </CardHeader>
              <CardContent>
                <Progress value={importProgress} className="h-2" />
                <p className="text-center mt-2 text-sm text-gray-500">
                  Processing vehicle data...
                </p>
              </CardContent>
            </Card>
          )}

          {importResults && (
            <Card className="mt-6">
              <CardHeader>
                <CardTitle>Import Results</CardTitle>
                <CardDescription>
                  {importResults.imported.length} vehicles imported successfully, {importResults.failed.length} failed
                </CardDescription>
              </CardHeader>
              <CardContent>
                {importResults.imported.length > 0 && (
                  <>
                    <h3 className="text-md font-medium flex items-center mb-2">
                      <Check className="h-5 w-5 mr-2 text-green-500" />
                      Successfully Imported ({importResults.imported.length})
                    </h3>
                    <div className="bg-gray-50 p-4 rounded-md mb-6 max-h-32 overflow-y-auto">
                      <ul className="space-y-1">
                        {importResults.imported.map((item, index) => (
                          <li key={`success-${index}`} className="text-sm flex items-center">
                            <Check className="h-4 w-4 mr-2 text-green-500" />
                            {item.licensePlate} - {item.vehicle?.brand || item.brand} {item.vehicle?.model || item.model}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </>
                )}

                {importResults.failed.length > 0 && (
                  <>
                    <h3 className="text-md font-medium flex items-center mb-2">
                      <X className="h-5 w-5 mr-2 text-red-500" />
                      Failed Imports ({importResults.failed.length})
                    </h3>
                    <div className="bg-red-50 p-4 rounded-md max-h-32 overflow-y-auto">
                      <ul className="space-y-1">
                        {importResults.failed.map((item, index) => (
                          <li key={`failed-${index}`} className="text-sm flex items-baseline">
                            <AlertCircle className="h-4 w-4 mr-2 text-red-500" />
                            <div>
                              <span className="font-medium">{item.licensePlate}</span> - {item.error}
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
