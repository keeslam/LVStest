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
import { VehicleQuickForm } from "./vehicle-quick-form";

interface VehicleAddDialogProps {
  children?: React.ReactNode;
  onSuccess?: () => void;
}

export function VehicleAddDialog({ children, onSuccess }: VehicleAddDialogProps) {
  const { t } = useTranslation("vehicles");
  const [open, setOpen] = useState(false);

  const handleSuccess = (data: any) => {
    setOpen(false);
    if (onSuccess) {
      onSuccess();
    }
  };

  const handleCancel = () => {
    setOpen(false);
  };

  // Custom trigger or default "Add Vehicle" button
  const trigger = children || (
    <Button data-testid="button-add-vehicle">
      <Plus className="mr-2 h-4 w-4" />
      {t('addDialog.addVehicleButton')}
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
          <VehicleQuickForm 
            onSuccess={handleSuccess}
            onCancel={handleCancel}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}