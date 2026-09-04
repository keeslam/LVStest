import { useTranslation } from "react-i18next";
import { AlertTriangle, CheckCircle2, Link2Off } from "lucide-react";
import type { FineScanResult, ParsedFineLetter } from "@shared/fines";

/** Sends one letter to POST /api/fines/scan. Creates nothing. */
export async function scanLetter(file: File): Promise<FineScanResult> {
  const body = new FormData();
  body.append("letterFile", file);
  const res = await fetch("/api/fines/scan", { method: "POST", body, credentials: "include" });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message ?? res.statusText);
  return res.json();
}

export interface FineFormFields { licensePlate: string; offenceAt: string; receivedAt: string; reference: string; description: string; amount: string }

/** Form values from a parsed letter; fields the model could not read keep the current value. */
export function scanToForm(p: ParsedFineLetter, current: Partial<FineFormFields> = {}): FineFormFields {
  return {
    licensePlate: p.licensePlate ?? current.licensePlate ?? "",
    offenceAt: p.offenceAt ? p.offenceAt.slice(0, 16) : current.offenceAt ?? "",
    receivedAt: p.letterDate ?? current.receivedAt ?? "",
    reference: p.reference ?? current.reference ?? "",
    description: p.description || (current.description ?? ""),
    amount: p.amount != null ? String(p.amount) : current.amount ?? "",
  };
}

/** One-line verdict of what attribution will do with a scanned letter. */
export function linkVerdict(r: FineScanResult, t: (k: string, o?: Record<string, unknown>) => string): { kind: "ok" | "none" | "multiple" | "noPlate" | "unknownVehicle"; text: string } {
  if (!r.parsed.licensePlate) return { kind: "noPlate", text: t("admin.fines.scan.noPlate") };
  if (!r.vehicle) return { kind: "unknownVehicle", text: t("admin.fines.scan.unknownVehicle", { plate: r.parsed.licensePlate }) };
  const c = r.candidates.covering;
  if (c.length === 1) return { kind: "ok", text: t("admin.fines.scan.willLink", { customer: c[0].customerName ?? "?", driver: c[0].driverName ? ` · ${c[0].driverName}` : "" }) };
  if (c.length > 1) return { kind: "multiple", text: t("admin.fines.scan.multiple", { n: c.length }) };
  return { kind: "none", text: t("admin.fines.scan.noCandidate") };
}

export function ScanSummary({ result, onOpenDuplicate }: { result: FineScanResult; onOpenDuplicate?: (id: number) => void }) {
  const { t } = useTranslation("portal");
  const verdict = linkVerdict(result, t);
  const lowFields = (Object.entries(result.parsed.confidence) as Array<[string, string]>).filter(([, v]) => v === "low").map(([k]) => t(`admin.fines.fields.${k === "licensePlate" ? "plate" : k}`));
  return (
    <div className="space-y-1 text-sm" data-testid="fine-scan-summary">
      {result.vehicle && <div className="text-muted-foreground">{t("admin.fines.scan.vehicle", { vehicle: `${result.vehicle.brand} ${result.vehicle.model}` })}{result.parsed.issuer ? ` · ${result.parsed.issuer}` : ""}</div>}
      <div className={`flex items-center gap-1.5 ${verdict.kind === "ok" ? "text-green-700" : "text-amber-700"}`}>
        {verdict.kind === "ok" ? <CheckCircle2 className="h-4 w-4" /> : <Link2Off className="h-4 w-4" />}{verdict.text}
      </div>
      {result.duplicateOf && (
        <div className="flex items-center gap-1.5 text-destructive">
          <AlertTriangle className="h-4 w-4" />
          {t("admin.fines.scan.duplicate", { id: result.duplicateOf.id })}
          {onOpenDuplicate && <button type="button" className="underline" onClick={() => onOpenDuplicate(result.duplicateOf!.id)}>{t("admin.fines.scan.openDuplicate")}</button>}
        </div>
      )}
      {lowFields.length > 0 && <div className="text-amber-700">{t("admin.fines.scan.lowConfidence", { fields: lowFields.join(", ") })}</div>}
    </div>
  );
}
