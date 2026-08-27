import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Eye } from "lucide-react";
import { useTranslation } from "react-i18next";
import { CustomerDetails } from "./customer-details";

interface CustomerViewDialogProps {
  customerId: number;
  children?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function CustomerViewDialog({ 
  customerId, 
  children, 
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange 
}: CustomerViewDialogProps) {
  const { t } = useTranslation("customers");
  const [internalOpen, setInternalOpen] = useState(false);

  // Use controlled state if provided, otherwise use internal state
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;

  // Custom trigger or default "View" button
  const trigger = children || (
    <Button variant="ghost" size="sm" data-testid={`button-view-customer-${customerId}`}>
      <Eye className="mr-2 h-4 w-4" />
      View
    </Button>
  );

  // Handle dialog open/close state changes. onPointerDownOutside/onInteractOutside
  // below already stop a click on another nested dialog from closing this one, so
  // this doesn't need its own extra gate on top - a prior version did, and it
  // ended up blocking the dialog's own close (X) button too, since Radix routes
  // that through the same onOpenChange(false).
  const handleOpenChange = (newOpen: boolean) => {
    if (isControlled && controlledOnOpenChange) {
      controlledOnOpenChange(newOpen);
    } else {
      setInternalOpen(newOpen);
    }
  };

  const handleClose = () => handleOpenChange(false);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {!isControlled && (
        <DialogTrigger asChild>
          {trigger}
        </DialogTrigger>
      )}
      <DialogContent 
        className="max-w-6xl max-h-[90vh] overflow-y-auto"
        onPointerDownOutside={(e) => {
          const target = e.target as HTMLElement;
          if (target.closest('[role="dialog"]') && target.closest('[role="dialog"]') !== e.currentTarget) {
            e.preventDefault();
          }
        }}
        onInteractOutside={(e) => {
          const target = e.target as HTMLElement;
          if (target.closest('[role="dialog"]') && target.closest('[role="dialog"]') !== e.currentTarget) {
            e.preventDefault();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>{t('viewDialog.title')}</DialogTitle>
          <DialogDescription>
            {t('viewDialog.description')}
          </DialogDescription>
        </DialogHeader>
        <div className="mt-4">
          <CustomerDetails 
            customerId={customerId} 
            inDialog={true}
            onClose={handleClose}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}