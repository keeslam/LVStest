import { useTranslation } from "react-i18next";
import { Globe } from "lucide-react";
import { LANGUAGE_NAMES, SUPPORTED_LANGUAGES, toSupportedLanguage, type SupportedLanguage } from "@shared/languages";
import { portalFetch } from "@/lib/portal-api";
import { usePortalAuth } from "@/hooks/use-portal-auth";

/**
 * Language picker for the portal header: the short code on the button, each language under its
 * own name in the list. Logged in it saves the choice on the account (so it sticks on every
 * device); on the login page it only switches the screen. `dark` puts it on the blue header.
 */
export function LanguageToggle({ dark = false, className = "" }: { dark?: boolean; className?: string }) {
  const { i18n, t } = useTranslation("portal");
  const { me, refresh } = usePortalAuth();
  const current = toSupportedLanguage(i18n.language);
  const choose = async (lang: SupportedLanguage) => {
    if (lang === current) return;
    if (me) {
      try { await portalFetch("PATCH", "/api/portal/me", { language: lang }); await refresh(); return; } catch { /* fall through: switch the screen only */ }
    }
    await i18n.changeLanguage(lang);
  };
  const base = dark ? "border-white/25 text-[#dfe2ff] hover:bg-white/10 hover:text-white" : "border-[#e6e8f0] text-[#334155] hover:bg-[#eef0fb]";
  return (
    <label className={`relative inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold uppercase transition-colors ${base} ${className}`} data-testid="language-toggle">
      <Globe className="h-3.5 w-3.5" aria-hidden />
      <span aria-hidden>{current}</span>
      {/* The native list stays on top, invisible: it opens the platform picker (a wheel on a phone). */}
      <select
        aria-label={t("account.language")}
        value={current}
        onChange={(e) => choose(e.target.value as SupportedLanguage)}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        data-testid="select-portal-language"
      >
        {SUPPORTED_LANGUAGES.map((lang) => (
          <option key={lang} value={lang} lang={lang} data-testid={`language-${lang}`}>{LANGUAGE_NAMES[lang]}</option>
        ))}
      </select>
    </label>
  );
}
