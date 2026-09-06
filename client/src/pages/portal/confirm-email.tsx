import { useEffect, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { useTranslation } from "react-i18next";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { portalFetch, PortalApiError } from "@/lib/portal-api";
import { usePortalAuth } from "@/hooks/use-portal-auth";

/** Landing page of the confirmation link in the "new e-mail address" mail. Public; works logged in or not. */
export default function PortalConfirmEmailPage() {
  const { t } = useTranslation("portal");
  const { me, refresh } = usePortalAuth();
  const [, navigate] = useLocation();
  const token = new URLSearchParams(useSearch()).get("token") ?? "";
  const [state, setState] = useState<{ status: "busy" } | { status: "done"; email: string } | { status: "error"; code: string }>({ status: "busy" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await portalFetch<{ email: string }>("POST", "/api/portal/email/confirm", { token });
        if (cancelled) return;
        setState({ status: "done", email: r.email });
        if (me) await refresh();
      } catch (err) {
        if (!cancelled) setState({ status: "error", code: err instanceof PortalApiError ? err.code : "PORTAL_SERVER_ERROR" });
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return (
    <div className="space-y-4 text-center" data-testid="portal-confirm-email">
      {state.status === "busy" && <Loader2 className="mx-auto h-8 w-8 animate-spin text-[#1a1d62]" />}
      {state.status === "done" && (<>
        <CheckCircle2 className="mx-auto h-10 w-10 text-[#1d9e75]" />
        <h1 className="text-xl font-semibold">{t("confirmEmail.doneTitle")}</h1>
        <p className="text-sm text-muted-foreground">{t("confirmEmail.doneText", { email: state.email })}</p>
        <Button className="w-full" onClick={() => navigate(me ? "/" : "/login")}>{me ? t("confirmEmail.toPortal") : t("confirmEmail.toLogin")}</Button>
      </>)}
      {state.status === "error" && (<>
        <XCircle className="mx-auto h-10 w-10 text-[#e24b4a]" />
        <h1 className="text-xl font-semibold">{t("confirmEmail.failedTitle")}</h1>
        <p className="text-sm text-destructive" role="alert">{t(`errors.${state.code}`, { defaultValue: t("errors.PORTAL_SERVER_ERROR") })}</p>
        <p className="text-sm text-muted-foreground">{t("confirmEmail.failedHint")}</p>
        <Button variant="outline" className="w-full" onClick={() => navigate(me ? "/account" : "/login")}>{me ? t("confirmEmail.toAccount") : t("confirmEmail.toLogin")}</Button>
      </>)}
    </div>
  );
}
