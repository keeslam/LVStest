import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Building2, Globe, KeyRound, Mail, User, X } from "lucide-react";
import type { PortalCompanyEmails } from "@shared/portal-types";
import { portalFetch, PortalApiError } from "@/lib/portal-api";
import { usePortalAuth } from "@/hooks/use-portal-auth";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Avatar, btnPrimary } from "./ui";

const COMPANY_FIELDS: Array<keyof PortalCompanyEmails> = ["email", "emailForMOT", "emailForInvoices", "emailGeneral"];

/**
 * "Mijn account": name, language, login e-mail (changed only after a
 * confirmation mail to the new address), password, and for admin accounts the
 * company's contact addresses (general, APK, invoices).
 */
export function PortalAccountDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation("portal");
  const { me, refresh } = usePortalAuth();
  const { toast } = useToast();
  const [fullName, setFullName] = useState(me?.fullName ?? "");
  const [language, setLanguage] = useState<string>(me?.languageOverride ?? "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [changingEmail, setChangingEmail] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [emailPassword, setEmailPassword] = useState("");
  const [company, setCompany] = useState<Record<keyof PortalCompanyEmails, string>>({ email: "", emailForMOT: "", emailForInvoices: "", emailGeneral: "" });
  useEffect(() => {
    if (!open) return;
    setFullName(me?.fullName ?? ""); setLanguage(me?.languageOverride ?? ""); setCurrentPassword(""); setNewPassword("");
    setChangingEmail(false); setNewEmail(""); setEmailPassword("");
    setCompany({ email: me?.company?.email ?? "", emailForMOT: me?.company?.emailForMOT ?? "", emailForInvoices: me?.company?.emailForInvoices ?? "", emailGeneral: me?.company?.emailGeneral ?? "" });
  }, [open, me]);
  const fail = (e: unknown) => toast({ title: e instanceof PortalApiError ? t(`errors.${e.code}`, { defaultValue: e.message }) : t("errors.PORTAL_SERVER_ERROR"), variant: "destructive" });

  async function saveProfile(e: FormEvent) {
    e.preventDefault();
    try { await portalFetch("PATCH", "/api/portal/me", { fullName, language: language || null }); await refresh(); toast({ title: t("account.profileSaved") }); } catch (err) { fail(err); }
  }
  async function savePassword(e: FormEvent) {
    e.preventDefault();
    try {
      await portalFetch("POST", "/api/portal/me/password", { currentPassword, newPassword });
      setCurrentPassword(""); setNewPassword("");
      toast({ title: t("account.passwordChanged") });
    } catch (err) { fail(err); }
  }
  async function requestEmailChange(e: FormEvent) {
    e.preventDefault();
    try {
      await portalFetch("POST", "/api/portal/me/email", { newEmail, currentPassword: emailPassword });
      await refresh(); setChangingEmail(false); setNewEmail(""); setEmailPassword("");
      toast({ title: t("account.emailMailSent", { email: newEmail }) });
    } catch (err) { fail(err); }
  }
  async function cancelEmailChange() {
    try { await portalFetch("POST", "/api/portal/me/email/cancel"); await refresh(); toast({ title: t("account.emailChangeCancelled") }); } catch (err) { fail(err); }
  }
  async function saveCompany(e: FormEvent) {
    e.preventDefault();
    try { await portalFetch("PATCH", "/api/portal/me/company", company); await refresh(); toast({ title: t("account.companySaved") }); } catch (err) { fail(err); }
  }

  const section = (icon: ReactNode, title: string, body: ReactNode, testId?: string) => (
    <section className="space-y-3 rounded-xl border border-[#e6e8f0] bg-white p-4" data-testid={testId}>
      <h3 className="flex items-center gap-2 text-sm font-semibold text-[#1a1d62]">{icon}{title}</h3>
      {body}
    </section>
  );

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl" data-testid="portal-account-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <Avatar name={me?.fullName} size="lg" accent />
            <span><span className="block">{t("account.title")}</span><span className="block text-sm font-normal text-[#64748b]">{me?.customerName} · {t(`admin.accounts.role.${me?.role ?? "admin"}`, { defaultValue: me?.role })}</span></span>
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 md:grid-cols-2">
          {section(<User className="h-4 w-4" />, t("account.sectionProfile"), (
            <form onSubmit={saveProfile} className="space-y-3">
              <div><Label htmlFor="acc-name">{t("fields.fullName")}</Label><Input id="acc-name" value={fullName} onChange={(e) => setFullName(e.target.value)} required /></div>
              <div>
                <Label htmlFor="acc-lang" className="flex items-center gap-1"><Globe className="h-3.5 w-3.5" />{t("account.language")}</Label>
                <select id="acc-lang" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={language} onChange={(e) => setLanguage(e.target.value)} data-testid="select-account-language">
                  <option value="">{t("account.languageDefault", { lang: t(`languages.${me?.languageOverride ? "nl" : me?.language ?? "nl"}`) })}</option>
                  <option value="nl">{t("languages.nl")}</option>
                  <option value="en">{t("languages.en")}</option>
                </select>
                <p className="mt-1 text-xs text-[#64748b]">{t("account.languageHint")}</p>
              </div>
              <Button type="submit" size="sm" className={btnPrimary} data-testid="button-save-profile">{t("actions.save")}</Button>
            </form>
          ), "account-profile")}

          {section(<Mail className="h-4 w-4" />, t("account.sectionEmail"), (
            <div className="space-y-3">
              <div><Label htmlFor="acc-email">{t("account.currentEmail")}</Label><Input id="acc-email" value={me?.email ?? ""} disabled /></div>
              {me?.pendingEmail && (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900" data-testid="pending-email">
                  <span>{t("account.pendingEmail", { email: me.pendingEmail })}</span>
                  <button type="button" onClick={cancelEmailChange} className="inline-flex items-center gap-1 font-medium hover:underline"><X className="h-3 w-3" />{t("account.cancelEmailChange")}</button>
                </div>
              )}
              {changingEmail ? (
                <form onSubmit={requestEmailChange} className="space-y-3">
                  <div><Label htmlFor="acc-new-email">{t("account.newEmail")}</Label><Input id="acc-new-email" type="email" autoComplete="off" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} required data-testid="input-new-email" /></div>
                  <div><Label htmlFor="acc-email-pw">{t("fields.currentPassword")}</Label><Input id="acc-email-pw" type="password" autoComplete="current-password" value={emailPassword} onChange={(e) => setEmailPassword(e.target.value)} required data-testid="input-email-password" /></div>
                  <p className="text-xs text-[#64748b]">{t("account.emailHint")}</p>
                  <div className="flex gap-2">
                    <Button type="button" size="sm" variant="outline" onClick={() => setChangingEmail(false)}>{t("actions.cancel")}</Button>
                    <Button type="submit" size="sm" className={btnPrimary} data-testid="button-request-email-change">{t("account.sendConfirmation")}</Button>
                  </div>
                </form>
              ) : (
                <Button type="button" size="sm" variant="outline" onClick={() => setChangingEmail(true)} data-testid="button-change-email">{t("account.changeEmail")}</Button>
              )}
            </div>
          ), "account-email")}

          {section(<KeyRound className="h-4 w-4" />, t("account.changePassword"), (
            <form onSubmit={savePassword} className="space-y-3">
              <div><Label htmlFor="acc-cur">{t("fields.currentPassword")}</Label><Input id="acc-cur" type="password" autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required /></div>
              <div><Label htmlFor="acc-new">{t("fields.newPassword")}</Label><Input id="acc-new" type="password" autoComplete="new-password" minLength={10} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required /></div>
              <Button type="submit" size="sm" variant="outline">{t("actions.save")}</Button>
            </form>
          ), "account-password")}

          {me?.company && section(<Building2 className="h-4 w-4" />, t("account.sectionCompany"), (
            <form onSubmit={saveCompany} className="space-y-3">
              <p className="text-xs text-[#64748b]">{t("account.companyHint")}</p>
              {COMPANY_FIELDS.map((k) => (
                <div key={k}>
                  <Label htmlFor={`acc-co-${k}`}>{t(`account.company.${k}`)}</Label>
                  <Input id={`acc-co-${k}`} type="email" value={company[k]} onChange={(e) => setCompany({ ...company, [k]: e.target.value })} placeholder={t("account.company.placeholder")} data-testid={`input-company-${k}`} />
                </div>
              ))}
              <Button type="submit" size="sm" className={btnPrimary} data-testid="button-save-company">{t("actions.save")}</Button>
            </form>
          ), "account-company")}
        </div>
      </DialogContent>
    </Dialog>
  );
}
