import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { dateLabelNl } from "@shared/fiscal-format";
import { REASON_CATEGORIES, REASON_CATEGORY_LABELS, RULE_VERSION_STATUS_LABELS, type ReasonCategory } from "@shared/fiscal-types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useFiscalPermissions } from "./use-fiscal-permissions";
import { VersionDialog } from "./version-dialog";
import type { ConfigurationResponse, DefinitionsResponse, VersionDetail } from "./types";

function VersionRow({ version, onOpen }: { version: VersionDetail; onOpen: (id: number) => void }) {
  const { t } = useTranslation("fiscal");
  const who = version.publishedByName ?? version.approvedByName ?? version.submittedByName ?? version.createdByName;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3" data-testid={`version-row-${version.id}`}>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{version.title}</span>
          <span className="text-xs text-muted-foreground">{t("config.version", { n: version.versionNumber })}</span>
          <span className="rounded bg-muted px-2 py-0.5 text-xs">{RULE_VERSION_STATUS_LABELS[version.status]}</span>
          <span className={`rounded px-2 py-0.5 text-xs ${version.validation.ok ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"}`}>
            {version.validation.ok ? t("config.complete") : t("config.incomplete", { count: version.validation.issues.length })}
          </span>
        </div>
        <div className="text-xs text-muted-foreground">
          {version.effectiveFrom ? t("config.from", { date: dateLabelNl(version.effectiveFrom) }) : "—"}
          {" · "}
          {version.effectiveUntil ? t("config.until", { date: dateLabelNl(version.effectiveUntil) }) : t("config.openEnd")}
          {" · "}
          {t("config.by", { name: who })}
          {" · "}
          {new Date(version.updatedAt).toLocaleDateString("nl-NL")}
        </div>
      </div>
      <Button size="sm" variant="outline" onClick={() => onOpen(version.id)} data-testid={`button-open-version-${version.id}`}>{t("config.view")}</Button>
    </div>
  );
}

function Section({ title, versions, onOpen }: { title: string; versions: VersionDetail[]; onOpen: (id: number) => void }) {
  const { t } = useTranslation("fiscal");
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>
      {versions.length === 0 ? <p className="text-sm text-muted-foreground">{t("config.none")}</p> : versions.map((v) => <VersionRow key={v.id} version={v} onOpen={onOpen} />)}
    </div>
  );
}

function NewDraftDialog({ open, onOpenChange, ruleKey, versions, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; ruleKey: string; versions: VersionDetail[]; onCreated: (id: number) => void }) {
  const { t } = useTranslation("fiscal");
  const [title, setTitle] = useState("");
  const [reasonCategory, setReasonCategory] = useState<string>("legislative_change");
  const [reasonText, setReasonText] = useState("");
  const [copyFromId, setCopyFromId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const create = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/fiscal/rule-versions", { ruleKey, title, reasonCategory, reasonText, copyFromId: copyFromId ? Number(copyFromId) : null })).json() as Promise<VersionDetail>,
    onSuccess: (row) => {
      setError(null);
      setTitle("");
      setReasonText("");
      onOpenChange(false);
      onCreated(row.id);
    },
    onError: (e: Error) => setError(e.message.replace(/^\d{3}:\s*/, "")),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("newDraft.title")}</DialogTitle>
          <DialogDescription>{t("newDraft.description")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="nd-title">{t("newDraft.titleLabel")}</Label>
            <Input id="nd-title" value={title} onChange={(e) => setTitle(e.target.value)} data-testid="input-draft-title" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="nd-category">{t("newDraft.reasonCategory")}</Label>
            <select id="nd-category" className="w-full rounded-md border px-3 py-2 text-sm" value={reasonCategory} onChange={(e) => setReasonCategory(e.target.value)}>
              {REASON_CATEGORIES.map((c) => (
                <option key={c} value={c}>{REASON_CATEGORY_LABELS[c as ReasonCategory]}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="nd-reason">{t("newDraft.reasonText")}</Label>
            <Textarea id="nd-reason" rows={3} value={reasonText} onChange={(e) => setReasonText(e.target.value)} data-testid="input-draft-reason" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="nd-copy">{t("newDraft.copyFrom")}</Label>
            <select id="nd-copy" className="w-full rounded-md border px-3 py-2 text-sm" value={copyFromId} onChange={(e) => setCopyFromId(e.target.value)}>
              <option value="">{t("newDraft.noCopy")}</option>
              {versions.map((v) => (
                <option key={v.id} value={v.id}>{v.title} ({t("config.version", { n: v.versionNumber })})</option>
              ))}
            </select>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button disabled={!title.trim() || !reasonText.trim() || create.isPending} onClick={() => create.mutate()} data-testid="button-draft-create">{t("newDraft.create")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** The global configuration per rule: what is in force, what is coming, what is being prepared. */
export function ConfigurationPanel() {
  const { t } = useTranslation("fiscal");
  const { canConfigure } = useFiscalPermissions();
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery<ConfigurationResponse>({ queryKey: ["/api/fiscal/configuration"] });
  const { data: definitions } = useQuery<DefinitionsResponse>({ queryKey: ["/api/fiscal/definitions"] });
  const [openVersionId, setOpenVersionId] = useState<number | null>(null);
  const [newDraftOpen, setNewDraftOpen] = useState(false);

  if (isLoading) return <p className="text-sm text-muted-foreground">{t("common.loading")}</p>;
  if (error || !data) return <p className="text-sm text-destructive">{t("common.error", { message: (error as Error)?.message ?? "" })}</p>;

  return (
    <div className="space-y-4">
      {data.rules.map(({ rule, current, upcoming, drafts, expired, archived }) => {
        const all = [current, ...upcoming, ...drafts, ...expired, ...archived].filter((v): v is VersionDetail => v !== null);
        const ruleDefinitions = (definitions?.parameters ?? []).filter((d) => d.ruleKey === rule.key);
        return (
          <Card key={rule.key}>
            <CardHeader className="pb-2">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <CardTitle className="text-base">{rule.displayName}</CardTitle>
                  <CardDescription>{rule.description}</CardDescription>
                  <p className="mt-1 text-xs font-medium">{t("config.scope")} <span className="font-normal text-muted-foreground">— {t("config.scopeHint")}</span></p>
                </div>
                {canConfigure && (
                  <Button size="sm" onClick={() => setNewDraftOpen(true)} data-testid="button-new-draft">{t("config.newDraft")}</Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <Section title={t("config.current")} versions={current ? [current] : []} onOpen={setOpenVersionId} />
              <Section title={t("config.upcoming")} versions={upcoming} onOpen={setOpenVersionId} />
              <Section title={t("config.drafts")} versions={drafts} onOpen={setOpenVersionId} />
              {expired.length > 0 && <Section title={t("config.expired")} versions={expired} onOpen={setOpenVersionId} />}
              {archived.length > 0 && <Section title={t("config.archived")} versions={archived} onOpen={setOpenVersionId} />}
            </CardContent>
            <NewDraftDialog
              open={newDraftOpen}
              onOpenChange={setNewDraftOpen}
              ruleKey={rule.key}
              versions={all}
              onCreated={(id) => {
                queryClient.invalidateQueries({ queryKey: ["/api/fiscal/configuration"] });
                setOpenVersionId(id);
              }}
            />
            <VersionDialog versionId={openVersionId} onOpenChange={(o) => { if (!o) setOpenVersionId(null); }} definitions={ruleDefinitions} current={current ?? upcoming[0] ?? null} />
          </Card>
        );
      })}
    </div>
  );
}
