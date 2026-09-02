import { useEffect, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { usePortalAuth } from "@/hooks/use-portal-auth";
import { LogOut, Loader2 } from "lucide-react";

/** Tells the embedding website how tall the document is, so the iframe can grow. */
export function usePortalHeightReporter() {
  useEffect(() => {
    if (window.parent === window) return;
    const send = () => window.parent.postMessage({ type: "lamgroep-portal:height", height: document.documentElement.scrollHeight }, "*");
    send();
    const observer = new ResizeObserver(send);
    observer.observe(document.body);
    return () => observer.disconnect();
  }, []);
}

interface TabDef { href: string; key: string; show: boolean }

export function PortalLayout({ children }: { children: ReactNode }) {
  const { t } = useTranslation("portal");
  const { me, isLoading, logout } = usePortalAuth();
  const [location, navigate] = useLocation();
  usePortalHeightReporter();

  // Inside the nested /portaal router, location and navigate are relative to it.
  const isPublicPage = location.startsWith("/login") || location.startsWith("/activeren");

  useEffect(() => {
    if (!isLoading && !me && !isPublicPage) {
      navigate("/login", { replace: true });
    }
  }, [isLoading, me, isPublicPage, navigate]);

  if (isLoading) {
    return <div className="flex justify-center p-10"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }
  if (!me || isPublicPage) return <div className="mx-auto max-w-md p-4">{children}</div>;

  const tabs: TabDef[] = [
    { href: "/", key: "tabs.overview", show: true },
    { href: "/reserveringen", key: "tabs.reservations", show: true },
    { href: "/documenten", key: "tabs.documents", show: me.settings.canViewContracts },
    { href: "/bestuurders", key: "tabs.drivers", show: me.settings.canManageDrivers && me.role === "admin" },
    { href: "/account", key: "tabs.account", show: true },
  ];

  return (
    <div className="mx-auto max-w-5xl p-4 space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b pb-3">
        <div>
          <div className="text-lg font-semibold">{me.customerName}</div>
          <div className="text-sm text-muted-foreground">{me.fullName}</div>
        </div>
        <Button variant="outline" size="sm" onClick={() => logout().then(() => navigate("/login"))}>
          <LogOut className="mr-2 h-4 w-4" />{t("actions.logout")}
        </Button>
      </header>
      <nav className="flex flex-wrap gap-1 border-b">
        {tabs.filter((tab) => tab.show).map((tab) => {
          const active = tab.href === "/" ? location === "/" || location === "" : location.startsWith(tab.href);
          return (
            <Link key={tab.href} href={tab.href}
              className={`px-3 py-2 text-sm border-b-2 -mb-px ${active ? "border-primary font-medium" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
              {t(tab.key)}
            </Link>
          );
        })}
      </nav>
      <main>{children}</main>
    </div>
  );
}
