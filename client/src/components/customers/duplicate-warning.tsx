/**
 * OPT-019 — "Dubbele klant en chauffeur detecteren".
 *
 * The audit posted the same name and e-mail twice and got two 201s (ids 1302
 * and 1303). The report's rule is deliberate: **warn and open, never block** —
 * exactly the "Kenmerk bestaat al: … — Openen" pattern the fines dialog uses.
 * Two drivers of one company legitimately share a phone number, so a refusal
 * would break honest cases; naming the existing record and offering to open it
 * is what actually saves the clean-up afterwards.
 */
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { AlertTriangle } from "lucide-react";
import { useDebouncedValue } from "@/hooks/use-debounced-value";

export type DuplicateKind = "customer" | "driver";

export interface DuplicateHit {
  id: number;
  name: string;
  matchedOn: Array<"email" | "phone">;
}

export function duplicateLookupUrl(
  kind: DuplicateKind,
  params: { email?: string | null; phone?: string | null; excludeId?: number | null },
): string {
  const search = new URLSearchParams();
  if (params.email) search.set("email", params.email);
  if (params.phone) search.set("phone", params.phone);
  if (params.excludeId) search.set("excludeId", String(params.excludeId));
  const base = kind === "customer" ? "/api/customers/duplicates" : "/api/drivers/duplicates";
  return `${base}?${search.toString()}`;
}

/** A phone shorter than this is not specific enough to ask about. */
const MIN_PHONE_DIGITS = 8;

export function isWorthChecking(email?: string | null, phone?: string | null): boolean {
  const cleanEmail = (email ?? "").trim();
  const digits = (phone ?? "").replace(/\D/g, "");
  return cleanEmail.includes("@") || digits.length >= MIN_PHONE_DIGITS;
}

interface DuplicateWarningProps {
  kind: DuplicateKind;
  email?: string | null;
  phone?: string | null;
  /** The record being edited, so it does not report itself. */
  excludeId?: number | null;
  /** Opens the existing record. Omitted: the warning is shown without a link. */
  onOpen?: (id: number) => void;
}

export function DuplicateWarning({ kind, email, phone, excludeId, onOpen }: DuplicateWarningProps) {
  const { t } = useTranslation("customers");

  // Same debounce as the search bar: this runs while someone is typing an
  // address.
  const debouncedEmail = useDebouncedValue(email ?? "", 400);
  const debouncedPhone = useDebouncedValue(phone ?? "", 400);
  const enabled = isWorthChecking(debouncedEmail, debouncedPhone);

  const { data } = useQuery<{ duplicates: DuplicateHit[] }>({
    queryKey: [duplicateLookupUrl(kind, { email: debouncedEmail, phone: debouncedPhone, excludeId })],
    enabled,
    retry: false,
    staleTime: 30_000,
  });

  const duplicates = (enabled && data?.duplicates) || [];
  if (duplicates.length === 0) return null;

  return (
    <div
      className="flex flex-col gap-1 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"
      data-testid={`duplicate-warning-${kind}`}
    >
      <div className="flex items-center gap-2 font-medium">
        <AlertTriangle className="h-4 w-4" />
        {t(`duplicates.${kind}Title`)}
      </div>
      <ul className="space-y-0.5">
        {duplicates.map((hit) => (
          <li key={hit.id} className="flex flex-wrap items-center gap-2">
            <span>
              {t("duplicates.match", {
                name: hit.name,
                on: hit.matchedOn.map((field) => t(`duplicates.on.${field}`)).join(" + "),
              })}
            </span>
            {onOpen && (
              <button
                type="button"
                className="underline"
                onClick={() => onOpen(hit.id)}
                data-testid={`button-open-duplicate-${hit.id}`}
              >
                {t("duplicates.open")}
              </button>
            )}
          </li>
        ))}
      </ul>
      <p className="text-xs text-amber-800">{t("duplicates.hint")}</p>
    </div>
  );
}
