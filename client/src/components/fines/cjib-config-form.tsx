import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Landmark, Loader2 } from "lucide-react";
import type { CjibConfig } from "@shared/fines";
import { apiRequest, invalidateByPrefix } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";

export const CJIB_CONFIG_KEY = ["/api/fines/cjib-config"];

/** Settings card: FTPS connection to the CJIB, poll interval, connection test and "fetch now". */
export function CjibConfigForm() {
  const { t } = useTranslation("portal");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data } = useQuery<CjibConfig>({ queryKey: CJIB_CONFIG_KEY, queryFn: async () => (await apiRequest("GET", CJIB_CONFIG_KEY[0])).json() });
  const [form, setForm] = useState<CjibConfig | null>(null);
  const [testResult, setTestResult] = useState<{ ok: boolean; message?: string; files?: Array<{ name: string; size: number; matches: boolean }> } | null>(null);
  useEffect(() => { if (data) setForm(data); }, [data]);

  const save = useMutation({
    mutationFn: async () => (await apiRequest("PUT", CJIB_CONFIG_KEY[0], form)).json(),
    onSuccess: (saved: CjibConfig) => { queryClient.setQueryData(CJIB_CONFIG_KEY, saved); invalidateByPrefix("/api/fines/imports"); toast({ title: t("admin.config.saved") }); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });
  const test = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/fines/cjib-config/test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form), credentials: "include" });
      return res.json();
    },
    onSuccess: (r) => setTestResult(r),
    onError: (e: Error) => setTestResult({ ok: false, message: e.message }),
  });
  const run = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/fines/imports/run")).json(),
    onSuccess: (s: { files: number; created: number; linked: number; errors: string[] }) => {
      invalidateByPrefix("/api/fines");
      toast({ title: t("admin.fines.cjib.runDone", { files: s.files, created: s.created, linked: s.linked }), description: s.errors.join("\n") || undefined, variant: s.errors.length ? "destructive" : "default" });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  if (!form) return null;
  const set = <K extends keyof CjibConfig>(k: K, v: CjibConfig[K]) => setForm({ ...form, [k]: v });
  const field = (k: keyof CjibConfig, label: string, type = "text", extra: Record<string, unknown> = {}) => (
    <div>
      <Label htmlFor={`cjib-${k}`}>{label}</Label>
      <Input id={`cjib-${k}`} type={type} value={String(form[k] ?? "")} onChange={(e) => set(k, (type === "number" ? Number(e.target.value) : e.target.value) as never)} {...extra} data-testid={`input-cjib-${k}`} />
    </div>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Landmark className="h-5 w-5" />{t("admin.fines.cjib.title")}</CardTitle>
        <CardDescription>{t("admin.fines.cjib.description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3">
          <Switch checked={form.enabled} onCheckedChange={(v) => set("enabled", v)} id="cjib-enabled" data-testid="switch-cjib-enabled" />
          <Label htmlFor="cjib-enabled">{t("admin.fines.cjib.enabled")}</Label>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {field("host", t("admin.fines.cjib.host"), "text", { placeholder: "ftps.cjib.nl" })}
          <div className="grid grid-cols-2 gap-3">
            {field("port", t("admin.fines.cjib.port"), "number", { min: 1, max: 65535 })}
            <div>
              <Label htmlFor="cjib-secure">{t("admin.fines.cjib.secure")}</Label>
              <select id="cjib-secure" className="flex h-10 w-full rounded-md border px-3 py-2 text-sm" value={form.secure} onChange={(e) => set("secure", e.target.value as CjibConfig["secure"])}>
                <option value="implicit">{t("admin.fines.cjib.implicit")}</option>
                <option value="explicit">{t("admin.fines.cjib.explicit")}</option>
              </select>
            </div>
          </div>
          {field("username", t("admin.fines.cjib.username"), "text", { autoComplete: "off" })}
          {field("password", t("admin.fines.cjib.password"), "password", { autoComplete: "new-password" })}
          {field("inboxDir", t("admin.fines.cjib.inboxDir"), "text", { placeholder: "/out" })}
          {field("processedDir", t("admin.fines.cjib.processedDir"), "text", { placeholder: "/out/verwerkt" })}
          {field("pollMinutes", t("admin.fines.cjib.pollMinutes"), "number", { min: 5, max: 1440 })}
          {field("filePattern", t("admin.fines.cjib.filePattern"), "text")}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => save.mutate()} disabled={save.isPending} data-testid="button-save-cjib">{t("admin.dialog.save")}</Button>
          <Button variant="outline" onClick={() => { setTestResult(null); test.mutate(); }} disabled={test.isPending || !form.host} data-testid="button-test-cjib">
            {test.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}{t("admin.fines.cjib.test")}
          </Button>
          <Button variant="outline" onClick={() => run.mutate()} disabled={run.isPending || !form.host} data-testid="button-run-cjib">
            {run.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}{t("admin.fines.cjib.runNow")}
          </Button>
        </div>
        {testResult && (
          <div className={`rounded-md border p-3 text-sm ${testResult.ok ? "border-green-300 bg-green-50" : "border-red-300 bg-red-50"}`} data-testid="cjib-test-result">
            {testResult.ok ? (
              <>
                <div className="font-medium">{t("admin.fines.cjib.testOk", { n: testResult.files?.length ?? 0 })}</div>
                <ul className="mt-1 space-y-0.5">
                  {testResult.files?.map((f) => <li key={f.name} className={f.matches ? "" : "text-muted-foreground"}>{f.name} · {Math.round(f.size / 1024)} kB{f.matches ? "" : ` · ${t("admin.fines.cjib.noMatch")}`}</li>)}
                </ul>
              </>
            ) : <div>{t("admin.fines.cjib.testFailed")}: {testResult.message}</div>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
