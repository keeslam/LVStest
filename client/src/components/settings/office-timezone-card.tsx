/**
 * D11 (besluiten B-41, ontwerp 7.1) — Instellingen > Bedrijf > "Tijdzone van het kantoor".
 *
 * The app reads "today", the hour of the nightly jobs and the time on a document in
 * one zone, stored as the `office_timezone` app setting (default Europe/Amsterdam).
 * The list offers the European zones from `Intl.supportedValuesOf('timeZone')` with a
 * search field; the stored zone always stays in it, also when it is not a European one.
 * Summer and winter time follow from the zone itself, so the card only shows the
 * current offset and whether summer time is on right now.
 */
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Clock } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, invalidateByPrefix } from "@/lib/queryClient";
import { describeApiError } from "@/lib/api-error";
import { setOfficeTimeZone, useOfficeTimeZone } from "@/lib/office-timezone";
import {
  OFFICE_TIMEZONE_KEY,
  europeanTimeZones,
  isDaylightSavingTime,
  observesDaylightSaving,
  officeTimeZoneFromSetting,
  zoneOffsetLabel,
} from "@shared/office-timezone";

export function OfficeTimeZoneCard() {
  const { t } = useTranslation(["settings", "common"]);
  const { toast } = useToast();
  const storeZone = useOfficeTimeZone();
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState<string | null>(null);

  const { data, isSuccess } = useQuery<{ value?: unknown } | null>({
    queryKey: [`/api/app-settings/key/${OFFICE_TIMEZONE_KEY}`],
  });
  // What is saved: the answer of the server once it is there, else what the app already uses.
  const savedZone = isSuccess ? officeTimeZoneFromSetting(data?.value) : storeZone;
  const selected = draft ?? savedZone;

  const options = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const all = europeanTimeZones();
    // The stored and the chosen zone stay in the list, whatever the search says.
    for (const keep of [savedZone, selected]) if (!all.includes(keep)) all.push(keep);
    return all.filter(
      (zone) =>
        zone === selected ||
        !needle ||
        zone.toLowerCase().includes(needle) ||
        zone.toLowerCase().includes(needle.replace(/\s+/g, "_")),
    );
  }, [search, savedZone, selected]);

  const now = new Date();
  const dstText = !observesDaylightSaving(selected, now)
    ? t("settingsPage.business.timeZoneNoDst")
    : isDaylightSavingTime(selected, now)
      ? t("settingsPage.business.timeZoneSummer")
      : t("settingsPage.business.timeZoneWinter");

  const save = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/app-settings", {
        key: OFFICE_TIMEZONE_KEY,
        value: selected,
        category: "business",
        description: "Tijdzone van het kantoor: bepaalt wat 'vandaag' is en wanneer geplande taken draaien (D11)",
      });
    },
    onSuccess: () => {
      // The server already uses the new zone; the screens follow at once instead of at the next refetch.
      setOfficeTimeZone(selected);
      setDraft(null);
      invalidateByPrefix("/api/app-settings");
      toast({
        title: t("common:status.success"),
        description: t("settingsPage.business.timeZoneSaved", { zone: selected }),
      });
    },
    onError: (error) => {
      toast({
        title: t("common:status.error"),
        description: describeApiError(error, undefined, t("settingsPage.business.timeZoneSaveFailed")),
        variant: "destructive",
      });
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-5 w-5" />
          {t("settingsPage.business.timeZoneTitle")}
        </CardTitle>
        <CardDescription>{t("settingsPage.business.timeZoneDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="office-timezone-search">{t("settingsPage.business.timeZoneSearchLabel")}</Label>
            <Input
              id="office-timezone-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("settingsPage.business.timeZoneSearchPlaceholder")}
              data-testid="input-office-timezone-search"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="office-timezone-select">{t("settingsPage.business.timeZoneSelectLabel")}</Label>
            <select
              id="office-timezone-select"
              value={selected}
              onChange={(e) => setDraft(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              data-testid="select-office-timezone"
            >
              {options.map((zone) => (
                <option key={zone} value={zone}>{zone}</option>
              ))}
            </select>
          </div>
        </div>
        <p className="text-sm text-muted-foreground" data-testid="office-timezone-summary">
          <span data-testid="office-timezone-offset">{zoneOffsetLabel(selected, now)}</span>
          {" — "}
          <span data-testid="office-timezone-dst">{dstText}</span>
        </p>
        <p className="text-xs text-gray-500">{t("settingsPage.business.timeZoneHint")}</p>
        <Button
          onClick={() => save.mutate()}
          disabled={save.isPending || selected === savedZone}
          data-testid="button-save-office-timezone"
        >
          {save.isPending ? t("common:status.saving") : t("settingsPage.business.timeZoneSaveButton")}
        </Button>
      </CardContent>
    </Card>
  );
}
