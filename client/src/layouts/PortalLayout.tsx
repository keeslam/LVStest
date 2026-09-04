import { useEffect, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { usePortalAuth } from "@/hooks/use-portal-auth";
import { LogOut, Loader2, ArrowLeft, Phone, Mail, MapPin } from "lucide-react";
import { PORTAL_SITE, isEmbedded } from "@/lib/portal-site";

/** Tells the embedding website how tall the document is, so the iframe can grow. */
export function usePortalHeightReporter(routeKey?: string) {
  useEffect(() => {
    if (window.parent === window) return;
    // The app root is the element that actually grows with the content; body/html
    // may be sized to the viewport by the global stylesheet.
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

interface TabDef { href: string; key: string; show: boolean }

/** Wordmark like the website header: "Lam Groep" over "AUTOLEASE". */
function Wordmark() {
  return (
    <a href={PORTAL_SITE.siteUrl} className="flex flex-col leading-tight" data-testid="portal-wordmark">
      <span className="text-[1.35rem] font-bold leading-none tracking-tight text-[#1a1d62]">{PORTAL_SITE.organization}</span>
      <span className="mt-1 text-[11px] font-semibold uppercase leading-none tracking-[0.22em] text-[#d98a0f]">{PORTAL_SITE.leaseBrand}</span>
    </a>
  );
}

/** Header, footer and page background in the website's house style; used when the portal is its own page. */
function SiteChrome({ children, right }: { children: ReactNode; right?: ReactNode }) {
  const { t } = useTranslation("portal");
  return (
    <div className="flex min-h-screen flex-col bg-[#f8fafc] text-[#0f172a]">
      <header className="sticky top-0 z-40 border-b border-[#f1f5f9] bg-white">
        <div className="mx-auto flex min-h-[4.5rem] max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <Wordmark />
          <div className="flex items-center gap-2">
            <a href={PORTAL_SITE.siteUrl} className="hidden items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-[#334155] hover:text-[#1a1d62] sm:inline-flex" data-testid="link-back-to-site">
              <ArrowLeft className="h-4 w-4" />{t("site.backToSite")}
            </a>
            {right}
          </div>
        </div>
      </header>
      <div className="flex-1">{children}</div>
      <footer className="bg-[#0b0d28] text-white/80">
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
            <p><a href={PORTAL_SITE.privacyUrl} className="hover:text-white">{t("site.privacy")}</a></p>
          </div>
        </div>
        <div className="border-t border-white/10 py-4 text-center text-xs text-white/50">© {new Date().getFullYear()} {PORTAL_SITE.organization}</div>
      </footer>
    </div>
  );
}

export function PortalLayout({ children }: { children: ReactNode }) {
  const { t } = useTranslation("portal");
  const { me, isLoading, logout } = usePortalAuth();
  const [location, navigate] = useLocation();
  usePortalHeightReporter(location);
  const embedded = isEmbedded();

  // Inside the nested /portaal router, location and navigate are relative to it.
  const isPublicPage = location.startsWith("/login") || location.startsWith("/activeren");

  useEffect(() => {
    if (!isLoading && !me && !isPublicPage) {
      navigate("/login", { replace: true });
    }
  }, [isLoading, me, isPublicPage, navigate]);

  if (isLoading) {
    const spinner = <div className="flex justify-center p-10"><Loader2 className="h-6 w-6 animate-spin" /></div>;
    return embedded ? spinner : <SiteChrome>{spinner}</SiteChrome>;
  }

  if (!me || isPublicPage) {
    const card = <div className="mx-auto max-w-md p-4">{children}</div>;
    if (embedded) return card;
    return (
      <SiteChrome>
        <div className="mx-auto max-w-md px-4 py-10 sm:py-16">
          <div className="rounded-2xl border border-[#f1f5f9] bg-white p-6 shadow-sm sm:p-8">{children}</div>
        </div>
      </SiteChrome>
    );
  }

  const tabs: TabDef[] = [
    { href: "/", key: "tabs.overview", show: true },
    { href: "/reserveringen", key: "tabs.reservations", show: true },
    { href: "/documenten", key: "tabs.documents", show: me.settings.canViewContracts },
    { href: "/bestuurders", key: "tabs.drivers", show: me.settings.canManageDrivers && me.role === "admin" },
    { href: "/bekeuringen", key: "tabs.fines", show: me.settings.canViewFines },
    { href: "/aanvragen", key: "tabs.requests", show: me.settings.canSubmitRequests },
    { href: "/account", key: "tabs.account", show: true },
  ];
  const logoutButton = (
    <Button variant="outline" size="sm" onClick={() => logout().then(() => navigate("/login"))} data-testid="button-portal-logout">
      <LogOut className="mr-2 h-4 w-4" />{t("actions.logout")}
    </Button>
  );
  const nav = (
    <nav className="flex flex-wrap gap-1 border-b" aria-label={t("site.navLabel")}>
      {tabs.filter((tab) => tab.show).map((tab) => {
        const active = tab.href === "/" ? location === "/" || location === "" : location.startsWith(tab.href);
        return (
          <Link key={tab.href} href={tab.href}
            className={`-mb-px border-b-2 px-3 py-2 text-sm ${active ? (embedded ? "border-primary font-medium" : "border-[#1a1d62] font-semibold text-[#1a1d62]") : "border-transparent text-muted-foreground hover:text-foreground"}`}>
            {t(tab.key)}
          </Link>
        );
      })}
    </nav>
  );

  if (embedded) {
    return (
      <div className="mx-auto max-w-5xl space-y-4 p-4">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b pb-3">
          <div>
            <div className="text-lg font-semibold">{me.customerName}</div>
            <div className="text-sm text-muted-foreground">{me.fullName}</div>
          </div>
          {logoutButton}
        </header>
        {nav}
        <main>{children}</main>
      </div>
    );
  }

  return (
    <SiteChrome right={logoutButton}>
      <div className="border-b border-[#f1f5f9] bg-white">
        <div className="mx-auto max-w-6xl px-4 pt-6 sm:px-6">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#2a2f9c]">{t("site.eyebrow")}</p>
          <div className="mt-1 flex flex-wrap items-baseline justify-between gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-[#0f172a] sm:text-3xl">{me.customerName}</h1>
            <span className="text-sm text-[#64748b]">{me.fullName}</span>
          </div>
          <div className="mt-4">{nav}</div>
        </div>
      </div>
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">{children}</main>
    </SiteChrome>
  );
}
