import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Mail, UserPlus } from "lucide-react";
import type { PortalColleagueDto, PortalDriverDto } from "@shared/portal-types";
import { PortalApiError, portalFetch, portalQueryFn } from "@/lib/portal-api";
import { usePortalAuth } from "@/hooks/use-portal-auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, btnPrimary } from "./ui";

const URL = "/api/portal/colleagues";

/**
 * Mijn account > Collega's (Kees, 2026-10-18): an admin invites other admins and drivers and blocks or
 * unblocks them. The server makes sure nobody gets more rights than the inviter and tells the office.
 */
export function ColleaguesPanel() {
  const { t } = useTranslation("portal");
  const { toast } = useToast();
  const { me } = usePortalAuth();
  const queryClient = useQueryClient();
  const { data: colleagues = [] } = useQuery<PortalColleagueDto[]>({ queryKey: ["portal", URL], queryFn: portalQueryFn });
  // A driver account belongs to a driver, so inviting one needs the drivers list.
  const canInviteDriver = Boolean(me?.settings.canManageDrivers);
  const { data: drivers = [] } = useQuery<PortalDriverDto[]>({ queryKey: ["portal", "/api/portal/drivers"], queryFn: portalQueryFn, enabled: canInviteDriver });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ fullName: "", email: "", role: "driver" as "admin" | "driver", driverId: "" });
  const fail = (e: unknown) => toast({ title: t(`errors.${e instanceof PortalApiError ? e.code : "PORTAL_SERVER_ERROR"}`, { defaultValue: (e as Error).message }), variant: "destructive" });
  const refresh = (list: PortalColleagueDto[]) => queryClient.setQueryData(["portal", URL], list);

  const invite = useMutation({
    mutationFn: (body: { fullName: string; email: string; role: "admin" | "driver"; driverId?: number }) =>
      portalFetch<{ colleagues: PortalColleagueDto[]; inviteSent: boolean }>("POST", URL, body),
    onSuccess: (r, body) => {
      refresh(r.colleagues);
      toast({ title: r.inviteSent ? t("account.colleagues.invited", { email: body.email }) : t("account.colleagues.inviteNotSent") });
      setOpen(false); setForm({ fullName: "", email: "", role: "driver", driverId: "" });
    },
    onError: fail,
  });
  const toggle = useMutation({
    mutationFn: (c: PortalColleagueDto) => portalFetch<PortalColleagueDto[]>("PATCH", `${URL}/${c.id}`, { active: !c.active }),
    onSuccess: refresh, onError: fail,
  });
  const resend = useMutation({
    mutationFn: (c: PortalColleagueDto) => portalFetch<{ inviteSent: boolean }>("POST", `${URL}/${c.id}/invite`),
    onSuccess: (r) => toast({ title: r.inviteSent ? t("account.colleagues.resent") : t("account.colleagues.inviteNotSent") }), onError: fail,
  });

  // Drivers who do not have an active account yet.
  const taken = new Set(colleagues.filter((c) => c.active && c.driver).map((c) => c.driver!.id));
  const freeDrivers = drivers.filter((d) => d.status === "active" && !taken.has(d.id));
  const roleOptions = canInviteDriver ? (["driver", "admin"] as const) : (["admin"] as const);
  const role = canInviteDriver ? form.role : "admin";

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (role === "driver" && !form.driverId) { toast({ title: t("account.colleagues.pickDriver"), variant: "destructive" }); return; }
    invite.mutate({ fullName: form.fullName.trim(), email: form.email.trim(), role, ...(role === "driver" ? { driverId: Number(form.driverId) } : {}) });
  }

  return (
    <div className="space-y-3" data-testid="colleagues-panel">
      {!open && <Button size="sm" className={btnPrimary} onClick={() => setOpen(true)} data-testid="button-invite-colleague"><UserPlus className="mr-1.5 h-4 w-4" />{t("account.colleagues.invite")}</Button>}
      {open && (
        <form onSubmit={onSubmit} className="grid gap-3 rounded-md border p-3 sm:grid-cols-2" data-testid="invite-form">
          <div><Label htmlFor="col-name">{t("fields.fullName")}</Label><Input id="col-name" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} required data-testid="input-colleague-name" /></div>
          <div><Label htmlFor="col-email">{t("fields.email")}</Label><Input id="col-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required data-testid="input-colleague-email" /></div>
          <div>
            <Label htmlFor="col-role">{t("account.colleagues.role")}</Label>
            <select id="col-role" className="w-full rounded-md border px-3 py-2 text-sm" value={role} onChange={(e) => setForm({ ...form, role: e.target.value as "admin" | "driver" })} data-testid="select-colleague-role">
              {roleOptions.map((r) => <option key={r} value={r}>{t(`admin.accounts.role.${r}`)}</option>)}
            </select>
          </div>
          {role === "driver" && (
            <div>
              <Label htmlFor="col-driver">{t("fields.driver")}</Label>
              <select id="col-driver" className="w-full rounded-md border px-3 py-2 text-sm" value={form.driverId} onChange={(e) => setForm({ ...form, driverId: e.target.value })} data-testid="select-colleague-driver">
                <option value="">—</option>
                {freeDrivers.map((d) => <option key={d.id} value={d.id}>{d.displayName}</option>)}
              </select>
            </div>
          )}
          <p className="text-xs text-[#64748b] sm:col-span-2">{t("account.colleagues.ceiling")}</p>
          <div className="flex justify-end gap-2 sm:col-span-2">
            <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>{t("uploads.cancel")}</Button>
            <Button type="submit" size="sm" className={btnPrimary} disabled={invite.isPending} data-testid="button-send-invite">{t("account.colleagues.send")}</Button>
          </div>
        </form>
      )}
      <ul className="divide-y rounded-md border">
        {colleagues.map((c) => (
          <li key={c.id} className={`flex flex-wrap items-center gap-2 px-3 py-2 ${c.active ? "" : "opacity-60"}`} data-testid={`colleague-${c.id}`}>
            <Avatar name={c.fullName} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{c.fullName}{c.isSelf && <span className="ml-1 text-xs text-[#64748b]">({t("account.colleagues.you")})</span>}</div>
              <div className="truncate text-xs text-[#64748b]">
                {c.email} · {t(`admin.accounts.role.${c.role}`)}{c.driver ? ` · ${c.driver.displayName}` : ""}
                {" · "}{!c.active ? t("account.colleagues.blocked") : c.activated ? t("account.colleagues.activeStatus") : t("account.colleagues.pending")}
              </div>
            </div>
            {!c.isSelf && (
              <div className="flex gap-1">
                {c.active && !c.activated && <Button size="sm" variant="outline" onClick={() => resend.mutate(c)} disabled={resend.isPending} data-testid={`button-resend-${c.id}`}><Mail className="mr-1 h-4 w-4" />{t("account.colleagues.resend")}</Button>}
                <Button size="sm" variant="outline" onClick={() => toggle.mutate(c)} disabled={toggle.isPending} data-testid={`button-toggle-colleague-${c.id}`}>{c.active ? t("account.colleagues.block") : t("account.colleagues.unblock")}</Button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
