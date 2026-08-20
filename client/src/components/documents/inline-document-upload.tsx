import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { invalidateRelatedQueries , invalidateByPrefix } from "@/lib/queryClient";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { 
  Form, 
  FormControl, 
  FormDescription, 
  FormField, 
  FormItem, 
  FormLabel, 
  FormMessage 
} from "@/components/ui/form";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatFileSize } from "@/lib/format-utils";

// Document types
const documentTypes = [
  "APK Inspection",
  "Contract",
  "Damage Report",
  "Insurance",
  "Maintenance Record",
  "Receipt",
  "Registration",
  "Vehicle Photos", // Consolidated "Vehicle Picture" and "Damage Photos" into one category
  "Warranty",
  "Tire Replacement",
  "Front Window Replacement",
  "Repair Report",
  "Other"
];

// Maximum file size (5 MB)
const MAX_FILE_SIZE = 5 * 1024 * 1024;

// Allowed file types
const ACCEPTED_FILE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain"
];

// Extended schema with validation
const formSchema = z.object({
  vehicleId: z.number({
    required_error: "Vehicle ID is required",
  }),
  documentType: z.string().min(1, "Document type is required"),
  file: z
    .instanceof(File)
    .refine((file) => file.size <= MAX_FILE_SIZE, {
      message: `File size must be less than ${formatFileSize(MAX_FILE_SIZE)}.`,
    })
    .refine((file) => ACCEPTED_FILE_TYPES.includes(file.type), {
      message: "File type not supported.",
    }),
  notes: z.string().optional(),
  apkDate: z.string().optional(), // Optional APK date for APK Inspection documents
});

interface InlineDocumentUploadProps {
  vehicleId: number;
  reservationId?: number;
  onSuccess?: () => void;
  preselectedType?: string;
  children?: React.ReactNode;
}

export function InlineDocumentUpload({ vehicleId, reservationId, onSuccess, preselectedType, children }: InlineDocumentUploadProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  
  // Setup form
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      vehicleId: vehicleId,
      documentType: preselectedType || "",
      notes: "",
      apkDate: "",
    },
  });

  // Watch document type to show/hide APK date field
  const documentType = form.watch("documentType");

  // Update document type when preselectedType changes
  useEffect(() => {
    if (preselectedType) {
      form.setValue("documentType", preselectedType);
    }
  }, [preselectedType, form]);

  // Handle file selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    
    if (file) {
      setSelectedFile(file);
      form.setValue("file", file);
      
      // Create a preview for image files
      if (file.type.startsWith("image/")) {
        const reader = new FileReader();
        reader.onloadend = () => {
          setPreviewUrl(reader.result as string);
        };
        reader.readAsDataURL(file);
      } else {
        setPreviewUrl(null);
      }
    }
  };
  
  const uploadDocumentMutation = useMutation({
    mutationFn: async (data: z.infer<typeof formSchema>) => {
      const formData = new FormData();
      formData.append("vehicleId", data.vehicleId.toString());
      formData.append("documentType", data.documentType);
      formData.append("file", data.file);
      formData.append("createdBy", localStorage.getItem("userName") || "User");
      
      if (reservationId) {
        formData.append("reservationId", reservationId.toString());
      }
      
      if (data.notes) {
        formData.append("notes", data.notes);
      }
      
      // Include APK date if provided for APK Inspection documents
      if (data.apkDate) {
        formData.append("apkDate", data.apkDate);
      }
      
      return await fetch("/api/documents", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
    },
    onSuccess: async () => {
      // Use invalidateRelatedQueries to refresh all related data
      invalidateRelatedQueries('documents');
      if (vehicleId) {
        invalidateRelatedQueries('vehicles', { id: vehicleId });
      }
      if (reservationId) {
        invalidateByPrefix(`/api/documents/reservation/${reservationId}`);
        invalidateRelatedQueries('reservations', { id: reservationId });
      }
      
      // Show success message
      toast({
        title: "Document uploaded successfully",
        description: "The document has been added to the system.",
      });
      
      // Close dialog and reset form
      setIsOpen(false);
      setSelectedFile(null);
      setPreviewUrl(null);
      form.reset({
        vehicleId: vehicleId,
        documentType: preselectedType || "",
        notes: "",
        apkDate: "",
      });
      
      // Call onSuccess callback if provided
      if (onSuccess) {
        onSuccess();
      }
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Failed to upload document: ${error.message}`,
        variant: "destructive",
      });
    },
  });
  
  const onSubmit = (data: z.infer<typeof formSchema>) => {
    uploadDocumentMutation.mutate(data);
  };

  // Handle dialog open/close
  const handleDialogChange = (open: boolean) => {
    setIsOpen(open);
    // If the dialog is closing, reset form but keep the preselected document type
    if (!open) {
      setSelectedFile(null);
      setPreviewUrl(null);
      form.reset({
        vehicleId: vehicleId,
        documentType: preselectedType || "",
        notes: "",
      });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleDialogChange}>
      <DialogTrigger asChild>
        {children ? (
          <div className="cursor-pointer" onClick={() => setIsOpen(true)}>
            {children}
          </div>
        ) : (
          <Button size="sm">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-upload mr-2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" x2="12" y1="3" y2="15" />
            </svg>
            Upload Document
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Upload Document</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {/* Document Type */}
            <FormField
              control={form.control}
              name="documentType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Document Type</FormLabel>
                  <Select 
                    onValueChange={field.onChange} 
                    defaultValue={field.value}
                    value={field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select document type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {documentTypes.map((type) => (
                        <SelectItem key={type} value={type}>
                          {type}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            {/* File Upload */}
            <FormField
              control={form.control}
              name="file"
              render={({ field: { value, onChange, ...field } }) => (
                <FormItem>
                  <FormLabel>File</FormLabel>
                  <FormControl>
                    <div className="flex flex-col space-y-2">
                      <Input 
                        type="file" 
                        accept={ACCEPTED_FILE_TYPES.join(",")}
                        onChange={handleFileChange}
                        {...field}
                      />
                      {selectedFile && (
                        <p className="text-sm text-gray-500">
                          Selected: {selectedFile.name} ({formatFileSize(selectedFile.size)})
                        </p>
                      )}
                    </div>
                  </FormControl>
                  <FormDescription>
                    Supported file types: PDF, Word, Excel, images, and text files. Maximum size: 5MB.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            {/* Preview if it's an image */}
            {previewUrl && (
              <div>
                <FormLabel>Preview</FormLabel>
                <div className="mt-2 max-w-full overflow-hidden border rounded-md">
                  <img 
                    src={previewUrl} 
                    alt="File preview" 
                    className="max-w-full h-auto object-contain"
                    style={{ maxHeight: '200px' }}
                  />
                </div>
              </div>
            )}
            
            {/* APK Date - only shown for APK Inspection documents */}
            {documentType === "APK Inspection" && (
              <FormField
                control={form.control}
                name="apkDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>New APK Expiration Date</FormLabel>
                    <FormControl>
                      <Input 
                        type="date" 
                        {...field} 
                        data-testid="input-apk-date"
                      />
                    </FormControl>
                    <FormDescription>
                      Update the vehicle's APK expiration date (optional)
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
            
            {/* Notes */}
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes (Optional)</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="Any additional notes about this document" 
                      className="min-h-[80px]"
                      {...field} 
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <div className="flex justify-end space-x-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={uploadDocumentMutation.isPending || !selectedFile}
              >
                {uploadDocumentMutation.isPending ? (
                  <span className="flex items-center">
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Uploading...
                  </span>
                ) : (
                  "Upload Document"
                )}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}