/**
 * D15 (besluiten B-41/B-42, ontwerp 12) — Instellingen > Bedrijf > "Bedrijfsnaam".
 *
 * One name for every mail the application sends (reminders, the default sender name,
 * portal mails) and for the `{companyName}` placeholder of a message template. Stored as
 * the `company_name` app setting; until one is saved the default "Autolease Lam" applies.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Building2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, invalidateByPrefix } from "@/lib/queryClient";
import { parseApiError, describeApiError } from "@/lib/api-error";
import { COMPANY_NAME_KEY, COMPANY_NAME_MAX_LENGTH, companyNameFromSetting, validCompanyName } from "@shared/company-name";

export function CompanyNameCard() {
  const { t } = useTranslation(["settings", "common"]);
  const { toast } = useToast();
  const [draft, setDraft] = useState<string | null>(null);

  const { data } = useQuery<{ value?: unknown } | null>({ queryKey: [`/api/app-settings/key/${COMPANY_NAME_KEY}`] });
  const saved = companyNameFromSetting(data?.value);
  const shown = draft ?? saved;
  const acceptable = validCompanyName(shown) !== null;

  const save = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/app-settings", {
        key: COMPANY_NAME_KEY,
        value: shown.trim(),
        category: "business",
        description: "Bedrijfsnaam in alle mails en in de plekhouder {companyName} (D15)",
      });
    },
    onSuccess: () => {
      setDraft(null);
      invalidateByPrefix("/api/app-settings");
      toast({ title: t("common:status.success"), description: t("settingsPage.business.companyNameSaved") });
    },
    onError: (error) => {
      const { code } = parseApiError(error);
      toast({
        title: t("common:status.error"),
        description: code === "INVALID_COMPANY_NAME"
          ? t("settingsPage.business.companyNameInvalid")
          : describeApiError(error, undefined, t("settingsPage.business.companyNameSaveFailed")),
        variant: "destructive",
      });
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Building2 className="h-5 w-5" />
          {t("settingsPage.business.companyNameTitle")}
        </CardTitle>
        <CardDescription>{t("settingsPage.business.companyNameDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-2">
          <Label htmlFor="company-name-input">{t("settingsPage.business.companyNameLabel")}</Label>
          <Input
            id="company-name-input"
            value={shown}
            maxLength={COMPANY_NAME_MAX_LENGTH}
            onChange={(e) => setDraft(e.target.value)}
            className="md:max-w-md"
            data-testid="input-company-name"
          />
          <p className="text-xs text-gray-500" data-testid="help-company-name">
            {t("settingsPage.business.companyNameHelp")}
          </p>
        </div>
        <Button
          onClick={() => save.mutate()}
          disabled={save.isPending || !acceptable || draft === null || shown.trim() === saved}
          data-testid="button-save-company-name"
        >
          {save.isPending ? t("common:status.saving") : t("settingsPage.business.companyNameSaveButton")}
        </Button>
      </CardContent>
    </Card>
  );
}
