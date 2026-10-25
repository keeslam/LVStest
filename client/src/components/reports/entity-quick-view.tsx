/**
 * Rapporten herontwerp deel 1b, Task 3: the quick view of one record named in a report list
 * (a car, customer, reservation, fine, driver or invoice). It shows the main facts from the
 * endpoints the app already has, and "Openen in nieuw tabblad" opens the full record at its own
 * address while the report stays where it is.
 *
 * Rights: the same as the screens (EntityLink only offers the quick view with that right). A fact
 * that needs another right (the current renter, the number of reservations) is only asked for
 * with that right; the km reading only for the admin.
 */
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink } from "lucide-react";
import type { Customer, Driver, Reservation, Vehicle } from "@shared/schema";
import { UserPermission, UserRole } from "@shared/schema";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Price } from "@/components/ui/price";
import { useAuth } from "@/hooks/use-auth";
import { useHasPermission } from "@/hooks/use-has-permission";
import { apiRequest } from "@/lib/queryClient";
import { parseApiError } from "@/lib/api-error";
import { formatDateNl } from "@/lib/format-date-nl";
import { formatDate, formatLicensePlate, formatReservationStatus } from "@/lib/format-utils";

export type EntityKind = "vehicle" | "customer" | "reservation" | "fine" | "driver" | "invoice";

/** The rights that open the screen of each kind (shared/page-access.ts); drivers live under customers. */
export const ENTITY_RIGHTS: Record<EntityKind, readonly string[]> = {
  vehicle: [UserPermission.VIEW_VEHICLES, UserPermission.MANAGE_VEHICLES],
  customer: [UserPermission.VIEW_CUSTOMERS, UserPermission.MANAGE_CUSTOMERS],
  reservation: [UserPermission.VIEW_RESERVATIONS, UserPermission.MANAGE_RESERVATIONS],
  fine: [UserPermission.VIEW_FINES, UserPermission.MANAGE_FINES],
  driver: [UserPermission.VIEW_CUSTOMERS, UserPermission.MANAGE_CUSTOMERS],
  invoice: [UserPermission.MANAGE_EXPENSES],
};

/**
 * The full record in the app. A driver opens in its own view on the Bestuurders tab of its
 * customer, so its address needs the customer id (known once the driver is loaded).
 */
export function entityUrl(kind: EntityKind, id: number, customerId?: number | null): string | null {
  switch (kind) {
    case "vehicle": return `/vehicles?vehicle=${id}`;
    case "customer": return `/customers?customer=${id}`;
    case "reservation": return `/reservations?reservation=${id}`;
    // The address a notification about a fine already uses (pages/fines/index.tsx).
    case "fine": return `/fines?bekeuring=${id}`;
    case "driver": return customerId ? `/customers?customer=${customerId}&tab=drivers&driver=${id}` : null;
    // The invoice check dialog of the invoices by e-mail (components/expenses/invoice-inbox-dialog.tsx).
    case "invoice": return `/expenses?invoice=${id}`;
  }
}

const ENDPOINTS: Record<EntityKind, (id: number) => string> = {
  vehicle: (id) => `/api/vehicles/${id}`,
  customer: (id) => `/api/customers/${id}`,
  reservation: (id) => `/api/reservations/${id}`,
  fine: (id) => `/api/fines/${id}`,
  driver: (id) => `/api/drivers/${id}`,
  invoice: (id) => `/api/expenses/inbox/items/${id}`,
};

const NOT_FOUND = { notFound: true } as const;
type Loaded<T> = T | typeof NOT_FOUND;
const isNotFound = (v: unknown): v is typeof NOT_FOUND => typeof v === "object" && v !== null && (v as { notFound?: unknown }).notFound === true;

/** A gone record is an answer here, not a failure: no error toast, the dialog says so. */
async function fetchRecord<T>(url: string): Promise<Loaded<T>> {
  try {
    // Awaited here, so a body that is not JSON fails inside this try as well.
    return await (await apiRequest("GET", url)).json();
  } catch (error) {
    if (parseApiError(error).status === 404) return NOT_FOUND;
    throw error;
  }
}

interface FineRecord {
  offenceAt: string; licensePlate: string; totalAmount: string | number; status: string;
  customerName: string | null; driverName: string | null;
}
interface InvoiceRecord {
  status: string; fromAddress: string | null; mailDate: string | null; receivedAt: string;
  parsed: { vendor?: string; invoiceDate?: string; totalAmount?: number } | null;
}

function Field({ name, label, children }: { name: string; label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-0.5 sm:grid-cols-[10rem_1fr] sm:gap-2 py-1 text-sm" data-testid={`entity-field-${name}`}>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

export function EntityQuickView({ kind, id, label, open, onOpenChange }: {
  kind: EntityKind;
  id: number;
  /** The name as the list shows it; in the title. */
  label?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation(["reports", "expenses"]);
  const { user } = useAuth();
  const isAdmin = user?.role === UserRole.ADMIN;
  const canViewReservations = useHasPermission(UserPermission.VIEW_RESERVATIONS, UserPermission.MANAGE_RESERVATIONS);
  const url = ENDPOINTS[kind](id);
  const { data, isLoading, isError } = useQuery<Loaded<unknown>>({
    queryKey: [url, "quick-view"],
    queryFn: () => fetchRecord(url),
    enabled: open,
    staleTime: 0,
  });
  const record = data && !isNotFound(data) ? data : null;

  // Facts that need the reservation right on top of the record's own right.
  const { data: vehicleReservations } = useQuery<Reservation[]>({
    queryKey: [`/api/reservations/vehicle/${id}`],
    enabled: open && kind === "vehicle" && !!record && canViewReservations,
  });
  const { data: customerReservations } = useQuery<Reservation[]>({
    queryKey: [`/api/reservations/customer/${id}`],
    enabled: open && kind === "customer" && !!record && canViewReservations,
  });

  const f = (key: string) => t(`entity.fields.${key}`);
  const dash = "–";
  const day = (v: string | null | undefined) => (v ? formatDate(v) : dash);

  const body = (): ReactNode => {
    if (!record) return null;
    switch (kind) {
      case "vehicle": {
        const v = record as Vehicle;
        const renter = vehicleReservations?.find((r) => r.status === "picked_up" && r.type !== "maintenance_block");
        return (
          <>
            <Field name="licensePlate" label={f("licensePlate")}>{formatLicensePlate(v.licensePlate)}</Field>
            <Field name="brandModel" label={f("brandModel")}>{[v.brand, v.model].filter(Boolean).join(" ")}</Field>
            <Field name="apk" label={f("apk")}>{day(v.apkDate)}</Field>
            {isAdmin && (
              <Field name="mileage" label={f("mileage")}>
                {v.currentMileage != null ? `${v.currentMileage.toLocaleString("nl-NL")} km` : dash}
              </Field>
            )}
            {canViewReservations && (
              <Field name="renter" label={f("renter")}>
                {vehicleReservations ? (renter?.customer?.name ?? f("noRenter")) : dash}
              </Field>
            )}
          </>
        );
      }
      case "customer": {
        const c = record as Customer;
        const address = [c.address, c.city].filter(Boolean).join(", ");
        return (
          <>
            <Field name="email" label={f("email")}>{c.email || dash}</Field>
            <Field name="phone" label={f("phone")}>{c.phone || dash}</Field>
            <Field name="address" label={f("address")}>{address || dash}</Field>
            {canViewReservations && (
              <Field name="reservations" label={f("reservations")}>
                {customerReservations ? customerReservations.length.toLocaleString("nl-NL") : dash}
              </Field>
            )}
          </>
        );
      }
      case "reservation": {
        const r = record as Reservation;
        const vehicle = r.vehicle ? `${formatLicensePlate(r.vehicle.licensePlate)} · ${[r.vehicle.brand, r.vehicle.model].filter(Boolean).join(" ")}` : dash;
        const end = r.endDate ? formatDate(r.endDate) : t("reportsPage.customersTab.openEnded");
        return (
          <>
            <Field name="customer" label={f("customer")}>{r.customer?.name ?? dash}</Field>
            <Field name="vehicle" label={f("vehicle")}>{vehicle}</Field>
            <Field name="period" label={f("period")}>{`${formatDate(r.startDate)} – ${end}`}</Field>
            <Field name="status" label={f("status")}>{formatReservationStatus(r.status)}</Field>
            <Field name="amount" label={f("amount")}>{r.totalPrice != null ? <Price value={r.totalPrice} /> : dash}</Field>
          </>
        );
      }
      case "fine": {
        const fine = record as FineRecord;
        return (
          <>
            <Field name="date" label={f("date")}>{fine.offenceAt ? formatDateNl(fine.offenceAt, "short") : dash}</Field>
            <Field name="licensePlate" label={f("licensePlate")}>{formatLicensePlate(fine.licensePlate)}</Field>
            <Field name="amount" label={f("amount")}><Price value={fine.totalAmount} /></Field>
            <Field name="status" label={f("status")}>{t(`moneyReports.fines.statuses.${fine.status}`, { defaultValue: fine.status })}</Field>
            <Field name="customer" label={f("customer")}>{fine.customerName ?? dash}</Field>
            <Field name="driver" label={f("driver")}>{fine.driverName ?? dash}</Field>
          </>
        );
      }
      case "driver": {
        const d = record as Driver;
        return (
          <>
            <Field name="email" label={f("email")}>{d.email || dash}</Field>
            <Field name="phone" label={f("phone")}>{d.phone || dash}</Field>
          </>
        );
      }
      case "invoice": {
        const inv = record as InvoiceRecord;
        const date = inv.parsed?.invoiceDate ?? inv.mailDate ?? inv.receivedAt;
        return (
          <>
            <Field name="vendor" label={f("vendor")}>{inv.parsed?.vendor || inv.fromAddress || dash}</Field>
            <Field name="date" label={f("date")}>{day(date)}</Field>
            <Field name="amount" label={f("amount")}>{inv.parsed?.totalAmount != null ? <Price value={inv.parsed.totalAmount} /> : dash}</Field>
            <Field name="status" label={f("status")}>{t(`expenses:invoiceInbox.tabs.${inv.status}`, { defaultValue: inv.status })}</Field>
          </>
        );
      }
    }
  };

  const fullUrl = entityUrl(kind, id, kind === "driver" ? (record as Driver | null)?.customerId : undefined);
  const title = [t(`entity.titles.${kind}`), label || (kind === "driver" ? (record as Driver | null)?.displayName : undefined)].filter(Boolean).join(" · ");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" data-testid={`dialog-entity-${kind}`} aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <p className="py-4 text-sm text-muted-foreground" data-testid="entity-loading">{t("reportKit.loading")}</p>
        ) : isError ? (
          <p className="py-4 text-sm text-destructive" data-testid="entity-error">{t("entity.loadFailed")}</p>
        ) : isNotFound(data) ? (
          <p className="py-4 text-sm text-muted-foreground" data-testid="entity-not-found">{t("entity.notFound")}</p>
        ) : (
          <dl className="divide-y">{body()}</dl>
        )}
        <div className="flex justify-end">
          <Button
            variant="outline"
            size="sm"
            disabled={!fullUrl || isNotFound(data)}
            onClick={() => { if (fullUrl) window.open(fullUrl, "_blank", "noopener"); }}
            data-testid="button-entity-open"
          >
            <ExternalLink className="mr-1 h-4 w-4" aria-hidden="true" />{t("entity.open")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
