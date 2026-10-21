/**
 * Kees, 2026-10-21 — the gear in the dashboard's corner: everyone sets their own
 * dashboard here (which tiles and quick actions, in what order), also colleagues who
 * may not open App-instellingen. "Terug naar standaard" is only in App-instellingen.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DashboardTilesCard, QuickActionsSettingsCard } from "@/components/settings/dashboard-tiles-card";

export function DashboardLayoutButton() {
  const { t } = useTranslation("settings");
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setOpen(true)}
        aria-label={t("settingsPage.dashboardLayout.gear")}
        title={t("settingsPage.dashboardLayout.gear")}
        data-testid="button-dashboard-layout"
      >
        <Settings className="h-5 w-5" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto" data-testid="dialog-dashboard-layout">
          <DialogHeader>
            <DialogTitle>{t("settingsPage.dashboardLayout.title")}</DialogTitle>
            <DialogDescription>{t("settingsPage.dashboardLayout.description")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-6">
            <DashboardTilesCard />
            <QuickActionsSettingsCard />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
