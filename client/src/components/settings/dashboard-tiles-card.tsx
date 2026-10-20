/**
 * Kees, 2026-10-19 — Instellingen > Dashboard: which tiles everyone sees, and in
 * what order. Tick to show, arrows to move. Stored as the `dashboard_tiles` app
 * setting (shared/dashboard-tiles.ts); the dashboard follows after saving.
 *
 * Kees, 2026-10-20 — the same list for the "Snelle acties" (shared/quick-actions-layout.ts):
 * the first six ticked ones are the large tiles, a line marks where the buttons begin.
 */
import { Fragment, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, LayoutDashboard, Zap } from "lucide-react";
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
} from "@shared/dashboard-tiles";
import {
  MAX_QUICK_ACTION_TILES,
  QUICK_ACTIONS_KEY,
  quickActionsFromSetting,
  quickActionsToSetting,
} from "@shared/quick-actions-layout";

interface Choice {
  id: string;
  visible: boolean;
}

interface OrderedChoicesProps {
  settingKey: string;
  fromSetting: (value: unknown) => Choice[];
  toSetting: (choices: Choice[]) => unknown;
  description: string;
  icon: ReactNode;
  title: string;
  subtitle: string;
  savedText: string;
  label: (id: string) => string;
  /** Only for the quick actions: after this many ticked ones, a "buttons" line. */
  tileCount?: number;
  testIds: { list: string; row: string; checkbox: string; up: string; down: string; save: string };
}

/** One ordered list of tick boxes with arrows, saved as one app setting. */
function OrderedChoicesCard({ settingKey, fromSetting, toSetting, description, icon, title, subtitle, savedText, label, tileCount, testIds }: OrderedChoicesProps) {
  const { t } = useTranslation(["settings", "common"]);
  const { toast } = useToast();
  const { data, isSuccess } = useQuery<{ value?: unknown } | null>({
    queryKey: [`/api/app-settings/key/${settingKey}`],
  });
  const [draft, setDraft] = useState<Choice[] | null>(null);
  const stored = fromSetting(isSuccess ? data?.value : null);
  const choices = draft ?? stored;

  // Functional updates, so two quick clicks before a re-render both count.
  const move = (index: number, by: -1 | 1) =>
    setDraft((prev) => {
      const next = [...(prev ?? stored)];
      const target = index + by;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  const toggle = (index: number, visible: boolean) =>
    setDraft((prev) => (prev ?? stored).map((choice, i) => (i === index ? { ...choice, visible } : choice)));

  const save = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/app-settings", {
        key: settingKey,
        value: toSetting(choices),
        category: "general",
        description,
      });
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

  // Where the buttons begin: the row after the tileCount-th ticked one.
  let ticked = 0;
  const buttonsStartAt = tileCount === undefined ? -1 : choices.findIndex((choice) => choice.visible && ++ticked > tileCount);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {icon}
          {title}
        </CardTitle>
        <CardDescription>{subtitle}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <ol className="space-y-2" data-testid={testIds.list}>
          {choices.map((choice, index) => (
            <Fragment key={choice.id}>
              {index === buttonsStartAt && (
                <li className="pt-1 text-xs font-medium text-muted-foreground border-t" data-testid={`${testIds.list}-buttons-start`}>
                  {t("settingsPage.quickActions.buttonsBelow")}
                </li>
              )}
              <li className="flex items-center gap-3 rounded-md border p-2" data-testid={`${testIds.row}-${choice.id}`}>
                <span className="w-6 text-right text-sm text-muted-foreground">{index + 1}.</span>
                <label className="flex flex-1 items-center gap-2 cursor-pointer">
                  <Checkbox
                    checked={choice.visible}
                    onCheckedChange={(v) => toggle(index, v === true)}
                    data-testid={`${testIds.checkbox}-${choice.id}`}
                  />
                  <span className={choice.visible ? "" : "text-muted-foreground line-through"}>
                    {label(choice.id)}
                  </span>
                </label>
                <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0" disabled={index === 0}
                  onClick={() => move(index, -1)} aria-label={t("settingsPage.dashboardTiles.moveUp")} data-testid={`${testIds.up}-${choice.id}`}>
                  <ArrowUp className="h-4 w-4" />
                </Button>
                <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0" disabled={index === choices.length - 1}
                  onClick={() => move(index, 1)} aria-label={t("settingsPage.dashboardTiles.moveDown")} data-testid={`${testIds.down}-${choice.id}`}>
                  <ArrowDown className="h-4 w-4" />
                </Button>
              </li>
            </Fragment>
          ))}
        </ol>
        <div className="flex justify-end gap-2">
          {draft && (
            <Button type="button" variant="outline" onClick={() => setDraft(null)}>{t("common:actions.cancel")}</Button>
          )}
          <Button type="button" onClick={() => save.mutate()} disabled={!draft || save.isPending} data-testid={testIds.save}>
            {t("common:actions.save")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function DashboardTilesCard() {
  const { t } = useTranslation(["settings"]);
  return (
    <OrderedChoicesCard
      settingKey={DASHBOARD_TILES_KEY}
      fromSetting={dashboardTilesFromSetting}
      toSetting={(choices) => dashboardTilesToSetting(choices as ReturnType<typeof dashboardTilesFromSetting>)}
      description="Welke tegels het dashboard toont en in welke volgorde (voor iedereen)"
      icon={<LayoutDashboard className="h-5 w-5" />}
      title={t("settingsPage.dashboardTiles.title")}
      subtitle={t("settingsPage.dashboardTiles.description")}
      savedText={t("settingsPage.dashboardTiles.saved")}
      label={(id) => t(`settingsPage.dashboardTiles.tiles.${id}`)}
      testIds={{
        list: "dashboard-tiles-list",
        row: "dashboard-tile-setting",
        checkbox: "checkbox-dashboard-tile",
        up: "button-tile-up",
        down: "button-tile-down",
        save: "button-save-dashboard-tiles",
      }}
    />
  );
}

export function QuickActionsSettingsCard() {
  const { t } = useTranslation(["settings", "dashboard"]);
  return (
    <OrderedChoicesCard
      settingKey={QUICK_ACTIONS_KEY}
      fromSetting={quickActionsFromSetting}
      toSetting={(choices) => quickActionsToSetting(choices as ReturnType<typeof quickActionsFromSetting>)}
      description="Welke snelle acties het dashboard toont en in welke volgorde (voor iedereen)"
      icon={<Zap className="h-5 w-5" />}
      title={t("settingsPage.quickActions.title")}
      subtitle={t("settingsPage.quickActions.description", { count: MAX_QUICK_ACTION_TILES })}
      savedText={t("settingsPage.quickActions.saved")}
      label={(id) => t(`dashboard:quickActions.buttons.${id}`)}
      tileCount={MAX_QUICK_ACTION_TILES}
      testIds={{
        list: "quick-actions-settings-list",
        row: "quick-action-setting",
        checkbox: "checkbox-quick-action",
        up: "button-quick-action-up",
        down: "button-quick-action-down",
        save: "button-save-quick-actions",
      }}
    />
  );
}
