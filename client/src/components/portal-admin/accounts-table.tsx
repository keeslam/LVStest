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
  const url = customerId ? `/api/portal-admin/customers/${customerId}/accounts` : "/api/portal-admin/accounts";
  const key = customerId ? ["/api/portal-admin/customers", customerId, "accounts"] : ["/api/portal-admin/accounts"];
  const { data = [] } = useQuery<PortalAccountRow[]>({ queryKey: key, queryFn: async () => (await apiRequest("GET", url)).json() });

  const act = useMutation({
    mutationFn: async ({ id, action, body }: { id: number; action: "patch" | "invite" | "delete"; body?: unknown }) => {
      if (action === "patch") return apiRequest("PATCH", `/api/portal-admin/accounts/${id}`, body);
      if (action === "invite") return apiRequest("POST", `/api/portal-admin/accounts/${id}/invite`, body);
      return apiRequest("DELETE", `/api/portal-admin/accounts/${id}`);
    },
    onSuccess: (_r, v) => { invalidateByPrefix("/api/portal-admin"); if (v.action === "invite") toast({ title: t("admin.accounts.sent") }); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
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
                <TableCell>{a.lastLoginAt ? new Date(a.lastLoginAt).toLocaleString() : "—"}</TableCell>
                <TableCell className="text-right">
                  {canManage && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild><Button size="icon" variant="ghost"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => setEditing(a)} data-testid={`menu-edit-account-${a.id}`}>{t("admin.accounts.edit")}</DropdownMenuItem>
                        {!a.activated && <DropdownMenuItem onSelect={() => act.mutate({ id: a.id, action: "invite", body: { kind: "invite" } })}>{t("admin.accounts.resend")}</DropdownMenuItem>}
                        {a.activated && <DropdownMenuItem onSelect={() => act.mutate({ id: a.id, action: "invite", body: { kind: "reset" } })}>{t("admin.accounts.sendReset")}</DropdownMenuItem>}
                        <DropdownMenuItem onSelect={() => act.mutate({ id: a.id, action: "patch", body: { active: !a.active } })}>{a.active ? t("admin.accounts.block") : t("admin.accounts.unblock")}</DropdownMenuItem>
                        {!a.activated && <DropdownMenuItem className="text-destructive" onSelect={() => { if (window.confirm(t("admin.accounts.deleteConfirm"))) act.mutate({ id: a.id, action: "delete" }); }}>{t("admin.accounts.delete")}</DropdownMenuItem>}
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
      {editing && <AccountDialog key={editing.id} customerId={editing.customerId} account={editing} open onOpenChange={(o) => { if (!o) setEditing(null); }} />}
    </div>
  );
}
