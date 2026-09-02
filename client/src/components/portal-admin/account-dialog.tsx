import { useState, type ReactNode, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { Driver } from "@shared/schema";
import { apiRequest, invalidateByPrefix } from "@/lib/queryClient";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

export interface PortalAccountRow {
  id: number; customerId: number; email: string; fullName: string; role: "admin" | "driver"; driverId: number | null;
  active: boolean; activated: boolean; invitePending: boolean; lastLoginAt: string | null; customerName?: string;
}

export function AccountDialog({ customerId, account, children }: { customerId: number; account?: PortalAccountRow; children: ReactNode }) {
  const { t } = useTranslation("portal");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState(account?.email ?? "");
  const [fullName, setFullName] = useState(account?.fullName ?? "");
  const [role, setRole] = useState<"admin" | "driver">(account?.role ?? "admin");
  const [driverId, setDriverId] = useState<string>(account?.driverId ? String(account.driverId) : "");
  const { data: drivers = [] } = useQuery<Driver[]>({ queryKey: [`/api/customers/${customerId}/drivers`], enabled: open });

  const save = useMutation({
    mutationFn: async () => {
      const body = { fullName, role, driverId: role === "driver" ? Number(driverId) : null };
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
    if (role === "driver" && !driverId) { toast({ title: t("admin.dialog.driverRequired"), variant: "destructive" }); return; }
    save.mutate();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>{t("admin.dialog.title")}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-3">
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
              <select id="pa-driver" className="w-full rounded-md border px-3 py-2 text-sm" value={driverId} onChange={(e) => setDriverId(e.target.value)}>
                <option value="">—</option>
                {drivers.map((d) => <option key={d.id} value={d.id}>{d.displayName}</option>)}
              </select>
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>{t("admin.dialog.cancel")}</Button>
            <Button type="submit" disabled={save.isPending}>{account ? t("admin.dialog.save") : t("admin.accounts.invite")}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
