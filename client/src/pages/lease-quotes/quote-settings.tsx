import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { parseDutchAmount } from "@shared/lease-quote-calc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, invalidateByPrefix } from "@/lib/queryClient";
import { describeApiError } from "@/lib/api-error";

const FIELDS = [
  "interestRatePercent", "marginPerMonth", "robPerYear", "otherCostsPerYear",
  "excessKmPrice", "shortfallKmPrice", "validityDays",
] as const;
type Field = (typeof FIELDS)[number];
type Settings = Record<Field, number>;

/** 9.5 -> "9,5": the way a Dutch user types it. */
const toInput = (n: number) => String(n).replace(".", ",");

export function QuoteSettings() {
  const { t } = useTranslation("leaseQuotes");
  const { toast } = useToast();
  const { data, isLoading, isError } = useQuery<Settings>({ queryKey: ["/api/lease-quotes/settings"] });
  const [values, setValues] = useState<Record<Field, string> | null>(null);

  useEffect(() => {
    if (data && values === null) {
      setValues(Object.fromEntries(FIELDS.map((f) => [f, toInput(data[f])])) as Record<Field, string>);
    }
  }, [data, values]);

  const save = useMutation({
    mutationFn: async (body: Settings) => (await apiRequest("PUT", "/api/lease-quotes/settings", body)).json(),
    onSuccess: async () => {
      await invalidateByPrefix("/api/lease-quotes/settings");
      toast({ title: t("settings.saved") });
    },
    onError: (error) => toast({ title: t("settings.saveFailed"), description: describeApiError(error), variant: "destructive" }),
  });

  if (isLoading || (data && values === null)) {
    return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }
  if (isError || !values) return <p className="py-8 text-center text-destructive">{t("settings.loadFailed")}</p>;

  function submit() {
    if (!values) return;
    const parsed = {} as Settings;
    for (const field of FIELDS) {
      const n = parseDutchAmount(values[field]);
      if (n === null || n < 0) {
        toast({ title: t("settings.invalid", { field: t(`settings.${field}`) }), variant: "destructive" });
        return;
      }
      parsed[field] = n;
    }
    if (!Number.isInteger(parsed.validityDays) || parsed.validityDays < 1) {
      toast({ title: t("settings.invalidDays"), variant: "destructive" });
      return;
    }
    save.mutate(parsed);
  }

  return (
    <form className="max-w-xl space-y-4" onSubmit={(e) => { e.preventDefault(); submit(); }}>
      <p className="text-sm text-muted-foreground">{t("settings.intro")}</p>
      <div className="grid gap-4 sm:grid-cols-2">
        {FIELDS.map((field) => (
          <div key={field} className="space-y-1">
            <Label htmlFor={`lease-setting-${field}`}>{t(`settings.${field}`)}</Label>
            <Input
              id={`lease-setting-${field}`}
              inputMode="decimal"
              value={values[field]}
              onChange={(e) => setValues({ ...values, [field]: e.target.value })}
              data-testid={`input-${field}`}
            />
          </div>
        ))}
      </div>
      <p className="text-sm text-muted-foreground">{t("settings.note")}</p>
      <Button type="submit" disabled={save.isPending} data-testid="button-save-lease-settings">
        {save.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
        {t("settings.save")}
      </Button>
    </form>
  );
}
