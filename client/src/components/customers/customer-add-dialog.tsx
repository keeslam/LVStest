import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { RequiresPermission } from "@/components/ui/requires-permission";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus } from "lucide-react";
import { UserPermission } from "@shared/schema";
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

  // Custom trigger or default "Add Customer" button — the default is the one
  // gated here; a caller-supplied trigger is that caller's own control to gate.
  const trigger = children || (
    <RequiresPermission anyOf={[UserPermission.MANAGE_CUSTOMERS]}>
      <Button data-testid="button-add-customer">
        <Plus className="mr-2 h-4 w-4" />
        {t('addDialog.trigger')}
      </Button>
    </RequiresPermission>
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