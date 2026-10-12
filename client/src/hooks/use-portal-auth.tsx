import { createContext, useContext, useEffect, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { PortalMe } from "@shared/portal-types";
import { portalFetch, PortalApiError } from "@/lib/portal-api";
import { setOfficeTimeZone } from "@/lib/office-timezone";

interface PortalAuthContextValue {
  me: PortalMe | null;
  isLoading: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}

const PortalAuthContext = createContext<PortalAuthContextValue | null>(null);
export const PORTAL_ME_KEY = ["portal", "/api/portal/me"] as const;
/** Set when a request found the session gone, so the login page can say so instead of just appearing. */
export const SESSION_EXPIRED_FLAG = "portal-session-expired";

export function PortalAuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const { i18n } = useTranslation();

  const { data, isLoading } = useQuery<PortalMe | null>({
    queryKey: PORTAL_ME_KEY,
    queryFn: async () => {
      try {
        return await portalFetch<PortalMe>("GET", "/api/portal/me");
      } catch (e) {
        if (e instanceof PortalApiError && (e.status === 401 || e.status === 403)) return null;
        throw e;
      }
    },
    staleTime: 60_000,
    retry: false,
  });

  // The session ends after an hour without activity. A page that finds out through any other request (not only /me) must
  // not keep showing stale data: it goes to the login page, which says why.
  useEffect(() => queryClient.getQueryCache().subscribe((event) => {
    if (event.type !== "updated" || event.action.type !== "error") return;
    const error = event.action.error;
    const key = event.query.queryKey;
    if (error instanceof PortalApiError && error.status === 401 && key[0] === "portal" && key[1] !== "/api/portal/me") {
      try { sessionStorage.setItem(SESSION_EXPIRED_FLAG, "1"); } catch { /* storage blocked: the notice is a nicety */ }
      queryClient.setQueryData(PORTAL_ME_KEY, null);
    }
  }), [queryClient]);

  // D11: the portal reads "today" on the office calendar the server uses.
  useEffect(() => {
    if (data?.officeTimeZone) setOfficeTimeZone(data.officeTimeZone);
  }, [data?.officeTimeZone]);

  // The portal follows the customer's preferred language, not the browser's.
  useEffect(() => {
    if (data?.language && i18n.language !== data.language) i18n.changeLanguage(data.language);
  }, [data?.language, i18n, i18n.language]);

  const refresh = async () => { await queryClient.invalidateQueries({ queryKey: PORTAL_ME_KEY }); };
  const logout = async () => {
    try { await portalFetch("POST", "/api/portal/logout"); } catch { /* session already gone */ }
    queryClient.removeQueries({ queryKey: ["portal"] });
    queryClient.setQueryData(PORTAL_ME_KEY, null);
  };

  return (
    <PortalAuthContext.Provider value={{ me: data ?? null, isLoading, refresh, logout }}>
      {children}
    </PortalAuthContext.Provider>
  );
}

export function usePortalAuth(): PortalAuthContextValue {
  const ctx = useContext(PortalAuthContext);
  if (!ctx) throw new Error("usePortalAuth must be used within PortalAuthProvider");
  return ctx;
}
