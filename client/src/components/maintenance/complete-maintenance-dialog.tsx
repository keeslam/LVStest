import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { parseISO } from "date-fns";
import { Reservation, Vehicle, UserPermission } from "@shared/schema";
import { formatNl as format } from "@/lib/format-date-nl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RequiresPermission } from "@/components/ui/requires-permission";
import { useToast } from "@/hooks/use-toast";
import { invalidateRelatedQueries } from "@/lib/queryClient";
import { submitMaintenanceCompletion, type CompleteMaintenanceFields } from "@/lib/complete-maintenance";
import { displayLicensePlate } from "@/lib/utils";
import { formatMaintenanceType } from "@/lib/format-utils";

interface CompleteMaintenanceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The maintenance block being finished, as the calendar found it. */
  block: Reservation | null;
  /** The vehicle behind the block (read-only summary at the top of the dialog). */
  vehicle: Vehicle | undefined;
  /** Pre-filled APK date (the vehicle's own, or the next one worked out from its age). */
  initialApkDate: string;
  /** Pre-filled odometer reading (the vehicle's current one). */
  initialMileage: string;
  /** Called after a successful completion, once the dialog has closed itself. */
  onCompleted?: () => void;
}

/**
 * "Onderhoud afronden" (B-37). One request, one error path, nothing half done:
 * the server writes the closed block, the APK date, the odometer reading and
 * the APK file in one transaction, and refuses a reading below the vehicle's
 * current one before anything changes.
 */
export function CompleteMaintenanceDialog({
  open,
  onOpenChange,
  block,
  vehicle,
  initialApkDate,
  initialMileage,
  onCompleted,
}: CompleteMaintenanceDialogProps) {
  const { t } = useTranslation(["maintenance", "common"]);
  const { toast } = useToast();

  // The completion date starts at the block's start date, as it always did: the
  // desk changes it when the repair took longer.
  const [completionDate, setCompletionDate] = useState("");
  const [apkDate, setApkDate] = useState("");
  const [apkFile, setApkFile] = useState<File | null>(null);
  const [details, setDetails] = useState("");
  const [category, setCategory] = useState("scheduled_maintenance");
  const [mileage, setMileage] = useState("");

  const blockId = block?.id ?? null;
  const blockStartDate = block?.startDate ?? "";
  useEffect(() => {
    if (!open || blockId === null) return;
    setCompletionDate(blockStartDate ? format(parseISO(blockStartDate), "yyyy-MM-dd") : "");
    setApkDate(initialApkDate);
    setMileage(initialMileage);
    setApkFile(null);
    setDetails("");
    setCategory("scheduled_maintenance");
  }, [open, blockId, blockStartDate, initialApkDate, initialMileage]);

  const completeMutation = useMutation({
    mutationFn: async () => {
      if (!block) throw new Error("Missing required data");

      const maintenanceType = block.notes?.split(":")[0] || t("calendarPage.maintenanceTypeFallback");
      const notes = details
        ? `${maintenanceType}:\n${details}`
        : block.notes || t("calendarPage.maintenanceCompletedNotesFallback");
      const reading = parseInt(mileage, 10);

      const fields: CompleteMaintenanceFields = {
        completionDate,
        maintenanceCategory: category,
        notes,
        ...(apkDate ? { apkDate } : {}),
        ...(reading > 0 ? { currentMileage: reading } : {}),
      };
      return submitMaintenanceCompletion(block.id, fields, apkFile);
    },
    onSuccess: () => {
      invalidateRelatedQueries("reservations", { vehicleId: block?.vehicleId });
      invalidateRelatedQueries("vehicles");
      if (apkFile) invalidateRelatedQueries("documents", { vehicleId: block?.vehicleId });

      onOpenChange(false);
      onCompleted?.();

      toast({
        title: t("calendarPage.toasts.maintenanceCompletedTitle"),
        description: details
          ? t("calendarPage.toasts.maintenanceCompletedWithDetails", {
              details: `${details.substring(0, 50)}${details.length > 50 ? "..." : ""}`,
            })
          : t("calendarPage.toasts.maintenanceCompletedNoDetails"),
      });
    },
    onError: (error: Error & { code?: string; current?: number | null; given?: number | null }) => {
      console.error("Failed to complete maintenance:", error);
      // The server refuses a reading below the vehicle's current one before it
      // changes anything; say which numbers it compared. Everything else is the
      // one generic failure - the dialog stays open and nothing was saved.
      toast({
        title: t("common:status.error"),
        description:
          error.code === "MILEAGE_LOWER_THAN_CURRENT"
            ? t("calendarPage.toasts.mileageLowerThanCurrent", {
                given: error.given?.toLocaleString() ?? "?",
                current: error.current?.toLocaleString() ?? "?",
              })
            : t("calendarPage.toasts.completeFailedDescription"),
        variant: "destructive",
      });
    },
  });

  const maintenanceType = block
    ? formatMaintenanceType(block.notes?.split(":")[0]) || t("calendarPage.maintenanceTypeFallback")
    : "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto" data-testid="dialog-complete-maintenance">
        <DialogHeader>
          <DialogTitle>{t("calendarPage.completeMaintenanceDialog.title")}</DialogTitle>
          <DialogDescription>
            {t("calendarPage.completeMaintenanceDialog.description")}
          </DialogDescription>
        </DialogHeader>

        {/* Vehicle Information Section */}
        {block && vehicle && (
          <div className="bg-muted/50 rounded-md p-4 mb-4 space-y-3">
            <div className="space-y-2">
              <h3 className="font-medium text-sm">{t("calendarPage.completeMaintenanceDialog.vehicleInfoHeading")}</h3>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <div className="flex items-center">
                  <span className="text-muted-foreground mr-1">{t("calendarPage.completeMaintenanceDialog.licenseLabel")}</span>
                  <span className="font-medium">{displayLicensePlate(vehicle.licensePlate)}</span>
                </div>
                <div className="flex items-center">
                  <span className="text-muted-foreground mr-1">{t("calendarPage.completeMaintenanceDialog.vehicleLabel")}</span>
                  <span className="font-medium">{vehicle.brand} {vehicle.model}</span>
                </div>
                <div className="flex items-center">
                  <span className="text-muted-foreground mr-1">{t("calendarPage.completeMaintenanceDialog.maintenanceTypeLabel")}</span>
                  <span className="font-medium">{maintenanceType}</span>
                </div>
                {vehicle.currentMileage !== undefined && vehicle.currentMileage !== null && (
                  <div className="flex items-center">
                    <span className="text-muted-foreground mr-1">{t("calendarPage.completeMaintenanceDialog.lastKnownMileageLabel")}</span>
                    <span className="font-medium">{vehicle.currentMileage.toLocaleString()} km</span>
                  </div>
                )}
                {vehicle.apkDate && (
                  <div className="flex items-center">
                    <span className="text-muted-foreground mr-1">{t("calendarPage.completeMaintenanceDialog.currentApkLabel")}</span>
                    <span className="font-medium">{format(parseISO(vehicle.apkDate), "d MMM yyyy")}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="space-y-4">
          {/* Row 1: Dates side by side */}
          <div className="border rounded-lg p-4 bg-slate-50 space-y-4">
            <h3 className="font-semibold text-base">{t("calendarPage.completeMaintenanceDialog.completionDetailsHeading")}</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">{t("calendarPage.completeMaintenanceDialog.completionDateLabel")}</label>
                <Input
                  type="date"
                  value={completionDate}
                  onChange={(e) => setCompletionDate(e.target.value)}
                  className="mt-2 bg-white"
                  data-testid="input-completion-date"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {t("calendarPage.completeMaintenanceDialog.completionDateHint")}
                </p>
              </div>
              <div>
                <label className="text-sm font-medium">{t("calendarPage.completeMaintenanceDialog.apkDateLabel")}</label>
                <Input
                  type="date"
                  value={apkDate}
                  onChange={(e) => setApkDate(e.target.value)}
                  className="mt-2 bg-white"
                  data-testid="input-apk-date"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {t("calendarPage.completeMaintenanceDialog.apkDateHint")}
                </p>
              </div>
            </div>

            {/* APK Form upload */}
            <div>
              <label className="text-sm font-medium">{t("calendarPage.completeMaintenanceDialog.apkFormLabel")}</label>
              <Input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    setApkFile(file);
                  }
                }}
                className="mt-2 bg-white"
                data-testid="input-apk-form"
              />
              {apkFile && (
                <p className="text-xs text-green-600 mt-1">
                  {t("calendarPage.completeMaintenanceDialog.selectedFileLabel", { name: apkFile.name })}
                </p>
              )}
            </div>
          </div>

          {/* Service Details Section */}
          <div className="border rounded-lg p-4 bg-blue-50 space-y-4">
            <h3 className="font-semibold text-base">{t("calendarPage.completeMaintenanceDialog.serviceDetailsHeading")}</h3>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">{t("calendarPage.completeMaintenanceDialog.serviceCategoryLabel")}</label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger className="mt-2 bg-white" data-testid="select-maintenance-category">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="scheduled_maintenance">{t("maintenance:listDialog.scheduledMaintenance")}</SelectItem>
                    <SelectItem value="repair">{t("calendarPage.completeMaintenanceDialog.repairOption")}</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  {t("calendarPage.completeMaintenanceDialog.serviceCategoryHint")}
                </p>
              </div>
              <div>
                <label className="text-sm font-medium">{t("calendarPage.completeMaintenanceDialog.currentMileageLabel")}</label>
                <Input
                  type="number"
                  value={mileage}
                  onChange={(e) => setMileage(e.target.value)}
                  placeholder={t("calendarPage.completeMaintenanceDialog.odometerPlaceholder")}
                  className="mt-2 bg-white"
                  data-testid="input-current-mileage"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {t("calendarPage.completeMaintenanceDialog.currentMileageHint")}
                </p>
              </div>
            </div>

            {/* Maintenance Details full width */}
            <div>
              <label className="text-sm font-medium">{t("calendarPage.completeMaintenanceDialog.maintenanceDetailsLabel")}</label>
              <Textarea
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                placeholder={
                  category === "scheduled_maintenance"
                    ? t("calendarPage.completeMaintenanceDialog.maintenanceDetailsPlaceholderScheduled")
                    : t("calendarPage.completeMaintenanceDialog.maintenanceDetailsPlaceholderRepair")
                }
                className="mt-2 bg-white"
                rows={3}
                data-testid="textarea-maintenance-details"
              />
              <p className="text-xs text-muted-foreground mt-1">
                {t("calendarPage.completeMaintenanceDialog.maintenanceDetailsHint")}
              </p>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {t("common:actions.cancel")}
            </Button>
            {/* The same rights as the endpoint: manage_maintenance or manage_reservations. */}
            <RequiresPermission anyOf={[UserPermission.MANAGE_MAINTENANCE, UserPermission.MANAGE_RESERVATIONS]}>
              <Button
                className="bg-green-600 hover:bg-green-700"
                onClick={() => completeMutation.mutate()}
                disabled={!block || completeMutation.isPending}
                data-testid="button-complete-maintenance"
              >
                {t("calendarPage.completeButton")}
              </Button>
            </RequiresPermission>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
