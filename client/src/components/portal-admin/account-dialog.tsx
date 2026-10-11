import { describeApiError } from "@/lib/api-error";
import { useEffect, useMemo, useState, type ReactNode, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { Customer, Driver } from "@shared/schema";
import { apiRequest, invalidateByPrefix } from "@/lib/queryClient";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Checkbox } from "@/components/ui/checkbox";
import { PORTAL_FEATURE_KEYS, type PortalAccountPermissions } from "@shared/portal-types";
import { SearchListPicker } from "@/components/ui/search-list-picker";
import { SearchableCombobox, type ComboboxOption } from "@/components/ui/searchable-combobox";

export interface PortalAccountRow {
  id: number; customerId: number; email: string; fullName: string; role: "admin" | "driver"; driverId: number | null;
  active: boolean; activated: boolean; invitePending: boolean; lastLoginAt: string | null; lastSeenAt: string | null; customerName?: string;
  permissions?: PortalAccountPermissions;
}

// One shared empty list. A fresh `[]` default on every render changed the
// prefill effect's dependencies each time; with the effect setting state, the
// open dialog re-rendered without end and swallowed every click.
const NO_CUSTOMERS: Customer[] = [];
const NO_DRIVERS: Driver[] = [];

/** The person behind a customer: first + last name, else contact person, primary contact, driver. Empty when none is filled. */
function customerPerson(c: Customer): string {
  return [c.firstName, c.lastName].map((p) => p?.trim()).filter(Boolean).join(" ") || c.contactPerson || c.primaryContactName || c.driverName || "";
}

/** The `name` column when it says something the company and person texts do not (so a search on it still finds the customer). */
function extraCustomerName(c: Customer, person: string): string {
  const name = (c.name ?? "").trim();
  const same = (x: string | null | undefined) => (x ?? "").trim().toLowerCase() === name.toLowerCase();
  return name && !same(c.companyName) && !same(person) ? name : "";
}

/** Compact card under the customer field: which name is the company and which the person, and the main contact details. */
function CustomerSummary({ customer: c, driverCount }: { customer: Customer; driverCount: number | null }) {
  const { t } = useTranslation("portal");
  const person = customerPerson(c);
  const place = [c.postalCode, c.city].filter(Boolean).join(" ");
  const items: Array<[string, string | null | undefined]> = [
    // The `name` column is shown when it differs from the company and the person text.
    ["company", c.companyName],
    ["contact", person],
    ["name", extraCustomerName(c, person)],
    ["debtor", c.debtorNumber],
    ["phone", c.phone],
    ["email", c.email],
    ["address", place || null],
    ["drivers", driverCount === null ? null : String(driverCount)],
  ];
  return (
    <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-0.5 rounded-md bg-muted/50 px-3 py-2 text-xs md:grid-cols-3" data-testid="portal-customer-summary">
      {items.filter(([, v]) => v).map(([key, v]) => (
        <div key={key} className="min-w-0">
          <dt className="inline text-muted-foreground">{t(`admin.dialog.summary.${key}`)}: </dt>
          <dd className="inline break-words" data-testid={`summary-${key}`}>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * Create (invite) or edit a portal account. Without a `customerId` the dialog
 * starts with a searchable customer picker, so staff can invite from the
 * global Klantenportaal page as well as from the customer dialog.
 */
export function AccountDialog({ customerId: fixedCustomerId, account, children, open: controlledOpen, onOpenChange }: { customerId?: number; account?: PortalAccountRow; children?: ReactNode; open?: boolean; onOpenChange?: (open: boolean) => void }) {
  const { t } = useTranslation("portal");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = (o: boolean) => { if (onOpenChange) onOpenChange(o); else setUncontrolledOpen(o); };
  const [customerId, setCustomerId] = useState<number | null>(fixedCustomerId ?? account?.customerId ?? null);
  const [email, setEmail] = useState(account?.email ?? "");
  const [fullName, setFullName] = useState(account?.fullName ?? "");
  const [role, setRole] = useState<"admin" | "driver">(account?.role ?? "admin");
  const [driverId, setDriverId] = useState<string>(account?.driverId ? String(account.driverId) : "");
  const [permissions, setPermissions] = useState<PortalAccountPermissions>(account?.permissions ?? {});
  // Which fields still hold a suggested value (from the customer or driver) rather than something staff typed.
  const [autoFilled, setAutoFilled] = useState<{ email: boolean; fullName: boolean }>({ email: false, fullName: false });
  const [prefillSource, setPrefillSource] = useState<{ email: "customer" | "driver" | null; name: "customer" | "driver" | null }>({ email: null, name: null });
  // The row component stays mounted while the list is open: start every opening from the stored account.
  useEffect(() => {
    if (!open) return;
    setFullName(account?.fullName ?? ""); setRole(account?.role ?? "admin");
    setDriverId(account?.driverId ? String(account.driverId) : ""); setPermissions(account?.permissions ?? {});
  }, [open, account]);

  const needsPicker = fixedCustomerId === undefined && !account;
  const { data: customers = NO_CUSTOMERS } = useQuery<Customer[]>({ queryKey: ["/api/customers"], enabled: open && needsPicker });
  const { data: drivers = NO_DRIVERS, isFetched: driversLoaded } = useQuery<Driver[]>({ queryKey: [`/api/customers/${customerId}/drivers`], enabled: open && customerId !== null });
  const { data: customer } = useQuery<Customer>({ queryKey: [`/api/customers/${customerId}`], enabled: open && !account && customerId !== null });

  // Suggest the address and name: from the driver for a driver account, else from the customer.
  // Typed values are never overwritten; a suggestion is replaced when the source changes.
  useEffect(() => {
    if (!open || account) return;
    const driver = role === "driver" && driverId ? drivers.find((d) => String(d.id) === driverId) : undefined;
    // A driver without an e-mail address falls back to the customer address.
    const suggestedEmail = driver?.email || customer?.email || "";
    const suggestedName = driver ? driver.displayName : (customer ? customerPerson(customer) || customer.companyName || customer.name : "");
    setPrefillSource({ email: driver?.email ? "driver" : customer?.email ? "customer" : null, name: driver ? "driver" : customer ? "customer" : null });
    if (suggestedEmail && (email === "" || autoFilled.email)) { setEmail(suggestedEmail); setAutoFilled((a) => ({ ...a, email: true })); }
    if (suggestedName && (fullName === "" || autoFilled.fullName)) { setFullName(suggestedName); setAutoFilled((a) => ({ ...a, fullName: true })); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, account, customer, role, driverId, drivers]);

  // The combobox searches name, debtor number and the description itself, so every customer is an option.
  // "Bedrijf — contactpersoon" when both exist, so it is clear which name is the company and which the person.
  const customerOptions = useMemo<ComboboxOption[]>(() => customers.map((c) => {
    const person = customerPerson(c);
    return {
      value: String(c.id),
      label: c.companyName && person ? `${c.companyName} — ${person}` : c.companyName || person || c.name,
      // The description is searched too: the name column stays findable when the label shows the person.
      description: [c.debtorNumber ? `${t("admin.dialog.debtorNumber")} ${c.debtorNumber}` : null, extraCustomerName(c, person) || null].filter(Boolean).join(" · ") || undefined,
    };
  }), [customers, t]);
  // The chosen customer's row is already loaded with the list; the card needs no extra request.
  const chosenCustomer = needsPicker && customerId !== null ? customers.find((c) => c.id === customerId) : undefined;

  const save = useMutation({
    mutationFn: async () => {
      const body = { fullName, role, driverId: role === "driver" ? Number(driverId) : null, permissions };
      if (account) return (await apiRequest("PATCH", `/api/portal-admin/accounts/${account.id}`, body)).json();
      return (await apiRequest("POST", `/api/portal-admin/customers/${customerId}/accounts`, { ...body, email })).json();
    },
    onSuccess: (result) => {
      invalidateByPrefix("/api/portal-admin");
      queryClient.invalidateQueries({ queryKey: ["/api/portal-admin/customers", customerId, "accounts"] });
      if (!account) {
        toast({
          title: result.inviteSent ? t("admin.accounts.invited", { email }) : t("admin.accounts.inviteFailed"),
          variant: result.inviteSent ? "default" : "destructive",
        });
      }
      setOpen(false);
    },
    onError: (e: Error) => toast({ title: describeApiError(e), variant: "destructive" }),
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    if (customerId === null) { toast({ title: t("admin.dialog.customerRequired"), variant: "destructive" }); return; }
    if (role === "driver" && !driverId) { toast({ title: t("admin.dialog.driverRequired"), variant: "destructive" }); return; }
    save.mutate();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {children && <DialogTrigger asChild>{children}</DialogTrigger>}
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto" data-testid="dialog-portal-account">
        <DialogHeader><DialogTitle>{t("admin.dialog.title")}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          {/* The customer is one full-width field on top; below it two columns from md up (the
              account fields left, the rights right), one column on a phone. Kept compact so the
              dialog needs no scrolling at 1280x800 or 1366x768. */}
          {needsPicker && (
            <div className="space-y-1">
              <Label htmlFor="pa-customer">{t("admin.dialog.customer")}</Label>
              <SearchableCombobox id="pa-customer" options={customerOptions} value={customerId !== null ? String(customerId) : ""}
                onChange={(v) => { setCustomerId(v ? Number(v) : null); setDriverId(""); }}
                placeholder={t("admin.dialog.customerPlaceholder")} searchPlaceholder={t("admin.dialog.customerSearch")} emptyMessage={t("admin.dialog.customerNone")}
                data-testid="select-portal-customer" />
              {chosenCustomer && <CustomerSummary customer={chosenCustomer} driverCount={driversLoaded ? drivers.length : null} />}
            </div>
          )}
          <div className="grid gap-x-6 gap-y-3 md:grid-cols-2">
            <div className="space-y-3">
              <div>
                <Label htmlFor="pa-email">{t("admin.dialog.email")}</Label>
                <Input id="pa-email" type="email" value={email} disabled={Boolean(account)} onChange={(e) => { setEmail(e.target.value); setAutoFilled((a) => ({ ...a, email: false })); }} required data-testid="input-account-email" />
                {!account && autoFilled.email && prefillSource.email && <p className="mt-1 text-xs text-muted-foreground">{t(`admin.dialog.prefilledFrom.${prefillSource.email}`)}</p>}
              </div>
              <div><Label htmlFor="pa-name">{t("admin.dialog.fullName")}</Label><Input id="pa-name" value={fullName} onChange={(e) => { setFullName(e.target.value); setAutoFilled((a) => ({ ...a, fullName: false })); }} required data-testid="input-account-name" />
                {!account && autoFilled.fullName && prefillSource.name && <p className="mt-1 text-xs text-muted-foreground">{t(`admin.dialog.prefilledFrom.${prefillSource.name}`)}</p>}
              </div>
              <div>
                <Label htmlFor="pa-role">{t("admin.dialog.role")}</Label>
                <select id="pa-role" className="w-full rounded-md border px-3 py-2 text-sm" value={role} onChange={(e) => setRole(e.target.value as "admin" | "driver")}>
                  <option value="admin">{t("admin.accounts.role.admin")}</option>
                  <option value="driver">{t("admin.accounts.role.driver")}</option>
                </select>
              </div>
              {role === "driver" && (
                <div>
                  <Label htmlFor="pa-driver">{t("admin.dialog.driver")}</Label>
                  <SearchListPicker items={drivers.map((d) => ({ id: d.id, label: d.displayName, sub: d.email ?? null, search: `${d.firstName ?? ""} ${d.lastName ?? ""}` }))}
                    value={driverId ? Number(driverId) : null} onChange={(did) => setDriverId(did ? String(did) : "")}
                    searchPlaceholder={t("admin.fines.dialog.searchDriver")} emptyText={t("admin.fines.dialog.noDriver")} changeLabel={t("admin.fines.dialog.changeCustomer")}
                    hintText={(shown, total) => t("admin.fines.dialog.moreCustomers", { shown, total })} searchFrom={6} testId="account-driver-picker" />
                </div>
              )}
              </div>
            <div className="self-start rounded-md border p-3">
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="text-sm font-medium">{t("admin.dialog.permissions")}</span>
                {Object.values(permissions).some((v) => v === false) && (
                  <button type="button" className="text-xs underline text-muted-foreground" onClick={() => setPermissions({})} data-testid="button-permissions-reset">{t("admin.dialog.permissionsReset")}</button>
                )}
              </div>
              <p className="mb-2 text-xs leading-tight text-muted-foreground">{t("admin.dialog.permissionsHint")}</p>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                {PORTAL_FEATURE_KEYS.map((key) => (
                  <label key={key} className="flex items-center gap-2 text-[13px] leading-tight">
                    <Checkbox checked={permissions[key] !== false} onCheckedChange={(v) => setPermissions((p) => ({ ...p, [key]: v === true }))} data-testid={`checkbox-permission-${key}`} />
                    {t(`admin.settings.${key}`)}
                  </label>
                ))}
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>{t("admin.dialog.cancel")}</Button>
            <Button type="submit" disabled={save.isPending}>{account ? t("admin.dialog.save") : t("admin.accounts.invite")}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
