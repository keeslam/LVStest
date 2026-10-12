import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { Compass } from "lucide-react";
import { Button } from "@/components/ui/button";

/** A portal address that does not exist: say so, and offer the way back, instead of silently showing the overview. */
export default function PortalNotFoundPage() {
  const { t } = useTranslation("portal");
  return (
    <div className="mx-auto max-w-md py-16 text-center" data-testid="portal-not-found">
      <Compass className="mx-auto h-10 w-10 text-[#94a3b8]" aria-hidden="true" />
      <h1 className="mt-4 text-xl font-bold text-[#1a1d62]">{t("notFound.title")}</h1>
      <p className="mt-2 text-sm text-[#64748b]">{t("notFound.body")}</p>
      <Button asChild className="mt-6"><Link href="/">{t("notFound.back")}</Link></Button>
    </div>
  );
}
