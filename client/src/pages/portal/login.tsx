import { useState, type FormEvent } from "react";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { portalFetch, PortalApiError } from "@/lib/portal-api";
import { usePortalAuth } from "@/hooks/use-portal-auth";

export default function PortalLoginPage() {
  const { t } = useTranslation("portal");
  const { refresh } = usePortalAuth();
  const [, navigate] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"login" | "forgot">("login");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null); setInfo(null);
    try {
      if (mode === "forgot") {
        await portalFetch("POST", "/api/portal/forgot", { email });
        setInfo(t("login.forgotSent"));
      } else {
        await portalFetch("POST", "/api/portal/login", { email, password });
        await refresh();
        navigate("/");
      }
    } catch (err) {
      const code = err instanceof PortalApiError ? err.code : "PORTAL_SERVER_ERROR";
      setError(t(`errors.${code}`, { defaultValue: t("errors.PORTAL_SERVER_ERROR") }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4" data-testid="portal-login-form">
      <h1 className="text-xl font-semibold">{t("login.title")}</h1>
      <div>
        <Label htmlFor="portal-email">{t("fields.email")}</Label>
        <Input id="portal-email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </div>
      {mode === "login" && (
        <div>
          <Label htmlFor="portal-password">{t("fields.password")}</Label>
          <Input id="portal-password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
      )}
      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
      {info && <p className="text-sm text-green-700">{info}</p>}
      <Button type="submit" disabled={busy} className="w-full">{mode === "login" ? t("login.submit") : t("login.forgotSubmit")}</Button>
      <button type="button" className="text-sm text-muted-foreground underline" onClick={() => { setMode(mode === "login" ? "forgot" : "login"); setError(null); setInfo(null); }}>
        {mode === "login" ? t("login.forgotLink") : t("login.backToLogin")}
      </button>
    </form>
  );
}
