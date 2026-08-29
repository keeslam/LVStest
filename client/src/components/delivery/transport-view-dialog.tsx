import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Price } from "@/components/ui/price";
import { Truck, MapPin, User, Euro, Pencil, ExternalLink } from "lucide-react";
import { formatDate } from "@/lib/format-utils";
import type { ReactNode } from "react";

// Purely presentational — decoupled from VehicleTransport/Reservation so the
// same read-only dialog can show either a real transport row or a
// reservation-driven delivery (which isn't a vehicle_transports row at all)
// without the caller having to fake up a schema object to fit one type.
export interface TransportViewData {
  title: string;
  vehicleLabel: string;
  isExternalVehicle?: boolean;
  replacementVehicleLabel?: ReactNode;
  typeLabel: string;
  statusBadge: ReactNode;
  routeLabel?: string | null;
  scheduledDate: string;
  completedDate?: string | null;
  distanceKm?: string | number | null;
  tollCost?: string | number | null;
  billable?: boolean;
  billableAmount?: string | number | null;
  invoicedBadge?: ReactNode;
  customerLabel?: string | null;
  driverName?: string | null;
  reason?: string | null;
  notes?: string | null;
  // Present only for a reservation-driven delivery — offers a way to jump to
  // the real record instead of an edit action, since there's no transport row
  // backing this view to edit.
  onOpenReservation?: () => void;
  // Present only for a real transport row.
  onEdit?: () => void;
}

interface TransportViewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: TransportViewData | null;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="text-sm">{children}</div>
    </div>
  );
}

export function TransportViewDialog({ open, onOpenChange, data }: TransportViewDialogProps) {
  const { t } = useTranslation(["delivery", "common"]);
  if (!data) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Truck className="h-4 w-4 text-muted-foreground shrink-0" />
            {data.vehicleLabel}
            {data.isExternalVehicle && (
              <Badge variant="outline" className="text-xs">{t('dashboardPage.externalVehicleBadge')}</Badge>
            )}
          </DialogTitle>
          <DialogDescription>{data.title}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label={t('dashboardPage.columnType')}>
              <Badge variant="outline">{data.typeLabel}</Badge>
            </Field>
            <Field label={t('dashboardPage.columnStatus')}>
              {data.statusBadge}
            </Field>
          </div>

          {data.replacementVehicleLabel && (
            <Field label={t('dashboardPage.columnReplacementVehicle')}>
              {data.replacementVehicleLabel}
            </Field>
          )}

          {data.routeLabel && (
            <Field label={t('dashboardPage.columnRoute')}>
              <div className="flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                {data.routeLabel}
              </div>
            </Field>
          )}

          <div className="grid grid-cols-2 gap-4">
            <Field label={t('dashboardPage.columnDate')}>{formatDate(data.scheduledDate)}</Field>
            {data.completedDate && (
              <Field label={t('transportDialog.completedDate')}>{formatDate(data.completedDate)}</Field>
            )}
          </div>

          {(data.distanceKm || data.tollCost) && (
            <div className="grid grid-cols-2 gap-4">
              <Field label={t('dashboardPage.columnDistance')}>
                {data.distanceKm ? `${Number(data.distanceKm)} km` : '-'}
              </Field>
              <Field label={t('dashboardPage.columnTollCost')}>
                {data.tollCost ? <Price value={Number(data.tollCost)} /> : '-'}
              </Field>
            </div>
          )}

          <Field label={t('dashboardPage.columnBilling')}>
            {data.billable ? (
              <div className="flex items-center gap-1">
                <Euro className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                {data.billableAmount ? <Price value={Number(data.billableAmount)} /> : '-'}
                {data.invoicedBadge}
              </div>
            ) : (
              <span className="text-muted-foreground">{t('dashboardPage.notBillable')}</span>
            )}
          </Field>

          {data.customerLabel && (
            <Field label={t('dashboardPage.columnCustomer')}>
              <div className="flex items-center gap-1">
                <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                {data.customerLabel}
              </div>
            </Field>
          )}

          {(data.driverName || data.reason || data.notes) && (
            <>
              <Separator />
              {data.driverName && <Field label={t('transportDialog.driver')}>{data.driverName}</Field>}
              {data.reason && <Field label={t('transportDialog.reason')}>{data.reason}</Field>}
              {data.notes && <Field label={t('common:fields.notes')}>{data.notes}</Field>}
            </>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t('common:actions.close')}
          </Button>
          {data.onOpenReservation && (
            <Button type="button" variant="outline" onClick={data.onOpenReservation}>
              <ExternalLink className="h-4 w-4 mr-2" />
              {t('dashboardPage.openReservationButton')}
            </Button>
          )}
          {data.onEdit && (
            <Button type="button" onClick={data.onEdit}>
              <Pencil className="h-4 w-4 mr-2" />
              {t('dashboardPage.editButtonTitle')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
