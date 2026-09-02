import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { portalFetch, PortalApiError } from "@/lib/portal-api";
import { usePortalAuth } from "@/hooks/use-portal-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

export default function PortalAccountPage() {
  const { t } = useTranslation("portal");
  const { me, refresh } = usePortalAuth();
  const { toast } = useToast();
  const [fullName, setFullName] = useState(me?.fullName ?? "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
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
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">{t("account.title")}</h1>
      <Card><CardContent className="p-4">
        <form onSubmit={saveName} className="space-y-3">
          <div><Label htmlFor="acc-email">{t("fields.email")}</Label><Input id="acc-email" value={me?.email ?? ""} disabled /></div>
          <div><Label htmlFor="acc-name">{t("fields.fullName")}</Label><Input id="acc-name" value={fullName} onChange={(e) => setFullName(e.target.value)} required /></div>
          <Button type="submit" size="sm">{t("actions.save")}</Button>
        </form>
      </CardContent></Card>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">{t("account.changePassword")}</CardTitle></CardHeader>
        <CardContent className="p-4 pt-0">
          <form onSubmit={savePassword} className="space-y-3">
            <div><Label htmlFor="acc-cur">{t("fields.currentPassword")}</Label><Input id="acc-cur" type="password" autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required /></div>
            <div><Label htmlFor="acc-new">{t("fields.newPassword")}</Label><Input id="acc-new" type="password" autoComplete="new-password" minLength={10} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required /></div>
            <Button type="submit" size="sm">{t("actions.save")}</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
