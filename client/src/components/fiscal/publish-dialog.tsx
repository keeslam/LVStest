import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { dateLabelNl, formatEuro, formatParameterValue } from "@shared/fiscal-format";
import { REASON_CATEGORY_LABELS, type ReasonCategory } from "@shared/fiscal-types";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { FiscalParameterDefinition, ImpactResult, VersionDetail } from "./types";

interface PublishDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  version: VersionDetail;
  /** The version in force at the draft's start, for the "was → becomes" list. */
  current: Pick<VersionDetail, "id" | "versionNumber" | "title" | "values"> | null;
  definitions: FiscalParameterDefinition[];
  impact: ImpactResult | null;
  onPublished: (published: VersionDetail) => void;
}

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

/**
 * The last step before a global change: everything that changes, for whom,
 * from when, on what authority — and an explicit confirmation before the
 * request goes out with `confirm: true`.
 */
export function PublishDialog({ open, onOpenChange, version, current, definitions, impact, onPublished }: PublishDialogProps) {
  const { t } = useTranslation("fiscal");
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const publish = useMutation({
    mutationFn: async () => (await apiRequest("POST", `/api/fiscal/rule-versions/${version.id}/publish`, { confirm: true })).json() as Promise<VersionDetail>,
    onSuccess: (published) => {
      setError(null);
      onPublished(published);
      onOpenChange(false);
    },
    onError: (e: Error) => setError(e.message.replace(/^\d{3}:\s*/, "")),
  });

  const changes = definitions
    .filter((d) => !current || !same(version.values[d.key], current.values[d.key]))
    .map((d) => ({ def: d, oldValue: current ? current.values[d.key] : undefined, newValue: version.values[d.key] }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" data-testid="dialog-publish">
        <DialogHeader>
          <DialogTitle>{t("publish.title")}</DialogTitle>
          <DialogDescription>
            {version.title} · {t("config.version", { n: version.versionNumber })} · <strong>{t("publish.scope")}</strong>
          </DialogDescription>
        </DialogHeader>

        <Alert variant="destructive">
          <AlertDescription>{t("publish.warning")}</AlertDescription>
        </Alert>

        <div className="space-y-3 text-sm">
          <div>
            <h4 className="font-medium">{t("publish.effective")}</h4>
            <p>
              {version.effectiveFrom ? dateLabelNl(version.effectiveFrom) : "—"}
              {version.effectiveUntil ? ` t/m ${dateLabelNl(version.effectiveUntil)}` : ` (${t("config.openEnd")})`}
            </p>
          </div>

          <div>
            <h4 className="font-medium">{t("publish.changes")}</h4>
            {!current && <p className="text-muted-foreground">{t("publish.noCurrent")}</p>}
            {current && changes.length === 0 && <p className="text-muted-foreground">{t("publish.noChanges")}</p>}
            {changes.length > 0 && (
              <table className="mt-1 w-full text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground">
                    <th className="py-1 pr-2 font-normal">{t("publish.parameter")}</th>
                    <th className="py-1 pr-2 font-normal">{t("publish.old")}</th>
                    <th className="py-1 font-normal">{t("publish.new")}</th>
                  </tr>
                </thead>
                <tbody>
                  {changes.map(({ def, oldValue, newValue }) => (
                    <tr key={def.key} className="border-t" data-testid={`change-${def.key}`}>
                      <td className="py-1 pr-2">{def.displayName}</td>
                      <td className="py-1 pr-2 text-muted-foreground">{current ? formatParameterValue(def.dataType, def.unit, oldValue) : "—"}</td>
                      <td className="py-1 font-medium">{formatParameterValue(def.dataType, def.unit, newValue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div data-testid="publish-impact">
            <h4 className="font-medium">{t("publish.impact")}</h4>
            {impact ? (
              <p>
                {t("impact.customers")}: {impact.customers} · {t("impact.vehicles")}: {impact.vehicles} · {t("impact.periods")}: {impact.periods} · {t("impact.difference")}: {formatEuro(impact.difference)} ·{" "}
                {t("impact.manualReview")}: {impact.manualReview} · {t("impact.dataInsufficient")}: {impact.dataInsufficient}
              </p>
            ) : (
              <p className="text-muted-foreground">{t("publish.noImpact")}</p>
            )}
          </div>

          <div>
            <h4 className="font-medium">{t("publish.source")}</h4>
            <p>
              {version.sourceOrganisation ? `${version.sourceOrganisation} — ` : ""}
              {version.sourceUrl ?? "—"}
              {version.legalReference ? ` (${version.legalReference})` : ""}
            </p>
          </div>

          <div>
            <h4 className="font-medium">{t("publish.reason")}</h4>
            <p>
              {REASON_CATEGORY_LABELS[version.reasonCategory as ReasonCategory] ?? version.reasonCategory}: {version.reasonText}
            </p>
          </div>
        </div>

        <label className="flex items-start gap-2 text-sm">
          <Checkbox checked={confirmed} onCheckedChange={(v) => setConfirmed(v === true)} data-testid="checkbox-publish-confirm" />
          <span>{t("publish.confirmLabel")}</span>
        </label>
        {error && <p className="text-sm text-destructive">{error}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t("publish.cancel")}</Button>
          <Button disabled={!confirmed || publish.isPending} onClick={() => publish.mutate()} data-testid="button-publish-confirm">
            {t("publish.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
