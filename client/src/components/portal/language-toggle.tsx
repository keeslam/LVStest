import { useTranslation } from "react-i18next";
import { portalFetch } from "@/lib/portal-api";
import { usePortalAuth } from "@/hooks/use-portal-auth";

const LANGS = ["nl", "en"] as const;

/**
 * NL | EN switch for the portal header. Logged in it saves the choice on the
 * account (so it sticks on every device); on the login page it only switches
 * the screen. `dark` puts it on the blue header.
 */
export function LanguageToggle({ dark = false, className = "" }: { dark?: boolean; className?: string }) {
  const { i18n, t } = useTranslation("portal");
  const { me, refresh } = usePortalAuth();
  const current = i18n.language?.startsWith("en") ? "en" : "nl";
  const choose = async (lang: "nl" | "en") => {
    if (lang === current) return;
    if (me) {
      try { await portalFetch("PATCH", "/api/portal/me", { language: lang }); await refresh(); return; } catch { /* fall through: switch the screen only */ }
    }
    await i18n.changeLanguage(lang);
  };
  const base = dark ? "border-white/25 text-[#dfe2ff]" : "border-[#e6e8f0] text-[#334155]";
  const on = dark ? "bg-white text-[#1a1d62]" : "bg-[#1a1d62] text-white";
  const off = dark ? "hover:bg-white/10 hover:text-white" : "hover:bg-[#eef0fb]";
  return (
    <div role="group" aria-label={t("account.language")} className={`inline-flex overflow-hidden rounded-full border text-xs font-semibold ${base} ${className}`} data-testid="language-toggle">
      {LANGS.map((lang) => (
        <button key={lang} type="button" onClick={() => choose(lang)} aria-pressed={current === lang}
          className={`px-2.5 py-1 uppercase transition-colors ${current === lang ? on : off}`} data-testid={`language-${lang}`}>
          {lang}
        </button>
      ))}
    </div>
  );
}
