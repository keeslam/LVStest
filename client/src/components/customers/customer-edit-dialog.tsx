import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Edit } from "lucide-react";
import { CustomerForm } from "./customer-form";
import { Customer } from "@shared/schema";

interface CustomerEditDialogProps {
  customerId: number;
  children?: React.ReactNode;
  onSuccess?: () => void;
}

export function CustomerEditDialog({ customerId, children, onSuccess }: CustomerEditDialogProps) {
  const { t } = useTranslation(["customers", "common"]);
  const [open, setOpen] = useState(false);

  // Fetch customer data for editing
  const { data: customer, isLoading } = useQuery<Customer>({
    queryKey: [`/api/customers/${customerId}`],
    enabled: open, // Only fetch when dialog is open
  });

  const handleSuccess = (data: any) => {
    setOpen(false);
    if (onSuccess) {
      onSuccess();
    }
  };

  // Custom trigger or default "Edit" button
  const trigger = children || (
    <Button variant="outline" data-testid={`button-edit-customer-${customerId}`}>
      <Edit className="mr-2 h-4 w-4" />
      {t('common:actions.edit')}
    </Button>
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger}
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('editDialog.title')}</DialogTitle>
          <DialogDescription>
            {t('editDialog.description')}
          </DialogDescription>
        </DialogHeader>
        <div className="mt-4">
          {isLoading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : customer ? (
            <CustomerForm 
              editMode={true}
              initialData={customer}
              onSuccess={handleSuccess}
              redirectToList={false}
            />
          ) : (
            <div className="text-center py-8 text-gray-500">
              {t('editDialog.loadFailed')}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}