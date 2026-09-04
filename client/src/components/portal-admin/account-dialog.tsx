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

export interface PortalAccountRow {
  id: number; customerId: number; email: string; fullName: string; role: "admin" | "driver"; driverId: number | null;
  active: boolean; activated: boolean; invitePending: boolean; lastLoginAt: string | null; lastSeenAt: string | null; customerName?: string;
  permissions?: PortalAccountPermissions;
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
  const [customerSearch, setCustomerSearch] = useState("");
  const [email, setEmail] = useState(account?.email ?? "");
  const [fullName, setFullName] = useState(account?.fullName ?? "");
  const [role, setRole] = useState<"admin" | "driver">(account?.role ?? "admin");
  const [driverId, setDriverId] = useState<string>(account?.driverId ? String(account.driverId) : "");
  const [permissions, setPermissions] = useState<PortalAccountPermissions>(account?.permissions ?? {});
  // The row component stays mounted while the list is open: start every opening from the stored account.
  useEffect(() => {
    if (!open) return;
    setFullName(account?.fullName ?? ""); setRole(account?.role ?? "admin");
    setDriverId(account?.driverId ? String(account.driverId) : ""); setPermissions(account?.permissions ?? {});
  }, [open, account]);

  const needsPicker = fixedCustomerId === undefined && !account;
  const { data: customers = [] } = useQuery<Customer[]>({ queryKey: ["/api/customers"], enabled: open && needsPicker });
  const { data: drivers = [] } = useQuery<Driver[]>({ queryKey: [`/api/customers/${customerId}/drivers`], enabled: open && customerId !== null });

  const customerOptions = useMemo(() => {
    const q = customerSearch.trim().toLowerCase();
    const list = q ? customers.filter((c) => `${c.companyName ?? ""} ${c.name} ${c.debtorNumber ?? ""}`.toLowerCase().includes(q)) : customers;
    return list.slice(0, 50);
  }, [customers, customerSearch]);

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
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
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
      <DialogContent>
        <DialogHeader><DialogTitle>{t("admin.dialog.title")}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          {needsPicker && (
            <div className="space-y-1">
              <Label htmlFor="pa-customer-search">{t("admin.dialog.customer")}</Label>
              <Input id="pa-customer-search" placeholder={t("admin.dialog.customerSearch")} value={customerSearch} onChange={(e) => setCustomerSearch(e.target.value)} />
              <select id="pa-customer" className="w-full rounded-md border px-3 py-2 text-sm" size={6} value={customerId ?? ""}
                onChange={(e) => { setCustomerId(e.target.value ? Number(e.target.value) : null); setDriverId(""); }} data-testid="select-portal-customer">
                {customerOptions.map((c) => <option key={c.id} value={c.id}>{c.companyName || c.name}{c.debtorNumber ? ` (${c.debtorNumber})` : ""}</option>)}
              </select>
            </div>
          )}
          <div><Label htmlFor="pa-email">{t("admin.dialog.email")}</Label><Input id="pa-email" type="email" value={email} disabled={Boolean(account)} onChange={(e) => setEmail(e.target.value)} required /></div>
          <div><Label htmlFor="pa-name">{t("admin.dialog.fullName")}</Label><Input id="pa-name" value={fullName} onChange={(e) => setFullName(e.target.value)} required /></div>
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
          <div className="rounded-md border p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-sm font-medium">{t("admin.dialog.permissions")}</span>
              {Object.values(permissions).some((v) => v === false) && (
                <button type="button" className="text-xs underline text-muted-foreground" onClick={() => setPermissions({})} data-testid="button-permissions-reset">{t("admin.dialog.permissionsReset")}</button>
              )}
            </div>
            <p className="mb-2 text-xs text-muted-foreground">{t("admin.dialog.permissionsHint")}</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {PORTAL_FEATURE_KEYS.map((key) => (
                <label key={key} className="flex items-center gap-2 text-sm">
                  <Checkbox checked={permissions[key] !== false} onCheckedChange={(v) => setPermissions((p) => ({ ...p, [key]: v === true }))} data-testid={`checkbox-permission-${key}`} />
                  {t(`admin.settings.${key}`)}
                </label>
              ))}
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
