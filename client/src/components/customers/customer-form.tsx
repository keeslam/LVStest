import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest, invalidateRelatedQueries } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { insertCustomerSchema } from "@shared/schema";
import { useLocation } from "wouter";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { capitalizeName, capitalizeWords } from "@/lib/format-utils";

// Extended schema with validation
const formSchema = insertCustomerSchema.extend({
  name: z.string().min(2, "Name must be at least 2 characters."),
  // Make all fields optional with empty string fallback
  email: z.string().email("Invalid email address when provided").optional().or(z.literal("")),
  phone: z.string().optional().or(z.literal("")),
  debtorNumber: z.string().optional().or(z.literal("")),
  firstName: z.string().optional().or(z.literal("")),
  lastName: z.string().optional().or(z.literal("")),
  companyName: z.string().optional().or(z.literal("")),
  driverName: z.string().optional().or(z.literal("")),
  contactPerson: z.string().optional().or(z.literal("")),
  emailForMOT: z.string().email("Invalid email address when provided").optional().or(z.literal("")),
  emailForInvoices: z.string().email("Invalid email address when provided").optional().or(z.literal("")),
  emailGeneral: z.string().email("Invalid email address when provided").optional().or(z.literal("")),
  driverPhone: z.string().optional().or(z.literal("")),
  streetName: z.string().optional().or(z.literal("")),
  address: z.string().optional().or(z.literal("")),
  city: z.string().optional().or(z.literal("")),
  postalCode: z.string().optional().or(z.literal("")),
  country: z.string().optional().or(z.literal("")),
  driverLicenseNumber: z.string().optional().or(z.literal("")),
  chamberOfCommerceNumber: z.string().optional().or(z.literal("")),
  rsin: z.string().optional().or(z.literal("")),
  vatNumber: z.string().optional().or(z.literal("")),
  status: z.string().optional().or(z.literal("")),
  statusDate: z.string().optional().or(z.literal("")),
  notes: z.string().optional().or(z.literal("")),
  // Corporate/Business fields
  customerType: z.string().optional().or(z.literal("business")),
  accountManager: z.string().optional().or(z.literal("")),
  billingAddress: z.string().optional().or(z.literal("")),
  billingCity: z.string().optional().or(z.literal("")),
  billingPostalCode: z.string().optional().or(z.literal("")),
  corporateDiscount: z.string().optional().or(z.literal("")),
  paymentTermDays: z.string().optional().or(z.literal("")),
  creditLimit: z.string().optional().or(z.literal("")),
  billingContactName: z.string().optional().or(z.literal("")),
  billingContactEmail: z.string().email("Invalid email address when provided").optional().or(z.literal("")),
  billingContactPhone: z.string().optional().or(z.literal(""))
});

interface CustomerFormProps {
  editMode?: boolean;
  initialData?: any;
  onSuccess?: (data: any) => void;
  redirectToList?: boolean;
}

export function CustomerForm({ 
  editMode = false, 
  initialData, 
  onSuccess, 
  redirectToList = true 
}: CustomerFormProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [_, navigate] = useLocation();
  
  // Helper function to transform null values to empty strings and numbers to strings
  const transformInitialData = (data: any) => {
    if (!data) return null;
    
    // Create a new object with the same properties as data
    const transformed = { ...data };
    
    // Replace null values with empty strings and convert numbers to strings
    Object.keys(transformed).forEach(key => {
      if (transformed[key] === null) {
        transformed[key] = "";
      } else if (typeof transformed[key] === 'number') {
        transformed[key] = transformed[key].toString();
      }
    });
    
    return transformed;
  };

  // Setup form with react-hook-form and zod validation
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: transformInitialData(initialData) || {
      // Basic info
      name: "",
      debtorNumber: "",
      firstName: "",
      lastName: "",
      companyName: "",
      driverName: "",
      contactPerson: "",
      
      // Communication
      email: "",
      emailForMOT: "",
      emailForInvoices: "",
      emailGeneral: "",
      phone: "",
      driverPhone: "",
      
      // Address
      streetName: "",
      address: "",
      city: "",
      postalCode: "",
      country: "Nederland",
      
      // Identification
      driverLicenseNumber: "",
      chamberOfCommerceNumber: "",
      rsin: "", 
      vatNumber: "",
      
      // Status
      status: "",
      statusDate: "",
      
      notes: "",
      
      // Corporate/Business fields
      customerType: "business",
      accountManager: "",
      billingAddress: "",
      billingCity: "",
      billingPostalCode: "",
      corporateDiscount: "",
      paymentTermDays: "",
      creditLimit: "",
      billingContactName: "",
      billingContactEmail: "",
      billingContactPhone: ""
    },
  });
  
  const createCustomerMutation = useMutation({
    mutationFn: async (data: z.infer<typeof formSchema>) => {
      const response = await fetch(
        editMode ? `/api/customers/${initialData?.id}` : "/api/customers", 
        {
          method: editMode ? "PATCH" : "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(data)
        }
      );
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to create customer");
      }
      
      return await response.json();
    },
    onSuccess: async (data) => {
      console.log("Customer created/updated successfully:", data);
      
      // Use the helper function to properly invalidate all related queries
      await invalidateRelatedQueries("customers", editMode ? initialData?.id : undefined);
      
      // Show success message
      toast({
        title: `Customer ${editMode ? "updated" : "created"} successfully`,
        description: `The customer has been ${editMode ? "updated" : "added"} to your system.`,
      });
      
      // Call the onSuccess callback if provided
      if (onSuccess) {
        onSuccess(data);
      } 
      // Or navigate back to customers list if redirectToList is true
      else if (redirectToList) {
        navigate("/customers");
      }
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Failed to ${editMode ? "update" : "create"} customer: ${error.message}`,
        variant: "destructive",
      });
    },
  });
  
  const onSubmit = (data: z.infer<typeof formSchema>) => {
    console.log("Form submitted!", data);
    
    // Transform empty strings to null and strings to numbers for numeric fields
    const transformedData = {
      ...data,
      corporateDiscount: data.corporateDiscount === "" ? null : data.corporateDiscount ? parseFloat(data.corporateDiscount) : null,
      paymentTermDays: data.paymentTermDays === "" ? null : data.paymentTermDays ? parseInt(data.paymentTermDays) : null,
      creditLimit: data.creditLimit === "" ? null : data.creditLimit ? parseFloat(data.creditLimit) : null,
    } as any;
    
    console.log("Transformed data:", transformedData);
    createCustomerMutation.mutate(transformedData);
  };
  
  return (
    <Card>
      <CardHeader>
        <CardTitle>{editMode ? "Edit Customer" : "Add New Customer"}</CardTitle>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form 
            onSubmit={(e) => {
              e.stopPropagation();
              console.log("Form errors:", form.formState.errors);
              form.handleSubmit(onSubmit)(e);
            }} 
            className="space-y-6"
          >
            <Tabs defaultValue="basic" className="w-full">
              <TabsList className="grid grid-cols-4 mb-6">
                <TabsTrigger value="basic">Basic Info</TabsTrigger>
                <TabsTrigger value="contact">Contact</TabsTrigger>
                <TabsTrigger value="company">Company</TabsTrigger>
                <TabsTrigger value="additional">Additional</TabsTrigger>
              </TabsList>
              
              {/* Basic Information Tab */}
              <TabsContent value="basic" className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Personal Information */}
                  <div className="space-y-4 md:col-span-2">
                    <h3 className="text-lg font-medium">Personal Information</h3>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="customerType"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Customer Type</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value || "business"}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select customer type" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="business">Business</SelectItem>
                                <SelectItem value="individual">Individual</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      <FormField
                        control={form.control}
                        name="debtorNumber"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Debtor Number</FormLabel>
                            <FormControl>
                              <Input placeholder="123456" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      <FormField
                        control={form.control}
                        name="name"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Full Name</FormLabel>
                            <FormControl>
                              <Input 
                                placeholder="John Doe" 
                                {...field}
                                onChange={(e) => field.onChange(capitalizeName(e.target.value))}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="firstName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>First Name</FormLabel>
                            <FormControl>
                              <Input 
                                placeholder="John" 
                                {...field}
                                onChange={(e) => field.onChange(capitalizeName(e.target.value))}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      <FormField
                        control={form.control}
                        name="lastName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Last Name</FormLabel>
                            <FormControl>
                              <Input 
                                placeholder="Doe" 
                                {...field}
                                onChange={(e) => field.onChange(capitalizeName(e.target.value))}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="driverName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Driver Name</FormLabel>
                            <FormControl>
                              <Input 
                                placeholder="John Doe" 
                                {...field}
                                onChange={(e) => field.onChange(capitalizeName(e.target.value))}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      <FormField
                        control={form.control}
                        name="driverLicenseNumber"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Driver License Number</FormLabel>
                            <FormControl>
                              <Input placeholder="License number" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>
                  
                  {/* Address Information */}
                  <div className="space-y-4 md:col-span-2">
                    <h3 className="text-lg font-medium">Address Information</h3>
                    
                    <FormField
                      control={form.control}
                      name="streetName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Street Name</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="Main Street" 
                              {...field}
                              onChange={(e) => field.onChange(capitalizeWords(e.target.value))}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="address"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Street Address</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="123 Main St" 
                              {...field}
                              onChange={(e) => field.onChange(capitalizeWords(e.target.value))}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="postalCode"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Postal Code</FormLabel>
                            <FormControl>
                              <Input placeholder="1234 AB" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      <FormField
                        control={form.control}
                        name="city"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>City</FormLabel>
                            <FormControl>
                              <Input 
                                placeholder="Amsterdam" 
                                {...field}
                                onChange={(e) => field.onChange(capitalizeWords(e.target.value))}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    
                    <FormField
                      control={form.control}
                      name="country"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Country</FormLabel>
                          <FormControl>
                            <Input placeholder="Nederland" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>
              </TabsContent>
              
              {/* Contact Information Tab */}
              <TabsContent value="contact" className="space-y-6">
                <div className="space-y-4">
                  <h3 className="text-lg font-medium">Communication Details</h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Primary Email</FormLabel>
                          <FormControl>
                            <Input type="email" placeholder="john.doe@example.com" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="phone"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Primary Phone</FormLabel>
                          <FormControl>
                            <Input placeholder="+31 6 12345678" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="emailForMOT"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Email for APK Inspection</FormLabel>
                          <FormControl>
                            <Input type="email" placeholder="apk@example.com" {...field} />
                          </FormControl>
                          <FormDescription>Email for MOT/APK inspection notifications</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="emailForInvoices"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Email for Invoices</FormLabel>
                          <FormControl>
                            <Input type="email" placeholder="invoices@example.com" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="emailGeneral"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>General Email</FormLabel>
                          <FormControl>
                            <Input type="email" placeholder="info@example.com" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="driverPhone"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Driver Phone</FormLabel>
                          <FormControl>
                            <Input placeholder="+31 6 87654321" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>
              </TabsContent>
              
              {/* Company Information Tab */}
              <TabsContent value="company" className="space-y-6">
                <div className="space-y-4">
                  <h3 className="text-lg font-medium">Company Details</h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="companyName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Company Name</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="Acme Corporation" 
                              {...field}
                              onChange={(e) => field.onChange(capitalizeWords(e.target.value))}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="contactPerson"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Contact Person</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="Jane Smith" 
                              {...field}
                              onChange={(e) => field.onChange(capitalizeName(e.target.value))}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="chamberOfCommerceNumber"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Chamber of Commerce Number (CoC)</FormLabel>
                          <FormControl>
                            <Input placeholder="12345678" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="vatNumber"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>VAT Number</FormLabel>
                          <FormControl>
                            <Input placeholder="NL123456789B01" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  
                  <FormField
                    control={form.control}
                    name="rsin"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>RSIN (Legal Entity Identification Number)</FormLabel>
                        <FormControl>
                          <Input placeholder="123456789" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                
                <div className="space-y-4 mt-6">
                  <h3 className="text-lg font-medium">Billing Contact</h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <FormField
                      control={form.control}
                      name="billingContactName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Billing Contact Name</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="John Smith" 
                              {...field}
                              onChange={(e) => field.onChange(capitalizeName(e.target.value))}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="billingContactEmail"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Billing Contact Email</FormLabel>
                          <FormControl>
                            <Input type="email" placeholder="billing@company.com" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="billingContactPhone"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Billing Contact Phone</FormLabel>
                          <FormControl>
                            <Input placeholder="+31 20 1234567" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="accountManager"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Account Manager</FormLabel>
                          <FormControl>
                            <Input placeholder="Assigned account manager" {...field} />
                          </FormControl>
                          <FormDescription>Staff member managing this corporate account</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="corporateDiscount"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Corporate Discount (%)</FormLabel>
                          <FormControl>
                            <Input type="number" step="0.01" placeholder="0.00" {...field} />
                          </FormControl>
                          <FormDescription>Discount percentage for corporate clients</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  
                  <div className="space-y-4">
                    <h4 className="text-sm font-medium">Billing Address (if different)</h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <FormField
                        control={form.control}
                        name="billingAddress"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Billing Address</FormLabel>
                            <FormControl>
                              <Input 
                                placeholder="123 Business Street" 
                                {...field}
                                onChange={(e) => field.onChange(capitalizeWords(e.target.value))}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      <FormField
                        control={form.control}
                        name="billingCity"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Billing City</FormLabel>
                            <FormControl>
                              <Input 
                                placeholder="Amsterdam" 
                                {...field}
                                onChange={(e) => field.onChange(capitalizeWords(e.target.value))}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      <FormField
                        control={form.control}
                        name="billingPostalCode"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Billing Postal Code</FormLabel>
                            <FormControl>
                              <Input placeholder="1234 AB" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>
                </div>
              </TabsContent>
              
              {/* Additional Information Tab */}
              <TabsContent value="additional" className="space-y-6">
                <div className="space-y-4">
                  <h3 className="text-lg font-medium">Status & Additional Information</h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="status"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Status</FormLabel>
                          <FormControl>
                            <Input placeholder="Active" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="statusDate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Status Date</FormLabel>
                          <FormControl>
                            <Input type="date" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  
                  <FormField
                    control={form.control}
                    name="notes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Notes</FormLabel>
                        <FormControl>
                          <Textarea 
                            placeholder="Any additional notes about this customer" 
                            className="min-h-[100px]"
                            {...field} 
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </TabsContent>
            </Tabs>
            
            <div className="flex justify-end space-x-2 pt-4 border-t">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  if (redirectToList) {
                    navigate("/customers");
                  } else {
                    // For embedded forms (like in reservations), just close without navigation
                    if (onSuccess) {
                      // If onSuccess exists, the parent component will handle closing
                      form.reset();
                    }
                  }
                }}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createCustomerMutation.isPending}
              >
                {createCustomerMutation.isPending ? (
                  <span className="flex items-center">
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Saving...
                  </span>
                ) : (
                  editMode ? "Update Customer" : "Add Customer"
                )}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
