/**
 * WAVE 15 item 3 — het kantooradres voor meldingen.
 *
 * besluiten **B-24** (BUG-170): an APK reminder goes to the current renter, and
 * "staat de auto leeg, dan gaat er alleen een melding naar kantoor". The server
 * has read the app setting `notification_office_email` for that notice since
 * WAVE 11 and falls back to the address it sends *from* when the setting is
 * empty — but there was no field for it in any screen, so it could only ever be
 * empty. The eindrapport listed it as an open question rather than a feature.
 *
 * Its own component, next to the SMTP configuration on the e-mail tab, so the
 * one thing that matters about it — what the address is used for, and what
 * happens while it is blank — is stated where it is typed.
 */
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Building2 } from "lucide-react";

export interface OfficeNotificationEmailProps {
  value: string;
  /** The address the application sends from; the server falls back to it. */
  senderEmail: string;
  onChange: (value: string) => void;
  onSave: () => void;
  saving?: boolean;
}

export function OfficeNotificationEmail({
  value, senderEmail, onChange, onSave, saving = false,
}: OfficeNotificationEmailProps) {
  const { t } = useTranslation(["settings", "common"]);

  const fallback = senderEmail
    ? t("settingsPage.email.officeEmailFallback", { sender: senderEmail })
    : t("settingsPage.email.officeEmailNoSender");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Building2 className="h-5 w-5" />
          {t("settingsPage.email.officeEmailTitle")}
        </CardTitle>
        <CardDescription>{t("settingsPage.email.officeEmailDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-2">
          <Label htmlFor="notification-office-email">{t("settingsPage.email.officeEmailLabel")}</Label>
          <Input
            id="notification-office-email"
            type="email"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="kantoor@lamgroep.nl"
            className="md:max-w-md"
            data-testid="input-notification-office-email"
          />
          <p className="text-xs text-gray-500" data-testid="help-notification-office-email">
            {t("settingsPage.email.officeEmailHelp")} {fallback}
          </p>
        </div>
        <Button
          onClick={onSave}
          disabled={saving}
          data-testid="button-save-notification-office-email"
        >
          {saving ? t("common:status.saving") : t("settingsPage.email.officeEmailSaveButton")}
        </Button>
      </CardContent>
    </Card>
  );
}
