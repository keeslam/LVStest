import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { LogOut, Monitor, Smartphone } from "lucide-react";
import type { PortalSessionDto } from "@shared/portal-types";
import { PortalApiError, portalFetch, portalQueryFn } from "@/lib/portal-api";
import { formatPortalDateTimeMedium } from "@/lib/portal-format";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";

const URL = "/api/portal/me/sessions";

/**
 * Mijn account > Inloggen: the browsers this account is logged in with (Kees, 2026-10-18), with a way
 * to sign out one of them or all others at once. This browser stays logged in.
 */
export function SessionsPanel() {
  const { t } = useTranslation("portal");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: sessions = [] } = useQuery<PortalSessionDto[]>({ queryKey: ["portal", URL], queryFn: portalQueryFn });
  const fail = (e: unknown) => toast({ title: t(`errors.${e instanceof PortalApiError ? e.code : "PORTAL_SERVER_ERROR"}`, { defaultValue: (e as Error).message }), variant: "destructive" });
  const others = useMutation({
    mutationFn: () => portalFetch<{ count: number; sessions: PortalSessionDto[] }>("POST", `${URL}/sign-out-others`),
    onSuccess: (r) => { queryClient.setQueryData(["portal", URL], r.sessions); toast({ title: t("account.sessions.signedOut", { count: r.count }) }); },
    onError: fail,
  });
  const one = useMutation({
    mutationFn: (id: string) => portalFetch<PortalSessionDto[]>("DELETE", `${URL}/${id}`),
    onSuccess: (list) => { queryClient.setQueryData(["portal", URL], list); toast({ title: t("account.sessions.signedOut", { count: 1 }) }); },
    onError: fail,
  });
  const name = (s: PortalSessionDto) => [s.browser, s.os].filter(Boolean).join(" · ") || t("account.sessions.unknown");
  const mobile = (s: PortalSessionDto) => s.os === "iOS" || s.os === "Android";
  const hasOthers = sessions.some((s) => !s.current);

  return (
    <div className="space-y-2 border-t border-[#e6e8f0] pt-6" data-testid="account-sessions">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="flex items-center gap-2 text-sm font-semibold text-[#1a1d62]"><Monitor className="h-4 w-4" />{t("account.sessions.title")}</h4>
        {hasOthers && <Button size="sm" variant="outline" className="text-[#a32d2d]" onClick={() => others.mutate()} disabled={others.isPending} data-testid="button-sign-out-others"><LogOut className="mr-1 h-4 w-4" />{t("account.sessions.signOutOthers")}</Button>}
      </div>
      <p className="text-xs text-[#64748b]">{t("account.sessions.help")}</p>
      <ul className="divide-y rounded-md border">
        {sessions.map((s) => (
          <li key={s.id} className="flex items-center gap-2 px-3 py-2 text-sm" data-testid={`session-${s.id}`}>
            {mobile(s) ? <Smartphone className="h-4 w-4 shrink-0 text-[#64748b]" /> : <Monitor className="h-4 w-4 shrink-0 text-[#64748b]" />}
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">{name(s)}{s.current && <span className="ml-2 rounded-full bg-[#e7f6ee] px-1.5 py-0.5 text-[10px] font-medium text-[#0f6e3f]">{t("account.sessions.thisDevice")}</span>}</div>
              <div className="truncate text-xs text-[#64748b]">
                {[s.signedInAt ? t("account.sessions.since", { date: formatPortalDateTimeMedium(s.signedInAt) }) : null, t("account.sessions.lastActive", { date: formatPortalDateTimeMedium(s.lastActiveAt) }), s.ip].filter(Boolean).join(" · ")}
              </div>
            </div>
            {!s.current && <Button size="sm" variant="ghost" onClick={() => one.mutate(s.id)} disabled={one.isPending} data-testid={`button-sign-out-${s.id}`}>{t("account.sessions.signOut")}</Button>}
          </li>
        ))}
      </ul>
    </div>
  );
}
