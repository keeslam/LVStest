import { formatDateTime } from "@/lib/format-utils";
import { describeApiError } from "@/lib/api-error";
import { useState } from "react";
import { type Preview, PreviewFooter, TableSearch, textMatches } from "./preview";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { apiRequest, invalidateByPrefix } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { UserPermission, UserRole } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { MoreHorizontal } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { AccountDialog, type PortalAccountRow } from "./account-dialog";

export function useCanManagePortal(): boolean {
  const { user } = useAuth();
  return user?.role === UserRole.ADMIN || ((user?.permissions as string[] | undefined) ?? []).includes(UserPermission.MANAGE_PORTAL);
}

export function AccountsTable({ customerId, preview }: { customerId?: number; preview?: Preview }) {
  const { t } = useTranslation("portal");
  const { toast } = useToast();
  const canManage = useCanManagePortal();
  const [onlyPending, setOnlyPending] = useState(false);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<PortalAccountRow | null>(null);
  // Blocking and deleting ask first: both lock someone out or remove the row for good.
  const [confirming, setConfirming] = useState<{ kind: "block" | "delete"; account: PortalAccountRow } | null>(null);
  const url = customerId ? `/api/portal-admin/customers/${customerId}/accounts` : "/api/portal-admin/accounts";
  const key = customerId ? ["/api/portal-admin/customers", customerId, "accounts"] : ["/api/portal-admin/accounts"];
  const { data = [] } = useQuery<PortalAccountRow[]>({ queryKey: key, queryFn: async () => (await apiRequest("GET", url)).json() });

  const act = useMutation({
    mutationFn: async ({ id, action, body }: { id: number; action: "patch" | "invite" | "delete"; body?: unknown }): Promise<{ sent?: boolean }> => {
      if (action === "patch") return (await apiRequest("PATCH", `/api/portal-admin/accounts/${id}`, body)).json();
      // The server answers 200 { sent } whether or not the mail left; `sent` is the real outcome (audit A-15-1).
      if (action === "invite") return (await apiRequest("POST", `/api/portal-admin/accounts/${id}/invite`, body)).json();
      return (await apiRequest("DELETE", `/api/portal-admin/accounts/${id}`)).json();
    },
    onSuccess: (r, v) => {
      invalidateByPrefix("/api/portal-admin");
      if (v.action === "invite") toast(r.sent ? { title: t("admin.accounts.sent") } : { title: t("admin.accounts.resendFailed"), variant: "destructive" });
      else if (v.action === "delete") toast({ title: t("admin.accounts.deletedToast") });
      else if (v.action === "patch" && typeof (v.body as { active?: unknown })?.active === "boolean") {
        toast({ title: t((v.body as { active: boolean }).active ? "admin.accounts.unblockedToast" : "admin.accounts.blockedToast") });
      }
    },
    onError: (e: Error) => toast({ title: describeApiError(e), variant: "destructive" }),
  });

  const status = (a: PortalAccountRow) => !a.active ? "blocked" : a.activated ? "active" : a.invitePending ? "pending" : "notActivated";
  const restricted = (a: PortalAccountRow) => Object.values(a.permissions ?? {}).some((v) => v === false);
  const filtered = (onlyPending ? data.filter((a) => !a.activated) : data).filter((a) => textMatches(search, a.fullName, a.email, a.customerName, a.role));
  const rows = preview ? filtered.slice(0, preview.limit) : filtered;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {preview ? <span /> : <h3 className="font-medium">{t("admin.accounts.title")}</h3>}
        <div className="flex flex-wrap gap-2">
          {!preview && <TableSearch value={search} onChange={setSearch} testId="accounts-search" />}
          {!preview && <Button size="sm" variant={onlyPending ? "default" : "outline"} onClick={() => setOnlyPending(!onlyPending)}>{t("admin.accounts.onlyPending")}</Button>}
          {canManage && <AccountDialog customerId={customerId}><Button size="sm" data-testid="button-invite-portal-account">{t("admin.accounts.invite")}</Button></AccountDialog>}
        </div>
      </div>
      {rows.length === 0 ? <p className="text-sm text-muted-foreground">{t("admin.accounts.empty")}</p> : (
        <Table>
          <TableHeader><TableRow>
            <TableHead>{t("admin.accounts.columns.name")}</TableHead>
            <TableHead>{t("admin.accounts.columns.email")}</TableHead>
            {!customerId && <TableHead>{t("admin.accounts.columns.customer")}</TableHead>}
            <TableHead>{t("admin.accounts.columns.role")}</TableHead>
            <TableHead>{t("admin.accounts.columns.status")}</TableHead>
            <TableHead>{t("admin.accounts.columns.lastLogin")}</TableHead>
            <TableHead />
          </TableRow></TableHeader>
          <TableBody>
            {rows.map((a) => (
              <TableRow key={a.id}>
                <TableCell>{a.fullName}</TableCell>
                <TableCell>{a.email}</TableCell>
                {!customerId && <TableCell>{a.customerName}</TableCell>}
                <TableCell>{t(`admin.accounts.role.${a.role}`)}{restricted(a) && <Badge variant="outline" className="ml-2">{t("admin.accounts.restricted")}</Badge>}</TableCell>
                <TableCell><Badge variant={status(a) === "active" ? "default" : status(a) === "blocked" ? "destructive" : "secondary"}>{t(`admin.accounts.status.${status(a)}`)}</Badge></TableCell>
                <TableCell>{a.lastLoginAt ? formatDateTime(a.lastLoginAt) : "—"}</TableCell>
                <TableCell className="text-right">
                  {canManage && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild><Button size="icon" variant="ghost" aria-label={t("admin.accounts.actionsFor", { name: a.fullName })} data-testid={`button-account-actions-${a.id}`}><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => setEditing(a)} data-testid={`menu-edit-account-${a.id}`}>{t("admin.accounts.edit")}</DropdownMenuItem>
                        {/* A blocked account gets no mail: it could not use the link anyway. */}
                        {a.active && !a.activated && <DropdownMenuItem onSelect={() => act.mutate({ id: a.id, action: "invite", body: { kind: "invite" } })} data-testid={`menu-resend-account-${a.id}`}>{t("admin.accounts.resend")}</DropdownMenuItem>}
                        {a.active && a.activated && <DropdownMenuItem onSelect={() => act.mutate({ id: a.id, action: "invite", body: { kind: "reset" } })}>{t("admin.accounts.sendReset")}</DropdownMenuItem>}
                        <DropdownMenuItem onSelect={() => (a.active ? setConfirming({ kind: "block", account: a }) : act.mutate({ id: a.id, action: "patch", body: { active: true } }))} data-testid={`menu-block-account-${a.id}`}>{a.active ? t("admin.accounts.block") : t("admin.accounts.unblock")}</DropdownMenuItem>
                        {!a.activated && <DropdownMenuItem className="text-destructive" onSelect={() => setConfirming({ kind: "delete", account: a })} data-testid={`menu-delete-account-${a.id}`}>{t("admin.accounts.delete")}</DropdownMenuItem>}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {preview && filtered.length > 0 && <PreviewFooter shown={rows.length} total={filtered.length} onShowAll={preview.onShowAll} />}
      {confirming && (
        <ConfirmDialog
          open
          onOpenChange={(o) => { if (!o) setConfirming(null); }}
          variant={confirming.kind === "delete" ? "danger" : "warning"}
          title={t(confirming.kind === "delete" ? "admin.accounts.deleteTitle" : "admin.accounts.blockTitle")}
          description={confirming.kind === "delete" ? t("admin.accounts.deleteConfirm") : t("admin.accounts.blockConfirm", { name: confirming.account.fullName })}
          confirmLabel={t(confirming.kind === "delete" ? "admin.accounts.delete" : "admin.accounts.block")}
          cancelLabel={t("admin.dialog.cancel")}
          onConfirm={() => {
            const { kind, account } = confirming;
            act.mutate(kind === "delete" ? { id: account.id, action: "delete" } : { id: account.id, action: "patch", body: { active: false } });
          }}
        />
      )}
      {editing && <AccountDialog key={editing.id} customerId={editing.customerId} account={editing} open onOpenChange={(o) => { if (!o) setEditing(null); }} />}
    </div>
  );
}
