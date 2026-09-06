import { createContext, useContext, useEffect, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { PortalMe } from "@shared/portal-types";
import { portalFetch, PortalApiError } from "@/lib/portal-api";

interface PortalAuthContextValue {
  me: PortalMe | null;
  isLoading: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}

const PortalAuthContext = createContext<PortalAuthContextValue | null>(null);
export const PORTAL_ME_KEY = ["portal", "/api/portal/me"] as const;

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
