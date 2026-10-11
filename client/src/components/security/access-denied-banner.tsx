import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ShieldAlert } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/use-auth";
import { UserRole } from "@shared/schema";
import { permissionLabel } from "@shared/permission-labels";
import { formatDateTime } from "@/lib/format-utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";

interface AccessDeniedEntry {
  id: number;
  username: string | null;
  createdAt: string;
  method: string | null;
  path: string | null;
  required: string[];
  page: string | null;
}

interface AccessDeniedSummary {
  since: string;
  /** Refused attempts since the previous login. */
  count: number;
  /** Distinct colleagues behind them. */
  users: number;
  /** The newest attempts, at most 200. */
  entries: AccessDeniedEntry[];
}

/**
 * D14 (B-41): "who tried something they may not do". An administrator is told
 * on the dashboard, once per login, how many colleagues were refused since the
 * previous login, and can open the list. The refusals come from
 * hasPermissionMiddleware and from the no-access page (audit action
 * `access.denied`). Nothing is shown when nothing happened, for anybody who is
 * not an administrator, and at a first login (nothing to compare with).
 *
 * The request never throws: a decorative banner must not raise the red "could
 * not load the data" toast when the log cannot be read.
 */
export function AccessDeniedBanner() {
  const { t } = useTranslation("settings");
  const { user } = useAuth();
  const [open, setOpen] = useState(false);

  const isAdmin = user?.role === UserRole.ADMIN;
  const since = (user as { previousLoginAt?: string | null } | null)?.previousLoginAt ?? null;

  const { data } = useQuery<AccessDeniedSummary | null>({
    queryKey: ["/api/access-denied", { since }],
    queryFn: async () => {
      try {
        const res = await fetch(`/api/access-denied?since=${encodeURIComponent(String(since))}`, { credentials: "include" });
        return res.ok ? ((await res.json()) as AccessDeniedSummary) : null;
      } catch {
        return null;
      }
    },
    enabled: isAdmin && !!since,
  });

  if (!isAdmin || !since || !data || data.users === 0) return null;

  const date = formatDateTime(since);

  const describe = (entry: AccessDeniedEntry): string => {
    const path = entry.path ?? "";
    if (entry.page) return t("accessDenied.page", { path });
    if ((entry.method ?? "GET").toUpperCase() === "GET") return t("accessDenied.read", { path });
    return t("accessDenied.write", { path });
  };

  return (
    <>
      <div
        className="flex items-start justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-950"
        data-testid="banner-access-denied"
      >
        <div className="flex items-start gap-3">
          <ShieldAlert className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600" />
          <p className="text-sm font-semibold">{t("accessDenied.banner", { count: data.users, date })}</p>
        </div>
        <Button size="sm" variant="outline" onClick={() => setOpen(true)} data-testid="button-access-denied-view">
          {t("accessDenied.view")}
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh]">
          <DialogHeader>
            <DialogTitle>{t("accessDenied.dialogTitle")}</DialogTitle>
            <DialogDescription>{t("accessDenied.dialogDescription", { date })}</DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">{t("accessDenied.colWho")}</th>
                  <th className="py-2 pr-3 font-medium">{t("accessDenied.colWhat")}</th>
                  <th className="py-2 pr-3 font-medium">{t("accessDenied.colNeeded")}</th>
                  <th className="py-2 font-medium">{t("accessDenied.colWhen")}</th>
                </tr>
              </thead>
              <tbody>
                {data.entries.map((entry) => (
                  <tr key={entry.id} className="border-b align-top" data-testid="access-denied-row">
                    <td className="py-2 pr-3 font-medium">{entry.username ?? "-"}</td>
                    <td className="py-2 pr-3 break-all">{describe(entry)}</td>
                    <td className="py-2 pr-3">
                      {entry.required.length > 0 ? entry.required.map((right) => permissionLabel(right)).join(" / ") : "-"}
                    </td>
                    <td className="py-2 whitespace-nowrap">{formatDateTime(entry.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data.count > data.entries.length && (
              <p className="mt-3 text-xs text-muted-foreground">
                {t("accessDenied.truncated", { shown: data.entries.length, total: data.count })}
              </p>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </>
  );
}
