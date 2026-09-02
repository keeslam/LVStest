import { useState, type FormEvent } from "react";
import { useLocation, useSearch } from "wouter";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { portalFetch, PortalApiError } from "@/lib/portal-api";
import { usePortalAuth } from "@/hooks/use-portal-auth";

export default function PortalActivatePage() {
  const { t } = useTranslation("portal");
  const { refresh } = usePortalAuth();
  const [, navigate] = useLocation();
  const token = new URLSearchParams(useSearch()).get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (password !== confirm) { setError(t("activate.mismatch")); return; }
    setBusy(true); setError(null);
    try {
      await portalFetch("POST", "/api/portal/activate", { token, password });
      await refresh();
      navigate("/");
    } catch (err) {
      const code = err instanceof PortalApiError ? err.code : "PORTAL_SERVER_ERROR";
      if (code === "PORTAL_TOKEN_EXPIRED" || code === "PORTAL_TOKEN_INVALID") setExpired(true);
      setError(t(`errors.${code}`, { defaultValue: t("errors.PORTAL_SERVER_ERROR") }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <h1 className="text-xl font-semibold">{t("activate.title")}</h1>
      <p className="text-sm text-muted-foreground">{t("activate.hint")}</p>
      <div>
        <Label htmlFor="pw">{t("fields.newPassword")}</Label>
        <Input id="pw" type="password" autoComplete="new-password" minLength={10} value={password} onChange={(e) => setPassword(e.target.value)} required />
      </div>
      <div>
        <Label htmlFor="pw2">{t("fields.confirmPassword")}</Label>
        <Input id="pw2" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
      </div>
      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
      {expired
        ? <Button type="button" variant="outline" className="w-full" onClick={() => navigate("/login")}>{t("activate.requestNewLink")}</Button>
        : <Button type="submit" disabled={busy || !token} className="w-full">{t("activate.submit")}</Button>}
    </form>
  );
}
