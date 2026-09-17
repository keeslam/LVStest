import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { dateLabelNl, formatEuro } from "@shared/fiscal-format";
import { FISCAL_STATUS_LABELS, FUEL_CATEGORIES } from "@shared/fiscal-types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useFiscalPermissions } from "./use-fiscal-permissions";
import type { FiscalProfileResponse } from "./types";

const EUROPEAN_CATEGORIES = ["M1", "M2", "M3", "N1", "N2", "N3", "L", "O", "T", "other"] as const;
type Field = "catalogValue" | "marketValue" | "firstAdmissionDate" | "fuelCategory" | "europeanCategory" | "isDrivingSchoolManual";
const FIELDS: Field[] = ["catalogValue", "marketValue", "firstAdmissionDate", "fuelCategory", "europeanCategory", "isDrivingSchoolManual"];

/** The "Fiscaal" tab of a vehicle: profile with provenance, manual corrections, latest assessments. */
export function VehicleFiscalTab({ vehicleId }: { vehicleId: number }) {
  const { t } = useTranslation("fiscal");
  const { toast } = useToast();
  const { canReview } = useFiscalPermissions();
  const queryClient = useQueryClient();
  const key = [`/api/vehicles/${vehicleId}/fiscal-profile`] as const;
  const { data, isLoading, error } = useQuery<FiscalProfileResponse>({ queryKey: key });
  const [editing, setEditing] = useState<Field | null>(null);
  const [value, setValue] = useState("");
  const [reason, setReason] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const refresh = useMutation({
    mutationFn: async () => (await apiRequest("POST", `/api/vehicles/${vehicleId}/fiscal-profile/refresh`)).json() as Promise<FiscalProfileResponse & { refresh: { ok: boolean; error: string | null; changed: string[] } }>,
    onSuccess: (row) => {
      queryClient.invalidateQueries({ queryKey: key });
      queryClient.invalidateQueries({ queryKey: ["/api/fiscal/overview"] });
      toast(row.refresh.ok ? { title: t("vehicle.refreshed", { count: row.refresh.changed.length }) } : { title: t("vehicle.refreshFailed", { message: row.refresh.error ?? "" }), variant: "destructive" });
    },
    onError: (e: Error) => toast({ title: e.message.replace(/^\d{3}:\s*/, ""), variant: "destructive" }),
  });

  const save = useMutation({
    mutationFn: async () => {
      const field = editing!;
      const typed: unknown = field === "isDrivingSchoolManual" ? value === "true" : value;
      return (await apiRequest("PATCH", `/api/vehicles/${vehicleId}/fiscal-profile`, { field, value: typed, reason })).json();
    },
    onSuccess: () => {
      setEditing(null);
      setValue("");
      setReason("");
      setFormError(null);
      queryClient.invalidateQueries({ queryKey: key });
      queryClient.invalidateQueries({ queryKey: ["/api/fiscal/overview"] });
      toast({ title: t("vehicle.saved") });
    },
    onError: (e: Error) => setFormError(e.message.replace(/^\d{3}:\s*/, "")),
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">{t("common.loading")}</p>;
  if (error || !data) return <p className="text-sm text-destructive">{t("common.error", { message: (error as Error)?.message ?? "" })}</p>;

  const source = (name: string) => t(`vehicle.sources.${name}`, { defaultValue: name });
  const display = (field: Field): { text: string; source: string } => {
    const manual = data.manualOverride?.[field] ? "manual" : null;
    switch (field) {
      case "catalogValue":
        return { text: data.catalogValue ? formatEuro(data.catalogValue) : t("vehicle.unknown"), source: source(data.catalogValueSource) };
      case "marketValue":
        return { text: data.marketValue ? formatEuro(data.marketValue) : t("vehicle.unknown"), source: source(manual ?? (data.marketValue ? "manual" : "unknown")) };
      case "firstAdmissionDate":
        return { text: data.firstAdmissionDate ? dateLabelNl(data.firstAdmissionDate) : t("vehicle.unknown"), source: source(data.firstAdmissionSource) };
      case "fuelCategory":
        return { text: t(`vehicle.fuel.${data.fuelCategory}`, { defaultValue: data.fuelCategory }), source: source(manual ?? (data.fuelCategory === "unknown" ? "unknown" : data.rdwRetrievedAt ? "rdw" : "vehicle_record")) };
      case "europeanCategory":
        return { text: data.europeanCategory ?? t("vehicle.unknown"), source: source(manual ?? (data.europeanCategory ? "rdw" : "unknown")) };
      case "isDrivingSchoolManual":
        return { text: data.isDrivingSchoolManual ? t("vehicle.yes") : t("vehicle.no"), source: source(manual ?? "vehicle_record") };
    }
  };

  const startEdit = (field: Field) => {
    setEditing(field);
    setFormError(null);
    setReason("");
    if (field === "isDrivingSchoolManual") setValue(String(data.isDrivingSchoolManual));
    else if (field === "fuelCategory") setValue(data.fuelCategory === "unknown" ? "fossil" : data.fuelCategory);
    else if (field === "europeanCategory") setValue(data.europeanCategory ?? "M1");
    else if (field === "firstAdmissionDate") setValue(data.firstAdmissionDate ?? "");
    else setValue((field === "catalogValue" ? data.catalogValue : data.marketValue) ?? "");
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{t("vehicle.title")}</CardTitle>
          <CardDescription>{t("vehicle.description")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="grid gap-3 md:grid-cols-2">
            {FIELDS.map((field) => {
              const { text, source: from } = display(field);
              return (
                <div key={field} className="rounded-md border p-3" data-testid={`profile-${field}`}>
                  <div className="text-xs text-muted-foreground">{t(`vehicle.${field}`)}</div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{text}</span>
                    <span className="rounded bg-muted px-2 py-0.5 text-xs">{from}</span>
                  </div>
                  {canReview && editing !== field && (
                    <button type="button" className="mt-1 text-xs underline text-muted-foreground" onClick={() => startEdit(field)} data-testid={`button-edit-${field}`}>
                      {t("vehicle.edit")}
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {editing && (
            <div className="rounded-md border bg-muted/30 p-3" data-testid="override-editor">
              <h4 className="mb-2 font-medium">{t("vehicle.editTitle")}: {t(`vehicle.${editing}`)}</h4>
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="override-value">{t("vehicle.value")}</Label>
                  {editing === "fuelCategory" || editing === "europeanCategory" || editing === "isDrivingSchoolManual" ? (
                    <select id="override-value" className="w-full rounded-md border px-3 py-2 text-sm" value={value} onChange={(e) => setValue(e.target.value)} data-testid="input-override-value">
                      {editing === "fuelCategory" && FUEL_CATEGORIES.filter((c) => c !== "unknown").map((c) => <option key={c} value={c}>{t(`vehicle.fuel.${c}`)}</option>)}
                      {editing === "europeanCategory" && EUROPEAN_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                      {editing === "isDrivingSchoolManual" && (
                        <>
                          <option value="true">{t("vehicle.yes")}</option>
                          <option value="false">{t("vehicle.no")}</option>
                        </>
                      )}
                    </select>
                  ) : (
                    <Input id="override-value" type={editing === "firstAdmissionDate" ? "date" : "text"} value={value} onChange={(e) => setValue(e.target.value)} data-testid="input-override-value" />
                  )}
                </div>
                <div className="space-y-1">
                  <Label htmlFor="override-reason">{t("vehicle.reason")}</Label>
                  <Input id="override-reason" value={reason} onChange={(e) => setReason(e.target.value)} data-testid="input-override-reason" />
                </div>
              </div>
              {formError && <p className="mt-2 text-destructive">{formError}</p>}
              <div className="mt-2 flex gap-2">
                <Button size="sm" disabled={!reason.trim() || save.isPending} onClick={() => save.mutate()} data-testid="button-override-save">{t("vehicle.save")}</Button>
                <Button size="sm" variant="outline" onClick={() => setEditing(null)}>{t("vehicle.cancel")}</Button>
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              {t("vehicle.rdw")}: {data.rdwRetrievedAt ? t("vehicle.rdwAt", { at: new Date(data.rdwRetrievedAt).toLocaleString("nl-NL") }) : t("vehicle.rdwNever")}
              {data.rdwError ? ` — ${t("vehicle.rdwError", { message: data.rdwError })}` : ""}
            </p>
            {canReview && (
              <Button size="sm" variant="outline" disabled={refresh.isPending} onClick={() => refresh.mutate()} data-testid="button-profile-refresh">
                {t("vehicle.refresh")}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{t("vehicle.assessments")}</CardTitle>
          <CardDescription>{t("common.disclaimer")}</CardDescription>
        </CardHeader>
        <CardContent>
          {!data.latestAssessments?.length && <p className="text-sm text-muted-foreground">{t("vehicle.noAssessments")}</p>}
          {!!data.latestAssessments?.length && (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="py-1 pr-2 font-normal">{t("vehicle.period")}</th>
                  <th className="py-1 pr-2 font-normal">{t("vehicle.status")}</th>
                  <th className="py-1 pr-2 font-normal">{t("vehicle.months")}</th>
                  <th className="py-1 font-normal">{t("vehicle.amount")}</th>
                </tr>
              </thead>
              <tbody>
                {data.latestAssessments.map((a) => (
                  <tr key={a.id} className="border-t" data-testid={`assessment-row-${a.id}`}>
                    <td className="py-1 pr-2">
                      {dateLabelNl(a.periodStart)} t/m {a.periodEnd ? dateLabelNl(a.periodEnd) : "…"}
                      <a href={`/api/fiscal/assessments/${a.id}/pdf`} target="_blank" rel="noreferrer" className="ml-2 text-xs underline" data-testid={`assessment-pdf-${a.id}`}>
                        {t("common.pdf")}
                      </a>
                    </td>
                    <td className="py-1 pr-2">{FISCAL_STATUS_LABELS[a.status] ?? a.status}</td>
                    <td className="py-1 pr-2">{a.monthsCharged}</td>
                    <td className="py-1">
                      {a.amount ? formatEuro(a.amount) : "—"}
                      {a.isFinal && <span className="ml-2 rounded bg-emerald-100 px-1.5 py-0.5 text-xs text-emerald-900" data-testid={`assessment-final-${a.id}`}>{t("common.final")}</span>}
                      {!a.isFinal && a.amount && a.provisionalAmount && a.provisionalAmount !== "0.00" && (
                        <span className="ml-2 text-xs text-muted-foreground" data-testid={`assessment-provisional-${a.id}`}>
                          {t("common.settledPart", { amount: formatEuro(a.settledAmount ?? "0.00") })} · {t("common.provisionalPart", { amount: formatEuro(a.provisionalAmount) })}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
