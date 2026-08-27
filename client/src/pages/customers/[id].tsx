import { useParams } from "wouter";
import { useTranslation } from "react-i18next";
import { CustomerDetails } from "@/components/customers/customer-details";

export default function CustomerDetail() {
  const { t } = useTranslation("customers");
  const params = useParams<{ id: string }>();
  const customerId = parseInt(params.id);

  if (isNaN(customerId)) {
    return <div>{t('editPage.invalidCustomerId')}</div>;
  }

  return (
    <div>
      <CustomerDetails customerId={customerId} />
    </div>
  );
}