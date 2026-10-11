import { describeApiError } from "@/lib/api-error";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Fuel, Upload, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { invalidateVehicleData, invalidateExpenseData } from "@/lib/cache-utils";
import { formatCurrency } from "@/lib/format-utils";
import { parseMoneyInput } from "@/lib/money-input";

// Older rows stored "full"/"empty" lowercase; the app now writes "Full"/"Empty"
// everywhere. Normalize so legacy values still preselect in the dropdown.
function normalizeFuelLevel(level?: string): string {
  if (!level) return "";
  const lower = level.toLowerCase();
  if (lower === "full") return "Full";
  if (lower === "empty") return "Empty";
  return level;
}

interface FuelStatusUpdateDialogProps {
  vehicleId: number;
  currentFuelLevel?: string;
  children?: React.ReactNode;
  onSuccess?: () => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function FuelStatusUpdateDialog({ 
  vehicleId, 
  currentFuelLevel, 
  children,
  onSuccess,
  open: externalOpen,
  onOpenChange: externalOnOpenChange
}: FuelStatusUpdateDialogProps) {
  const { t } = useTranslation("vehicles");
  const [internalOpen, setInternalOpen] = useState(false);
  const [fuelLevel, setFuelLevel] = useState<string>(normalizeFuelLevel(currentFuelLevel));
  const [cost, setCost] = useState<string>("");
  // A-3-2: shown under the cost field when what was typed is not an amount.
  const [costError, setCostError] = useState<string | null>(null);
  const [notes, setNotes] = useState<string>("");
  const [receipt, setReceipt] = useState<File | null>(null);
  const { toast } = useToast();

  // Use external open state if provided, otherwise use internal
  const open = externalOpen !== undefined ? externalOpen : internalOpen;
  const setOpen = externalOnOpenChange || setInternalOpen;

  // Helper function to format fuel level for display
  const formatFuelLevel = (level?: string) => {
    if (!level) return null;
    return level.charAt(0).toUpperCase() + level.slice(1);
  };

  const updateMutation = useMutation({
    mutationFn: async () => {
      const formData = new FormData();
      formData.append('vehicleId', vehicleId.toString());
      
      if (fuelLevel) {
        formData.append('fuelLevel', fuelLevel);
      }
      if (cost.trim()) {
        // handleSubmit has already refused anything that is not an amount.
        formData.append('cost', String(parseMoneyInput(cost)));
      }
      if (notes) {
        formData.append('notes', notes);
      }
      if (receipt) {
        formData.append('receipt', receipt);
      }

      const response = await fetch(`/api/vehicles/${vehicleId}/fuel-status`, {
        method: 'PATCH',
        credentials: 'include',
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        // Carry the server's stable `code` so describeApiError can speak Dutch.
        throw Object.assign(new Error(error.message || 'Failed to update fuel status'), {
          code: typeof error.code === 'string' ? error.code : undefined,
          httpStatus: response.status,
        });
      }

      return response.json();
    },
    onSuccess: (vehicle: { fuelExpense?: { id: number; amount: number } }) => {
      // Besluit B-41 D1: an amount also became an expense; say which one.
      const booked = vehicle?.fuelExpense;
      toast({
        title: t('fuelStatusUpdateDialog.toasts.successTitle'),
        description: booked
          ? t('fuelStatusUpdateDialog.toasts.successWithExpense', { amount: formatCurrency(booked.amount) })
          : t('fuelStatusUpdateDialog.toasts.successDescription'),
      });
      
      // Use comprehensive cache invalidation
      invalidateVehicleData(vehicleId);
      // The new expense also shows on the Kosten page, the dashboard and the vehicle's Kosten tab.
      if (booked) invalidateExpenseData(booked.id, vehicleId);
      
      // Reset form
      setFuelLevel(normalizeFuelLevel(currentFuelLevel));
      setCost("");
      setCostError(null);
      setNotes("");
      setReceipt(null);
      
      setOpen(false);
      
      if (onSuccess) {
        onSuccess();
      }
    },
    onError: (error: Error) => {
      toast({
        title: t('fuelStatusUpdateDialog.toasts.errorTitle'),
        description: describeApiError(error),
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // A-3-2: a value that is not an amount is refused out loud; it used to be
    // dropped from the request while the toast said "Gelukt".
    // Zero and anything above 1,000,000 are refused too: the amount becomes an
    // expense, and the server answers FUEL_COST_INVALID for them.
    if (cost.trim()) {
      const amount = parseMoneyInput(cost);
      if (amount === null || amount <= 0 || amount > 1_000_000) {
        setCostError(t('fuelStatusUpdateDialog.costInvalid'));
        return;
      }
    }

    if (!fuelLevel && !cost.trim() && !notes && !receipt) {
      toast({
        title: t('fuelStatusUpdateDialog.toasts.errorTitle'),
        description: t('fuelStatusUpdateDialog.toasts.provideOneFieldDescription'),
        variant: "destructive",
      });
      return;
    }

    updateMutation.mutate();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setReceipt(e.target.files[0]);
    }
  };

  const removeReceipt = () => {
    setReceipt(null);
  };

  const trigger = children || (
    <Button size="sm" variant="outline" data-testid="button-update-fuel-status">
      <Fuel className="mr-2 h-4 w-4" />
      {t('fuelStatusUpdateDialog.updateFuelStatusButton')}
    </Button>
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger}
      </DialogTrigger>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('fuelStatusUpdateDialog.updateFuelStatusButton')}</DialogTitle>
          <DialogDescription>
            {t('fuelStatusUpdateDialog.description')}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="fuelLevel">{t('fuelStatusUpdateDialog.fuelLevelLabel')}</Label>
            <Select value={fuelLevel} onValueChange={setFuelLevel}>
              <SelectTrigger id="fuelLevel" data-testid="select-fuel-level">
                <SelectValue placeholder={
                  currentFuelLevel
                    ? t('fuelStatusUpdateDialog.currentFuelPlaceholder', { level: formatFuelLevel(currentFuelLevel) })
                    : t('fuelStatusUpdateDialog.selectFuelLevelPlaceholder')
                } />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Empty">{t('fuelStatusUpdateDialog.fuelEmpty')}</SelectItem>
                <SelectItem value="1/4">1/4</SelectItem>
                <SelectItem value="1/2">1/2</SelectItem>
                <SelectItem value="3/4">3/4</SelectItem>
                <SelectItem value="Full">{t('fuelStatusUpdateDialog.fuelFull')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="cost">{t('fuelStatusUpdateDialog.refillCostLabel')}</Label>
            <Input
              id="cost"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              placeholder={t('fuelStatusUpdateDialog.refillCostPlaceholder')}
              value={cost}
              onChange={(e) => { setCost(e.target.value); setCostError(null); }}
              aria-invalid={costError ? true : undefined}
              aria-describedby={costError ? "cost-error" : undefined}
              data-testid="input-fuel-cost"
            />
            {costError && (
              <p id="cost-error" className="text-sm font-medium text-destructive" data-testid="error-fuel-cost">{costError}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="receipt">{t('fuelStatusUpdateDialog.receiptLabel')}</Label>
            <div className="flex items-center gap-2">
              <Input
                id="receipt"
                type="file"
                accept=".jpg,.jpeg,.png,.pdf"
                onChange={handleFileChange}
                className="hidden"
                data-testid="input-fuel-receipt"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => document.getElementById('receipt')?.click()}
                data-testid="button-upload-receipt"
              >
                <Upload className="mr-2 h-4 w-4" />
                {receipt ? t('fuelStatusUpdateDialog.changeReceiptButton') : t('fuelStatusUpdateDialog.uploadReceiptButton')}
              </Button>
              {receipt && (
                <div className="flex items-center gap-2 text-sm">
                  <span className="truncate max-w-[150px]" data-testid="text-receipt-name">
                    {receipt.name}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={removeReceipt}
                    data-testid="button-remove-receipt"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">{t('fuelStatusUpdateDialog.notesLabel')}</Label>
            <Textarea
              id="notes"
              placeholder={t('fuelStatusUpdateDialog.notesPlaceholder')}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              data-testid="textarea-fuel-notes"
            />
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              data-testid="button-cancel-fuel-update"
            >
              {t('fuelStatusUpdateDialog.cancelButton')}
            </Button>
            <Button
              type="submit"
              disabled={updateMutation.isPending}
              data-testid="button-submit-fuel-update"
            >
              {updateMutation.isPending ? t('fuelStatusUpdateDialog.updatingButton') : t('fuelStatusUpdateDialog.updateFuelStatusButton')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
