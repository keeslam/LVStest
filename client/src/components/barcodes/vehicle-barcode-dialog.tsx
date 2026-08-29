import { useEffect, useState } from "react";
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
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Printer, RefreshCw } from "lucide-react";
import { Vehicle, UserRole, UserPermission, BarcodeLabelTemplate } from "@shared/schema";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, invalidateByPrefix } from "@/lib/queryClient";
import { BarcodeSvg } from "./barcode-svg";
import { printKeyLabels } from "./key-label-print";
import { formatLicensePlate } from "@/lib/format-utils";

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
  const [templateId, setTemplateId] = useState<string>("default");

  // Preselect the template marked as default once the list arrives.
  useEffect(() => {
    if (templateId !== "default") return;
    const preferred = labelTemplates?.find(tpl => tpl.isDefault);
    if (preferred) setTemplateId(String(preferred.id));
  }, [labelTemplates]);

  const selectedTemplate = labelTemplates?.find(tpl => String(tpl.id) === templateId) ?? null;

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
      toast({ title: t("label.regenerateError"), description: error.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("label.barcodeDialogTitle")}</DialogTitle>
          <DialogDescription>
            {vehicle.brand} {vehicle.model} ({formatLicensePlate(vehicle.licensePlate)})
          </DialogDescription>
        </DialogHeader>

        <div className="flex justify-center py-4">
          {vehicle.barcode && <BarcodeSvg value={vehicle.barcode} height={70} />}
        </div>

        {labelTemplates && labelTemplates.length > 0 && (
          <div className="space-y-2">
            <Label htmlFor="barcode-label-template">{t("templatePicker.label")}</Label>
            <Select value={templateId} onValueChange={setTemplateId}>
              <SelectTrigger id="barcode-label-template" data-testid="select-key-label-template">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="default">{t("templatePicker.defaultOption")}</SelectItem>
                {labelTemplates.map(tpl => (
                  <SelectItem key={tpl.id} value={String(tpl.id)}>
                    {tpl.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="flex gap-2">
          <Button
            onClick={() => printKeyLabels([vehicle], selectedTemplate)}
            className="flex-1"
            data-testid="button-print-key-label"
          >
            <Printer className="h-4 w-4 mr-2" />
            {t("label.printKeyLabel")}
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
