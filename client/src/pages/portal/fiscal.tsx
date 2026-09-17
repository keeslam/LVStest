import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Calculator } from "lucide-react";
import type { PortalFiscalPeriodDto, PortalFiscalVehicleDto } from "@shared/fiscal-types";
import { MISSING_DATA_LABELS, REPLACEMENT_REASONS, REPLACEMENT_REASON_LABELS, USAGE_PERIOD_DERIVATION_START, USAGE_TYPES, type MissingDataCode, type ReplacementReason } from "@shared/fiscal-types";
import { dateLabelNl, formatEuro } from "@shared/fiscal-format";
import { portalFetch, portalQueryFn } from "@/lib/portal-api";
import { usePortalAuth } from "@/hooks/use-portal-auth";
import { EmptyState, PageHeader, Plate, Section, btnPrimary } from "@/components/portal/ui";
import { Button } from "@/components/ui/button";

const KEY = ["portal", "/api/portal/fiscal/vehicles"] as const;

const STATUS_TONE: Record<string, string> = {
  APPLICABLE: "bg-red-100 text-red-800",
  POSSIBLY_APPLICABLE: "bg-amber-100 text-amber-800",
  NOT_APPLICABLE: "bg-green-100 text-green-800",
  MANUAL_REVIEW_REQUIRED: "bg-amber-100 text-amber-900",
  DATA_INSUFFICIENT: "bg-slate-200 text-slate-800",
  CONFIGURATION_INVALID: "bg-red-200 text-red-900",
  RULE_NOT_AVAILABLE: "bg-slate-100 text-slate-700",
};

type Tri = "yes" | "no" | "unknown";

function TriQuestion({ id, label, value, onChange, disabled, t }: { id: string; label: string; value: Tri; onChange: (v: Tri) => void; disabled: boolean; t: (k: string) => string }) {
  return (
    <fieldset className="space-y-1">
      <legend className="text-sm font-medium">{label}</legend>
      <div className="flex flex-wrap gap-4 text-sm">
        {(["yes", "no", "unknown"] as Tri[]).map((option) => (
          <span key={option} className="flex items-center gap-1">
            <input type="radio" id={`${id}-${option}`} name={id} value={option} checked={value === option} disabled={disabled} onChange={() => onChange(option)} />
            <label htmlFor={`${id}-${option}`}>{t(`fiscal.${option}`)}</label>
          </span>
        ))}
      </div>
    </fieldset>
  );
}

/** The usage questions of one period; only the customer administrator may save (besluit F-02). */
function UsageQuestions({ period, isAdmin }: { period: PortalFiscalPeriodDto; isAdmin: boolean }) {
  const { t } = useTranslation("portal");
  const queryClient = useQueryClient();
  const [privateUse, setPrivateUse] = useState<Tri>(period.privateUse as Tri);
  const [commuting, setCommuting] = useState<Tri>(period.commuting as Tri);
  const [providedBeforeCutoff, setProvidedBeforeCutoff] = useState<Tri>(period.providedBeforeCutoff as Tri);
  const [usageType, setUsageType] = useState(period.usageType);
  const [replacementReason, setReplacementReason] = useState(period.replacementReason);
  const [replacedVehicleText, setReplacedVehicleText] = useState(period.replacedVehicleText ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setPrivateUse(period.privateUse as Tri);
    setCommuting(period.commuting as Tri);
    setProvidedBeforeCutoff(period.providedBeforeCutoff as Tri);
    setUsageType(period.usageType);
    setReplacementReason(period.replacementReason);
    setReplacedVehicleText(period.replacedVehicleText ?? "");
  }, [period.confirmedAt, period.usagePeriodId]);

  const save = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = { privateUse, commuting, providedBeforeCutoff, usageType };
      if (replacementReason !== "unknown") body.replacementReason = replacementReason;
      if (replacedVehicleText.trim()) body.replacedVehicleText = replacedVehicleText.trim();
      return portalFetch<PortalFiscalPeriodDto>("PATCH", `/api/portal/fiscal/reservations/${period.reservationId}/usage`, body);
    },
    onSuccess: () => {
      setError(null);
      setSaved(true);
      queryClient.invalidateQueries({ queryKey: KEY });
    },
    onError: (e: Error) => setError(e.message),
  });

  const prefix = `usage-${period.reservationId}`;
  const confirmedText =
    period.confirmedByKind === "none"
      ? t("fiscal.notConfirmed")
      : period.confirmedByKind === "staff"
        ? t("fiscal.confirmedByLam", { date: period.confirmedAt ? new Date(period.confirmedAt).toLocaleDateString("nl-NL") : "" })
        : t("fiscal.confirmed", { name: t("fiscal.questions").toLowerCase() === "" ? "" : "u", date: period.confirmedAt ? new Date(period.confirmedAt).toLocaleDateString("nl-NL") : "" });

  return (
    <div className="rounded-md border border-[#e2e8f0] bg-white p-3" data-testid={`usage-form-${period.reservationId}`}>
      <h4 className="font-medium">{t("fiscal.questions")}</h4>
      <p className="mb-2 text-xs text-muted-foreground">{t("fiscal.questionsHint")}</p>
      {period.providedBeforeCutoffHint && <p className="mb-2 rounded bg-blue-50 p-2 text-xs text-blue-900">{t("fiscal.hint", { year: USAGE_PERIOD_DERIVATION_START.slice(0, 4) })}</p>}
      {period.reconfirmRequired && <p className="mb-2 rounded bg-amber-50 p-2 text-xs text-amber-900">{t("fiscal.reconfirm")}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <TriQuestion id={`${prefix}-privateUse`} label={t("fiscal.privateUse")} value={privateUse} onChange={setPrivateUse} disabled={!isAdmin} t={t} />
        <TriQuestion id={`${prefix}-commuting`} label={t("fiscal.commuting")} value={commuting} onChange={setCommuting} disabled={!isAdmin} t={t} />
        <TriQuestion id={`${prefix}-providedBeforeCutoff`} label={t("fiscal.providedBeforeCutoff", { date: dateLabelNl(USAGE_PERIOD_DERIVATION_START) })} value={providedBeforeCutoff} onChange={setProvidedBeforeCutoff} disabled={!isAdmin} t={t} />
        <div className="space-y-1">
          <label htmlFor={`${prefix}-usageType`} className="text-sm font-medium">{t("fiscal.usageType")}</label>
          <select id={`${prefix}-usageType`} className="w-full rounded-md border px-3 py-2 text-sm" value={usageType} disabled={!isAdmin} onChange={(e) => setUsageType(e.target.value)}>
            {USAGE_TYPES.filter((u) => u !== "manual_review").map((u) => (
              <option key={u} value={u}>{t(`fiscal.usageTypes.${u}`)}</option>
            ))}
          </select>
        </div>
        {period.isReplacement && (
          <>
            <div className="space-y-1">
              <label htmlFor={`${prefix}-reason`} className="text-sm font-medium">{t("fiscal.replacementReason")}</label>
              <select id={`${prefix}-reason`} className="w-full rounded-md border px-3 py-2 text-sm" value={replacementReason} disabled={!isAdmin} onChange={(e) => setReplacementReason(e.target.value)} data-testid={`select-reason-${period.reservationId}`}>
                {REPLACEMENT_REASONS.map((r) => (
                  <option key={r} value={r}>{REPLACEMENT_REASON_LABELS[r as ReplacementReason]}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label htmlFor={`${prefix}-replaced`} className="text-sm font-medium">{t("fiscal.replacedVehicleText")}</label>
              <input id={`${prefix}-replaced`} className="w-full rounded-md border px-3 py-2 text-sm" value={replacedVehicleText} disabled={!isAdmin} onChange={(e) => setReplacedVehicleText(e.target.value)} />
            </div>
          </>
        )}
      </div>
      {error && <p className="mt-2 text-sm text-red-700" data-testid={`usage-error-${period.reservationId}`}>{error}</p>}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        {isAdmin ? (
          <Button size="sm" className={btnPrimary} disabled={save.isPending} onClick={() => save.mutate()} data-testid={`button-usage-save-${period.reservationId}`}>{t("fiscal.confirm")}</Button>
        ) : (
          <span className="text-xs text-muted-foreground">{t("fiscal.adminOnly")}</span>
        )}
        <span className="text-xs text-muted-foreground" data-testid={`usage-confirmed-${period.reservationId}`}>{saved ? t("fiscal.saved") : confirmedText}</span>
      </div>
    </div>
  );
}

function PeriodCard({ period, isAdmin }: { period: PortalFiscalPeriodDto; isAdmin: boolean }) {
  const { t } = useTranslation("portal");
  const [showExplanation, setShowExplanation] = useState(false);
  return (
    <div className="space-y-3 rounded-lg border border-[#e2e8f0] bg-[#f8fafc] p-3" data-testid={`fiscal-period-${period.reservationId}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm">
          <span className="font-medium">{dateLabelNl(period.startDate)} t/m {period.endDate ? dateLabelNl(period.endDate) : "…"}</span>
          {period.isReplacement && <span className="ml-2 rounded bg-amber-100 px-2 py-0.5 text-xs">{t("fiscal.replacement")}</span>}
        </div>
        <div className="flex items-center gap-2">
          <span className={`rounded px-2 py-0.5 text-xs font-medium ${period.status ? STATUS_TONE[period.status] : "bg-slate-100 text-slate-700"}`} data-testid={`fiscal-status-${period.reservationId}`}>{period.statusLabel}</span>
          {period.amount !== undefined && period.amount !== null && <span className="text-sm font-semibold" data-testid={`fiscal-amount-${period.reservationId}`}>{formatEuro(period.amount)}</span>}
        </div>
      </div>
      {period.status && (
        <p className="text-xs text-muted-foreground" data-testid={`fiscal-stand-${period.reservationId}`}>
          <a href={`/api/portal/fiscal/reservations/${period.reservationId}/pdf`} target="_blank" rel="noreferrer" className="mr-2 underline" data-testid={`fiscal-pdf-${period.reservationId}`}>
            {t("fiscal.pdf")}
          </a>
          {period.isFinal ? (
            <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-emerald-900">{t("fiscal.final")}</span>
          ) : (
            period.assessedThrough && <span>{t("fiscal.provisionalThrough", { date: dateLabelNl(period.assessedThrough) })}</span>
          )}
          {!period.isFinal && period.settledAmount !== undefined && period.provisionalAmount && period.provisionalAmount !== "0.00" && (
            <span className="ml-2">
              {t("fiscal.settledAmount", { amount: formatEuro(period.settledAmount ?? "0.00") })} · {t("fiscal.provisionalAmount", { amount: formatEuro(period.provisionalAmount) })}
            </span>
          )}
        </p>
      )}
      {period.needsInput && period.status !== "MANUAL_REVIEW_REQUIRED" && <p className="text-xs text-amber-800">{t("fiscal.needsInput", { count: 1 }).replace(/^1 /, "")}</p>}
      {period.status === "MANUAL_REVIEW_REQUIRED" && <p className="text-xs text-amber-900">{t("fiscal.reviewByLam")}</p>}
      {period.missingData.length > 0 && (
        <ul className="list-disc pl-5 text-xs text-muted-foreground">
          {period.missingData.map((c) => (
            <li key={c}>{MISSING_DATA_LABELS[c as MissingDataCode] ?? c}</li>
          ))}
        </ul>
      )}
      {period.explanation && (
        <div>
          <button type="button" className="text-xs underline text-muted-foreground" onClick={() => setShowExplanation((v) => !v)} data-testid={`button-explanation-${period.reservationId}`}>
            {showExplanation ? t("fiscal.hideExplanation") : t("fiscal.showExplanation")}
          </button>
          {showExplanation && <pre className="mt-1 whitespace-pre-wrap rounded bg-white p-2 text-xs">{period.explanation}</pre>}
        </div>
      )}
      <UsageQuestions period={period} isAdmin={isAdmin} />
    </div>
  );
}

/** The customer's fiscal check: per vehicle, per rental period, with the questions only the customer can answer. */
export default function PortalFiscalPage() {
  const { t } = useTranslation("portal");
  const { me } = usePortalAuth();
  const { data: vehicles = [], isLoading } = useQuery<PortalFiscalVehicleDto[]>({ queryKey: KEY, queryFn: portalQueryFn });
  const isAdmin = me?.role === "admin";
  const periods = vehicles.reduce((n, v) => n + v.periods.length, 0);
  const needsInput = vehicles.reduce((n, v) => n + v.periods.filter((p) => p.needsInput).length, 0);

  return (
    <div className="space-y-4" data-testid="portal-fiscal">
      <PageHeader title={t("fiscal.title")} subtitle={t("fiscal.intro")} />
      {!isLoading && periods > 0 && (
        <p className="text-sm text-muted-foreground">
          {t("fiscal.periods", { count: periods })}
          {needsInput > 0 && <> · {t("fiscal.needsInput", { count: needsInput })}</>}
          {me?.settings?.fiscalReportsEnabled && (
            <a href={`/api/portal/fiscal/report.csv?year=${Math.max(new Date().getFullYear(), Number(USAGE_PERIOD_DERIVATION_START.slice(0, 4)))}`} className="ml-3 underline" data-testid="fiscal-csv">
              {t("fiscal.csv")}
            </a>
          )}
        </p>
      )}
      {!isLoading && vehicles.length === 0 && <EmptyState icon={<Calculator className="h-6 w-6" />} text={t("fiscal.none", { year: USAGE_PERIOD_DERIVATION_START.slice(0, 4) })} />}
      {vehicles.map((v) => (
        <Section key={v.vehicleId} title={`${v.brand} ${v.model}`} count={v.periods.length}>
          <div className="mb-2"><Plate value={v.licensePlate} /></div>
          <div className="space-y-3">
            {v.periods.map((p) => (
              <PeriodCard key={p.reservationId} period={p} isAdmin={isAdmin} />
            ))}
          </div>
        </Section>
      ))}
      <p className="text-xs text-muted-foreground">{t("fiscal.disclaimer")}</p>
    </div>
  );
}
