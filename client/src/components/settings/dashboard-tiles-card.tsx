/**
 * Kees, 2026-10-19 — Instellingen > Dashboard: which tiles everyone sees, and in
 * what order. Tick to show, arrows to move. Stored as the `dashboard_tiles` app
 * setting (shared/dashboard-tiles.ts); the dashboard follows after saving.
 *
 * Kees, 2026-10-20 — the "Snelle acties" next to it (shared/quick-actions-layout.ts):
 * two columns side by side, the large tiles (at most six, fewer is fine) and the
 * buttons below them. Tick to show, arrows to move, a side arrow to switch column.
 */
import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, LayoutDashboard, Zap } from "lucide-react";
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
import {
  MAX_QUICK_ACTION_TILES,
  QUICK_ACTIONS_KEY,
  quickActionsFromSetting,
  quickActionsToSetting,
  type QuickActionChoice,
  type QuickActionPlace,
} from "@shared/quick-actions-layout";

/** Load one app setting, keep a local draft, save it with a toast. */
function useSettingDraft<T>(settingKey: string, fromSetting: (value: unknown) => T, toSetting: (draft: T) => unknown, description: string, savedText: string) {
  const { t } = useTranslation(["settings", "common"]);
  const { toast } = useToast();
  const { data, isSuccess } = useQuery<{ value?: unknown } | null>({
    queryKey: [`/api/app-settings/key/${settingKey}`],
  });
  const [draft, setDraft] = useState<T | null>(null);
  const stored = fromSetting(isSuccess ? data?.value : null);
  const current = draft ?? stored;
  // Functional updates, so two quick clicks before a re-render both count.
  const change = (update: (prev: T) => T) => setDraft((prev) => update(prev ?? stored));

  const save = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/app-settings", { key: settingKey, value: toSetting(current), category: "general", description });
    },
    onSuccess: () => {
      setDraft(null);
      invalidateByPrefix("/api/app-settings");
      toast({ title: t("common:status.success"), description: savedText });
    },
    onError: (error) => {
      toast({ variant: "destructive", title: t("settingsPage.dashboardTiles.saveFailed"), description: describeApiError(error) });
    },
  });
  return { current, change, dirty: draft !== null, reset: () => setDraft(null), save };
}

function SaveRow({ dirty, reset, save, testId }: { dirty: boolean; reset: () => void; save: { mutate: () => void; isPending: boolean }; testId: string }) {
  const { t } = useTranslation(["common"]);
  return (
    <div className="flex justify-end gap-2">
      {dirty && <Button type="button" variant="outline" onClick={reset}>{t("common:actions.cancel")}</Button>}
      <Button type="button" onClick={() => save.mutate()} disabled={!dirty || save.isPending} data-testid={testId}>
        {t("common:actions.save")}
      </Button>
    </div>
  );
}

function SettingCard({ icon, title, subtitle, children }: { icon: ReactNode; title: string; subtitle: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {icon}
          {title}
        </CardTitle>
        <CardDescription>{subtitle}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  );
}

export function DashboardTilesCard() {
  const { t } = useTranslation(["settings"]);
  const { current: tiles, change, dirty, reset, save } = useSettingDraft<DashboardTile[]>(
    DASHBOARD_TILES_KEY,
    dashboardTilesFromSetting,
    dashboardTilesToSetting,
    "Welke tegels het dashboard toont en in welke volgorde (voor iedereen)",
    t("settingsPage.dashboardTiles.saved"),
  );

  const move = (index: number, by: -1 | 1) =>
    change((prev) => {
      const next = [...prev];
      const target = index + by;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  const toggle = (index: number, visible: boolean) =>
    change((prev) => prev.map((tile, i) => (i === index ? { ...tile, visible } : tile)));

  return (
    <SettingCard icon={<LayoutDashboard className="h-5 w-5" />} title={t("settingsPage.dashboardTiles.title")} subtitle={t("settingsPage.dashboardTiles.description")}>
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
      <SaveRow dirty={dirty} reset={reset} save={save} testId="button-save-dashboard-tiles" />
    </SettingCard>
  );
}

export function QuickActionsSettingsCard() {
  const { t } = useTranslation(["settings", "dashboard"]);
  const { current: actions, change, dirty, reset, save } = useSettingDraft<QuickActionChoice[]>(
    QUICK_ACTIONS_KEY,
    quickActionsFromSetting,
    quickActionsToSetting,
    "Welke snelle acties het dashboard toont, als tegel of als knop, en in welke volgorde (voor iedereen)",
    t("settingsPage.quickActions.saved"),
  );
  const tileCount = actions.filter((a) => a.place === "tile").length;
  const tilesFull = tileCount >= MAX_QUICK_ACTION_TILES;

  // Swap with the neighbour in the same column; the other column keeps its spots.
  const move = (id: string, by: -1 | 1) =>
    change((prev) => {
      const at = prev.findIndex((a) => a.id === id);
      const column = prev.map((a, i) => (a.place === prev[at].place ? i : -1)).filter((i) => i >= 0);
      const target = column[column.indexOf(at) + by];
      if (target === undefined) return prev;
      const next = [...prev];
      [next[at], next[target]] = [next[target], next[at]];
      return next;
    });
  const toggle = (id: string, visible: boolean) => change((prev) => prev.map((a) => (a.id === id ? { ...a, visible } : a)));
  // To the other column, at the bottom of it.
  const switchPlace = (id: string, place: QuickActionPlace) =>
    change((prev) => {
      if (place === "tile" && prev.filter((a) => a.place === "tile").length >= MAX_QUICK_ACTION_TILES) return prev;
      const action = prev.find((a) => a.id === id)!;
      const rest = prev.filter((a) => a.id !== id);
      const tiles = rest.filter((a) => a.place === "tile");
      const buttons = rest.filter((a) => a.place === "button");
      return place === "tile" ? [...tiles, { ...action, place }, ...buttons] : [...tiles, ...buttons, { ...action, place }];
    });

  const column = (place: QuickActionPlace) => {
    const items = actions.filter((a) => a.place === place);
    return (
      <div className="space-y-1.5" data-testid={`quick-actions-column-${place}`}>
        <p className="text-sm font-semibold">
          {place === "tile"
            ? t("settingsPage.quickActions.tilesColumn", { count: tileCount, max: MAX_QUICK_ACTION_TILES })
            : t("settingsPage.quickActions.buttonsColumn")}
        </p>
        {items.length === 0 && (
          <p className="rounded-md border border-dashed p-2 text-xs text-muted-foreground">{t("settingsPage.quickActions.empty")}</p>
        )}
        <ol className="space-y-1">
          {items.map((action, index) => (
            <li key={action.id} className="flex items-center gap-1 rounded-md border px-2 py-1" data-testid={`quick-action-setting-${action.id}`}>
              <label className="flex min-w-0 flex-1 items-center gap-2 cursor-pointer text-sm">
                <Checkbox
                  checked={action.visible}
                  onCheckedChange={(v) => toggle(action.id, v === true)}
                  data-testid={`checkbox-quick-action-${action.id}`}
                />
                <span className={`truncate ${action.visible ? "" : "text-muted-foreground line-through"}`}>
                  {t(`dashboard:quickActions.buttons.${action.id}`)}
                </span>
              </label>
              <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0" disabled={index === 0}
                onClick={() => move(action.id, -1)} aria-label={t("settingsPage.dashboardTiles.moveUp")} data-testid={`button-quick-action-up-${action.id}`}>
                <ArrowUp className="h-4 w-4" />
              </Button>
              <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0" disabled={index === items.length - 1}
                onClick={() => move(action.id, 1)} aria-label={t("settingsPage.dashboardTiles.moveDown")} data-testid={`button-quick-action-down-${action.id}`}>
                <ArrowDown className="h-4 w-4" />
              </Button>
              {place === "tile" ? (
                <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0"
                  onClick={() => switchPlace(action.id, "button")} aria-label={t("settingsPage.quickActions.toButtons")} title={t("settingsPage.quickActions.toButtons")}
                  data-testid={`button-quick-action-to-buttons-${action.id}`}>
                  <ArrowRight className="h-4 w-4" />
                </Button>
              ) : (
                <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0" disabled={tilesFull}
                  onClick={() => switchPlace(action.id, "tile")}
                  aria-label={t("settingsPage.quickActions.toTiles")}
                  title={tilesFull ? t("settingsPage.quickActions.tilesFull", { max: MAX_QUICK_ACTION_TILES }) : t("settingsPage.quickActions.toTiles")}
                  data-testid={`button-quick-action-to-tiles-${action.id}`}>
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              )}
            </li>
          ))}
        </ol>
      </div>
    );
  };

  return (
    <SettingCard
      icon={<Zap className="h-5 w-5" />}
      title={t("settingsPage.quickActions.title")}
      subtitle={t("settingsPage.quickActions.description", { max: MAX_QUICK_ACTION_TILES })}
    >
      <div className="grid gap-4 md:grid-cols-2">
        {column("tile")}
        {column("button")}
      </div>
      <SaveRow dirty={dirty} reset={reset} save={save} testId="button-save-quick-actions" />
    </SettingCard>
  );
}
