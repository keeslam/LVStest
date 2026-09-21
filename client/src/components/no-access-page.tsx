import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Lock } from "lucide-react";
import { permissionLabel } from "@shared/permission-labels";

interface NoAccessPageProps {
  /** The row's `anyOf` (shared/page-access.ts) — at least one of these is required to open the address. */
  anyOf: readonly string[];
  /** shared/page-access.ts's firstOpenablePage(user): the first screen this user may open, or null when there is none. */
  wayOut: string | null;
}

/**
 * B-28 (docs/superpowers/specs/2026-09-21-toegang-design.md, §2) — shown by
 * `ProtectedRoute` instead of the page component when the signed-in user
 * lacks every permission a known address requires. The page component is
 * never mounted for this branch, so none of its queries fire.
 *
 * Visual shape mirrors `pages/not-found.tsx` (client/src/pages/not-found.tsx)
 * on purpose: per the fact sheet (§1, "Reusable existing 'no access'
 * pattern"), that is the one existing full-page (not dialog) empty/error
 * pattern in the app, and both render nested inside the same `<MainLayout>`
 * (sidebar and header stay visible).
 */
export function NoAccessPage({ anyOf, wayOut }: NoAccessPageProps) {
  const { t } = useTranslation("common");

  // Reuses the same labels users-dialog.tsx shows for each permission
  // checkbox (shared/permission-labels.ts) rather than inventing a second
  // list, per the task brief. Several permissions are named all together,
  // joined with the localised "of"/"or".
  const orWord = t("noAccessPage.or");
  const permissionsPhrase = anyOf.map((permission) => `'${permissionLabel(permission)}'`).join(` ${orWord} `);

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gray-50" data-testid="no-access-page">
      <Card className="w-full max-w-md mx-4">
        <CardContent className="pt-6">
          <div className="flex mb-4 gap-2">
            <Lock className="h-8 w-8 text-red-500" />
            <h1 className="text-2xl font-bold text-gray-900">{t("noAccessPage.title")}</h1>
          </div>

          <p className="mt-4 text-sm text-gray-600">
            {t("noAccessPage.missingPermissionMessage", { permissions: permissionsPhrase })}
          </p>

          {wayOut && (
            <Button asChild className="mt-6" data-testid="button-no-access-way-out">
              <Link href={wayOut}>{t("noAccessPage.wayOutButton")}</Link>
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
