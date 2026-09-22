import { useTranslation } from "react-i18next";
import { permissionLabel } from "@shared/permission-labels";
import { cn } from "@/lib/utils";

export interface NoDataAccessProps {
  /**
   * The permission that would unlock this data. When the server route
   * accepts a view/manage pair (e.g. VIEW_VEHICLES or MANAGE_VEHICLES), pass
   * the VIEW_* one — it is the minimal right that fixes the hole, and the
   * one an administrator would actually grant.
   */
  permission: string;
  className?: string;
}

/**
 * B-29 (docs/superpowers/specs/2026-09-21-toegang-design.md, §3) — one muted
 * line replacing a list/card/column whose OWN query needed a permission
 * outside the screen's own family and was gated off (`enabled:
 * useHasPermission(...)`), instead of leaving an empty or broken state. Not a
 * page-level gate (that is `NoAccessPage`) — this is for a PART of a screen
 * the user may otherwise open.
 *
 * Reuses `permissionLabel()`, the same label `users-dialog.tsx` and
 * `NoAccessPage` already show for this permission, so the wording can never
 * drift into a second list of right-names.
 */
export function NoDataAccess({ permission, className }: NoDataAccessProps) {
  const { t } = useTranslation("common");
  return (
    <p className={cn("text-sm text-muted-foreground", className)} data-testid="no-data-access">
      {t("noDataAccess.message", { permission: `'${permissionLabel(permission)}'` })}
    </p>
  );
}
