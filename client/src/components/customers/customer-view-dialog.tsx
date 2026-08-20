import { useState, useRef, useEffect } from "react";
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
  const [internalOpen, setInternalOpen] = useState(false);
  const allowClose = useRef(false);
  
  // Use controlled state if provided, otherwise use internal state
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen = isControlled ? (controlledOnOpenChange || (() => {})) : setInternalOpen;

  // Custom trigger or default "View" button
  const trigger = children || (
    <Button variant="ghost" size="sm" data-testid={`button-view-customer-${customerId}`}>
      <Eye className="mr-2 h-4 w-4" />
      View
    </Button>
  );

  // Explicit close function that can only be called from within this component
  const handleClose = () => {
    allowClose.current = true;
    if (isControlled && controlledOnOpenChange) {
      controlledOnOpenChange(false);
    } else {
      setInternalOpen(false);
    }
    // Reset the flag after a short delay
    setTimeout(() => {
      allowClose.current = false;
    }, 100);
  };

  // Handle dialog open/close state changes
  const handleOpenChange = (newOpen: boolean) => {
    if (newOpen) {
      // Always allow opening
      if (isControlled && controlledOnOpenChange) {
        controlledOnOpenChange(true);
      } else {
        setInternalOpen(true);
      }
    } else {
      // Only allow closing if explicitly allowed or if controlled from outside
      if (isControlled || allowClose.current) {
        if (isControlled && controlledOnOpenChange) {
          controlledOnOpenChange(false);
        } else {
          setInternalOpen(false);
        }
      }
      // Otherwise, ignore the close request (from nested dialogs, etc.)
    }
  };

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
          <DialogTitle>Customer Details</DialogTitle>
          <DialogDescription>
            View customer information and reservation history
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