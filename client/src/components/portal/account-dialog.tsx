import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { BellRing, Building2, Globe, KeyRound, Mail, User, Users, X } from "lucide-react";
import { ColleaguesPanel } from "./colleagues-panel";
import type { PortalCompanyEmails } from "@shared/portal-types";
import { COMPANY_DETAIL_FIELDS, type CompanyDetailField } from "@shared/portal-company";
import { composeStreetLine, splitStreetLine, type AddressLookupQuery, type AddressLookupResult } from "@shared/address";
import { portalFetch, PortalApiError } from "@/lib/portal-api";
import { usePortalAuth } from "@/hooks/use-portal-auth";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { AddressLookupRow } from "@/components/ui/address-lookup-row";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Avatar, btnPrimary } from "./ui";
import { LANGUAGE_NAMES, SUPPORTED_LANGUAGES, toSupportedLanguage } from "@shared/languages";

const emptyDetails = () => Object.fromEntries(COMPANY_DETAIL_FIELDS.map((k) => [k, ""])) as Record<CompanyDetailField, string>;
const detailsOf = (d?: Partial<Record<CompanyDetailField, string | null>>) => Object.fromEntries(COMPANY_DETAIL_FIELDS.map((k) => [k, d?.[k] ?? ""])) as Record<CompanyDetailField, string>;
/** The street line is stored as one text ("Coolsingel 4A"); the form edits it as street, house number and addition. */
type StreetParts = { street: string; houseNumber: string; addition: string };
type AddressKind = "address" | "billingAddress";
const ADDRESS_KEYS: Record<AddressKind, { postal: CompanyDetailField; city: CompanyDetailField }> = {
  address: { postal: "postalCode", city: "city" },
  billingAddress: { postal: "billingPostalCode", city: "billingCity" },
};
const toParts = (line: string): StreetParts => { const p = splitStreetLine(line); return { street: p.street, houseNumber: p.number, addition: p.addition }; };
const lookupAddress = (q: AddressLookupQuery) => portalFetch<AddressLookupResult>("GET", `/api/portal/address-lookup?postcode=${encodeURIComponent(q.postcode)}&number=${encodeURIComponent(q.number)}&addition=${encodeURIComponent(q.addition ?? "")}`);
/** An empty country counts as the Netherlands, like the stored default. */
const isDutch = (country: string) => !country.trim() || /^(nederland|netherlands|the netherlands|nl|holland)$/i.test(country.trim());
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
  const [details, setDetails] = useState<Record<CompanyDetailField, string>>(() => emptyDetails());
  const [parts, setParts] = useState<Record<AddressKind, StreetParts>>({ address: toParts(""), billingAddress: toParts("") });
  const [emailsPassword, setEmailsPassword] = useState("");
  const [requestingName, setRequestingName] = useState(false);
  const [newName, setNewName] = useState("");
  const [company, setCompany] = useState<Record<keyof PortalCompanyEmails, string>>({ email: "", emailForMOT: "", emailForInvoices: "", emailGeneral: "" });
  useEffect(() => {
    if (!open) return;
    setFullName(me?.fullName ?? ""); setLanguage(me?.languageOverride ?? ""); setCurrentPassword(""); setNewPassword("");
    setChangingEmail(false); setNewEmail(""); setEmailPassword("");
    const d = detailsOf(me?.companyDetails);
    setDetails(d); setParts({ address: toParts(d.address), billingAddress: toParts(d.billingAddress) });
    setRequestingName(false); setNewName(""); setEmailsPassword("");
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
  // These addresses decide where invoices and fines go, so changing one asks for the password again.
  const emailsChanged = COMPANY_FIELDS.some((k) => company[k].trim() !== (me?.company?.[k] ?? ""));
  // One save button for the whole tab; only the part that really changed goes to the server.
  async function saveCompany(e: FormEvent) {
    e.preventDefault();
    try {
      const before = detailsOf(me?.companyDetails);
      if (COMPANY_DETAIL_FIELDS.some((k) => details[k].trim() !== before[k])) await portalFetch("PATCH", "/api/portal/me/company-details", details);
      const emailsBefore = me?.company;
      if (COMPANY_FIELDS.some((k) => company[k].trim() !== (emailsBefore?.[k] ?? ""))) await portalFetch("PATCH", "/api/portal/me/company", { ...company, currentPassword: emailsPassword });
      await refresh(); toast({ title: t("account.detailsSaved") });
    } catch (err) { fail(err); }
  }
  async function requestNameChange(e: FormEvent) {
    e.preventDefault();
    try {
      await portalFetch("POST", "/api/portal/me/company-name", { newName });
      await refresh(); setRequestingName(false); setNewName(""); toast({ title: t("account.nameRequested") });
    } catch (err) { fail(err); }
  }

  // A mail switch saves the moment it is flipped; the server answers with the fresh account.
  async function saveMail(path: "mail-preferences" | "company-mail", change: Record<string, boolean>) {
    try { await portalFetch("PATCH", `/api/portal/me/${path}`, change); await refresh(); toast({ title: t("account.mailSaved") }); } catch (err) { fail(err); }
  }
  // Edits to one address block: street, house number and addition live in `parts`, the stored line is recomposed from them.
  function editAddress(kind: AddressKind, patch: Partial<StreetParts & { postalCode: string; city: string }>) {
    const next = { ...parts[kind], ...(patch.street !== undefined && { street: patch.street }), ...(patch.houseNumber !== undefined && { houseNumber: patch.houseNumber }), ...(patch.addition !== undefined && { addition: patch.addition }) };
    setParts((p) => ({ ...p, [kind]: next }));
    const keys = ADDRESS_KEYS[kind];
    // The stored line is only rewritten when street, number or addition changed; a new postcode or city leaves it as it was.
    const touchesLine = patch.street !== undefined || patch.houseNumber !== undefined || patch.addition !== undefined;
    setDetails((d) => ({
      ...d,
      ...(touchesLine && { [kind]: composeStreetLine({ street: next.street, number: next.houseNumber, addition: next.addition }) }),
      ...(patch.postalCode !== undefined && { [keys.postal]: patch.postalCode }),
      ...(patch.city !== undefined && { [keys.city]: patch.city }),
    }));
  }
  const foundAddress = (kind: AddressKind) => (r: AddressLookupResult) => editAddress(kind, { street: r.street ?? "", city: r.city ?? "", postalCode: r.postalCode ?? "" });

  // One address block: the lookup row (postcode, number, addition) on top, then street, city and optionally the country.
  const addressBlock = (kind: AddressKind, titleKey: string, withCountry: boolean) => {
    const keys = ADDRESS_KEYS[kind];
    const idp = kind === "address" ? "acc-address" : "acc-billing";
    const tid = kind === "address" ? "address" : "billing";
    return (
      <section className="grid grid-cols-2 content-start gap-x-3 gap-y-2">
        <h4 className="col-span-2 text-xs font-semibold uppercase tracking-wide text-[#64748b]">{t(titleKey)}</h4>
        <AddressLookupRow className="col-span-2" idPrefix={idp} fetcher={lookupAddress} onFound={foundAddress(kind)}
          enabled={kind === "billingAddress" || isDutch(details.country)}
          value={{ postalCode: details[keys.postal], houseNumber: parts[kind].houseNumber, addition: parts[kind].addition }}
          onChange={(patch) => editAddress(kind, patch)} />
        <div className="col-span-2">
          <Label htmlFor={`${idp}-street`} className="text-xs">{t(`account.details.${kind}`)}</Label>
          <Input id={`${idp}-street`} className="h-9" value={parts[kind].street} onChange={(e) => editAddress(kind, { street: e.target.value })} maxLength={200} data-testid={`input-detail-${tid}-street`} />
        </div>
        <div className={withCountry ? undefined : "col-span-2"}>
          <Label htmlFor={`${idp}-city`} className="text-xs">{t(`account.details.${keys.city}`)}</Label>
          <Input id={`${idp}-city`} className="h-9" value={details[keys.city]} onChange={(e) => editAddress(kind, { city: e.target.value })} maxLength={200} data-testid={`input-detail-${keys.city}`} />
        </div>
        {withCountry && (
          <div>
            <Label htmlFor="acc-det-country" className="text-xs">{t("account.details.country")}</Label>
            <Input id="acc-det-country" className="h-9" value={details.country} onChange={(e) => setDetails({ ...details, country: e.target.value })} maxLength={200} data-testid="input-detail-country" />
          </div>
        )}
      </section>
    );
  };
  // A group of company fields in a two-column mini grid: short fields (postcode, city) share a row, the rest take the full width.
  const SHORT: CompanyDetailField[] = ["contactPerson", "phone"];
  const detailGroup = (titleKey: string, keys: CompanyDetailField[]) => (
    <section className="grid grid-cols-2 content-start gap-x-3 gap-y-2">
      <h4 className="col-span-2 text-xs font-semibold uppercase tracking-wide text-[#64748b]">{t(titleKey)}</h4>
      {keys.map((k) => (
        <div key={k} className={SHORT.includes(k) ? undefined : "col-span-2"}>
          <Label htmlFor={`acc-det-${k}`} className="text-xs">{t(`account.details.${k}`)}</Label>
          <Input id={`acc-det-${k}`} className="h-9" value={details[k]} onChange={(e) => setDetails({ ...details, [k]: e.target.value })} maxLength={200} data-testid={`input-detail-${k}`} />
        </div>
      ))}
    </section>
  );
  const mailSwitch = (id: string, label: string, checked: boolean, onChange: (v: boolean) => void, hint?: string) => (
    <div key={id} className="flex items-start justify-between gap-4 py-2">
      <div className="min-w-0">
        <Label htmlFor={id} className="text-sm font-medium text-[#1a1d62]">{label}</Label>
        {hint && !checked && <p className="mt-1 text-xs text-amber-800" data-testid={`${id}-warning`}>{hint}</p>}
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} data-testid={id} />
    </div>
  );

  // One tab = one card with a title, a line of help and the content, so every tab reads the same.
  const panel = (value: string, icon: ReactNode, title: string, help: string | null, body: ReactNode) => (
    <TabsContent value={value} className="mt-0 rounded-xl border border-[#e6e8f0] bg-white p-4" data-testid={`account-${value}`}>
      {/* The tab label above already names this card, so the title is for screen readers only. */}
      <h3 className="sr-only">{title}</h3>
      {help && <p className="mb-3 text-xs text-[#64748b]">{help}</p>}
      <div>{body}</div>
    </TabsContent>
  );
  const canInviteColleagues = me?.role === "admin" && Boolean(me.settings.canInviteColleagues);
  const tabClass = "flex-1 gap-1.5 whitespace-nowrap rounded-none border-b-2 border-transparent px-3 py-2.5 text-sm font-medium text-[#64748b] data-[state=active]:border-[#f59e0b] data-[state=active]:bg-transparent data-[state=active]:text-[#1a1d62] data-[state=active]:shadow-none";

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-5xl" data-testid="portal-account-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <Avatar name={me?.fullName} size="lg" accent />
            <span><span className="block">{t("account.title")}</span><span className="block text-sm font-normal text-[#64748b]">{me?.customerName} · {t(`admin.accounts.role.${me?.role ?? "admin"}`, { defaultValue: me?.role })}</span></span>
          </DialogTitle>
        </DialogHeader>
        <Tabs defaultValue="profile" className="min-w-0">
          <TabsList className="mb-4 flex h-auto w-full justify-start overflow-x-auto rounded-none border-b border-[#e6e8f0] bg-transparent p-0">
            <TabsTrigger value="profile" className={tabClass} data-testid="tab-account-profile"><User className="h-4 w-4" />{t("account.tabProfile")}</TabsTrigger>
            <TabsTrigger value="security" className={tabClass} data-testid="tab-account-security"><KeyRound className="h-4 w-4" />{t("account.tabSecurity")}</TabsTrigger>
            <TabsTrigger value="mail" className={tabClass} data-testid="tab-account-mail"><BellRing className="h-4 w-4" />{t("account.tabMail")}</TabsTrigger>
            {me?.company && <TabsTrigger value="company" className={tabClass} data-testid="tab-account-company"><Building2 className="h-4 w-4" />{t("account.tabCompany")}</TabsTrigger>}
            {canInviteColleagues && <TabsTrigger value="colleagues" className={tabClass} data-testid="tab-account-colleagues"><Users className="h-4 w-4" />{t("account.tabColleagues")}</TabsTrigger>}
          </TabsList>

          {panel("profile", <User className="h-4 w-4" />, t("account.sectionProfile"), null, (
            <form onSubmit={saveProfile} className="grid max-w-3xl items-start gap-x-6 gap-y-3 sm:grid-cols-2">
              <div><Label htmlFor="acc-name">{t("fields.fullName")}</Label><Input id="acc-name" value={fullName} onChange={(e) => setFullName(e.target.value)} required /></div>
              <div>
                <Label htmlFor="acc-lang" className="flex items-center gap-1"><Globe className="h-3.5 w-3.5" />{t("account.language")}</Label>
                <select id="acc-lang" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={language} onChange={(e) => setLanguage(e.target.value)} data-testid="select-account-language">
                  <option value="">{t("account.languageDefault", { lang: LANGUAGE_NAMES[me?.languageOverride ? "nl" : toSupportedLanguage(me?.language)] })}</option>
                  {SUPPORTED_LANGUAGES.map((lang) => <option key={lang} value={lang} lang={lang}>{LANGUAGE_NAMES[lang]}</option>)}
                </select>
                <p className="mt-1 text-xs text-[#64748b]">{t("account.languageHint")}</p>
              </div>
              <Button type="submit" size="sm" className={`${btnPrimary} justify-self-start`} data-testid="button-save-profile">{t("actions.save")}</Button>
            </form>
          ))}

          {panel("security", <KeyRound className="h-4 w-4" />, t("account.tabSecurity"), null, (
            <div className="grid gap-6 sm:grid-cols-2">
              <div className="space-y-3" data-testid="account-email">
                <h4 className="flex items-center gap-2 text-sm font-semibold text-[#1a1d62]"><Mail className="h-4 w-4" />{t("account.sectionEmail")}</h4>
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
              <form onSubmit={savePassword} className="space-y-3 border-t border-[#e6e8f0] pt-6 sm:border-l sm:border-t-0 sm:pl-6 sm:pt-0" data-testid="account-password">
                <h4 className="flex items-center gap-2 text-sm font-semibold text-[#1a1d62]"><KeyRound className="h-4 w-4" />{t("account.changePassword")}</h4>
                <div><Label htmlFor="acc-cur">{t("fields.currentPassword")}</Label><Input id="acc-cur" type="password" autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required /></div>
                <div><Label htmlFor="acc-new">{t("fields.newPassword")}</Label><Input id="acc-new" type="password" autoComplete="new-password" minLength={10} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required /></div>
                <Button type="submit" size="sm" variant="outline">{t("actions.save")}</Button>
              </form>
            </div>
          ))}

          {panel("mail", <BellRing className="h-4 w-4" />, t("account.sectionMail"), t("account.mailHint"), me?.mailPreferences ? (
            <div className="space-y-5">
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wide text-[#64748b]">{t("account.mailYours")}</h4>
                <div className="divide-y divide-[#e6e8f0]">
                  {mailSwitch("mail-new-device", t("account.mailNewDevice"), me.mailPreferences.newDevice, (v) => saveMail("mail-preferences", { newDevice: v }), t("account.mailNewDeviceWarning"))}
                  {mailSwitch("mail-request-reply", t("account.mailRequestReply"), me.mailPreferences.requestReply, (v) => saveMail("mail-preferences", { requestReply: v }))}
                </div>
              </div>
              {me.companyMail && (
                <div className="border-t border-[#e6e8f0] pt-5">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-[#64748b]">{t("account.mailCompany")}</h4>
                  <p className="mt-1 text-xs text-[#64748b]">{t("account.mailCompanyHint")}</p>
                  <div className="divide-y divide-[#e6e8f0]">
                    {mailSwitch("mail-reservation-changes", t("account.mailReservationChanges"), me.companyMail.mailReservationChanges, (v) => saveMail("company-mail", { mailReservationChanges: v }))}
                    {mailSwitch("mail-maintenance", t("account.mailMaintenance"), me.companyMail.mailMaintenance, (v) => saveMail("company-mail", { mailMaintenance: v }))}
                    {mailSwitch("mail-documents", t("account.mailDocuments"), me.companyMail.mailDocuments, (v) => saveMail("company-mail", { mailDocuments: v }))}
                  </div>
                </div>
              )}
            </div>
          ) : null)}

          {me?.company && panel("company", <Building2 className="h-4 w-4" />, t("account.sectionCompany"), null, (
            <div className="space-y-4">
              <div className="space-y-1.5" data-testid="company-name-block">
                <Label htmlFor="acc-company-name" className="text-xs">{t("account.companyName")}</Label>
                <div className="flex gap-2">
                  <Input id="acc-company-name" className="h-9" value={me.companyDetails?.companyName ?? ""} disabled />
                  {!me.companyDetails?.pendingNameChange && !requestingName && (
                    <Button type="button" size="sm" variant="outline" className="shrink-0" onClick={() => setRequestingName(true)} data-testid="button-request-name-change">{t("account.requestNameChange")}</Button>
                  )}
                </div>
                <p className="text-xs text-[#64748b]">{t("account.companyNameHint")}</p>
                {me.companyDetails?.pendingNameChange && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900" data-testid="pending-name-change">{t("account.namePending", { name: me.companyDetails.pendingNameChange.newName })}</div>
                )}
                {requestingName && !me.companyDetails?.pendingNameChange && (
                  <form onSubmit={requestNameChange} className="flex flex-wrap items-end gap-2">
                    <div className="min-w-[12rem] flex-1"><Label htmlFor="acc-new-company-name" className="text-xs">{t("account.newCompanyName")}</Label><Input id="acc-new-company-name" className="h-9" value={newName} onChange={(e) => setNewName(e.target.value)} minLength={2} maxLength={200} required data-testid="input-new-company-name" /></div>
                    <Button type="button" size="sm" variant="outline" onClick={() => setRequestingName(false)}>{t("actions.cancel")}</Button>
                    <Button type="submit" size="sm" className={btnPrimary} data-testid="button-send-name-request">{t("account.sendNameRequest")}</Button>
                  </form>
                )}
              </div>
              <form onSubmit={saveCompany} className="space-y-3 border-t border-[#e6e8f0] pt-3">
                <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
                  <div className="space-y-4">
                    {addressBlock("address", "account.sectionAddress", true)}
                    {detailGroup("account.sectionContact", ["contactPerson", "phone"])}
                  </div>
                  <div className="space-y-4">
                    {addressBlock("billingAddress", "account.sectionBilling", false)}
                  </div>
                </div>
                <section className="space-y-2">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-[#64748b]">{t("account.sectionEmails")}</h4>
                  <div className="grid gap-x-4 gap-y-2 sm:grid-cols-2 lg:grid-cols-4">
                    {COMPANY_FIELDS.map((k) => (
                      <div key={k}>
                        <Label htmlFor={`acc-co-${k}`} className="text-xs">{t(`account.company.${k}`)}</Label>
                        <Input id={`acc-co-${k}`} className="h-9" type="email" value={company[k]} onChange={(e) => setCompany({ ...company, [k]: e.target.value })} placeholder={t("account.company.placeholder")} data-testid={`input-company-${k}`} />
                      </div>
                    ))}
                  </div>
                  {emailsChanged && (
                    <div className="max-w-sm" data-testid="emails-password-block">
                      <Label htmlFor="acc-emails-pw" className="text-xs">{t("account.confirmPassword")}</Label>
                      <Input id="acc-emails-pw" className="h-9" type="password" autoComplete="current-password" value={emailsPassword} onChange={(e) => setEmailsPassword(e.target.value)} required data-testid="input-emails-password" />
                      <p className="mt-1 text-xs text-[#64748b]">{t("account.confirmPasswordHint")}</p>
                    </div>
                  )}
                </section>
                <Button type="submit" size="sm" className={btnPrimary} data-testid="button-save-company">{t("actions.save")}</Button>
              </form>
            </div>
          ))}
          {/* Kees, 2026-10-18: admins invite and block colleagues; the office can switch this off per customer. */}
          {canInviteColleagues && panel("colleagues", <Users className="h-4 w-4" />, t("account.tabColleagues"), t("account.colleagues.help"), <ColleaguesPanel />)}
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
