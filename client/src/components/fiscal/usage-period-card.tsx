import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { dateLabelNl, formatEuro } from "@shared/fiscal-format";
import { FISCAL_STATUS_LABELS, MISSING_DATA_LABELS, REVIEW_REASON_LABELS, REPLACEMENT_REASONS, REPLACEMENT_REASON_LABELS, USAGE_TYPES, type MissingDataCode, type ReviewReasonCode, type ReplacementReason, type FiscalAssessmentStatus } from "@shared/fiscal-types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useFiscalPermissions } from "./use-fiscal-permissions";
import type { UsagePeriodResponse } from "./types";

type Tri = "yes" | "no" | "unknown";

function TriRadio({ name, value, onChange, disabled, label, t }: { name: string; value: Tri; onChange: (v: Tri) => void; disabled: boolean; label: string; t: (k: string) => string }) {
  return (
    <fieldset className="space-y-1">
      <legend className="text-sm font-medium">{label}</legend>
      <div className="flex gap-4 text-sm">
        {(["yes", "no", "unknown"] as Tri[]).map((option) => (
          <span key={option} className="flex items-center gap-1">
            <input type="radio" id={`usage-${name}-${option}`} name={`usage-${name}`} value={option} checked={value === option} disabled={disabled} onChange={() => onChange(option)} />
            <label htmlFor={`usage-${name}-${option}`}>{t(`usage.${option}`)}</label>
          </span>
        ))}
      </div>
    </fieldset>
  );
}

/**
 * The fiscal usage of one reservation: derived facts, the questions only
 * people can answer (besluit F-02/F-09), and the latest assessment.
 */
export function UsagePeriodCard({ reservationId }: { reservationId: number }) {
  const { t } = useTranslation("fiscal");
  const { canReview } = useFiscalPermissions();
  const queryClient = useQueryClient();
  const key = [`/api/reservations/${reservationId}/usage-period`] as const;
  const { data, isLoading, error } = useQuery<UsagePeriodResponse>({ queryKey: key, retry: false });

  const [privateUse, setPrivateUse] = useState<Tri>("unknown");
  const [commuting, setCommuting] = useState<Tri>("unknown");
  const [providedBeforeCutoff, setProvidedBeforeCutoff] = useState<Tri>("unknown");
  const [usageType, setUsageType] = useState("unknown");
  const [isPool, setIsPool] = useState(false);
  const [replacementReason, setReplacementReason] = useState("unknown");
  const [replacedVehicleText, setReplacedVehicleText] = useState("");
  const [notes, setNotes] = useState("");
  const [showExplanation, setShowExplanation] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  useEffect(() => {
    if (!data) return;
    setPrivateUse(data.privateUse);
    setCommuting(data.commuting);
    setProvidedBeforeCutoff(data.providedBeforeCutoff);
    setUsageType(data.usageType);
    setIsPool(data.isPool);
    setReplacementReason(data.replacementReason);
    setReplacedVehicleText(data.replacedVehicleText ?? "");
    setNotes(data.notes ?? "");
  }, [data?.id, data?.confirmedAt]);

  const confirm = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = { privateUse, commuting, providedBeforeCutoff, usageType, isPool, notes: notes || null };
      // "Onbekend" is not an answer: leave it out so the server can insist on a reason (F-09).
      if (replacementReason !== "unknown") body.replacementReason = replacementReason;
      if (replacedVehicleText.trim()) body.replacedVehicleText = replacedVehicleText.trim();
      return (await apiRequest("PATCH", `/api/reservations/${reservationId}/usage-period`, body)).json() as Promise<UsagePeriodResponse>;
    },
    onSuccess: (row) => {
      setServerError(null);
      queryClient.setQueryData(key, (old: UsagePeriodResponse | undefined) => ({ ...(old ?? row), ...row, latestAssessment: row.latestAssessment ?? old?.latestAssessment ?? null }));
      queryClient.invalidateQueries({ queryKey: key });
    },
    onError: (e: Error) => setServerError(e.message.replace(/^\d{3}:\s*/, "")),
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">{t("common.loading")}</p>;
  if (error || !data) {
    const message = (error as Error | null)?.message ?? "";
    return <p className="text-sm text-muted-foreground">{message.startsWith("404") ? t("usage.noPeriod") : t("common.error", { message })}</p>;
  }

  const readOnly = !canReview;
  const assessment = data.latestAssessment;
  const confirmedText =
    data.confirmedByKind === "none"
      ? t("usage.notConfirmed")
      : t(data.confirmedByKind === "portal" ? "usage.confirmedByPortal" : "usage.confirmedBy", { name: data.confirmedByName ?? "?", date: data.confirmedAt ? new Date(data.confirmedAt).toLocaleDateString("nl-NL") : "" });

  return (
    <Card data-testid="usage-period-card">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{t("usage.title")}</CardTitle>
        <CardDescription>{t("usage.description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div className="grid gap-2 sm:grid-cols-2">
          <div>
            <span className="text-muted-foreground">{t("usage.period")}: </span>
            <span>
              {dateLabelNl(data.startDate)} t/m {data.endDate ? dateLabelNl(data.endDate) : "…"}
            </span>
            <span className="text-muted-foreground"> ({t(`usage.dateBasis.${data.dateBasis}`)})</span>
          </div>
          <div>
            {data.isReplacement && <span className="mr-2 rounded bg-amber-100 px-2 py-0.5 text-xs" data-testid="usage-replacement-badge">{t("usage.replacement")}</span>}
            <span className="text-muted-foreground">{t("usage.drivers", { count: data.driverCount })}</span>
          </div>
        </div>
        {data.providedBeforeCutoffHint && (
          <Alert>
            <AlertDescription>{t("usage.hint")}</AlertDescription>
          </Alert>
        )}
        {data.reconfirmRequired && (
          <Alert variant="destructive">
            <AlertDescription>{t("usage.reconfirm")}</AlertDescription>
          </Alert>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <TriRadio name="privateUse" value={privateUse} onChange={setPrivateUse} disabled={readOnly} label={t("usage.privateUse")} t={t} />
          <TriRadio name="commuting" value={commuting} onChange={setCommuting} disabled={readOnly} label={t("usage.commuting")} t={t} />
          <TriRadio name="providedBeforeCutoff" value={providedBeforeCutoff} onChange={setProvidedBeforeCutoff} disabled={readOnly} label={t("usage.providedBeforeCutoff")} t={t} />
          <div className="space-y-1">
            <Label htmlFor="usage-usageType">{t("usage.usageType")}</Label>
            <select id="usage-usageType" className="w-full rounded-md border px-3 py-2 text-sm" value={usageType} disabled={readOnly} onChange={(e) => setUsageType(e.target.value)} data-testid="select-usage-usageType">
              {USAGE_TYPES.map((u) => (
                <option key={u} value={u}>{t(`usage.usageTypes.${u}`)}</option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={isPool} disabled={readOnly} onChange={(e) => setIsPool(e.target.checked)} data-testid="checkbox-usage-isPool" />
            {t("usage.isPool")}
          </label>
          {data.isReplacement && (
            <>
              <div className="space-y-1">
                <Label htmlFor="usage-replacementReason">{t("usage.replacementReason")}</Label>
                <select id="usage-replacementReason" className="w-full rounded-md border px-3 py-2 text-sm" value={replacementReason} disabled={readOnly} onChange={(e) => setReplacementReason(e.target.value)} data-testid="select-usage-replacementReason">
                  {REPLACEMENT_REASONS.map((r) => (
                    <option key={r} value={r}>{REPLACEMENT_REASON_LABELS[r as ReplacementReason]}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="usage-replacedVehicleText">{t("usage.replacedVehicleText")}</Label>
                <Input id="usage-replacedVehicleText" value={replacedVehicleText} disabled={readOnly} onChange={(e) => setReplacedVehicleText(e.target.value)} />
              </div>
            </>
          )}
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="usage-notes">{t("usage.notes")}</Label>
            <Input id="usage-notes" value={notes} disabled={readOnly} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>

        {serverError && <p className="text-destructive" data-testid="usage-error">{serverError}</p>}
        <div className="flex flex-wrap items-center gap-3">
          {!readOnly && (
            <Button size="sm" disabled={confirm.isPending} onClick={() => confirm.mutate()} data-testid="button-usage-confirm">
              {t("usage.confirm")}
            </Button>
          )}
          <span className="text-muted-foreground" data-testid="usage-confirmed">{confirmedText}</span>
        </div>

        <div className="border-t pt-3">
          <h4 className="font-medium">{t("usage.assessment")}</h4>
          {!assessment && <p className="text-muted-foreground">{t("usage.noAssessment")}</p>}
          {assessment && (
            <div className="space-y-1">
              <p>
                <span className="font-medium" data-testid="usage-assessment-status">{FISCAL_STATUS_LABELS[assessment.status as FiscalAssessmentStatus] ?? assessment.status}</span>
                {assessment.amount && <span> · {formatEuro(assessment.amount)}</span>}
              </p>
              {assessment.missingData.length > 0 && (
                <ul className="list-disc pl-5 text-muted-foreground">
                  {assessment.missingData.map((c) => (
                    <li key={c}>{MISSING_DATA_LABELS[c as MissingDataCode] ?? c}</li>
                  ))}
                </ul>
              )}
              {assessment.reviewReasons.length > 0 && (
                <ul className="list-disc pl-5 text-muted-foreground">
                  {assessment.reviewReasons.map((c) => (
                    <li key={c}>{REVIEW_REASON_LABELS[c as ReviewReasonCode] ?? c}</li>
                  ))}
                </ul>
              )}
              <button type="button" className="text-xs underline text-muted-foreground" onClick={() => setShowExplanation((v) => !v)}>
                {showExplanation ? t("usage.hideExplanation") : t("usage.showExplanation")}
              </button>
              {showExplanation && <pre className="whitespace-pre-wrap rounded bg-muted p-2 text-xs">{assessment.explanation}</pre>}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
