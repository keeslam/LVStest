import { useEffect, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Trash2, AlertTriangle, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest , invalidateByPrefix } from "@/lib/queryClient";
import { formatLicensePlate } from "@/lib/format-utils";

interface VehicleDeleteDialogProps {
  vehicleId: number;
  vehicleBrand: string;
  vehicleModel: string;
  vehicleLicensePlate: string;
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

const COUNT_LABEL_KEYS: Record<string, string> = {
  reservations: "reservations",
  documents: "documents",
  expenses: "expenses",
  damageChecks: "damageChecks",
  waitlist: "waitlist",
  transports: "transports",
  blacklist: "blacklist",
};

const getCountLabel = (key: string, t: TFunction) =>
  t(`deleteDialog.countLabels.${COUNT_LABEL_KEYS[key]}`, { defaultValue: key });

// Plates are typed with or without dashes depending on who is typing.
const normalizePlate = (value: string) => value.replace(/[^a-z0-9]/gi, "").toUpperCase();

export function VehicleDeleteDialog({
  vehicleId,
  vehicleBrand,
  vehicleModel,
  vehicleLicensePlate,
  children,
  onSuccess,
  open: controlledOpen,
  onOpenChange,
}: VehicleDeleteDialogProps) {
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
  const [confirmation, setConfirmation] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Reset the typed confirmation whenever the dialog opens for a vehicle, so a
  // previously typed plate can never carry over to the next one.
  useEffect(() => {
    if (open) setConfirmation("");
  }, [open, vehicleId]);

  // What goes with the vehicle. Deleting cascades into rentals and documents,
  // which is exactly the part people do not expect.
  const { data: impact, isLoading: isLoadingImpact } = useQuery<{
    licensePlate: string;
    counts: Record<string, number>;
  }>({
    queryKey: [`/api/vehicles/${vehicleId}/delete-impact`],
    enabled: open,
  });

  const cascadeEntries = Object.entries(impact?.counts || {}).filter(([, count]) => count > 0);
  const confirmationMatches =
    normalizePlate(confirmation) === normalizePlate(vehicleLicensePlate) && confirmation.trim() !== "";

  const deleteVehicleMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('DELETE', `/api/vehicles/${vehicleId}`, {
        confirmLicensePlate: confirmation.trim(),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to delete vehicle');
      }

      // Handle 204 No Content or empty responses
      if (response.status === 204) {
        return null;
      }

      // Try to parse JSON, but handle empty responses gracefully
      try {
        return await response.json();
      } catch {
        return null;
      }
    },
    onSuccess: () => {
      // Refresh the vehicles list
      invalidateByPrefix("/api/vehicles");
      invalidateByPrefix("/api/reservations");
      invalidateByPrefix("/api/deleted-records");

      toast({
        title: t('deleteDialog.toasts.deletedTitle'),
        description: t('deleteDialog.toasts.deletedDescription', { brand: vehicleBrand, model: vehicleModel }),
        variant: "default"
      });

      setOpen(false);

      if (onSuccess) {
        onSuccess();
      }
    },
    onError: (error: Error) => {
      toast({
        title: t('deleteDialog.toasts.errorTitle'),
        description: error.message || t('deleteDialog.toasts.errorFallback'),
        variant: "destructive"
      });
    }
  });

  const handleDelete = () => {
    if (!confirmationMatches) return;
    deleteVehicleMutation.mutate();
  };

  // Custom trigger or default delete button
  const trigger = children || (
    <Button
      variant="ghost"
      size="sm"
      className="text-red-500"
      data-testid={`button-delete-vehicle-${vehicleId}`}
    >
      <Trash2 className="h-4 w-4" />
    </Button>
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!isControlled && (
        <DialogTrigger asChild>
          {trigger}
        </DialogTrigger>
      )}
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('deleteDialog.title')}</DialogTitle>
          <DialogDescription>
            <Trans
              i18nKey="deleteDialog.description"
              ns="vehicles"
              values={{ brand: vehicleBrand, model: vehicleModel, plate: formatLicensePlate(vehicleLicensePlate) }}
              components={{ 1: <strong /> }}
            />
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <div className="space-y-1">
              {isLoadingImpact ? (
                <p className="flex items-center gap-2">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  {t('deleteDialog.checkingImpact')}
                </p>
              ) : cascadeEntries.length > 0 ? (
                <>
                  <p className="font-medium">{t('deleteDialog.alsoDeletes')}</p>
                  <ul className="list-disc pl-4">
                    {cascadeEntries.map(([key, count]) => (
                      <li key={key}>
                        {count} {getCountLabel(key, t)}
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p>{t('deleteDialog.nothingAttached')}</p>
              )}
              <p className="text-amber-800/80">
                {t('deleteDialog.restoreHint')}
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor={`confirm-plate-${vehicleId}`}>
            <Trans
              i18nKey="deleteDialog.typeToConfirm"
              ns="vehicles"
              values={{ plate: formatLicensePlate(vehicleLicensePlate) }}
              components={{ 1: <span className="font-mono font-semibold" /> }}
            />
          </Label>
          <Input
            id={`confirm-plate-${vehicleId}`}
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            placeholder={formatLicensePlate(vehicleLicensePlate)}
            autoComplete="off"
            data-testid={`input-confirm-delete-${vehicleId}`}
          />
        </div>

        <DialogFooter className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={deleteVehicleMutation.isPending}
          >
            {t('deleteDialog.cancelButton')}
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={deleteVehicleMutation.isPending || !confirmationMatches}
            data-testid={`button-confirm-delete-${vehicleId}`}
          >
            {deleteVehicleMutation.isPending ? t('deleteDialog.deletingButton') : t('deleteDialog.deleteButton')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
