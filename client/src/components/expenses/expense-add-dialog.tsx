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
import { Plus } from "lucide-react";
import { ExpenseForm } from "./expense-form";

interface ExpenseAddDialogProps {
  vehicleId?: number;
  children?: React.ReactNode;
  onSuccess?: () => void;
}

export function ExpenseAddDialog({ vehicleId, children, onSuccess }: ExpenseAddDialogProps) {
  const [open, setOpen] = useState(false);

  const handleSuccess = () => {
    setOpen(false);
    if (onSuccess) {
      onSuccess();
    }
  };

  // Custom trigger or default "Add Expense" button
  const trigger = children || (
    <Button size="sm" data-testid={`button-add-expense${vehicleId ? `-${vehicleId}` : ''}`}>
      <Plus className="mr-2 h-4 w-4" />
      Add Expense
    </Button>
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger}
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add New Expense</DialogTitle>
          <DialogDescription>
            Record a new expense for your vehicle fleet
          </DialogDescription>
        </DialogHeader>
        <div className="mt-4">
          <ExpenseForm 
            preselectedVehicleId={vehicleId}
            onSuccess={handleSuccess}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}