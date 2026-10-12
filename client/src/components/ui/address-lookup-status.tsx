import { useTranslation } from "react-i18next";
import { CheckCircle2, Loader2, TriangleAlert } from "lucide-react";
import type { AddressLookupStatus as Status } from "@/hooks/use-address-autofill";

/**
 * The one line under a postcode + house number row that says what the lookup did. It never blocks:
 * every state leaves street and city editable, and an idle lookup shows nothing at all.
 */
export function AddressLookupStatus({ status, className = "" }: { status: Status; className?: string }) {
  const { t } = useTranslation();
  if (status === "idle") return null;
  const tone = status === "found" ? "text-emerald-700" : status === "loading" ? "text-[#64748b]" : "text-amber-800";
  const Icon = status === "found" ? CheckCircle2 : status === "loading" ? Loader2 : TriangleAlert;
  return (
    <p role="status" aria-live="polite" className={`flex items-start gap-1.5 text-xs ${tone} ${className}`} data-testid="address-lookup-status" data-status={status}>
      <Icon className={`mt-px h-3.5 w-3.5 shrink-0 ${status === "loading" ? "animate-spin" : ""}`} aria-hidden="true" />
      <span>{t(`common:addressLookup.${status}`)}</span>
    </p>
  );
}
