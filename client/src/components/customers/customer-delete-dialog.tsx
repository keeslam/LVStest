import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Trans, useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
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
import { formatDutchDate } from "@shared/booking-warnings";
import { formatReservationStatus } from "@/lib/format-utils";

interface CustomerDeleteDialogProps {
  customerId: number;
  customerName: string;
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

interface CustomerDeleteImpact {
  customer?: { id: number; name: string; companyName?: string | null };
  counts: Record<string, number>;
  /** besluiten B-08: a current or future rental refuses the delete. */
  blocked?: boolean;
  blockingReservations?: Array<{
    id: number; vehicleId: number | null; startDate: string; endDate: string | null; status: string;
  }>;
  restorable?: boolean;
}

/**
 * `getCustomerDeleteImpact()` counts whatever the cascade snapshot holds, so
 * the keys are table names. The ones worth naming get a label; anything new
 * falls back to the readable form of the key rather than to nothing.
 */
const COUNT_LABEL_KEYS: Record<string, string> = {
  reservations: "reservations",
  drivers: "drivers",
  documents: "documents",
  portal_customer_settings: "portalSettings",
  portal_users: "portalUsers",
  blacklist: "blacklist",
};

const getCountLabel = (key: string, t: TFunction) =>
  t(`deleteDialog.countLabels.${COUNT_LABEL_KEYS[key] ?? key}`, {
    defaultValue: key.replace(/_/g, " "),
  });

/** Names are typed with stray spaces and in whatever case the keyboard was in. */
const normalizeName = (value: string) => value.trim().replace(/\s+/g, " ").toLowerCase();

/**
 * besluiten.md **B-08** (OPT-033, BUG-007) — "prullenbak plus blokkade bij een
 * lopende of toekomstige huur, **vooraf een duidelijke impactlijst**".
 *
 * PHASE 57: this dialog asked "Weet je zeker?" and deleted on one click. It
 * read neither `delete-impact` — so the six rentals, the driver and the portal
 * account that go along were invisible — nor the 409 the server answers while a
 * rental is live, so the refusal only arrived after the click. The vehicle
 * dialog has done both since wave 11; this is that pattern, for customers.
 */
export function CustomerDeleteDialog({
  customerId,
  customerName,
  children,
  onSuccess,
  open: controlledOpen,
  onOpenChange,
}: CustomerDeleteDialogProps) {
  const { t } = useTranslation(["customers", "common"]);
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

  // A name typed for one customer must never carry over to the next one.
  useEffect(() => {
    if (open) setConfirmation("");
  }, [open, customerId]);

  const { data: impact, isLoading: isLoadingImpact } = useQuery<CustomerDeleteImpact>({
    queryKey: [`/api/customers/${customerId}/delete-impact`],
    enabled: open,
  });

  const cascadeEntries = Object.entries(impact?.counts || {}).filter(([, count]) => count > 0);
  const blockingReservations = impact?.blockingReservations ?? [];
  const isBlocked = impact?.blocked === true;
  const confirmationMatches =
    confirmation.trim() !== "" && normalizeName(confirmation) === normalizeName(customerName);

  const deleteCustomerMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('DELETE', `/api/customers/${customerId}`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || t('deleteDialog.deleteFailed'));
      }

      // Handle 204 No Content or empty responses
      if (response.status === 204) {
        return null;
      }

      try {
        return await response.json();
      } catch {
        return null;
      }
    },
    onSuccess: () => {
      invalidateByPrefix("/api/customers");
      invalidateByPrefix("/api/reservations");
      invalidateByPrefix("/api/deleted-records");

      toast({
        title: t('deleteDialog.deletedTitle'),
        description: t('deleteDialog.deletedDescription', { name: customerName }),
        variant: "default"
      });

      setOpen(false);

      if (onSuccess) {
        onSuccess();
      }
    },
    onError: (error: Error) => {
      toast({
        title: t('common:status.error'),
        description: error.message || t('deleteDialog.deleteFailed'),
        variant: "destructive"
      });
    }
  });

  const handleDelete = () => {
    if (!confirmationMatches || isBlocked) return;
    deleteCustomerMutation.mutate();
  };

  // Custom trigger or default delete button
  const trigger = children || (
    <Button
      variant="destructive"
      size="sm"
      data-testid={`button-delete-customer-${customerId}`}
    >
      <Trash2 className="mr-2 h-4 w-4" />
      {t('common:actions.delete')}
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
              t={t}
              i18nKey="deleteDialog.description"
              values={{ name: customerName }}
              components={{ 1: <strong /> }}
            />
          </DialogDescription>
        </DialogHeader>

        {isBlocked && (
          <div
            className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-900"
            data-testid="customer-delete-blocked"
            role="alert"
          >
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <div className="space-y-1">
                <p className="font-medium">{t('deleteDialog.blockedTitle')}</p>
                <ul className="list-disc pl-4">
                  {blockingReservations.map((reservation) => (
                    <li key={reservation.id} data-testid={`blocking-reservation-${reservation.id}`}>
                      {t('deleteDialog.blockedReservation', {
                        id: reservation.id,
                        start: formatDutchDate(reservation.startDate),
                        end: reservation.endDate ? formatDutchDate(reservation.endDate) : '—',
                        status: formatReservationStatus(reservation.status),
                      })}
                    </li>
                  ))}
                </ul>
                <p className="text-red-800/80">{t('deleteDialog.blockedHint')}</p>
              </div>
            </div>
          </div>
        )}

        <div
          className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"
          data-testid="customer-delete-impact"
        >
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
              <p className="text-amber-800/80">{t('deleteDialog.restoreHint')}</p>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor={`confirm-customer-${customerId}`}>
            <Trans
              t={t}
              i18nKey="deleteDialog.typeToConfirm"
              values={{ name: customerName }}
              components={{ 1: <span className="font-semibold" /> }}
            />
          </Label>
          <Input
            id={`confirm-customer-${customerId}`}
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            placeholder={customerName}
            autoComplete="off"
            data-testid={`input-confirm-delete-${customerId}`}
          />
        </div>

        <DialogFooter className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={deleteCustomerMutation.isPending}
          >
            {t('common:actions.cancel')}
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            // besluiten B-08 — blocked is blocked: the server answers 409, so
            // the dialog does not let the employee get that far.
            disabled={deleteCustomerMutation.isPending || !confirmationMatches || isBlocked}
            data-testid={`button-confirm-delete-${customerId}`}
          >
            {deleteCustomerMutation.isPending ? t('deleteDialog.deleting') : t('deleteDialog.deleteCustomer')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
