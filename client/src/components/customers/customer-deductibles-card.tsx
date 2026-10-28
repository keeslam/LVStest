/**
 * Kees, 2026-10-21 — eigen risico for this customer, domestic and abroad
 * (shared/customer-deductibles.ts). Kees, 2026-10-28: two rows only, car and bus; each
 * vehicle card says which one it is. An empty box uses
 * the general amount from Bedrijfsregels; the contract prints the amount for the rented
 * car's group.
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
import { useToast } from "@/hooks/use-toast";
import { useHasPermission } from "@/hooks/use-has-permission";
import { UserPermission } from "@shared/schema";
import { DEDUCTIBLE_GROUPS, DEFAULT_GROUP_DEDUCTIBLES, customerGroupDeductibles, type CustomerDeductibles, type DeductibleGroup } from "@shared/customer-deductibles";

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
  const { data: rulesSetting } = useQuery<{ value?: Record<string, unknown> } | null>({ queryKey: ["/api/app-settings/key/business_rules"] });
  const rules = rulesSetting?.value ?? {};
  const saved = useMemo(() => customerGroupDeductibles(customer.deductibles), [customer.deductibles]);
  const [draft, setDraft] = useState<Draft | null>(null);

  // The general amount per group, shown as the placeholder of an empty box.
  const general = (group: DeductibleGroup, field: "domestic" | "abroad") => {
    const stored = group === "bus"
      ? (field === "domestic" ? rules.eigenrisicoBusBinnenland : rules.eigenrisicoBusBuitenland)
      : (field === "domestic" ? rules.eigenrisicoBinnenland : rules.eigenrisicoBuitenland);
    const text = stored === null || stored === undefined || String(stored).trim() === "" ? DEFAULT_GROUP_DEDUCTIBLES[group][field] : String(stored).trim();
    return t("deductibles.generalAmount", { amount: text.replace(".", ",") });
  };

  const values: Draft = draft ?? Object.fromEntries(DEDUCTIBLE_GROUPS.map((key) => [key, { domestic: toText(saved[key].domestic), abroad: toText(saved[key].abroad) }]));
  const set = (key: DeductibleGroup, field: "domestic" | "abroad", value: string) =>
    setDraft({ ...values, [key]: { ...values[key], [field]: value } });

  const save = useMutation({
    mutationFn: async () => {
      const byGroup: NonNullable<CustomerDeductibles["byGroup"]> = {};
      for (const key of DEDUCTIBLE_GROUPS) {
        const domestic = toNumber(values[key].domestic);
        const abroad = toNumber(values[key].abroad);
        if (domestic === undefined || abroad === undefined) throw new Error(t("deductibles.invalidAmount"));
        if (domestic !== null || abroad !== null) byGroup[key] = { domestic, abroad };
      }
      await apiRequest("PUT", `/api/customers/${customer.id}/deductibles`, { deductibles: Object.keys(byGroup).length ? { byGroup } : null });
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
              {DEDUCTIBLE_GROUPS.map((key) => (
                <TableRow key={key}>
                  <TableCell className="font-medium">{t(`deductibles.group.${key}`)}</TableCell>
                  {(["domestic", "abroad"] as const).map((field) => (
                    <TableCell key={field}>
                      <Input
                        inputMode="decimal"
                        className="w-28"
                        placeholder={general(key, field)}
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
