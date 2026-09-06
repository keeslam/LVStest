import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { portalFetch, PortalApiError } from "@/lib/portal-api";
import { usePortalAuth } from "@/hooks/use-portal-auth";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Avatar, btnPrimary } from "./ui";

/** Name and password of the logged-in portal user, as a dialog from the avatar or the Mijn account tab. */
export function PortalAccountDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation("portal");
  const { me, refresh } = usePortalAuth();
  const { toast } = useToast();
  const [fullName, setFullName] = useState(me?.fullName ?? "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  useEffect(() => { if (open) { setFullName(me?.fullName ?? ""); setCurrentPassword(""); setNewPassword(""); } }, [open, me?.fullName]);
  const fail = (e: unknown) => toast({ title: t(`errors.${e instanceof PortalApiError ? e.code : "PORTAL_SERVER_ERROR"}`), variant: "destructive" });

  async function saveName(e: FormEvent) {
    e.preventDefault();
    try { await portalFetch("PATCH", "/api/portal/me", { fullName }); await refresh(); toast({ title: t("account.nameSaved") }); } catch (err) { fail(err); }
  }
  async function savePassword(e: FormEvent) {
    e.preventDefault();
    try {
      await portalFetch("POST", "/api/portal/me/password", { currentPassword, newPassword });
      setCurrentPassword(""); setNewPassword("");
      toast({ title: t("account.passwordChanged") });
    } catch (err) { fail(err); }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md" data-testid="portal-account-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <Avatar name={me?.fullName} size="lg" accent />
            <span><span className="block">{t("account.title")}</span><span className="block text-sm font-normal text-[#64748b]">{me?.customerName} · {t(`admin.accounts.role.${me?.role ?? "admin"}`, { defaultValue: me?.role })}</span></span>
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={saveName} className="space-y-3 rounded-xl border border-[#e6e8f0] p-4">
          <div><Label htmlFor="acc-email">{t("fields.email")}</Label><Input id="acc-email" value={me?.email ?? ""} disabled /></div>
          <div><Label htmlFor="acc-name">{t("fields.fullName")}</Label><Input id="acc-name" value={fullName} onChange={(e) => setFullName(e.target.value)} required /></div>
          <Button type="submit" size="sm" className={btnPrimary}>{t("actions.save")}</Button>
        </form>
        <form onSubmit={savePassword} className="space-y-3 rounded-xl border border-[#e6e8f0] p-4">
          <h3 className="text-sm font-semibold">{t("account.changePassword")}</h3>
          <div><Label htmlFor="acc-cur">{t("fields.currentPassword")}</Label><Input id="acc-cur" type="password" autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required /></div>
          <div><Label htmlFor="acc-new">{t("fields.newPassword")}</Label><Input id="acc-new" type="password" autoComplete="new-password" minLength={10} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required /></div>
          <Button type="submit" size="sm" variant="outline">{t("actions.save")}</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
