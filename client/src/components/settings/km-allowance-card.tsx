/**
 * Punt 1 (Kees, 2026-10-19) — Instellingen > Bedrijf > "Kilometers per voertuigsoort".
 * Per vehicle type: free km per day and the price per extra km. A vehicle can
 * override both in its own form; the row "Overige" covers vehicles without a
 * type of their own. An empty row means no km settlement for that type.
 */
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Gauge } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, invalidateByPrefix } from "@/lib/queryClient";
import { describeApiError } from "@/lib/api-error";
import { formatVehicleType } from "@/lib/format-utils";
import {
  KM_ALLOWANCE_KEY,
  KM_ALLOWANCE_OTHER,
  kmAllowanceFromSetting,
  vehicleTypeKey,
  type KmAllowanceSetting,
} from "@shared/km-allowance";

/** The types the vehicle form offers; the fleet may hold more (Scooter, Trailer). */
const FORM_TYPES = ["Sedan", "SUV", "Van", "Hatchback", "Coupe", "Truck", "Stationwagen"];

type Draft = Record<string, { freeKmPerDay: string; pricePerKm: string }>;

const toText = (n: number | null | undefined) => (n == null ? "" : String(n).replace(".", ","));
const toNumber = (text: string): number | null | undefined => {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const n = Number(trimmed.replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : undefined;
};

export function KmAllowanceCard() {
  const { t } = useTranslation(["settings", "common"]);
  const { toast } = useToast();
  const { data: stored, isSuccess } = useQuery<{ value?: unknown } | null>({ queryKey: [`/api/app-settings/key/${KM_ALLOWANCE_KEY}`] });
  const { data: fleetTypes = [] } = useQuery<string[]>({ queryKey: ["/api/vehicles/types"] });
  const [draft, setDraft] = useState<Draft | null>(null);

  const saved = useMemo(() => kmAllowanceFromSetting(isSuccess ? stored?.value : null), [stored, isSuccess]);

  // One row per type, case-insensitive, labelled the way the rest of the app writes it; "Overige" last.
  const rows = useMemo(() => {
    const labels = new Map<string, string>();
    for (const type of [...FORM_TYPES, ...fleetTypes, ...Object.keys(saved.byType)]) {
      const key = vehicleTypeKey(type);
      if (key !== KM_ALLOWANCE_OTHER && !labels.has(key)) labels.set(key, type);
    }
    const sorted = Array.from(labels.entries()).sort((a, b) => formatVehicleType(a[1]).localeCompare(formatVehicleType(b[1])));
    return [...sorted.map(([key, label]) => ({ key, label: formatVehicleType(label) })), { key: KM_ALLOWANCE_OTHER, label: t("settingsPage.kmAllowance.otherRow") }];
  }, [fleetTypes, saved, t]);

  const values: Draft = draft ?? Object.fromEntries(rows.map(({ key }) => [key, {
    freeKmPerDay: toText(saved.byType[key]?.freeKmPerDay),
    pricePerKm: toText(saved.byType[key]?.pricePerKm),
  }]));

  const change = (key: string, field: "freeKmPerDay" | "pricePerKm", text: string) =>
    setDraft({ ...values, [key]: { ...(values[key] ?? { freeKmPerDay: "", pricePerKm: "" }), [field]: text } });

  const invalid = rows.some(({ key }) => toNumber(values[key]?.freeKmPerDay ?? "") === undefined || toNumber(values[key]?.pricePerKm ?? "") === undefined);

  const save = useMutation({
    mutationFn: async () => {
      const byType: KmAllowanceSetting["byType"] = {};
      for (const { key } of rows) {
        const free = toNumber(values[key]?.freeKmPerDay ?? "");
        const price = toNumber(values[key]?.pricePerKm ?? "");
        if (free == null && price == null) continue;
        byType[key] = { freeKmPerDay: free == null ? null : Math.round(free), pricePerKm: price ?? null };
      }
      await apiRequest("POST", "/api/app-settings", {
        key: KM_ALLOWANCE_KEY,
        value: { byType },
        category: "business",
        description: "Vrije kilometers per dag en prijs per extra km, per voertuigsoort (punt 1)",
      });
    },
    onSuccess: () => {
      setDraft(null);
      invalidateByPrefix("/api/app-settings");
      toast({ title: t("common:status.success"), description: t("settingsPage.kmAllowance.saved") });
    },
    onError: (error) => toast({ variant: "destructive", title: t("settingsPage.kmAllowance.saveFailed"), description: describeApiError(error) }),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Gauge className="h-5 w-5" />
          {t("settingsPage.kmAllowance.title")}
        </CardTitle>
        <CardDescription>{t("settingsPage.kmAllowance.description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="km-allowance-table">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="py-2 pr-3 font-medium">{t("settingsPage.kmAllowance.typeColumn")}</th>
                <th className="py-2 pr-3 font-medium">{t("settingsPage.kmAllowance.freeKmColumn")}</th>
                <th className="py-2 font-medium">{t("settingsPage.kmAllowance.priceColumn")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ key, label }) => (
                <tr key={key} className="border-t" data-testid={`km-allowance-row-${key}`}>
                  <td className="py-2 pr-3">{label}</td>
                  <td className="py-2 pr-3">
                    <Input inputMode="numeric" className="h-8 w-28" placeholder="—" value={values[key]?.freeKmPerDay ?? ""}
                      onChange={(e) => change(key, "freeKmPerDay", e.target.value)} aria-label={`${label}: ${t("settingsPage.kmAllowance.freeKmColumn")}`}
                      data-testid={`input-free-km-${key}`} />
                  </td>
                  <td className="py-2">
                    <Input inputMode="decimal" className="h-8 w-28" placeholder="—" value={values[key]?.pricePerKm ?? ""}
                      onChange={(e) => change(key, "pricePerKm", e.target.value)} aria-label={`${label}: ${t("settingsPage.kmAllowance.priceColumn")}`}
                      data-testid={`input-km-price-${key}`} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted-foreground">{t("settingsPage.kmAllowance.hint")}</p>
        {invalid && <p className="text-sm text-red-600">{t("settingsPage.kmAllowance.invalid")}</p>}
        <div className="flex justify-end gap-2">
          {draft && <Button type="button" variant="outline" onClick={() => setDraft(null)}>{t("common:actions.cancel")}</Button>}
          <Button type="button" onClick={() => save.mutate()} disabled={!draft || invalid || save.isPending} data-testid="button-save-km-allowance">
            {t("common:actions.save")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
