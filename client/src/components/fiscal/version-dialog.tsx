import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { CATEGORY_LABELS, CHOICE_LABELS, UNIT_LABELS, dateLabelNl, formatEuro, formatParameterValue } from "@shared/fiscal-format";
import { REASON_CATEGORIES, REASON_CATEGORY_LABELS, RULE_VERSION_STATUS_LABELS, type ReasonCategory } from "@shared/fiscal-types";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { useFiscalPermissions } from "./use-fiscal-permissions";
import { PublishDialog } from "./publish-dialog";
import type { AuditEvent, FiscalParameterDefinition, ImpactState, VersionDetail } from "./types";

interface VersionDialogProps {
  versionId: number | null;
  onOpenChange: (open: boolean) => void;
  definitions: FiscalParameterDefinition[];
  /** The version in force at the draft's start (for the publish comparison). */
  current: VersionDetail | null;
}

type Detail = VersionDetail & { audit: AuditEvent[] };

function toInput(def: FiscalParameterDefinition, value: unknown): string | string[] {
  if (value === null || value === undefined) return def.dataType === "list" ? [] : "";
  if (def.dataType === "list") return Array.isArray(value) ? (value as string[]) : [];
  return String(value);
}

function fromInput(def: FiscalParameterDefinition, raw: string | string[]): unknown {
  if (def.dataType === "list") return raw;
  const text = String(raw).trim();
  if (text === "") return null;
  switch (def.dataType) {
    case "decimal":
    case "integer":
      return Number(text.replace(",", "."));
    case "boolean":
      return text === "true";
    default:
      return text;
  }
}

/**
 * One rule version: its details, its parameters grouped by category, the
 * validation, the actions its status allows the user's rights, an impact
 * preview, and its history. Editing is possible on a draft only.
 */
export function VersionDialog({ versionId, onOpenChange, definitions, current }: VersionDialogProps) {
  const { t } = useTranslation("fiscal");
  const { toast } = useToast();
  const { canConfigure, canApprove, canPublish } = useFiscalPermissions();
  const queryClient = useQueryClient();
  const detailKey = [`/api/fiscal/rule-versions/${versionId}`] as const;
  const { data: detail } = useQuery<Detail>({ queryKey: detailKey, enabled: versionId !== null });

  const [meta, setMeta] = useState<Record<string, string>>({});
  const [values, setValues] = useState<Record<string, string | string[]>>({});
  const [sources, setSources] = useState<Record<string, { sourceUrl: string; sourceReference: string }>>({});
  const [rejectReason, setRejectReason] = useState("");
  const [publishOpen, setPublishOpen] = useState(false);
  const [impactPolling, setImpactPolling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!detail) return;
    setMeta({
      title: detail.title,
      effectiveFrom: detail.effectiveFrom ?? "",
      effectiveUntil: detail.effectiveUntil ?? "",
      reasonCategory: detail.reasonCategory,
      reasonText: detail.reasonText,
      sourceOrganisation: detail.sourceOrganisation ?? "",
      sourceUrl: detail.sourceUrl ?? "",
      legalReference: detail.legalReference ?? "",
      assumptions: detail.assumptions ?? "",
    });
    const v: Record<string, string | string[]> = {};
    const s: Record<string, { sourceUrl: string; sourceReference: string }> = {};
    for (const def of definitions) {
      v[def.key] = toInput(def, detail.values[def.key]);
      s[def.key] = { sourceUrl: detail.sources[def.key]?.sourceUrl ?? "", sourceReference: detail.sources[def.key]?.sourceReference ?? "" };
    }
    setValues(v);
    setSources(s);
    setError(null);
  }, [detail?.id, detail?.updatedAt, definitions.length]);

  const impactKey = [`/api/fiscal/rule-versions/${versionId}/impact`] as const;
  const { data: impact } = useQuery<ImpactState>({
    queryKey: impactKey,
    enabled: versionId !== null && detail !== undefined,
    refetchInterval: impactPolling ? 1500 : false,
  });
  useEffect(() => {
    if (impact && !impact.running) setImpactPolling(false);
  }, [impact?.running]);

  const editable = detail?.status === "draft" && canConfigure;
  const groups = useMemo(() => {
    const byCategory = new Map<string, FiscalParameterDefinition[]>();
    for (const def of definitions) {
      if (!byCategory.has(def.category)) byCategory.set(def.category, []);
      byCategory.get(def.category)!.push(def);
    }
    return [...byCategory.entries()];
  }, [definitions]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: detailKey });
    queryClient.invalidateQueries({ queryKey: ["/api/fiscal/configuration"] });
    queryClient.invalidateQueries({ queryKey: ["/api/fiscal/overview"] });
  };
  const failed = (e: Error) => setError(e.message.replace(/^\d{3}:\s*/, ""));

  const save = useMutation({
    mutationFn: async () => {
      const patch: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(meta)) patch[k] = v === "" ? null : v;
      if (patch.title === null) delete patch.title;
      if (patch.reasonCategory === null) delete patch.reasonCategory;
      if (patch.reasonText === null) patch.reasonText = "";
      await apiRequest("PATCH", `/api/fiscal/rule-versions/${versionId}`, patch);
      const body = definitions.map((def) => ({
        key: def.key,
        value: fromInput(def, values[def.key] ?? ""),
        sourceUrl: sources[def.key]?.sourceUrl?.trim() || null,
        sourceReference: sources[def.key]?.sourceReference?.trim() || null,
      }));
      return (await apiRequest("PUT", `/api/fiscal/rule-versions/${versionId}/parameters`, body)).json();
    },
    onSuccess: () => {
      setError(null);
      invalidate();
      toast({ title: t("version.saved") });
    },
    onError: failed,
  });

  const action = useMutation({
    mutationFn: async ({ name, body }: { name: string; body?: unknown }) => (await apiRequest("POST", `/api/fiscal/rule-versions/${versionId}/${name}`, body)).json(),
    onSuccess: () => {
      setError(null);
      setRejectReason("");
      invalidate();
    },
    onError: failed,
  });

  const startImpact = useMutation({
    mutationFn: async () => (await apiRequest("POST", `/api/fiscal/rule-versions/${versionId}/impact`)).json(),
    onSuccess: () => {
      setError(null);
      setImpactPolling(true);
      queryClient.invalidateQueries({ queryKey: impactKey });
    },
    onError: failed,
  });

  const open = versionId !== null;
  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto" data-testid="dialog-version">
        {!detail && <p className="text-sm text-muted-foreground">{t("common.loading")}</p>}
        {detail && (
          <>
            <DialogHeader>
              <DialogTitle>
                {detail.title} <span className="text-muted-foreground">· {t("config.version", { n: detail.versionNumber })}</span>
              </DialogTitle>
              <DialogDescription>
                <span className="rounded bg-muted px-2 py-0.5 text-xs" data-testid="version-status">{RULE_VERSION_STATUS_LABELS[detail.status]}</span>{" "}
                <span className="ml-2 font-medium">{t("config.scope")}</span>
                {detail.rejectionReason && <span className="ml-2 text-destructive">{t("version.rejectedWith", { reason: detail.rejectionReason })}</span>}
                {detail.supersededById && <span className="ml-2">{t("version.supersededBy", { n: "?" })}</span>}
              </DialogDescription>
            </DialogHeader>

            {!editable && <p className="text-xs text-muted-foreground">{t("version.readOnly", { status: RULE_VERSION_STATUS_LABELS[detail.status].toLowerCase() })}</p>}

            <section className="space-y-2">
              <h3 className="font-medium">{t("version.metadata")}</h3>
              <div className="grid gap-3 md:grid-cols-2">
                <Field id="title" label={t("version.titleLabel")}><Input id="title" value={meta.title ?? ""} disabled={!editable} onChange={(e) => setMeta({ ...meta, title: e.target.value })} /></Field>
                <Field id="reasonCategory" label={t("version.reasonCategory")}>
                  <select id="reasonCategory" className="w-full rounded-md border px-3 py-2 text-sm" value={meta.reasonCategory ?? "other"} disabled={!editable} onChange={(e) => setMeta({ ...meta, reasonCategory: e.target.value })}>
                    {REASON_CATEGORIES.map((c) => (
                      <option key={c} value={c}>{REASON_CATEGORY_LABELS[c as ReasonCategory]}</option>
                    ))}
                  </select>
                </Field>
                <Field id="effectiveFrom" label={t("version.effectiveFrom")}><Input id="effectiveFrom" type="date" value={meta.effectiveFrom ?? ""} disabled={!editable} onChange={(e) => setMeta({ ...meta, effectiveFrom: e.target.value })} /></Field>
                <Field id="effectiveUntil" label={t("version.effectiveUntil")}><Input id="effectiveUntil" type="date" value={meta.effectiveUntil ?? ""} disabled={!editable} onChange={(e) => setMeta({ ...meta, effectiveUntil: e.target.value })} /></Field>
                <Field id="sourceOrganisation" label={t("version.sourceOrganisation")}><Input id="sourceOrganisation" value={meta.sourceOrganisation ?? ""} disabled={!editable} onChange={(e) => setMeta({ ...meta, sourceOrganisation: e.target.value })} /></Field>
                <Field id="sourceUrl" label={t("version.sourceUrl")}><Input id="sourceUrl" value={meta.sourceUrl ?? ""} disabled={!editable} onChange={(e) => setMeta({ ...meta, sourceUrl: e.target.value })} /></Field>
                <Field id="legalReference" label={t("version.legalReference")}><Input id="legalReference" value={meta.legalReference ?? ""} disabled={!editable} onChange={(e) => setMeta({ ...meta, legalReference: e.target.value })} /></Field>
                <div className="md:col-span-2">
                  <Field id="reasonText" label={t("version.reasonText")}><Textarea id="reasonText" rows={2} value={meta.reasonText ?? ""} disabled={!editable} onChange={(e) => setMeta({ ...meta, reasonText: e.target.value })} /></Field>
                </div>
                <div className="md:col-span-2">
                  <Field id="assumptions" label={t("version.assumptions")}><Textarea id="assumptions" rows={4} value={meta.assumptions ?? ""} disabled={!editable} onChange={(e) => setMeta({ ...meta, assumptions: e.target.value })} /></Field>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">{t("version.sourceRequired")}</p>
            </section>

            <section className="space-y-3">
              <h3 className="font-medium">{t("version.parameters")}</h3>
              {groups.map(([category, defs]) => (
                <div key={category} className="rounded-md border">
                  <div className="border-b bg-muted/40 px-3 py-1.5 text-sm font-medium">{CATEGORY_LABELS[category] ?? category}</div>
                  <div className="divide-y">
                    {defs.map((def) => (
                      <div key={def.key} className="grid gap-2 px-3 py-2 md:grid-cols-[1fr_260px]" data-testid={`param-${def.key}`}>
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-medium">{def.displayName}</span>
                            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">{t(`version.${def.legalStatus}`)}</span>
                            {UNIT_LABELS[def.unit] && <span className="text-xs text-muted-foreground">{t("version.unit")}: {UNIT_LABELS[def.unit]}</span>}
                          </div>
                          <p className="text-xs text-muted-foreground">{def.description}</p>
                          {!editable && <p className="mt-1 text-sm" data-testid={`value-${def.key}`}>{formatParameterValue(def.dataType, def.unit, detail.values[def.key])}</p>}
                          {editable && def.legalStatus === "legal" && (
                            <div className="mt-1 grid gap-1 sm:grid-cols-2">
                              <Input placeholder={t("version.paramSourceUrl")} value={sources[def.key]?.sourceUrl ?? ""} onChange={(e) => setSources({ ...sources, [def.key]: { ...sources[def.key], sourceUrl: e.target.value } })} className="h-8 text-xs" />
                              <Input placeholder={t("version.paramSourceReference")} value={sources[def.key]?.sourceReference ?? ""} onChange={(e) => setSources({ ...sources, [def.key]: { ...sources[def.key], sourceReference: e.target.value } })} className="h-8 text-xs" />
                            </div>
                          )}
                        </div>
                        {editable && (
                          <div>
                            <ParameterInput def={def} value={values[def.key] ?? ""} onChange={(v) => setValues({ ...values, [def.key]: v })} />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </section>

            <section>
              <h3 className="font-medium">{t("version.validation")}</h3>
              {detail.validation.ok ? (
                <p className="text-sm text-green-700">{t("version.validationOk")}</p>
              ) : (
                <div className="text-sm">
                  <p className="text-amber-700">{t("version.validationIssues")}</p>
                  <ul className="list-disc pl-5 text-muted-foreground">
                    {detail.validation.issues.map((i) => (
                      <li key={`${i.key}-${i.message}`}>{i.key}: {i.message}</li>
                    ))}
                  </ul>
                </div>
              )}
            </section>

            {impact && (impact.running || impact.result || impact.error) && (
              <section className="rounded-md border p-3" data-testid="impact-panel">
                <h3 className="font-medium">{t("impact.title")}</h3>
                <p className="text-xs text-muted-foreground">{t("impact.estimate")}</p>
                {impact.running && <p className="text-sm">{t("version.impactRunning")}</p>}
                {impact.error && <p className="text-sm text-destructive">{t("impact.error", { message: impact.error })}</p>}
                {impact.result && (
                  <div className="mt-2 grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
                    <Stat label={t("impact.customers")} value={String(impact.result.customers)} />
                    <Stat label={t("impact.vehicles")} value={String(impact.result.vehicles)} />
                    <Stat label={t("impact.periods")} value={String(impact.result.periods)} />
                    <Stat label={t("impact.currentTotal")} value={formatEuro(impact.result.currentTotal)} />
                    <Stat label={t("impact.draftTotal")} value={formatEuro(impact.result.draftTotal)} />
                    <Stat label={t("impact.difference")} value={formatEuro(impact.result.difference)} />
                    <Stat label={t("impact.annual")} value={formatEuro(impact.result.annualImpact)} />
                    <Stat label={t("impact.monthly")} value={formatEuro(impact.result.monthlyImpact)} />
                    <Stat label={t("impact.manualReview")} value={String(impact.result.manualReview)} />
                    <Stat label={t("impact.dataInsufficient")} value={String(impact.result.dataInsufficient)} />
                    <div className="col-span-2 text-xs text-muted-foreground">
                      {t("impact.window", { from: dateLabelNl(impact.result.windowFrom), to: dateLabelNl(impact.result.windowTo) })} · {t("impact.computedAt", { at: new Date(impact.result.computedAt).toLocaleString("nl-NL") })}
                    </div>
                  </div>
                )}
              </section>
            )}

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="flex flex-wrap gap-2">
              {editable && <Button onClick={() => save.mutate()} disabled={save.isPending} data-testid="button-version-save">{t("version.save")}</Button>}
              {editable && <Button variant="outline" onClick={() => action.mutate({ name: "submit" })} disabled={action.isPending} data-testid="button-version-submit">{t("version.submit")}</Button>}
              {detail.status === "in_review" && canApprove && (
                <>
                  <Button onClick={() => action.mutate({ name: "approve" })} disabled={action.isPending} data-testid="button-version-approve">{t("version.approve")}</Button>
                  <div className="flex items-center gap-2">
                    <Input placeholder={t("version.rejectReason")} value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} className="h-9 w-64" />
                    <Button variant="outline" disabled={!rejectReason.trim() || action.isPending} onClick={() => action.mutate({ name: "reject", body: { reason: rejectReason } })} data-testid="button-version-reject">{t("version.reject")}</Button>
                  </div>
                </>
              )}
              {detail.status === "approved" && canPublish && (
                <Button onClick={() => setPublishOpen(true)} data-testid="button-version-publish">{t("version.publish")}</Button>
              )}
              {canConfigure && ["draft", "in_review", "approved"].includes(detail.status) && (
                <Button variant="outline" onClick={() => startImpact.mutate()} disabled={startImpact.isPending || impact?.running} data-testid="button-version-impact">{t("version.impact")}</Button>
              )}
              {canConfigure && ["draft", "rejected"].includes(detail.status) && (
                <Button variant="ghost" onClick={() => { if (window.confirm(t("version.confirmArchive"))) action.mutate({ name: "archive" }); }} disabled={action.isPending} data-testid="button-version-archive">{t("version.archive")}</Button>
              )}
            </div>

            <section>
              <h3 className="font-medium">{t("version.auditTitle")}</h3>
              <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                {detail.audit.slice(0, 50).map((e) => (
                  <li key={e.id}>
                    {new Date(e.occurredAt).toLocaleString("nl-NL")} · {e.username} · {t(`audit.actions.${e.action}`, { defaultValue: e.action })}
                    {e.parameterKey ? ` · ${e.parameterKey}` : ""}
                    {e.oldValue !== null || e.newValue !== null ? ` · ${e.oldValue ?? "—"} → ${e.newValue ?? "—"}` : ""}
                  </li>
                ))}
              </ul>
            </section>

            {publishOpen && (
              <PublishDialog
                open={publishOpen}
                onOpenChange={setPublishOpen}
                version={detail}
                current={current}
                definitions={definitions}
                impact={impact?.result ?? null}
                onPublished={() => {
                  invalidate();
                  toast({ title: t("publish.done") });
                }}
              />
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  );
}

function ParameterInput({ def, value, onChange }: { def: FiscalParameterDefinition; value: string | string[]; onChange: (v: string | string[]) => void }) {
  const id = `param-${def.key}`;
  switch (def.dataType) {
    case "decimal":
    case "integer":
      return <Input id={id} type="number" step={def.dataType === "integer" ? 1 : 10 ** -(def.decimals ?? 2)} min={def.min} max={def.max} value={value as string} onChange={(e) => onChange(e.target.value)} data-testid={`input-${def.key}`} />;
    case "boolean":
      return (
        <select id={id} className="w-full rounded-md border px-3 py-2 text-sm" value={value as string} onChange={(e) => onChange(e.target.value)} data-testid={`input-${def.key}`}>
          <option value="">—</option>
          <option value="true">Ja</option>
          <option value="false">Nee</option>
        </select>
      );
    case "date":
      return <Input id={id} type="date" value={value as string} onChange={(e) => onChange(e.target.value)} data-testid={`input-${def.key}`} />;
    case "choice":
      return (
        <select id={id} className="w-full rounded-md border px-3 py-2 text-sm" value={value as string} onChange={(e) => onChange(e.target.value)} data-testid={`input-${def.key}`}>
          <option value="">—</option>
          {(def.allowedValues ?? []).map((v) => (
            <option key={v} value={v}>{CHOICE_LABELS[v] ?? v}</option>
          ))}
        </select>
      );
    case "list": {
      const selected = new Set(value as string[]);
      return (
        <div className="flex flex-wrap gap-2" data-testid={`input-${def.key}`}>
          {(def.allowedValues ?? []).map((v) => (
            <label key={v} className="flex items-center gap-1 text-xs">
              <input
                type="checkbox"
                checked={selected.has(v)}
                onChange={(e) => {
                  const next = new Set(selected);
                  if (e.target.checked) next.add(v);
                  else next.delete(v);
                  onChange([...next]);
                }}
              />
              {CHOICE_LABELS[v] ?? v}
            </label>
          ))}
        </div>
      );
    }
  }
}
