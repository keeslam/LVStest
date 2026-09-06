import { useEffect, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { usePortalAuth } from "@/hooks/use-portal-auth";
import { LogOut, Loader2, ArrowLeft, Phone, Mail, MapPin, Home, CalendarDays, FileText, Users, Receipt, Inbox, UserCircle, MoreHorizontal, ExternalLink, Car } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useState } from "react";
import { PORTAL_SITE, isEmbedded } from "@/lib/portal-site";
import { Avatar, useGreeting } from "@/components/portal/ui";
import { usePortalDialogs } from "@/hooks/use-portal-dialogs";
import { LanguageToggle } from "@/components/portal/language-toggle";
import { NotificationsBell } from "@/components/portal/notifications-bell";

/** Tells the embedding website how tall the document is, so the iframe can grow. */
export function usePortalHeightReporter(routeKey?: string) {
  useEffect(() => {
    if (window.parent === window) return;
    const root = document.getElementById("root");
    const measure = () => Math.max(root?.scrollHeight ?? 0, document.documentElement.scrollHeight);
    let last = 0;
    const send = () => { const h = measure(); if (h !== last) { last = h; window.parent.postMessage({ type: "lamgroep-portal:height", height: h }, "*"); } };
    send();
    const timer = window.setTimeout(send, 300);
    const observer = new ResizeObserver(send);
    observer.observe(document.body);
    if (root) observer.observe(root);
    const mutations = new MutationObserver(send);
    if (root) mutations.observe(root, { childList: true, subtree: true });
    return () => { window.clearTimeout(timer); observer.disconnect(); mutations.disconnect(); };
  }, [routeKey]);
}

interface TabDef { href: string; key: string; show: boolean; icon: ReactNode }

function Wordmark({ light }: { light?: boolean }) {
  return (
    <a href={PORTAL_SITE.siteUrl} className="flex flex-col leading-tight" data-testid="portal-wordmark">
      <span className={`text-[1.3rem] font-bold leading-none tracking-tight ${light ? "text-white" : "text-[#1a1d62]"}`}>{PORTAL_SITE.organization}</span>
      <span className="mt-1 text-[10px] font-semibold uppercase leading-none tracking-[0.22em] text-[#f5a623]">{PORTAL_SITE.leaseBrand}</span>
    </a>
  );
}

function SiteFooter() {
  const { t } = useTranslation("portal");
  const { me } = usePortalAuth();
  const privacyUrl = me?.info.privacyUrl || PORTAL_SITE.privacyUrl;
  return (
    <footer className="mt-8 bg-[#0b0d28] text-white/80">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:grid-cols-3 sm:px-6">
        <div>
          <p className="text-lg font-bold text-white">{PORTAL_SITE.organization}</p>
          <p className="mt-2 text-sm leading-relaxed">{t("site.footerText")}</p>
        </div>
        <div className="space-y-2 text-sm">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-white">{t("site.contact")}</p>
          <p className="flex items-start gap-2"><MapPin className="mt-0.5 h-4 w-4 shrink-0" />{PORTAL_SITE.street}, {PORTAL_SITE.postalCode} {PORTAL_SITE.city}</p>
          <p className="flex items-center gap-2"><Phone className="h-4 w-4 shrink-0" /><a href={`tel:${PORTAL_SITE.phoneE164}`} className="hover:text-white">{PORTAL_SITE.phoneDisplay}</a></p>
          <p className="flex items-center gap-2"><Mail className="h-4 w-4 shrink-0" /><a href={`mailto:${PORTAL_SITE.email}`} className="hover:text-white">{PORTAL_SITE.email}</a></p>
        </div>
        <div className="space-y-2 text-sm">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-white">{t("site.links")}</p>
          <p><a href={PORTAL_SITE.siteUrl} className="hover:text-white">lamgroep.nl</a></p>
          <p><a href={PORTAL_SITE.contactUrl} className="hover:text-white">{t("site.contact")}</a></p>
          <p><a href={privacyUrl} className="hover:text-white" data-testid="link-privacy">{t("site.privacy")}</a></p>
        </div>
      </div>
      <div className="border-t border-white/10 py-4 text-center text-xs text-white/50">© {new Date().getFullYear()} {PORTAL_SITE.organization}</div>
    </footer>
  );
}

/** Pill navigation: scrolls sideways on a phone, sits in one row on wider screens. */
function PillNav({ tabs, location, dark }: { tabs: TabDef[]; location: string; dark: boolean }) {
  const { t } = useTranslation("portal");
  return (
    <nav aria-label={t("site.navLabel")} className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden">
      <ul className="flex w-max gap-1.5 sm:w-auto sm:flex-wrap">
        {tabs.filter((tab) => tab.show).map((tab) => {
          const active = tab.href === "/" ? location === "/" || location === "" : location.startsWith(tab.href);
          const base = "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-2 text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#f5a623]";
          const cls = active
            ? `${base} bg-[#f5a623] font-semibold text-[#1a1d62]`
            : dark ? `${base} text-[#dfe2ff] hover:bg-white/10 hover:text-white` : `${base} text-[#334155] hover:bg-[#eef0fb] hover:text-[#1a1d62]`;
          return (
            <li key={tab.href}>
              <Link href={tab.href} className={cls} aria-current={active ? "page" : undefined} data-testid={`portal-tab-${tab.key.split(".").pop()}`}>
                {tab.icon}{t(tab.key)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/**
 * Phone navigation: four fixed tabs at the bottom plus "Meer" for the rest.
 * Sits above the home indicator (safe-area inset) and is hidden from sm up.
 */
function BottomNav({ tabs, location, onLogout }: { tabs: TabDef[]; location: string; onLogout: () => void }) {
  const { t } = useTranslation("portal");
  const { openAccount } = usePortalDialogs();
  const [more, setMore] = useState(false);
  const visible = tabs.filter((tab) => tab.show && tab.href !== "/account");
  const primary = visible.slice(0, 4);
  const rest = visible.slice(4);
  const isActive = (href: string) => (href === "/" ? location === "/" || location === "" : location.startsWith(href));
  const moreActive = rest.some((tab) => isActive(tab.href)) || location.startsWith("/account");
  const item = (active: boolean) => `flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium leading-tight ${active ? "text-[#1a1d62]" : "text-[#64748b]"}`;
  const iconWrap = (active: boolean) => `flex h-7 w-12 items-center justify-center rounded-full ${active ? "bg-[#f5a623] text-[#1a1d62]" : ""}`;
  return (
    <>
      <nav aria-label={t("site.navLabel")} className="fixed inset-x-0 bottom-0 z-40 border-t border-[#e6e8f0] bg-white pb-[env(safe-area-inset-bottom)] sm:hidden" data-testid="portal-bottom-nav">
        <ul className="flex items-stretch">
          {primary.map((tab) => (
            <li key={tab.href} className="flex flex-1">
              <Link href={tab.href} className={item(isActive(tab.href))} aria-current={isActive(tab.href) ? "page" : undefined} data-testid={`portal-bottom-${tab.key.split(".").pop()}`}>
                <span className={iconWrap(isActive(tab.href))}>{tab.icon}</span>
                <span className="truncate">{t(tab.key)}</span>
              </Link>
            </li>
          ))}
          <li className="flex flex-1">
            <button type="button" onClick={() => setMore(true)} className={item(moreActive)} data-testid="portal-bottom-more">
              <span className={iconWrap(moreActive)}><MoreHorizontal className="h-4 w-4" /></span>
              <span>{t("site.more")}</span>
            </button>
          </li>
        </ul>
      </nav>
      <Dialog open={more} onOpenChange={setMore}>
        <DialogContent className="max-w-sm" data-testid="portal-more-dialog">
          <DialogHeader><DialogTitle>{t("site.more")}</DialogTitle></DialogHeader>
          <ul className="divide-y divide-[#e6e8f0] rounded-xl border border-[#e6e8f0]">
            {rest.map((tab) => (
              <li key={tab.href}>
                <Link href={tab.href} onClick={() => setMore(false)} className="flex items-center gap-3 px-4 py-3 text-sm font-medium text-[#0f172a] hover:bg-[#eef0fb]">{tab.icon}{t(tab.key)}</Link>
              </li>
            ))}
            <li><button type="button" onClick={() => { setMore(false); openAccount(); }} className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-medium text-[#0f172a] hover:bg-[#eef0fb]"><UserCircle className="h-4 w-4" />{t("tabs.account")}</button></li>
            <li><a href={PORTAL_SITE.siteUrl} className="flex items-center gap-3 px-4 py-3 text-sm font-medium text-[#0f172a] hover:bg-[#eef0fb]"><ExternalLink className="h-4 w-4" />{t("site.backToSite")}</a></li>
            <li><button type="button" onClick={onLogout} className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-medium text-[#a32d2d] hover:bg-[#fcebeb]"><LogOut className="h-4 w-4" />{t("actions.logout")}</button></li>
          </ul>
        </DialogContent>
      </Dialog>
    </>
  );
}

function AccountAvatar({ name }: { name: string }) {
  const { openAccount } = usePortalDialogs();
  const { t } = useTranslation("portal");
  return (
    <button type="button" onClick={openAccount} className="rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-[#f5a623]" aria-label={t("tabs.account")} data-testid="button-portal-account">
      <Avatar name={name} size="lg" accent />
    </button>
  );
}

export function PortalLayout({ children }: { children: ReactNode }) {
  const { t } = useTranslation("portal");
  const { me, isLoading, logout } = usePortalAuth();
  const [location, navigate] = useLocation();
  const greeting = useGreeting();
  usePortalHeightReporter(location);
  const embedded = isEmbedded();

  const isPublicPage = location.startsWith("/login") || location.startsWith("/activeren") || location.startsWith("/email-bevestigen");

  useEffect(() => {
    if (!isLoading && !me && !isPublicPage) navigate("/login", { replace: true });
  }, [isLoading, me, isPublicPage, navigate]);

  const spinner = <div className="flex justify-center p-10"><Loader2 className="h-6 w-6 animate-spin text-[#1a1d62]" /></div>;

  if (isLoading) {
    return embedded ? spinner : <div className="min-h-screen bg-[#f3f5fb]">{spinner}</div>;
  }

  if (!me || isPublicPage) {
    if (embedded) return <div className="mx-auto max-w-md p-4">{children}</div>;
    return (
      <div className="flex min-h-screen flex-col bg-[#f3f5fb] text-[#0f172a]">
        <header className="bg-white">
          <div className="mx-auto flex min-h-[4.5rem] max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
            <Wordmark />
            <div className="flex items-center gap-3">
              <LanguageToggle />
              <a href={PORTAL_SITE.siteUrl} className="inline-flex items-center gap-1.5 text-sm font-medium text-[#334155] hover:text-[#1a1d62]" data-testid="link-back-to-site"><ArrowLeft className="h-4 w-4" />{t("site.backToSite")}</a>
            </div>
          </div>
        </header>
        <div className="flex-1">
          <div className="mx-auto max-w-md px-4 py-8 sm:py-14">
            <div className="rounded-2xl border border-[#e6e8f0] bg-white p-6 shadow-sm sm:p-8">{children}</div>
          </div>
        </div>
        <SiteFooter />
      </div>
    );
  }

  const tabs: TabDef[] = [
    { href: "/", key: "tabs.overview", show: true, icon: <Home className="h-4 w-4" /> },
    { href: "/reserveringen", key: "tabs.reservations", show: true, icon: <CalendarDays className="h-4 w-4" /> },
    { href: "/voertuigen", key: "tabs.vehicles", show: true, icon: <Car className="h-4 w-4" /> },
    { href: "/documenten", key: "tabs.documents", show: me.settings.canViewContracts, icon: <FileText className="h-4 w-4" /> },
    { href: "/bestuurders", key: "tabs.drivers", show: me.settings.canManageDrivers && me.role === "admin", icon: <Users className="h-4 w-4" /> },
    { href: "/bekeuringen", key: "tabs.fines", show: me.settings.canViewFines, icon: <Receipt className="h-4 w-4" /> },
    { href: "/aanvragen", key: "tabs.requests", show: me.settings.canSubmitRequests, icon: <Inbox className="h-4 w-4" /> },
    { href: "/account", key: "tabs.account", show: true, icon: <UserCircle className="h-4 w-4" /> },
  ];
  const logoutButton = (
    <Button variant="ghost" size="sm" className={embedded ? "" : "hidden text-white hover:bg-white/10 hover:text-white sm:inline-flex"} onClick={() => logout().then(() => navigate("/login"))} data-testid="button-portal-logout">
      <LogOut className="mr-2 h-4 w-4" />{t("actions.logout")}
    </Button>
  );

  if (embedded) {
    return (
      <div className="mx-auto max-w-5xl space-y-4 p-4 text-[#0f172a]">
        <header className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <AccountAvatar name={me.fullName} />
            <div>
              <div className="font-semibold leading-tight">{me.customerName}</div>
              <div className="text-sm text-[#64748b]">{me.fullName}</div>
            </div>
          </div>
          <div className="flex items-center gap-2"><NotificationsBell /><LanguageToggle />{logoutButton}</div>
        </header>
        <div className="hidden sm:block"><PillNav tabs={tabs} location={location} dark={false} /></div>
        <main className="pb-20 sm:pb-0">{children}</main>
        <BottomNav tabs={tabs} location={location} onLogout={() => logout().then(() => navigate("/login"))} />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#f3f5fb] text-[#0f172a]">
      <header className="bg-[#1a1d62] text-white">
        <div className="mx-auto max-w-6xl px-4 pb-4 pt-4 sm:px-6 sm:pt-5">
          <div className="flex items-center justify-between gap-3">
            <Wordmark light />
            <div className="flex items-center gap-1 sm:gap-2">
              <NotificationsBell dark />
              <LanguageToggle dark className="mr-1" />
              <a href={PORTAL_SITE.siteUrl} className="hidden items-center gap-1.5 rounded-full px-3 py-2 text-sm text-[#dfe2ff] hover:bg-white/10 hover:text-white sm:inline-flex" data-testid="link-back-to-site">
                <ArrowLeft className="h-4 w-4" />{t("site.backToSite")}
              </a>
              {logoutButton}
            </div>
          </div>
          <div className="mt-4 flex items-center gap-3 sm:mt-6">
            <AccountAvatar name={me.fullName} />
            <div className="min-w-0">
              <p className="hidden text-[11px] font-semibold uppercase tracking-[0.18em] text-[#f5a623] sm:block">{t("site.eyebrow")}</p>
              <h1 className="truncate text-lg font-bold leading-tight sm:text-2xl">{greeting}, {me.fullName.split(" ")[0]}</h1>
              <p className="truncate text-sm text-[#c7cbf5]">{me.customerName}</p>
            </div>
          </div>
          <div className="mt-5 hidden sm:block"><PillNav tabs={tabs} location={location} dark /></div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-4 pb-24 sm:px-6 sm:py-7 sm:pb-7">{children}</main>
      <div className="hidden sm:block"><SiteFooter /></div>
      <BottomNav tabs={tabs} location={location} onLogout={() => logout().then(() => navigate("/login"))} />
    </div>
  );
}
