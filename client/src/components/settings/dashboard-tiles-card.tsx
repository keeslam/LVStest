/**
 * Kees, 2026-10-19 — Instellingen > Dashboard: which tiles everyone sees, and in
 * what order. Tick to show, arrows to move. Stored as the `dashboard_tiles` app
 * setting (shared/dashboard-tiles.ts); the dashboard follows after saving.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, LayoutDashboard } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, invalidateByPrefix } from "@/lib/queryClient";
import { describeApiError } from "@/lib/api-error";
import {
  DASHBOARD_TILES_KEY,
  dashboardTilesFromSetting,
  dashboardTilesToSetting,
  type DashboardTile,
} from "@shared/dashboard-tiles";

export function DashboardTilesCard() {
  const { t } = useTranslation(["settings", "common"]);
  const { toast } = useToast();
  const { data, isSuccess } = useQuery<{ value?: unknown } | null>({
    queryKey: [`/api/app-settings/key/${DASHBOARD_TILES_KEY}`],
  });
  const [draft, setDraft] = useState<DashboardTile[] | null>(null);
  const tiles = draft ?? dashboardTilesFromSetting(isSuccess ? data?.value : null);

  const move = (index: number, by: -1 | 1) => {
    const next = [...tiles];
    const target = index + by;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setDraft(next);
  };
  const toggle = (index: number, visible: boolean) =>
    setDraft(tiles.map((tile, i) => (i === index ? { ...tile, visible } : tile)));

  const save = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/app-settings", {
        key: DASHBOARD_TILES_KEY,
        value: dashboardTilesToSetting(tiles),
        category: "general",
        description: "Welke tegels het dashboard toont en in welke volgorde (voor iedereen)",
      });
    },
    onSuccess: () => {
      setDraft(null);
      invalidateByPrefix("/api/app-settings");
      toast({ title: t("common:status.success"), description: t("settingsPage.dashboardTiles.saved") });
    },
    onError: (error) => {
      toast({ variant: "destructive", title: t("settingsPage.dashboardTiles.saveFailed"), description: describeApiError(error) });
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <LayoutDashboard className="h-5 w-5" />
          {t("settingsPage.dashboardTiles.title")}
        </CardTitle>
        <CardDescription>{t("settingsPage.dashboardTiles.description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <ol className="space-y-2" data-testid="dashboard-tiles-list">
          {tiles.map((tile, index) => (
            <li key={tile.id} className="flex items-center gap-3 rounded-md border p-2" data-testid={`dashboard-tile-setting-${tile.id}`}>
              <span className="w-6 text-right text-sm text-muted-foreground">{index + 1}.</span>
              <label className="flex flex-1 items-center gap-2 cursor-pointer">
                <Checkbox
                  checked={tile.visible}
                  onCheckedChange={(v) => toggle(index, v === true)}
                  data-testid={`checkbox-dashboard-tile-${tile.id}`}
                />
                <span className={tile.visible ? "" : "text-muted-foreground line-through"}>
                  {t(`settingsPage.dashboardTiles.tiles.${tile.id}`)}
                </span>
              </label>
              <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0" disabled={index === 0}
                onClick={() => move(index, -1)} aria-label={t("settingsPage.dashboardTiles.moveUp")} data-testid={`button-tile-up-${tile.id}`}>
                <ArrowUp className="h-4 w-4" />
              </Button>
              <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0" disabled={index === tiles.length - 1}
                onClick={() => move(index, 1)} aria-label={t("settingsPage.dashboardTiles.moveDown")} data-testid={`button-tile-down-${tile.id}`}>
                <ArrowDown className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ol>
        <div className="flex justify-end gap-2">
          {draft && (
            <Button type="button" variant="outline" onClick={() => setDraft(null)}>{t("common:actions.cancel")}</Button>
          )}
          <Button type="button" onClick={() => save.mutate()} disabled={!draft || save.isPending} data-testid="button-save-dashboard-tiles">
            {t("common:actions.save")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
