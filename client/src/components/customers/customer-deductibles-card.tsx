/**
 * Kees, 2026-10-21 — eigen risico for this customer, per vehicle type, domestic and
 * abroad (shared/customer-deductibles.ts). An empty box uses the general amount from
 * App-instellingen > Bedrijfsregels; the contract prints the amount for the rented
 * car's type.
 */
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ShieldCheck } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiRequest, invalidateByPrefix } from "@/lib/queryClient";
import { describeApiError } from "@/lib/api-error";
import { formatVehicleType } from "@/lib/format-utils";
import { useToast } from "@/hooks/use-toast";
import { useHasPermission } from "@/hooks/use-has-permission";
import { UserPermission } from "@shared/schema";
import { KM_ALLOWANCE_OTHER, vehicleTypeKey } from "@shared/km-allowance";
import type { CustomerDeductibles } from "@shared/customer-deductibles";

const FORM_TYPES = ["Sedan", "SUV", "Van", "Hatchback", "Coupe", "Truck", "Stationwagen"];
type Draft = Record<string, { domestic: string; abroad: string }>;

const toText = (n: number | null | undefined) => (n == null ? "" : String(n).replace(".", ","));
const toNumber = (text: string): number | null | undefined => {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const n = Number(trimmed.replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : undefined;
};

export function CustomerDeductiblesCard({ customer }: { customer: { id: number; deductibles?: unknown } }) {
  const { t } = useTranslation(["customers", "common"]);
  const { toast } = useToast();
  const canEdit = useHasPermission(UserPermission.MANAGE_CUSTOMERS);
  const { data: fleetTypes = [] } = useQuery<string[]>({ queryKey: ["/api/vehicles/types"] });
  const saved = ((customer.deductibles as CustomerDeductibles | null)?.byType) ?? {};
  const [draft, setDraft] = useState<Draft | null>(null);

  const rows = useMemo(() => {
    const labels = new Map<string, string>();
    for (const type of [...FORM_TYPES, ...fleetTypes, ...Object.keys(saved)]) {
      const key = vehicleTypeKey(type);
      if (key !== KM_ALLOWANCE_OTHER && !labels.has(key)) labels.set(key, type);
    }
    const sorted = Array.from(labels.entries()).sort((a, b) => formatVehicleType(a[1]).localeCompare(formatVehicleType(b[1])));
    return [...sorted.map(([key, label]) => ({ key, label: formatVehicleType(label) })), { key: KM_ALLOWANCE_OTHER, label: t("deductibles.otherRow") }];
  }, [fleetTypes, saved, t]);

  const values: Draft = draft ?? Object.fromEntries(rows.map(({ key }) => [key, { domestic: toText(saved[key]?.domestic), abroad: toText(saved[key]?.abroad) }]));
  const set = (key: string, field: "domestic" | "abroad", value: string) =>
    setDraft({ ...values, [key]: { ...(values[key] ?? { domestic: "", abroad: "" }), [field]: value } });

  const save = useMutation({
    mutationFn: async () => {
      const byType: CustomerDeductibles["byType"] = {};
      for (const [key, v] of Object.entries(values)) {
        const domestic = toNumber(v.domestic);
        const abroad = toNumber(v.abroad);
        if (domestic === undefined || abroad === undefined) throw new Error(t("deductibles.invalidAmount"));
        if (domestic !== null || abroad !== null) byType[key] = { domestic, abroad };
      }
      await apiRequest("PUT", `/api/customers/${customer.id}/deductibles`, { deductibles: Object.keys(byType).length ? { byType } : null });
    },
    onSuccess: () => {
      setDraft(null);
      invalidateByPrefix("/api/customers");
      toast({ title: t("common:status.success"), description: t("deductibles.saved") });
    },
    onError: (error) => toast({ variant: "destructive", title: t("deductibles.saveFailed"), description: describeApiError(error) }),
  });

  return (
    <Card data-testid="customer-deductibles-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5" />{t("deductibles.title")}</CardTitle>
        <CardDescription>{t("deductibles.description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("deductibles.type")}</TableHead>
                <TableHead>{t("deductibles.domestic")}</TableHead>
                <TableHead>{t("deductibles.abroad")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(({ key, label }) => (
                <TableRow key={key}>
                  <TableCell className="font-medium">{label}</TableCell>
                  {(["domestic", "abroad"] as const).map((field) => (
                    <TableCell key={field}>
                      <Input
                        inputMode="decimal"
                        className="w-28"
                        placeholder={t("deductibles.general")}
                        value={values[key]?.[field] ?? ""}
                        disabled={!canEdit}
                        onChange={(e) => set(key, field, e.target.value)}
                        data-testid={`input-deductible-${key}-${field}`}
                      />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        {canEdit && (
          <div className="flex justify-end gap-2">
            {draft && <Button variant="outline" onClick={() => setDraft(null)}>{t("common:actions.cancel")}</Button>}
            <Button onClick={() => save.mutate()} disabled={!draft || save.isPending} data-testid="button-save-deductibles">{t("common:actions.save")}</Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
