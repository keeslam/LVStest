import { useParams } from "wouter";
import { CustomerDetails } from "@/components/customers/customer-details";

export default function CustomerDetail() {
  const params = useParams<{ id: string }>();
  const customerId = parseInt(params.id);

  if (isNaN(customerId)) {
    return <div>Invalid customer ID</div>;
  }

  return (
    <div>
      <CustomerDetails customerId={customerId} />
    </div>
  );
}