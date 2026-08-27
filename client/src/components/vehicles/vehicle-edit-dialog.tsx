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
import { VehicleForm } from "./vehicle-form";
import { Vehicle } from "@shared/schema";

interface VehicleEditDialogProps {
  vehicleId: number;
  children?: React.ReactNode;
  onSuccess?: () => void;
  /**
   * Optional controlled mode. When `open`/`onOpenChange` are provided the
   * dialog renders without its own trigger and its open state is owned by the
   * parent (e.g. page-level state that survives table re-renders).
   */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function VehicleEditDialog({
  vehicleId,
  children,
  onSuccess,
  open: controlledOpen,
  onOpenChange,
}: VehicleEditDialogProps) {
  const { t } = useTranslation("vehicles");
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen = (next: boolean) => {
    if (isControlled) {
      onOpenChange?.(next);
    } else {
      setInternalOpen(next);
    }
  };

  // Fetch vehicle data for editing
  const { data: vehicle, isLoading } = useQuery<Vehicle>({
    queryKey: [`/api/vehicles/${vehicleId}`],
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
    <Button variant="ghost" size="sm" data-testid={`button-edit-vehicle-${vehicleId}`}>
      <Edit className="h-4 w-4" />
    </Button>
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!isControlled && (
        <DialogTrigger asChild>
          {trigger}
        </DialogTrigger>
      )}
      <DialogContent className="max-w-[90vw] max-h-[90vh] overflow-y-auto">
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
          ) : vehicle ? (
            <VehicleForm
              editMode={true}
              initialData={vehicle}
              onSuccess={handleSuccess}
              redirectToList={false}
              customCancelButton={
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setOpen(false)}
                >
                  {t('editDialog.cancelButton')}
                </Button>
              }
            />
          ) : (
            <div className="text-center py-8 text-gray-500">
              {t('editDialog.failedToLoad')}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}