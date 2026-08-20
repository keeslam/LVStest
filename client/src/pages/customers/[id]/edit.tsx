import { invalidateByPrefix } from "@/lib/queryClient";
import { useParams, useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CustomerForm } from "@/components/customers/customer-form";
import { Customer } from "@shared/schema";
import { Button } from "@/components/ui/button";

export default function CustomerEdit() {
  const params = useParams<{ id: string }>();
  const [_, navigate] = useLocation();
  const queryClient = useQueryClient();
  const customerId = parseInt(params.id);

  // Fetch customer details
  const { data: customer, isLoading, error } = useQuery<Customer>({
    queryKey: [`/api/customers/${customerId}`],
  });

  if (isNaN(customerId)) {
    return <div>Invalid customer ID</div>;
  }

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <svg className="animate-spin h-8 w-8 text-primary-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      </div>
    );
  }

  if (error || !customer) {
    return (
      <div className="text-center p-8">
        <h2 className="text-xl font-semibold mb-2">Customer not found</h2>
        <p className="mb-4 text-gray-600">The customer you're trying to edit doesn't exist or has been removed.</p>
        <Button onClick={() => navigate("/customers")}>Back to Customers</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Edit Customer</h1>
        <Button variant="outline" onClick={() => navigate(`/customers/${customerId}`)}>
          Cancel
        </Button>
      </div>
      
      <CustomerForm 
        editMode={true} 
        initialData={customer} 
        onSuccess={(data) => {
          // Force a refresh of all customer data before navigation
          invalidateByPrefix(`/api/customers/${customerId}`);
          queryClient.removeQueries({ queryKey: [`/api/customers/${customerId}`] });
          
          // Then navigate back to the customer details page
          navigate(`/customers/${customerId}`);
        }} 
      />
    </div>
  );
}