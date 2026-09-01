import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Gauge } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, invalidateByPrefix } from "@/lib/queryClient";
import { MileageOverridePasswordDialog } from "@/components/mileage-override-password-dialog";

interface MileageUpdateDialogProps {
  vehicleId: number;
  currentMileage: number | null | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

// Small odometer-update dialog (used from the barcode scan card). Saves through
// PATCH /api/vehicles/:id/mileage; a decrease makes the server ask for an
// authorised override password, which we collect with the shared
// MileageOverridePasswordDialog — same flow as the vehicle details page.
export function MileageUpdateDialog({
  vehicleId,
  currentMileage,
  open,
  onOpenChange,
  onSuccess,
}: MileageUpdateDialogProps) {
  const { t } = useTranslation(["vehicles", "common"]);
  const { toast } = useToast();
  const [value, setValue] = useState("");
  const [overrideOpen, setOverrideOpen] = useState(false);

  // Prefill with the current reading every time the dialog opens
  useEffect(() => {
    if (open) setValue(currentMileage != null ? String(currentMileage) : "");
  }, [open, currentMileage]);

  const newMileage = value.trim() === "" ? NaN : Number(value);
  const isValid = Number.isInteger(newMileage) && newMileage >= 0;
  const isDecrease = isValid && currentMileage != null && newMileage < currentMileage;

  const mutation = useMutation({
    mutationFn: async (overridePassword?: string) => {
      const payload: Record<string, unknown> = { currentMileage: newMileage };
      if (overridePassword) payload.mileageOverridePassword = overridePassword;
      const response = await apiRequest("PATCH", `/api/vehicles/${vehicleId}/mileage`, payload);
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        const error: any = new Error(data.message || t("mileageUpdateDialog.saveFailed"));
        Object.assign(error, data);
        throw error;
      }
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: t("mileageUpdateDialog.savedTitle"),
        description: t("mileageUpdateDialog.savedDescription", { mileage: newMileage.toLocaleString() }),
      });
      invalidateByPrefix("/api/vehicles");
      setOverrideOpen(false);
      onOpenChange(false);
      onSuccess?.();
    },
    onError: (error: any) => {
      if (error?.requiresOverride) {
        setOverrideOpen(true);
        return;
      }
      // Reported inline by the override dialog
      if (error?.code === "MILEAGE_OVERRIDE_INVALID_PASSWORD" || error?.code === "MILEAGE_OVERRIDE_FORBIDDEN") {
        return;
      }
      toast({ title: t("mileageUpdateDialog.errorTitle"), description: error.message, variant: "destructive" });
    },
  });

  const handleOverrideConfirm = async (password: string): Promise<boolean> => {
    try {
      await mutation.mutateAsync(password);
      return true;
    } catch (error: any) {
      if (error?.code === "MILEAGE_OVERRIDE_INVALID_PASSWORD") return false;
      throw error;
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid || mutation.isPending) return;
    mutation.mutate(undefined);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md" data-testid="dialog-mileage-update">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Gauge className="h-5 w-5" />
              {t("mileageUpdateDialog.title")}
            </DialogTitle>
            <DialogDescription>
              {currentMileage != null
                ? t("mileageUpdateDialog.currentReading", { mileage: currentMileage.toLocaleString() })
                : t("mileageUpdateDialog.noReading")}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="mileage-update-input">{t("mileageUpdateDialog.newMileageLabel")}</Label>
              <Input
                id="mileage-update-input"
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                autoFocus
                data-testid="input-mileage-update"
              />
              {isDecrease && (
                <p className="text-sm text-amber-700" data-testid="text-mileage-decrease-warning">
                  {t("mileageUpdateDialog.decreaseWarning", { current: Number(currentMileage).toLocaleString() })}
                </p>
              )}
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
                {t("common:actions.cancel")}
              </Button>
              <Button type="submit" disabled={!isValid || mutation.isPending} data-testid="button-mileage-update-save">
                {mutation.isPending ? t("mileageUpdateDialog.saving") : t("mileageUpdateDialog.save")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <MileageOverridePasswordDialog
        open={overrideOpen}
        onOpenChange={setOverrideOpen}
        onConfirm={handleOverrideConfirm}
        currentMileage={currentMileage ?? 0}
        newMileage={isValid ? newMileage : 0}
      />
    </>
  );
}
