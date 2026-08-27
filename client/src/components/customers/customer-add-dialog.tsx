import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus } from "lucide-react";
import { CustomerForm } from "./customer-form";

interface CustomerAddDialogProps {
  children?: React.ReactNode;
  onSuccess?: () => void;
}

export function CustomerAddDialog({ children, onSuccess }: CustomerAddDialogProps) {
  const { t } = useTranslation("customers");
  const [open, setOpen] = useState(false);

  const handleSuccess = (data: any) => {
    setOpen(false);
    if (onSuccess) {
      onSuccess();
    }
  };

  // Custom trigger or default "Add Customer" button
  const trigger = children || (
    <Button data-testid="button-add-customer">
      <Plus className="mr-2 h-4 w-4" />
      {t('addDialog.trigger')}
    </Button>
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger}
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('addDialog.title')}</DialogTitle>
          <DialogDescription>
            {t('addDialog.description')}
          </DialogDescription>
        </DialogHeader>
        <div className="mt-4">
          <CustomerForm 
            editMode={false}
            onSuccess={handleSuccess}
            redirectToList={false}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}