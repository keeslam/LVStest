import { describeApiError } from "@/lib/api-error";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Printer, RefreshCw } from "lucide-react";
import { Vehicle, UserRole, UserPermission, BarcodeLabelTemplate } from "@shared/schema";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, invalidateByPrefix } from "@/lib/queryClient";
import { BarcodeSvg } from "./barcode-svg";
import { printKeyLabels } from "./key-label-print";
import { LabelLayoutPicker, useLabelLayout } from "./label-layout-picker";
import { formatLicensePlate } from "@/lib/format-utils";
import { formatSpareKeyBarcode } from "@shared/barcode";

interface VehicleBarcodeDialogProps {
  vehicle: Vehicle;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function VehicleBarcodeDialog({ vehicle, open, onOpenChange }: VehicleBarcodeDialogProps) {
  const { t } = useTranslation(["barcodes", "common"]);
  const { user } = useAuth();
  const { toast } = useToast();

  // Staff can read the template list (GET is requireAuth only) to pick a layout.
  const { data: labelTemplates } = useQuery<BarcodeLabelTemplate[]>({
    queryKey: ["/api/barcode-label-templates"],
    enabled: open,
  });
  const layout = useLabelLayout(labelTemplates);

  const canRegenerate =
    user?.role === UserRole.ADMIN ||
    ((user?.permissions as string[]) || []).includes(UserPermission.MANAGE_VEHICLES);

  const regenerateMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/vehicles/${vehicle.id}/barcode/regenerate`);
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.message || t("label.regenerateError"));
      }
      return (await response.json()) as { vehicle: Vehicle };
    },
    onSuccess: (data) => {
      toast({ title: t("label.regenerateSuccess", { barcode: data.vehicle.barcode }) });
      invalidateByPrefix("/api/vehicles");
      invalidateByPrefix(`/api/vehicles/${vehicle.id}`);
    },
    onError: (error: Error) => {
      toast({ title: t("label.regenerateError"), description: describeApiError(error), variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("label.barcodeDialogTitle")}</DialogTitle>
          <DialogDescription>
            {vehicle.brand} {vehicle.model} ({formatLicensePlate(vehicle.licensePlate)})
          </DialogDescription>
        </DialogHeader>

        <div className="flex justify-center items-center rounded-md border bg-white py-6 px-4">
          {vehicle.barcode && <BarcodeSvg value={vehicle.barcode} height={80} className="max-w-full h-auto" />}
        </div>

        <LabelLayoutPicker
          id="barcode-label-template"
          layout={layout}
          templates={labelTemplates}
          selectTestId="select-key-label-template"
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2">
          <Button
            onClick={() => printKeyLabels([vehicle], layout.selectedTemplate, layout.printOptions)}
            disabled={!vehicle.barcode}
            data-testid="button-print-key-label"
          >
            <Printer className="h-4 w-4 mr-2" />
            {t("label.printKeyLabel")}
          </Button>
          <Button
            variant="outline"
            onClick={() => printKeyLabels([{ ...vehicle, barcodeOverride: formatSpareKeyBarcode(vehicle.id) }], layout.selectedTemplate, layout.printOptions)}
            disabled={!vehicle.barcode}
            data-testid="button-print-spare-key-label"
          >
            <Printer className="h-4 w-4 mr-2" />
            {t("label.printSpareKeyLabel")}
          </Button>
          {canRegenerate && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" disabled={regenerateMutation.isPending}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  {t("label.regenerate")}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{t("label.regenerateConfirmTitle")}</AlertDialogTitle>
                  <AlertDialogDescription>
                    {t("label.regenerateConfirmDescription", { barcode: vehicle.barcode })}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t("common:actions.cancel")}</AlertDialogCancel>
                  <AlertDialogAction onClick={() => regenerateMutation.mutate()}>
                    {t("label.regenerate")}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
