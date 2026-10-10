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
import { ExpenseForm } from "./expense-form";

interface ExpenseAddDialogProps {
  vehicleId?: number;
  /** A category key to start on (from a link such as /expenses/add?category=fuel). */
  category?: string | null;
  children?: React.ReactNode;
  onSuccess?: () => void;
  /**
   * Controlled use: the /expenses/add route renders this dialog open and goes
   * back to the Kosten list when it closes. Without these the dialog keeps its
   * own open state and is opened by its trigger.
   */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

/**
 * THE expense form dialog (audit A-9-7). The dashboard's "Kosten registreren",
 * the Kosten page, the vehicle and reservation screens and the old
 * /expenses/add link used to be two different things (a page and a dialog);
 * they all open this one now.
 */
export function ExpenseAddDialog({ vehicleId, category, children, onSuccess, open: controlledOpen, onOpenChange }: ExpenseAddDialogProps) {
  const { t } = useTranslation("expenses");
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen = (next: boolean) => {
    if (!isControlled) setInternalOpen(next);
    onOpenChange?.(next);
  };

  const handleSuccess = () => {
    setOpen(false);
    if (onSuccess) {
      onSuccess();
    }
  };

  // Custom trigger or default "Add Expense" button. A controlled dialog has none.
  const trigger = children || (!isControlled && (
    <Button size="sm" data-testid={`button-add-expense${vehicleId ? `-${vehicleId}` : ''}`}>
      <Plus className="mr-2 h-4 w-4" />
      {t('addDialog.addExpense')}
    </Button>
  ));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger ? (
        <DialogTrigger asChild>
          {trigger}
        </DialogTrigger>
      ) : null}
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('addDialog.title')}</DialogTitle>
          <DialogDescription>
            {t('addDialog.description')}
          </DialogDescription>
        </DialogHeader>
        <div className="mt-4">
          <ExpenseForm 
            preselectedVehicleId={vehicleId}
            preselectedCategory={category}
            onSuccess={handleSuccess}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
